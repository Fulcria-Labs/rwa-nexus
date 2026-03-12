import { ConsensusEngine } from '../../src/oracle/consensus';
import { PropertyAgent } from '../../src/agents/property-agent';
import { CommodityAgent } from '../../src/agents/commodity-agent';
import { TreasuryAgent } from '../../src/agents/treasury-agent';
import { ChainBridge } from '../../src/oracle/chain-bridge';
import { RWAMCPServer } from '../../src/mcp/server';
import { AssetClass, AssetData, ValuationResult } from '../../src/types';
import { BaseValuationAgent } from '../../src/agents/base-agent';
import { AgentConfig, DataPoint } from '../../src/types';

/**
 * Deterministic stub agent that always returns fixed values.
 * Used to test consensus behaviour without relying on real agent logic.
 */
class StubAgent extends BaseValuationAgent {
  private readonly returnValue: number;
  private readonly returnConfidence: number;

  constructor(id: string, assetClasses: AssetClass[], value: number, confidence: number) {
    const config: AgentConfig = {
      id,
      name: `Stub ${id}`,
      assetClasses,
      description: `Stub agent returning ${value}`,
    };
    super(config);
    this.returnValue = value;
    this.returnConfidence = confidence;
  }

  protected async gatherData(): Promise<DataPoint[]> {
    return [
      {
        source: 'stub',
        metric: 'stub_value',
        value: this.returnValue,
        timestamp: new Date(),
        weight: 1.0,
      },
    ];
  }

  protected async computeValuation(): Promise<{ value: number; confidence: number }> {
    return { value: this.returnValue, confidence: this.returnConfidence };
  }

  protected getMethodology(): string {
    return `Stub returning fixed value ${this.returnValue}`;
  }
}

function makePropertyAsset(id: string, overrides: Partial<AssetData['metadata']> = {}): AssetData {
  return {
    id,
    assetClass: AssetClass.REAL_ESTATE,
    name: 'Test Property',
    description: '',
    location: 'miami',
    metadata: { squareFeet: 1000, ...overrides },
  };
}

function makeCommodityAsset(id: string, quantity = 10, commodity = 'gold'): AssetData {
  return {
    id,
    assetClass: AssetClass.COMMODITY,
    name: 'Commodity',
    description: '',
    metadata: { commodity, quantity },
  };
}

function makeTreasuryAsset(id: string): AssetData {
  return {
    id,
    assetClass: AssetClass.TREASURY,
    name: 'Bond',
    description: '',
    metadata: { maturityYears: 10, couponRate: 0.04, faceValue: 1000, creditRating: 'AAA' },
  };
}

