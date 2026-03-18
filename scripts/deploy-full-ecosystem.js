import { network } from "hardhat";

async function main() {
  const { ethers } = await network.connect();
  const [deployer] = await ethers.getSigners();
  console.log("Deploying from:", deployer.address);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH\n");

  // 1. MockUSDC
  const MockUSDC = await ethers.getContractFactory("MockUSDC");
  const usdc = await MockUSDC.deploy();
  await usdc.waitForDeployment();
  console.log("MockUSDC:      ", await usdc.getAddress());

  // 2. KAANX — Land token
  const KaanXToken = await ethers.getContractFactory("KaanXToken");
  const kaanx = await KaanXToken.deploy(deployer.address);
  await kaanx.waitForDeployment();
  console.log("KAANX (land):  ", await kaanx.getAddress());

  // 3. KAANG — Vacation rental yield token
  const KaanGToken = await ethers.getContractFactory("KaanGToken");
  const kaang = await KaanGToken.deploy(deployer.address);
  await kaang.waitForDeployment();
  console.log("KAANG (yield): ", await kaang.getAddress());

  // 4. KaanBuildVault — Construction + KAANG conversion
  const KaanBuildVault = await ethers.getContractFactory("KaanBuildVault");
  const buildVault = await KaanBuildVault.deploy(
    await usdc.getAddress(),
    await kaang.getAddress(),
    deployer.address
  );
  await buildVault.waitForDeployment();
  console.log("BuildVault:    ", await buildVault.getAddress());

  // 5. KaanGYieldVault — AirBnB yield distributor
  const KaanGYieldVault = await ethers.getContractFactory("KaanGYieldVault");
  const gVault = await KaanGYieldVault.deploy(
    await kaang.getAddress(),
    await usdc.getAddress(),
    deployer.address
  );
  await gVault.waitForDeployment();
  console.log("GYieldVault:   ", await gVault.getAddress());

  // Wire the machine
  console.log("\n🔧 Connecting the ecosystem...");
  await (await kaang.setYieldVault(await gVault.getAddress())).wait();
  console.log("✓ KAANG → YieldVault");
  await (await kaang.setBuildVault(await buildVault.getAddress())).wait();
  console.log("✓ KAANG → BuildVault (minter)");
  await (await gVault.setBuildVault(await buildVault.getAddress())).wait();
  console.log("✓ GYieldVault → BuildVault (auto-compound)");

  // Create first project
  const TARGET = 500_000n * 1_000_000n;
  await (await buildVault.createProject(
    "Villa Cenote #1", TARGET, 1_000_000_000_000n, 4, deployer.address
  )).wait();
  console.log("✓ Project created: Villa Cenote #1 ($500K target, 4 milestones)");

  const base = "https://sepolia.etherscan.io/address/";
  console.log("\n✅ ECOSYSTEM LIVE ON SEPOLIA:");
  console.log("KAANX:", base + await kaanx.getAddress());
  console.log("KAANG:", base + await kaang.getAddress());
  console.log("BuildVault:", base + await buildVault.getAddress());
  console.log("GYieldVault:", base + await gVault.getAddress());
}

main().catch((e) => { console.error(e); process.exit(1); });
