import { network } from "hardhat";
import fs from "fs";
import path from "path";

const USDC_ADDR  = "0x13024da640251392A8409D722988C4A0d158c08E";
const KAAN_ADDR  = "0x194185cC8de80C70bc9f1002348C5eD98bdfE782";
const KAAN_VAULT = "0x7C5198429f52A2DB8700281751421f375E3Cf98d";
const KAAN_SALE  = "0x5d36B6014838B782584A5D29258093D889A4C1d7";

async function main() {
  const { ethers } = await network.connect();
  const [deployer] = await ethers.getSigners();
  console.log("\n🏗️  Deploying KAANX + KAANG from:", deployer.address);

  // First: transfer 90k KAAN to sale (was not done yet)
  console.log("⏳ Transferring 90,000 KAAN to KaanSale...");
  const KaanToken = await ethers.getContractFactory("KaanToken");
  const kaan = KaanToken.attach(KAAN_ADDR);
  const tx0 = await kaan.transfer(KAAN_SALE, ethers.parseEther("90000"));
  await tx0.wait();
  console.log("✅ 90,000 KAAN → KaanSale");

  // ── KAANX ────────────────────────────────────────────────────────────────
  console.log("\n🌴 Deploying KAANX...");
  const KaanXToken = await ethers.getContractFactory("KaanXToken");
  const kaanx = await KaanXToken.deploy(deployer.address);
  await kaanx.waitForDeployment();
  const kaanxAddr = await kaanx.getAddress();
  console.log("✅ KaanXToken:", kaanxAddr);

  // ── KAANG ────────────────────────────────────────────────────────────────
  console.log("\n🌊 Deploying KAANG...");
  const KaanGToken = await ethers.getContractFactory("KaanGToken");
  const kaang = await KaanGToken.deploy(deployer.address);
  await kaang.waitForDeployment();
  const kaangAddr = await kaang.getAddress();
  console.log("✅ KaanGToken:", kaangAddr);

  const KaanGYieldVault = await ethers.getContractFactory("KaanGYieldVault");
  const kaangVault = await KaanGYieldVault.deploy(kaangAddr, USDC_ADDR, deployer.address);
  await kaangVault.waitForDeployment();
  const kaangVaultAddr = await kaangVault.getAddress();
  console.log("✅ KaanGYieldVault:", kaangVaultAddr);

  const KaanBuildVault = await ethers.getContractFactory("KaanBuildVault");
  const buildVault = await KaanBuildVault.deploy(kaangAddr, USDC_ADDR, deployer.address);
  await buildVault.waitForDeployment();
  const buildVaultAddr = await buildVault.getAddress();
  console.log("✅ KaanBuildVault:", buildVaultAddr);

  const tx3 = await kaang.setYieldVault(kaangVaultAddr);
  await tx3.wait();
  const tx4 = await kaang.setBuildVault(buildVaultAddr);
  await tx4.wait();
  console.log("✅ KAANG wired");

  // Save
  const addresses = {
    network: "sepolia", deployedAt: new Date().toISOString(), deployer: deployer.address,
    MockUSDC: USDC_ADDR,
    KAAN: { token: KAAN_ADDR, yieldVault: KAAN_VAULT, sale: KAAN_SALE },
    KAANX: { token: kaanxAddr },
    KAANG: { token: kaangAddr, yieldVault: kaangVaultAddr, buildVault: buildVaultAddr },
  };
  fs.writeFileSync(path.join(process.cwd(), "deployed-addresses.json"), JSON.stringify(addresses, null, 2));

  console.log("\n" + "═".repeat(65));
  console.log("  ✅ KAAN ECOSYSTEM COMPLETO — Sepolia");
  console.log("═".repeat(65));
  console.log(`  MockUSDC:     ${USDC_ADDR}`);
  console.log(`  KAAN token:   ${KAAN_ADDR}`);
  console.log(`  KAAN sale:    ${KAAN_SALE}`);
  console.log(`  KAANX token:  ${kaanxAddr}`);
  console.log(`  KAANG token:  ${kaangAddr}`);
  console.log(`  KAANG vault:  ${kaangVaultAddr}`);
  console.log(`  Build vault:  ${buildVaultAddr}`);
  console.log("═".repeat(65));
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
