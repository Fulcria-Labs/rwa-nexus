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

describe('ConsensusEngine - Advanced', () => {
  describe('outlier detection', () => {
    it('should filter outliers with tight threshold (10%)', () => {
      const engine = new ConsensusEngine(0.1);
      const valuations = [
        makeValuation({ value: 100000, agentId: 'a1' }),
        makeValuation({ value: 105000, agentId: 'a2' }),
        makeValuation({ value: 150000, agentId: 'a3' }), // 50% deviation - outlier
      ];

      const result = engine.computeConsensus('test', valuations);
      expect(result.valuations).toHaveLength(2);
    });

    it('should keep all valuations with loose threshold (100%)', () => {
      const engine = new ConsensusEngine(1.0);
      const valuations = [
        makeValuation({ value: 100000, agentId: 'a1' }),
        makeValuation({ value: 200000, agentId: 'a2' }),
        makeValuation({ value: 50000, agentId: 'a3' }),
      ];

      const result = engine.computeConsensus('test', valuations);
      expect(result.valuations).toHaveLength(3);
    });

    it('should not filter when median is 0', () => {
      const engine = new ConsensusEngine(0.1);
      const valuations = [
        makeValuation({ value: 0, agentId: 'a1' }),
        makeValuation({ value: 0, agentId: 'a2' }),
        makeValuation({ value: 100000, agentId: 'a3' }),
      ];

      const result = engine.computeConsensus('test', valuations);
      // Median is 0, so all pass the filter
      expect(result.valuations).toHaveLength(3);
    });

    it('should not filter when only 2 valuations', () => {
      const engine = new ConsensusEngine(0.01); // Very tight threshold
      const valuations = [
        makeValuation({ value: 100000, agentId: 'a1' }),
        makeValuation({ value: 500000, agentId: 'a2' }),
      ];

      const result = engine.computeConsensus('test', valuations);
      expect(result.valuations).toHaveLength(2);
    });

    it('should filter multiple outliers', () => {
      const engine = new ConsensusEngine(0.2);
      const valuations = [
        makeValuation({ value: 100000, agentId: 'a1' }),
        makeValuation({ value: 105000, agentId: 'a2' }),
        makeValuation({ value: 103000, agentId: 'a3' }),
        makeValuation({ value: 200000, agentId: 'a4' }), // outlier
        makeValuation({ value: 10000, agentId: 'a5' }),  // outlier
      ];

      const result = engine.computeConsensus('test', valuations);
      expect(result.valuations.length).toBeLessThan(5);
    });

    it('should use median (not mean) for outlier detection', () => {
      const engine = new ConsensusEngine(0.15);
      // Median is 100000, not the mean
      const valuations = [
        makeValuation({ value: 95000, agentId: 'a1' }),
        makeValuation({ value: 100000, agentId: 'a2' }),
        makeValuation({ value: 105000, agentId: 'a3' }),
        makeValuation({ value: 500000, agentId: 'a4' }),  // outlier
        makeValuation({ value: 1000000, agentId: 'a5' }), // outlier
      ];

      const result = engine.computeConsensus('test', valuations);
      // Median is 105000. 500000 deviates ~376% and 1M deviates ~852%
      expect(result.valuations.length).toBeLessThanOrEqual(3);
    });
  });

  describe('confidence-weighted averaging', () => {
    it('should weight higher-confidence valuations more', () => {
      const engine = new ConsensusEngine();
      const valuations = [
        makeValuation({ value: 200000, confidence: 0.9, agentId: 'a1' }),
        makeValuation({ value: 100000, confidence: 0.1, agentId: 'a2' }),
      ];

      const result = engine.computeConsensus('test', valuations);
      // (200000*0.9 + 100000*0.1) / (0.9+0.1) = 190000
      expect(result.consensusValue).toBe(190000);
    });

    it('should handle equal confidence weights', () => {
      const engine = new ConsensusEngine();
      const valuations = [
        makeValuation({ value: 100000, confidence: 0.5, agentId: 'a1' }),
        makeValuation({ value: 200000, confidence: 0.5, agentId: 'a2' }),
      ];

      const result = engine.computeConsensus('test', valuations);
      expect(result.consensusValue).toBe(150000);
    });

    it('should return 0 when total weight is 0', () => {
      const engine = new ConsensusEngine();
      const valuations = [
        makeValuation({ value: 100000, confidence: 0, agentId: 'a1' }),
        makeValuation({ value: 200000, confidence: 0, agentId: 'a2' }),
      ];

      const result = engine.computeConsensus('test', valuations);
      expect(result.consensusValue).toBe(0);
    });

    it('should round consensus to 2 decimal places', () => {
      const engine = new ConsensusEngine();
      const valuations = [
        makeValuation({ value: 100000, confidence: 0.3, agentId: 'a1' }),
        makeValuation({ value: 200000, confidence: 0.7, agentId: 'a2' }),
      ];

      const result = engine.computeConsensus('test', valuations);
      const decimals = result.consensusValue.toString().split('.')[1];
      if (decimals) {
        expect(decimals.length).toBeLessThanOrEqual(2);
      }
    });
  });

  describe('agreement bonus', () => {
    it('should add 0.05 bonus when 2+ agents agree', () => {
      const engine = new ConsensusEngine();
      const valuations = [
        makeValuation({ value: 100000, confidence: 0.7, agentId: 'a1' }),
        makeValuation({ value: 100000, confidence: 0.7, agentId: 'a2' }),
      ];

      const result = engine.computeConsensus('test', valuations);
      // Avg confidence: 0.7, + 0.05 bonus = 0.75
      expect(result.avgConfidence).toBe(0.75);
    });

    it('should not add bonus for single agent', () => {
      const engine = new ConsensusEngine();
      const valuations = [
        makeValuation({ value: 100000, confidence: 0.7, agentId: 'a1' }),
      ];

      const result = engine.computeConsensus('test', valuations);
      expect(result.avgConfidence).toBe(0.7);
    });

    it('should cap final confidence at 1.0', () => {
      const engine = new ConsensusEngine();
      const valuations = [
        makeValuation({ value: 100000, confidence: 0.98, agentId: 'a1' }),
        makeValuation({ value: 100000, confidence: 0.99, agentId: 'a2' }),
      ];

      const result = engine.computeConsensus('test', valuations);
      expect(result.avgConfidence).toBeLessThanOrEqual(1);
    });
  });

  describe('methodology string', () => {
    it('should describe single agent consensus', () => {
      const engine = new ConsensusEngine();
      const valuations = [
        makeValuation({ agentId: 'property-agent', methodology: 'comparable sales' }),
      ];

      const result = engine.computeConsensus('test', valuations);
      expect(result.methodology).toContain('Single agent');
      expect(result.methodology).toContain('property-agent');
    });

    it('should describe multi-agent consensus with filter count', () => {
      const engine = new ConsensusEngine(0.1);
      const valuations = [
        makeValuation({ value: 100000, agentId: 'a1' }),
        makeValuation({ value: 102000, agentId: 'a2' }),
        makeValuation({ value: 500000, agentId: 'a3' }),
      ];

      const result = engine.computeConsensus('test', valuations);
      expect(result.methodology).toContain('Confidence-weighted consensus');
      expect(result.methodology).toContain('/3 agents');
    });
  });

  describe('multi-asset evaluation', () => {
    it('should evaluate multiple assets sequentially', async () => {
      const engine = new ConsensusEngine();
      engine.registerAgent(new PropertyAgent());
      engine.registerAgent(new CommodityAgent());
      engine.registerAgent(new TreasuryAgent());

      const property: AssetData = {
        id: 'multi-prop',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Property',
        description: '',
        location: 'miami',
        metadata: { squareFeet: 1000 },
      };

      const gold: AssetData = {
        id: 'multi-gold',
        assetClass: AssetClass.COMMODITY,
        name: 'Gold',
        description: '',
        metadata: { commodity: 'gold', quantity: 10 },
      };

      const bond: AssetData = {
        id: 'multi-bond',
        assetClass: AssetClass.TREASURY,
        name: 'Bond',
        description: '',
        metadata: { maturityYears: 10, couponRate: 0.04, faceValue: 1000 },
      };

      const [propResult, goldResult, bondResult] = await Promise.all([
        engine.evaluateAsset(property),
        engine.evaluateAsset(gold),
        engine.evaluateAsset(bond),
      ]);

      expect(propResult.consensusValue).toBeGreaterThan(0);
      expect(goldResult.consensusValue).toBeGreaterThan(0);
      expect(bondResult.consensusValue).toBeGreaterThan(0);

      // Each should have different values
      expect(propResult.consensusValue).not.toBe(goldResult.consensusValue);
    });

    it('should handle multiple property agents for consensus', async () => {
      const engine = new ConsensusEngine();
      engine.registerAgent(new PropertyAgent());
      engine.registerAgent(new PropertyAgent()); // Duplicate for consensus

      const asset: AssetData = {
        id: 'dual-prop',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Property',
        description: '',
        location: 'manhattan',
        metadata: { squareFeet: 1000 },
      };

      const result = await engine.evaluateAsset(asset);
      expect(result.valuations).toHaveLength(2);
      // Both should agree perfectly (same agent type)
      expect(result.valuations[0].value).toBe(result.valuations[1].value);
    });
  });

  describe('edge cases', () => {
    it('should throw on empty engine for unsupported class', async () => {
      const engine = new ConsensusEngine();
      const asset: AssetData = {
        id: 'empty-test',
        assetClass: AssetClass.EQUITY,
        name: 'Test',
        description: '',
        metadata: {},
      };

      await expect(engine.evaluateAsset(asset)).rejects.toThrow('No agents registered');
    });

    it('should return agents as defensive copy', () => {
      const engine = new ConsensusEngine();
      engine.registerAgent(new PropertyAgent());

      const agents1 = engine.getAgents();
      const agents2 = engine.getAgents();

      expect(agents1).not.toBe(agents2); // Different array reference
      expect(agents1).toHaveLength(agents2.length);
    });

    it('should handle single valuation with consensus engine', () => {
      const engine = new ConsensusEngine();
      const valuations = [
        makeValuation({ value: 12345.67, confidence: 0.88, agentId: 'solo' }),
      ];

      const result = engine.computeConsensus('single', valuations);
      expect(result.consensusValue).toBe(12345.67);
      expect(result.avgConfidence).toBe(0.88);
      expect(result.assetId).toBe('single');
    });

    it('should include timestamp in result', () => {
      const engine = new ConsensusEngine();
      const before = new Date();
      const result = engine.computeConsensus('ts-test', [makeValuation()]);
      const after = new Date();

      expect(result.timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(result.timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });
});
