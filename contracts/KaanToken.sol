// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/// @title KAAN — Tulum Yield Token
/// @notice ERC-20 token backed by a luxury apartment in Amira District, Tulum, Mexico.
///         1 KAAN = $1 USD of property value. Fixed supply, no minting after deploy.
contract KaanToken is ERC20, ERC20Permit, Ownable, Pausable {
    uint256 public constant TOTAL_SUPPLY = 300_000 * 1e18;

    /// @notice Property value denominated in USDC units (6 decimals). $300,000
    uint256 public propertyValue = 300_000 * 1e6;

    string public propertyAddress = "Amira District, Tulum, Mexico";
    string public propertyManager = "Integra 360";

    /// @notice Yield vault contract that must be notified on transfers
    address public yieldVault;

    constructor(address initialOwner)
        ERC20(unicode"KAAN — Tulum Yield Token", "KAAN")
        ERC20Permit(unicode"KAAN — Tulum Yield Token")
        Ownable(initialOwner)
    {
        _mint(initialOwner, TOTAL_SUPPLY);
    }

    /// @notice Set the yield vault address (once) so transfers auto-update accounting
    function setYieldVault(address _vault) external onlyOwner {
        require(yieldVault == address(0), "Vault already set");
        yieldVault = _vault;
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function _update(address from, address to, uint256 value) internal override whenNotPaused {
        // Snapshot rewards BEFORE balances change (Synthetix pattern)
        if (yieldVault != address(0)) {
            IKaanYieldVault(yieldVault).notifyTransfer(from, to);
        }
        super._update(from, to, value);
    }
}

interface IKaanYieldVault {
    function notifyTransfer(address from, address to) external;
}
