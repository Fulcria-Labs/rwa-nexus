import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying RWA Nexus contracts with account:", deployer.address);
  console.log("Account balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "BNB");

  // 1. Deploy RWAOracle
  console.log("\n--- Deploying RWAOracle ---");
  const RWAOracle = await ethers.getContractFactory("RWAOracle");
  const oracle = await RWAOracle.deploy();
  await oracle.waitForDeployment();
  const oracleAddress = await oracle.getAddress();
  console.log("RWAOracle deployed to:", oracleAddress);

  // 2. Deploy RWAToken
  console.log("\n--- Deploying RWAToken ---");
  const RWAToken = await ethers.getContractFactory("RWAToken");
  const token = await RWAToken.deploy("https://rwa-nexus.fulcria.com/metadata/{id}.json");
  await token.waitForDeployment();
  const tokenAddress = await token.getAddress();
  console.log("RWAToken deployed to:", tokenAddress);

  // 3. Deploy RWALending
  console.log("\n--- Deploying RWALending ---");
  const RWALending = await ethers.getContractFactory("RWALending");
  const lending = await RWALending.deploy(tokenAddress, oracleAddress);
  await lending.waitForDeployment();
  const lendingAddress = await lending.getAddress();
  console.log("RWALending deployed to:", lendingAddress);

  // 4. Configure: authorize deployer as an AI agent on the oracle
  console.log("\n--- Configuring Oracle ---");
  const authTx = await oracle.authorizeAgent(deployer.address);
  await authTx.wait();
  console.log("Deployer authorized as AI agent on oracle");

  // 5. Allow single-agent consensus for demo
  const consensusTx = await oracle.setMinAgentsForConsensus(1);
  await consensusTx.wait();
  console.log("Min agents for consensus set to 1 (demo mode)");

  // 6. Create a sample RWA asset
  console.log("\n--- Creating Sample Assets ---");
  const assets = [
    {
      type: "real_estate",
      description: "Manhattan Penthouse - 5th Avenue, 3200 sqft",
      uri: "ipfs://QmExampleManhattan",
      value: ethers.parseUnits("5760000", 18), // $5.76M
      supply: 1000,
    },
    {
      type: "commodity",
      description: "Gold Reserves - 100 troy oz, LBMA certified",
      uri: "ipfs://QmExampleGold",
      value: ethers.parseUnits("196800", 18), // $196.8K
      supply: 100,
    },
    {
      type: "treasury",
      description: "US Treasury Bond - 10Y, $1M face value",
      uri: "ipfs://QmExampleTreasury",
      value: ethers.parseUnits("985000", 18), // $985K
      supply: 100,
    },
  ];

  for (const asset of assets) {
    const tx = await token.createAsset(
      asset.type,
      asset.description,
      asset.uri,
      asset.value,
      asset.supply,
      oracleAddress
    );
    await tx.wait();
    console.log(`Created ${asset.type} token: ${asset.description}`);
  }

  // 7. Submit sample valuations to oracle
  console.log("\n--- Submitting Sample Valuations ---");
  const assetIds = [
    ethers.id("manhattan-penthouse"),
    ethers.id("gold-reserves-100oz"),
    ethers.id("us-treasury-10y"),
  ];

  const valuations = [
    { value: ethers.parseUnits("5760000", 18), confidence: 8500, method: "comparable_sales+income_cap" },
    { value: ethers.parseUnits("196800", 18), confidence: 9200, method: "spot_price+seasonal_adj" },
    { value: ethers.parseUnits("985000", 18), confidence: 8800, method: "dcf+yield_curve_interpolation" },
  ];

  for (let i = 0; i < assetIds.length; i++) {
    const tx = await oracle.submitValuation(
      assetIds[i],
      valuations[i].value,
      valuations[i].confidence,
      valuations[i].method
    );
    await tx.wait();
    console.log(`Submitted valuation for asset ${i}: $${ethers.formatUnits(valuations[i].value, 18)} (confidence: ${valuations[i].confidence / 100}%)`);
  }

  // 8. Fund the lending pool
  console.log("\n--- Funding Lending Pool ---");
  const fundTx = await deployer.sendTransaction({
    to: lendingAddress,
    value: ethers.parseEther("1.0"),
  });
  await fundTx.wait();
  console.log("Lending pool funded with 1.0 BNB");

  // Summary
  console.log("\n╔════════════════════════════════════════════════╗");
  console.log("║         RWA Nexus Deployment Summary           ║");
  console.log("╠════════════════════════════════════════════════╣");
  console.log(`║ RWAOracle:  ${oracleAddress}  ║`);
  console.log(`║ RWAToken:   ${tokenAddress}  ║`);
  console.log(`║ RWALending: ${lendingAddress}  ║`);
  console.log("╠════════════════════════════════════════════════╣");
  console.log("║ Network:    BSC Testnet (chainId: 97)          ║");
  console.log(`║ Deployer:   ${deployer.address}  ║`);
  console.log("║ Assets:     3 created (real_estate, commodity,  ║");
  console.log("║             treasury)                           ║");
  console.log("║ Valuations: 3 submitted via AI oracle           ║");
  console.log("║ Pool:       1.0 BNB liquidity                  ║");
  console.log("╚════════════════════════════════════════════════╝");

  console.log("\nVerify on BscScan:");
  console.log(`  Oracle:  https://testnet.bscscan.com/address/${oracleAddress}`);
  console.log(`  Token:   https://testnet.bscscan.com/address/${tokenAddress}`);
  console.log(`  Lending: https://testnet.bscscan.com/address/${lendingAddress}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
