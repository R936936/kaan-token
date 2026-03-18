import { network } from "hardhat";
import fs from "fs";
import path from "path";

async function main() {
  const { ethers } = await network.connect();
  const [deployer] = await ethers.getSigners();
  console.log("\n🏗️  Deploying full KAAN ecosystem with account:", deployer.address);
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("💰 Balance:", ethers.formatEther(balance), "ETH\n");

  // ── SHARED ───────────────────────────────────────────────────────────────
  // 1. MockUSDC (shared by all 3 ecosystems)
  const MockUSDC = await ethers.getContractFactory("MockUSDC");
  const usdc = await MockUSDC.deploy();
  await usdc.waitForDeployment();
  const usdcAddr = await usdc.getAddress();
  console.log("✅ MockUSDC:", usdcAddr);

  // ── KAAN (Construction Investment Token) ─────────────────────────────────
  console.log("\n🏗️  Deploying KAAN (Construction)...");
  const KaanToken = await ethers.getContractFactory("KaanToken");
  const kaan = await KaanToken.deploy(deployer.address);
  await kaan.waitForDeployment();
  const kaanAddr = await kaan.getAddress();
  console.log("✅ KaanToken:", kaanAddr);

  const KaanYieldVault = await ethers.getContractFactory("KaanYieldVault");
  const kaanVault = await KaanYieldVault.deploy(kaanAddr, usdcAddr, deployer.address);
  await kaanVault.waitForDeployment();
  const kaanVaultAddr = await kaanVault.getAddress();
  console.log("✅ KaanYieldVault:", kaanVaultAddr);

  const KaanSale = await ethers.getContractFactory("KaanSale");
  const kaanSale = await KaanSale.deploy(kaanAddr, usdcAddr, deployer.address);
  await kaanSale.waitForDeployment();
  const kaanSaleAddr = await kaanSale.getAddress();
  console.log("✅ KaanSale:", kaanSaleAddr);

  await kaan.setYieldVault(kaanVaultAddr);
  await kaan.transfer(kaanSaleAddr, ethers.parseEther("90000"));
  console.log("✅ KAAN wired: vault set, 90,000 KAAN → sale contract");

  // ── KAANX (Tulum Cenote Land Token) ──────────────────────────────────────
  console.log("\n🌴 Deploying KAANX (Land)...");
  const KaanXToken = await ethers.getContractFactory("KaanXToken");
  const kaanx = await KaanXToken.deploy(deployer.address);
  await kaanx.waitForDeployment();
  const kaanxAddr = await kaanx.getAddress();
  console.log("✅ KaanXToken:", kaanxAddr);

  // ── KAANG (AirBnB Rental Yield Token) ────────────────────────────────────
  console.log("\n🌊 Deploying KAANG (Rental Yield)...");
  const KaanGToken = await ethers.getContractFactory("KaanGToken");
  const kaang = await KaanGToken.deploy(deployer.address);
  await kaang.waitForDeployment();
  const kaangAddr = await kaang.getAddress();
  console.log("✅ KaanGToken:", kaangAddr);

  const KaanGYieldVault = await ethers.getContractFactory("KaanGYieldVault");
  const kaangVault = await KaanGYieldVault.deploy(kaangAddr, usdcAddr, deployer.address);
  await kaangVault.waitForDeployment();
  const kaangVaultAddr = await kaangVault.getAddress();
  console.log("✅ KaanGYieldVault:", kaangVaultAddr);

  const KaanBuildVault = await ethers.getContractFactory("KaanBuildVault");
  const buildVault = await KaanBuildVault.deploy(kaangAddr, usdcAddr, deployer.address);
  await buildVault.waitForDeployment();
  const buildVaultAddr = await buildVault.getAddress();
  console.log("✅ KaanBuildVault:", buildVaultAddr);

  await kaang.setYieldVault(kaangVaultAddr);
  await kaang.setBuildVault(buildVaultAddr);
  console.log("✅ KAANG wired: yield vault + build vault set");

  // ── SAVE ADDRESSES ────────────────────────────────────────────────────────
  const addresses = {
    network: "sepolia",
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
    MockUSDC: usdcAddr,
    KAAN: {
      token: kaanAddr,
      yieldVault: kaanVaultAddr,
      sale: kaanSaleAddr,
    },
    KAANX: {
      token: kaanxAddr,
    },
    KAANG: {
      token: kaangAddr,
      yieldVault: kaangVaultAddr,
      buildVault: buildVaultAddr,
    },
  };

  const outPath = path.join(process.cwd(), "deployed-addresses.json");
  fs.writeFileSync(outPath, JSON.stringify(addresses, null, 2));
  console.log("\n📄 Saved to deployed-addresses.json");

  // ── SUMMARY ───────────────────────────────────────────────────────────────
  console.log("\n" + "═".repeat(65));
  console.log("  🌴 KAAN ECOSYSTEM — Full Deployment Summary (Sepolia)");
  console.log("═".repeat(65));
  console.log("  📦 SharedMockUSDC:      " + usdcAddr);
  console.log("─".repeat(65));
  console.log("  🏗️  KAAN  (Construction Investment)");
  console.log("     Token:              " + kaanAddr);
  console.log("     YieldVault:        " + kaanVaultAddr);
  console.log("     Sale:              " + kaanSaleAddr);
  console.log("─".repeat(65));
  console.log("  🌴 KAANX (Tulum Cenote Land — $10M valuation)");
  console.log("     Token:              " + kaanxAddr);
  console.log("─".repeat(65));
  console.log("  🌊 KAANG (AirBnB Rental Yield)");
  console.log("     Token:              " + kaangAddr);
  console.log("     YieldVault:        " + kaangVaultAddr);
  console.log("     BuildVault:        " + buildVaultAddr);
  console.log("═".repeat(65) + "\n");
  console.log("🔗 Verify at: https://sepolia.etherscan.io/address/" + kaanAddr);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
