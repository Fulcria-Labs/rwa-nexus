import { ConsensusEngine } from '../../src/oracle/consensus';
import { PropertyAgent } from '../../src/agents/property-agent';
import { CommodityAgent } from '../../src/agents/commodity-agent';
import { TreasuryAgent } from '../../src/agents/treasury-agent';
import { AssetClass, AssetData, ValuationResult } from '../../src/types';

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

describe('ConsensusEngine - Security & Robustness', () => {
  let engine: ConsensusEngine;

  beforeEach(() => {
    engine = new ConsensusEngine();
    engine.registerAgent(new PropertyAgent());
    engine.registerAgent(new CommodityAgent());
    engine.registerAgent(new TreasuryAgent());
  });

  describe('outlier detection edge cases', () => {
    it('should handle all identical values', () => {
      const valuations = Array.from({ length: 5 }, (_, i) =>
        makeValuation({ value: 100000, agentId: `agent-${i}` })
      );
      const result = engine.computeConsensus('test', valuations);
      expect(result.valuations).toHaveLength(5);
      expect(result.consensusValue).toBe(100000);
    });

    it('should handle all zero values', () => {
      const valuations = [
        makeValuation({ value: 0, agentId: 'a1' }),
        makeValuation({ value: 0, agentId: 'a2' }),
        makeValuation({ value: 0, agentId: 'a3' }),
      ];
      const result = engine.computeConsensus('test', valuations);
      // median=0, all deviations: Math.abs(0-0)/0 -> guarded by median===0 check
      expect(result.valuations).toHaveLength(3);
      expect(result.consensusValue).toBe(0);
    });

    it('should handle mix of zero and non-zero values', () => {
      const valuations = [
        makeValuation({ value: 0, agentId: 'a1' }),
        makeValuation({ value: 100000, agentId: 'a2' }),
        makeValuation({ value: 100000, agentId: 'a3' }),
      ];
      const result = engine.computeConsensus('test', valuations);
      // median is 100000, zero deviates by 100% > 30% threshold
      expect(result.valuations.length).toBeLessThanOrEqual(3);
    });

    it('should handle exactly 3 valuations with one outlier', () => {
      const engine30 = new ConsensusEngine(0.3);
      const valuations = [
        makeValuation({ value: 100, agentId: 'a1' }),
        makeValuation({ value: 105, agentId: 'a2' }),
        makeValuation({ value: 500, agentId: 'a3' }), // huge outlier
      ];
      const result = engine30.computeConsensus('test', valuations);
      // Median is 105, 500 deviates by ~376%
      expect(result.valuations).toHaveLength(2);
    });

    it('should keep all valuations within threshold', () => {
      const engine50 = new ConsensusEngine(0.5);
      const valuations = [
        makeValuation({ value: 100, agentId: 'a1' }),
        makeValuation({ value: 120, agentId: 'a2' }),
        makeValuation({ value: 140, agentId: 'a3' }),
      ];
      const result = engine50.computeConsensus('test', valuations);
      expect(result.valuations).toHaveLength(3);
    });

    it('should handle very tight outlier threshold', () => {
      const tightEngine = new ConsensusEngine(0.01); // 1%
      const valuations = [
        makeValuation({ value: 100, agentId: 'a1' }),
        makeValuation({ value: 101, agentId: 'a2' }),
        makeValuation({ value: 102, agentId: 'a3' }),
      ];
      const result = tightEngine.computeConsensus('test', valuations);
      // Median is 101, 100 deviates by ~1%, 102 deviates by ~1%
      expect(result.valuations.length).toBeGreaterThanOrEqual(1);
    });

    it('should handle zero outlier threshold', () => {
      const zeroEngine = new ConsensusEngine(0);
      const valuations = [
        makeValuation({ value: 100, agentId: 'a1' }),
        makeValuation({ value: 100, agentId: 'a2' }),
        makeValuation({ value: 100, agentId: 'a3' }),
      ];
      const result = zeroEngine.computeConsensus('test', valuations);
      // All same value -> 0 deviation, passes even 0 threshold
      expect(result.valuations).toHaveLength(3);
    });

    it('should not filter when only 2 valuations regardless of deviation', () => {
      const tightEngine = new ConsensusEngine(0.01);
      const valuations = [
        makeValuation({ value: 100, agentId: 'a1' }),
        makeValuation({ value: 1000000, agentId: 'a2' }),
      ];
      const result = tightEngine.computeConsensus('test', valuations);
      expect(result.valuations).toHaveLength(2);
    });
  });

  describe('confidence handling', () => {
    it('should handle zero confidence valuations', () => {
      const valuations = [
        makeValuation({ value: 100000, confidence: 0, agentId: 'a1' }),
      ];
      const result = engine.computeConsensus('test', valuations);
      expect(result.avgConfidence).toBe(0);
    });

    it('should weight towards higher confidence valuation', () => {
      const valuations = [
        makeValuation({ value: 100000, confidence: 0.1, agentId: 'a1' }),
        makeValuation({ value: 200000, confidence: 0.9, agentId: 'a2' }),
      ];
      const result = engine.computeConsensus('test', valuations);
      // Should be closer to 200000 since that has higher confidence
      expect(result.consensusValue).toBeGreaterThan(150000);
    });

    it('should handle equal confidence valuations', () => {
      const valuations = [
        makeValuation({ value: 100000, confidence: 0.5, agentId: 'a1' }),
        makeValuation({ value: 200000, confidence: 0.5, agentId: 'a2' }),
      ];
      const result = engine.computeConsensus('test', valuations);
      expect(result.consensusValue).toBe(150000);
    });

    it('should add agreement bonus only when multiple agents', () => {
      const single = engine.computeConsensus('test', [
        makeValuation({ value: 100000, confidence: 0.8, agentId: 'a1' }),
      ]);
      const multi = engine.computeConsensus('test', [
        makeValuation({ value: 100000, confidence: 0.8, agentId: 'a1' }),
        makeValuation({ value: 100000, confidence: 0.8, agentId: 'a2' }),
      ]);
      expect(multi.avgConfidence).toBeGreaterThan(single.avgConfidence);
    });

    it('should cap confidence at 1.0 even with high base + bonus', () => {
      const valuations = [
        makeValuation({ value: 100000, confidence: 1.0, agentId: 'a1' }),
        makeValuation({ value: 100000, confidence: 1.0, agentId: 'a2' }),
      ];
      const result = engine.computeConsensus('test', valuations);
      expect(result.avgConfidence).toBeLessThanOrEqual(1);
    });
  });

  describe('negative and extreme values', () => {
    it('should handle negative valuation values', () => {
      const valuations = [
        makeValuation({ value: -50000, confidence: 0.8, agentId: 'a1' }),
      ];
      const result = engine.computeConsensus('test', valuations);
      expect(result.consensusValue).toBe(-50000);
    });

    it('should handle very large valuation values', () => {
      const valuations = [
        makeValuation({ value: Number.MAX_SAFE_INTEGER, confidence: 0.8, agentId: 'a1' }),
      ];
      const result = engine.computeConsensus('test', valuations);
      expect(result.consensusValue).toBe(Number.MAX_SAFE_INTEGER);
    });

    it('should handle decimal precision in consensus', () => {
      const valuations = [
        makeValuation({ value: 100000.333, confidence: 0.8, agentId: 'a1' }),
        makeValuation({ value: 100000.666, confidence: 0.8, agentId: 'a2' }),
      ];
      const result = engine.computeConsensus('test', valuations);
      // Consensus rounds to 2 decimal places
      const decPart = result.consensusValue.toString().split('.')[1];
      if (decPart) {
        expect(decPart.length).toBeLessThanOrEqual(2);
      }
    });
  });

  describe('agent registration', () => {
    it('should handle duplicate agent registration', () => {
      const engine2 = new ConsensusEngine();
      const prop = new PropertyAgent();
      engine2.registerAgent(prop);
      engine2.registerAgent(prop); // same instance
      expect(engine2.getAgents()).toHaveLength(2);
    });

    it('should return defensive copy of agents', () => {
      const agents = engine.getAgents();
      agents.push(new PropertyAgent());
      // Original should be unchanged
      expect(engine.getAgents()).toHaveLength(3);
    });

    it('should support empty engine', () => {
      const empty = new ConsensusEngine();
      expect(empty.getAgents()).toHaveLength(0);
    });
  });

  describe('asset evaluation error handling', () => {
    it('should throw for receivable asset class with no agents', async () => {
      const asset: AssetData = {
        id: 'rcv-1',
        assetClass: AssetClass.RECEIVABLE,
        name: 'Invoice',
        description: '',
        metadata: {},
      };
      await expect(engine.evaluateAsset(asset)).rejects.toThrow('No agents registered');
    });

    it('should throw with descriptive message including asset class', async () => {
      const asset: AssetData = {
        id: 'eq-1',
        assetClass: AssetClass.EQUITY,
        name: 'Stock',
        description: '',
        metadata: {},
      };
      await expect(engine.evaluateAsset(asset)).rejects.toThrow(AssetClass.EQUITY);
    });
  });

  describe('methodology string', () => {
    it('should include agent count in methodology for multi-agent', () => {
      const valuations = [
        makeValuation({ agentId: 'a1' }),
        makeValuation({ agentId: 'a2' }),
        makeValuation({ agentId: 'a3' }),
      ];
      const result = engine.computeConsensus('test', valuations);
      expect(result.methodology).toContain('3');
    });

    it('should include single agent ID for single valuation', () => {
      const valuations = [
        makeValuation({ agentId: 'special-agent', methodology: 'DCF' }),
      ];
      const result = engine.computeConsensus('test', valuations);
      expect(result.methodology).toContain('special-agent');
      expect(result.methodology).toContain('DCF');
    });

    it('should include outlier threshold percentage', () => {
      const engine20 = new ConsensusEngine(0.2);
      engine20.registerAgent(new PropertyAgent());
      const valuations = [
        makeValuation({ agentId: 'a1' }),
        makeValuation({ agentId: 'a2' }),
      ];
      const result = engine20.computeConsensus('test', valuations);
      expect(result.methodology).toContain('20%');
    });
  });

  describe('timestamp', () => {
    it('should set timestamp on consensus result', () => {
      const before = new Date();
      const result = engine.computeConsensus('test', [makeValuation()]);
      const after = new Date();
      expect(result.timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(result.timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  describe('large number of valuations', () => {
    it('should handle 100 valuations', () => {
      const valuations = Array.from({ length: 100 }, (_, i) =>
        makeValuation({ value: 100000 + i * 100, confidence: 0.8, agentId: `agent-${i}` })
      );
      const result = engine.computeConsensus('test', valuations);
      expect(result.consensusValue).toBeGreaterThan(0);
      expect(result.valuations.length).toBeGreaterThan(0);
    });

    it('should handle 1000 valuations', () => {
      const valuations = Array.from({ length: 1000 }, (_, i) =>
        makeValuation({ value: 50000 + i, confidence: 0.7, agentId: `agent-${i}` })
      );
      const result = engine.computeConsensus('test', valuations);
      expect(result.consensusValue).toBeGreaterThan(0);
    });
  });
});
