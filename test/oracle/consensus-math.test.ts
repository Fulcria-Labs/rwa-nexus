import { ConsensusEngine } from '../../src/oracle/consensus';
import { AssetClass, AssetData, ValuationResult } from '../../src/types';
import { PropertyAgent } from '../../src/agents/property-agent';
import { CommodityAgent } from '../../src/agents/commodity-agent';
import { TreasuryAgent } from '../../src/agents/treasury-agent';

/** Helper to create a mock valuation result */
function mockVal(value: number, confidence: number, agentId = 'test'): ValuationResult {
  return {
    assetId: 'asset-1',
    value,
    confidence,
    methodology: 'test',
    dataPoints: [],
    timestamp: new Date(),
    agentId,
  };
}

describe('ConsensusEngine - computeConsensus math', () => {
  let engine: ConsensusEngine;

  beforeEach(() => {
    engine = new ConsensusEngine();
  });

  describe('single valuation', () => {
    it('returns the single value directly', () => {
      const result = engine.computeConsensus('a1', [mockVal(1000, 0.8)]);
      expect(result.consensusValue).toBe(1000);
      expect(result.avgConfidence).toBe(0.8);
    });

    it('includes agent id in methodology', () => {
      const result = engine.computeConsensus('a1', [mockVal(500, 0.9, 'agent-x')]);
      expect(result.methodology).toContain('agent-x');
    });

    it('returns single valuation in array', () => {
      const v = mockVal(500, 0.9);
      const result = engine.computeConsensus('a1', [v]);
      expect(result.valuations).toHaveLength(1);
    });
  });

  describe('two valuations (no outlier filtering)', () => {
    it('computes confidence-weighted average', () => {
      const v1 = mockVal(1000, 0.8);
      const v2 = mockVal(1200, 0.6);
      const result = engine.computeConsensus('a1', [v1, v2]);
      // weighted = (1000*0.8 + 1200*0.6) / (0.8+0.6) = (800+720)/1.4 = 1085.71
      expect(result.consensusValue).toBeCloseTo(1085.71, 1);
    });

    it('applies agreement bonus for 2 agents', () => {
      const v1 = mockVal(1000, 0.8);
      const v2 = mockVal(1000, 0.8);
      const result = engine.computeConsensus('a1', [v1, v2]);
      // avg confidence = 0.8 + 0.05 bonus = 0.85
      expect(result.avgConfidence).toBeCloseTo(0.85, 4);
    });

    it('caps confidence at 1.0', () => {
      const v1 = mockVal(1000, 0.98);
      const v2 = mockVal(1000, 0.98);
      const result = engine.computeConsensus('a1', [v1, v2]);
      expect(result.avgConfidence).toBeLessThanOrEqual(1);
    });
  });

  describe('three+ valuations with outlier filtering', () => {
    it('filters outliers beyond threshold', () => {
      const engine30 = new ConsensusEngine(0.3); // 30% threshold
      const v1 = mockVal(1000, 0.8);
      const v2 = mockVal(1050, 0.9);
      const v3 = mockVal(2000, 0.7); // >30% from median, outlier
      const result = engine30.computeConsensus('a1', [v1, v2, v3]);
      // v3 should be filtered (2000 is >30% from median ~1050)
      expect(result.valuations.length).toBeLessThan(3);
    });

    it('keeps values within threshold', () => {
      const v1 = mockVal(900, 0.8);
      const v2 = mockVal(1000, 0.9);
      const v3 = mockVal(1100, 0.7);
      const result = engine.computeConsensus('a1', [v1, v2, v3]);
      // All within 30% of median (1000), so all kept
      expect(result.valuations).toHaveLength(3);
    });

    it('reports filtered count in methodology', () => {
      const engine10 = new ConsensusEngine(0.1); // strict 10%
      const v1 = mockVal(1000, 0.8);
      const v2 = mockVal(1050, 0.9);
      const v3 = mockVal(2000, 0.7);
      const result = engine10.computeConsensus('a1', [v1, v2, v3]);
      expect(result.methodology).toContain('/3 agents');
    });
  });

  describe('equal weights', () => {
    it('with equal confidence gives simple average', () => {
      const v1 = mockVal(1000, 0.5);
      const v2 = mockVal(2000, 0.5);
      const result = engine.computeConsensus('a1', [v1, v2]);
      expect(result.consensusValue).toBe(1500);
    });
  });

  describe('edge cases', () => {
    it('throws on empty valuations', () => {
      expect(() => engine.computeConsensus('a1', [])).toThrow('No valuations');
    });

    it('handles zero confidence', () => {
      const v1 = mockVal(1000, 0);
      const v2 = mockVal(2000, 0);
      const result = engine.computeConsensus('a1', [v1, v2]);
      // weightedSum = 0, totalWeight = 0 → consensusValue = 0
      expect(result.consensusValue).toBe(0);
    });

    it('handles very small values (rounds to nearest cent)', () => {
      const v1 = mockVal(0.01, 0.9);
      const v2 = mockVal(0.02, 0.8);
      const result = engine.computeConsensus('a1', [v1, v2]);
      expect(result.consensusValue).toBeGreaterThan(0);
    });

    it('handles very large values', () => {
      const v1 = mockVal(1_000_000_000, 0.9);
      const v2 = mockVal(1_100_000_000, 0.8);
      const result = engine.computeConsensus('a1', [v1, v2]);
      expect(result.consensusValue).toBeGreaterThan(1_000_000_000);
    });

    it('handles negative values gracefully', () => {
      const v1 = mockVal(-100, 0.8);
      const result = engine.computeConsensus('a1', [v1]);
      expect(result.consensusValue).toBe(-100);
    });

    it('preserves assetId', () => {
      const result = engine.computeConsensus('my-asset-99', [mockVal(100, 0.5)]);
      expect(result.assetId).toBe('my-asset-99');
    });

    it('includes timestamp', () => {
      const result = engine.computeConsensus('a1', [mockVal(100, 0.5)]);
      expect(result.timestamp).toBeInstanceOf(Date);
    });
  });

  describe('outlier threshold configuration', () => {
    it('default threshold is 0.3 (30%)', () => {
      const defaultEngine = new ConsensusEngine();
      const v1 = mockVal(1000, 0.9);
      const v2 = mockVal(1050, 0.9);
      const v3 = mockVal(1250, 0.9); // 25% deviation from median, within 30%
      const result = defaultEngine.computeConsensus('a1', [v1, v2, v3]);
      expect(result.valuations).toHaveLength(3);
    });

    it('strict threshold filters more', () => {
      const strictEngine = new ConsensusEngine(0.05); // 5%
      const v1 = mockVal(1000, 0.9);
      const v2 = mockVal(1050, 0.9);
      const v3 = mockVal(1200, 0.9); // >5% from median
      const result = strictEngine.computeConsensus('a1', [v1, v2, v3]);
      expect(result.valuations.length).toBeLessThan(3);
    });

    it('loose threshold keeps more', () => {
      const looseEngine = new ConsensusEngine(1.0); // 100%
      const v1 = mockVal(500, 0.9);
      const v2 = mockVal(1000, 0.9);
      const v3 = mockVal(1500, 0.9); // 50% from median, within 100%
      const result = looseEngine.computeConsensus('a1', [v1, v2, v3]);
      expect(result.valuations).toHaveLength(3);
    });
  });
});