describe('Agent → Consensus integration', () => {
  describe('single agent per class produces single-agent consensus', () => {
    it('PropertyAgent: consensus from single agent matches raw valuation', async () => {
      const engine = new ConsensusEngine();
      const propertyAgent = new PropertyAgent();
      engine.registerAgent(propertyAgent);

      const asset = makePropertyAsset('single-prop');
      const rawResult = await propertyAgent.valuate(asset);
      const consensus = await engine.evaluateAsset(asset);

      expect(consensus.valuations).toHaveLength(1);
      expect(consensus.consensusValue).toBe(rawResult.value);
      expect(consensus.avgConfidence).toBe(rawResult.confidence);
    });

    it('CommodityAgent: consensus value equals agent value for single agent', async () => {
      const engine = new ConsensusEngine();
      const commodityAgent = new CommodityAgent();
      engine.registerAgent(commodityAgent);

      const asset = makeCommodityAsset('single-com', 100, 'gold');
      const rawResult = await commodityAgent.valuate(asset);
      const consensus = await engine.evaluateAsset(asset);

      expect(consensus.consensusValue).toBe(rawResult.value);
    });

    it('TreasuryAgent: confidence matches agent confidence for single agent', async () => {
      const engine = new ConsensusEngine();
      const treasuryAgent = new TreasuryAgent();
      engine.registerAgent(treasuryAgent);

      const asset = makeTreasuryAsset('single-trs');
      const rawResult = await treasuryAgent.valuate(asset);
      const consensus = await engine.evaluateAsset(asset);

      expect(consensus.avgConfidence).toBe(rawResult.confidence);
    });
  });

  describe('two stub agents — deterministic consensus', () => {
    it('should compute confidence-weighted average with two agents', async () => {
      const engine = new ConsensusEngine();
      engine.registerAgent(new StubAgent('s1', [AssetClass.COMMODITY], 100000, 0.8));
      engine.registerAgent(new StubAgent('s2', [AssetClass.COMMODITY], 200000, 0.4));

      const asset: AssetData = {
        id: 'dual-stub',
        assetClass: AssetClass.COMMODITY,
        name: 'Test',
        description: '',
        metadata: {},
      };

      const consensus = await engine.evaluateAsset(asset);
      // Weighted: (100000*0.8 + 200000*0.4) / (0.8+0.4)
      // = (80000 + 80000) / 1.2 = 133333.33...
      expect(consensus.consensusValue).toBeCloseTo(133333.33, 0);
    });

    it('should give agreement bonus when both agents have close values', async () => {
      const engine = new ConsensusEngine();
      engine.registerAgent(new StubAgent('s1', [AssetClass.COMMODITY], 100000, 0.7));
      engine.registerAgent(new StubAgent('s2', [AssetClass.COMMODITY], 100000, 0.7));

      const asset: AssetData = {
        id: 'agreement-test',
        assetClass: AssetClass.COMMODITY,
        name: 'Test',
        description: '',
        metadata: {},
      };

      const consensus = await engine.evaluateAsset(asset);
      // avg confidence = 0.7, + 0.05 bonus = 0.75
      expect(consensus.avgConfidence).toBeCloseTo(0.75, 4);
    });
  });

  describe('outlier filtering in real agent scenarios', () => {
    it('should filter a severely outlying stub agent', async () => {
      const engine = new ConsensusEngine(0.25); // 25% threshold
      engine.registerAgent(new StubAgent('good-1', [AssetClass.REAL_ESTATE], 500000, 0.85));
      engine.registerAgent(new StubAgent('good-2', [AssetClass.REAL_ESTATE], 510000, 0.82));
      engine.registerAgent(new StubAgent('outlier', [AssetClass.REAL_ESTATE], 2000000, 0.9)); // 290% over median

      const asset: AssetData = {
        id: 'outlier-test',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Test',
        description: '',
        metadata: {},
      };

      const consensus = await engine.evaluateAsset(asset);
      // Outlier should be filtered
      expect(consensus.valuations).toHaveLength(2);
      // Consensus should be close to 500-510k range
      expect(consensus.consensusValue).toBeLessThan(600000);
    });

    it('should retain all agents when they agree closely', async () => {
      const engine = new ConsensusEngine(0.1); // 10% threshold
      engine.registerAgent(new StubAgent('a1', [AssetClass.COMMODITY], 100000, 0.8));
      engine.registerAgent(new StubAgent('a2', [AssetClass.COMMODITY], 105000, 0.8));
      engine.registerAgent(new StubAgent('a3', [AssetClass.COMMODITY], 98000, 0.8));

      const asset: AssetData = {
        id: 'close-agreement',
        assetClass: AssetClass.COMMODITY,
        name: 'Test',
        description: '',
        metadata: {},
      };

      const consensus = await engine.evaluateAsset(asset);
      // All within 10% of median (105000) — all retained
      expect(consensus.valuations).toHaveLength(3);
    });
  });

  describe('ValuationResult structure from real agents', () => {
    it('PropertyAgent result should include required fields', async () => {
      const agent = new PropertyAgent();
      const result = await agent.valuate(makePropertyAsset('field-test'));

      expect(result).toHaveProperty('assetId', 'field-test');
      expect(result).toHaveProperty('value');
      expect(result).toHaveProperty('confidence');
      expect(result).toHaveProperty('methodology');
      expect(result).toHaveProperty('dataPoints');
      expect(result).toHaveProperty('timestamp');
      expect(result).toHaveProperty('agentId', 'property-agent');
      expect(result.dataPoints.length).toBeGreaterThan(0);
    });

    it('CommodityAgent result dataPoints should have correct source fields', async () => {
      const agent = new CommodityAgent();
      const result = await agent.valuate(makeCommodityAsset('dp-test', 1, 'gold'));

      const sources = result.dataPoints.map(dp => dp.source);
      expect(sources).toContain('market_data');
      expect(sources).toContain('asset_data');
    });

    it('TreasuryAgent result dataPoints should include yield curve source', async () => {
      const agent = new TreasuryAgent();
      const result = await agent.valuate(makeTreasuryAsset('yield-test'));

      const sources = result.dataPoints.map(dp => dp.source);
      expect(sources).toContain('yield_curve');
    });
  });

  describe('ChainBridge integration with real consensus', () => {
    it('should convert property consensus to a valid oracle submission', async () => {
      const engine = new ConsensusEngine();
      engine.registerAgent(new PropertyAgent());

      const consensus = await engine.evaluateAsset(makePropertyAsset('chain-prop'));
      const bridge = new ChainBridge({
        rpcUrl: 'http://localhost:8545',
        oracleAddress: '0x' + '1'.repeat(40),
      });

      const submission = bridge.toSubmission(consensus);

      expect(typeof submission.value).toBe('bigint');
      expect(submission.value).toBeGreaterThan(0n);
      expect(submission.confidence).toBeGreaterThan(0);
      expect(submission.confidence).toBeLessThanOrEqual(10000);
      expect(submission.assetId).toBe('chain-prop');
    });

    it('should convert commodity consensus to a valid oracle submission', async () => {
      const engine = new ConsensusEngine();
      engine.registerAgent(new CommodityAgent());

      const consensus = await engine.evaluateAsset(makeCommodityAsset('chain-com', 100));
      const bridge = new ChainBridge({
        rpcUrl: 'http://localhost:8545',
        oracleAddress: '0x' + '1'.repeat(40),
      });

      const submission = bridge.toSubmission(consensus);
      expect(submission.value).toBeGreaterThan(0n);
    });

    it('submission value should preserve the consensus value at 18 decimals', async () => {
      const engine = new ConsensusEngine();
      engine.registerAgent(new CommodityAgent());

      const consensus = await engine.evaluateAsset(makeCommodityAsset('decimal-test', 1, 'gold'));
      const bridge = new ChainBridge({
        rpcUrl: 'http://localhost:8545',
        oracleAddress: '0x' + '1'.repeat(40),
      });

      const submission = bridge.toSubmission(consensus);

      // The value in 18 decimals divided by 1e18 should match consensusValue (rounded to 2dp)
      const reconstructed = Number(submission.value) / 1e18;
      expect(reconstructed).toBeCloseTo(consensus.consensusValue, 0);
    });

    it('submission confidence should be within valid basis point range (0-10000)', async () => {
      const engine = new ConsensusEngine();
      engine.registerAgent(new TreasuryAgent());

      const consensus = await engine.evaluateAsset(makeTreasuryAsset('conf-range'));
      const bridge = new ChainBridge({
        rpcUrl: 'http://localhost:8545',
        oracleAddress: '0x' + '1'.repeat(40),
      });

      const submission = bridge.toSubmission(consensus);
      expect(submission.confidence).toBeGreaterThanOrEqual(0);
      expect(submission.confidence).toBeLessThanOrEqual(10000);
    });
  });

  describe('MCP server with stub agents for deterministic outcomes', () => {
    it('should store and retrieve deterministic value via MCP tools', async () => {
      const engine = new ConsensusEngine();
      engine.registerAgent(new StubAgent('s1', [AssetClass.REAL_ESTATE], 750000, 0.9));

      const server = new RWAMCPServer({ consensusEngine: engine });

      await server.handleToolCall('valuate_asset', {
        id: 'mcp-stub',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Stub Property',
        metadata: {},
      });

      const price: any = await server.handleToolCall('get_price', { assetId: 'mcp-stub' });
      expect(price.consensusValue).toBe(750000);
    });

    it('should aggregate two stub agents correctly in portfolio summary', async () => {
      const engine = new ConsensusEngine();
      engine.registerAgent(new StubAgent('s1', [AssetClass.REAL_ESTATE], 500000, 0.8));
      engine.registerAgent(new StubAgent('s2', [AssetClass.COMMODITY], 265000, 0.83));

      const server = new RWAMCPServer({ consensusEngine: engine });

      await server.handleToolCall('valuate_asset', {
        id: 'prop-stub',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Property',
        metadata: {},
      });

      await server.handleToolCall('valuate_asset', {
        id: 'com-stub',
        assetClass: AssetClass.COMMODITY,
        name: 'Gold',
        metadata: {},
      });

      const summary: any = await server.handleToolCall('portfolio_summary', {});
      expect(summary.assetCount).toBe(2);
      // Total should be approximately 500000 + 265000 = 765000
      expect(summary.totalValue).toBeCloseTo(765000, -2);
    });
  });

  describe('concurrent evaluations', () => {
    it('should handle 20 concurrent evaluations without errors', async () => {
      const engine = new ConsensusEngine();
      engine.registerAgent(new PropertyAgent());
      engine.registerAgent(new CommodityAgent());
      engine.registerAgent(new TreasuryAgent());

      const tasks = [
        ...Array.from({ length: 7 }, (_, i) =>
          engine.evaluateAsset(makePropertyAsset(`concurrent-prop-${i}`))),
        ...Array.from({ length: 7 }, (_, i) =>
          engine.evaluateAsset(makeCommodityAsset(`concurrent-com-${i}`, i + 1))),
        ...Array.from({ length: 6 }, (_, i) =>
          engine.evaluateAsset(makeTreasuryAsset(`concurrent-trs-${i}`))),
      ];

      const results = await Promise.all(tasks);
      expect(results).toHaveLength(20);
      for (const r of results) {
        expect(r.consensusValue).toBeGreaterThan(0);
        expect(r.valuations).toHaveLength(1);
      }
    });

    it('should produce independent results for concurrent same-class evaluations', async () => {
      const engine = new ConsensusEngine();
      engine.registerAgent(new CommodityAgent());

      const [r1, r100] = await Promise.all([
        engine.evaluateAsset(makeCommodityAsset('conc-q1', 1)),
        engine.evaluateAsset(makeCommodityAsset('conc-q100', 100)),
      ]);

      // 100x quantity should produce ~100x value
      expect(r100.consensusValue / r1.consensusValue).toBeCloseTo(100, 0);
    });
  });

  describe('confidence propagation through pipeline', () => {
    it('BBB bond should produce lower confidence in consensus than AAA', async () => {
      const engine = new ConsensusEngine();
      engine.registerAgent(new TreasuryAgent());

      const aaaAsset: AssetData = {
        id: 'aaa-bond',
        assetClass: AssetClass.TREASURY,
        name: 'AAA Bond',
        description: '',
        metadata: { maturityYears: 10, couponRate: 0.04, faceValue: 1000, creditRating: 'AAA' },
      };

      const bbbAsset: AssetData = {
        id: 'bbb-bond',
        assetClass: AssetClass.TREASURY,
        name: 'BBB Bond',
        description: '',
        metadata: { maturityYears: 10, couponRate: 0.04, faceValue: 1000, creditRating: 'BBB' },
      };

      const aaaConsensus = await engine.evaluateAsset(aaaAsset);
      const bbbConsensus = await engine.evaluateAsset(bbbAsset);

      expect(aaaConsensus.avgConfidence).toBeGreaterThan(bbbConsensus.avgConfidence);
    });

    it('high-volatility commodity should produce lower confidence in consensus', async () => {
      const engine = new ConsensusEngine();
      engine.registerAgent(new CommodityAgent());

      const goldAsset = makeCommodityAsset('gold-conf', 1, 'gold');
      const gasAsset = makeCommodityAsset('gas-conf', 1, 'natural_gas');

      const goldConsensus = await engine.evaluateAsset(goldAsset);
      const gasConsensus = await engine.evaluateAsset(gasAsset);

      // Gold volatility 0.12 vs gas 0.35 => gold has higher confidence
      expect(goldConsensus.avgConfidence).toBeGreaterThan(gasConsensus.avgConfidence);
    });
  });
});
