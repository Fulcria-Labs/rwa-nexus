import {
  ConsensusEngine,
  PropertyAgent,
  CommodityAgent,
  TreasuryAgent,
  ReceivablesAgent,
  RWAMCPServer,
  Dashboard,
  AssetClass,
  AssetData,
} from '../src';

async function main() {
  console.log('='.repeat(60));
  console.log('  RWA Nexus — AI-Powered Real World Asset Intelligence');
  console.log('  Demo: Multi-Agent Valuation Pipeline');
  console.log('='.repeat(60));
  console.log();

  // Initialize consensus engine with all agents
  const engine = new ConsensusEngine();
  engine.registerAgent(new PropertyAgent());
  engine.registerAgent(new CommodityAgent());
  engine.registerAgent(new TreasuryAgent());
  engine.registerAgent(new ReceivablesAgent());

  console.log(`Registered ${engine.getAgents().length} AI valuation agents:\n`);
  for (const agent of engine.getAgents()) {
    console.log(`  [${agent.config.id}] ${agent.config.name}`);
    console.log(`    Asset classes: ${agent.config.assetClasses.join(', ')}`);
    console.log();
  }

  // Define demo portfolio
  const portfolio: AssetData[] = [
    {
      id: 'manhattan-penthouse',
      assetClass: AssetClass.REAL_ESTATE,
      name: 'Manhattan Penthouse',
      description: '3BR luxury penthouse, Upper East Side',
      location: 'manhattan',
      metadata: {
        squareFeet: 3500,
        annualRent: 240000,
        propertyType: 'residential',
        condition: 'excellent',
        yearBuilt: 2020,
      },
    },
    {
      id: 'hk-commercial',
      assetClass: AssetClass.REAL_ESTATE,
      name: 'Hong Kong Commercial Space',
      description: 'Grade A office in Central',
      location: 'hong_kong',
      metadata: {
        squareFeet: 2000,
        annualRent: 500000,
        propertyType: 'commercial',
        condition: 'good',
        yearBuilt: 2015,
      },
    },
    {
      id: 'gold-reserve',
      assetClass: AssetClass.COMMODITY,
      name: 'Gold Reserve',
      description: '500oz LBMA Good Delivery bars',
      metadata: { commodity: 'gold', quantity: 500, grade: 'premium' },
    },
    {
      id: 'crude-oil-futures',
      assetClass: AssetClass.COMMODITY,
      name: 'Crude Oil Contract',
      description: '10,000 barrels WTI',
      metadata: { commodity: 'crude_oil', quantity: 10000, grade: 'standard' },
    },
    {
      id: 'us-treasury-10y',
      assetClass: AssetClass.TREASURY,
      name: '10Y US Treasury Note',
      description: 'US Government 10-year note',
      metadata: {
        bondType: 'us_treasury',
        maturityYears: 10,
        couponRate: 0.04,
        faceValue: 1000,
        creditRating: 'AAA',
        quantity: 100,
      },
    },
    {
      id: 'corporate-bond-bbb',
      assetClass: AssetClass.TREASURY,
      name: 'Corporate Bond (BBB)',
      description: 'Investment-grade corporate bond',
      metadata: {
        bondType: 'corporate_bbb',
        maturityYears: 5,
        couponRate: 0.06,
        faceValue: 1000,
        creditRating: 'BBB',
        quantity: 50,
      },
    },
    {
      id: 'invoice-pool-tech',
      assetClass: AssetClass.RECEIVABLE,
      name: 'Tech Invoice Pool',
      description: 'Pooled AR from Fortune 500 tech clients',
      metadata: {
        faceValue: 500000,
        daysPastDue: 15,
        creditRating: 'A',
        industry: 'technology',
        paymentHistory: 0.97,
        invoiceCount: 25,
        daysToMaturity: 45,
        recourse: true,
      },
    },
  ];

  // Valuate each asset
  console.log('-'.repeat(60));
  console.log('Running AI Valuations...\n');

  let totalValue = 0;

  for (const asset of portfolio) {
    console.log(`Valuating: ${asset.name} (${asset.assetClass})`);
    const result = await engine.evaluateAsset(asset);

    console.log(`  Value:      $${result.consensusValue.toLocaleString()}`);
    console.log(`  Confidence: ${(result.avgConfidence * 100).toFixed(1)}%`);
    console.log(`  Agents:     ${result.valuations.length}`);
    console.log(`  Method:     ${result.methodology}`);
    console.log();

    totalValue += result.consensusValue;
  }

  console.log('-'.repeat(60));
  console.log(`\nTotal Portfolio Value: $${totalValue.toLocaleString()}`);
  console.log(`Assets Valuated: ${portfolio.length}`);
  console.log();

  // Start dashboard
  const dashboard = new Dashboard({ consensusEngine: engine });
  for (const asset of portfolio) {
    const consensus = await engine.evaluateAsset(asset);
    dashboard.addValuation(consensus, asset);
  }
  try {
    const url = await dashboard.start();
    console.log(`Dashboard running at: ${url}`);
    console.log('Press Ctrl+C to exit.\n');
  } catch (err: any) {
    if (err?.code === 'EADDRINUSE') {
      console.log('Dashboard port in use — skipping dashboard startup.');
      console.log('Run standalone: npm run dashboard\n');
    } else {
      throw err;
    }
  }
}

main().catch(console.error);
