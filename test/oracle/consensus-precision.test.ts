import { ConsensusEngine } from '../../src/oracle/consensus';
import { BaseValuationAgent } from '../../src/agents/base-agent';
import { AssetClass, AssetData, DataPoint, ValuationResult } from '../../src/types';

/**
 * Precision and mathematical correctness tests for the consensus engine.
 * Covers: weighted averaging accuracy, outlier detection boundaries,
 * edge cases in median calculation, agreement bonus, and numerical stability.
 */

class MockAgent extends BaseValuationAgent {
  private _value: number;
  private _confidence: number;

  constructor(id: string, value: number, confidence: number, assetClasses: AssetClass[] = [AssetClass.REAL_ESTATE]) {
    super({
      id,
      name: `Mock Agent ${id}`,
      assetClasses,
      description: 'Mock agent for testing',
    });
    this._value = value;
    this._confidence = confidence;
  }

  protected async gatherData(): Promise<DataPoint[]> {
    return [];
  }

  protected async computeValuation(): Promise<{ value: number; confidence: number }> {
    return { value: this._value, confidence: this._confidence };
  }

  protected getMethodology(): string {
    return 'mock';
  }
}

function makeAsset(id = 'test', assetClass = AssetClass.REAL_ESTATE): AssetData {
  return { id, assetClass, name: 'Test', description: '', metadata: {} };
}

function makeValuation(value: number, confidence: number, agentId = 'agent'): ValuationResult {
  return {
    assetId: 'test',
    value,
    confidence,
    methodology: 'test',
    dataPoints: [],
    timestamp: new Date(),
    agentId,
  };
}

