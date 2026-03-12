import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.connect();

describe("KAAN — Tulum Yield Token", function () {
  let usdc, kaan, vault, sale;
  let owner, alice, bob, carol;

  const TOTAL_SUPPLY = ethers.parseEther("300000");
  const SALE_ALLOCATION = ethers.parseEther("90000");
  const USDC = (n) => BigInt(n) * 1_000_000n; // USDC has 6 decimals

  beforeEach(async function () {
    [owner, alice, bob, carol] = await ethers.getSigners();

    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    usdc = await MockUSDC.deploy();

    const KaanToken = await ethers.getContractFactory("KaanToken");
    kaan = await KaanToken.deploy(owner.address);

    const KaanYieldVault = await ethers.getContractFactory("KaanYieldVault");
    vault = await KaanYieldVault.deploy(
      await kaan.getAddress(),
      await usdc.getAddress(),
      owner.address
    );

    const KaanSale = await ethers.getContractFactory("KaanSale");
    sale = await KaanSale.deploy(
      await kaan.getAddress(),
      await usdc.getAddress(),
      owner.address
    );

    // Wire up vault and transfer sale allocation
    await kaan.setYieldVault(await vault.getAddress());
    await kaan.transfer(await sale.getAddress(), SALE_ALLOCATION);
  });

  // ═══════════════ TOKEN TESTS ═══════════════

  describe("KaanToken", function () {
    it("has correct name and symbol", async function () {
      expect(await kaan.name()).to.equal("KAAN \u2014 Tulum Yield Token");
      expect(await kaan.symbol()).to.equal("KAAN");
    });

    it("has total supply of 300,000 KAAN", async function () {
      expect(await kaan.totalSupply()).to.equal(TOTAL_SUPPLY);
    });

    it("does not allow additional minting (no mint function)", async function () {
      // KaanToken has no public mint function — verify via ABI
      const fragment = kaan.interface.getFunction("mint");
      expect(fragment).to.be.null;
    });

    it("has correct propertyAddress and propertyManager", async function () {
      expect(await kaan.propertyAddress()).to.equal(
        "Amira District, Tulum, Mexico"
      );
      expect(await kaan.propertyManager()).to.equal("Integra 360");
    });

    it("has propertyValue of $300,000 in USDC units", async function () {
      expect(await kaan.propertyValue()).to.equal(USDC(300_000));
    });

    it("transfers tokens correctly", async function () {
      const amount = ethers.parseEther("1000");
      await kaan.transfer(alice.address, amount);
      expect(await kaan.balanceOf(alice.address)).to.equal(amount);
    });

    it("pause blocks transfers, unpause resumes", async function () {
      await kaan.pause();
      await expect(
        kaan.transfer(alice.address, ethers.parseEther("100"))
      ).to.be.revertedWithCustomError(kaan, "EnforcedPause");

      await kaan.unpause();
      await kaan.transfer(alice.address, ethers.parseEther("100"));
      expect(await kaan.balanceOf(alice.address)).to.equal(
        ethers.parseEther("100")
      );
    });

    it("only owner can pause/unpause", async function () {
      await expect(kaan.connect(alice).pause()).to.be.revertedWithCustomError(
        kaan,
        "OwnableUnauthorizedAccount"
      );
    });

    it("cannot set yield vault twice", async function () {
      await expect(
        kaan.setYieldVault(bob.address)
      ).to.be.revertedWith("Vault already set");
    });
  });

  // ═══════════════ SALE TESTS ═══════════════

  describe("KaanSale", function () {
    beforeEach(async function () {
      await sale.setSaleActive(true);
      // Give alice some USDC
      await usdc.mint(alice.address, USDC(100_000));
      await usdc.connect(alice).approve(await sale.getAddress(), USDC(100_000));
    });

    it("allows buying 1000 KAAN with 1000 USDC", async function () {
      const kaanAmount = ethers.parseEther("1000");
      await sale.connect(alice).buyKaan(kaanAmount);
      expect(await kaan.balanceOf(alice.address)).to.equal(kaanAmount);
    });

    it("has correct USDC and KAAN balances after purchase", async function () {
      const kaanAmount = ethers.parseEther("1000");
      const aliceUsdcBefore = await usdc.balanceOf(alice.address);
      await sale.connect(alice).buyKaan(kaanAmount);

      expect(await usdc.balanceOf(alice.address)).to.equal(
        aliceUsdcBefore - USDC(1000)
      );
      expect(await usdc.balanceOf(await sale.getAddress())).to.equal(
        USDC(1000)
      );
      expect(await sale.totalSold()).to.equal(kaanAmount);
    });

    it("rejects purchase exceeding 90K cap", async function () {
      // Give alice a LOT of USDC
      await usdc.mint(alice.address, USDC(100_000));
      await usdc
        .connect(alice)
        .approve(await sale.getAddress(), USDC(200_000));

      const overCap = ethers.parseEther("90001");
      await expect(
        sale.connect(alice).buyKaan(overCap)
      ).to.be.revertedWith("Exceeds sale cap");
    });

    it("only owner can withdrawUSDC", async function () {
      await sale.connect(alice).buyKaan(ethers.parseEther("500"));

      await expect(
        sale.connect(alice).withdrawUSDC()
      ).to.be.revertedWithCustomError(sale, "OwnableUnauthorizedAccount");

      await sale.withdrawUSDC();
      expect(await usdc.balanceOf(await sale.getAddress())).to.equal(0);
    });

    it("rejects purchases when sale is inactive", async function () {
      await sale.setSaleActive(false);
      await expect(
        sale.connect(alice).buyKaan(ethers.parseEther("100"))
      ).to.be.revertedWith("Sale not active");
    });

    it("emits TokensPurchased event", async function () {
      const kaanAmount = ethers.parseEther("500");
      await expect(sale.connect(alice).buyKaan(kaanAmount))
        .to.emit(sale, "TokensPurchased")
        .withArgs(alice.address, kaanAmount, USDC(500));
    });

    it("whitelist mode blocks non-whitelisted buyers", async function () {
      await sale.setWhitelistEnabled(true);
      await expect(
        sale.connect(alice).buyKaan(ethers.parseEther("100"))
      ).to.be.revertedWith("Not whitelisted");

      await sale.addToWhitelist(alice.address);
      await sale.connect(alice).buyKaan(ethers.parseEther("100"));
      expect(await kaan.balanceOf(alice.address)).to.equal(
        ethers.parseEther("100")
      );
    });
  });

  // ═══════════════ YIELD VAULT TESTS ═══════════════

  describe("KaanYieldVault", function () {
    // Use USDC amounts divisible by 300,000 to avoid Synthetix accumulator rounding
    const RENT = (n) => USDC(n);

    async function depositRent(amount) {
      await usdc.approve(await vault.getAddress(), USDC(amount));
      await vault.depositRent(USDC(amount));
    }

    // Helper: give alice 100% of all 300K KAAN (buy 90K from sale + transfer 210K)
    async function giveAliceAllTokens() {
      await kaan.transfer(alice.address, ethers.parseEther("210000"));
      await sale.setSaleActive(true);
      await usdc.mint(alice.address, USDC(90_000));
      await usdc.connect(alice).approve(await sale.getAddress(), USDC(90_000));
      await sale.connect(alice).buyKaan(ethers.parseEther("90000"));
    }

    it("single holder claims all deposited rent", async function () {
      // Owner holds 210K out of 300K; deposit 3000 USDC
      await depositRent(3000);

      const pending = await vault.pendingYield(owner.address);
      // Owner has 210K/300K → gets 70% of 3000 = 2100
      expect(pending).to.equal(USDC(2100));

      await vault.claimYield();
      expect(await usdc.balanceOf(owner.address)).to.be.gte(USDC(2100));
    });

    it("two holders split proportionally (60/40)", async function () {
      const aliceAmount = ethers.parseEther("180000"); // 60% of 300K
      const bobAmount = ethers.parseEther("120000");   // 40% of 300K

      // Owner has 210K; transfer 180K to alice
      await kaan.transfer(alice.address, aliceAmount);
      // Owner has 30K left; give it to bob
      await kaan.transfer(bob.address, ethers.parseEther("30000"));
      // Bob buys 90K from sale → total 120K
      await sale.setSaleActive(true);
      await usdc.mint(bob.address, USDC(90_000));
      await usdc.connect(bob).approve(await sale.getAddress(), USDC(90_000));
      await sale.connect(bob).buyKaan(ethers.parseEther("90000"));

      expect(await kaan.balanceOf(alice.address)).to.equal(aliceAmount);
      expect(await kaan.balanceOf(bob.address)).to.equal(bobAmount);

      await depositRent(3000);

      expect(await vault.pendingYield(alice.address)).to.equal(USDC(1800)); // 60%
      expect(await vault.pendingYield(bob.address)).to.equal(USDC(1200));   // 40%
    });

    it("transfer tokens mid-period — yield split correctly", async function () {
      // Give alice all 210K owner tokens
      await kaan.transfer(alice.address, ethers.parseEther("210000"));

      // Deposit 3000 USDC — alice gets 210K/300K = 70% = 2100
      await depositRent(3000);

      // Alice transfers half her KAAN to bob before claiming
      await kaan.connect(alice).transfer(bob.address, ethers.parseEther("105000"));

      // Alice should still have her pre-transfer accumulated yield
      const alicePending = await vault.pendingYield(alice.address);
      expect(alicePending).to.equal(USDC(2100)); // earned before transfer

      // Bob has 0 pending (got tokens AFTER deposit)
      expect(await vault.pendingYield(bob.address)).to.equal(0n);

      // Deposit more — should split according to new balances
      await depositRent(3000);

      // Alice: 105K/300K of 3000 = 1050 + previous 2100 = 3150
      expect(await vault.pendingYield(alice.address)).to.equal(USDC(3150));
      // Bob: 105K/300K of 3000 = 1050
      expect(await vault.pendingYield(bob.address)).to.equal(USDC(1050));
    });

    it("claim twice — second claim returns 0", async function () {
      await giveAliceAllTokens();
      await depositRent(1500);

      await vault.connect(alice).claimYield();
      await expect(
        vault.connect(alice).claimYield()
      ).to.be.revertedWith("Nothing to claim");
    });

    it("pendingYield accurate before and after deposit", async function () {
      await kaan.transfer(alice.address, ethers.parseEther("150000")); // 50%

      expect(await vault.pendingYield(alice.address)).to.equal(0);

      await depositRent(6000);
      // alice=150K/300K * 6000 = 3000
      expect(await vault.pendingYield(alice.address)).to.equal(USDC(3000));
    });

    it("totalRentDeposited accumulates", async function () {
      await depositRent(600);
      await depositRent(900);
      await depositRent(1500);

      expect(await vault.totalRentDeposited()).to.equal(USDC(3000));
    });

    it("lastRentDeposit updates each deposit", async function () {
      await depositRent(300);
      const ts1 = await vault.lastRentDeposit();
      expect(ts1).to.be.gt(0);

      await ethers.provider.send("evm_increaseTime", [3600]);
      await ethers.provider.send("evm_mine");

      await depositRent(300);
      const ts2 = await vault.lastRentDeposit();
      expect(ts2).to.be.gt(ts1);
    });

    it("non-owner cannot depositRent", async function () {
      await usdc.mint(alice.address, USDC(3000));
      await usdc.connect(alice).approve(await vault.getAddress(), USDC(3000));

      await expect(
        vault.connect(alice).depositRent(USDC(3000))
      ).to.be.revertedWithCustomError(vault, "OwnableUnauthorizedAccount");
    });

    it("emits RentDeposited event", async function () {
      await usdc.approve(await vault.getAddress(), USDC(3000));
      await expect(vault.depositRent(USDC(3000)))
        .to.emit(vault, "RentDeposited")
        .withArgs(USDC(3000), (val) => val > 0n);
    });

    it("emits YieldClaimed event", async function () {
      await giveAliceAllTokens();
      await depositRent(3000);

      await expect(vault.connect(alice).claimYield())
        .to.emit(vault, "YieldClaimed")
        .withArgs(alice.address, USDC(3000));
    });

    it("estimatedAPY returns 0 with no deposits", async function () {
      expect(await vault.estimatedAPY()).to.equal(0);
    });

    it("estimatedAPY returns reasonable value after deposits", async function () {
      // Deposit $2,000/month for 3 months = $6,000 total
      // Annualised = (6000/3) * 12 = $24,000
      // APY = 24000/300000 = 8% = 800 bps
      await depositRent(2000);
      await depositRent(2000);
      await depositRent(2000);

      const apy = await vault.estimatedAPY();
      expect(apy).to.equal(800n); // 800 basis points = 8%
    });

    it("zero amount deposit reverts", async function () {
      await expect(vault.depositRent(0)).to.be.revertedWith("Zero amount");
    });

    it("handles multiple depositors claiming independently", async function () {
      await kaan.transfer(alice.address, ethers.parseEther("150000"));
      await kaan.transfer(bob.address, ethers.parseEther("60000"));

      await depositRent(3000);

      // alice: 150K/300K * 3000 = 1500
      await vault.connect(alice).claimYield();
      expect(await usdc.balanceOf(alice.address)).to.equal(USDC(1500));

      // bob: 60K/300K * 3000 = 600
      await vault.connect(bob).claimYield();
      expect(await usdc.balanceOf(bob.address)).to.equal(USDC(600));
    });
  });
});
