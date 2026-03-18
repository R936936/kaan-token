// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

interface IKaanBuildVault {
    function receiveAutoCompound(address investor, uint256 usdcAmount) external;
}

/// @title KaanGYieldVault — AirBnB Rental Income Distributor for KAANG Holders
/// @notice Same Synthetix-style accumulator as KaanYieldVault but with auto-compound.
///         Auto-compound: instead of receiving USDC, your yield routes to KaanBuildVault
///         to fund the next construction project → you get more KAANG when it completes.
contract KaanGYieldVault is Ownable {
    using SafeERC20 for IERC20;

    IERC20 public immutable kaangToken;
    IERC20 public immutable usdcToken;

    // --- BuildVault for auto-compound routing ---
    address public buildVault;

    // --- Synthetix-style accumulator ---
    uint256 public rewardPerTokenStored;
    mapping(address => uint256) public userRewardPerTokenPaid;
    mapping(address => uint256) public rewards;

    // --- Auto-compound registry (mirrored from BuildVault) ---
    mapping(address => bool) public autoCompound;

    // --- Stats ---
    uint256 public totalRentDeposited;
    uint256 public totalAutoCompounded;

    // --- Rolling 12-month history ---
    uint256[12] public monthlyDeposits;
    uint256 public depositIndex;

    event RentDeposited(uint256 amount, uint256 timestamp);
    event YieldClaimed(address indexed holder, uint256 amount);
    event YieldAutoCompounded(address indexed holder, uint256 amount);
    event AutoCompoundToggled(address indexed holder, bool enabled);
    event BuildVaultSet(address vault);

    constructor(address _kaang, address _usdc, address _owner) Ownable(_owner) {
        kaangToken = IERC20(_kaang);
        usdcToken  = IERC20(_usdc);
    }

    function setBuildVault(address _vault) external onlyOwner {
        require(buildVault == address(0), "Already set");
        buildVault = _vault;
        emit BuildVaultSet(_vault);
    }

    // ─────────────────────────────────────────────────────────────
    // OWNER: Deposit monthly AirBnB income
    // ─────────────────────────────────────────────────────────────

    function depositRent(uint256 usdcAmount) external onlyOwner {
        require(usdcAmount > 0, "Zero amount");
        uint256 totalSupply = kaangToken.totalSupply();
        require(totalSupply > 0, "No KAANG supply");

        usdcToken.safeTransferFrom(msg.sender, address(this), usdcAmount);

        rewardPerTokenStored += (usdcAmount * 1e18) / totalSupply;
        totalRentDeposited   += usdcAmount;

        monthlyDeposits[depositIndex % 12] = usdcAmount;
        depositIndex++;

        emit RentDeposited(usdcAmount, block.timestamp);
    }

    // ─────────────────────────────────────────────────────────────
    // HOLDERS: Claim or auto-compound
    // ─────────────────────────────────────────────────────────────

    /// @notice Claim USDC yield directly to wallet
    function claimYield() external {
        _updateReward(msg.sender);
        uint256 reward = rewards[msg.sender];
        require(reward > 0, "Nothing to claim");
        rewards[msg.sender] = 0;
        usdcToken.safeTransfer(msg.sender, reward);
        emit YieldClaimed(msg.sender, reward);
    }

    /// @notice Toggle auto-compound mode. When enabled, your yield feeds the next build.
    function toggleAutoCompound() external {
        autoCompound[msg.sender] = !autoCompound[msg.sender];
        // Mirror to BuildVault if set
        if (buildVault != address(0)) {
            // BuildVault reads autoCompound from this contract via investor opt-in
        }
        emit AutoCompoundToggled(msg.sender, autoCompound[msg.sender]);
    }

    /// @notice Settle rewards and route to build vault (for auto-compound users)
    ///         Anyone can trigger this for any opted-in holder.
    function settleAutoCompound(address holder) external {
        require(autoCompound[holder], "Not opted in");
        require(buildVault != address(0), "No build vault");

        _updateReward(holder);
        uint256 reward = rewards[holder];
        if (reward == 0) return;

        rewards[holder] = 0;
        totalAutoCompounded += reward;

        // Approve and route to BuildVault
        usdcToken.safeTransfer(buildVault, reward);
        IKaanBuildVault(buildVault).receiveAutoCompound(holder, reward);

        emit YieldAutoCompounded(holder, reward);
    }

    // ─────────────────────────────────────────────────────────────
    // TRANSFER HOOK (called by KaanGToken)
    // ─────────────────────────────────────────────────────────────

    function notifyTransfer(address from, address to) external {
        require(msg.sender == address(kaangToken), "Only KAANG token");
        if (from != address(0)) _updateReward(from);
        if (to   != address(0)) _updateReward(to);
    }

    // ─────────────────────────────────────────────────────────────
    // VIEWS
    // ─────────────────────────────────────────────────────────────

    function pendingYield(address holder) external view returns (uint256) {
        uint256 balance = kaangToken.balanceOf(holder);
        uint256 pending = (balance * (rewardPerTokenStored - userRewardPerTokenPaid[holder])) / 1e18;
        return rewards[holder] + pending;
    }

    function estimatedAPY() external view returns (uint256) {
        uint256 used = depositIndex < 12 ? depositIndex : 12;
        if (used == 0) return 0;
        uint256 sum;
        for (uint256 i = 0; i < used; i++) sum += monthlyDeposits[i];
        uint256 annualised = (sum * 12) / used;
        uint256 supplyValue = (kaangToken.totalSupply() / 1e18) * 1e6; // 1 KAANG = $1 USDC
        if (supplyValue == 0) return 0;
        return (annualised * 10_000) / supplyValue;
    }

    // ─────────────────────────────────────────────────────────────
    // INTERNAL
    // ─────────────────────────────────────────────────────────────

    function _updateReward(address account) internal {
        uint256 balance = kaangToken.balanceOf(account);
        rewards[account] += (balance * (rewardPerTokenStored - userRewardPerTokenPaid[account])) / 1e18;
        userRewardPerTokenPaid[account] = rewardPerTokenStored;
    }
}
