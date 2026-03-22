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
  console.log("\n🏗️  Deploying KAANX + KAANG ecosystem from:", deployer.address);

  // ── KAANX ────────────────────────────────────────────────────────────────
  console.log("\n🌴 Deploying KAANX...");
  const KaanXToken = await ethers.getContractFactory("KaanXToken");
  const kaanx = await KaanXToken.deploy(deployer.address);
  await kaanx.waitForDeployment();
  const kaanxAddr = await kaanx.getAddress();
  console.log("✅ KaanXToken:", kaanxAddr);

  // ── KAANG TOKEN ──────────────────────────────────────────────────────────
  console.log("\n🌊 Deploying KaanGToken (KAANG)...");
  const KaanGToken = await ethers.getContractFactory("KaanGToken");
  const kaang = await KaanGToken.deploy(deployer.address);
  await kaang.waitForDeployment();
  const kaangAddr = await kaang.getAddress();
  console.log("✅ KaanGToken:", kaangAddr);

  // ── KAANG YIELD VAULT ────────────────────────────────────────────────────
  // Receives KAAN holder → mints KAANG proportional to KAAN balance.
  // Stores USDC reserve backing every KAANG token.
  console.log("\n💰 Deploying KaanYieldVault (KAANG mint engine)...");
  const KaanYieldVault = await ethers.getContractFactory("KaanYieldVault");
  const kaangVault = await KaanYieldVault.deploy(KAAN_ADDR, USDC_ADDR, kaangAddr, deployer.address);
  await kaangVault.waitForDeployment();
  const kaangVaultAddr = await kaangVault.getAddress();
  console.log("✅ KaanYieldVault:", kaangVaultAddr);

  // ── BUILD VAULT ──────────────────────────────────────────────────────────
  // Funds construction projects; mints KAANG on completion.
  console.log("\n🏗️  Deploying KaanBuildVault...");
  const KaanBuildVault = await ethers.getContractFactory("KaanBuildVault");
  const buildVault = await KaanBuildVault.deploy(USDC_ADDR, kaangAddr, deployer.address);
  await buildVault.waitForDeployment();
  const buildVaultAddr = await buildVault.getAddress();
  console.log("✅ KaanBuildVault:", buildVaultAddr);

  // ── REDEMPTION ───────────────────────────────────────────────────────────
  // The KAANG exit gate: burn KAANG → USDC (cash) or reinvest in next project.
  console.log("\n🔄 Deploying KaanRedemption...");
  const KaanRedemption = await ethers.getContractFactory("KaanRedemption");
  const redemption = await KaanRedemption.deploy(kaangAddr, USDC_ADDR, kaangVaultAddr, deployer.address);
  await redemption.waitForDeployment();
  const redemptionAddr = await redemption.getAddress();
  console.log("✅ KaanRedemption:", redemptionAddr);

  // ── WIRING ───────────────────────────────────────────────────────────────
  console.log("\n🔌 Wiring ecosystem contracts...");

  // KaanGToken: authorize all three ecosystem contracts
  let tx = await kaang.setYieldVault(kaangVaultAddr);   await tx.wait();
  tx = await kaang.setBuildVault(buildVaultAddr);         await tx.wait();
  tx = await kaang.setRedemptionContract(redemptionAddr); await tx.wait();
  console.log("✅ KaanGToken wired (YieldVault + BuildVault + Redemption)");

  // KaanYieldVault: authorize redemption to pull reserve USDC
  tx = await kaangVault.setRedemptionContract(redemptionAddr); await tx.wait();
  console.log("✅ KaanYieldVault: KaanRedemption authorized to pull reserve");

  // KaanBuildVault: authorize redemption contract for investFrom()
  tx = await buildVault.setRedemptionContract(redemptionAddr); await tx.wait();
  console.log("✅ KaanBuildVault: KaanRedemption authorized");

  // KaanRedemption: connect BuildVault
  tx = await redemption.setBuildVault(buildVaultAddr); await tx.wait();
  console.log("✅ KaanRedemption: BuildVault connected");

  // ── SAVE ─────────────────────────────────────────────────────────────────
  const addresses = {
    network: "sepolia",
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
    MockUSDC: USDC_ADDR,
    KAAN: { token: KAAN_ADDR, yieldVault: KAAN_VAULT, sale: KAAN_SALE },
    KAANX: { token: kaanxAddr },
    KAANG: {
      token:      kaangAddr,
      yieldVault: kaangVaultAddr,
      buildVault: buildVaultAddr,
      redemption: redemptionAddr,
    },
  };
  fs.writeFileSync(
    path.join(process.cwd(), "deployed-addresses.json"),
    JSON.stringify(addresses, null, 2)
  );

  console.log("\n" + "═".repeat(65));
  console.log("  ✅ KAAN ECOSYSTEM COMPLETO — Sepolia");
  console.log("═".repeat(65));
  console.log(`  USDC:           ${USDC_ADDR}`);
  console.log(`  KAAN token:     ${KAAN_ADDR}`);
  console.log(`  KAAN vault:     ${KAAN_VAULT}`);
  console.log(`  KAANX token:    ${kaanxAddr}`);
  console.log(`  KAANG token:    ${kaangAddr}`);
  console.log(`  KAANG vault:    ${kaangVaultAddr}  ← minta KAANG por renta`);
  console.log(`  Build vault:    ${buildVaultAddr}   ← financia construcción`);
  console.log(`  Redemption:     ${redemptionAddr}   ← KAANG → USDC o proyecto`);
  console.log("═".repeat(65));
  console.log("\n  KAANG CIRCULATION:");
  console.log("  KAAN holders → claimKaang() → KAANG en wallet");
  console.log("  KAANG → redeemForCash()      → USDC directo");
  console.log("  KAANG → reinvestInProject()  → nuevo KAANG al completar");
  console.log("═".repeat(65));
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
