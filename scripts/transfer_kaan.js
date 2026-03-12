import { network } from "hardhat";

async function main() {
  const { ethers } = await network.connect();
  const [deployer] = await ethers.getSigners();
  const KAAN_ADDRESS = "0xad484Fb877D9BcE406e70749b6811C7083eB0e21";
  const SALE_ADDRESS = "0xEAF3CB9f8C05e8bcd67F73b88Ad6d390d0A0526b";
  
  const kaan = await ethers.getContractAt("KaanToken", KAAN_ADDRESS, deployer);
  const amount = ethers.parseEther("90000");
  
  console.log("Transfiriendo 90,000 KAAN a KaanSale...");
  const tx = await kaan.transfer(SALE_ADDRESS, amount);
  await tx.wait();
  console.log("✅ 90,000 KAAN transferidos! TX:", tx.hash);
}

main().catch(console.error);
