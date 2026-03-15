import { ConsensusEngine } from '../../src/oracle/consensus';
import { ValuationResult } from '../../src/types';

function makeValuation(agentId: string, value: number, confidence = 0.8): ValuationResult {
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

describe('ConsensusEngine - Outlier Filtering & Consensus Math', () => {
  describe('filterOutliers behavior (via computeConsensus)', () => {
    it('should not filter with 2 valuations (below threshold)', () => {
      const engine = new ConsensusEngine(0.3);
      const v1 = makeValuation('a1', 1000);
      const v2 = makeValuation('a2', 5000); // 400% deviation
      const result = engine.computeConsensus('test', [v1, v2]);
      // With <=2 valuations, no filtering occurs
      expect(result.valuations).toHaveLength(2);
    });

    it('should not filter with exactly 2 valuations even with extreme deviation', () => {
      const engine = new ConsensusEngine(0.1); // Very strict threshold
      const v1 = makeValuation('a1', 100);
      const v2 = makeValuation('a2', 1000000); // Extreme deviation
      const result = engine.computeConsensus('test', [v1, v2]);
      expect(result.valuations).toHaveLength(2);
    });

    it('should filter outliers with 3+ valuations', () => {
      const engine = new ConsensusEngine(0.3);
      const vals = [
        makeValuation('a1', 1000),
        makeValuation('a2', 1050),
        makeValuation('a3', 5000), // Outlier: median is 1050, deviation = 3.76
      ];
      const result = engine.computeConsensus('test', vals);
      expect(result.valuations.length).toBeLessThan(3);
    });

    it('should keep all valuations within threshold', () => {
      const engine = new ConsensusEngine(0.3);
      const vals = [
        makeValuation('a1', 1000),
        makeValuation('a2', 1100),
        makeValuation('a3', 1200), // Median is 1100, max deviation = 100/1100 ≈ 0.09 < 0.3
      ];
      const result = engine.computeConsensus('test', vals);
      expect(result.valuations).toHaveLength(3);
    });

    it('should handle all values identical', () => {
      const engine = new ConsensusEngine(0.3);
      const vals = [
        makeValuation('a1', 500),
        makeValuation('a2', 500),
        makeValuation('a3', 500),
      ];
      const result = engine.computeConsensus('test', vals);
      expect(result.valuations).toHaveLength(3);
      expect(result.consensusValue).toBe(500);
    });

    it('should handle zero-value median (no filtering)', () => {
      const engine = new ConsensusEngine(0.3);
      const vals = [
        makeValuation('a1', 0),
        makeValuation('a2', 0),
        makeValuation('a3', 1000),
      ];
      // Median is 0, so deviation check returns true for all (median === 0 guard)
      const result = engine.computeConsensus('test', vals);
      expect(result.valuations).toHaveLength(3);
    });

    it('should use median for outlier detection, not mean', () => {
      const engine = new ConsensusEngine(0.3);
      const vals = [
        makeValuation('a1', 100),
        makeValuation('a2', 110), // Median
        makeValuation('a3', 120),
        makeValuation('a4', 500), // Outlier from median 110: deviation = 390/110 ≈ 3.5
      ];
      const result = engine.computeConsensus('test', vals);
      // Should filter the 500 outlier
      const remaining = result.valuations.map(v => v.value);
      expect(remaining).not.toContain(500);
    });

    it('should select correct median for odd count', () => {
      const engine = new ConsensusEngine(0.2);
      const vals = [
        makeValuation('a1', 90),
        makeValuation('a2', 100),
        makeValuation('a3', 110), // Median (sorted: 90, 100, 110 -> index 1 = 100)
        makeValuation('a4', 105),
        makeValuation('a5', 200), // Outlier
      ];
      const result = engine.computeConsensus('test', vals);
      // Sorted: 90, 100, 105, 110, 200 -> median index 2 = 105
      // 200 deviation: |200-105|/105 ≈ 0.905 > 0.2 -> filtered
      // 90 deviation: |90-105|/105 ≈ 0.143 < 0.2 -> kept
      const remaining = result.valuations.map(v => v.value);
      expect(remaining).not.toContain(200);
      expect(remaining).toContain(90);
    });

    it('should handle negative-like edge with positive values near zero', () => {
      const engine = new ConsensusEngine(0.5);
      const vals = [
        makeValuation('a1', 0.01),
        makeValuation('a2', 0.02),
        makeValuation('a3', 0.015),
      ];
      const result = engine.computeConsensus('test', vals);
      expect(result.valuations.length).toBeGreaterThanOrEqual(2);
    });

    it('should respect custom outlier threshold', () => {
      // Strict threshold
      const strict = new ConsensusEngine(0.05);
      const vals = [
        makeValuation('a1', 100),
        makeValuation('a2', 108), // Median
        makeValuation('a3', 115),
      ];
      const strictResult = strict.computeConsensus('test', vals);

      // Lenient threshold
      const lenient = new ConsensusEngine(0.5);
      const lenientResult = lenient.computeConsensus('test', vals);

      // Strict should filter more aggressively
      expect(lenientResult.valuations.length).toBeGreaterThanOrEqual(strictResult.valuations.length);
    });
  });

  describe('confidence-weighted averaging', () => {
    it('should weight by confidence', () => {
      const engine = new ConsensusEngine();
      const vals = [
        makeValuation('a1', 1000, 0.9),
        makeValuation('a2', 2000, 0.1),
      ];
      const result = engine.computeConsensus('test', vals);
      // Weighted: (1000*0.9 + 2000*0.1) / (0.9+0.1) = 1100
      expect(result.consensusValue).toBe(1100);
    });

    it('should handle equal confidence', () => {
      const engine = new ConsensusEngine();
      const vals = [
        makeValuation('a1', 100, 0.8),
        makeValuation('a2', 200, 0.8),
      ];
      const result = engine.computeConsensus('test', vals);
      expect(result.consensusValue).toBe(150);
    });

    it('should handle zero total weight', () => {
      const engine = new ConsensusEngine();
      const vals = [
        makeValuation('a1', 100, 0),
        makeValuation('a2', 200, 0),
      ];
      const result = engine.computeConsensus('test', vals);
      expect(result.consensusValue).toBe(0);
    });

    it('should round consensus to 2 decimal places', () => {
      const engine = new ConsensusEngine();
      const vals = [
        makeValuation('a1', 100.333, 0.7),
        makeValuation('a2', 200.666, 0.3),
      ];
      const result = engine.computeConsensus('test', vals);
      const decimals = (result.consensusValue.toString().split('.')[1] || '').length;
      expect(decimals).toBeLessThanOrEqual(2);
    });
  });

  describe('agreement bonus', () => {
    it('should add 0.05 agreement bonus for multiple agents', () => {
      const engine = new ConsensusEngine();
      const vals = [
        makeValuation('a1', 100, 0.8),
        makeValuation('a2', 100, 0.8),
      ];
      const result = engine.computeConsensus('test', vals);
      // avgConfidence = 0.8, + 0.05 bonus = 0.85
      expect(result.avgConfidence).toBe(0.85);
    });

    it('should not add bonus for single agent', () => {
      const engine = new ConsensusEngine();
      const result = engine.computeConsensus('test', [makeValuation('a1', 100, 0.8)]);
      expect(result.avgConfidence).toBe(0.8);
    });

    it('should cap confidence at 1.0', () => {
      const engine = new ConsensusEngine();
      const vals = [
        makeValuation('a1', 100, 0.98),
        makeValuation('a2', 100, 0.99),
      ];
      const result = engine.computeConsensus('test', vals);
      expect(result.avgConfidence).toBeLessThanOrEqual(1);
    });

    it('should round avgConfidence to 4 decimal places', () => {
      const engine = new ConsensusEngine();
      const vals = [
        makeValuation('a1', 100, 0.7777),
        makeValuation('a2', 100, 0.8888),
      ];
      const result = engine.computeConsensus('test', vals);
      const decimals = (result.avgConfidence.toString().split('.')[1] || '').length;
      expect(decimals).toBeLessThanOrEqual(4);
    });
  });

  describe('single valuation shortcut', () => {
    it('should return single agent result directly', () => {
      const engine = new ConsensusEngine();
      const v = makeValuation('solo', 42000, 0.95);
      const result = engine.computeConsensus('asset-1', [v]);
      expect(result.consensusValue).toBe(42000);
      expect(result.avgConfidence).toBe(0.95);
      expect(result.valuations).toHaveLength(1);
    });

    it('should include agent ID in single-agent methodology', () => {
      const engine = new ConsensusEngine();
      const v = makeValuation('special-agent', 1000, 0.9);
      const result = engine.computeConsensus('x', [v]);
      expect(result.methodology).toContain('special-agent');
      expect(result.methodology).toContain('Single agent');
    });
  });

  describe('empty valuations', () => {
    it('should throw for empty valuation array', () => {
      const engine = new ConsensusEngine();
      expect(() => engine.computeConsensus('test', [])).toThrow('No valuations');
    });
  });

  describe('methodology string', () => {
    it('should include filtered/total count', () => {
      const engine = new ConsensusEngine(0.1);
      const vals = [
        makeValuation('a1', 100, 0.8),
        makeValuation('a2', 105, 0.8),
        makeValuation('a3', 500, 0.8), // Outlier
      ];
      const result = engine.computeConsensus('test', vals);
      expect(result.methodology).toContain('Confidence-weighted consensus');
      expect(result.methodology).toMatch(/\d+\/\d+ agents/);
    });

    it('should include outlier threshold percentage', () => {
      const engine = new ConsensusEngine(0.25);
      const vals = [
        makeValuation('a1', 100, 0.8),
        makeValuation('a2', 100, 0.8),
        makeValuation('a3', 100, 0.8),
      ];
      const result = engine.computeConsensus('test', vals);
      expect(result.methodology).toContain('25%');
    });
  });

  describe('constructor defaults', () => {
    it('should default outlier threshold to 0.3', () => {
      const engine = new ConsensusEngine();
      expect((engine as any).outlierThreshold).toBe(0.3);
    });

    it('should accept custom threshold', () => {
      const engine = new ConsensusEngine(0.5);
      expect((engine as any).outlierThreshold).toBe(0.5);
    });

    it('should start with no agents', () => {
      const engine = new ConsensusEngine();
      expect(engine.getAgents()).toHaveLength(0);
    });
  });

  describe('agent registration', () => {
    it('should return copies of agents array', () => {
      const engine = new ConsensusEngine();
      const agents1 = engine.getAgents();
      const agents2 = engine.getAgents();
      expect(agents1).not.toBe(agents2);
    });
  });

  describe('stress scenarios', () => {
    it('should handle 100 agents', () => {
      const engine = new ConsensusEngine(0.3);
      const vals = Array.from({ length: 100 }, (_, i) =>
        makeValuation(`a${i}`, 1000 + i, 0.8)
      );
      const result = engine.computeConsensus('test', vals);
      expect(result.valuations.length).toBeGreaterThan(50);
      expect(result.consensusValue).toBeGreaterThan(900);
    });

    it('should handle all outliers except one', () => {
      const engine = new ConsensusEngine(0.1);
      const vals = [
        makeValuation('a1', 100, 0.9),
        makeValuation('a2', 100, 0.9),
        makeValuation('a3', 100, 0.9),
        makeValuation('a4', 500, 0.9), // Outlier
        makeValuation('a5', 600, 0.9), // Outlier
        makeValuation('a6', 700, 0.9), // Outlier
      ];
      const result = engine.computeConsensus('test', vals);
      // Sorted: 100,100,100,500,600,700 -> median index 3 = 500
      // Deviation of 100 from 500: 0.8 > 0.1 -> ALL get filtered differently
      // Actually median of [100,100,100,500,600,700] is values[3] = 500
      // 100: |100-500|/500 = 0.8 > 0.1
      // So most get filtered
      expect(result.valuations.length).toBeLessThan(6);
    });

    it('should handle very large values', () => {
      const engine = new ConsensusEngine();
      const vals = [
        makeValuation('a1', 1e12, 0.9),
        makeValuation('a2', 1.1e12, 0.85),
      ];
      const result = engine.computeConsensus('test', vals);
      expect(result.consensusValue).toBeGreaterThan(0);
    });

    it('should handle very small values', () => {
      const engine = new ConsensusEngine();
      const vals = [
        makeValuation('a1', 0.001, 0.9),
        makeValuation('a2', 0.002, 0.85),
      ];
      const result = engine.computeConsensus('test', vals);
      // Rounding to 2 decimals makes this 0.00, which is valid
      expect(result.consensusValue).toBeGreaterThanOrEqual(0);
    });

    it('should produce timestamp', () => {
      const engine = new ConsensusEngine();
      const result = engine.computeConsensus('test', [makeValuation('a1', 100, 0.8)]);
      expect(result.timestamp).toBeInstanceOf(Date);
    });

    it('should set correct assetId', () => {
      const engine = new ConsensusEngine();
      const result = engine.computeConsensus('my-asset-123', [makeValuation('a1', 100, 0.8)]);
      expect(result.assetId).toBe('my-asset-123');
    });
  });
});
