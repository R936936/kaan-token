# 🌴 KAAN — Tulum Yield Token

> **KAAN** means **"sky"** in ancient Mayan.

A 1-bedroom apartment in **Amira District, Tulum** — river view, beach access, **$300,000 value** — tokenized into **300,000 KAAN tokens** at $1 each.

Every month, **Integra 360** deposits AirBnB rental income into the **KAAN Yield Vault**. Smart contract automatically distributes USDC yield to all KAAN holders, proportional to their holdings.

**No banks. No paperwork. No borders.**
**Just Tulum sunshine, converted to USDC, delivered to your wallet.**

---

## 🏠 Property Details

| Detail | Value |
|---|---|
| **Building** | Amira District, Tulum, Mexico |
| **Unit** | 1 bedroom, river view, beach access |
| **Property Value** | $300,000 USD |
| **Property Manager** | Integra 360 (AirBnB, Vrbo, etc.) |
| **Gross Rental Income** | $45,000 – $65,000 USD/year |
| **Net to Owner** (after 25% fees) | ~$34,000 – $49,000 USD/year |
| **Yield to KAAN Holders** (60% of net) | ~$20,000 – $29,000 USD/year |

---

## 💰 Tokenomics

| Allocation | KAAN Tokens | % of Supply | Notes |
|---|---|---|---|
| **Rafael (Owner)** | 150,000 | 50% | Property owner & operator |
| **Public Sale** | 90,000 | 30% | $1 USDC per KAAN → raises $90,000 |
| **Treasury/Reserve** | 30,000 | 10% | Future development & liquidity |
| **Team/Advisors** | 30,000 | 10% | Vesting schedule TBD |
| **Total** | **300,000** | **100%** | 1 KAAN = $1 of property value |

**Token Specs:**
- Name: `KAAN — Tulum Yield Token`
- Symbol: `KAAN`
- Standard: ERC-20 + ERC-2612 (Permit)
- Decimals: 18
- Fixed supply — no minting after deployment

---

## 📈 Yield Calculator

```
You hold:        10,000 KAAN ($10,000 invested)
Property APY:    ~8%
Monthly income:  ~$66.67 USDC
Annual income:   ~$800 USDC

You hold:        50,000 KAAN ($50,000 invested)
Property APY:    ~8%
Monthly income:  ~$333.33 USDC
Annual income:   ~$4,000 USDC
```

---

## 🔄 How It Works

```
┌─────────────────────────────────────────────────────┐
│                    AMIRA DISTRICT                     │
│              Tulum, Mexico 🌴                         │
│         1BR Apartment · River View · Beach            │
└──────────────────────┬──────────────────────────────┘
                       │ AirBnB / Vrbo bookings
                       ▼
              ┌─────────────────┐
              │   Integra 360   │
              │ Property Manager │
              └────────┬────────┘
                       │ Monthly USDC deposit
                       ▼
              ┌─────────────────┐
              │ KaanYieldVault  │
              │  Smart Contract  │
              └────────┬────────┘
                       │ Proportional distribution
              ┌────────┼────────┐
              ▼        ▼        ▼
           Holder₁  Holder₂  Holder₃
           (USDC)   (USDC)   (USDC)
```

---

## 📜 Smart Contracts

| Contract | Description |
|---|---|
| `KaanToken.sol` | ERC-20 token with Permit, Pausable, property metadata |
| `KaanYieldVault.sol` | Synthetix-style reward distributor for USDC yield |
| `KaanSale.sol` | Public sale at 1 USDC per KAAN with optional whitelist |
| `MockUSDC.sol` | Test-only USDC mock (6 decimals) |

---

## 🚀 Quick Start

```bash
# Clone and install
cd kaan-token
npm install

# Compile contracts
npx hardhat compile

# Run tests
npx hardhat test

# Deploy (local)
npx hardhat run scripts/deploy.js

# Deploy (Sepolia)
cp .env.example .env
# Edit .env with your keys
npx hardhat run scripts/deploy.js --network sepolia
```

---

## 🛡️ Security Features

- **Fixed supply** — no inflation, no rug-pull minting
- **Pausable** — emergency stop by owner
- **ERC-2612 Permit** — gasless approvals
- **Synthetix accumulator** — gas-efficient yield distribution
- **Transfer hooks** — yield accounting auto-updates on every transfer
- **SafeERC20** — safe token transfer patterns throughout

---

## ⚠️ Legal Disclaimer

This token represents a **digital asset experiment** and is provided for informational and educational purposes only.

- KAAN tokens may constitute **securities** under applicable laws. Consult legal counsel before purchasing or distributing.
- The property backing this token is subject to **real estate market risks**, including but not limited to: vacancy, damage, regulatory changes, and currency fluctuations.
- Past rental income does **not guarantee** future returns. The estimated APY is based on projections and may vary significantly.
- This smart contract has **not been formally audited**. Use at your own risk.
- The issuer makes **no warranties** regarding token value, liquidity, or regulatory compliance in any jurisdiction.
- Purchasers are responsible for understanding and complying with all applicable laws in their jurisdiction.

**This is not financial advice. Do your own research.**

---

## 📄 License

MIT

---

*Built with ☀️ in Tulum, Mexico*
