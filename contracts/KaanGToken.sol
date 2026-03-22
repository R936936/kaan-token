// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/// @title KAANG — KAAN Ecosystem Yield Token
/// @notice Earned proportionally by KAAN holders from AirBnB/Vrbo rental income.
///         The more KAAN you hold, the more KAANG you accumulate each month.
///         KAANG circulates exclusively within the KAAN ecosystem:
///           - Redeem for USDC (cash out your yield)
///           - Reinvest in new KAAN construction projects (compound within ecosystem)
///         KAANG cannot be deposited into external DEX pools or exchanges.
///         Early KAAN holders accumulate more KAANG over time → KAANG appreciates
///         as property rents grow and USDC backing per token increases.
contract KaanGToken is ERC20, ERC20Burnable, ERC20Permit, Ownable, Pausable {

    /// @notice KaanYieldVault — mints KAANG monthly to KAAN holders from rental income
    address public yieldVault;

    /// @notice KaanBuildVault — mints KAANG when a construction project completes
    address public buildVault;

    /// @notice KaanRedemption — approved to receive KAANG from holders (burn for USDC / project)
    address public redemptionContract;

    bool public buildVaultSet;
    bool public redemptionSet;

    /// @notice Contracts allowed to receive KAANG (ecosystem-only circulation)
    mapping(address => bool) public approvedContract;

    event YieldVaultSet(address vault);
    event BuildVaultSet(address vault);
    event RedemptionContractSet(address redemption);
    event ContractApproved(address contractAddr, bool approved);

    constructor(address initialOwner)
        ERC20("KAANG - KAAN Yield Token", "KAANG")
        ERC20Permit("KAANG - KAAN Yield Token")
        Ownable(initialOwner)
    {}

    // ─────────────────────────────────────────────────────────────
    // OWNER: Wire ecosystem contracts
    // ─────────────────────────────────────────────────────────────

    function setYieldVault(address _vault) external onlyOwner {
        require(yieldVault == address(0), "Already set");
        yieldVault = _vault;
        approvedContract[_vault] = true;
        emit YieldVaultSet(_vault);
        emit ContractApproved(_vault, true);
    }

    function setBuildVault(address _vault) external onlyOwner {
        require(!buildVaultSet, "Already set");
        buildVault = _vault;
        buildVaultSet = true;
        approvedContract[_vault] = true;
        emit BuildVaultSet(_vault);
        emit ContractApproved(_vault, true);
    }

    function setRedemptionContract(address _redemption) external onlyOwner {
        require(!redemptionSet, "Already set");
        redemptionContract = _redemption;
        redemptionSet = true;
        approvedContract[_redemption] = true;
        emit RedemptionContractSet(_redemption);
        emit ContractApproved(_redemption, true);
    }

    /// @notice Approve or revoke any additional ecosystem contract (future projects, DAO, etc.)
    function setApprovedContract(address _contract, bool _approved) external onlyOwner {
        approvedContract[_contract] = _approved;
        emit ContractApproved(_contract, _approved);
    }

    // ─────────────────────────────────────────────────────────────
    // MINTING: Only authorized ecosystem contracts
    // ─────────────────────────────────────────────────────────────

    /// @notice Mint KAANG to a KAAN holder from monthly rental income.
    ///         Only callable by KaanYieldVault.
    function mintFromYield(address to, uint256 amount) external {
        require(msg.sender == yieldVault, "Only YieldVault");
        _mint(to, amount);
    }

    /// @notice Mint KAANG to an investor when their construction project completes.
    ///         Only callable by KaanBuildVault.
    function mintFromBuild(address to, uint256 amount) external {
        require(msg.sender == buildVault, "Only BuildVault");
        _mint(to, amount);
    }

    // ─────────────────────────────────────────────────────────────
    // TRANSFER RESTRICTION: Closed ecosystem
    // ─────────────────────────────────────────────────────────────

    /// @notice KAANG can be held by any wallet (EOA) freely.
    ///         Smart contracts can only receive KAANG if explicitly approved.
    ///         This prevents KAANG from being listed on external DEXes or exchanges.
    function _update(address from, address to, uint256 value) internal override whenNotPaused {
        if (to != address(0)) {
            bool isEOA = to.code.length == 0;
            require(isEOA || approvedContract[to], "KAANG: solo ecosistema KAAN");
        }
        if (yieldVault != address(0)) {
            IKaanGYieldVault(yieldVault).notifyTransfer(from, to);
        }
        super._update(from, to, value);
    }

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }
}

interface IKaanGYieldVault {
    function notifyTransfer(address from, address to) external;
}