describe('Consensus Engine Precision', () => {
  describe('single valuation passthrough', () => {
    it('should pass through single valuation value unchanged', () => {
      const engine = new ConsensusEngine();
      const result = engine.computeConsensus('asset-1', [
        makeValuation(1000000, 0.85, 'agent-1'),
      ]);
      expect(result.consensusValue).toBe(1000000);
    });

    it('should pass through single valuation confidence unchanged', () => {
      const engine = new ConsensusEngine();
      const result = engine.computeConsensus('asset-1', [
        makeValuation(500000, 0.72, 'agent-1'),
      ]);
      expect(result.avgConfidence).toBe(0.72);
    });

    it('should include agent ID in single-agent methodology', () => {
      const engine = new ConsensusEngine();
      const result = engine.computeConsensus('test', [
        makeValuation(100, 0.8, 'property-agent'),
      ]);
      expect(result.methodology).toContain('property-agent');
      expect(result.methodology).toContain('Single agent');
    });
  });

  describe('two-valuation consensus', () => {
    it('should compute confidence-weighted average of two equal-confidence valuations', () => {
      const engine = new ConsensusEngine();
      const result = engine.computeConsensus('test', [
        makeValuation(100, 0.8, 'a'),
        makeValuation(200, 0.8, 'b'),
      ]);
      // Equal weights → average of 100 and 200 = 150
      expect(result.consensusValue).toBe(150);
    });

    it('should weight higher-confidence valuation more', () => {
      const engine = new ConsensusEngine();
      const result = engine.computeConsensus('test', [
        makeValuation(100, 0.9, 'a'),  // Higher confidence
        makeValuation(200, 0.1, 'b'),  // Lower confidence
      ]);
      // Weighted: (100*0.9 + 200*0.1) / (0.9 + 0.1) = (90 + 20) / 1 = 110
      expect(result.consensusValue).toBe(110);
    });

    it('should not filter outliers with only 2 valuations', () => {
      const engine = new ConsensusEngine(0.1); // Very strict threshold
      const result = engine.computeConsensus('test', [
        makeValuation(100, 0.8, 'a'),
        makeValuation(1000, 0.8, 'b'), // 10x different
      ]);
      // With 2 valuations, filterOutliers returns both (<=2 check)
      expect(result.valuations).toHaveLength(2);
    });

    it('should add agreement bonus for 2 valuations', () => {
      const engine = new ConsensusEngine();
      const result = engine.computeConsensus('test', [
        makeValuation(100, 0.8, 'a'),
        makeValuation(100, 0.8, 'b'),
      ]);
      // avgConfidence = 0.8, + 0.05 bonus = 0.85
      expect(result.avgConfidence).toBe(0.85);
    });
  });

  describe('three-or-more valuation consensus', () => {
    it('should compute weighted average of three equal valuations', () => {
      const engine = new ConsensusEngine();
      const result = engine.computeConsensus('test', [
        makeValuation(1000, 0.8, 'a'),
        makeValuation(1000, 0.8, 'b'),
        makeValuation(1000, 0.8, 'c'),
      ]);
      expect(result.consensusValue).toBe(1000);
    });

    it('should filter extreme outlier with 3 valuations', () => {
      const engine = new ConsensusEngine(0.3); // 30% threshold
      const result = engine.computeConsensus('test', [
        makeValuation(100, 0.8, 'a'),
        makeValuation(105, 0.8, 'b'),
        makeValuation(1000, 0.8, 'c'), // Way outside 30%
      ]);
      // Median is 105. 1000 deviates by (1000-105)/105 ≈ 852% > 30%, filtered
      expect(result.valuations).toHaveLength(2);
    });

    it('should keep valuations within threshold', () => {
      const engine = new ConsensusEngine(0.3);
      const result = engine.computeConsensus('test', [
        makeValuation(100, 0.8, 'a'),
        makeValuation(110, 0.8, 'b'),  // 10% deviation
        makeValuation(120, 0.8, 'c'),  // ~9% from median(110)
      ]);
      // All within 30% of median
      expect(result.valuations).toHaveLength(3);
    });

    it('should handle all identical values', () => {
      const engine = new ConsensusEngine();
      const result = engine.computeConsensus('test', [
        makeValuation(5000, 0.9, 'a'),
        makeValuation(5000, 0.9, 'b'),
        makeValuation(5000, 0.9, 'c'),
      ]);
      expect(result.consensusValue).toBe(5000);
    });
  });

  describe('outlier detection', () => {
    it('should use median for outlier detection, not mean', () => {
      const engine = new ConsensusEngine(0.2); // 20% threshold
      const result = engine.computeConsensus('test', [
        makeValuation(100, 0.8, 'a'),
        makeValuation(102, 0.8, 'b'),
        makeValuation(104, 0.8, 'c'), // Median is 102
        makeValuation(500, 0.8, 'd'), // Way above median
      ]);
      // 500 deviates by (500-104)/104 ≈ 381% > 20%, should be filtered
      // Using sorted median: values [100, 102, 104, 500], floor(4/2)=2, median=104
      expect(result.valuations.length).toBeLessThanOrEqual(3);
    });

    it('should handle zero median gracefully', () => {
      const engine = new ConsensusEngine(0.3);
      const result = engine.computeConsensus('test', [
        makeValuation(0, 0.8, 'a'),
        makeValuation(0, 0.8, 'b'),
        makeValuation(100, 0.8, 'c'),
      ]);
      // When median is 0, all pass (if median === 0 return true)
      expect(result.valuations).toHaveLength(3);
    });

    it('should respect custom threshold', () => {
      const strictEngine = new ConsensusEngine(0.05); // 5% threshold
      const result = strictEngine.computeConsensus('test', [
        makeValuation(100, 0.8, 'a'),
        makeValuation(100, 0.8, 'b'),
        makeValuation(110, 0.8, 'c'), // 10% deviation > 5%
      ]);
      // Median is 100, 110 deviates by 10% > 5%
      expect(result.valuations).toHaveLength(2);
    });

    it('should include values at exactly the threshold', () => {
      const engine = new ConsensusEngine(0.1); // 10%
      const result = engine.computeConsensus('test', [
        makeValuation(100, 0.8, 'a'),
        makeValuation(100, 0.8, 'b'),
        makeValuation(110, 0.8, 'c'), // Exactly 10% from median
      ]);
      // deviation = |110-100|/100 = 0.1 = threshold → should be included (<=)
      expect(result.valuations).toHaveLength(3);
    });

    it('should filter multiple outliers', () => {
      const engine = new ConsensusEngine(0.15);
      const result = engine.computeConsensus('test', [
        makeValuation(100, 0.8, 'a'),
        makeValuation(102, 0.8, 'b'),
        makeValuation(101, 0.8, 'c'),
        makeValuation(200, 0.8, 'd'), // outlier
        makeValuation(50, 0.8, 'e'),  // outlier
      ]);
      // Median of sorted [50,100,101,102,200] at index 2 = 101
      // 200: |200-101|/101 = 98% > 15% → filtered
      // 50: |50-101|/101 = 50% > 15% → filtered
      expect(result.valuations).toHaveLength(3);
    });
  });

  describe('confidence-weighted averaging', () => {
    it('should heavily favor high-confidence valuation', () => {
      const engine = new ConsensusEngine();
      const result = engine.computeConsensus('test', [
        makeValuation(1000, 0.99, 'a'),
        makeValuation(500, 0.01, 'b'),
      ]);
      // Weighted: (1000*0.99 + 500*0.01) / (0.99+0.01) = (990+5)/1 = 995
      expect(result.consensusValue).toBe(995);
    });

    it('should compute exact weighted average', () => {
      const engine = new ConsensusEngine();
      const result = engine.computeConsensus('test', [
        makeValuation(200, 0.6, 'a'),
        makeValuation(400, 0.4, 'b'),
      ]);
      // (200*0.6 + 400*0.4) / (0.6+0.4) = (120+160)/1 = 280
      expect(result.consensusValue).toBe(280);
    });

    it('should handle very unequal confidences', () => {
      const engine = new ConsensusEngine();
      const result = engine.computeConsensus('test', [
        makeValuation(100, 1.0, 'a'),
        makeValuation(0, 0.001, 'b'),
      ]);
      // Almost entirely determined by first agent
      expect(result.consensusValue).toBeGreaterThan(99);
    });
  });

  describe('agreement bonus', () => {
    it('should add 0.05 bonus when multiple agents agree', () => {
      const engine = new ConsensusEngine();
      const result = engine.computeConsensus('test', [
        makeValuation(100, 0.7, 'a'),
        makeValuation(100, 0.7, 'b'),
      ]);
      // avgConfidence = 0.7 + 0.05 = 0.75
      expect(result.avgConfidence).toBe(0.75);
    });

    it('should not add bonus for single agent', () => {
      const engine = new ConsensusEngine();
      const result = engine.computeConsensus('test', [
        makeValuation(100, 0.7, 'a'),
      ]);
      expect(result.avgConfidence).toBe(0.7);
    });

    it('should cap confidence at 1.0 with bonus', () => {
      const engine = new ConsensusEngine();
      const result = engine.computeConsensus('test', [
        makeValuation(100, 0.98, 'a'),
        makeValuation(100, 0.98, 'b'),
      ]);
      // 0.98 + 0.05 = 1.03, but capped at 1
      expect(result.avgConfidence).toBe(1);
    });

    it('should add bonus even with 3+ agents', () => {
      const engine = new ConsensusEngine();
      const result = engine.computeConsensus('test', [
        makeValuation(100, 0.8, 'a'),
        makeValuation(100, 0.8, 'b'),
        makeValuation(100, 0.8, 'c'),
      ]);
      expect(result.avgConfidence).toBe(0.85);
    });
  });

  describe('evaluateAsset integration', () => {
    it('should evaluate with a single capable agent', async () => {
      const engine = new ConsensusEngine();
      engine.registerAgent(new MockAgent('m1', 50000, 0.9));

      const result = await engine.evaluateAsset(makeAsset());
      expect(result.consensusValue).toBe(50000);
      expect(result.avgConfidence).toBe(0.9);
    });

    it('should evaluate with multiple capable agents', async () => {
      const engine = new ConsensusEngine();
      engine.registerAgent(new MockAgent('m1', 100000, 0.8));
      engine.registerAgent(new MockAgent('m2', 110000, 0.8));

      const result = await engine.evaluateAsset(makeAsset());
      expect(result.consensusValue).toBeGreaterThan(0);
      expect(result.valuations.length).toBeGreaterThanOrEqual(2);
    });

    it('should throw when no agents can handle asset class', async () => {
      const engine = new ConsensusEngine();
      engine.registerAgent(new MockAgent('m1', 100, 0.8, [AssetClass.COMMODITY]));

      await expect(engine.evaluateAsset(makeAsset('test', AssetClass.REAL_ESTATE)))
        .rejects.toThrow('No agents registered');
    });

    it('should only use agents that handle the asset class', async () => {
      const engine = new ConsensusEngine();
      engine.registerAgent(new MockAgent('re-agent', 500000, 0.85, [AssetClass.REAL_ESTATE]));
      engine.registerAgent(new MockAgent('com-agent', 1000, 0.9, [AssetClass.COMMODITY]));

      const result = await engine.evaluateAsset(makeAsset('test', AssetClass.REAL_ESTATE));
      expect(result.valuations).toHaveLength(1);
      expect(result.valuations[0].agentId).toBe('re-agent');
    });
  });

  describe('computeConsensus edge cases', () => {
    it('should throw on empty valuations array', () => {
      const engine = new ConsensusEngine();
      expect(() => engine.computeConsensus('test', [])).toThrow('No valuations');
    });

    it('should handle very large number of valuations', () => {
      const engine = new ConsensusEngine();
      const valuations = Array.from({ length: 50 }, (_, i) =>
        makeValuation(1000 + i, 0.8, `agent-${i}`)
      );
      const result = engine.computeConsensus('test', valuations);
      expect(result.consensusValue).toBeGreaterThan(0);
      expect(result.valuations.length).toBeGreaterThan(0);
    });

    it('should preserve assetId in result', () => {
      const engine = new ConsensusEngine();
      const result = engine.computeConsensus('my-unique-id', [
        makeValuation(100, 0.8, 'a'),
      ]);
      expect(result.assetId).toBe('my-unique-id');
    });

    it('should set timestamp on result', () => {
      const engine = new ConsensusEngine();
      const before = new Date();
      const result = engine.computeConsensus('test', [
        makeValuation(100, 0.8, 'a'),
      ]);
      const after = new Date();
      expect(result.timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(result.timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  describe('agent registration', () => {
    it('should return empty agents initially', () => {
      const engine = new ConsensusEngine();
      expect(engine.getAgents()).toHaveLength(0);
    });

    it('should register and retrieve agents', () => {
      const engine = new ConsensusEngine();
      engine.registerAgent(new MockAgent('a1', 100, 0.8));
      engine.registerAgent(new MockAgent('a2', 200, 0.9));
      expect(engine.getAgents()).toHaveLength(2);
    });

    it('should return a copy of agents array', () => {
      const engine = new ConsensusEngine();
      engine.registerAgent(new MockAgent('a1', 100, 0.8));
      const agents1 = engine.getAgents();
      const agents2 = engine.getAgents();
      expect(agents1).not.toBe(agents2);
      expect(agents1).toEqual(agents2);
    });
  });

  describe('methodology string format', () => {
    it('should describe filtering in multi-agent methodology', () => {
      const engine = new ConsensusEngine(0.3);
      const result = engine.computeConsensus('test', [
        makeValuation(100, 0.8, 'a'),
        makeValuation(105, 0.8, 'b'),
        makeValuation(110, 0.8, 'c'),
      ]);
      expect(result.methodology).toContain('Confidence-weighted');
      expect(result.methodology).toContain('3/3'); // all passed filter
      expect(result.methodology).toContain('30%'); // threshold
    });

    it('should show filtered count in methodology', () => {
      const engine = new ConsensusEngine(0.1);
      const result = engine.computeConsensus('test', [
        makeValuation(100, 0.8, 'a'),
        makeValuation(100, 0.8, 'b'),
        makeValuation(200, 0.8, 'c'), // filtered
      ]);
      expect(result.methodology).toContain('2/3');
    });
  });

  describe('numerical stability', () => {
    it('should handle small values (rounding to 2 decimals)', () => {
      const engine = new ConsensusEngine();
      // Values must be >= 0.005 to survive Math.round(x*100)/100
      const result = engine.computeConsensus('test', [
        makeValuation(0.50, 0.8, 'a'),
        makeValuation(0.60, 0.8, 'b'),
      ]);
      expect(result.consensusValue).toBeGreaterThan(0);
      expect(result.consensusValue).toBeLessThan(1);
    });

    it('should handle very large values', () => {
      const engine = new ConsensusEngine();
      const result = engine.computeConsensus('test', [
        makeValuation(1e12, 0.8, 'a'),
        makeValuation(1.1e12, 0.8, 'b'),
      ]);
      expect(result.consensusValue).toBeGreaterThan(1e11);
    });

    it('should round consensusValue to 2 decimal places', () => {
      const engine = new ConsensusEngine();
      const result = engine.computeConsensus('test', [
        makeValuation(100, 0.8, 'a'),
        makeValuation(101, 0.8, 'b'),
      ]);
      const decimals = result.consensusValue.toString().split('.')[1]?.length || 0;
      expect(decimals).toBeLessThanOrEqual(2);
    });

    it('should round avgConfidence to 4 decimal places', () => {
      const engine = new ConsensusEngine();
      const result = engine.computeConsensus('test', [
        makeValuation(100, 0.8123456, 'a'),
        makeValuation(100, 0.8123456, 'b'),
      ]);
      const decimals = result.avgConfidence.toString().split('.')[1]?.length || 0;
      expect(decimals).toBeLessThanOrEqual(4);
    });
  });

  describe('default outlier threshold', () => {
    it('should use 0.3 (30%) as default threshold', () => {
      const engine = new ConsensusEngine(); // default
      // Value 150 is 50% away from median 100 → should be filtered
      const result = engine.computeConsensus('test', [
        makeValuation(100, 0.8, 'a'),
        makeValuation(100, 0.8, 'b'),
        makeValuation(150, 0.8, 'c'),
      ]);
      // Median is 100, 150 deviates by 50% > 30%
      expect(result.valuations).toHaveLength(2);
    });

    it('should keep values within default 30% threshold', () => {
      const engine = new ConsensusEngine();
      const result = engine.computeConsensus('test', [
        makeValuation(100, 0.8, 'a'),
        makeValuation(100, 0.8, 'b'),
        makeValuation(125, 0.8, 'c'), // 25% deviation < 30%
      ]);
      expect(result.valuations).toHaveLength(3);
    });
  });
});
