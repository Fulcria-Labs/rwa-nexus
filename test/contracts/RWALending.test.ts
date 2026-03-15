import { expect } from "chai";
import { ethers } from "hardhat";
import { RWAToken, RWAOracle, RWALending } from "../../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { time } from "@nomicfoundation/hardhat-network-helpers";

if (typeof jest !== "undefined") { jest.setTimeout(30000); }

describe("RWALending", function () {
  let token: RWAToken;
  let oracle: RWAOracle;
  let lending: RWALending;
  let owner: SignerWithAddress;
  let agent1: SignerWithAddress;
  let agent2: SignerWithAddress;
  let borrower: SignerWithAddress;
  let other: SignerWithAddress;

  const ASSET_ID = ethers.keccak256(ethers.toUtf8Bytes("test-property-001"));

  async function setupAssetWithOracle(value: bigint, confidence: number) {
    // Create RWA token
    await token.createAsset(
      "real_estate", "Test Property", "ipfs://test",
      value, 1000, agent1.address
    );

    // Transfer tokens to borrower
    await token.safeTransferFrom(owner.address, borrower.address, 0, 500, "0x");

    // Borrower approves lending contract
    await token.connect(borrower).setApprovalForAll(await lending.getAddress(), true);

    // Submit oracle valuations to establish price
    await oracle.connect(agent1).submitValuation(ASSET_ID, value, confidence, "method_a");
    await oracle.connect(agent2).submitValuation(ASSET_ID, value, confidence, "method_b");
  }

  beforeEach(async function () {
    [owner, agent1, agent2, borrower, other] = await ethers.getSigners();

    // Deploy RWAToken
    const TokenFactory = await ethers.getContractFactory("RWAToken");
    token = await TokenFactory.deploy("https://rwa-nexus.io/{id}");

    // Deploy RWAOracle
    const OracleFactory = await ethers.getContractFactory("RWAOracle");
    oracle = await OracleFactory.deploy();
    await oracle.authorizeAgent(agent1.address);
    await oracle.authorizeAgent(agent2.address);

    // Deploy RWALending
    const LendingFactory = await ethers.getContractFactory("RWALending");
    lending = await LendingFactory.deploy(await token.getAddress(), await oracle.getAddress());
  });

  describe("Deployment", function () {
    it("should set correct token address", async function () {
      expect(await lending.rwaToken()).to.equal(await token.getAddress());
    });

    it("should set correct oracle address", async function () {
      expect(await lending.oracle()).to.equal(await oracle.getAddress());
    });

    it("should set deployer as owner", async function () {
      expect(await lending.owner()).to.equal(owner.address);
    });

    it("should have correct default LTV parameters", async function () {
      expect(await lending.baseLTV()).to.equal(5000);
      expect(await lending.highConfidenceLTV()).to.equal(7000);
      expect(await lending.confidenceThreshold()).to.equal(8000);
    });

    it("should have correct default interest rate", async function () {
      expect(await lending.baseInterestRate()).to.equal(500);
    });

    it("should start with nextLoanId = 0", async function () {
      expect(await lending.nextLoanId()).to.equal(0);
    });
  });

  describe("Borrowing", function () {
    it("should create a loan with base LTV (low confidence)", async function () {
      const value = ethers.parseEther("1"); // 1 ETH per token
      await setupAssetWithOracle(value, 5000); // 50% confidence = base LTV

      // Fund the lending pool
      await owner.sendTransaction({
        to: await lending.getAddress(),
        value: ethers.parseEther("100"),
      });

      const tx = await lending.connect(borrower).borrow(0, 100, ASSET_ID);
      const receipt = await tx.wait();

      const loan = await lending.getLoan(0);
      expect(loan.borrower).to.equal(borrower.address);
      expect(loan.tokenId).to.equal(0);
      expect(loan.collateralAmount).to.equal(100);
      expect(loan.active).to.be.true;

      // Base LTV: 50%
      // maxLoan = (1e18 * 100 * 5000) / (10000 * 1e18) = 50
      expect(loan.loanAmount).to.equal(50);
    });

    it("should create a loan with high confidence LTV", async function () {
      const value = ethers.parseEther("1");
      await setupAssetWithOracle(value, 9000); // 90% confidence > 80% threshold

      await owner.sendTransaction({
        to: await lending.getAddress(),
        value: ethers.parseEther("100"),
      });

      await lending.connect(borrower).borrow(0, 100, ASSET_ID);
      const loan = await lending.getLoan(0);

      // High confidence LTV: 70%
      // maxLoan = (1e18 * 100 * 7000) / (10000 * 1e18) = 70
      expect(loan.loanAmount).to.equal(70);
    });

    it("should emit LoanCreated event", async function () {
      const value = ethers.parseEther("1");
      await setupAssetWithOracle(value, 5000);

      await owner.sendTransaction({
        to: await lending.getAddress(),
        value: ethers.parseEther("100"),
      });

      await expect(lending.connect(borrower).borrow(0, 100, ASSET_ID))
        .to.emit(lending, "LoanCreated")
        .withArgs(0, borrower.address, 0, 50);
    });

    it("should transfer collateral tokens to lending contract", async function () {
      const value = ethers.parseEther("1");
      await setupAssetWithOracle(value, 5000);

      await owner.sendTransaction({
        to: await lending.getAddress(),
        value: ethers.parseEther("100"),
      });

      const balBefore = await token.balanceOf(borrower.address, 0);
      await lending.connect(borrower).borrow(0, 100, ASSET_ID);
      const balAfter = await token.balanceOf(borrower.address, 0);

      expect(balBefore - balAfter).to.equal(100);
      expect(await token.balanceOf(await lending.getAddress(), 0)).to.equal(100);
    });

    it("should transfer BNB to borrower", async function () {
      const value = ethers.parseEther("1");
      await setupAssetWithOracle(value, 5000);

      await owner.sendTransaction({
        to: await lending.getAddress(),
        value: ethers.parseEther("100"),
      });

      const balBefore = await ethers.provider.getBalance(borrower.address);
      const tx = await lending.connect(borrower).borrow(0, 100, ASSET_ID);
      const receipt = await tx.wait();
      const gasCost = receipt!.gasUsed * receipt!.gasPrice;
      const balAfter = await ethers.provider.getBalance(borrower.address);

      // Borrower should receive 50 wei (loan amount) minus gas
      expect(balAfter + gasCost - balBefore).to.equal(BigInt(50));
    });

    it("should track borrower loans", async function () {
      const value = ethers.parseEther("1");
      await setupAssetWithOracle(value, 5000);

      await owner.sendTransaction({
        to: await lending.getAddress(),
        value: ethers.parseEther("100"),
      });

      await lending.connect(borrower).borrow(0, 50, ASSET_ID);
      await lending.connect(borrower).borrow(0, 50, ASSET_ID);

      const loans = await lending.getBorrowerLoans(borrower.address);
      expect(loans.length).to.equal(2);
      expect(loans[0]).to.equal(0);
      expect(loans[1]).to.equal(1);
    });

    it("should revert with zero amount", async function () {
      const value = ethers.parseEther("1");
      await setupAssetWithOracle(value, 5000);

      await expect(
        lending.connect(borrower).borrow(0, 0, ASSET_ID)
      ).to.be.revertedWith("Amount must be positive");
    });

    it("should revert without oracle price", async function () {
      await token.createAsset("real_estate", "T", "ipfs://t", ethers.parseEther("1"), 100, agent1.address);
      await token.safeTransferFrom(owner.address, borrower.address, 0, 50, "0x");
      await token.connect(borrower).setApprovalForAll(await lending.getAddress(), true);

      const unknownAsset = ethers.keccak256(ethers.toUtf8Bytes("unknown"));
      await expect(
        lending.connect(borrower).borrow(0, 10, unknownAsset)
      ).to.be.revertedWith("No oracle price available");
    });

    it("should revert with stale oracle price", async function () {
      const value = ethers.parseEther("1");
      await setupAssetWithOracle(value, 5000);

      await owner.sendTransaction({
        to: await lending.getAddress(),
        value: ethers.parseEther("100"),
      });

      // Advance time beyond 1 day
      await time.increase(2 * 24 * 60 * 60);

      await expect(
        lending.connect(borrower).borrow(0, 10, ASSET_ID)
      ).to.be.revertedWith("Oracle price too stale");
    });

    it("should revert with insufficient pool liquidity", async function () {
      const value = ethers.parseEther("1");
      await setupAssetWithOracle(value, 5000);
      // Don't fund the pool

      await expect(
        lending.connect(borrower).borrow(0, 100, ASSET_ID)
      ).to.be.revertedWith("Insufficient pool liquidity");
    });

    it("should increment loanId for each loan", async function () {
      const value = ethers.parseEther("1");
      await setupAssetWithOracle(value, 5000);

      await owner.sendTransaction({
        to: await lending.getAddress(),
        value: ethers.parseEther("1000"),
      });

      await lending.connect(borrower).borrow(0, 10, ASSET_ID);
      await lending.connect(borrower).borrow(0, 10, ASSET_ID);
      await lending.connect(borrower).borrow(0, 10, ASSET_ID);

      expect(await lending.nextLoanId()).to.equal(3);
    });
  });

  describe("Repayment", function () {
    beforeEach(async function () {
      const value = ethers.parseEther("1");
      await setupAssetWithOracle(value, 5000);

      await owner.sendTransaction({
        to: await lending.getAddress(),
        value: ethers.parseEther("100"),
      });

      await lending.connect(borrower).borrow(0, 100, ASSET_ID);
    });

    it("should allow borrower to repay loan", async function () {
      // Loan amount is 50 wei, interest negligible at start
      await lending.connect(borrower).repay(0, { value: 100 });
      const loan = await lending.getLoan(0);
      expect(loan.active).to.be.false;
    });

    it("should emit LoanRepaid event", async function () {
      await expect(lending.connect(borrower).repay(0, { value: 100 }))
        .to.emit(lending, "LoanRepaid");
    });

    it("should return collateral tokens to borrower", async function () {
      const balBefore = await token.balanceOf(borrower.address, 0);
      await lending.connect(borrower).repay(0, { value: 100 });
      const balAfter = await token.balanceOf(borrower.address, 0);
      expect(balAfter - balBefore).to.equal(100);
    });

    it("should refund excess payment", async function () {
      const balBefore = await ethers.provider.getBalance(borrower.address);
      const tx = await lending.connect(borrower).repay(0, { value: 1000 });
      const receipt = await tx.wait();
      const gasCost = receipt!.gasUsed * receipt!.gasPrice;
      const balAfter = await ethers.provider.getBalance(borrower.address);

      // Borrower pays loanAmount + interest, gets excess refunded
      // Net cost should be ~50 (loan) + minimal interest + gas
      const netCost = balBefore - balAfter - gasCost;
      expect(netCost).to.be.lessThanOrEqual(51); // loan + tiny interest
    });

    it("should accrue interest over time", async function () {
      // Advance 365 days
      await time.increase(365 * 24 * 60 * 60);

      // After 1 year at 5% on 50 wei loan: interest = 50 * 500 / 10000 ≈ 2
      // Total due ≈ 52
      await expect(
        lending.connect(borrower).repay(0, { value: 50 })
      ).to.be.revertedWith("Insufficient repayment");

      // Should succeed with enough value
      await lending.connect(borrower).repay(0, { value: 100 });
      const loan = await lending.getLoan(0);
      expect(loan.active).to.be.false;
    });

    it("should revert when repaying inactive loan", async function () {
      await lending.connect(borrower).repay(0, { value: 100 });
      await expect(
        lending.connect(borrower).repay(0, { value: 100 })
      ).to.be.revertedWith("Loan not active");
    });

    it("should revert when non-borrower tries to repay", async function () {
      await expect(
        lending.connect(other).repay(0, { value: 100 })
      ).to.be.revertedWith("Not borrower");
    });

    it("should revert with insufficient repayment", async function () {
      // Advance time to accrue some interest
      await time.increase(180 * 24 * 60 * 60);

      await expect(
        lending.connect(borrower).repay(0, { value: 1 })
      ).to.be.revertedWith("Insufficient repayment");
    });
  });

  describe("Pool Funding", function () {
    it("should accept ETH deposits via receive", async function () {
      await owner.sendTransaction({
        to: await lending.getAddress(),
        value: ethers.parseEther("10"),
      });

      const balance = await ethers.provider.getBalance(await lending.getAddress());
      expect(balance).to.equal(ethers.parseEther("10"));
    });

    it("should accept ETH from multiple depositors", async function () {
      await owner.sendTransaction({
        to: await lending.getAddress(),
        value: ethers.parseEther("5"),
      });
      await borrower.sendTransaction({
        to: await lending.getAddress(),
        value: ethers.parseEther("3"),
      });

      const balance = await ethers.provider.getBalance(await lending.getAddress());
      expect(balance).to.equal(ethers.parseEther("8"));
    });
  });

  describe("LTV Boundary", function () {
    it("should use baseLTV at confidence = 7999", async function () {
      const value = ethers.parseEther("1");
      await setupAssetWithOracle(value, 7999);

      await owner.sendTransaction({
        to: await lending.getAddress(),
        value: ethers.parseEther("100"),
      });

      await lending.connect(borrower).borrow(0, 100, ASSET_ID);
      const loan = await lending.getLoan(0);
      // baseLTV: 50% => 50
      expect(loan.loanAmount).to.equal(50);
    });

    it("should use highConfidenceLTV at confidence = 8000", async function () {
      const value = ethers.parseEther("1");
      await setupAssetWithOracle(value, 8000);

      await owner.sendTransaction({
        to: await lending.getAddress(),
        value: ethers.parseEther("100"),
      });

      await lending.connect(borrower).borrow(0, 100, ASSET_ID);
      const loan = await lending.getLoan(0);
      // highConfidenceLTV: 70% => 70
      expect(loan.loanAmount).to.equal(70);
    });

    it("should use highConfidenceLTV at confidence = 10000", async function () {
      const value = ethers.parseEther("1");
      await setupAssetWithOracle(value, 10000);

      await owner.sendTransaction({
        to: await lending.getAddress(),
        value: ethers.parseEther("100"),
      });

      await lending.connect(borrower).borrow(0, 100, ASSET_ID);
      const loan = await lending.getLoan(0);
      expect(loan.loanAmount).to.equal(70);
    });
  });

  describe("Liquidation", function () {
    beforeEach(async function () {
      const value = ethers.parseEther("1");
      await setupAssetWithOracle(value, 5000); // 50% confidence = baseLTV (50%)

      await owner.sendTransaction({
        to: await lending.getAddress(),
        value: ethers.parseEther("100"),
      });

      // Borrow: loan amount = 100 * 1e18 * 5000 / (10000 * 1e18) = 50
      await lending.connect(borrower).borrow(0, 100, ASSET_ID);
    });

    it("should not allow liquidation of healthy loan", async function () {
      // Loan is 50, collateral value is 100. 50 * 10000 = 500000 < 100 * 9000 = 900000
      await expect(
        lending.connect(other).liquidate(0, ASSET_ID, { value: 100 })
      ).to.be.revertedWith("Loan not undercollateralized");
    });

    // Helper: advance past maxValuationAge then submit new lower-priced valuations
    async function crashOraclePrice(newValue: bigint) {
      // Advance time past 24h so old valuations expire from consensus window
      await time.increase(25 * 60 * 60);
      // Submit new valuations at the lower price
      await oracle.connect(agent1).submitValuation(ASSET_ID, newValue, 5000, "price_drop_a");
      await oracle.connect(agent2).submitValuation(ASSET_ID, newValue, 5000, "price_drop_b");
    }

    it("should allow liquidation when value drops below threshold", async function () {
      // Loan: debt=50, collateral=100 tokens at 1 ETH each → collateralValue=100
      // After crash to 0.5 ETH: collateralValue=50
      // Check: 50 * 10000 = 500000 >= 50 * 9000 = 450000 ✓ (liquidatable)
      await crashOraclePrice(ethers.parseEther("0.5"));

      await lending.connect(other).liquidate(0, ASSET_ID, { value: 100 });

      const loan = await lending.getLoan(0);
      expect(loan.active).to.be.false;
    });

    it("should transfer collateral to liquidator", async function () {
      await crashOraclePrice(ethers.parseEther("0.5"));

      const balBefore = await token.balanceOf(other.address, 0);
      await lending.connect(other).liquidate(0, ASSET_ID, { value: 100 });
      const balAfter = await token.balanceOf(other.address, 0);

      expect(balAfter - balBefore).to.equal(100); // Gets the collateral
    });

    it("should emit LoanLiquidated event", async function () {
      await crashOraclePrice(ethers.parseEther("0.5"));

      await expect(lending.connect(other).liquidate(0, ASSET_ID, { value: 100 }))
        .to.emit(lending, "LoanLiquidated")
        .withArgs(0, other.address);
    });

    it("should refund excess liquidation payment", async function () {
      await crashOraclePrice(ethers.parseEther("0.5"));

      const balBefore = await ethers.provider.getBalance(other.address);
      const tx = await lending.connect(other).liquidate(0, ASSET_ID, { value: 1000 });
      const receipt = await tx.wait();
      const gasCost = receipt!.gasUsed * receipt!.gasPrice;
      const balAfter = await ethers.provider.getBalance(other.address);

      // Debt is ~50 + small interest from 25h. Net cost should be ~50 + gas, not 1000
      const netCost = balBefore - balAfter - gasCost;
      expect(netCost).to.be.lessThanOrEqual(52); // loan + ~25h of interest
    });

    it("should revert on inactive loan", async function () {
      // Repay the loan first
      await lending.connect(borrower).repay(0, { value: 100 });

      await expect(
        lending.connect(other).liquidate(0, ASSET_ID, { value: 100 })
      ).to.be.revertedWith("Loan not active");
    });

    it("should revert with insufficient liquidation payment", async function () {
      await crashOraclePrice(ethers.parseEther("0.5"));

      await expect(
        lending.connect(other).liquidate(0, ASSET_ID, { value: 1 })
      ).to.be.revertedWith("Insufficient liquidation payment");
    });

    it("should revert with stale oracle price", async function () {
      await time.increase(2 * 24 * 60 * 60);

      await expect(
        lending.connect(other).liquidate(0, ASSET_ID, { value: 100 })
      ).to.be.revertedWith("Oracle price too stale");
    });

    it("should become liquidatable after interest accrual plus price drop", async function () {
      // Advance 25h (past oracle age), submit price at 0.55 ETH
      // Interest after 25h on 50 wei at 5% APR is tiny (~0.003), so totalDebt ≈ 50
      // collateralValue = 0.55 * 100 / 1e18 = 55
      // 50 * 10000 = 500000 < 55 * 9000 = 495000 — close but still healthy
      // Use 0.54 ETH: collateralValue = 54, 50 * 10000 = 500000 >= 54 * 9000 = 486000 ✓
      await crashOraclePrice(ethers.parseEther("0.54"));

      await lending.connect(other).liquidate(0, ASSET_ID, { value: 100 });
      const loan = await lending.getLoan(0);
      expect(loan.active).to.be.false;
    });
  });

  describe("Liquidation Query", function () {
    beforeEach(async function () {
      const value = ethers.parseEther("1");
      await setupAssetWithOracle(value, 5000);

      await owner.sendTransaction({
        to: await lending.getAddress(),
        value: ethers.parseEther("100"),
      });

      await lending.connect(borrower).borrow(0, 100, ASSET_ID);
    });

    it("should report healthy loan as not liquidatable", async function () {
      const [liquidatable, totalDebt, collateralValue] = await lending.isLiquidatable(0, ASSET_ID);
      expect(liquidatable).to.be.false;
      expect(totalDebt).to.equal(50);
      expect(collateralValue).to.equal(100);
    });

    it("should report undercollateralized loan as liquidatable", async function () {
      // Advance past maxValuationAge so old valuations expire
      await time.increase(25 * 60 * 60);
      const newValue = ethers.parseEther("0.5");
      await oracle.connect(agent1).submitValuation(ASSET_ID, newValue, 5000, "drop_a");
      await oracle.connect(agent2).submitValuation(ASSET_ID, newValue, 5000, "drop_b");

      const [liquidatable, totalDebt, collateralValue] = await lending.isLiquidatable(0, ASSET_ID);
      expect(liquidatable).to.be.true;
      expect(collateralValue).to.equal(50);
    });

    it("should return false for inactive loan", async function () {
      await lending.connect(borrower).repay(0, { value: 100 });
      const [liquidatable] = await lending.isLiquidatable(0, ASSET_ID);
      expect(liquidatable).to.be.false;
    });
  });

  describe("View Functions", function () {
    it("should return empty array for borrower with no loans", async function () {
      const loans = await lending.getBorrowerLoans(other.address);
      expect(loans.length).to.equal(0);
    });

    it("should return loan details", async function () {
      const value = ethers.parseEther("1");
      await setupAssetWithOracle(value, 5000);

      await owner.sendTransaction({
        to: await lending.getAddress(),
        value: ethers.parseEther("100"),
      });

      await lending.connect(borrower).borrow(0, 100, ASSET_ID);
      const loan = await lending.getLoan(0);
      expect(loan.borrower).to.equal(borrower.address);
      expect(loan.tokenId).to.equal(0);
      expect(loan.collateralAmount).to.equal(100);
      expect(loan.interestRate).to.equal(500);
      expect(loan.active).to.be.true;
      expect(loan.startTime).to.be.greaterThan(0);
    });
  });

  describe("Integration Flow", function () {
    it("should complete full borrow-repay cycle", async function () {
      const value = ethers.parseEther("1");
      await setupAssetWithOracle(value, 9000);

      // Fund pool
      await owner.sendTransaction({
        to: await lending.getAddress(),
        value: ethers.parseEther("100"),
      });

      // Borrow
      const borrowerTokensBefore = await token.balanceOf(borrower.address, 0);
      await lending.connect(borrower).borrow(0, 200, ASSET_ID);

      expect(await token.balanceOf(borrower.address, 0)).to.equal(borrowerTokensBefore - 200n);
      expect(await token.balanceOf(await lending.getAddress(), 0)).to.equal(200);

      const loan = await lending.getLoan(0);
      expect(loan.active).to.be.true;

      // Repay
      await lending.connect(borrower).repay(0, { value: ethers.parseEther("1") });

      expect(await token.balanceOf(borrower.address, 0)).to.equal(borrowerTokensBefore);
      const loanAfter = await lending.getLoan(0);
      expect(loanAfter.active).to.be.false;
    });

    it("should handle multiple concurrent loans", async function () {
      const value = ethers.parseEther("1");
      await setupAssetWithOracle(value, 5000);

      await owner.sendTransaction({
        to: await lending.getAddress(),
        value: ethers.parseEther("1000"),
      });

      // Create 3 loans
      await lending.connect(borrower).borrow(0, 50, ASSET_ID);
      await lending.connect(borrower).borrow(0, 50, ASSET_ID);
      await lending.connect(borrower).borrow(0, 50, ASSET_ID);

      // Repay middle loan
      await lending.connect(borrower).repay(1, { value: 100 });

      const loan0 = await lending.getLoan(0);
      const loan1 = await lending.getLoan(1);
      const loan2 = await lending.getLoan(2);

      expect(loan0.active).to.be.true;
      expect(loan1.active).to.be.false;
      expect(loan2.active).to.be.true;
    });
  });
});
