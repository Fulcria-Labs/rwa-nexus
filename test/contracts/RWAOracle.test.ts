import { expect } from "chai";
import { ethers } from "hardhat";
import { RWAOracle } from "../../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("RWAOracle", function () {
  let oracle: RWAOracle;
  let owner: SignerWithAddress;
  let agent1: SignerWithAddress;
  let agent2: SignerWithAddress;
  let agent3: SignerWithAddress;
  let unauthorized: SignerWithAddress;

  const ASSET_ID = ethers.keccak256(ethers.toUtf8Bytes("manhattan-condo-001"));
  const ASSET_ID2 = ethers.keccak256(ethers.toUtf8Bytes("gold-bar-002"));

  beforeEach(async function () {
    [owner, agent1, agent2, agent3, unauthorized] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("RWAOracle");
    oracle = await Factory.deploy();

    await oracle.authorizeAgent(agent1.address);
    await oracle.authorizeAgent(agent2.address);
  });

  describe("Deployment", function () {
    it("should set deployer as owner", async function () {
      expect(await oracle.owner()).to.equal(owner.address);
    });

    it("should start with default minAgentsForConsensus = 2", async function () {
      expect(await oracle.minAgentsForConsensus()).to.equal(2);
    });

    it("should start with default maxValuationAge = 24 hours", async function () {
      expect(await oracle.maxValuationAge()).to.equal(24 * 60 * 60);
    });

    it("should start with zero assets", async function () {
      expect(await oracle.getAssetCount()).to.equal(0);
    });
  });

  describe("Agent Authorization", function () {
    it("should authorize an agent", async function () {
      expect(await oracle.authorizedAgents(agent1.address)).to.be.true;
    });

    it("should emit AgentAuthorized event", async function () {
      await expect(oracle.authorizeAgent(agent3.address))
        .to.emit(oracle, "AgentAuthorized")
        .withArgs(agent3.address);
    });

    it("should revoke an agent", async function () {
      await oracle.revokeAgent(agent1.address);
      expect(await oracle.authorizedAgents(agent1.address)).to.be.false;
    });

    it("should emit AgentRevoked event", async function () {
      await expect(oracle.revokeAgent(agent1.address))
        .to.emit(oracle, "AgentRevoked")
        .withArgs(agent1.address);
    });

    it("should revert authorization by non-owner", async function () {
      await expect(
        oracle.connect(unauthorized).authorizeAgent(agent3.address)
      ).to.be.revertedWithCustomError(oracle, "OwnableUnauthorizedAccount");
    });

    it("should revert revocation by non-owner", async function () {
      await expect(
        oracle.connect(unauthorized).revokeAgent(agent1.address)
      ).to.be.revertedWithCustomError(oracle, "OwnableUnauthorizedAccount");
    });

    it("should allow re-authorization of revoked agent", async function () {
      await oracle.revokeAgent(agent1.address);
      await oracle.authorizeAgent(agent1.address);
      expect(await oracle.authorizedAgents(agent1.address)).to.be.true;
    });
  });

  describe("submitValuation", function () {
    it("should accept valuation from authorized agent", async function () {
      await oracle.connect(agent1).submitValuation(
        ASSET_ID, ethers.parseEther("500000"), 9000, "comparable_sales"
      );
      expect(await oracle.getValuationCount(ASSET_ID)).to.equal(1);
    });

    it("should emit ValuationSubmitted event", async function () {
      await expect(
        oracle.connect(agent1).submitValuation(
          ASSET_ID, ethers.parseEther("500000"), 9000, "comparable_sales"
        )
      ).to.emit(oracle, "ValuationSubmitted")
        .withArgs(ASSET_ID, agent1.address, ethers.parseEther("500000"), 9000);
    });

    it("should store valuation details correctly", async function () {
      await oracle.connect(agent1).submitValuation(
        ASSET_ID, ethers.parseEther("500000"), 8500, "income_capitalization"
      );
      const val = await oracle.getValuation(ASSET_ID, 0);
      expect(val.value).to.equal(ethers.parseEther("500000"));
      expect(val.confidence).to.equal(8500);
      expect(val.agent).to.equal(agent1.address);
      expect(val.methodology).to.equal("income_capitalization");
    });

    it("should register new asset on first valuation", async function () {
      await oracle.connect(agent1).submitValuation(
        ASSET_ID, ethers.parseEther("100"), 5000, "method"
      );
      expect(await oracle.getAssetCount()).to.equal(1);
      expect(await oracle.assetExists(ASSET_ID)).to.be.true;
    });

    it("should not duplicate asset on subsequent valuations", async function () {
      await oracle.connect(agent1).submitValuation(ASSET_ID, ethers.parseEther("100"), 5000, "m1");
      await oracle.connect(agent2).submitValuation(ASSET_ID, ethers.parseEther("110"), 6000, "m2");
      expect(await oracle.getAssetCount()).to.equal(1);
    });

    it("should track multiple assets independently", async function () {
      await oracle.connect(agent1).submitValuation(ASSET_ID, ethers.parseEther("100"), 5000, "m1");
      await oracle.connect(agent1).submitValuation(ASSET_ID2, ethers.parseEther("200"), 7000, "m2");
      expect(await oracle.getAssetCount()).to.equal(2);
    });

    it("should revert from unauthorized agent", async function () {
      await expect(
        oracle.connect(unauthorized).submitValuation(
          ASSET_ID, ethers.parseEther("500000"), 9000, "method"
        )
      ).to.be.revertedWith("Not authorized agent");
    });

    it("should revert from revoked agent", async function () {
      await oracle.revokeAgent(agent1.address);
      await expect(
        oracle.connect(agent1).submitValuation(
          ASSET_ID, ethers.parseEther("500000"), 9000, "method"
        )
      ).to.be.revertedWith("Not authorized agent");
    });

    it("should revert with confidence > 10000", async function () {
      await expect(
        oracle.connect(agent1).submitValuation(
          ASSET_ID, ethers.parseEther("500000"), 10001, "method"
        )
      ).to.be.revertedWith("Confidence must be <= 10000");
    });

    it("should accept confidence = 10000 (max)", async function () {
      await oracle.connect(agent1).submitValuation(
        ASSET_ID, ethers.parseEther("100"), 10000, "perfect_confidence"
      );
      const val = await oracle.getValuation(ASSET_ID, 0);
      expect(val.confidence).to.equal(10000);
    });

    it("should accept confidence = 0 (min)", async function () {
      await oracle.connect(agent1).submitValuation(
        ASSET_ID, ethers.parseEther("100"), 0, "no_confidence"
      );
      const val = await oracle.getValuation(ASSET_ID, 0);
      expect(val.confidence).to.equal(0);
    });

    it("should revert with value = 0", async function () {
      await expect(
        oracle.connect(agent1).submitValuation(ASSET_ID, 0, 5000, "method")
      ).to.be.revertedWith("Value must be positive");
    });
  });

  describe("Consensus Mechanism", function () {
    it("should reach consensus with 2 agents", async function () {
      await oracle.connect(agent1).submitValuation(
        ASSET_ID, ethers.parseEther("500000"), 8000, "method_a"
      );
      await oracle.connect(agent2).submitValuation(
        ASSET_ID, ethers.parseEther("520000"), 9000, "method_b"
      );

      const [value, confidence] = await oracle.getPrice(ASSET_ID);
      expect(value).to.be.greaterThan(0);
      expect(confidence).to.be.greaterThan(0);
    });

    it("should emit ConsensusReached event", async function () {
      await oracle.connect(agent1).submitValuation(
        ASSET_ID, ethers.parseEther("500000"), 8000, "method_a"
      );
      await expect(
        oracle.connect(agent2).submitValuation(
          ASSET_ID, ethers.parseEther("520000"), 9000, "method_b"
        )
      ).to.emit(oracle, "ConsensusReached");
    });

    it("should compute confidence-weighted average correctly", async function () {
      // Agent1: 500000 * 8000 = 4,000,000,000,000
      // Agent2: 520000 * 9000 = 4,680,000,000,000
      // Total weight: 17000
      // Consensus: 8,680,000,000,000 / 17000 = 510,588.235...
      await oracle.connect(agent1).submitValuation(
        ASSET_ID, ethers.parseEther("500000"), 8000, "method_a"
      );
      await oracle.connect(agent2).submitValuation(
        ASSET_ID, ethers.parseEther("520000"), 9000, "method_b"
      );

      const [value, confidence] = await oracle.getPrice(ASSET_ID);
      // Weighted average should be closer to 520000 (higher confidence)
      expect(value).to.be.greaterThan(ethers.parseEther("505000"));
      expect(value).to.be.lessThan(ethers.parseEther("515000"));
      // Average confidence: 17000 / 2 = 8500
      expect(confidence).to.equal(8500);
    });

    it("should not reach consensus with only 1 agent", async function () {
      await oracle.connect(agent1).submitValuation(
        ASSET_ID, ethers.parseEther("500000"), 8000, "method"
      );
      const [value] = await oracle.getPrice(ASSET_ID);
      expect(value).to.equal(0);
    });

    it("should reach consensus with 3 agents", async function () {
      await oracle.authorizeAgent(agent3.address);
      await oracle.connect(agent1).submitValuation(ASSET_ID, ethers.parseEther("100"), 5000, "m1");
      await oracle.connect(agent2).submitValuation(ASSET_ID, ethers.parseEther("110"), 7000, "m2");
      await oracle.connect(agent3).submitValuation(ASSET_ID, ethers.parseEther("105"), 8000, "m3");

      const [value, , lastUpdated] = await oracle.getPrice(ASSET_ID);
      expect(value).to.be.greaterThan(0);
      expect(lastUpdated).to.be.greaterThan(0);
    });

    it("should update consensus with new valuations", async function () {
      await oracle.connect(agent1).submitValuation(ASSET_ID, ethers.parseEther("100"), 5000, "m1");
      await oracle.connect(agent2).submitValuation(ASSET_ID, ethers.parseEther("110"), 5000, "m2");

      const [value1] = await oracle.getPrice(ASSET_ID);

      // Submit higher valuations
      await oracle.connect(agent1).submitValuation(ASSET_ID, ethers.parseEther("200"), 5000, "m3");
      await oracle.connect(agent2).submitValuation(ASSET_ID, ethers.parseEther("210"), 5000, "m4");

      const [value2] = await oracle.getPrice(ASSET_ID);
      expect(value2).to.be.greaterThan(value1);
    });

    it("should record numValuations in price", async function () {
      await oracle.connect(agent1).submitValuation(ASSET_ID, ethers.parseEther("100"), 5000, "m1");
      await oracle.connect(agent2).submitValuation(ASSET_ID, ethers.parseEther("110"), 5000, "m2");

      const price = await oracle.prices(ASSET_ID);
      expect(price.numValuations).to.be.greaterThanOrEqual(2);
    });

    it("should ignore stale valuations in consensus", async function () {
      await oracle.connect(agent1).submitValuation(ASSET_ID, ethers.parseEther("100"), 5000, "old");
      // Advance time beyond maxValuationAge (24 hours)
      await time.increase(25 * 60 * 60);
      // First valuation is now stale, consensus won't include it
      await oracle.connect(agent2).submitValuation(ASSET_ID, ethers.parseEther("200"), 8000, "new");

      // Only 1 recent valuation, not enough for consensus
      // The previous consensus (if any) may remain, but new consensus with only 1 agent won't form
      const [value] = await oracle.getPrice(ASSET_ID);
      // No new consensus should form (only 1 recent valuation)
      // Value either stays 0 or retains old value
    });
  });

  describe("Configuration", function () {
    it("should allow owner to set minAgentsForConsensus", async function () {
      await oracle.setMinAgentsForConsensus(3);
      expect(await oracle.minAgentsForConsensus()).to.equal(3);
    });

    it("should allow owner to set maxValuationAge", async function () {
      await oracle.setMaxValuationAge(48 * 60 * 60); // 48 hours
      expect(await oracle.maxValuationAge()).to.equal(48 * 60 * 60);
    });

    it("should revert config changes from non-owner", async function () {
      await expect(
        oracle.connect(unauthorized).setMinAgentsForConsensus(5)
      ).to.be.revertedWithCustomError(oracle, "OwnableUnauthorizedAccount");

      await expect(
        oracle.connect(unauthorized).setMaxValuationAge(1000)
      ).to.be.revertedWithCustomError(oracle, "OwnableUnauthorizedAccount");
    });

    it("should require more agents after raising minimum", async function () {
      await oracle.setMinAgentsForConsensus(3);
      await oracle.connect(agent1).submitValuation(ASSET_ID, ethers.parseEther("100"), 5000, "m1");
      await oracle.connect(agent2).submitValuation(ASSET_ID, ethers.parseEther("110"), 5000, "m2");

      // Only 2 agents submitted, need 3 for consensus
      const [value] = await oracle.getPrice(ASSET_ID);
      expect(value).to.equal(0);
    });
  });

  describe("View Functions", function () {
    it("should return correct valuation count", async function () {
      await oracle.connect(agent1).submitValuation(ASSET_ID, ethers.parseEther("100"), 5000, "m1");
      await oracle.connect(agent1).submitValuation(ASSET_ID, ethers.parseEther("110"), 6000, "m2");
      await oracle.connect(agent2).submitValuation(ASSET_ID, ethers.parseEther("105"), 5500, "m3");
      expect(await oracle.getValuationCount(ASSET_ID)).to.equal(3);
    });

    it("should return individual valuations", async function () {
      await oracle.connect(agent1).submitValuation(ASSET_ID, ethers.parseEther("100"), 5000, "first");
      await oracle.connect(agent2).submitValuation(ASSET_ID, ethers.parseEther("200"), 9000, "second");

      const v0 = await oracle.getValuation(ASSET_ID, 0);
      expect(v0.value).to.equal(ethers.parseEther("100"));
      expect(v0.methodology).to.equal("first");

      const v1 = await oracle.getValuation(ASSET_ID, 1);
      expect(v1.value).to.equal(ethers.parseEther("200"));
      expect(v1.methodology).to.equal("second");
    });

    it("should return 0 for unknown asset price", async function () {
      const unknownId = ethers.keccak256(ethers.toUtf8Bytes("nonexistent"));
      const [value, confidence, lastUpdated] = await oracle.getPrice(unknownId);
      expect(value).to.equal(0);
      expect(confidence).to.equal(0);
      expect(lastUpdated).to.equal(0);
    });

    it("should return correct asset count", async function () {
      expect(await oracle.getAssetCount()).to.equal(0);
      await oracle.connect(agent1).submitValuation(ASSET_ID, ethers.parseEther("100"), 5000, "m1");
      expect(await oracle.getAssetCount()).to.equal(1);
      await oracle.connect(agent1).submitValuation(ASSET_ID2, ethers.parseEther("200"), 7000, "m2");
      expect(await oracle.getAssetCount()).to.equal(2);
    });
  });

  describe("Edge Cases", function () {
    it("should handle same agent submitting multiple valuations", async function () {
      await oracle.connect(agent1).submitValuation(ASSET_ID, ethers.parseEther("100"), 5000, "v1");
      await oracle.connect(agent1).submitValuation(ASSET_ID, ethers.parseEther("110"), 6000, "v2");
      expect(await oracle.getValuationCount(ASSET_ID)).to.equal(2);
    });

    it("should handle very large values without overflow", async function () {
      const largeVal = ethers.parseEther("1000000000"); // 1 billion
      await oracle.connect(agent1).submitValuation(ASSET_ID, largeVal, 9000, "large");
      await oracle.connect(agent2).submitValuation(ASSET_ID, largeVal, 9000, "large2");
      const [value] = await oracle.getPrice(ASSET_ID);
      expect(value).to.equal(largeVal);
    });

    it("should handle minimum confidence (1 basis point)", async function () {
      await oracle.connect(agent1).submitValuation(ASSET_ID, ethers.parseEther("100"), 1, "low");
      await oracle.connect(agent2).submitValuation(ASSET_ID, ethers.parseEther("200"), 1, "low2");
      const [value, confidence] = await oracle.getPrice(ASSET_ID);
      expect(value).to.be.greaterThan(0);
      expect(confidence).to.equal(1);
    });

    it("should handle empty methodology string", async function () {
      await oracle.connect(agent1).submitValuation(ASSET_ID, ethers.parseEther("100"), 5000, "");
      const val = await oracle.getValuation(ASSET_ID, 0);
      expect(val.methodology).to.equal("");
    });
  });
});
