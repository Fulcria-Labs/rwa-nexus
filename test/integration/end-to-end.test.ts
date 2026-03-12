import { ConsensusEngine } from '../../src/oracle/consensus';
import { PropertyAgent } from '../../src/agents/property-agent';
import { CommodityAgent } from '../../src/agents/commodity-agent';
import { TreasuryAgent } from '../../src/agents/treasury-agent';
import { ChainBridge } from '../../src/oracle/chain-bridge';
import { RWAMCPServer } from '../../src/mcp/server';
import { Dashboard } from '../../src/dashboard/server';
import { AssetClass, AssetData } from '../../src/types';

describe('Integration Tests', () => {
  let engine: ConsensusEngine;
  let propertyAgent: PropertyAgent;
  let commodityAgent: CommodityAgent;
  let treasuryAgent: TreasuryAgent;

  beforeEach(() => {
    engine = new ConsensusEngine();
    propertyAgent = new PropertyAgent();
    commodityAgent = new CommodityAgent();
    treasuryAgent = new TreasuryAgent();
    engine.registerAgent(propertyAgent);
    engine.registerAgent(commodityAgent);
    engine.registerAgent(treasuryAgent);
  });

  describe('Agent → Consensus → ChainBridge pipeline', () => {
    it('should valuate property and convert for chain submission', async () => {
      const asset: AssetData = {
        id: 'pipeline-prop',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Pipeline Property',
        description: 'Integration test property',
        location: 'manhattan',
        metadata: { squareFeet: 2000, condition: 'good', annualRent: 120000 },
      };

      // Step 1: Evaluate asset
      const consensus = await engine.evaluateAsset(asset);
      expect(consensus.consensusValue).toBeGreaterThan(0);
      expect(consensus.valuations).toHaveLength(1); // Only PropertyAgent can valuate

      // Step 2: Convert to chain submission
      const bridge = new ChainBridge({
        rpcUrl: 'http://localhost:8545',
        oracleAddress: '0x' + '1'.repeat(40),
      });
      const submission = bridge.toSubmission(consensus);

      expect(submission.assetId).toBe('pipeline-prop');
      expect(submission.value).toBeGreaterThan(0n);
      expect(submission.confidence).toBeGreaterThan(0);
      expect(submission.confidence).toBeLessThanOrEqual(10000);
    });

    it('should valuate commodity and convert for chain submission', async () => {
      const asset: AssetData = {
        id: 'pipeline-gold',
        assetClass: AssetClass.COMMODITY,
        name: 'Gold Bars',
        description: '',
        metadata: { commodity: 'gold', quantity: 100, grade: 'premium' },
      };

      const consensus = await engine.evaluateAsset(asset);
      expect(consensus.consensusValue).toBeGreaterThan(200000);

      const bridge = new ChainBridge({
        rpcUrl: 'http://localhost:8545',
        oracleAddress: '0x' + '1'.repeat(40),
      });
      const submission = bridge.toSubmission(consensus);
      expect(submission.value).toBeGreaterThan(0n);
    });

    it('should valuate treasury and convert for chain submission', async () => {
      const asset: AssetData = {
        id: 'pipeline-bond',
        assetClass: AssetClass.TREASURY,
        name: '10Y Treasury',
        description: '',
        metadata: {
          bondType: 'us_treasury',
          maturityYears: 10,
          couponRate: 0.045,
          faceValue: 10000,
          creditRating: 'AAA',
        },
      };

      const consensus = await engine.evaluateAsset(asset);
      const bridge = new ChainBridge({
        rpcUrl: 'http://localhost:8545',
        oracleAddress: '0x' + '1'.repeat(40),
      });
      const submission = bridge.toSubmission(consensus);

      expect(submission.value).toBeGreaterThan(0n);
      expect(submission.confidence).toBeGreaterThan(8000); // High confidence for AAA
    });
  });

  describe('MCP Server end-to-end', () => {
    it('should valuate → get_price → portfolio_summary', async () => {
      const server = new RWAMCPServer({ consensusEngine: engine });

      // Step 1: Valuate
      await server.handleToolCall('valuate_asset', {
        id: 'e2e-gold',
        assetClass: AssetClass.COMMODITY,
        name: 'Gold Reserve',
        metadata: { commodity: 'gold', quantity: 50 },
      });

      // Step 2: Get price
      const price = await server.handleToolCall('get_price', { assetId: 'e2e-gold' }) as any;
      expect(price.consensusValue).toBeGreaterThan(100000);

      // Step 3: Portfolio summary
      const portfolio = await server.handleToolCall('portfolio_summary', {}) as any;
      expect(portfolio.assetCount).toBe(1);
      expect(portfolio.totalValue).toBe(price.consensusValue);
    });

    it('should build multi-asset portfolio', async () => {
      const server = new RWAMCPServer({ consensusEngine: engine });

      await server.handleToolCall('valuate_asset', {
        id: 'port-prop',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Manhattan Apartment',
        location: 'manhattan',
        metadata: { squareFeet: 1500 },
      });

      await server.handleToolCall('valuate_asset', {
        id: 'port-gold',
        assetClass: AssetClass.COMMODITY,
        name: 'Gold',
        metadata: { commodity: 'gold', quantity: 20 },
      });

      await server.handleToolCall('valuate_asset', {
        id: 'port-bond',
        assetClass: AssetClass.TREASURY,
        name: 'Treasury Bond',
        metadata: { maturityYears: 5, couponRate: 0.04, faceValue: 100000 },
      });

      const portfolio = await server.handleToolCall('portfolio_summary', {}) as any;
      expect(portfolio.assetCount).toBe(3);
      expect(portfolio.totalValue).toBeGreaterThan(0);
      expect(portfolio.assets).toHaveLength(3);

      // Check each asset class is represented
      const classes = portfolio.assets.map((a: any) => a.assetClass);
      expect(classes).toContain(AssetClass.REAL_ESTATE);
      expect(classes).toContain(AssetClass.COMMODITY);
      expect(classes).toContain(AssetClass.TREASURY);
    });

    it('should update valuation for same asset ID', async () => {
      const server = new RWAMCPServer({ consensusEngine: engine });

      await server.handleToolCall('valuate_asset', {
        id: 'update-test',
        assetClass: AssetClass.COMMODITY,
        name: 'Gold v1',
        metadata: { commodity: 'gold', quantity: 10 },
      });

      const firstPrice = await server.handleToolCall('get_price', { assetId: 'update-test' }) as any;

      await server.handleToolCall('valuate_asset', {
        id: 'update-test',
        assetClass: AssetClass.COMMODITY,
        name: 'Gold v2',
        metadata: { commodity: 'gold', quantity: 100 }, // 10x more
      });

      const secondPrice = await server.handleToolCall('get_price', { assetId: 'update-test' }) as any;

      // Second valuation should be ~10x the first
      expect(secondPrice.consensusValue).toBeGreaterThan(firstPrice.consensusValue * 5);

      // Portfolio should still show 1 asset
      const portfolio = await server.handleToolCall('portfolio_summary', {}) as any;
      expect(portfolio.assetCount).toBe(1);
    });
  });

  describe('Dashboard integration', () => {
    let dashboard: Dashboard;
    const dashPort = 4800 + Math.floor(Math.random() * 200);

    afterEach(() => {
      dashboard?.stop();
    });

    it('should reflect valuations in dashboard API', async () => {
      dashboard = new Dashboard({ consensusEngine: engine, port: dashPort });

      // Add valuations
      const asset: AssetData = {
        id: 'dash-prop',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Dashboard Property',
        description: '',
        location: 'san_francisco',
        metadata: { squareFeet: 3000 },
      };

      const consensus = await engine.evaluateAsset(asset);
      dashboard.addValuation(consensus, asset);

      await dashboard.start();

      const data = await new Promise<any>((resolve, reject) => {
        const http = require('http');
        http.get(`http://localhost:${dashPort}/api/data`, (res: any) => {
          let body = '';
          res.on('data', (chunk: string) => body += chunk);
          res.on('end', () => resolve(JSON.parse(body)));
        }).on('error', reject);
      });

      expect(data.stats.totalAssets).toBe(1);
      expect(data.portfolio[0].name).toBe('Dashboard Property');
      expect(data.portfolio[0].value).toBe(consensus.consensusValue);
    });
  });

  describe('Cross-agent scenarios', () => {
    it('should correctly route each asset class to its agent', async () => {
      const assets: AssetData[] = [
        {
          id: 'route-re',
          assetClass: AssetClass.REAL_ESTATE,
          name: 'Property',
          description: '',
          location: 'miami',
          metadata: { squareFeet: 1000 },
        },
        {
          id: 'route-com',
          assetClass: AssetClass.COMMODITY,
          name: 'Silver',
          description: '',
          metadata: { commodity: 'silver', quantity: 1000 },
        },
        {
          id: 'route-trs',
          assetClass: AssetClass.TREASURY,
          name: 'Bond',
          description: '',
          metadata: { maturityYears: 5, couponRate: 0.04, faceValue: 1000 },
        },
      ];

      const results = await Promise.all(assets.map(a => engine.evaluateAsset(a)));

      // Each result should have exactly 1 valuation (1 agent per class)
      for (const result of results) {
        expect(result.valuations).toHaveLength(1);
        expect(result.consensusValue).toBeGreaterThan(0);
      }

      // Verify correct agent handled each
      expect(results[0].valuations[0].agentId).toBe('property-agent');
      expect(results[1].valuations[0].agentId).toBe('commodity-agent');
      expect(results[2].valuations[0].agentId).toBe('treasury-agent');
    });

    it('should handle concurrent valuations safely', async () => {
      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(
          engine.evaluateAsset({
            id: `concurrent-${i}`,
            assetClass: AssetClass.COMMODITY,
            name: `Gold ${i}`,
            description: '',
            metadata: { commodity: 'gold', quantity: i + 1 },
          })
        );
      }

      const results = await Promise.all(promises);

      // All should succeed
      expect(results).toHaveLength(10);
      for (const result of results) {
        expect(result.consensusValue).toBeGreaterThan(0);
      }

      // Values should scale with quantity
      expect(results[9].consensusValue).toBeGreaterThan(results[0].consensusValue);
    });
  });

  describe('Error propagation', () => {
    it('should propagate unsupported asset class through MCP', async () => {
      const server = new RWAMCPServer({ consensusEngine: engine });

      await expect(
        server.handleToolCall('valuate_asset', {
          id: 'err-equity',
          assetClass: AssetClass.EQUITY,
          name: 'Stock',
          metadata: {},
        })
      ).rejects.toThrow('No agents registered');
    });

    it('should handle MCP tool call for unknown tool', async () => {
      const server = new RWAMCPServer({ consensusEngine: engine });

      await expect(
        server.handleToolCall('unknown_tool', {})
      ).rejects.toThrow('Unknown tool');
    });
  });
});
