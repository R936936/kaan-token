// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IKaanGToken {
    function burnFrom(address account, uint256 amount) external;
}

interface IKaanBuildVault {
    function investFrom(address investor, uint256 projectId, uint256 usdcAmount) external;
}

interface IKaanYieldVault {
    function releaseUsdcToRedemption(address redemptionContract, uint256 usdcAmount) external;
    function kaangBackingPrice() external pure returns (uint256);
}

/// @title KaanRedemption — The KAANG Exit Gate (always within KAAN ecosystem)
/// @notice Two paths for KAANG holders:
///
///   PATH A — Cash out: burn KAANG → receive USDC from the backing reserve.
///             Rate: kaangBackingPrice() USDC per KAANG (appreciates over time).
///
///   PATH B — Reinvest: burn KAANG → USDC equivalent enters next KAAN construction project.
///             The USDC goes to KaanBuildVault; investor gets KAANG back when project completes.
///             This is the full closed loop: yield → new construction → more yield.
///
/// @dev KAANG is restricted to ecosystem contracts; this contract is whitelisted in KaanGToken.
contract KaanRedemption is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IKaanGToken     public immutable kaang;
    IERC20          public immutable usdc;
    IKaanYieldVault public immutable yieldVault;
    IKaanBuildVault public buildVault;

    bool public buildVaultSet;

    // --- Redemption windows (optional: owner can open/close cash redemptions) ---
    bool public cashRedemptionOpen = true;

    // --- Stats ---
    uint256 public totalKaangRedeemedForCash;
    uint256 public totalKaangReinvested;
    uint256 public totalUsdcPaidOut;

    event RedeemedForCash(address indexed holder, uint256 kaangBurned, uint256 usdcReceived);
    event Reinvested(address indexed holder, uint256 kaangBurned, uint256 usdcRouted, uint256 projectId);
    event BuildVaultSet(address vault);
    event CashRedemptionToggled(bool open);

    constructor(
        address _kaang,
        address _usdc,
        address _yieldVault,
        address _owner
    ) Ownable(_owner) {
        kaang      = IKaanGToken(_kaang);
        usdc       = IERC20(_usdc);
        yieldVault = IKaanYieldVault(_yieldVault);
    }

    function setBuildVault(address _vault) external onlyOwner {
        require(!buildVaultSet, "Already set");
        buildVault    = IKaanBuildVault(_vault);
        buildVaultSet = true;
        emit BuildVaultSet(_vault);
    }

    function setCashRedemptionOpen(bool _open) external onlyOwner {
        cashRedemptionOpen = _open;
        emit CashRedemptionToggled(_open);
    }

    // ─────────────────────────────────────────────────────────────
    // PATH A: Burn KAANG → receive USDC (cash out)
    // ─────────────────────────────────────────────────────────────

    /// @notice Burn your KAANG and receive the equivalent USDC from the backing reserve.
    ///         USDC amount = kaangAmount × kaangBackingPrice() / 1e18.
    ///         kaangBackingPrice() grows as rental income accumulates → KAANG appreciates.
    /// @param kaangAmount Amount of KAANG to burn (18 decimals)
    function redeemForCash(uint256 kaangAmount) external nonReentrant {
        require(cashRedemptionOpen, "Cash redemption paused");
        require(kaangAmount > 0, "Zero amount");

        // Calculate USDC owed: price has 6 dec, kaangAmount has 18 dec
        uint256 price   = yieldVault.kaangBackingPrice(); // USDC per KAANG, 6 dec
        uint256 usdcOut = (kaangAmount * price) / 1e18;
        require(usdcOut > 0, "Amount too small");

        // Pull USDC from the yield vault reserve
        yieldVault.releaseUsdcToRedemption(address(this), usdcOut);

        // Burn caller's KAANG
        kaang.burnFrom(msg.sender, kaangAmount);

        // Send USDC to caller
        usdc.safeTransfer(msg.sender, usdcOut);

        totalKaangRedeemedForCash += kaangAmount;
        totalUsdcPaidOut          += usdcOut;

        emit RedeemedForCash(msg.sender, kaangAmount, usdcOut);
    }

    // ─────────────────────────────────────────────────────────────
    // PATH B: Burn KAANG → reinvest in next KAAN construction project
    // ─────────────────────────────────────────────────────────────

    /// @notice Burn KAANG and route the USDC equivalent directly into a construction project.
    ///         When the project completes, investor receives new KAANG — the loop closes.
    /// @param kaangAmount Amount of KAANG to convert
    /// @param projectId   Target project in KaanBuildVault
    function reinvestInProject(uint256 kaangAmount, uint256 projectId) external nonReentrant {
        require(buildVaultSet, "BuildVault not set");
        require(kaangAmount > 0, "Zero amount");

        uint256 price   = yieldVault.kaangBackingPrice();
        uint256 usdcOut = (kaangAmount * price) / 1e18;
        require(usdcOut > 0, "Amount too small");

        // Pull USDC from reserve
        yieldVault.releaseUsdcToRedemption(address(this), usdcOut);

        // Burn caller's KAANG
        kaang.burnFrom(msg.sender, kaangAmount);

        // Approve and route USDC to BuildVault on behalf of investor
        usdc.safeIncreaseAllowance(address(buildVault), usdcOut);
        buildVault.investFrom(msg.sender, projectId, usdcOut);

        totalKaangReinvested += kaangAmount;

        emit Reinvested(msg.sender, kaangAmount, usdcOut, projectId);
    }

    // ─────────────────────────────────────────────────────────────
    // VIEWS
    // ─────────────────────────────────────────────────────────────

    /// @notice Preview: how much USDC you would receive for burning kaangAmount
    function previewCashOut(uint256 kaangAmount) external view returns (uint256 usdcOut) {
        uint256 price = yieldVault.kaangBackingPrice();
        return (kaangAmount * price) / 1e18;
    }
}
