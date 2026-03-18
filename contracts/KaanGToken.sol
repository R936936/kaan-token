// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/// @title KAANG — Vacation Rental Yield Token
/// @notice ERC-20 representing participation in active vacation rental income.
///         Receives AirBnB/Vrbo income monthly. Distributes USDC to holders.
///         Auto-compound: yield can optionally re-enter the construction cycle (KAAN).
contract KaanGToken is ERC20, ERC20Permit, Ownable, Pausable {

    /// @notice Yield vault that distributes AirBnB income
    address public yieldVault;

    /// @notice Only the BuildVault can mint KAANG (when construction is complete)
    address public buildVault;

    bool public buildVaultSet;

    event YieldVaultSet(address vault);
    event BuildVaultSet(address vault);

    constructor(address initialOwner)
        ERC20("KAANG - Vacation Rental Yield Token", "KAANG")
        ERC20Permit("KAANG - Vacation Rental Yield Token")
        Ownable(initialOwner)
    {
        // No initial mint — KAANG is only created when construction projects complete
    }

    /// @notice Set the yield vault (once). Called after KaanGYieldVault is deployed.
    function setYieldVault(address _vault) external onlyOwner {
        require(yieldVault == address(0), "Already set");
        yieldVault = _vault;
        emit YieldVaultSet(_vault);
    }

    /// @notice Set the build vault (once). Only BuildVault can mint KAANG.
    function setBuildVault(address _vault) external onlyOwner {
        require(!buildVaultSet, "Already set");
        buildVault = _vault;
        buildVaultSet = true;
        emit BuildVaultSet(_vault);
    }

    /// @notice Mint KAANG to investors when their construction project completes.
    ///         Only callable by the BuildVault contract.
    function mintFromBuild(address to, uint256 amount) external {
        require(msg.sender == buildVault, "Only BuildVault");
        _mint(to, amount);
    }

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    function _update(address from, address to, uint256 value) internal override whenNotPaused {
        if (yieldVault != address(0)) {
            IKaanGYieldVault(yieldVault).notifyTransfer(from, to);
        }
        super._update(from, to, value);
    }
}

interface IKaanGYieldVault {
    function notifyTransfer(address from, address to) external;
}
