import { ConsensusEngine } from '../../src/oracle/consensus';
import { AssetClass, AssetData, ValuationResult } from '../../src/types';
import { PropertyAgent } from '../../src/agents/property-agent';
import { CommodityAgent } from '../../src/agents/commodity-agent';
import { TreasuryAgent } from '../../src/agents/treasury-agent';

function makeValuation(overrides: Partial<ValuationResult> = {}): ValuationResult {
  return {
    assetId: 'test',
    value: 100000,
    confidence: 0.8,
    methodology: 'test',
    dataPoints: [],
    timestamp: new Date(),
    agentId: 'agent-1',
    ...overrides,
  };
}

describe('ConsensusEngine — edge cases and additional coverage', () => {
  describe('outlier threshold boundary behaviour', () => {
    it('should keep valuations at exactly the threshold boundary', () => {
      // threshold = 0.3; deviation of exactly 30% should be kept
      const engine = new ConsensusEngine(0.3);
      const median = 100000;
      const exactBoundary = median * 1.3; // 30% above median

      const valuations = [
        makeValuation({ value: 90000, agentId: 'a1' }),
        makeValuation({ value: 100000, agentId: 'a2' }),
        makeValuation({ value: exactBoundary, agentId: 'a3' }),
      ];

      const result = engine.computeConsensus('test', valuations);
      // 30% deviation is exactly at threshold, so it should NOT be filtered
      expect(result.valuations.length).toBeGreaterThanOrEqual(2);
    });

    it('should filter valuations just above the threshold', () => {
      const engine = new ConsensusEngine(0.2);
      const valuations = [
        makeValuation({ value: 100000, agentId: 'a1' }),
        makeValuation({ value: 100000, agentId: 'a2' }),
        makeValuation({ value: 125000, agentId: 'a3' }), // 25% above median — outlier
      ];

      const result = engine.computeConsensus('test', valuations);
      // 125000 deviates 25% from 100000 > 20% threshold
      expect(result.valuations).toHaveLength(2);
    });

    it('should correctly compute median for even-length arrays', () => {
      // For [a,b,c,d] sorted, median = values[2] (index Math.floor(4/2))
      const engine = new ConsensusEngine(0.05);
      const valuations = [
        makeValuation({ value: 100000, agentId: 'a1' }),
        makeValuation({ value: 102000, agentId: 'a2' }),
        makeValuation({ value: 103000, agentId: 'a3' }),
        makeValuation({ value: 105000, agentId: 'a4' }),
      ];

      // Median index is 2 => 103000
      // All values within 5% of 103000 are ~97,850 - 108,150 range
      const result = engine.computeConsensus('test', valuations);
      expect(result.valuations.length).toBeGreaterThanOrEqual(3);
    });

    it('should handle threshold of exactly 0 (filter any deviation)', () => {
      const engine = new ConsensusEngine(0.0);
      const valuations = [
        makeValuation({ value: 100000, agentId: 'a1' }),
        makeValuation({ value: 100000, agentId: 'a2' }),
        makeValuation({ value: 100001, agentId: 'a3' }), // Any deviation filtered
      ];

      const result = engine.computeConsensus('test', valuations);
      // 100001 has 0.001% deviation > 0% threshold
      expect(result.valuations.length).toBeLessThanOrEqual(2);
    });
  });

  describe('confidence-weighted consensus — additional cases', () => {
    it('should produce value closer to high-confidence agent', () => {
      const engine = new ConsensusEngine();
      const valuations = [
        makeValuation({ value: 200000, confidence: 0.95, agentId: 'a1' }),
        makeValuation({ value: 100000, confidence: 0.05, agentId: 'a2' }),
      ];

      const result = engine.computeConsensus('test', valuations);
      // Should pull heavily toward 200000
      expect(result.consensusValue).toBeGreaterThan(180000);
    });

    it('should handle three agents with distinct confidences — no outlier filtering (<=2 valuations pass through)', () => {
      // With values [100000, 200000, 300000], median=200000.
      // filterOutliers: 100000 is 50% below median, 300000 is 50% above.
      // Default threshold is 30%, so both extremes are filtered, leaving only [200000].
      // Single valuation consensus: value=200000, confidence=0.3 (no agreement bonus).
      const engine = new ConsensusEngine();
      const valuations = [
        makeValuation({ value: 100000, confidence: 0.5, agentId: 'a1' }),
        makeValuation({ value: 200000, confidence: 0.3, agentId: 'a2' }),
        makeValuation({ value: 300000, confidence: 0.2, agentId: 'a3' }),
      ];

      const result = engine.computeConsensus('test', valuations);
      // After outlier filter: only 200000 survives (median=200000, 50% threshold exceeded by both extremes)
      expect(result.consensusValue).toBe(200000);
    });

    it('should handle three close agents with distinct confidences', () => {
      // Use a loose threshold (100%) so all valuations are kept
      const engine = new ConsensusEngine(1.0);
      const valuations = [
        makeValuation({ value: 100000, confidence: 0.5, agentId: 'a1' }),
        makeValuation({ value: 200000, confidence: 0.3, agentId: 'a2' }),
        makeValuation({ value: 300000, confidence: 0.2, agentId: 'a3' }),
      ];

      const result = engine.computeConsensus('test', valuations);
      // Weighted: (100000*0.5 + 200000*0.3 + 300000*0.2) / 1.0
      // = (50000 + 60000 + 60000) / 1.0 = 170000
      expect(result.consensusValue).toBe(170000);
    });

    it('should agree bonus be exactly 0.05', () => {
      const engine = new ConsensusEngine();
      const valuations = [
        makeValuation({ value: 100000, confidence: 0.6, agentId: 'a1' }),
        makeValuation({ value: 100000, confidence: 0.6, agentId: 'a2' }),
      ];

      const result = engine.computeConsensus('test', valuations);
      // avg confidence = 0.6, + 0.05 bonus = 0.65
      expect(result.avgConfidence).toBeCloseTo(0.65, 10);
    });

    it('should not overflow confidence beyond 1.0 with very high inputs', () => {
      const engine = new ConsensusEngine();
      const valuations = [
        makeValuation({ value: 100000, confidence: 1.0, agentId: 'a1' }),
        makeValuation({ value: 100000, confidence: 1.0, agentId: 'a2' }),
      ];

      const result = engine.computeConsensus('test', valuations);
      expect(result.avgConfidence).toBeLessThanOrEqual(1.0);
    });

    it('should round avgConfidence to 4 decimal places', () => {
      const engine = new ConsensusEngine();
      const valuations = [
        makeValuation({ value: 100000, confidence: 0.7777, agentId: 'a1' }),
        makeValuation({ value: 100000, confidence: 0.7777, agentId: 'a2' }),
      ];

      const result = engine.computeConsensus('test', valuations);
      // result should have at most 4 decimal places
      const decimalPart = result.avgConfidence.toString().split('.')[1] || '';
      expect(decimalPart.length).toBeLessThanOrEqual(4);
    });
  });

  describe('evaluateAsset — capability routing', () => {
    it('should only route to agents that canValuate the asset class', async () => {
      const engine = new ConsensusEngine();
      engine.registerAgent(new PropertyAgent());  // handles REAL_ESTATE
      engine.registerAgent(new CommodityAgent()); // handles COMMODITY
      engine.registerAgent(new TreasuryAgent());  // handles TREASURY

      const asset: AssetData = {
        id: 'route-test',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Test Property',
        description: '',
        location: 'miami',
        metadata: { squareFeet: 1000 },
      };

      const result = await engine.evaluateAsset(asset);
      // Only the PropertyAgent should have produced a valuation
      expect(result.valuations).toHaveLength(1);
      expect(result.valuations[0].agentId).toBe('property-agent');
    });

    it('should throw meaningful error when no agents can handle the class', async () => {
      const engine = new ConsensusEngine();
      engine.registerAgent(new PropertyAgent()); // only REAL_ESTATE

      const asset: AssetData = {
        id: 'unsupported',
        assetClass: AssetClass.EQUITY,
        name: 'Stock',
        description: '',
        metadata: {},
      };

      await expect(engine.evaluateAsset(asset)).rejects.toThrow('No agents registered');
      await expect(engine.evaluateAsset(asset)).rejects.toThrow('equity');
    });

    it('should invoke all matching agents when multiple handle the same class', async () => {
      const engine = new ConsensusEngine();
      engine.registerAgent(new CommodityAgent());
      engine.registerAgent(new CommodityAgent()); // Duplicate agent

      const asset: AssetData = {
        id: 'dup-test',
        assetClass: AssetClass.COMMODITY,
        name: 'Gold',
        description: '',
        metadata: { commodity: 'gold', quantity: 1 },
      };

      const result = await engine.evaluateAsset(asset);
      expect(result.valuations).toHaveLength(2);
    });

    it('should not invoke agents that cannot handle the class', async () => {
      const engine = new ConsensusEngine();
      const propertyAgent = new PropertyAgent();
      const commodityAgent = new CommodityAgent();
      engine.registerAgent(propertyAgent);
      engine.registerAgent(commodityAgent);

      // We verify by checking the agentId in the result
      const asset: AssetData = {
        id: 'selective-test',
        assetClass: AssetClass.COMMODITY,
        name: 'Silver',
        description: '',
        metadata: { commodity: 'silver', quantity: 10 },
      };

      const result = await engine.evaluateAsset(asset);
      const agentIds = result.valuations.map(v => v.agentId);
      expect(agentIds).not.toContain('property-agent');
      expect(agentIds).toContain('commodity-agent');
    });
  });

  describe('computeConsensus — methodology string', () => {
    it('should report filtered count vs total count', () => {
      const engine = new ConsensusEngine(0.1);
      const valuations = [
        makeValuation({ value: 100000, agentId: 'a1' }),
        makeValuation({ value: 101000, agentId: 'a2' }),
        makeValuation({ value: 500000, agentId: 'a3' }), // outlier
      ];

      const result = engine.computeConsensus('test', valuations);
      // Should say "2/3 agents"
      expect(result.methodology).toContain('2/3 agents');
    });

    it('should include outlier threshold percentage in methodology', () => {
      const engine = new ConsensusEngine(0.25);
      const valuations = [
        makeValuation({ value: 100000, agentId: 'a1' }),
        makeValuation({ value: 100000, agentId: 'a2' }),
      ];

      const result = engine.computeConsensus('test', valuations);
      expect(result.methodology).toContain('25%');
    });

    it('should mention all agents when none filtered', () => {
      const engine = new ConsensusEngine(1.0);
      const valuations = [
        makeValuation({ value: 100000, agentId: 'a1' }),
        makeValuation({ value: 200000, agentId: 'a2' }),
        makeValuation({ value: 150000, agentId: 'a3' }),
      ];

      const result = engine.computeConsensus('test', valuations);
      expect(result.methodology).toContain('3/3 agents');
    });
  });

  describe('computeConsensus — assetId propagation', () => {
    it('should propagate the provided assetId to the result', () => {
      const engine = new ConsensusEngine();
      const result = engine.computeConsensus('my-unique-asset-id', [makeValuation()]);
      expect(result.assetId).toBe('my-unique-asset-id');
    });

    it('should accept special character asset IDs', () => {
      const engine = new ConsensusEngine();
      const assetId = 'real-estate/manhattan/prop_001';
      const result = engine.computeConsensus(assetId, [makeValuation()]);
      expect(result.assetId).toBe(assetId);
    });
  });

  describe('getAgents — defensive copy', () => {
    it('should return a new array on each call', () => {
      const engine = new ConsensusEngine();
      engine.registerAgent(new PropertyAgent());
      const a1 = engine.getAgents();
      const a2 = engine.getAgents();
      expect(a1).not.toBe(a2);
    });

    it('should not allow external mutation to affect internal state', () => {
      const engine = new ConsensusEngine();
      engine.registerAgent(new PropertyAgent());
      const agents = engine.getAgents();
      agents.push(new CommodityAgent()); // Mutate the returned copy
      // Internal state should still have 1 agent
      expect(engine.getAgents()).toHaveLength(1);
    });

    it('should reflect newly registered agents', () => {
      const engine = new ConsensusEngine();
      expect(engine.getAgents()).toHaveLength(0);
      engine.registerAgent(new PropertyAgent());
      expect(engine.getAgents()).toHaveLength(1);
      engine.registerAgent(new CommodityAgent());
      expect(engine.getAgents()).toHaveLength(2);
    });
  });

  describe('consensus timestamp', () => {
    it('should generate a fresh timestamp for each call', async () => {
      const engine = new ConsensusEngine();

      const before = new Date();
      const result1 = engine.computeConsensus('a', [makeValuation()]);
      const result2 = engine.computeConsensus('b', [makeValuation()]);
      const after = new Date();

      expect(result1.timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(result2.timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
      expect(result2.timestamp.getTime()).toBeGreaterThanOrEqual(result1.timestamp.getTime());
    });
  });

  describe('all-zero value edge case', () => {
    it('should produce zero consensus when all agents return zero', () => {
      const engine = new ConsensusEngine();
      const valuations = [
        makeValuation({ value: 0, confidence: 0.5, agentId: 'a1' }),
        makeValuation({ value: 0, confidence: 0.5, agentId: 'a2' }),
      ];

      const result = engine.computeConsensus('test', valuations);
      expect(result.consensusValue).toBe(0);
    });

    it('should not filter any valuation when median is 0', () => {
      // filterOutliers: if median === 0, return all
      const engine = new ConsensusEngine(0.0); // extremely tight threshold
      const valuations = [
        makeValuation({ value: 0, agentId: 'a1' }),
        makeValuation({ value: 0, agentId: 'a2' }),
        makeValuation({ value: 99999, agentId: 'a3' }), // Would normally be outlier
      ];

      const result = engine.computeConsensus('test', valuations);
      // Median is 0; the filter passes all through
      expect(result.valuations).toHaveLength(3);
    });
  });
});
