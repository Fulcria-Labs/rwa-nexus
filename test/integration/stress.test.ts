import { ConsensusEngine } from '../../src/oracle/consensus';
import { PropertyAgent } from '../../src/agents/property-agent';
import { CommodityAgent } from '../../src/agents/commodity-agent';
import { TreasuryAgent } from '../../src/agents/treasury-agent';
import { ChainBridge } from '../../src/oracle/chain-bridge';
import { RWAMCPServer } from '../../src/mcp/server';
import { Dashboard } from '../../src/dashboard/server';
import { AssetClass, AssetData, ConsensusResult } from '../../src/types';

describe('Stress and Edge Case Integration Tests', () => {
  let engine: ConsensusEngine;

  beforeEach(() => {
    engine = new ConsensusEngine();
    engine.registerAgent(new PropertyAgent());
    engine.registerAgent(new CommodityAgent());
    engine.registerAgent(new TreasuryAgent());
  });

  describe('High-volume concurrent valuations', () => {
    it('should handle 50 concurrent commodity valuations', async () => {
      const commodities = ['gold', 'silver', 'platinum', 'crude_oil', 'copper'];
      const promises = [];

      for (let i = 0; i < 50; i++) {
        promises.push(engine.evaluateAsset({
          id: `stress-${i}`,
          assetClass: AssetClass.COMMODITY,
          name: `Commodity ${i}`,
          description: '',
          metadata: { commodity: commodities[i % commodities.length], quantity: i + 1 },
        }));
      }

      const results = await Promise.all(promises);
      expect(results).toHaveLength(50);
      for (const r of results) {
        expect(r.consensusValue).toBeGreaterThan(0);
      }
    });

    it('should handle 30 concurrent property valuations', async () => {
      const locations = ['manhattan', 'brooklyn', 'miami', 'chicago', 'austin', 'seattle'];
      const promises = [];

      for (let i = 0; i < 30; i++) {
        promises.push(engine.evaluateAsset({
          id: `prop-stress-${i}`,
          assetClass: AssetClass.REAL_ESTATE,
          name: `Property ${i}`,
          description: '',
          location: locations[i % locations.length],
          metadata: { squareFeet: 500 + i * 100 },
        }));
      }

      const results = await Promise.all(promises);
      expect(results).toHaveLength(30);
      for (const r of results) {
        expect(r.consensusValue).toBeGreaterThan(0);
      }
    });

    it('should handle mixed asset class concurrent valuations', async () => {
      const assets: AssetData[] = [
        { id: 'mixed-re', assetClass: AssetClass.REAL_ESTATE, name: 'P1', description: '', location: 'manhattan', metadata: { squareFeet: 2000 } },
        { id: 'mixed-com', assetClass: AssetClass.COMMODITY, name: 'Gold', description: '', metadata: { commodity: 'gold', quantity: 50 } },
        { id: 'mixed-tr', assetClass: AssetClass.TREASURY, name: 'Bond', description: '', metadata: { maturityYears: 10, couponRate: 0.04, faceValue: 10000 } },
        { id: 'mixed-re2', assetClass: AssetClass.REAL_ESTATE, name: 'P2', description: '', location: 'miami', metadata: { squareFeet: 3000 } },
        { id: 'mixed-com2', assetClass: AssetClass.COMMODITY, name: 'Silver', description: '', metadata: { commodity: 'silver', quantity: 1000 } },
      ];

      const results = await Promise.all(assets.map(a => engine.evaluateAsset(a)));
      expect(results).toHaveLength(5);

      // Each should have correct agent
      expect(results[0].valuations[0].agentId).toBe('property-agent');
      expect(results[1].valuations[0].agentId).toBe('commodity-agent');
      expect(results[2].valuations[0].agentId).toBe('treasury-agent');
    });
  });

  describe('MCP Server stress tests', () => {
    it('should handle rapid sequential tool calls', async () => {
      const server = new RWAMCPServer({ consensusEngine: engine });

      for (let i = 0; i < 20; i++) {
        await server.handleToolCall('valuate_asset', {
          id: `rapid-${i}`,
          assetClass: AssetClass.COMMODITY,
          name: `Gold ${i}`,
          metadata: { commodity: 'gold', quantity: i + 1 },
        });
      }

      const portfolio = await server.handleToolCall('portfolio_summary', {}) as any;
      expect(portfolio.assetCount).toBe(20);
      expect(portfolio.totalValue).toBeGreaterThan(0);
    });

    it('should handle get_price for non-existent asset', async () => {
      const server = new RWAMCPServer({ consensusEngine: engine });
      const result = await server.handleToolCall('get_price', { assetId: 'does-not-exist' }) as any;
      expect(result.error).toBeDefined();
      expect(result.error).toContain('does-not-exist');
    });

    it('should handle submit_onchain without chain bridge', async () => {
      const server = new RWAMCPServer({ consensusEngine: engine });

      await server.handleToolCall('valuate_asset', {
        id: 'no-bridge',
        assetClass: AssetClass.COMMODITY,
        name: 'Gold',
        metadata: { commodity: 'gold', quantity: 10 },
      });

      const result = await server.handleToolCall('submit_onchain', { assetId: 'no-bridge' }) as any;
      expect(result.error).toBeDefined();
      expect(result.error).toContain('chain bridge');
    });

    it('should handle submit_onchain for non-valuated asset', async () => {
      const bridge = new ChainBridge({
        rpcUrl: 'http://localhost:8545',
        oracleAddress: '0x' + '1'.repeat(40),
      });
      const server = new RWAMCPServer({ consensusEngine: engine, chainBridge: bridge });

      const result = await server.handleToolCall('submit_onchain', { assetId: 'not-valuated' }) as any;
      expect(result.error).toBeDefined();
      expect(result.error).toContain('not-valuated');
    });

    it('should list agents correctly', async () => {
      const server = new RWAMCPServer({ consensusEngine: engine });
      const agents = await server.handleToolCall('list_agents', {}) as any[];

      expect(agents).toHaveLength(3);
      const ids = agents.map((a: any) => a.id);
      expect(ids).toContain('property-agent');
      expect(ids).toContain('commodity-agent');
      expect(ids).toContain('treasury-agent');
    });

    it('should get tool definitions with correct count', () => {
      const server = new RWAMCPServer({ consensusEngine: engine });
      const tools = server.getToolDefinitions();
      expect(tools).toHaveLength(8);

      const names = tools.map(t => t.name);
      expect(names).toContain('valuate_asset');
      expect(names).toContain('get_price');
      expect(names).toContain('submit_onchain');
      expect(names).toContain('list_agents');
      expect(names).toContain('portfolio_summary');
    });

    it('should throw for unknown tool', async () => {
      const server = new RWAMCPServer({ consensusEngine: engine });
      await expect(
        server.handleToolCall('nonexistent_tool', {})
      ).rejects.toThrow('Unknown tool');
    });

    it('should handle portfolio_summary with empty portfolio', async () => {
      const server = new RWAMCPServer({ consensusEngine: engine });
      const summary = await server.handleToolCall('portfolio_summary', {}) as any;
      expect(summary.assetCount).toBe(0);
      expect(summary.totalValue).toBe(0);
      expect(summary.assets).toHaveLength(0);
    });

    it('should overwrite asset valuation on re-valuate', async () => {
      const server = new RWAMCPServer({ consensusEngine: engine });

      await server.handleToolCall('valuate_asset', {
        id: 'overwrite-test',
        assetClass: AssetClass.COMMODITY,
        name: 'Gold',
        metadata: { commodity: 'gold', quantity: 1 },
      });

      const price1 = await server.handleToolCall('get_price', { assetId: 'overwrite-test' }) as any;

      await server.handleToolCall('valuate_asset', {
        id: 'overwrite-test',
        assetClass: AssetClass.COMMODITY,
        name: 'Gold Large',
        metadata: { commodity: 'gold', quantity: 1000 },
      });

      const price2 = await server.handleToolCall('get_price', { assetId: 'overwrite-test' }) as any;
      expect(price2.consensusValue).toBeGreaterThan(price1.consensusValue * 100);
    });
  });

  describe('Dashboard with large datasets', () => {
    let dashboard: Dashboard;

    afterEach(() => {
      dashboard?.stop();
    });

    it('should handle 100 valuations in history', () => {
      dashboard = new Dashboard({ consensusEngine: engine, port: 5500 });

      for (let i = 0; i < 100; i++) {
        dashboard.addValuation(
          {
            assetId: `mass-${i}`,
            consensusValue: 1000 * (i + 1),
            avgConfidence: 0.8,
            valuations: [],
            methodology: 'test',
            timestamp: new Date(),
          },
          {
            id: `mass-${i}`,
            assetClass: AssetClass.COMMODITY,
            name: `Asset ${i}`,
            description: '',
            metadata: {},
          }
        );
      }

      // Should not throw
      expect(() => dashboard.stop()).not.toThrow();
    });
  });

  describe('ChainBridge submission conversion', () => {
    it('should convert large consensus values', () => {
      const bridge = new ChainBridge({
        rpcUrl: 'http://localhost:8545',
        oracleAddress: '0x' + '1'.repeat(40),
      });

      const consensus: ConsensusResult = {
        assetId: 'big-value',
        consensusValue: 999999999.99,
        avgConfidence: 0.95,
        valuations: [],
        methodology: 'test',
        timestamp: new Date(),
      };

      const submission = bridge.toSubmission(consensus);
      expect(submission.value).toBeGreaterThan(0n);
      expect(submission.confidence).toBe(9500);
    });

    it('should convert zero consensus value', () => {
      const bridge = new ChainBridge({
        rpcUrl: 'http://localhost:8545',
        oracleAddress: '0x' + '1'.repeat(40),
      });

      const consensus: ConsensusResult = {
        assetId: 'zero-value',
        consensusValue: 0,
        avgConfidence: 0.1,
        valuations: [],
        methodology: 'test',
        timestamp: new Date(),
      };

      const submission = bridge.toSubmission(consensus);
      expect(submission.value).toBe(0n);
      expect(submission.confidence).toBe(1000);
    });

    it('should convert fractional consensus value', () => {
      const bridge = new ChainBridge({
        rpcUrl: 'http://localhost:8545',
        oracleAddress: '0x' + '1'.repeat(40),
      });

      const consensus: ConsensusResult = {
        assetId: 'fractional',
        consensusValue: 0.01,
        avgConfidence: 0.5,
        valuations: [],
        methodology: 'test',
        timestamp: new Date(),
      };

      const submission = bridge.toSubmission(consensus);
      expect(submission.value).toBeGreaterThan(0n);
    });

    it('should handle max confidence (1.0)', () => {
      const bridge = new ChainBridge({
        rpcUrl: 'http://localhost:8545',
        oracleAddress: '0x' + '1'.repeat(40),
      });

      const consensus: ConsensusResult = {
        assetId: 'max-conf',
        consensusValue: 100,
        avgConfidence: 1.0,
        valuations: [],
        methodology: 'test',
        timestamp: new Date(),
      };

      const submission = bridge.toSubmission(consensus);
      expect(submission.confidence).toBe(10000);
    });

    it('should handle zero confidence', () => {
      const bridge = new ChainBridge({
        rpcUrl: 'http://localhost:8545',
        oracleAddress: '0x' + '1'.repeat(40),
      });

      const consensus: ConsensusResult = {
        assetId: 'zero-conf',
        consensusValue: 100,
        avgConfidence: 0,
        valuations: [],
        methodology: 'test',
        timestamp: new Date(),
      };

      const submission = bridge.toSubmission(consensus);
      expect(submission.confidence).toBe(0);
    });

    it('should throw when getting signer address without signer', async () => {
      const bridge = new ChainBridge({
        rpcUrl: 'http://localhost:8545',
        oracleAddress: '0x' + '1'.repeat(40),
      });

      await expect(bridge.getSignerAddress()).rejects.toThrow('No signer configured');
    });

    it('should throw when getting balance without signer', async () => {
      const bridge = new ChainBridge({
        rpcUrl: 'http://localhost:8545',
        oracleAddress: '0x' + '1'.repeat(40),
      });

      await expect(bridge.getBalance()).rejects.toThrow('No signer configured');
    });

    it('should throw when submitting consensus without signer', async () => {
      const bridge = new ChainBridge({
        rpcUrl: 'http://localhost:8545',
        oracleAddress: '0x' + '1'.repeat(40),
      });

      const consensus: ConsensusResult = {
        assetId: 'no-signer',
        consensusValue: 100,
        avgConfidence: 0.8,
        valuations: [],
        methodology: 'test',
        timestamp: new Date(),
      };

      await expect(bridge.submitConsensus(consensus)).rejects.toThrow('No signer configured');
    });
  });

  describe('Consensus edge cases', () => {
    it('should throw for empty valuations array', () => {
      expect(() => engine.computeConsensus('test', [])).toThrow('No valuations');
    });

    it('should handle single valuation consensus', () => {
      const v = {
        assetId: 'single',
        value: 50000,
        confidence: 0.75,
        methodology: 'test',
        dataPoints: [],
        timestamp: new Date(),
        agentId: 'ag1',
      };

      const result = engine.computeConsensus('single', [v]);
      expect(result.consensusValue).toBe(50000);
      expect(result.avgConfidence).toBe(0.75);
    });

    it('should handle two identical valuations', () => {
      const now = new Date();
      const v1 = { assetId: 'dup', value: 100000, confidence: 0.8, methodology: 'm', dataPoints: [], timestamp: now, agentId: 'a1' };
      const v2 = { assetId: 'dup', value: 100000, confidence: 0.8, methodology: 'm', dataPoints: [], timestamp: now, agentId: 'a2' };

      const result = engine.computeConsensus('dup', [v1, v2]);
      expect(result.consensusValue).toBe(100000);
    });

    it('should handle valuations with zero confidence', () => {
      const now = new Date();
      const v1 = { assetId: 'z', value: 100000, confidence: 0, methodology: 'm', dataPoints: [], timestamp: now, agentId: 'a1' };
      const v2 = { assetId: 'z', value: 200000, confidence: 0, methodology: 'm', dataPoints: [], timestamp: now, agentId: 'a2' };

      const result = engine.computeConsensus('z', [v1, v2]);
      // When total weight is 0, result should be 0
      expect(result.consensusValue).toBe(0);
    });

    it('should filter outliers with 3+ valuations', () => {
      const now = new Date();
      const valuations = [
        { assetId: 'out', value: 100000, confidence: 0.8, methodology: 'm', dataPoints: [], timestamp: now, agentId: 'a1' },
        { assetId: 'out', value: 105000, confidence: 0.8, methodology: 'm', dataPoints: [], timestamp: now, agentId: 'a2' },
        { assetId: 'out', value: 500000, confidence: 0.8, methodology: 'm', dataPoints: [], timestamp: now, agentId: 'a3' }, // outlier
      ];

      const result = engine.computeConsensus('out', valuations);
      // Outlier (500K, 376% deviation from median 105K) should be filtered
      expect(result.valuations.length).toBeLessThan(3);
      expect(result.consensusValue).toBeLessThan(200000);
    });

    it('should not filter outliers with exactly 2 valuations', () => {
      const now = new Date();
      const v1 = { assetId: 'two', value: 100000, confidence: 0.8, methodology: 'm', dataPoints: [], timestamp: now, agentId: 'a1' };
      const v2 = { assetId: 'two', value: 500000, confidence: 0.8, methodology: 'm', dataPoints: [], timestamp: now, agentId: 'a2' };

      const result = engine.computeConsensus('two', [v1, v2]);
      expect(result.valuations).toHaveLength(2);
    });

    it('should handle all same values with 3+ valuations', () => {
      const now = new Date();
      const valuations = Array.from({ length: 5 }, (_, i) => ({
        assetId: 'same', value: 100000, confidence: 0.8, methodology: 'm', dataPoints: [], timestamp: now, agentId: `a${i}`,
      }));

      const result = engine.computeConsensus('same', valuations);
      expect(result.consensusValue).toBe(100000);
      expect(result.valuations).toHaveLength(5);
    });

    it('should keep non-outlier valuations within threshold', () => {
      const now = new Date();
      const valuations = [
        { assetId: 'close', value: 95000, confidence: 0.8, methodology: 'm', dataPoints: [], timestamp: now, agentId: 'a1' },
        { assetId: 'close', value: 100000, confidence: 0.8, methodology: 'm', dataPoints: [], timestamp: now, agentId: 'a2' },
        { assetId: 'close', value: 105000, confidence: 0.8, methodology: 'm', dataPoints: [], timestamp: now, agentId: 'a3' },
      ];

      const result = engine.computeConsensus('close', valuations);
      expect(result.valuations).toHaveLength(3); // All within 30% of median
    });

    it('should boost confidence when multiple agents agree', () => {
      const now = new Date();
      const valuations = [
        { assetId: 'boost', value: 100000, confidence: 0.8, methodology: 'm', dataPoints: [], timestamp: now, agentId: 'a1' },
        { assetId: 'boost', value: 100000, confidence: 0.8, methodology: 'm', dataPoints: [], timestamp: now, agentId: 'a2' },
      ];

      const result = engine.computeConsensus('boost', valuations);
      expect(result.avgConfidence).toBeGreaterThan(0.8);
    });

    it('should not boost confidence for single agent', () => {
      const v = { assetId: 's', value: 100000, confidence: 0.8, methodology: 'm', dataPoints: [], timestamp: new Date(), agentId: 'a1' };
      const result = engine.computeConsensus('s', [v]);
      expect(result.avgConfidence).toBe(0.8);
    });

    it('should cap confidence at 1.0', () => {
      const now = new Date();
      const valuations = [
        { assetId: 'cap', value: 100000, confidence: 0.99, methodology: 'm', dataPoints: [], timestamp: now, agentId: 'a1' },
        { assetId: 'cap', value: 100000, confidence: 0.99, methodology: 'm', dataPoints: [], timestamp: now, agentId: 'a2' },
      ];

      const result = engine.computeConsensus('cap', valuations);
      expect(result.avgConfidence).toBeLessThanOrEqual(1);
    });

    it('should throw when no agents for asset class', async () => {
      await expect(
        engine.evaluateAsset({
          id: 'equity-test',
          assetClass: AssetClass.EQUITY,
          name: 'Stock',
          description: '',
          metadata: {},
        })
      ).rejects.toThrow('No agents registered for asset class');
    });

    it('should include methodology in consensus result', () => {
      const v = { assetId: 'meth', value: 100, confidence: 0.5, methodology: 'm', dataPoints: [], timestamp: new Date(), agentId: 'a1' };
      const result = engine.computeConsensus('meth', [v]);
      expect(result.methodology).toContain('Single agent');
      expect(result.methodology).toContain('a1');
    });

    it('should include threshold info in multi-agent methodology', () => {
      const now = new Date();
      const valuations = [
        { assetId: 'multi', value: 100, confidence: 0.8, methodology: 'm', dataPoints: [], timestamp: now, agentId: 'a1' },
        { assetId: 'multi', value: 100, confidence: 0.8, methodology: 'm', dataPoints: [], timestamp: now, agentId: 'a2' },
        { assetId: 'multi', value: 100, confidence: 0.8, methodology: 'm', dataPoints: [], timestamp: now, agentId: 'a3' },
      ];

      const result = engine.computeConsensus('multi', valuations);
      expect(result.methodology).toContain('Confidence-weighted');
      expect(result.methodology).toContain('30%');
    });
  });

  describe('Agent registration', () => {
    it('should allow registering multiple agents', () => {
      const fresh = new ConsensusEngine();
      fresh.registerAgent(new PropertyAgent());
      fresh.registerAgent(new CommodityAgent());
      fresh.registerAgent(new TreasuryAgent());
      expect(fresh.getAgents()).toHaveLength(3);
    });

    it('should return a copy of agents array', () => {
      const agents1 = engine.getAgents();
      const agents2 = engine.getAgents();
      expect(agents1).not.toBe(agents2); // Different array references
      expect(agents1).toHaveLength(agents2.length);
    });

    it('should allow duplicate agent registration', () => {
      engine.registerAgent(new PropertyAgent());
      expect(engine.getAgents()).toHaveLength(4); // 3 original + 1 duplicate
    });

    it('should start with empty agents on new engine', () => {
      const fresh = new ConsensusEngine();
      expect(fresh.getAgents()).toHaveLength(0);
    });
  });

  describe('Property agent location handling', () => {
    it('should handle unknown location with default price', async () => {
      const result = await engine.evaluateAsset({
        id: 'unknown-loc',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Unknown Property',
        description: '',
        location: 'timbuktu',
        metadata: { squareFeet: 1000 },
      });
      expect(result.consensusValue).toBeGreaterThan(0);
    });

    it('should handle missing location', async () => {
      const result = await engine.evaluateAsset({
        id: 'no-loc',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'No Location Property',
        description: '',
        metadata: { squareFeet: 1000 },
      });
      expect(result.consensusValue).toBeGreaterThan(0);
    });

    it('should value manhattan higher than default', async () => {
      const manhattan = await engine.evaluateAsset({
        id: 'manhattan',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Manhattan',
        description: '',
        location: 'manhattan',
        metadata: { squareFeet: 1000 },
      });

      const defaultLoc = await engine.evaluateAsset({
        id: 'default',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Default',
        description: '',
        location: 'rural_area',
        metadata: { squareFeet: 1000 },
      });

      expect(manhattan.consensusValue).toBeGreaterThan(defaultLoc.consensusValue);
    });

    it('should handle location with spaces', async () => {
      const result = await engine.evaluateAsset({
        id: 'spaced-loc',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'San Francisco Property',
        description: '',
        location: 'San Francisco',
        metadata: { squareFeet: 1000 },
      });
      expect(result.consensusValue).toBeGreaterThan(0);
    });
  });

  describe('Property agent condition handling', () => {
    it('should value excellent condition higher than poor', async () => {
      const excellent = await engine.evaluateAsset({
        id: 'exc',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Excellent',
        description: '',
        location: 'miami',
        metadata: { squareFeet: 1000, condition: 'excellent' },
      });

      const poor = await engine.evaluateAsset({
        id: 'poor',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Poor',
        description: '',
        location: 'miami',
        metadata: { squareFeet: 1000, condition: 'poor' },
      });

      expect(excellent.consensusValue).toBeGreaterThan(poor.consensusValue);
    });

    it('should handle unknown condition as good', async () => {
      const result = await engine.evaluateAsset({
        id: 'unknown-cond',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Unknown Condition',
        description: '',
        location: 'miami',
        metadata: { squareFeet: 1000, condition: 'mysterious' },
      });
      expect(result.consensusValue).toBeGreaterThan(0);
    });
  });

  describe('Property agent income approach', () => {
    it('should increase confidence with rental data', async () => {
      const withRent = await engine.evaluateAsset({
        id: 'with-rent',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Rental Property',
        description: '',
        location: 'miami',
        metadata: { squareFeet: 1000, annualRent: 60000 },
      });

      const withoutRent = await engine.evaluateAsset({
        id: 'without-rent',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'No Rental Data',
        description: '',
        location: 'miami',
        metadata: { squareFeet: 1000 },
      });

      expect(withRent.valuations[0].confidence).toBeGreaterThan(withoutRent.valuations[0].confidence);
    });

    it('should factor in property type cap rate', async () => {
      const commercial = await engine.evaluateAsset({
        id: 'commercial',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Commercial',
        description: '',
        location: 'miami',
        metadata: { squareFeet: 1000, annualRent: 60000, propertyType: 'commercial' },
      });

      const residential = await engine.evaluateAsset({
        id: 'residential',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Residential',
        description: '',
        location: 'miami',
        metadata: { squareFeet: 1000, annualRent: 60000, propertyType: 'residential' },
      });

      // Different cap rates should produce different values
      expect(commercial.consensusValue).not.toBe(residential.consensusValue);
    });
  });

  describe('Property agent depreciation', () => {
    it('should reduce value for old buildings', async () => {
      const newer = await engine.evaluateAsset({
        id: 'newer',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'New Build',
        description: '',
        location: 'miami',
        metadata: { squareFeet: 1000, yearBuilt: 2020 },
      });

      const older = await engine.evaluateAsset({
        id: 'older',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Old Build',
        description: '',
        location: 'miami',
        metadata: { squareFeet: 1000, yearBuilt: 1920 },
      });

      expect(newer.consensusValue).toBeGreaterThan(older.consensusValue);
    });
  });

  describe('Commodity agent edge cases', () => {
    it('should handle unknown commodity with zero value', async () => {
      const result = await engine.evaluateAsset({
        id: 'unknown-commodity',
        assetClass: AssetClass.COMMODITY,
        name: 'Unknown',
        description: '',
        metadata: { commodity: 'unobtanium', quantity: 100 },
      });
      // Unknown commodity has no spot price
      expect(result.consensusValue).toBe(0);
    });

    it('should handle missing quantity as 1', async () => {
      const result = await engine.evaluateAsset({
        id: 'no-qty',
        assetClass: AssetClass.COMMODITY,
        name: 'Gold',
        description: '',
        metadata: { commodity: 'gold' },
      });
      // Should still produce a value for 1 unit
      expect(result.consensusValue).toBeGreaterThan(0);
    });

    it('should handle storage cost deduction', async () => {
      const withStorage = await engine.evaluateAsset({
        id: 'with-storage',
        assetClass: AssetClass.COMMODITY,
        name: 'Gold Stored',
        description: '',
        metadata: { commodity: 'gold', quantity: 100, storageCostPerUnit: 50 },
      });

      const withoutStorage = await engine.evaluateAsset({
        id: 'without-storage',
        assetClass: AssetClass.COMMODITY,
        name: 'Gold Free',
        description: '',
        metadata: { commodity: 'gold', quantity: 100 },
      });

      expect(withStorage.consensusValue).toBeLessThan(withoutStorage.consensusValue);
    });

    it('should handle premium grade commodity', async () => {
      const premium = await engine.evaluateAsset({
        id: 'premium',
        assetClass: AssetClass.COMMODITY,
        name: 'Premium Gold',
        description: '',
        metadata: { commodity: 'gold', quantity: 100, grade: 'premium' },
      });

      const standard = await engine.evaluateAsset({
        id: 'standard',
        assetClass: AssetClass.COMMODITY,
        name: 'Standard Gold',
        description: '',
        metadata: { commodity: 'gold', quantity: 100, grade: 'standard' },
      });

      expect(premium.consensusValue).toBeGreaterThan(standard.consensusValue);
    });

    it('should handle substandard grade commodity', async () => {
      const substandard = await engine.evaluateAsset({
        id: 'sub',
        assetClass: AssetClass.COMMODITY,
        name: 'Substandard Gold',
        description: '',
        metadata: { commodity: 'gold', quantity: 100, grade: 'substandard' },
      });

      const standard = await engine.evaluateAsset({
        id: 'std',
        assetClass: AssetClass.COMMODITY,
        name: 'Standard Gold',
        description: '',
        metadata: { commodity: 'gold', quantity: 100, grade: 'standard' },
      });

      expect(substandard.consensusValue).toBeLessThan(standard.consensusValue);
    });

    it('should handle all supported commodities', async () => {
      const commodities = ['gold', 'silver', 'platinum', 'crude_oil', 'natural_gas', 'copper', 'wheat', 'corn', 'soybeans', 'coffee', 'lumber', 'cotton'];

      for (const commodity of commodities) {
        const result = await engine.evaluateAsset({
          id: `${commodity}-test`,
          assetClass: AssetClass.COMMODITY,
          name: commodity,
          description: '',
          metadata: { commodity, quantity: 10 },
        });
        expect(result.consensusValue).toBeGreaterThan(0);
      }
    });
  });

  describe('Treasury agent edge cases', () => {
    it('should handle very short maturity (1 year)', async () => {
      const result = await engine.evaluateAsset({
        id: 'short-mat',
        assetClass: AssetClass.TREASURY,
        name: '1Y Bond',
        description: '',
        metadata: { maturityYears: 1, couponRate: 0.04, faceValue: 1000, creditRating: 'AAA' },
      });
      expect(result.consensusValue).toBeGreaterThan(0);
    });

    it('should handle very long maturity (30 years)', async () => {
      const result = await engine.evaluateAsset({
        id: 'long-mat',
        assetClass: AssetClass.TREASURY,
        name: '30Y Bond',
        description: '',
        metadata: { maturityYears: 30, couponRate: 0.04, faceValue: 1000, creditRating: 'AAA' },
      });
      expect(result.consensusValue).toBeGreaterThan(0);
    });

    it('should have lower confidence for high-yield (CCC)', async () => {
      const aaa = await engine.evaluateAsset({
        id: 'aaa-bond',
        assetClass: AssetClass.TREASURY,
        name: 'AAA Bond',
        description: '',
        metadata: { maturityYears: 10, couponRate: 0.04, faceValue: 1000, creditRating: 'AAA' },
      });

      const ccc = await engine.evaluateAsset({
        id: 'ccc-bond',
        assetClass: AssetClass.TREASURY,
        name: 'CCC Bond',
        description: '',
        metadata: { maturityYears: 10, couponRate: 0.04, faceValue: 1000, creditRating: 'CCC' },
      });

      expect(aaa.valuations[0].confidence).toBeGreaterThan(ccc.valuations[0].confidence);
    });

    it('should handle different bond types', async () => {
      const types = ['us_treasury', 'corporate_aaa', 'corporate_bbb', 'municipal'];

      for (const bondType of types) {
        const result = await engine.evaluateAsset({
          id: `bond-${bondType}`,
          assetClass: AssetClass.TREASURY,
          name: `${bondType} Bond`,
          description: '',
          metadata: { bondType, maturityYears: 10, couponRate: 0.04, faceValue: 1000 },
        });
        expect(result.consensusValue).toBeGreaterThan(0);
      }
    });

    it('should value higher coupon bonds higher', async () => {
      const highCoupon = await engine.evaluateAsset({
        id: 'high-coupon',
        assetClass: AssetClass.TREASURY,
        name: 'High Coupon',
        description: '',
        metadata: { maturityYears: 10, couponRate: 0.08, faceValue: 1000 },
      });

      const lowCoupon = await engine.evaluateAsset({
        id: 'low-coupon',
        assetClass: AssetClass.TREASURY,
        name: 'Low Coupon',
        description: '',
        metadata: { maturityYears: 10, couponRate: 0.02, faceValue: 1000 },
      });

      expect(highCoupon.consensusValue).toBeGreaterThan(lowCoupon.consensusValue);
    });

    it('should scale with face value', async () => {
      const large = await engine.evaluateAsset({
        id: 'large-face',
        assetClass: AssetClass.TREASURY,
        name: 'Large Bond',
        description: '',
        metadata: { maturityYears: 10, couponRate: 0.04, faceValue: 100000 },
      });

      const small = await engine.evaluateAsset({
        id: 'small-face',
        assetClass: AssetClass.TREASURY,
        name: 'Small Bond',
        description: '',
        metadata: { maturityYears: 10, couponRate: 0.04, faceValue: 1000 },
      });

      expect(large.consensusValue).toBeGreaterThan(small.consensusValue * 50);
    });

    it('should scale with quantity', async () => {
      const many = await engine.evaluateAsset({
        id: 'many-bonds',
        assetClass: AssetClass.TREASURY,
        name: 'Many Bonds',
        description: '',
        metadata: { maturityYears: 10, couponRate: 0.04, faceValue: 1000, quantity: 100 },
      });

      const one = await engine.evaluateAsset({
        id: 'one-bond',
        assetClass: AssetClass.TREASURY,
        name: 'One Bond',
        description: '',
        metadata: { maturityYears: 10, couponRate: 0.04, faceValue: 1000, quantity: 1 },
      });

      expect(many.consensusValue).toBeGreaterThan(one.consensusValue * 50);
    });

    it('should handle BBB rating with medium confidence', async () => {
      const result = await engine.evaluateAsset({
        id: 'bbb-bond',
        assetClass: AssetClass.TREASURY,
        name: 'BBB Bond',
        description: '',
        metadata: { maturityYears: 10, couponRate: 0.04, faceValue: 1000, creditRating: 'BBB' },
      });
      expect(result.valuations[0].confidence).toBe(0.8);
    });

    it('should handle BB rating with low confidence', async () => {
      const result = await engine.evaluateAsset({
        id: 'bb-bond',
        assetClass: AssetClass.TREASURY,
        name: 'BB Bond',
        description: '',
        metadata: { maturityYears: 10, couponRate: 0.04, faceValue: 1000, creditRating: 'BB' },
      });
      expect(result.valuations[0].confidence).toBe(0.65);
    });
  });

  describe('Custom outlier threshold', () => {
    it('should filter more aggressively with tight threshold', () => {
      const tight = new ConsensusEngine(0.05); // 5% threshold
      tight.registerAgent(new PropertyAgent());

      const now = new Date();
      const valuations = [
        { assetId: 'tight', value: 100000, confidence: 0.8, methodology: 'm', dataPoints: [], timestamp: now, agentId: 'a1' },
        { assetId: 'tight', value: 100000, confidence: 0.8, methodology: 'm', dataPoints: [], timestamp: now, agentId: 'a2' },
        { assetId: 'tight', value: 115000, confidence: 0.8, methodology: 'm', dataPoints: [], timestamp: now, agentId: 'a3' }, // 15% off median
      ];

      const result = tight.computeConsensus('tight', valuations);
      expect(result.valuations.length).toBeLessThan(3);
    });

    it('should keep more with loose threshold', () => {
      const loose = new ConsensusEngine(0.9); // 90% threshold
      loose.registerAgent(new PropertyAgent());

      const now = new Date();
      const valuations = [
        { assetId: 'loose', value: 100000, confidence: 0.8, methodology: 'm', dataPoints: [], timestamp: now, agentId: 'a1' },
        { assetId: 'loose', value: 180000, confidence: 0.8, methodology: 'm', dataPoints: [], timestamp: now, agentId: 'a2' },
        { assetId: 'loose', value: 120000, confidence: 0.8, methodology: 'm', dataPoints: [], timestamp: now, agentId: 'a3' },
      ];

      const result = loose.computeConsensus('loose', valuations);
      expect(result.valuations).toHaveLength(3);
    });
  });

  describe('Tool definitions schema validation', () => {
    it('should have inputSchema on each tool', () => {
      const server = new RWAMCPServer({ consensusEngine: engine });
      const tools = server.getToolDefinitions();

      for (const tool of tools) {
        expect(tool).toHaveProperty('name');
        expect(tool).toHaveProperty('description');
        expect(tool).toHaveProperty('inputSchema');
        expect(tool.inputSchema).toHaveProperty('type', 'object');
      }
    });

    it('should require id and assetClass for valuate_asset', () => {
      const server = new RWAMCPServer({ consensusEngine: engine });
      const tools = server.getToolDefinitions();
      const valuateTool = tools.find(t => t.name === 'valuate_asset');

      expect(valuateTool!.inputSchema.required).toContain('id');
      expect(valuateTool!.inputSchema.required).toContain('assetClass');
      expect(valuateTool!.inputSchema.required).toContain('name');
    });

    it('should require assetId for get_price', () => {
      const server = new RWAMCPServer({ consensusEngine: engine });
      const tools = server.getToolDefinitions();
      const priceTool = tools.find(t => t.name === 'get_price');

      expect(priceTool!.inputSchema.required).toContain('assetId');
    });
  });
});
