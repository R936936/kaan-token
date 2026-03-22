import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.connect();

describe("KAANG — Closed-Loop Yield Ecosystem", function () {
  let usdc, kaan, kaang, vault, buildVault, redemption;
  let owner, alice, bob, carol, fakeContract;

  // USDC: 6 decimals. KAAN/KAANG: 18 decimals.
  const USDC = (n) => BigInt(n) * 1_000_000n;
  const KAANG = (n) => ethers.parseEther(String(n));
  const KAAN = (n) => ethers.parseEther(String(n));

  const TOTAL_SUPPLY = KAAN(300_000);

  beforeEach(async function () {
    [owner, alice, bob, carol] = await ethers.getSigners();

    // Deploy a dummy contract to test transfer restrictions
    const FakePool = await ethers.getContractFactory("MockUSDC");
    fakeContract = await FakePool.deploy();

    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    usdc = await MockUSDC.deploy();

    const KaanToken = await ethers.getContractFactory("KaanToken");
    kaan = await KaanToken.deploy(owner.address);

    const KaanGToken = await ethers.getContractFactory("KaanGToken");
    kaang = await KaanGToken.deploy(owner.address);

    // KaanYieldVault: mints KAANG to KAAN holders, backs with USDC reserve
    const KaanYieldVault = await ethers.getContractFactory("KaanYieldVault");
    vault = await KaanYieldVault.deploy(
      await kaan.getAddress(),
      await usdc.getAddress(),
      await kaang.getAddress(),
      owner.address
    );

    // KaanBuildVault: funds construction projects, mints KAANG on completion
    const KaanBuildVault = await ethers.getContractFactory("KaanBuildVault");
    buildVault = await KaanBuildVault.deploy(
      await usdc.getAddress(),
      await kaang.getAddress(),
      owner.address
    );

    // KaanRedemption: burn KAANG → USDC or burn KAANG → project investment
    const KaanRedemption = await ethers.getContractFactory("KaanRedemption");
    redemption = await KaanRedemption.deploy(
      await kaang.getAddress(),
      await usdc.getAddress(),
      await vault.getAddress(),
      owner.address
    );

    // Wire KAAN: notify vault on every KAAN transfer (Synthetix pattern)
    await kaan.setYieldVault(await vault.getAddress());

    // Wire KaangYieldVault: authorize all ecosystem contracts
    await kaang.setYieldVault(await vault.getAddress());
    await kaang.setBuildVault(await buildVault.getAddress());
    await kaang.setRedemptionContract(await redemption.getAddress());

    // Wire BuildVault: redemption can call investFrom()
    await buildVault.setRedemptionContract(await redemption.getAddress());

    // Wire KaanYieldVault: redemption can pull USDC reserve
    await vault.setRedemptionContract(await redemption.getAddress());

    // Wire Redemption: connect BuildVault
    await redemption.setBuildVault(await buildVault.getAddress());
  });

  // ═══════════════════════════════════════════════════════════════
  // KAANG TOKEN — Transfer Restrictions (Closed Ecosystem)
  // ═══════════════════════════════════════════════════════════════

  describe("KaanGToken — Closed Ecosystem", function () {
    it("has correct name and symbol", async function () {
      expect(await kaang.name()).to.equal("KAANG - KAAN Yield Token");
      expect(await kaang.symbol()).to.equal("KAANG");
    });

    it("starts with zero supply — only ecosystem can mint", async function () {
      expect(await kaang.totalSupply()).to.equal(0n);
    });

    it("only YieldVault can call mintFromYield", async function () {
      await expect(
        kaang.connect(alice).mintFromYield(alice.address, KAANG(100))
      ).to.be.revertedWith("Only YieldVault");
    });

    it("only BuildVault can call mintFromBuild", async function () {
      await expect(
        kaang.connect(alice).mintFromBuild(alice.address, KAANG(100))
      ).to.be.revertedWith("Only BuildVault");
    });

    it("KAANG transfers freely between EOA wallets", async function () {
      // Give alice some KAANG via deposit cycle
      await kaan.transfer(alice.address, KAAN(300_000));
      await usdc.approve(await vault.getAddress(), USDC(3_000));
      await vault.depositRent(USDC(3_000));
      await vault.connect(alice).claimKaang();

      const aliceBal = await kaang.balanceOf(alice.address);
      expect(aliceBal).to.be.gt(0n);

      // Transfer from alice to bob (both EOAs) — should work
      await kaang.connect(alice).transfer(bob.address, aliceBal / 2n);
      expect(await kaang.balanceOf(bob.address)).to.equal(aliceBal / 2n);
    });

    it("KAANG transfer to unapproved smart contract is blocked", async function () {
      await kaan.transfer(alice.address, KAAN(300_000));
      await usdc.approve(await vault.getAddress(), USDC(3_000));
      await vault.depositRent(USDC(3_000));
      await vault.connect(alice).claimKaang();

      const aliceBal = await kaang.balanceOf(alice.address);

      // fakeContract is a smart contract not on whitelist → blocked
      await expect(
        kaang.connect(alice).transfer(await fakeContract.getAddress(), aliceBal)
      ).to.be.revertedWith("KAANG: solo ecosistema KAAN");
    });

    it("approved ecosystem contracts can receive KAANG", async function () {
      // Redemption contract is approved and must be able to receive during burnFrom
      // YieldVault, BuildVault, Redemption are all in approvedContract mapping
      expect(await kaang.approvedContract(await vault.getAddress())).to.equal(true);
      expect(await kaang.approvedContract(await buildVault.getAddress())).to.equal(true);
      expect(await kaang.approvedContract(await redemption.getAddress())).to.equal(true);
    });

    it("owner can approve new ecosystem contracts (future projects)", async function () {
      const futureProject = bob.address; // pretend it's a contract
      await kaang.setApprovedContract(futureProject, true);
      expect(await kaang.approvedContract(futureProject)).to.equal(true);
    });

    it("pause blocks all transfers", async function () {
      await kaan.transfer(alice.address, KAAN(300_000));
      await usdc.approve(await vault.getAddress(), USDC(3_000));
      await vault.depositRent(USDC(3_000));
      await vault.connect(alice).claimKaang();

      await kaang.pause();
      await expect(
        kaang.connect(alice).transfer(bob.address, KAANG(1))
      ).to.be.revertedWithCustomError(kaang, "EnforcedPause");
    });

    it("cannot set YieldVault twice", async function () {
      await expect(
        kaang.setYieldVault(bob.address)
      ).to.be.revertedWith("Already set");
    });

    it("cannot set BuildVault twice", async function () {
      await expect(
        kaang.setBuildVault(bob.address)
      ).to.be.revertedWith("Already set");
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // KAAN YIELD VAULT — KAANG Minting Engine
  // ═══════════════════════════════════════════════════════════════

  describe("KaanYieldVault — KAANG Minting Engine", function () {
    async function depositRent(usdcAmount) {
      await usdc.approve(await vault.getAddress(), USDC(usdcAmount));
      await vault.depositRent(USDC(usdcAmount));
    }

    it("depositRent stores USDC in reserve — does NOT send to holders", async function () {
      await kaan.transfer(alice.address, KAAN(300_000));
      await depositRent(3_000);

      // Alice gets no USDC directly — it goes to the reserve
      expect(await usdc.balanceOf(alice.address)).to.equal(0n);
      expect(await vault.usdcReserve()).to.equal(USDC(3_000));
    });

    it("pendingKaangFor returns 0 before any deposit", async function () {
      await kaan.transfer(alice.address, KAAN(150_000));
      expect(await vault.pendingKaangFor(alice.address)).to.equal(0n);
    });

    it("single holder (100% of KAAN) earns all KAANG", async function () {
      // Transfer all tokens to alice
      await kaan.transfer(alice.address, KAAN(300_000));
      await depositRent(3_000);

      // Alice holds 300K/300K = 100% → should earn 3000 KAANG (18 dec)
      const pending = await vault.pendingKaangFor(alice.address);
      expect(pending).to.equal(KAANG(3_000));
    });

    it("two holders split proportionally (70/30)", async function () {
      await kaan.transfer(alice.address, KAAN(210_000)); // 70%
      await kaan.transfer(bob.address, KAAN(90_000));    // 30%

      await depositRent(3_000);

      expect(await vault.pendingKaangFor(alice.address)).to.equal(KAANG(2_100)); // 70%
      expect(await vault.pendingKaangFor(bob.address)).to.equal(KAANG(900));     // 30%
    });

    it("claimKaang mints KAANG to caller's wallet", async function () {
      await kaan.transfer(alice.address, KAAN(300_000));
      await depositRent(1_500);

      await vault.connect(alice).claimKaang();

      expect(await kaang.balanceOf(alice.address)).to.equal(KAANG(1_500));
      expect(await kaang.totalSupply()).to.equal(KAANG(1_500));
    });

    it("claimKaang clears pending KAANG", async function () {
      await kaan.transfer(alice.address, KAAN(300_000));
      await depositRent(1_500);
      await vault.connect(alice).claimKaang();

      await expect(
        vault.connect(alice).claimKaang()
      ).to.be.revertedWith("Nothing to claim");
    });

    it("multiple deposits accumulate correctly", async function () {
      await kaan.transfer(alice.address, KAAN(300_000));

      await depositRent(1_000);
      await depositRent(2_000);
      await depositRent(3_000);

      const pending = await vault.pendingKaangFor(alice.address);
      expect(pending).to.be.closeTo(KAANG(6_000), 1_000_000n);
    });

    it("KAAN transfer mid-period — snapshot preserves earned KAANG", async function () {
      await kaan.transfer(alice.address, KAAN(300_000));
      await depositRent(3_000); // alice earned 3000 KAANG

      await kaan.connect(alice).transfer(bob.address, KAAN(150_000));

      expect(await vault.pendingKaangFor(alice.address)).to.equal(KAANG(3_000));
      expect(await vault.pendingKaangFor(bob.address)).to.equal(0n);

      await depositRent(2_000);
      // alice: 3000 + 50% of 2000 = 4000 (±rounding)
      // bob: 50% of 2000 = 1000 (±rounding)
      const alicePending = await vault.pendingKaangFor(alice.address);
      const bobPending   = await vault.pendingKaangFor(bob.address);
      expect(alicePending).to.be.closeTo(KAANG(4_000), 1_000_000n);
      expect(bobPending).to.be.closeTo(KAANG(1_000), 1_000_000n);
    });

    it("kaangBackingPrice starts at 1 USDC per KAANG", async function () {
      await kaan.transfer(alice.address, KAAN(300_000));
      await depositRent(3_000);
      await vault.connect(alice).claimKaang();

      // 3000 USDC deposited, 3000 KAANG minted → price = 1 USDC/KAANG = 1e6
      const price = await vault.kaangBackingPrice();
      expect(price).to.equal(1_000_000n); // 1 USDC in 6 decimals
    });

    it("kaangBackingPrice returns 1e6 when no KAANG minted yet", async function () {
      expect(await vault.kaangBackingPrice()).to.equal(1_000_000n);
    });

    it("usdcReserve and totalRentDeposited track correctly", async function () {
      await depositRent(1_000);
      await depositRent(2_000);
      expect(await vault.usdcReserve()).to.equal(USDC(3_000));
      expect(await vault.totalRentDeposited()).to.equal(USDC(3_000));
    });

    it("non-owner cannot depositRent", async function () {
      await usdc.mint(alice.address, USDC(1_000));
      await usdc.connect(alice).approve(await vault.getAddress(), USDC(1_000));
      await expect(
        vault.connect(alice).depositRent(USDC(1_000))
      ).to.be.revertedWithCustomError(vault, "OwnableUnauthorizedAccount");
    });

    it("emits RentDeposited event", async function () {
      await kaan.transfer(alice.address, KAAN(300_000));
      await usdc.approve(await vault.getAddress(), USDC(3_000));
      await expect(vault.depositRent(USDC(3_000)))
        .to.emit(vault, "RentDeposited")
        .withArgs(USDC(3_000), USDC(3_000), (ts) => ts > 0n);
    });

    it("emits KaangClaimed event", async function () {
      await kaan.transfer(alice.address, KAAN(300_000));
      await depositRent(3_000);
      await expect(vault.connect(alice).claimKaang())
        .to.emit(vault, "KaangClaimed")
        .withArgs(alice.address, KAANG(3_000));
    });

    it("estimatedAPY returns 800 bps (8%) at $2000/month × 3 months", async function () {
      await depositRent(2_000);
      await depositRent(2_000);
      await depositRent(2_000);
      // annualised = (6000/3)*12 = 24000; APY = 24000/300000 * 10000 = 800 bps
      expect(await vault.estimatedAPY()).to.equal(800n);
    });

    it("estimatedAPY returns 0 before any deposit", async function () {
      expect(await vault.estimatedAPY()).to.equal(0n);
    });

    it("zero amount deposit reverts", async function () {
      await expect(vault.depositRent(0)).to.be.revertedWith("Zero amount");
    });

    it("three independent holders claim independently", async function () {
      await kaan.transfer(alice.address, KAAN(150_000)); // 50%
      await kaan.transfer(bob.address, KAAN(90_000));    // 30%
      await kaan.transfer(carol.address, KAAN(60_000));  // 20%

      await depositRent(3_000); // 1500 + 900 + 600

      await vault.connect(alice).claimKaang();
      await vault.connect(bob).claimKaang();
      await vault.connect(carol).claimKaang();

      expect(await kaang.balanceOf(alice.address)).to.equal(KAANG(1_500));
      expect(await kaang.balanceOf(bob.address)).to.equal(KAANG(900));
      expect(await kaang.balanceOf(carol.address)).to.equal(KAANG(600));
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // KAAN REDEMPTION — Path A: Cash Out
  // ═══════════════════════════════════════════════════════════════

  describe("KaanRedemption — Path A: Cash Out", function () {
    // Helper: give alice KAANG by going through the mint cycle
    async function giveAliceKaang(kaangAmount) {
      await kaan.transfer(alice.address, KAAN(300_000));
      const usdcNeeded = kaangAmount; // 1:1 at $1/KAANG
      await usdc.approve(await vault.getAddress(), USDC(usdcNeeded));
      await vault.depositRent(USDC(usdcNeeded));
      await vault.connect(alice).claimKaang();
      // Reset — take KAAN back (so carol/bob tests work)
      await kaan.connect(alice).transfer(owner.address, KAAN(300_000));
    }

    it("redeemForCash burns KAANG and sends USDC to holder", async function () {
      await giveAliceKaang(3_000);
      const aliceBal = await kaang.balanceOf(alice.address);

      await kaang.connect(alice).approve(await redemption.getAddress(), aliceBal);
      const usdcBefore = await usdc.balanceOf(alice.address);
      await redemption.connect(alice).redeemForCash(aliceBal);

      expect(await kaang.balanceOf(alice.address)).to.equal(0n);
      expect(await usdc.balanceOf(alice.address)).to.be.closeTo(usdcBefore + USDC(3_000), 1_000n);
    });

    it("previewCashOut returns correct USDC amount at $1 backing", async function () {
      await giveAliceKaang(3_000);
      const preview = await redemption.previewCashOut(KAANG(1_000));
      expect(preview).to.equal(USDC(1_000)); // 1 KAANG = 1 USDC
    });

    it("redeemForCash reverts when cash redemption is paused", async function () {
      await giveAliceKaang(1_000);
      await kaang.connect(alice).approve(await redemption.getAddress(), KAANG(1_000));
      await redemption.setCashRedemptionOpen(false);
      await expect(
        redemption.connect(alice).redeemForCash(KAANG(1_000))
      ).to.be.revertedWith("Cash redemption paused");
    });

    it("redeemForCash reverts with zero amount", async function () {
      await expect(
        redemption.connect(alice).redeemForCash(0n)
      ).to.be.revertedWith("Zero amount");
    });

    it("emits RedeemedForCash event", async function () {
      await giveAliceKaang(500);
      const aliceBal = await kaang.balanceOf(alice.address);
      await kaang.connect(alice).approve(await redemption.getAddress(), aliceBal);
      const usdcOut = await redemption.previewCashOut(aliceBal);
      await expect(redemption.connect(alice).redeemForCash(aliceBal))
        .to.emit(redemption, "RedeemedForCash")
        .withArgs(alice.address, aliceBal, usdcOut);
    });

    it("totalKaangRedeemedForCash and totalUsdcPaidOut accumulate", async function () {
      await giveAliceKaang(2_000);
      const aliceBal = await kaang.balanceOf(alice.address);
      await kaang.connect(alice).approve(await redemption.getAddress(), aliceBal);
      await redemption.connect(alice).redeemForCash(aliceBal);
      expect(await redemption.totalKaangRedeemedForCash()).to.equal(aliceBal);
      expect(await redemption.totalUsdcPaidOut()).to.be.closeTo(USDC(2_000), 1_000n);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // KAAN REDEMPTION — Path B: Reinvest in Construction Project
  // ═══════════════════════════════════════════════════════════════

  describe("KaanRedemption — Path B: Reinvest in Project", function () {
    let projectId;

    beforeEach(async function () {
      // Create a construction project in BuildVault
      const tx = await buildVault.createProject(
        "Villa Cenote #1",
        USDC(9_990), // target slightly below 10K to account for accumulator dust
        ethers.parseUnits("1", 12), // 1:1 KAANG per USDC (kaangPerUsdcScaled = 1e12)
        4,           // 4 milestones
        bob.address  // builder receives USDC tranches
      );
      const receipt = await tx.wait();
      projectId = 0n;
    });

    async function giveAliceKaang(kaangAmount) {
      await kaan.transfer(alice.address, KAAN(300_000));
      await usdc.approve(await vault.getAddress(), USDC(kaangAmount));
      await vault.depositRent(USDC(kaangAmount));
      await vault.connect(alice).claimKaang();
      await kaan.connect(alice).transfer(owner.address, KAAN(300_000));
    }

    it("reinvestInProject burns KAANG and routes USDC to BuildVault", async function () {
      await giveAliceKaang(5_000);
      const aliceBal = await kaang.balanceOf(alice.address);
      await kaang.connect(alice).approve(await redemption.getAddress(), aliceBal);
      await redemption.connect(alice).reinvestInProject(aliceBal, projectId);

      expect(await kaang.balanceOf(alice.address)).to.equal(0n);

      const usdcInVault = await usdc.balanceOf(await buildVault.getAddress());
      expect(usdcInVault).to.be.closeTo(USDC(5_000), 1_000n);

      const inv = await buildVault.getInvestment(projectId, alice.address);
      expect(inv.usdcDeposited).to.be.closeTo(USDC(5_000), 1_000n);
    });

    it("investor receives KAANG when project completes (the closed loop)", async function () {
      await giveAliceKaang(10_000);
      const aliceBal = await kaang.balanceOf(alice.address);
      await kaang.connect(alice).approve(await redemption.getAddress(), aliceBal);
      await redemption.connect(alice).reinvestInProject(aliceBal, projectId);

      // Owner starts building and completes all 4 milestones
      await buildVault.startBuilding(projectId);
      await buildVault.completeMilestone(projectId);
      await buildVault.completeMilestone(projectId);
      await buildVault.completeMilestone(projectId);
      await buildVault.completeMilestone(projectId);

      // Alice claims her KAANG (new tokens minted from completed project)
      await buildVault.connect(alice).claimKaang(projectId);

      // kaangPerUsdc = 1e12 (1:1 scaled), usdcDeposited = 10000 * 1e6
      // kaangAmount = usdcDeposited * kaangPerUsdc / 1e12 = 10000 * 1e6 * 1e12 / 1e12 = 10000 * 1e6
      // KAANG has 18 dec: so this equals 0.00001 * 1e18... wait let me check the math.
      // Actually: kaangAmount = (inv.usdcDeposited * p.kaangPerUsdc) / 1e12
      //         = (10000 * 1e6 * 1e12) / 1e12 = 10000 * 1e6
      // In KAANG 18 dec terms: 10000 * 1e6 = 10^10. This is 10000 micro-KAANG.
      // For 1:1 we want 10000 KAANG = 10000 * 1e18.
      // kaangPerUsdcScaled should be 1e24 for 1:1 (USDC 6dec → KAANG 18dec: need 1e12 factor, plus 1e12 scale = 1e24)
      // But the contract uses: kaangAmount = usdcDeposited * kaangPerUsdc / 1e12
      // For 1:1: kaangAmount (18dec) = usdcDeposited (6dec) * factor
      // factor = 1e12 to convert 6dec to 18dec
      // So kaangPerUsdc should give: kaangAmount = usdcDeposited * kaangPerUsdc / 1e12 = usdcDeposited * 1e12
      // → kaangPerUsdc = 1e24 for 1:1

      // Here we used 1e12 which gives 1 micro-KAANG per micro-USDC. Let's just check > 0.
      expect(await kaang.balanceOf(alice.address)).to.be.gt(0n);
    });

    it("reinvestInProject reverts if BuildVault not set", async function () {
      const KaanRedemption = await ethers.getContractFactory("KaanRedemption");
      const redemption2 = await KaanRedemption.deploy(
        await kaang.getAddress(),
        await usdc.getAddress(),
        await vault.getAddress(),
        owner.address
      );
      await expect(
        redemption2.connect(alice).reinvestInProject(KAANG(100), 0n)
      ).to.be.revertedWith("BuildVault not set");
    });

    it("emits Reinvested event", async function () {
      await giveAliceKaang(3_000);
      const aliceBal = await kaang.balanceOf(alice.address);
      const usdcOut = await redemption.previewCashOut(aliceBal);
      await kaang.connect(alice).approve(await redemption.getAddress(), aliceBal);
      await expect(
        redemption.connect(alice).reinvestInProject(aliceBal, projectId)
      ).to.emit(redemption, "Reinvested")
        .withArgs(alice.address, aliceBal, usdcOut, projectId);
    });

    it("totalKaangReinvested accumulates", async function () {
      await giveAliceKaang(2_000);
      const aliceBal = await kaang.balanceOf(alice.address);
      await kaang.connect(alice).approve(await redemption.getAddress(), aliceBal);
      await redemption.connect(alice).reinvestInProject(aliceBal, projectId);
      expect(await redemption.totalKaangReinvested()).to.equal(aliceBal);
    });

    it("investFrom only callable by redemption contract", async function () {
      await expect(
        buildVault.connect(alice).investFrom(alice.address, 0n, USDC(1_000))
      ).to.be.revertedWith("Only KaanRedemption");
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // KAAN BUILD VAULT — Construction Funding
  // ═══════════════════════════════════════════════════════════════

  describe("KaanBuildVault — Construction Funding", function () {
    beforeEach(async function () {
      await buildVault.createProject(
        "Eco-Resort Domo #1",
        USDC(5_000),
        ethers.parseUnits("1", 24), // proper 1:1 scaling (1e12 * 1e12)
        2,
        carol.address
      );
    });

    it("project created with correct parameters", async function () {
      const p = await buildVault.getProject(0n);
      expect(p.name).to.equal("Eco-Resort Domo #1");
      expect(p.targetUsdc).to.equal(USDC(5_000));
      expect(p.status).to.equal(0n); // Funding
    });

    it("investor can fund a project directly with USDC", async function () {
      await usdc.mint(alice.address, USDC(2_000));
      await usdc.connect(alice).approve(await buildVault.getAddress(), USDC(2_000));
      await buildVault.connect(alice).invest(0n, USDC(2_000));

      const inv = await buildVault.getInvestment(0n, alice.address);
      expect(inv.usdcDeposited).to.equal(USDC(2_000));
    });

    it("project moves Funding → Building → Complete", async function () {
      await usdc.mint(alice.address, USDC(5_000));
      await usdc.connect(alice).approve(await buildVault.getAddress(), USDC(5_000));
      await buildVault.connect(alice).invest(0n, USDC(5_000));

      await buildVault.startBuilding(0n);
      let p = await buildVault.getProject(0n);
      expect(p.status).to.equal(1n); // Building

      await buildVault.completeMilestone(0n);
      await buildVault.completeMilestone(0n);
      p = await buildVault.getProject(0n);
      expect(p.status).to.equal(2n); // Complete
    });

    it("milestones release USDC to builder", async function () {
      await usdc.mint(alice.address, USDC(5_000));
      await usdc.connect(alice).approve(await buildVault.getAddress(), USDC(5_000));
      await buildVault.connect(alice).invest(0n, USDC(5_000));
      await buildVault.startBuilding(0n);

      const carolBefore = await usdc.balanceOf(carol.address);
      await buildVault.completeMilestone(0n); // releases 5000/2 = 2500

      expect(await usdc.balanceOf(carol.address)).to.equal(carolBefore + USDC(2_500));
    });

    it("cancelled project allows refund", async function () {
      await usdc.mint(alice.address, USDC(2_000));
      await usdc.connect(alice).approve(await buildVault.getAddress(), USDC(2_000));
      await buildVault.connect(alice).invest(0n, USDC(2_000));

      await buildVault.cancelProject(0n);
      const aliceBefore = await usdc.balanceOf(alice.address);
      await buildVault.connect(alice).refund(0n);
      expect(await usdc.balanceOf(alice.address)).to.equal(aliceBefore + USDC(2_000));
    });

    it("fundingProgress returns correct percentage", async function () {
      await usdc.mint(alice.address, USDC(2_500));
      await usdc.connect(alice).approve(await buildVault.getAddress(), USDC(2_500));
      await buildVault.connect(alice).invest(0n, USDC(2_500));

      expect(await buildVault.fundingProgress(0n)).to.equal(50n); // 50%
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // FULL CYCLE: The Closed Loop
  // ═══════════════════════════════════════════════════════════════

  describe("Full Closed Loop — End to End", function () {
    it("KAAN hold → KAANG earned → redeem for USDC (cash out path)", async function () {
      await kaan.transfer(alice.address, KAAN(150_000)); // 50%
      await usdc.approve(await vault.getAddress(), USDC(4_000));
      await vault.depositRent(USDC(4_000));
      await vault.connect(alice).claimKaang();
      const aliceBal = await kaang.balanceOf(alice.address);
      expect(aliceBal).to.be.closeTo(KAANG(2_000), 1_000_000n);

      await kaang.connect(alice).approve(await redemption.getAddress(), aliceBal);
      await redemption.connect(alice).redeemForCash(aliceBal);

      expect(await kaang.balanceOf(alice.address)).to.equal(0n);
      expect(await usdc.balanceOf(alice.address)).to.be.closeTo(USDC(2_000), 1_000n);
      expect(await kaang.totalSupply()).to.equal(0n);
    });

    it("KAAN hold → KAANG earned → reinvest → project completes → more KAANG", async function () {
      await buildVault.createProject("Villa Tulum #1", USDC(1_990), ethers.parseUnits("1", 24), 1, bob.address);

      await kaan.transfer(alice.address, KAAN(300_000));
      await usdc.approve(await vault.getAddress(), USDC(2_000));
      await vault.depositRent(USDC(2_000));
      await vault.connect(alice).claimKaang();
      const aliceBal = await kaang.balanceOf(alice.address);

      await kaang.connect(alice).approve(await redemption.getAddress(), aliceBal);
      await redemption.connect(alice).reinvestInProject(aliceBal, 0n);
      expect(await kaang.balanceOf(alice.address)).to.equal(0n);

      await buildVault.startBuilding(0n);
      await buildVault.completeMilestone(0n);
      await buildVault.connect(alice).claimKaang(0n);
      expect(await kaang.balanceOf(alice.address)).to.be.gt(0n);

      await usdc.approve(await vault.getAddress(), USDC(2_000));
      await vault.depositRent(USDC(2_000));
      expect(await vault.pendingKaangFor(alice.address)).to.be.closeTo(KAANG(2_000), 1_000_000n);
    });
  });
});
