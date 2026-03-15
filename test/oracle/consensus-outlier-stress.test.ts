import { ConsensusEngine } from '../../src/oracle/consensus';
import { PropertyAgent } from '../../src/agents/property-agent';
import { CommodityAgent } from '../../src/agents/commodity-agent';
import { TreasuryAgent } from '../../src/agents/treasury-agent';
import { AssetClass, AssetData, ValuationResult } from '../../src/types';

function makeValuation(overrides: Partial<ValuationResult> = {}): ValuationResult {
  return {
    assetId: 'test-asset',
    value: 100000,
    confidence: 0.8,
    methodology: 'test',
    dataPoints: [],
    timestamp: new Date(),
    agentId: 'test-agent',
    ...overrides,
  };
}

describe('Consensus Outlier Stress Tests', () => {
  // ---- Empty/single valuation edge cases ----
  describe('edge cases with minimal valuations', () => {
    it('throws on empty valuations array', () => {
      const engine = new ConsensusEngine();
      expect(() => engine.computeConsensus('asset1', [])).toThrow('No valuations');
    });

    it('single valuation returns that value directly', () => {
      const engine = new ConsensusEngine();
      const v = makeValuation({ value: 50000, confidence: 0.9 });
      const result = engine.computeConsensus('asset1', [v]);
      expect(result.consensusValue).toBe(50000);
      expect(result.avgConfidence).toBe(0.9);
    });

    it('single valuation methodology includes agent ID', () => {
      const engine = new ConsensusEngine();
      const v = makeValuation({ agentId: 'my-agent' });
      const result = engine.computeConsensus('asset1', [v]);
      expect(result.methodology).toContain('my-agent');
    });

    it('two valuations are never filtered (outlier filter requires > 2)', () => {
      const engine = new ConsensusEngine(0.01); // Very strict threshold
      const v1 = makeValuation({ value: 100, confidence: 0.8 });
      const v2 = makeValuation({ value: 1000000, confidence: 0.8 }); // 10000x difference
      const result = engine.computeConsensus('asset1', [v1, v2]);
      // Both should be included despite massive difference
      expect(result.valuations.length).toBe(2);
    });
  });

  // ---- Outlier detection behavior ----
  describe('outlier detection', () => {
    it('filters extreme outlier with 3+ valuations', () => {
      const engine = new ConsensusEngine(0.3);
      const valuations = [
        makeValuation({ value: 100000, confidence: 0.8 }),
        makeValuation({ value: 105000, confidence: 0.8 }),
        makeValuation({ value: 500000, confidence: 0.8 }), // outlier > 30%
      ];
      const result = engine.computeConsensus('asset1', valuations);
      expect(result.valuations.length).toBe(2); // Outlier filtered
    });

    it('keeps all valuations within threshold', () => {
      const engine = new ConsensusEngine(0.3);
      const valuations = [
        makeValuation({ value: 100000, confidence: 0.8 }),
        makeValuation({ value: 110000, confidence: 0.8 }),
        makeValuation({ value: 120000, confidence: 0.8 }),
      ];
      const result = engine.computeConsensus('asset1', valuations);
      expect(result.valuations.length).toBe(3);
    });

    it('handles median = 0 (no filtering)', () => {
      const engine = new ConsensusEngine(0.3);
      const valuations = [
        makeValuation({ value: 0, confidence: 0.8 }),
        makeValuation({ value: 0, confidence: 0.7 }),
        makeValuation({ value: 100, confidence: 0.6 }),
      ];
      const result = engine.computeConsensus('asset1', valuations);
      // When median = 0, all valuations are kept
      expect(result.valuations.length).toBe(3);
    });

    it('all values are outliers except median (filters down)', () => {
      const engine = new ConsensusEngine(0.01); // Very strict: 1% threshold
      const valuations = [
        makeValuation({ value: 10, confidence: 0.8 }),
        makeValuation({ value: 100, confidence: 0.8 }), // median
        makeValuation({ value: 1000, confidence: 0.8 }),
        makeValuation({ value: 10000, confidence: 0.8 }),
        makeValuation({ value: 100000, confidence: 0.8 }),
      ];
      const result = engine.computeConsensus('asset1', valuations);
      // Only the median (100) will be within 1% of itself
      expect(result.valuations.length).toBeLessThan(5);
    });

    it('very loose threshold keeps everything', () => {
      const engine = new ConsensusEngine(100); // 10000% threshold
      const valuations = [
        makeValuation({ value: 1, confidence: 0.8 }),
        makeValuation({ value: 100, confidence: 0.8 }),
        makeValuation({ value: 10000, confidence: 0.8 }),
      ];
      const result = engine.computeConsensus('asset1', valuations);
      expect(result.valuations.length).toBe(3);
    });

    it('threshold = 0 only keeps exact median matches', () => {
      const engine = new ConsensusEngine(0);
      const valuations = [
        makeValuation({ value: 100, confidence: 0.8 }),
        makeValuation({ value: 100, confidence: 0.7 }),
        makeValuation({ value: 200, confidence: 0.6 }),
      ];
      const result = engine.computeConsensus('asset1', valuations);
      // Median is 100, only values at exactly 100 pass 0% threshold
      expect(result.valuations.length).toBe(2);
    });
  });

  // ---- Confidence weighting ----
  describe('confidence-weighted consensus', () => {
    it('higher confidence valuation has more influence', () => {
      const engine = new ConsensusEngine();
      const valuations = [
        makeValuation({ value: 100000, confidence: 0.9 }),
        makeValuation({ value: 200000, confidence: 0.1 }),
      ];
      const result = engine.computeConsensus('asset1', valuations);
      // Weighted toward 100000 since it has higher confidence
      expect(result.consensusValue).toBeLessThan(150000);
    });

    it('equal confidence gives equal weight', () => {
      const engine = new ConsensusEngine();
      const valuations = [
        makeValuation({ value: 100000, confidence: 0.8 }),
        makeValuation({ value: 200000, confidence: 0.8 }),
      ];
      const result = engine.computeConsensus('asset1', valuations);
      expect(result.consensusValue).toBe(150000);
    });

    it('zero confidence valuations produce 0 consensus', () => {
      const engine = new ConsensusEngine();
      const valuations = [
        makeValuation({ value: 100000, confidence: 0 }),
        makeValuation({ value: 200000, confidence: 0 }),
      ];
      const result = engine.computeConsensus('asset1', valuations);
      // totalWeight = 0 → consensusValue = 0
      expect(result.consensusValue).toBe(0);
    });

    it('one zero confidence, one positive', () => {
      const engine = new ConsensusEngine();
      const valuations = [
        makeValuation({ value: 100000, confidence: 0 }),
        makeValuation({ value: 200000, confidence: 0.8 }),
      ];
      const result = engine.computeConsensus('asset1', valuations);
      // Only 200000 contributes
      expect(result.consensusValue).toBe(200000);
    });

    it('agreement bonus adds 0.05 to confidence', () => {
      const engine = new ConsensusEngine();
      const valuations = [
        makeValuation({ value: 100000, confidence: 0.8 }),
        makeValuation({ value: 100000, confidence: 0.8 }),
      ];
      const result = engine.computeConsensus('asset1', valuations);
      // avgConfidence = 0.8, agreementBonus = 0.05 → 0.85
      expect(result.avgConfidence).toBe(0.85);
    });

    it('no agreement bonus for single valuation', () => {
      const engine = new ConsensusEngine();
      const valuations = [
        makeValuation({ value: 100000, confidence: 0.8 }),
      ];
      const result = engine.computeConsensus('asset1', valuations);
      expect(result.avgConfidence).toBe(0.8); // No bonus
    });

    it('confidence capped at 1.0', () => {
      const engine = new ConsensusEngine();
      const valuations = [
        makeValuation({ value: 100000, confidence: 1.0 }),
        makeValuation({ value: 100000, confidence: 1.0 }),
      ];
      const result = engine.computeConsensus('asset1', valuations);
      // avgConfidence = 1.0 + 0.05 = 1.05 → capped at 1.0
      expect(result.avgConfidence).toBe(1.0);
    });
  });

  // ---- Large-scale consensus ----
  describe('large-scale consensus', () => {
    it('handles 100 identical valuations', () => {
      const engine = new ConsensusEngine();
      const valuations = Array.from({ length: 100 }, () =>
        makeValuation({ value: 50000, confidence: 0.8 })
      );
      const result = engine.computeConsensus('asset1', valuations);
      expect(result.consensusValue).toBe(50000);
      expect(result.valuations.length).toBe(100);
    });

    it('handles 100 varied valuations', () => {
      const engine = new ConsensusEngine(0.3);
      const valuations = Array.from({ length: 100 }, (_, i) =>
        makeValuation({ value: 100000 + i * 100, confidence: 0.5 + Math.random() * 0.5 })
      );
      const result = engine.computeConsensus('asset1', valuations);
      expect(result.consensusValue).toBeGreaterThan(0);
      expect(result.avgConfidence).toBeGreaterThan(0.5);
    });

    it('handles 50 valuations with 10 outliers', () => {
      const engine = new ConsensusEngine(0.3);
      const normal = Array.from({ length: 40 }, () =>
        makeValuation({ value: 100000, confidence: 0.8 })
      );
      const outliers = Array.from({ length: 10 }, () =>
        makeValuation({ value: 999999, confidence: 0.9 })
      );
      const result = engine.computeConsensus('asset1', [...normal, ...outliers]);
      // Outliers should be filtered, consensus near 100000
      expect(result.consensusValue).toBeCloseTo(100000, -2);
    });
  });

  // ---- evaluateAsset integration ----
  describe('evaluateAsset with registered agents', () => {
    it('throws when no agents registered', async () => {
      const engine = new ConsensusEngine();
      const asset: AssetData = {
        id: 'a1', assetClass: AssetClass.REAL_ESTATE, name: 'House',
        description: '', metadata: {},
      };
      await expect(engine.evaluateAsset(asset)).rejects.toThrow('No agents registered');
    });

    it('throws when no agents can valuate the asset class', async () => {
      const engine = new ConsensusEngine();
      engine.registerAgent(new PropertyAgent());
      const asset: AssetData = {
        id: 'a1', assetClass: AssetClass.COMMODITY, name: 'Gold',
        description: '', metadata: {},
      };
      await expect(engine.evaluateAsset(asset)).rejects.toThrow('No agents registered');
    });

    it('evaluates REAL_ESTATE with PropertyAgent', async () => {
      const engine = new ConsensusEngine();
      engine.registerAgent(new PropertyAgent());
      const asset: AssetData = {
        id: 'a1', assetClass: AssetClass.REAL_ESTATE, name: 'House',
        description: '', metadata: { squareFeet: 2000 },
      };
      const result = await engine.evaluateAsset(asset);
      expect(result.consensusValue).toBeGreaterThan(0);
      expect(result.assetId).toBe('a1');
    });

    it('evaluates COMMODITY with CommodityAgent', async () => {
      const engine = new ConsensusEngine();
      engine.registerAgent(new CommodityAgent());
      const asset: AssetData = {
        id: 'a2', assetClass: AssetClass.COMMODITY, name: 'Gold',
        description: '', metadata: { commodity: 'gold', quantity: 10 },
      };
      const result = await engine.evaluateAsset(asset);
      expect(result.consensusValue).toBeGreaterThan(0);
    });

    it('evaluates TREASURY with TreasuryAgent', async () => {
      const engine = new ConsensusEngine();
      engine.registerAgent(new TreasuryAgent());
      const asset: AssetData = {
        id: 'a3', assetClass: AssetClass.TREASURY, name: 'Bond',
        description: '', metadata: { faceValue: 1000, maturityYears: 10 },
      };
      const result = await engine.evaluateAsset(asset);
      expect(result.consensusValue).toBeGreaterThan(0);
    });

    it('getAgents returns registered agents as copies', () => {
      const engine = new ConsensusEngine();
      const agent = new PropertyAgent();
      engine.registerAgent(agent);
      const agents = engine.getAgents();
      expect(agents.length).toBe(1);
      expect(agents[0]).toBe(agent); // Same reference (but array is new)
      // Modifying the returned array doesn't affect engine
      agents.push(new CommodityAgent());
      expect(engine.getAgents().length).toBe(1);
    });
  });

  // ---- Custom outlier thresholds ----
  describe('custom outlier thresholds', () => {
    it('default threshold is 0.3 (30%)', () => {
      const engine = new ConsensusEngine();
      const valuations = [
        makeValuation({ value: 100, confidence: 0.8 }),
        makeValuation({ value: 100, confidence: 0.8 }),
        makeValuation({ value: 140, confidence: 0.8 }), // 40% deviation → outlier
      ];
      const result = engine.computeConsensus('asset1', valuations);
      expect(result.valuations.length).toBe(2);
    });

    it('10% threshold is more aggressive', () => {
      const engine = new ConsensusEngine(0.1);
      const valuations = [
        makeValuation({ value: 100, confidence: 0.8 }),
        makeValuation({ value: 100, confidence: 0.8 }),
        makeValuation({ value: 115, confidence: 0.8 }), // 15% → outlier at 10% threshold
      ];
      const result = engine.computeConsensus('asset1', valuations);
      expect(result.valuations.length).toBe(2);
    });

    it('50% threshold is more lenient', () => {
      const engine = new ConsensusEngine(0.5);
      const valuations = [
        makeValuation({ value: 100, confidence: 0.8 }),
        makeValuation({ value: 100, confidence: 0.8 }),
        makeValuation({ value: 140, confidence: 0.8 }), // 40% → kept at 50% threshold
      ];
      const result = engine.computeConsensus('asset1', valuations);
      expect(result.valuations.length).toBe(3);
    });
  });

  // ---- Consensus methodology string ----
  describe('consensus methodology reporting', () => {
    it('single agent includes agent name', () => {
      const engine = new ConsensusEngine();
      const v = makeValuation({ agentId: 'property-agent', methodology: 'comparable sales' });
      const result = engine.computeConsensus('asset1', [v]);
      expect(result.methodology).toContain('property-agent');
      expect(result.methodology).toContain('comparable sales');
    });

    it('multiple agents shows count and threshold', () => {
      const engine = new ConsensusEngine(0.3);
      const valuations = [
        makeValuation({ value: 100, confidence: 0.8 }),
        makeValuation({ value: 100, confidence: 0.7 }),
        makeValuation({ value: 100, confidence: 0.6 }),
      ];
      const result = engine.computeConsensus('asset1', valuations);
      expect(result.methodology).toContain('3/3');
      expect(result.methodology).toContain('30%');
    });

    it('filtered agents shows reduced count', () => {
      const engine = new ConsensusEngine(0.1);
      const valuations = [
        makeValuation({ value: 100, confidence: 0.8 }),
        makeValuation({ value: 100, confidence: 0.8 }),
        makeValuation({ value: 200, confidence: 0.8 }), // filtered
      ];
      const result = engine.computeConsensus('asset1', valuations);
      expect(result.methodology).toContain('2/3');
    });
  });

  // ---- Negative values ----
  describe('negative value handling', () => {
    it('handles all negative valuations', () => {
      const engine = new ConsensusEngine();
      const valuations = [
        makeValuation({ value: -100, confidence: 0.8 }),
        makeValuation({ value: -200, confidence: 0.8 }),
      ];
      const result = engine.computeConsensus('asset1', valuations);
      expect(result.consensusValue).toBe(-150);
    });

    it('handles mixed positive and negative valuations', () => {
      const engine = new ConsensusEngine();
      const valuations = [
        makeValuation({ value: 100, confidence: 0.8 }),
        makeValuation({ value: -100, confidence: 0.8 }),
      ];
      const result = engine.computeConsensus('asset1', valuations);
      expect(result.consensusValue).toBe(0);
    });
  });

  // ---- Rounding behavior ----
  describe('rounding', () => {
    it('consensus value is rounded to 2 decimal places', () => {
      const engine = new ConsensusEngine();
      const valuations = [
        makeValuation({ value: 100.333, confidence: 0.8 }),
        makeValuation({ value: 200.666, confidence: 0.8 }),
      ];
      const result = engine.computeConsensus('asset1', valuations);
      const decimalPlaces = (result.consensusValue.toString().split('.')[1] || '').length;
      expect(decimalPlaces).toBeLessThanOrEqual(2);
    });

    it('avgConfidence is rounded to 4 decimal places', () => {
      const engine = new ConsensusEngine();
      const valuations = [
        makeValuation({ value: 100, confidence: 0.333333 }),
        makeValuation({ value: 100, confidence: 0.666666 }),
      ];
      const result = engine.computeConsensus('asset1', valuations);
      const decimalPlaces = (result.avgConfidence.toString().split('.')[1] || '').length;
      expect(decimalPlaces).toBeLessThanOrEqual(4);
    });
  });

  // ---- Timestamp ----
  describe('timestamp handling', () => {
    it('consensus result has current timestamp', () => {
      const engine = new ConsensusEngine();
      const before = new Date();
      const result = engine.computeConsensus('asset1', [makeValuation()]);
      const after = new Date();
      expect(result.timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(result.timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('consensus assetId matches input', () => {
      const engine = new ConsensusEngine();
      const result = engine.computeConsensus('my-asset-42', [makeValuation()]);
      expect(result.assetId).toBe('my-asset-42');
    });
  });
});
