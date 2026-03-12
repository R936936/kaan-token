// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title KaanYieldVault — Distributes USDC rental income to KAAN holders
/// @notice Uses Synthetix-style rewardPerToken accumulator for O(1) claims.
///         Integra 360 deposits monthly AirBnB/Vrbo rental income; KAAN holders
///         claim their proportional USDC yield at any time.
contract KaanYieldVault is Ownable {
    using SafeERC20 for IERC20;

    IERC20 public immutable kaanToken;
    IERC20 public immutable usdcToken;

    // --- Synthetix-style accumulator ---
    uint256 public rewardPerTokenStored;                    // scaled by 1e18
    mapping(address => uint256) public userRewardPerTokenPaid;
    mapping(address => uint256) public rewards;             // unclaimed USDC

    // --- Accounting ---
    uint256 public totalRentDeposited;
    uint256 public lastRentDeposit;

    // --- Rolling 12-month history for APY ---
    uint256 public constant MONTHS = 12;
    uint256[12] public monthlyDeposits;
    uint256 public depositIndex;

    event RentDeposited(uint256 amount, uint256 timestamp);
    event YieldClaimed(address indexed holder, uint256 amount);

    constructor(address _kaan, address _usdc, address _owner) Ownable(_owner) {
        kaanToken = IERC20(_kaan);
        usdcToken = IERC20(_usdc);
    }

    // --- Core: deposit & claim ---

    /// @notice Owner deposits monthly rent (USDC). Must approve vault first.
    function depositRent(uint256 usdcAmount) external onlyOwner {
        require(usdcAmount > 0, "Zero amount");

        uint256 totalSupply = kaanToken.totalSupply();
        require(totalSupply > 0, "No KAAN supply");

        usdcToken.safeTransferFrom(msg.sender, address(this), usdcAmount);

        rewardPerTokenStored += (usdcAmount * 1e18) / totalSupply;
        totalRentDeposited += usdcAmount;
        lastRentDeposit = block.timestamp;

        monthlyDeposits[depositIndex % MONTHS] = usdcAmount;
        depositIndex++;

        emit RentDeposited(usdcAmount, block.timestamp);
    }

    /// @notice Claim all accumulated USDC yield
    function claimYield() external {
        _updateReward(msg.sender);

        uint256 reward = rewards[msg.sender];
        require(reward > 0, "Nothing to claim");

        rewards[msg.sender] = 0;
        usdcToken.safeTransfer(msg.sender, reward);

        emit YieldClaimed(msg.sender, reward);
    }

    /// @notice View: pending claimable USDC for a holder
    function pendingYield(address holder) external view returns (uint256) {
        uint256 balance = kaanToken.balanceOf(holder);
        uint256 pending = (balance * (rewardPerTokenStored - userRewardPerTokenPaid[holder])) / 1e18;
        return rewards[holder] + pending;
    }

    /// @notice View: estimated APY in basis points based on last 12 months of deposits
    function estimatedAPY() external view returns (uint256) {
        uint256 depositsUsed = depositIndex < MONTHS ? depositIndex : MONTHS;
        if (depositsUsed == 0) return 0;

        uint256 sum;
        for (uint256 i = 0; i < depositsUsed; i++) {
            sum += monthlyDeposits[i];
        }

        // Annualise: (sum / depositsUsed) * 12 months
        uint256 annualised = (sum * 12) / depositsUsed;

        // KAAN total supply in USDC-equivalent (1 KAAN = $1 → 1e6 USDC units per token)
        // Total supply is 300,000 * 1e18 in token units → property value = 300,000 * 1e6 USDC
        uint256 propertyValueUsdc = 300_000 * 1e6;

        // APY in basis points = (annualised / propertyValue) * 10000
        return (annualised * 10_000) / propertyValueUsdc;
    }

    // --- Transfer hook (called by KaanToken on every transfer) ---

    /// @notice Called by KaanToken._update to snapshot rewards before balances change
    function notifyTransfer(address from, address to) external {
        require(msg.sender == address(kaanToken), "Only KAAN token");
        if (from != address(0)) _updateReward(from);
        if (to != address(0)) _updateReward(to);
    }

    // --- Internal ---

    function _updateReward(address account) internal {
        uint256 balance = kaanToken.balanceOf(account);
        rewards[account] += (balance * (rewardPerTokenStored - userRewardPerTokenPaid[account])) / 1e18;
        userRewardPerTokenPaid[account] = rewardPerTokenStored;
    }
}
