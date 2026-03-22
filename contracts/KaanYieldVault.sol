// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

interface IKaanGToken {
    function mintFromYield(address to, uint256 amount) external;
}

/// @title KaanYieldVault — Rental Income Engine for KAAN Holders
/// @notice Integra 360 deposits monthly AirBnB/Vrbo income (USDC).
///         Instead of distributing USDC directly, the vault:
///           1. Stores USDC in a backing reserve
///           2. Mints KAANG to each KAAN holder proportional to their balance
///         KAANG appreciates as rents grow: more USDC backing per token over time.
///         Holders later redeem KAANG via KaanRedemption (cash or reinvestment).
contract KaanYieldVault is Ownable {
    using SafeERC20 for IERC20;

    IERC20     public immutable kaanToken;   // KAAN — determines yield share
    IERC20     public immutable usdcToken;   // USDC — rental income currency
    IKaanGToken public immutable kaangToken; // KAANG — minted to holders

    // --- Synthetix-style accumulator (tracks KAANG owed per KAAN) ---
    uint256 public kaangPerTokenStored;                      // scaled 1e18
    mapping(address => uint256) public userKaangPerTokenPaid;
    mapping(address => uint256) public pendingKaang;         // KAANG not yet minted

    // --- USDC reserve backing all minted KAANG ---
    uint256 public usdcReserve;

    // --- Authorized redemption contract ---
    address public redemptionContract;

    // --- Stats ---
    uint256 public totalRentDeposited;
    uint256 public totalKaangMinted;
    uint256 public lastRentDeposit;

    // --- Rolling 12-month history for APY ---
    uint256 public constant MONTHS = 12;
    uint256[12] public monthlyDeposits;
    uint256 public depositIndex;

    event RentDeposited(uint256 usdcAmount, uint256 kaangEmitted, uint256 timestamp);
    event KaangClaimed(address indexed holder, uint256 kaangAmount);
    event UsdcWithdrawnToRedemption(address indexed redemption, uint256 amount);
    event RedemptionContractSet(address redemption);

    constructor(address _kaan, address _usdc, address _kaang, address _owner) Ownable(_owner) {
        kaanToken  = IERC20(_kaan);
        usdcToken  = IERC20(_usdc);
        kaangToken = IKaanGToken(_kaang);
    }

    // ─────────────────────────────────────────────────────────────
    // OWNER: Wire redemption contract
    // ─────────────────────────────────────────────────────────────

    function setRedemptionContract(address _redemption) external onlyOwner {
        require(redemptionContract == address(0), "Already set");
        redemptionContract = _redemption;
        emit RedemptionContractSet(_redemption);
    }

    // ─────────────────────────────────────────────────────────────
    // OWNER: Deposit monthly AirBnB income
    // ─────────────────────────────────────────────────────────────

    /// @notice Integra 360 deposits monthly rental income.
    ///         USDC is stored in reserve; KAANG is minted 1:1 (USDC units → KAANG units).
    ///         1 KAANG = 1 USDC of backing at mint time. Appreciates as rents grow.
    function depositRent(uint256 usdcAmount) external onlyOwner {
        require(usdcAmount > 0, "Zero amount");
        uint256 totalSupply = kaanToken.totalSupply();
        require(totalSupply > 0, "No KAAN supply");

        usdcToken.safeTransferFrom(msg.sender, address(this), usdcAmount);
        usdcReserve      += usdcAmount;
        totalRentDeposited += usdcAmount;
        lastRentDeposit    = block.timestamp;

        // Accumulate KAANG owed per KAAN token (Synthetix pattern, cross-decimal).
        // USDC is 6 dec, KAANG is 18 dec → need 1e12 conversion factor.
        // Scale by 1e18 for integer precision: kaangPerTokenStored unit = 1e(12+18) / 1e18 = 1e12.
        // Divisor in _updatePending is 1e18 (not 1e30) to yield KAANG in 18-dec units.
        kaangPerTokenStored += (usdcAmount * 1e30) / totalSupply;

        monthlyDeposits[depositIndex % MONTHS] = usdcAmount;
        depositIndex++;

        emit RentDeposited(usdcAmount, usdcAmount, block.timestamp);
    }

    // ─────────────────────────────────────────────────────────────
    // HOLDERS: Mint accumulated KAANG to wallet
    // ─────────────────────────────────────────────────────────────

    /// @notice Mint all accumulated KAANG to caller's wallet.
    ///         KAANG balance grows proportional to KAAN held × time.
    function claimKaang() external {
        _updatePending(msg.sender);
        uint256 amount = pendingKaang[msg.sender];
        require(amount > 0, "Nothing to claim");
        pendingKaang[msg.sender] = 0;
        totalKaangMinted += amount;
        kaangToken.mintFromYield(msg.sender, amount);
        emit KaangClaimed(msg.sender, amount);
    }

    // ─────────────────────────────────────────────────────────────
    // REDEMPTION: Transfer USDC reserve to KaanRedemption contract
    // ─────────────────────────────────────────────────────────────

    /// @notice Called by KaanRedemption when a holder burns KAANG for USDC.
    ///         Only the authorized redemption contract can pull reserve funds.
    function releaseUsdcToRedemption(address to, uint256 usdcAmount) external {
        require(msg.sender == redemptionContract, "Only KaanRedemption");
        require(usdcAmount <= usdcReserve, "Exceeds reserve");
        usdcReserve -= usdcAmount;
        usdcToken.safeTransfer(to, usdcAmount);
        emit UsdcWithdrawnToRedemption(to, usdcAmount);
    }

    // ─────────────────────────────────────────────────────────────
    // TRANSFER HOOK (called by KaanGToken on every KAANG transfer)
    // ─────────────────────────────────────────────────────────────

    function notifyTransfer(address from, address to) external {
        // Called by KaanToken (KAAN) on every KAAN transfer → snapshot pending KAANG for holders.
        // Also called by KaanGToken (KAANG) on KAANG transfers → safe no-op (KAAN balances unchanged).
        require(
            msg.sender == address(kaanToken) || msg.sender == address(kaangToken),
            "Only KAAN or KAANG token"
        );
        if (from != address(0)) _updatePending(from);
        if (to   != address(0)) _updatePending(to);
    }

    // ─────────────────────────────────────────────────────────────
    // VIEWS
    // ─────────────────────────────────────────────────────────────

    /// @notice KAANG not yet minted that the holder can claim right now
    function pendingKaangFor(address holder) external view returns (uint256) {
        uint256 balance = kaanToken.balanceOf(holder);
        uint256 earned  = (balance * (kaangPerTokenStored - userKaangPerTokenPaid[holder])) / 1e18;
        return pendingKaang[holder] + earned;
    }

    /// @notice USDC value backing 1 KAANG — always $1.00 (6 decimals = 1e6).
    ///         KAANG is minted 1:1 with USDC deposited, so the reserve always covers all
    ///         outstanding KAANG at exactly $1. The "appreciation" in KAANG comes from
    ///         earning MORE KAANG over time as rents grow, not from per-token price increase.
    function kaangBackingPrice() external pure returns (uint256) {
        return 1e6; // 1 KAANG = 1 USDC, always
    }

    /// @notice Estimated APY in basis points (e.g. 800 = 8%)
    function estimatedAPY() external view returns (uint256) {
        uint256 used = depositIndex < MONTHS ? depositIndex : MONTHS;
        if (used == 0) return 0;
        uint256 sum;
        for (uint256 i = 0; i < used; i++) sum += monthlyDeposits[i];
        uint256 annualised = (sum * 12) / used;
        uint256 propertyValueUsdc = 300_000 * 1e6;
        return (annualised * 10_000) / propertyValueUsdc;
    }

    // ─────────────────────────────────────────────────────────────
    // INTERNAL
    // ─────────────────────────────────────────────────────────────

    function _updatePending(address account) internal {
        uint256 balance = kaanToken.balanceOf(account);
        // Divide by 1e18 (not 1e30): accumulator was scaled by 1e30 for precision,
        // but earned KAANG = balance(18dec) * accumulated(1e30/totalSupply) / 1e18
        // = USDC(6dec) * 1e12 conversion → KAANG(18dec). ✓
        pendingKaang[account] += (balance * (kaangPerTokenStored - userKaangPerTokenPaid[account])) / 1e18;
        userKaangPerTokenPaid[account] = kaangPerTokenStored;
    }
}
