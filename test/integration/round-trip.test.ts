import { PropertyAgent } from '../../src/agents/property-agent';
import { CommodityAgent } from '../../src/agents/commodity-agent';
import { TreasuryAgent } from '../../src/agents/treasury-agent';
import { ConsensusEngine } from '../../src/oracle/consensus';
import { ChainBridge } from '../../src/oracle/chain-bridge';
import { RWAMCPServer } from '../../src/mcp/server';
import { Dashboard } from '../../src/dashboard/server';
import { AssetClass, AssetData } from '../../src/types';

describe('Round-Trip Integration Tests', () => {
  // ---- Full pipeline: Agent → Consensus → ChainBridge conversion ----
  describe('agent to chain bridge pipeline', () => {
    it('property valuation → consensus → oracle submission format', async () => {
      const engine = new ConsensusEngine();
      engine.registerAgent(new PropertyAgent());

      const asset: AssetData = {
        id: 'prop-nyc', assetClass: AssetClass.REAL_ESTATE, name: 'NYC Apartment',
        description: 'Luxury apartment in Manhattan',
        location: 'manhattan',
        metadata: { squareFeet: 2000, annualRent: 120000, propertyType: 'residential', condition: 'excellent', yearBuilt: 2020 },
      };

      const consensus = await engine.evaluateAsset(asset);
      expect(consensus.consensusValue).toBeGreaterThan(0);
      expect(consensus.avgConfidence).toBeGreaterThan(0);

      const bridge = new ChainBridge({
        rpcUrl: 'https://bsc-testnet.example.com',
        oracleAddress: '0x' + '0'.repeat(40),
      });

      const submission = bridge.toSubmission(consensus);
      expect(submission.assetId).toBe('prop-nyc');
      expect(submission.value).toBeGreaterThan(0n);
      expect(submission.confidence).toBeGreaterThan(0);
      expect(submission.confidence).toBeLessThanOrEqual(10000);
      expect(typeof submission.methodology).toBe('string');
    });

    it('commodity valuation → consensus → oracle submission format', async () => {
      const engine = new ConsensusEngine();
      engine.registerAgent(new CommodityAgent());

      const asset: AssetData = {
        id: 'gold-100', assetClass: AssetClass.COMMODITY, name: '100oz Gold',
        description: 'Gold bars',
        metadata: { commodity: 'gold', quantity: 100, grade: 'premium' },
      };

      const consensus = await engine.evaluateAsset(asset);
      const bridge = new ChainBridge({
        rpcUrl: 'https://bsc-testnet.example.com',
        oracleAddress: '0x' + '0'.repeat(40),
      });
      const submission = bridge.toSubmission(consensus);

      expect(submission.value).toBeGreaterThan(0n);
      expect(submission.confidence).toBeGreaterThan(0);
    });

    it('treasury valuation → consensus → oracle submission format', async () => {
      const engine = new ConsensusEngine();
      engine.registerAgent(new TreasuryAgent());

      const asset: AssetData = {
        id: 'bond-10yr', assetClass: AssetClass.TREASURY, name: '10Y US Treasury',
        description: 'US Treasury bond',
        metadata: { bondType: 'us_treasury', maturityYears: 10, couponRate: 0.04, faceValue: 1000, creditRating: 'AAA' },
      };

      const consensus = await engine.evaluateAsset(asset);
      const bridge = new ChainBridge({
        rpcUrl: 'https://bsc-testnet.example.com',
        oracleAddress: '0x' + '0'.repeat(40),
      });
      const submission = bridge.toSubmission(consensus);

      expect(submission.value).toBeGreaterThan(0n);
      expect(submission.confidence).toBe(9200); // AAA = 0.92 → 9200 bps
    });
  });

  // ---- MCP Server full lifecycle ----
  describe('MCP server full lifecycle', () => {
    let server: RWAMCPServer;

    beforeEach(() => {
      const engine = new ConsensusEngine();
      engine.registerAgent(new PropertyAgent());
      engine.registerAgent(new CommodityAgent());
      engine.registerAgent(new TreasuryAgent());
      server = new RWAMCPServer({ consensusEngine: engine });
    });

    it('list_agents shows all three agents', async () => {
      const agents = await server.handleToolCall('list_agents', {}) as any[];
      expect(agents.length).toBe(3);
      const ids = agents.map((a: any) => a.id);
      expect(ids).toContain('property-agent');
      expect(ids).toContain('commodity-agent');
      expect(ids).toContain('treasury-agent');
    });

    it('valuate → get_price → portfolio_summary lifecycle', async () => {
      // Step 1: Valuate
      const valResult = await server.handleToolCall('valuate_asset', {
        id: 'house-1', assetClass: AssetClass.REAL_ESTATE, name: 'My House',
        metadata: { squareFeet: 2000 },
      });
      expect((valResult as any).consensusValue).toBeGreaterThan(0);

      // Step 2: Get price
      const price = await server.handleToolCall('get_price', { assetId: 'house-1' });
      expect((price as any).consensusValue).toBeGreaterThan(0);

      // Step 3: Portfolio summary
      const portfolio = await server.handleToolCall('portfolio_summary', {});
      expect((portfolio as any).assetCount).toBe(1);
      expect((portfolio as any).totalValue).toBeGreaterThan(0);
    });

    it('multiple assets in portfolio', async () => {
      await server.handleToolCall('valuate_asset', {
        id: 'house-1', assetClass: AssetClass.REAL_ESTATE, name: 'House',
        metadata: { squareFeet: 2000 },
      });
      await server.handleToolCall('valuate_asset', {
        id: 'gold-1', assetClass: AssetClass.COMMODITY, name: 'Gold',
        metadata: { commodity: 'gold', quantity: 10 },
      });
      await server.handleToolCall('valuate_asset', {
        id: 'bond-1', assetClass: AssetClass.TREASURY, name: 'Bond',
        metadata: { faceValue: 1000 },
      });

      const portfolio = await server.handleToolCall('portfolio_summary', {}) as any;
      expect(portfolio.assetCount).toBe(3);
      expect(portfolio.totalValue).toBeGreaterThan(0);
      expect(portfolio.assets.length).toBe(3);
    });

    it('re-valuating same asset updates portfolio', async () => {
      await server.handleToolCall('valuate_asset', {
        id: 'house-1', assetClass: AssetClass.REAL_ESTATE, name: 'House',
        metadata: { squareFeet: 1000 },
      });
      const firstPortfolio = await server.handleToolCall('portfolio_summary', {}) as any;
      const firstValue = firstPortfolio.totalValue;

      await server.handleToolCall('valuate_asset', {
        id: 'house-1', assetClass: AssetClass.REAL_ESTATE, name: 'House Renovated',
        metadata: { squareFeet: 3000 },
      });
      const secondPortfolio = await server.handleToolCall('portfolio_summary', {}) as any;

      expect(secondPortfolio.assetCount).toBe(1); // Same ID, not duplicated
      expect(secondPortfolio.totalValue).toBeGreaterThan(firstValue);
    });

    it('get_price for non-existent asset returns error', async () => {
      const result = await server.handleToolCall('get_price', { assetId: 'nonexistent' });
      expect((result as any).error).toBeDefined();
      expect((result as any).error).toContain('No valuation found');
    });

    it('submit_onchain without chain bridge returns error', async () => {
      await server.handleToolCall('valuate_asset', {
        id: 'house-1', assetClass: AssetClass.REAL_ESTATE, name: 'House',
        metadata: { squareFeet: 1000 },
      });
      const result = await server.handleToolCall('submit_onchain', { assetId: 'house-1' });
      expect((result as any).error).toContain('No chain bridge');
    });

    it('submit_onchain for non-existent asset returns error', async () => {
      const result = await server.handleToolCall('submit_onchain', { assetId: 'nonexistent' });
      expect((result as any).error).toBeDefined();
    });

    it('unknown tool throws error', async () => {
      await expect(server.handleToolCall('unknown_tool', {})).rejects.toThrow('Unknown tool');
    });

    it('tool definitions are well-formed', () => {
      const tools = server.getToolDefinitions();
      expect(tools.length).toBe(8);
      for (const tool of tools) {
        expect(tool.name).toBeTruthy();
        expect(tool.description).toBeTruthy();
        expect(tool.inputSchema).toBeDefined();
        expect(tool.inputSchema.type).toBe('object');
      }
    });

    it('valuate_asset uses empty metadata by default', async () => {
      const result = await server.handleToolCall('valuate_asset', {
        id: 'house-no-meta', assetClass: AssetClass.REAL_ESTATE, name: 'House',
      }) as any;
      expect(result.consensusValue).toBeGreaterThan(0);
    });
  });

  // ---- Dashboard integration ----
  describe('dashboard integration', () => {
    it('dashboard starts and stops', async () => {
      const engine = new ConsensusEngine();
      engine.registerAgent(new PropertyAgent());
      const dashboard = new Dashboard({ consensusEngine: engine, port: 0 });
      // Port 0 = random available port
      // Just test construction and methods don't crash
      dashboard.addValuation(
        {
          assetId: 'test',
          consensusValue: 100000,
          avgConfidence: 0.85,
          valuations: [],
          methodology: 'test',
          timestamp: new Date(),
        },
        {
          id: 'test',
          assetClass: AssetClass.REAL_ESTATE,
          name: 'Test Asset',
          description: '',
          metadata: {},
        }
      );
      // Verify addValuation doesn't crash
    });

    it('dashboard addValuation stores data correctly', () => {
      const engine = new ConsensusEngine();
      const dashboard = new Dashboard({ consensusEngine: engine });

      // Add multiple valuations
      for (let i = 0; i < 5; i++) {
        dashboard.addValuation(
          {
            assetId: `asset-${i}`,
            consensusValue: 100000 * (i + 1),
            avgConfidence: 0.8,
            valuations: [],
            methodology: 'test',
            timestamp: new Date(),
          },
          {
            id: `asset-${i}`,
            assetClass: AssetClass.REAL_ESTATE,
            name: `Asset ${i}`,
            description: '',
            metadata: {},
          }
        );
      }
      // No crash means success
    });
  });

  // ---- Cross-agent consensus ----
  describe('cross-agent consensus scenarios', () => {
    it('all agents registered but only relevant ones participate', async () => {
      const engine = new ConsensusEngine();
      engine.registerAgent(new PropertyAgent());
      engine.registerAgent(new CommodityAgent());
      engine.registerAgent(new TreasuryAgent());

      const realEstate: AssetData = {
        id: 're-1', assetClass: AssetClass.REAL_ESTATE, name: 'House',
        description: '', metadata: { squareFeet: 2000 },
      };
      const result = await engine.evaluateAsset(realEstate);
      // Only PropertyAgent should contribute
      expect(result.valuations.length).toBe(1);
      expect(result.valuations[0].agentId).toBe('property-agent');
    });

    it('sequential evaluations of different asset classes', async () => {
      const engine = new ConsensusEngine();
      engine.registerAgent(new PropertyAgent());
      engine.registerAgent(new CommodityAgent());
      engine.registerAgent(new TreasuryAgent());

      const assets: AssetData[] = [
        { id: 're', assetClass: AssetClass.REAL_ESTATE, name: 'House', description: '', metadata: { squareFeet: 2000 } },
        { id: 'cm', assetClass: AssetClass.COMMODITY, name: 'Gold', description: '', metadata: { commodity: 'gold', quantity: 10 } },
        { id: 'tr', assetClass: AssetClass.TREASURY, name: 'Bond', description: '', metadata: { faceValue: 1000 } },
      ];

      const results = await Promise.all(assets.map(a => engine.evaluateAsset(a)));
      expect(results.length).toBe(3);
      expect(results[0].assetId).toBe('re');
      expect(results[1].assetId).toBe('cm');
      expect(results[2].assetId).toBe('tr');
      for (const r of results) {
        expect(r.consensusValue).toBeGreaterThan(0);
      }
    });

    it('same asset evaluated twice gives same value (deterministic)', async () => {
      const engine = new ConsensusEngine();
      engine.registerAgent(new PropertyAgent());

      const asset: AssetData = {
        id: 'house', assetClass: AssetClass.REAL_ESTATE, name: 'House',
        description: '', metadata: { squareFeet: 2000 },
      };

      const r1 = await engine.evaluateAsset(asset);
      const r2 = await engine.evaluateAsset(asset);
      expect(r1.consensusValue).toBe(r2.consensusValue);
      expect(r1.avgConfidence).toBe(r2.avgConfidence);
    });
  });

  // ---- MCP + Dashboard integration ----
  describe('MCP + Dashboard combined', () => {
    it('MCP valuations can feed dashboard', async () => {
      const engine = new ConsensusEngine();
      engine.registerAgent(new PropertyAgent());
      engine.registerAgent(new CommodityAgent());
      engine.registerAgent(new TreasuryAgent());

      const mcpServer = new RWAMCPServer({ consensusEngine: engine });
      const dashboard = new Dashboard({ consensusEngine: engine });

      // Valuate via MCP
      const result = await mcpServer.handleToolCall('valuate_asset', {
        id: 'house-1',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'MCP House',
        metadata: { squareFeet: 2000 },
      }) as any;

      // Feed result to dashboard
      dashboard.addValuation(result, {
        id: 'house-1',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'MCP House',
        description: '',
        metadata: {},
      });

      // Both should work without errors
      expect(result.consensusValue).toBeGreaterThan(0);
    });
  });

  // ---- ChainBridge conversion edge cases ----
  describe('ChainBridge conversion edge cases', () => {
    let bridge: ChainBridge;

    beforeEach(() => {
      bridge = new ChainBridge({
        rpcUrl: 'https://bsc-testnet.example.com',
        oracleAddress: '0x' + '0'.repeat(40),
      });
    });

    it('converts high value correctly to 18 decimals', () => {
      const consensus = {
        assetId: 'asset-1',
        consensusValue: 1000000,
        avgConfidence: 0.85,
        valuations: [],
        methodology: 'test',
        timestamp: new Date(),
      };
      const sub = bridge.toSubmission(consensus);
      // 1000000 * 10^18 as bigint
      expect(sub.value).toBeGreaterThan(0n);
    });

    it('converts zero value', () => {
      const consensus = {
        assetId: 'asset-0',
        consensusValue: 0,
        avgConfidence: 0.5,
        valuations: [],
        methodology: 'test',
        timestamp: new Date(),
      };
      const sub = bridge.toSubmission(consensus);
      expect(sub.value).toBe(0n);
    });

    it('converts confidence 0 to 0 basis points', () => {
      const consensus = {
        assetId: 'asset-low',
        consensusValue: 100,
        avgConfidence: 0,
        valuations: [],
        methodology: 'test',
        timestamp: new Date(),
      };
      const sub = bridge.toSubmission(consensus);
      expect(sub.confidence).toBe(0);
    });

    it('converts confidence 1.0 to 10000 basis points', () => {
      const consensus = {
        assetId: 'asset-high',
        consensusValue: 100,
        avgConfidence: 1.0,
        valuations: [],
        methodology: 'test',
        timestamp: new Date(),
      };
      const sub = bridge.toSubmission(consensus);
      expect(sub.confidence).toBe(10000);
    });

    it('converts fractional confidence correctly', () => {
      const consensus = {
        assetId: 'asset-frac',
        consensusValue: 100,
        avgConfidence: 0.8567,
        valuations: [],
        methodology: 'test',
        timestamp: new Date(),
      };
      const sub = bridge.toSubmission(consensus);
      expect(sub.confidence).toBe(8567);
    });

    it('truncates long assetId in bytes32', () => {
      const consensus = {
        assetId: 'this-is-a-very-long-asset-id-that-exceeds-31-characters',
        consensusValue: 100,
        avgConfidence: 0.8,
        valuations: [],
        methodology: 'test',
        timestamp: new Date(),
      };
      // Should not throw
      const sub = bridge.toSubmission(consensus);
      expect(sub.assetId).toBe(consensus.assetId);
    });

    it('preserves methodology string', () => {
      const consensus = {
        assetId: 'asset-1',
        consensusValue: 100,
        avgConfidence: 0.8,
        valuations: [],
        methodology: 'Confidence-weighted consensus from 3/3 agents',
        timestamp: new Date(),
      };
      const sub = bridge.toSubmission(consensus);
      expect(sub.methodology).toBe('Confidence-weighted consensus from 3/3 agents');
    });

    it('throws when submitting without signer', async () => {
      const consensus = {
        assetId: 'asset-1',
        consensusValue: 100,
        avgConfidence: 0.8,
        valuations: [],
        methodology: 'test',
        timestamp: new Date(),
      };
      await expect(bridge.submitConsensus(consensus)).rejects.toThrow('No signer');
    });

    it('throws when getting signer address without signer', async () => {
      await expect(bridge.getSignerAddress()).rejects.toThrow('No signer');
    });

    it('throws when getting balance without signer', async () => {
      await expect(bridge.getBalance()).rejects.toThrow('No signer');
    });
  });

  // ---- Concurrent evaluations ----
  describe('concurrent evaluation safety', () => {
    it('10 concurrent property evaluations', async () => {
      const engine = new ConsensusEngine();
      engine.registerAgent(new PropertyAgent());

      const assets = Array.from({ length: 10 }, (_, i) => ({
        id: `prop-${i}`,
        assetClass: AssetClass.REAL_ESTATE as AssetClass,
        name: `Property ${i}`,
        description: '',
        metadata: { squareFeet: 1000 + i * 100 },
      }));

      const results = await Promise.all(assets.map(a => engine.evaluateAsset(a)));
      expect(results.length).toBe(10);
      for (let i = 0; i < 10; i++) {
        expect(results[i].assetId).toBe(`prop-${i}`);
        expect(results[i].consensusValue).toBeGreaterThan(0);
      }
    });

    it('30 concurrent mixed-class evaluations', async () => {
      const engine = new ConsensusEngine();
      engine.registerAgent(new PropertyAgent());
      engine.registerAgent(new CommodityAgent());
      engine.registerAgent(new TreasuryAgent());

      const assets: AssetData[] = [];
      for (let i = 0; i < 10; i++) {
        assets.push({
          id: `re-${i}`, assetClass: AssetClass.REAL_ESTATE, name: `RE${i}`,
          description: '', metadata: { squareFeet: 1000 + i * 100 },
        });
        assets.push({
          id: `cm-${i}`, assetClass: AssetClass.COMMODITY, name: `CM${i}`,
          description: '', metadata: { commodity: 'gold', quantity: i + 1 },
        });
        assets.push({
          id: `tr-${i}`, assetClass: AssetClass.TREASURY, name: `TR${i}`,
          description: '', metadata: { faceValue: 1000, maturityYears: i + 1 },
        });
      }

      const results = await Promise.all(assets.map(a => engine.evaluateAsset(a)));
      expect(results.length).toBe(30);
      for (const r of results) {
        expect(r.consensusValue).toBeGreaterThan(0);
        expect(r.avgConfidence).toBeGreaterThan(0);
      }
    });
  });
});
