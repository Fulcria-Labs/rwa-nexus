import { expect } from "chai";
import { ethers } from "hardhat";
import { RWAToken } from "../../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("RWAToken", function () {
  let token: RWAToken;
  let owner: SignerWithAddress;
  let oracle: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;

  beforeEach(async function () {
    [owner, oracle, user1, user2] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("RWAToken");
    token = await Factory.deploy("https://rwa-nexus.io/metadata/{id}.json");
  });

  describe("Deployment", function () {
    it("should set the correct URI", async function () {
      expect(await token.uri(0)).to.equal("https://rwa-nexus.io/metadata/{id}.json");
    });

    it("should set deployer as owner", async function () {
      expect(await token.owner()).to.equal(owner.address);
    });

    it("should start with nextTokenId = 0", async function () {
      expect(await token.nextTokenId()).to.equal(0);
    });
  });

  describe("createAsset", function () {
    it("should create an asset and mint tokens", async function () {
      const tx = await token.createAsset(
        "real_estate", "Manhattan Condo", "ipfs://abc123",
        ethers.parseEther("500000"), 1000, oracle.address
      );
      const receipt = await tx.wait();

      expect(await token.nextTokenId()).to.equal(1);
      expect(await token.balanceOf(owner.address, 0)).to.equal(1000);
    });

    it("should store correct asset metadata", async function () {
      await token.createAsset(
        "commodity", "Gold Bullion", "ipfs://gold",
        ethers.parseEther("100000"), 500, oracle.address
      );

      const asset = await token.getAsset(0);
      expect(asset.assetType).to.equal("commodity");
      expect(asset.description).to.equal("Gold Bullion");
      expect(asset.externalURI).to.equal("ipfs://gold");
      expect(asset.totalValue).to.equal(ethers.parseEther("100000"));
      expect(asset.active).to.be.true;
    });

    it("should set the correct oracle for the asset", async function () {
      await token.createAsset(
        "treasury", "T-Bills", "ipfs://tbills",
        ethers.parseEther("1000000"), 100, oracle.address
      );
      expect(await token.assetOracle(0)).to.equal(oracle.address);
    });

    it("should emit AssetCreated event", async function () {
      await expect(token.createAsset(
        "real_estate", "Miami Villa", "ipfs://miami",
        ethers.parseEther("750000"), 200, oracle.address
      )).to.emit(token, "AssetCreated")
        .withArgs(0, "real_estate", "Miami Villa", ethers.parseEther("750000"));
    });

    it("should increment tokenId for multiple assets", async function () {
      await token.createAsset("real_estate", "A1", "ipfs://1", ethers.parseEther("100"), 10, oracle.address);
      await token.createAsset("commodity", "A2", "ipfs://2", ethers.parseEther("200"), 20, oracle.address);
      await token.createAsset("treasury", "A3", "ipfs://3", ethers.parseEther("300"), 30, oracle.address);

      expect(await token.nextTokenId()).to.equal(3);
      expect(await token.balanceOf(owner.address, 0)).to.equal(10);
      expect(await token.balanceOf(owner.address, 1)).to.equal(20);
      expect(await token.balanceOf(owner.address, 2)).to.equal(30);
    });

    it("should revert when called by non-owner", async function () {
      await expect(
        token.connect(user1).createAsset(
          "real_estate", "Test", "ipfs://test",
          ethers.parseEther("100"), 10, oracle.address
        )
      ).to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount");
    });

    it("should allow zero supply mint", async function () {
      await token.createAsset("real_estate", "Empty", "ipfs://e", ethers.parseEther("100"), 0, oracle.address);
      expect(await token.balanceOf(owner.address, 0)).to.equal(0);
    });

    it("should allow zero total value", async function () {
      await token.createAsset("real_estate", "Zero", "ipfs://z", 0, 100, oracle.address);
      const asset = await token.getAsset(0);
      expect(asset.totalValue).to.equal(0);
    });

    it("should store createdAt timestamp", async function () {
      await token.createAsset("real_estate", "T", "ipfs://t", ethers.parseEther("1"), 1, oracle.address);
      const asset = await token.getAsset(0);
      expect(asset.createdAt).to.be.greaterThan(0);
    });
  });

  describe("updateValuation", function () {
    beforeEach(async function () {
      await token.createAsset(
        "real_estate", "Test Property", "ipfs://test",
        ethers.parseEther("500000"), 1000, oracle.address
      );
    });

    it("should update the valuation when called by oracle", async function () {
      const newValue = ethers.parseEther("600000");
      await token.connect(oracle).updateValuation(0, newValue);
      const asset = await token.getAsset(0);
      expect(asset.totalValue).to.equal(newValue);
    });

    it("should emit AssetValuationUpdated event", async function () {
      const oldValue = ethers.parseEther("500000");
      const newValue = ethers.parseEther("550000");
      await expect(token.connect(oracle).updateValuation(0, newValue))
        .to.emit(token, "AssetValuationUpdated")
        .withArgs(0, oldValue, newValue, oracle.address);
    });

    it("should revert when called by non-oracle", async function () {
      await expect(
        token.connect(user1).updateValuation(0, ethers.parseEther("600000"))
      ).to.be.revertedWith("Not authorized oracle");
    });

    it("should revert when called by owner (if not oracle)", async function () {
      await expect(
        token.updateValuation(0, ethers.parseEther("600000"))
      ).to.be.revertedWith("Not authorized oracle");
    });

    it("should revert for inactive asset", async function () {
      await token.deactivateAsset(0);
      await expect(
        token.connect(oracle).updateValuation(0, ethers.parseEther("600000"))
      ).to.be.revertedWith("Asset not active");
    });

    it("should allow multiple valuation updates", async function () {
      await token.connect(oracle).updateValuation(0, ethers.parseEther("510000"));
      await token.connect(oracle).updateValuation(0, ethers.parseEther("520000"));
      await token.connect(oracle).updateValuation(0, ethers.parseEther("530000"));
      const asset = await token.getAsset(0);
      expect(asset.totalValue).to.equal(ethers.parseEther("530000"));
    });

    it("should allow setting valuation to zero", async function () {
      await token.connect(oracle).updateValuation(0, 0);
      const asset = await token.getAsset(0);
      expect(asset.totalValue).to.equal(0);
    });
  });

  describe("deactivateAsset", function () {
    beforeEach(async function () {
      await token.createAsset(
        "real_estate", "Deactivation Test", "ipfs://deact",
        ethers.parseEther("100000"), 100, oracle.address
      );
    });

    it("should deactivate an active asset", async function () {
      await token.deactivateAsset(0);
      const asset = await token.getAsset(0);
      expect(asset.active).to.be.false;
    });

    it("should emit AssetDeactivated event", async function () {
      await expect(token.deactivateAsset(0))
        .to.emit(token, "AssetDeactivated")
        .withArgs(0);
    });

    it("should revert when deactivating already inactive asset", async function () {
      await token.deactivateAsset(0);
      await expect(token.deactivateAsset(0)).to.be.revertedWith("Already inactive");
    });

    it("should revert when called by non-owner", async function () {
      await expect(
        token.connect(user1).deactivateAsset(0)
      ).to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount");
    });
  });

  describe("tokenValue", function () {
    it("should return total value", async function () {
      await token.createAsset(
        "commodity", "Gold", "ipfs://gold",
        ethers.parseEther("250000"), 500, oracle.address
      );
      expect(await token.tokenValue(0)).to.equal(ethers.parseEther("250000"));
    });

    it("should reflect updated valuation", async function () {
      await token.createAsset("commodity", "Gold", "ipfs://g", ethers.parseEther("100"), 10, oracle.address);
      await token.connect(oracle).updateValuation(0, ethers.parseEther("200"));
      expect(await token.tokenValue(0)).to.equal(ethers.parseEther("200"));
    });

    it("should return 0 for non-existent token", async function () {
      expect(await token.tokenValue(999)).to.equal(0);
    });
  });

  describe("setOracle", function () {
    beforeEach(async function () {
      await token.createAsset("real_estate", "T", "ipfs://t", ethers.parseEther("100"), 10, oracle.address);
    });

    it("should update the oracle address", async function () {
      await token.setOracle(0, user1.address);
      expect(await token.assetOracle(0)).to.equal(user1.address);
    });

    it("should allow new oracle to update valuation", async function () {
      await token.setOracle(0, user1.address);
      await token.connect(user1).updateValuation(0, ethers.parseEther("200"));
      const asset = await token.getAsset(0);
      expect(asset.totalValue).to.equal(ethers.parseEther("200"));
    });

    it("should revoke old oracle access", async function () {
      await token.setOracle(0, user1.address);
      await expect(
        token.connect(oracle).updateValuation(0, ethers.parseEther("200"))
      ).to.be.revertedWith("Not authorized oracle");
    });

    it("should revert when called by non-owner", async function () {
      await expect(
        token.connect(user1).setOracle(0, user2.address)
      ).to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount");
    });
  });

  describe("ERC-1155 Functionality", function () {
    beforeEach(async function () {
      await token.createAsset("real_estate", "T", "ipfs://t", ethers.parseEther("1000"), 100, oracle.address);
    });

    it("should allow owner to transfer tokens", async function () {
      await token.safeTransferFrom(owner.address, user1.address, 0, 50, "0x");
      expect(await token.balanceOf(owner.address, 0)).to.equal(50);
      expect(await token.balanceOf(user1.address, 0)).to.equal(50);
    });

    it("should allow batch transfer", async function () {
      await token.createAsset("commodity", "C", "ipfs://c", ethers.parseEther("500"), 200, oracle.address);
      await token.safeBatchTransferFrom(
        owner.address, user1.address, [0, 1], [10, 20], "0x"
      );
      expect(await token.balanceOf(user1.address, 0)).to.equal(10);
      expect(await token.balanceOf(user1.address, 1)).to.equal(20);
    });

    it("should support approval mechanism", async function () {
      await token.setApprovalForAll(user1.address, true);
      expect(await token.isApprovedForAll(owner.address, user1.address)).to.be.true;
      await token.connect(user1).safeTransferFrom(owner.address, user2.address, 0, 25, "0x");
      expect(await token.balanceOf(user2.address, 0)).to.equal(25);
    });

    it("should revert transfer without approval", async function () {
      await expect(
        token.connect(user1).safeTransferFrom(owner.address, user2.address, 0, 10, "0x")
      ).to.be.reverted;
    });

    it("should support balanceOfBatch", async function () {
      await token.createAsset("commodity", "C", "ipfs://c", ethers.parseEther("500"), 200, oracle.address);
      const balances = await token.balanceOfBatch(
        [owner.address, owner.address], [0, 1]
      );
      expect(balances[0]).to.equal(100);
      expect(balances[1]).to.equal(200);
    });
  });

  describe("Edge Cases", function () {
    it("should handle large supply values", async function () {
      const largeSupply = ethers.parseEther("1000000000"); // 1B tokens
      await token.createAsset("real_estate", "L", "ipfs://l", ethers.parseEther("1"), largeSupply, oracle.address);
      expect(await token.balanceOf(owner.address, 0)).to.equal(largeSupply);
    });

    it("should handle max uint256 value", async function () {
      const maxVal = ethers.MaxUint256;
      await token.createAsset("real_estate", "M", "ipfs://m", maxVal, 1, oracle.address);
      const asset = await token.getAsset(0);
      expect(asset.totalValue).to.equal(maxVal);
    });

    it("should handle empty strings for metadata", async function () {
      await token.createAsset("", "", "", 0, 1, oracle.address);
      const asset = await token.getAsset(0);
      expect(asset.assetType).to.equal("");
      expect(asset.description).to.equal("");
    });

    it("should handle zero address oracle", async function () {
      await token.createAsset("real_estate", "Z", "ipfs://z", ethers.parseEther("100"), 10, ethers.ZeroAddress);
      expect(await token.assetOracle(0)).to.equal(ethers.ZeroAddress);
    });

    it("should create many assets sequentially", async function () {
      for (let i = 0; i < 10; i++) {
        await token.createAsset(`type_${i}`, `desc_${i}`, `ipfs://${i}`, BigInt(i + 1) * ethers.parseEther("1000"), 100, oracle.address);
      }
      expect(await token.nextTokenId()).to.equal(10);
      const asset5 = await token.getAsset(5);
      expect(asset5.assetType).to.equal("type_5");
    });
  });
});