describe('ConsensusEngine - evaluateAsset', () => {
  let engine: ConsensusEngine;

  beforeEach(() => {
    engine = new ConsensusEngine();
  });

  it('throws when no agents registered for asset class', async () => {
    engine.registerAgent(new PropertyAgent());
    const asset: AssetData = {
      id: 'test',
      assetClass: AssetClass.COMMODITY,
      name: 'Gold',
      description: '',
      metadata: { commodity: 'gold', quantity: 100 },
    };
    await expect(engine.evaluateAsset(asset)).rejects.toThrow('No agents registered');
  });

  it('evaluates with single capable agent', async () => {
    engine.registerAgent(new PropertyAgent());
    const asset: AssetData = {
      id: 'prop-1',
      assetClass: AssetClass.REAL_ESTATE,
      name: 'Test Property',
      description: '',
      location: 'manhattan',
      metadata: { squareFeet: 1000 },
    };
    const result = await engine.evaluateAsset(asset);
    expect(result.consensusValue).toBeGreaterThan(0);
    expect(result.avgConfidence).toBeGreaterThan(0);
  });

  it('evaluates commodity assets', async () => {
    engine.registerAgent(new CommodityAgent());
    const asset: AssetData = {
      id: 'gold-1',
      assetClass: AssetClass.COMMODITY,
      name: 'Gold Bars',
      description: '',
      metadata: { commodity: 'gold', quantity: 10 },
    };
    const result = await engine.evaluateAsset(asset);
    expect(result.consensusValue).toBeGreaterThan(0);
  });

  it('evaluates treasury assets', async () => {
    engine.registerAgent(new TreasuryAgent());
    const asset: AssetData = {
      id: 'tbill-1',
      assetClass: AssetClass.TREASURY,
      name: 'T-Bill',
      description: '',
      metadata: { faceValue: 10000, maturityMonths: 6 },
    };
    const result = await engine.evaluateAsset(asset);
    expect(result.consensusValue).toBeGreaterThan(0);
  });

  it('only uses capable agents', async () => {
    engine.registerAgent(new PropertyAgent());
    engine.registerAgent(new CommodityAgent());
    engine.registerAgent(new TreasuryAgent());

    const asset: AssetData = {
      id: 'gold-2',
      assetClass: AssetClass.COMMODITY,
      name: 'Silver',
      description: '',
      metadata: { commodity: 'silver', quantity: 100 },
    };

    const result = await engine.evaluateAsset(asset);
    // Only commodity agent should be used
    expect(result.valuations).toHaveLength(1);
    expect(result.valuations[0].agentId).toBe('commodity-agent');
  });
});

describe('ConsensusEngine - agent management', () => {
  it('starts with no agents', () => {
    const engine = new ConsensusEngine();
    expect(engine.getAgents()).toHaveLength(0);
  });

  it('getAgents returns copy', () => {
    const engine = new ConsensusEngine();
    engine.registerAgent(new PropertyAgent());
    const agents = engine.getAgents();
    agents.push(new CommodityAgent());
    // Original should not be modified
    expect(engine.getAgents()).toHaveLength(1);
  });

  it('allows duplicate agent types', () => {
    const engine = new ConsensusEngine();
    engine.registerAgent(new PropertyAgent());
    engine.registerAgent(new PropertyAgent());
    expect(engine.getAgents()).toHaveLength(2);
  });
});
