import { network } from "hardhat";

async function main() {
  const { ethers } = await network.connect();
  const [deployer] = await ethers.getSigners();
  console.log("\n🏗️  Deploying KAAN ecosystem with account:", deployer.address);

  // 1. MockUSDC
  const MockUSDC = await ethers.getContractFactory("MockUSDC");
  const usdc = await MockUSDC.deploy();
  await usdc.waitForDeployment();
  console.log("✅ MockUSDC deployed to:", await usdc.getAddress());

  // 2. KaanToken
  const KaanToken = await ethers.getContractFactory("KaanToken");
  const kaan = await KaanToken.deploy(deployer.address);
  await kaan.waitForDeployment();
  console.log("✅ KaanToken deployed to:", await kaan.getAddress());

  // 3. KaanYieldVault
  const KaanYieldVault = await ethers.getContractFactory("KaanYieldVault");
  const vault = await KaanYieldVault.deploy(
    await kaan.getAddress(),
    await usdc.getAddress(),
    deployer.address
  );
  await vault.waitForDeployment();
  console.log("✅ KaanYieldVault deployed to:", await vault.getAddress());

  // 4. KaanSale
  const KaanSale = await ethers.getContractFactory("KaanSale");
  const sale = await KaanSale.deploy(
    await kaan.getAddress(),
    await usdc.getAddress(),
    deployer.address
  );
  await sale.waitForDeployment();
  console.log("✅ KaanSale deployed to:", await sale.getAddress());

  // 5. Wire up: set vault on token, transfer sale allocation
  await kaan.setYieldVault(await vault.getAddress());
  console.log("✅ YieldVault linked to KaanToken");

  const saleAllocation = ethers.parseEther("90000");
  await kaan.transfer(await sale.getAddress(), saleAllocation);
  console.log("✅ 90,000 KAAN transferred to KaanSale");

  // Summary
  console.log("\n" + "═".repeat(60));
  console.log("  🌴 KAAN — Tulum Yield Token — Deployment Summary");
  console.log("═".repeat(60));
  console.log(`  Property:        Amira District, Tulum, Mexico`);
  console.log(`  Manager:         Integra 360`);
  console.log(`  Property Value:  $300,000 USD`);
  console.log(`  Total Supply:    300,000 KAAN (1 KAAN = $1)`);
  console.log(`  Est. APY:        ~8% in USDC`);
  console.log(`  Public Sale:     90,000 KAAN @ $1 USDC each`);
  console.log("─".repeat(60));
  console.log(`  MockUSDC:        ${await usdc.getAddress()}`);
  console.log(`  KaanToken:       ${await kaan.getAddress()}`);
  console.log(`  KaanYieldVault:  ${await vault.getAddress()}`);
  console.log(`  KaanSale:        ${await sale.getAddress()}`);
  console.log("═".repeat(60) + "\n");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
