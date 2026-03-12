// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title KaanSale — Public sale of KAAN tokens at 1 USDC each
/// @notice Raises up to $90,000 USDC by selling 90,000 KAAN (30% of supply).
contract KaanSale is Ownable {
    using SafeERC20 for IERC20;

    IERC20 public immutable kaanToken;
    IERC20 public immutable usdcToken;

    uint256 public constant MAX_FOR_SALE = 90_000 * 1e18;   // 90,000 KAAN
    uint256 public constant PRICE = 1e6;                     // 1 USDC per KAAN (6 decimals)

    uint256 public totalSold;
    bool public saleActive;
    bool public whitelistEnabled;

    mapping(address => bool) public whitelisted;

    event TokensPurchased(address indexed buyer, uint256 kaanAmount, uint256 usdcPaid);

    constructor(address _kaan, address _usdc, address _owner) Ownable(_owner) {
        kaanToken = IERC20(_kaan);
        usdcToken = IERC20(_usdc);
    }

    /// @notice Buy KAAN tokens — 1 USDC per KAAN. Buyer must approve USDC first.
    function buyKaan(uint256 kaanAmount) external {
        require(saleActive, "Sale not active");
        require(kaanAmount > 0, "Zero amount");
        require(totalSold + kaanAmount <= MAX_FOR_SALE, "Exceeds sale cap");

        if (whitelistEnabled) {
            require(whitelisted[msg.sender], "Not whitelisted");
        }

        // 1 KAAN (18 dec) = 1 USDC (6 dec)
        uint256 usdcCost = (kaanAmount * PRICE) / 1e18;
        require(usdcCost > 0, "Amount too small");

        usdcToken.safeTransferFrom(msg.sender, address(this), usdcCost);
        kaanToken.safeTransfer(msg.sender, kaanAmount);

        totalSold += kaanAmount;

        emit TokensPurchased(msg.sender, kaanAmount, usdcCost);
    }

    /// @notice Owner withdraws raised USDC
    function withdrawUSDC() external onlyOwner {
        uint256 balance = usdcToken.balanceOf(address(this));
        require(balance > 0, "No USDC to withdraw");
        usdcToken.safeTransfer(owner(), balance);
    }

    function setSaleActive(bool _active) external onlyOwner {
        saleActive = _active;
    }

    function setWhitelistEnabled(bool _enabled) external onlyOwner {
        whitelistEnabled = _enabled;
    }

    function addToWhitelist(address account) external onlyOwner {
        whitelisted[account] = true;
    }

    function removeFromWhitelist(address account) external onlyOwner {
        whitelisted[account] = false;
    }
}
