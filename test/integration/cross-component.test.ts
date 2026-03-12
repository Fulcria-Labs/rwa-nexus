import { ConsensusEngine } from '../../src/oracle/consensus';
import { PropertyAgent } from '../../src/agents/property-agent';
import { CommodityAgent } from '../../src/agents/commodity-agent';
import { TreasuryAgent } from '../../src/agents/treasury-agent';
import { ChainBridge } from '../../src/oracle/chain-bridge';
import { RWAMCPServer } from '../../src/mcp/server';
import { Dashboard } from '../../src/dashboard/server';
import { AssetClass, AssetData, ConsensusResult } from '../../src/types';

describe('Cross-Component Integration', () => {
  let engine: ConsensusEngine;

  beforeEach(() => {
    engine = new ConsensusEngine();
    engine.registerAgent(new PropertyAgent());
    engine.registerAgent(new CommodityAgent());
    engine.registerAgent(new TreasuryAgent());
  });

  describe('MCP -> Consensus -> ChainBridge pipeline', () => {
    it('should convert MCP valuate result to chain submission', async () => {
      const server = new RWAMCPServer({ consensusEngine: engine });
      const bridge = new ChainBridge({
        rpcUrl: 'http://localhost:8545',
        oracleAddress: '0x' + '1'.repeat(40),
      });

      const consensus = await server.handleToolCall('valuate_asset', {
        id: 'pipe-gold',
        assetClass: AssetClass.COMMODITY,
        name: 'Gold',
        metadata: { commodity: 'gold', quantity: 50 },
      }) as ConsensusResult;

      const submission = bridge.toSubmission(consensus);
      expect(submission.value).toBeGreaterThan(0n);
      expect(submission.confidence).toBeGreaterThan(0);
      expect(submission.assetId).toBe('pipe-gold');
    });

    it('should pipeline property valuation through all components', async () => {
      const server = new RWAMCPServer({ consensusEngine: engine });
      const bridge = new ChainBridge({
        rpcUrl: 'http://localhost:8545',
        oracleAddress: '0x' + '1'.repeat(40),
      });

      const consensus = await server.handleToolCall('valuate_asset', {
        id: 'pipe-prop',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Manhattan Apt',
        location: 'manhattan',
        metadata: { squareFeet: 1500, condition: 'excellent', annualRent: 120000 },
      }) as ConsensusResult;

      // Verify consensus is meaningful
      expect(consensus.consensusValue).toBeGreaterThan(1000000);
      expect(consensus.avgConfidence).toBeGreaterThan(0.5);

      // Verify chain conversion
      const submission = bridge.toSubmission(consensus);
      expect(submission.value).toBeGreaterThan(0n);
      expect(submission.confidence).toBeGreaterThan(5000);
    });

    it('should pipeline treasury valuation through all components', async () => {
      const server = new RWAMCPServer({ consensusEngine: engine });
      const bridge = new ChainBridge({
        rpcUrl: 'http://localhost:8545',
        oracleAddress: '0x' + '1'.repeat(40),
      });

      const consensus = await server.handleToolCall('valuate_asset', {
        id: 'pipe-bond',
        assetClass: AssetClass.TREASURY,
        name: 'US Treasury 10Y',
        metadata: {
          bondType: 'us_treasury',
          maturityYears: 10,
          couponRate: 0.045,
          faceValue: 100000,
          creditRating: 'AAA',
        },
      }) as ConsensusResult;

      const submission = bridge.toSubmission(consensus);
      expect(submission.value).toBeGreaterThan(0n);
      expect(submission.confidence).toBeGreaterThan(8000);
    });
  });

  describe('multi-asset portfolio through MCP', () => {
    it('should build diversified portfolio and verify total value', async () => {
      const server = new RWAMCPServer({ consensusEngine: engine });

      const assets = [
        {
          id: 'div-prop',
          assetClass: AssetClass.REAL_ESTATE,
          name: 'NYC Property',
          location: 'manhattan',
          metadata: { squareFeet: 2000, condition: 'good' },
        },
        {
          id: 'div-gold',
          assetClass: AssetClass.COMMODITY,
          name: 'Gold Reserve',
          metadata: { commodity: 'gold', quantity: 100 },
        },
        {
          id: 'div-silver',
          assetClass: AssetClass.COMMODITY,
          name: 'Silver Holdings',
          metadata: { commodity: 'silver', quantity: 5000 },
        },
        {
          id: 'div-bond',
          assetClass: AssetClass.TREASURY,
          name: 'Treasury Bond',
          metadata: { maturityYears: 10, couponRate: 0.04, faceValue: 100000 },
        },
      ];

      for (const asset of assets) {
        await server.handleToolCall('valuate_asset', asset as any);
      }

      const portfolio = await server.handleToolCall('portfolio_summary', {}) as any;
      expect(portfolio.assetCount).toBe(4);
      expect(portfolio.totalValue).toBeGreaterThan(0);

      // Each asset should have non-zero value
      for (const asset of portfolio.assets) {
        expect(asset.value).toBeGreaterThan(0);
        expect(asset.confidence).toBeGreaterThan(0);
        expect(asset.lastUpdated).toBeTruthy();
      }
    });

    it('should update portfolio when re-valuating asset', async () => {
      const server = new RWAMCPServer({ consensusEngine: engine });

      // Initial valuation
      await server.handleToolCall('valuate_asset', {
        id: 'revalue',
        assetClass: AssetClass.COMMODITY,
        name: 'Gold',
        metadata: { commodity: 'gold', quantity: 10 },
      });

      const initial = await server.handleToolCall('portfolio_summary', {}) as any;
      const initialValue = initial.totalValue;

      // Re-valuate with higher quantity
      await server.handleToolCall('valuate_asset', {
        id: 'revalue',
        assetClass: AssetClass.COMMODITY,
        name: 'Gold Updated',
        metadata: { commodity: 'gold', quantity: 100 },
      });

      const updated = await server.handleToolCall('portfolio_summary', {}) as any;
      expect(updated.assetCount).toBe(1); // Same asset, overwritten
      expect(updated.totalValue).toBeGreaterThan(initialValue);
    });
  });

  describe('consensus with multiple agents for same class', () => {
    it('should reach consensus with 2 property agents', async () => {
      const multiEngine = new ConsensusEngine();
      multiEngine.registerAgent(new PropertyAgent());
      multiEngine.registerAgent(new PropertyAgent()); // duplicate

      const asset: AssetData = {
        id: 'multi-prop',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Property',
        description: '',
        location: 'manhattan',
        metadata: { squareFeet: 2000 },
      };

      const result = await multiEngine.evaluateAsset(asset);
      expect(result.valuations).toHaveLength(2);
      // Both agents produce same value, so consensus equals that value
      expect(result.valuations[0].value).toBe(result.valuations[1].value);
    });

    it('should reach consensus with 3 commodity agents', async () => {
      const multiEngine = new ConsensusEngine();
      multiEngine.registerAgent(new CommodityAgent());
      multiEngine.registerAgent(new CommodityAgent());
      multiEngine.registerAgent(new CommodityAgent());

      const asset: AssetData = {
        id: 'multi-com',
        assetClass: AssetClass.COMMODITY,
        name: 'Gold',
        description: '',
        metadata: { commodity: 'gold', quantity: 10 },
      };

      const result = await multiEngine.evaluateAsset(asset);
      expect(result.valuations).toHaveLength(3);
      expect(result.avgConfidence).toBeGreaterThan(0);
    });
  });

  describe('dashboard data consistency', () => {
    let dashboard: Dashboard;
    const dashPort = 7300 + Math.floor(Math.random() * 100);

    afterEach(() => {
      dashboard?.stop();
    });

    it('should reflect portfolio data accurately', async () => {
      dashboard = new Dashboard({ consensusEngine: engine, port: dashPort });

      const asset: AssetData = {
        id: 'dash-gold',
        assetClass: AssetClass.COMMODITY,
        name: 'Gold',
        description: '',
        metadata: { commodity: 'gold', quantity: 10 },
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
      expect(data.portfolio[0].id).toBe('dash-gold');
      expect(data.portfolio[0].value).toBe(consensus.consensusValue);
    });
  });

  describe('valuation determinism', () => {
    it('should produce same value for same property input', async () => {
      const asset: AssetData = {
        id: 'determ-1',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Property',
        description: '',
        location: 'miami',
        metadata: { squareFeet: 2000, condition: 'good' },
      };

      const r1 = await engine.evaluateAsset(asset);
      const r2 = await engine.evaluateAsset(asset);
      expect(r1.consensusValue).toBe(r2.consensusValue);
    });

    it('should produce same value for same commodity input', async () => {
      const asset: AssetData = {
        id: 'determ-2',
        assetClass: AssetClass.COMMODITY,
        name: 'Gold',
        description: '',
        metadata: { commodity: 'gold', quantity: 10 },
      };

      const r1 = await engine.evaluateAsset(asset);
      const r2 = await engine.evaluateAsset(asset);
      expect(r1.consensusValue).toBe(r2.consensusValue);
    });

    it('should produce same value for same treasury input', async () => {
      const asset: AssetData = {
        id: 'determ-3',
        assetClass: AssetClass.TREASURY,
        name: 'Bond',
        description: '',
        metadata: { maturityYears: 10, couponRate: 0.04, faceValue: 1000 },
      };

      const r1 = await engine.evaluateAsset(asset);
      const r2 = await engine.evaluateAsset(asset);
      expect(r1.consensusValue).toBe(r2.consensusValue);
    });
  });

  describe('concurrent valuations across asset classes', () => {
    it('should handle 20 parallel valuations across all asset classes', async () => {
      const promises = [];

      for (let i = 0; i < 7; i++) {
        promises.push(engine.evaluateAsset({
          id: `par-prop-${i}`,
          assetClass: AssetClass.REAL_ESTATE,
          name: `Property ${i}`,
          description: '',
          location: 'miami',
          metadata: { squareFeet: 1000 + i * 100 },
        }));
      }

      for (let i = 0; i < 7; i++) {
        promises.push(engine.evaluateAsset({
          id: `par-com-${i}`,
          assetClass: AssetClass.COMMODITY,
          name: `Gold ${i}`,
          description: '',
          metadata: { commodity: 'gold', quantity: i + 1 },
        }));
      }

      for (let i = 0; i < 6; i++) {
        promises.push(engine.evaluateAsset({
          id: `par-bond-${i}`,
          assetClass: AssetClass.TREASURY,
          name: `Bond ${i}`,
          description: '',
          metadata: { maturityYears: i + 1, couponRate: 0.04, faceValue: 1000 },
        }));
      }

      const results = await Promise.all(promises);
      expect(results).toHaveLength(20);

      for (const result of results) {
        expect(result.consensusValue).toBeGreaterThan(0);
        expect(result.valuations.length).toBeGreaterThan(0);
      }
    });
  });

  describe('MCP tool call ordering independence', () => {
    it('should allow list_agents before any valuations', async () => {
      const server = new RWAMCPServer({ consensusEngine: engine });
      const agents = await server.handleToolCall('list_agents', {});
      expect(Array.isArray(agents)).toBe(true);
    });

    it('should allow portfolio_summary before any valuations', async () => {
      const server = new RWAMCPServer({ consensusEngine: engine });
      const portfolio = await server.handleToolCall('portfolio_summary', {}) as any;
      expect(portfolio.assetCount).toBe(0);
    });

    it('should allow get_price before valuate_asset', async () => {
      const server = new RWAMCPServer({ consensusEngine: engine });
      const result = await server.handleToolCall('get_price', { assetId: 'nonexistent' });
      expect(result).toHaveProperty('error');
    });

    it('should allow submit_onchain before valuate_asset', async () => {
      const server = new RWAMCPServer({ consensusEngine: engine });
      const result = await server.handleToolCall('submit_onchain', { assetId: 'nonexistent' });
      expect(result).toHaveProperty('error');
    });
  });

  describe('value consistency across pipeline', () => {
    it('should maintain value from consensus through chain bridge conversion', async () => {
      const asset: AssetData = {
        id: 'consistency-test',
        assetClass: AssetClass.COMMODITY,
        name: 'Gold',
        description: '',
        metadata: { commodity: 'gold', quantity: 10, grade: 'premium' },
      };

      const consensus = await engine.evaluateAsset(asset);
      const bridge = new ChainBridge({
        rpcUrl: 'http://localhost:8545',
        oracleAddress: '0x' + '1'.repeat(40),
      });
      const submission = bridge.toSubmission(consensus);

      // Verify the chain value represents the consensus value in 18 decimals
      const expectedChainValue = BigInt(Math.round(consensus.consensusValue * 100)) * 10000000000000000n;
      expect(submission.value).toBe(expectedChainValue);
    });
  });
});
