// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IKaanGToken {
    function mintFromBuild(address to, uint256 amount) external;
}

/// @title KaanBuildVault — Construction Funding + Autogenerative Conversion Engine
/// @notice THE MACHINE CORE:
///         1. Investors deposit USDC to fund a construction project
///         2. USDC is released in tranches as milestones are completed
///         3. On project completion, investors receive KAANG tokens pro-rata
///         4. KAANG generates monthly vacation rental yield (AirBnB income)
///         5. KAANG holders can auto-compound: yield re-enters as new project funding
///
///         This creates the self-reinforcing cycle:
///         USDC → KAAN build → property → KAANG yield → more USDC → next build
contract KaanBuildVault is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20   public immutable usdc;
    IKaanGToken public immutable kaang;

    // --- Project lifecycle ---
    enum ProjectStatus { Funding, Building, Complete, Cancelled }

    struct Project {
        string  name;
        uint256 targetUsdc;        // Total USDC needed for construction
        uint256 raisedUsdc;        // USDC deposited so far
        uint256 releasedUsdc;      // USDC already released to builder
        uint256 kaangPerUsdc;      // KAANG tokens minted per USDC invested (scaled 1e12)
        uint256 milestoneCount;
        uint256 milestonesComplete;
        ProjectStatus status;
        address builder;           // Wallet that receives USDC tranches
    }

    struct Investment {
        uint256 usdcDeposited;
        bool    claimed;           // KAANG claimed after completion
    }

    uint256 public projectCount;
    mapping(uint256 => Project) public projects;
    mapping(uint256 => mapping(address => Investment)) public investments;

    // --- Auto-compound registry ---
    mapping(address => bool) public autoCompound;  // KAANG yield auto-enters next project
    uint256 public autoCompoundProjectId;          // Which project gets auto-compound funds

    // --- Events ---
    event ProjectCreated(uint256 indexed id, string name, uint256 targetUsdc);
    event Invested(uint256 indexed projectId, address investor, uint256 amount);
    event MilestoneCompleted(uint256 indexed projectId, uint256 milestone, uint256 released);
    event ProjectCompleted(uint256 indexed projectId);
    event KaangClaimed(uint256 indexed projectId, address investor, uint256 kaangAmount);
    event AutoCompoundToggled(address investor, bool enabled);
    event AutoCompoundDeposit(address investor, uint256 amount, uint256 projectId);

    constructor(address _usdc, address _kaang, address _owner) Ownable(_owner) {
        usdc  = IERC20(_usdc);
        kaang = IKaanGToken(_kaang);
    }

    // ─────────────────────────────────────────────────────────────
    // OWNER: Create & manage projects
    // ─────────────────────────────────────────────────────────────

    /// @notice Create a new construction project
    /// @param name Human-readable name (e.g. "Villa Cenote #1")
    /// @param targetUsdc Total USDC needed  
    /// @param kaangPerUsdcScaled KAANG minted per USDC * 1e12 (e.g. 1e12 = 1:1)
    /// @param milestoneCount Number of construction milestones (e.g. 4)
    /// @param builder Address that receives USDC tranches
    function createProject(
        string calldata name,
        uint256 targetUsdc,
        uint256 kaangPerUsdcScaled,
        uint256 milestoneCount,
        address builder
    ) external onlyOwner returns (uint256 id) {
        require(targetUsdc > 0, "Zero target");
        require(milestoneCount > 0 && milestoneCount <= 10, "1-10 milestones");
        require(builder != address(0), "Zero builder");

        id = projectCount++;
        projects[id] = Project({
            name:                name,
            targetUsdc:          targetUsdc,
            raisedUsdc:          0,
            releasedUsdc:        0,
            kaangPerUsdc:        kaangPerUsdcScaled,
            milestoneCount:      milestoneCount,
            milestonesComplete:  0,
            status:              ProjectStatus.Funding,
            builder:             builder
        });

        emit ProjectCreated(id, name, targetUsdc);
    }

    /// @notice Mark a milestone complete and release proportional USDC to builder
    function completeMilestone(uint256 projectId) external onlyOwner {
        Project storage p = projects[projectId];
        require(p.status == ProjectStatus.Building, "Not building");
        require(p.milestonesComplete < p.milestoneCount, "All milestones done");

        p.milestonesComplete++;

        // Release 1/milestoneCount of total raised per milestone
        uint256 tranche = p.raisedUsdc / p.milestoneCount;
        p.releasedUsdc += tranche;
        usdc.safeTransfer(p.builder, tranche);

        emit MilestoneCompleted(projectId, p.milestonesComplete, tranche);

        // Auto-complete when all milestones done
        if (p.milestonesComplete == p.milestoneCount) {
            p.status = ProjectStatus.Complete;
            emit ProjectCompleted(projectId);
        }
    }

    /// @notice Move project from Funding to Building phase (funding goal reached)
    function startBuilding(uint256 projectId) external onlyOwner {
        Project storage p = projects[projectId];
        require(p.status == ProjectStatus.Funding, "Not in funding");
        require(p.raisedUsdc >= p.targetUsdc, "Funding goal not met");
        p.status = ProjectStatus.Building;
    }

    /// @notice Cancel a project and allow refunds
    function cancelProject(uint256 projectId) external onlyOwner {
        Project storage p = projects[projectId];
        require(p.status == ProjectStatus.Funding, "Can only cancel during funding");
        p.status = ProjectStatus.Cancelled;
    }

    // ─────────────────────────────────────────────────────────────
    // INVESTORS: Fund, claim KAANG, auto-compound
    // ─────────────────────────────────────────────────────────────

    /// @notice Approved redemption contract — routes KAANG conversions as investments
    address public redemptionContract;
    bool    public redemptionSet;

    function setRedemptionContract(address _redemption) external onlyOwner {
        require(!redemptionSet, "Already set");
        redemptionContract = _redemption;
        redemptionSet = true;
    }

    /// @notice Called by KaanRedemption: invest USDC on behalf of a holder who burned KAANG.
    ///         USDC must be approved to this contract by KaanRedemption before calling.
    function investFrom(address investor, uint256 projectId, uint256 usdcAmount) external nonReentrant {
        require(msg.sender == redemptionContract, "Only KaanRedemption");
        _invest(investor, projectId, usdcAmount, true);
    }

    /// @notice Invest USDC in a construction project
    function invest(uint256 projectId, uint256 usdcAmount) external nonReentrant {
        _invest(msg.sender, projectId, usdcAmount, false);
    }

    function _invest(address investor, uint256 projectId, uint256 usdcAmount, bool fromRedemption) internal {
        Project storage p = projects[projectId];
        require(p.status == ProjectStatus.Funding, "Not accepting investment");
        require(usdcAmount > 0, "Zero amount");

        uint256 remaining = p.targetUsdc - p.raisedUsdc;
        uint256 actual = usdcAmount > remaining ? remaining : usdcAmount;

        if (fromRedemption) {
            usdc.safeTransferFrom(msg.sender, address(this), actual); // msg.sender = KaanRedemption
        } else {
            usdc.safeTransferFrom(investor, address(this), actual);
        }
        p.raisedUsdc += actual;
        investments[projectId][investor].usdcDeposited += actual;

        emit Invested(projectId, investor, actual);
    }

    /// @notice Claim KAANG tokens after project is complete (THE CONVERSION EVENT)
    /// @dev Burns the investment record, mints KAANG pro-rata → investor now earns AirBnB yield
    function claimKaang(uint256 projectId) external nonReentrant {
        Project storage p = projects[projectId];
        require(p.status == ProjectStatus.Complete, "Project not complete");

        Investment storage inv = investments[projectId][msg.sender];
        require(inv.usdcDeposited > 0, "No investment");
        require(!inv.claimed, "Already claimed");

        inv.claimed = true;

        // THE MACHINE: convert USDC investment into KAANG yield tokens
        uint256 kaangAmount = (inv.usdcDeposited * p.kaangPerUsdc) / 1e12;
        kaang.mintFromBuild(msg.sender, kaangAmount);

        emit KaangClaimed(projectId, msg.sender, kaangAmount);
    }

    /// @notice Refund if project was cancelled
    function refund(uint256 projectId) external nonReentrant {
        require(projects[projectId].status == ProjectStatus.Cancelled, "Not cancelled");
        Investment storage inv = investments[projectId][msg.sender];
        uint256 amount = inv.usdcDeposited;
        require(amount > 0, "Nothing to refund");
        inv.usdcDeposited = 0;
        usdc.safeTransfer(msg.sender, amount);
    }

    // ─────────────────────────────────────────────────────────────
    // AUTO-COMPOUND (the self-reinforcing loop)
    // ─────────────────────────────────────────────────────────────

    /// @notice Toggle auto-compound: your KAANG yield automatically funds next construction
    function toggleAutoCompound() external {
        autoCompound[msg.sender] = !autoCompound[msg.sender];
        emit AutoCompoundToggled(msg.sender, autoCompound[msg.sender]);
    }

    /// @notice Set which project receives auto-compound funds
    function setAutoCompoundProject(uint256 projectId) external onlyOwner {
        require(projects[projectId].status == ProjectStatus.Funding, "Not in funding");
        autoCompoundProjectId = projectId;
    }

    /// @notice Called by KaanGYieldVault when distributing yield to auto-compound investors.
    ///         Routes their USDC yield directly into the next construction project.
    function receiveAutoCompound(address investor, uint256 usdcAmount) external nonReentrant {
        require(autoCompound[investor], "Not opted in");
        uint256 pid = autoCompoundProjectId;
        require(projects[pid].status == ProjectStatus.Funding, "No active project");

        uint256 remaining = projects[pid].targetUsdc - projects[pid].raisedUsdc;
        uint256 actual = usdcAmount > remaining ? remaining : usdcAmount;
        if (actual == 0) return;

        // USDC comes from the yield vault (already in this contract via transfer)
        projects[pid].raisedUsdc += actual;
        investments[pid][investor].usdcDeposited += actual;

        emit AutoCompoundDeposit(investor, actual, pid);
        emit Invested(pid, investor, actual);
    }

    // ─────────────────────────────────────────────────────────────
    // VIEWS
    // ─────────────────────────────────────────────────────────────

    function getProject(uint256 projectId) external view returns (Project memory) {
        return projects[projectId];
    }

    function getInvestment(uint256 projectId, address investor) external view returns (Investment memory) {
        return investments[projectId][investor];
    }

    function fundingProgress(uint256 projectId) external view returns (uint256 percent) {
        Project storage p = projects[projectId];
        if (p.targetUsdc == 0) return 0;
        return (p.raisedUsdc * 100) / p.targetUsdc;
    }
}
