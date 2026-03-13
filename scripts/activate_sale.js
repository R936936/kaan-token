import { network } from "hardhat";

async function main() {
  const { ethers } = await network.connect();
  const [owner] = await ethers.getSigners();

  const kaanSale = await ethers.getContractAt("KaanSale", "0xEAF3CB9f8C05e8bcd67F73b88Ad6d390d0A0526b", owner);
  const tx = await kaanSale.setSaleActive(true);
  await tx.wait();
  console.log("✅ KaanSale ACTIVA! TX:", tx.hash);
}
main().catch(console.error);
