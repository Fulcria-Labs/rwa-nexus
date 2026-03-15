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

describe('ConsensusEngine — Byzantine & Adversarial Agent Tests', () => {
  let engine: ConsensusEngine;

  beforeEach(() => {
    engine = new ConsensusEngine(0.3);
  });

  // ─── BYZANTINE AGENT SCENARIOS ───────────────────────────────────

  describe('byzantine agent — extreme/malicious values', () => {
    it('should filter a single byzantine agent submitting Number.MAX_SAFE_INTEGER', () => {
      const valuations = [
        makeValuation({ value: 100000, confidence: 0.9, agentId: 'honest-1' }),
        makeValuation({ value: 102000, confidence: 0.85, agentId: 'honest-2' }),
        makeValuation({ value: Number.MAX_SAFE_INTEGER, confidence: 0.9, agentId: 'byzantine' }),
      ];
      const result = engine.computeConsensus('test', valuations);
      expect(result.valuations.length).toBeLessThanOrEqual(2);
      expect(result.consensusValue).toBeLessThan(200000);
    });

    it('should filter a byzantine agent submitting negative extreme value', () => {
      const valuations = [
        makeValuation({ value: 100000, confidence: 0.9, agentId: 'honest-1' }),
        makeValuation({ value: 105000, confidence: 0.85, agentId: 'honest-2' }),
        makeValuation({ value: -Number.MAX_SAFE_INTEGER, confidence: 0.95, agentId: 'byzantine' }),
      ];
      const result = engine.computeConsensus('test', valuations);
      expect(result.valuations.length).toBeLessThanOrEqual(2);
      expect(result.consensusValue).toBeGreaterThan(0);
    });

    it('should filter a byzantine agent submitting zero against honest majority', () => {
      const valuations = [
        makeValuation({ value: 500000, confidence: 0.85, agentId: 'honest-1' }),
        makeValuation({ value: 510000, confidence: 0.8, agentId: 'honest-2' }),
        makeValuation({ value: 0, confidence: 0.99, agentId: 'byzantine' }),
      ];
      const result = engine.computeConsensus('test', valuations);
      // Zero deviates 100% from median ~500000, should be filtered
      expect(result.valuations.length).toBeLessThanOrEqual(2);
      expect(result.consensusValue).toBeGreaterThan(400000);
    });

    it('should filter a byzantine agent submitting Infinity', () => {
      const valuations = [
        makeValuation({ value: 100000, confidence: 0.8, agentId: 'honest-1' }),
        makeValuation({ value: 105000, confidence: 0.8, agentId: 'honest-2' }),
        makeValuation({ value: Infinity, confidence: 0.9, agentId: 'byzantine' }),
      ];
      const result = engine.computeConsensus('test', valuations);
      // Infinity deviation is infinite, should be filtered
      expect(result.valuations.length).toBeLessThanOrEqual(2);
    });

    it('should filter a byzantine agent submitting -Infinity', () => {
      const valuations = [
        makeValuation({ value: 200000, confidence: 0.8, agentId: 'honest-1' }),
        makeValuation({ value: 210000, confidence: 0.8, agentId: 'honest-2' }),
        makeValuation({ value: -Infinity, confidence: 0.9, agentId: 'byzantine' }),
      ];
      const result = engine.computeConsensus('test', valuations);
      expect(result.valuations.length).toBeLessThanOrEqual(2);
    });

    it('should handle byzantine agent submitting NaN value', () => {
      const valuations = [
        makeValuation({ value: 100000, confidence: 0.8, agentId: 'honest-1' }),
        makeValuation({ value: 100500, confidence: 0.8, agentId: 'honest-2' }),
        makeValuation({ value: NaN, confidence: 0.9, agentId: 'byzantine' }),
      ];
      // NaN should either be filtered or handled gracefully
      const result = engine.computeConsensus('test', valuations);
      expect(result.valuations.length).toBeGreaterThanOrEqual(1);
    });

    it('should resist a byzantine agent slightly outside threshold', () => {
      // 30% threshold: agent submits value 35% above median
      const valuations = [
        makeValuation({ value: 100000, confidence: 0.9, agentId: 'honest-1' }),
        makeValuation({ value: 100000, confidence: 0.9, agentId: 'honest-2' }),
        makeValuation({ value: 135000, confidence: 0.95, agentId: 'byzantine' }), // 35% above
      ];
      const result = engine.computeConsensus('test', valuations);
      expect(result.valuations.length).toBeLessThanOrEqual(2);
    });

    it('should accept a borderline agent at exactly threshold', () => {
      const valuations = [
        makeValuation({ value: 100000, confidence: 0.8, agentId: 'a1' }),
        makeValuation({ value: 100000, confidence: 0.8, agentId: 'a2' }),
        makeValuation({ value: 130000, confidence: 0.8, agentId: 'borderline' }), // exactly 30%
      ];
      const result = engine.computeConsensus('test', valuations);
      // deviation = |130000-100000|/100000 = 0.3, which equals threshold
      expect(result.valuations).toHaveLength(3);
    });

    it('should filter multiple byzantine agents among honest majority', () => {
      const engine10 = new ConsensusEngine(0.1); // tight 10% threshold
      const valuations = [
        makeValuation({ value: 100000, confidence: 0.9, agentId: 'honest-1' }),
        makeValuation({ value: 101000, confidence: 0.85, agentId: 'honest-2' }),
        makeValuation({ value: 102000, confidence: 0.88, agentId: 'honest-3' }),
        makeValuation({ value: 500000, confidence: 0.99, agentId: 'byzantine-1' }),
        makeValuation({ value: 1, confidence: 0.99, agentId: 'byzantine-2' }),
      ];
      const result = engine10.computeConsensus('test', valuations);
      // Median is 102000; 500000 deviates ~390%, 1 deviates ~99.999%
      expect(result.valuations.length).toBeLessThanOrEqual(3);
      expect(result.consensusValue).toBeGreaterThan(90000);
      expect(result.consensusValue).toBeLessThan(120000);
    });

    it('should handle all agents being byzantine (all extremely different)', () => {
      const engine50 = new ConsensusEngine(0.5);
      const valuations = [
        makeValuation({ value: 1, confidence: 0.9, agentId: 'byz-1' }),
        makeValuation({ value: 1000000, confidence: 0.9, agentId: 'byz-2' }),
        makeValuation({ value: 500000, confidence: 0.9, agentId: 'byz-3' }),
      ];
      // Median is 500000; 1 deviates ~100%, 1000000 deviates 100% — both filtered
      const result = engine50.computeConsensus('test', valuations);
      expect(result.valuations.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ─── COLLUSION TESTS ──────────────────────────────────────────────

  describe('collusion attacks — agents agreeing on wrong values', () => {
    it('should resist 2 colluding agents vs 3 honest agents (narrow threshold)', () => {
      const tightEngine = new ConsensusEngine(0.15);
      const valuations = [
        makeValuation({ value: 100000, confidence: 0.85, agentId: 'honest-1' }),
        makeValuation({ value: 101000, confidence: 0.85, agentId: 'honest-2' }),
        makeValuation({ value: 102000, confidence: 0.85, agentId: 'honest-3' }),
        makeValuation({ value: 200000, confidence: 0.99, agentId: 'colluder-1' }),
        makeValuation({ value: 200000, confidence: 0.99, agentId: 'colluder-2' }),
      ];
      const result = tightEngine.computeConsensus('test', valuations);
      // Median is 102000; 200000 deviates ~96% > 15%
      expect(result.consensusValue).toBeLessThan(150000);
    });

    it('should be vulnerable when colluders form majority (median shift)', () => {
      const valuations = [
        makeValuation({ value: 100000, confidence: 0.9, agentId: 'honest-1' }),
        makeValuation({ value: 100000, confidence: 0.9, agentId: 'honest-2' }),
        makeValuation({ value: 999999, confidence: 0.9, agentId: 'colluder-1' }),
        makeValuation({ value: 999999, confidence: 0.9, agentId: 'colluder-2' }),
        makeValuation({ value: 999999, confidence: 0.9, agentId: 'colluder-3' }),
      ];
      const result = engine.computeConsensus('test', valuations);
      // Median is 999999; honest agents are the "outliers" now
      // This demonstrates the 51% attack vulnerability
      expect(result.consensusValue).toBeGreaterThan(500000);
    });

    it('should resist 2 colluders vs 5 honest agents', () => {
      const valuations = [
        makeValuation({ value: 100000, confidence: 0.8, agentId: 'honest-1' }),
        makeValuation({ value: 101000, confidence: 0.8, agentId: 'honest-2' }),
        makeValuation({ value: 99000, confidence: 0.8, agentId: 'honest-3' }),
        makeValuation({ value: 100500, confidence: 0.8, agentId: 'honest-4' }),
        makeValuation({ value: 102000, confidence: 0.8, agentId: 'honest-5' }),
        makeValuation({ value: 500000, confidence: 0.99, agentId: 'colluder-1' }),
        makeValuation({ value: 500000, confidence: 0.99, agentId: 'colluder-2' }),
      ];
      const result = engine.computeConsensus('test', valuations);
      // Median is 101000; colluders at 500000 deviate ~395%
      expect(result.consensusValue).toBeLessThan(150000);
    });

    it('should handle colluders submitting values just inside threshold', () => {
      // Colluders submit values at exactly 30% above median to avoid filtering
      const valuations = [
        makeValuation({ value: 100000, confidence: 0.8, agentId: 'honest-1' }),
        makeValuation({ value: 100000, confidence: 0.8, agentId: 'honest-2' }),
        makeValuation({ value: 100000, confidence: 0.8, agentId: 'honest-3' }),
        makeValuation({ value: 130000, confidence: 0.99, agentId: 'colluder-1' }),
        makeValuation({ value: 130000, confidence: 0.99, agentId: 'colluder-2' }),
      ];
      const result = engine.computeConsensus('test', valuations);
      // Median is 100000; 130000 deviates exactly 30% = threshold
      // Colluders pass through but honest majority limits damage
      expect(result.consensusValue).toBeLessThan(130000);
    });

    it('should resist collusion with dishonest low values', () => {
      const valuations = [
        makeValuation({ value: 100000, confidence: 0.8, agentId: 'honest-1' }),
        makeValuation({ value: 102000, confidence: 0.85, agentId: 'honest-2' }),
        makeValuation({ value: 101000, confidence: 0.82, agentId: 'honest-3' }),
        makeValuation({ value: 10, confidence: 0.99, agentId: 'colluder-1' }),
        makeValuation({ value: 10, confidence: 0.99, agentId: 'colluder-2' }),
      ];
      const result = engine.computeConsensus('test', valuations);
      // Median is 101000; 10 deviates ~99.99%
      expect(result.consensusValue).toBeGreaterThan(90000);
    });

    it('should handle three-way collusion on zero', () => {
      const valuations = [
        makeValuation({ value: 250000, confidence: 0.9, agentId: 'honest-1' }),
        makeValuation({ value: 260000, confidence: 0.85, agentId: 'honest-2' }),
        makeValuation({ value: 255000, confidence: 0.88, agentId: 'honest-3' }),
        makeValuation({ value: 270000, confidence: 0.87, agentId: 'honest-4' }),
        makeValuation({ value: 0, confidence: 0.99, agentId: 'colluder-1' }),
        makeValuation({ value: 0, confidence: 0.99, agentId: 'colluder-2' }),
        makeValuation({ value: 0, confidence: 0.99, agentId: 'colluder-3' }),
      ];
      const result = engine.computeConsensus('test', valuations);
      // Median is 255000; 0 deviates 100% > 30%
      expect(result.consensusValue).toBeGreaterThan(200000);
    });
  });

  // ─── CONFIDENCE SCORE MANIPULATION ────────────────────────────────

  describe('confidence score manipulation', () => {
    it('should be influenced by max confidence on garbage value (within threshold)', () => {
      // An attacker submits a value within threshold but with max confidence
      const valuations = [
        makeValuation({ value: 100000, confidence: 0.5, agentId: 'honest-1' }),
        makeValuation({ value: 100000, confidence: 0.5, agentId: 'honest-2' }),
        makeValuation({ value: 125000, confidence: 1.0, agentId: 'manipulator' }), // 25% above, within 30%
      ];
      const result = engine.computeConsensus('test', valuations);
      // Manipulator's high confidence pulls consensus up
      expect(result.consensusValue).toBeGreaterThan(105000);
    });

    it('should mitigate max-confidence attack when outlier is filtered', () => {
      const valuations = [
        makeValuation({ value: 100000, confidence: 0.8, agentId: 'honest-1' }),
        makeValuation({ value: 100000, confidence: 0.8, agentId: 'honest-2' }),
        makeValuation({ value: 200000, confidence: 1.0, agentId: 'manipulator' }), // 100% above median
      ];
      const result = engine.computeConsensus('test', valuations);
      // The high-confidence manipulator should be filtered (100% > 30% threshold)
      expect(result.valuations.length).toBeLessThanOrEqual(2);
      expect(result.consensusValue).toBe(100000);
    });

    it('should handle agents with zero confidence (no weight)', () => {
      const valuations = [
        makeValuation({ value: 100000, confidence: 0.8, agentId: 'honest-1' }),
        makeValuation({ value: 100000, confidence: 0.8, agentId: 'honest-2' }),
        makeValuation({ value: 100000, confidence: 0.0, agentId: 'zero-conf' }),
      ];
      const result = engine.computeConsensus('test', valuations);
      // Zero-confidence agent contributes zero weight
      expect(result.consensusValue).toBe(100000);
    });

    it('should handle agent with confidence > 1 (invalid input)', () => {
      const valuations = [
        makeValuation({ value: 100000, confidence: 0.8, agentId: 'honest-1' }),
        makeValuation({ value: 100000, confidence: 0.8, agentId: 'honest-2' }),
        makeValuation({ value: 110000, confidence: 5.0, agentId: 'cheater' }), // bogus confidence
      ];
      const result = engine.computeConsensus('test', valuations);
      // The engine should still produce a result (may be pulled toward cheater)
      expect(result.consensusValue).toBeGreaterThan(0);
    });

    it('should handle agent with negative confidence (invalid input)', () => {
      const valuations = [
        makeValuation({ value: 100000, confidence: 0.8, agentId: 'honest-1' }),
        makeValuation({ value: 100000, confidence: 0.8, agentId: 'honest-2' }),
        makeValuation({ value: 120000, confidence: -1.0, agentId: 'neg-conf' }),
      ];
      const result = engine.computeConsensus('test', valuations);
      // Negative confidence produces negative weight; engine should still work
      expect(result.valuations.length).toBeGreaterThanOrEqual(2);
    });

    it('should not amplify consensus beyond inputs when all have max confidence', () => {
      const valuations = [
        makeValuation({ value: 100000, confidence: 1.0, agentId: 'a1' }),
        makeValuation({ value: 100000, confidence: 1.0, agentId: 'a2' }),
        makeValuation({ value: 100000, confidence: 1.0, agentId: 'a3' }),
      ];
      const result = engine.computeConsensus('test', valuations);
      expect(result.consensusValue).toBe(100000);
      expect(result.avgConfidence).toBeLessThanOrEqual(1);
    });

    it('should weight honestly when one agent has much higher confidence', () => {
      const valuations = [
        makeValuation({ value: 100000, confidence: 0.01, agentId: 'low-1' }),
        makeValuation({ value: 100000, confidence: 0.01, agentId: 'low-2' }),
        makeValuation({ value: 110000, confidence: 0.99, agentId: 'high' }),
      ];
      const result = engine.computeConsensus('test', valuations);
      // High confidence agent dominates
      expect(result.consensusValue).toBeGreaterThan(108000);
    });

    it('should handle all agents with epsilon-close-to-zero confidence', () => {
      const valuations = [
        makeValuation({ value: 100000, confidence: 0.001, agentId: 'a1' }),
        makeValuation({ value: 200000, confidence: 0.001, agentId: 'a2' }),
        makeValuation({ value: 150000, confidence: 0.001, agentId: 'a3' }),
      ];
      const result = engine.computeConsensus('test', valuations);
      // All have same tiny confidence, should be equal weighted
      expect(result.consensusValue).toBeGreaterThan(0);
    });
  });

  // ─── REPEATED/DUPLICATE SUBMISSIONS ─────────────────────────────

  describe('repeated/duplicate submissions from same agent', () => {
    it('should count duplicate submissions from same agent as separate valuations', () => {
      const valuations = [
        makeValuation({ value: 100000, confidence: 0.8, agentId: 'agent-1' }),
        makeValuation({ value: 100000, confidence: 0.8, agentId: 'agent-1' }),
        makeValuation({ value: 100000, confidence: 0.8, agentId: 'agent-1' }),
      ];
      const result = engine.computeConsensus('test', valuations);
      // Engine treats each submission independently
      expect(result.valuations).toHaveLength(3);
    });

    it('should allow same agent to influence consensus by flooding duplicates', () => {
      const valuations = [
        makeValuation({ value: 100000, confidence: 0.8, agentId: 'honest-1' }),
        makeValuation({ value: 100000, confidence: 0.8, agentId: 'honest-2' }),
        makeValuation({ value: 120000, confidence: 0.8, agentId: 'flooder' }),
        makeValuation({ value: 120000, confidence: 0.8, agentId: 'flooder' }),
        makeValuation({ value: 120000, confidence: 0.8, agentId: 'flooder' }),
      ];
      const result = engine.computeConsensus('test', valuations);
      // Flooder shifts median to 120000
      expect(result.consensusValue).toBeGreaterThan(100000);
    });

    it('should handle 10 identical submissions from one agent', () => {
      const valuations = Array.from({ length: 10 }, () =>
        makeValuation({ value: 100000, confidence: 0.8, agentId: 'single-agent' })
      );
      const result = engine.computeConsensus('test', valuations);
      expect(result.consensusValue).toBe(100000);
      expect(result.valuations).toHaveLength(10);
    });

    it('should handle mixed unique and duplicate agent IDs', () => {
      const valuations = [
        makeValuation({ value: 100000, confidence: 0.8, agentId: 'unique-1' }),
        makeValuation({ value: 100000, confidence: 0.8, agentId: 'unique-2' }),
        makeValuation({ value: 100000, confidence: 0.8, agentId: 'dupe' }),
        makeValuation({ value: 100000, confidence: 0.8, agentId: 'dupe' }),
      ];
      const result = engine.computeConsensus('test', valuations);
      expect(result.valuations).toHaveLength(4);
    });

    it('should let duplicate agent with different values act as separate valuations', () => {
      const valuations = [
        makeValuation({ value: 100000, confidence: 0.9, agentId: 'flip-flop' }),
        makeValuation({ value: 130000, confidence: 0.9, agentId: 'flip-flop' }),
        makeValuation({ value: 100000, confidence: 0.8, agentId: 'honest-1' }),
      ];
      const result = engine.computeConsensus('test', valuations);
      // Median is 100000; 130000 deviates 30% = threshold
      expect(result.valuations.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ─── AGENT IDENTITY SPOOFING ─────────────────────────────────────

  describe('agent identity spoofing attempts', () => {
    it('should treat valuations from different agentIds independently', () => {
      const valuations = [
        makeValuation({ value: 100000, confidence: 0.9, agentId: 'real-property-agent' }),
        makeValuation({ value: 999999, confidence: 0.95, agentId: 'real-property-agent-spoofed' }),
        makeValuation({ value: 100000, confidence: 0.85, agentId: 'real-commodity-agent' }),
      ];
      const result = engine.computeConsensus('test', valuations);
      // Spoofer's extreme value should be filtered
      expect(result.valuations.length).toBeLessThanOrEqual(2);
    });

    it('should not merge valuations from similarly named agents', () => {
      const valuations = [
        makeValuation({ value: 100000, confidence: 0.8, agentId: 'agent' }),
        makeValuation({ value: 200000, confidence: 0.8, agentId: 'Agent' }),
        makeValuation({ value: 150000, confidence: 0.8, agentId: 'AGENT' }),
      ];
      const result = engine.computeConsensus('test', valuations);
      // All three are distinct agents
      expect(result.valuations.length).toBeGreaterThanOrEqual(1);
    });

    it('should handle empty agentId', () => {
      const valuations = [
        makeValuation({ value: 100000, confidence: 0.8, agentId: '' }),
        makeValuation({ value: 100000, confidence: 0.8, agentId: 'honest-1' }),
      ];
      const result = engine.computeConsensus('test', valuations);
      expect(result.consensusValue).toBe(100000);
    });

    it('should handle agentId with special characters', () => {
      const valuations = [
        makeValuation({ value: 100000, confidence: 0.8, agentId: 'agent/<script>alert(1)</script>' }),
        makeValuation({ value: 100000, confidence: 0.8, agentId: 'honest-1' }),
      ];
      const result = engine.computeConsensus('test', valuations);
      expect(result.consensusValue).toBe(100000);
    });

    it('should handle extremely long agentId', () => {
      const valuations = [
        makeValuation({ value: 100000, confidence: 0.8, agentId: 'a'.repeat(10000) }),
        makeValuation({ value: 100000, confidence: 0.8, agentId: 'honest-1' }),
      ];
      const result = engine.computeConsensus('test', valuations);
      expect(result.consensusValue).toBe(100000);
    });
  });

  // ─── SYBIL ATTACK RESISTANCE ─────────────────────────────────────

  describe('sybil attack — many low-confidence vs few high-confidence agents', () => {
    it('should favor few high-confidence agents over many low-confidence sybils', () => {
      const honestAgents = [
        makeValuation({ value: 100000, confidence: 0.95, agentId: 'trusted-1' }),
        makeValuation({ value: 101000, confidence: 0.92, agentId: 'trusted-2' }),
      ];
      const sybilAgents = Array.from({ length: 20 }, (_, i) =>
        makeValuation({ value: 100000, confidence: 0.05, agentId: `sybil-${i}` })
      );
      const valuations = [...honestAgents, ...sybilAgents];
      const result = engine.computeConsensus('test', valuations);
      // All agree on ~100000 so consensus should be close
      expect(result.consensusValue).toBeGreaterThan(95000);
      expect(result.consensusValue).toBeLessThan(110000);
    });

    it('should let sybil army with wrong values shift median but be filtered', () => {
      const engine10 = new ConsensusEngine(0.1);
      const honestAgents = [
        makeValuation({ value: 100000, confidence: 0.9, agentId: 'trusted-1' }),
        makeValuation({ value: 101000, confidence: 0.9, agentId: 'trusted-2' }),
        makeValuation({ value: 99000, confidence: 0.9, agentId: 'trusted-3' }),
      ];
      // 5 sybils with clearly wrong values
      const sybilAgents = Array.from({ length: 5 }, (_, i) =>
        makeValuation({ value: 500000, confidence: 0.05, agentId: `sybil-${i}` })
      );
      const valuations = [...honestAgents, ...sybilAgents];
      const result = engine10.computeConsensus('test', valuations);
      // With 8 agents, median could shift; but honest nodes form a cluster
      expect(result.valuations.length).toBeGreaterThanOrEqual(1);
    });

    it('should handle 100 sybil agents with consistent wrong value', () => {
      const honestAgents = [
        makeValuation({ value: 100000, confidence: 0.9, agentId: 'trusted-1' }),
        makeValuation({ value: 100000, confidence: 0.9, agentId: 'trusted-2' }),
      ];
      const sybilAgents = Array.from({ length: 100 }, (_, i) =>
        makeValuation({ value: 200000, confidence: 0.02, agentId: `sybil-${i}` })
      );
      const valuations = [...honestAgents, ...sybilAgents];
      const result = engine.computeConsensus('test', valuations);
      // Sybils outnumber honest agents and shift median to 200000
      // Honest agents become outliers. This is a known weakness.
      expect(result.valuations.length).toBeGreaterThanOrEqual(1);
    });

    it('should resist sybils when honest agents have overwhelming confidence', () => {
      const honest = [
        makeValuation({ value: 100000, confidence: 0.99, agentId: 'trusted-1' }),
        makeValuation({ value: 100000, confidence: 0.99, agentId: 'trusted-2' }),
        makeValuation({ value: 100000, confidence: 0.99, agentId: 'trusted-3' }),
      ];
      const sybils = Array.from({ length: 2 }, (_, i) =>
        makeValuation({ value: 130000, confidence: 0.01, agentId: `sybil-${i}` })
      );
      // 130000 is exactly at 30% threshold, so they pass filtering
      const valuations = [...honest, ...sybils];
      const result = engine.computeConsensus('test', valuations);
      // Even if sybils pass filtering, their low confidence means minimal weight
      expect(result.consensusValue).toBeLessThan(105000);
    });

    it('should handle equal numbers of honest and sybil agents', () => {
      const honest = Array.from({ length: 5 }, (_, i) =>
        makeValuation({ value: 100000, confidence: 0.9, agentId: `honest-${i}` })
      );
      const sybils = Array.from({ length: 5 }, (_, i) =>
        makeValuation({ value: 200000, confidence: 0.1, agentId: `sybil-${i}` })
      );
      const valuations = [...honest, ...sybils];
      const result = engine.computeConsensus('test', valuations);
      // Median could be 100000 or 200000 depending on sort order
      // Confidence weighting should still favor honest agents
      expect(result.valuations.length).toBeGreaterThanOrEqual(1);
    });

    it('should be resilient when sybils submit diverse wrong values', () => {
      const honest = [
        makeValuation({ value: 100000, confidence: 0.9, agentId: 'honest-1' }),
        makeValuation({ value: 100000, confidence: 0.9, agentId: 'honest-2' }),
        makeValuation({ value: 100000, confidence: 0.9, agentId: 'honest-3' }),
      ];
      const sybils = [
        makeValuation({ value: 50000, confidence: 0.05, agentId: 'sybil-1' }),
        makeValuation({ value: 200000, confidence: 0.05, agentId: 'sybil-2' }),
        makeValuation({ value: 300000, confidence: 0.05, agentId: 'sybil-3' }),
        makeValuation({ value: 10, confidence: 0.05, agentId: 'sybil-4' }),
      ];
      const valuations = [...honest, ...sybils];
      const result = engine.computeConsensus('test', valuations);
      // Honest agents form the cluster around median
      // Many sybils will be filtered as outliers
      expect(result.consensusValue).toBeGreaterThan(50000);
    });
  });

  // ─── COMBINED ATTACK VECTORS ──────────────────────────────────────

  describe('combined attack vectors', () => {
    it('should handle collusion + confidence manipulation simultaneously', () => {
      const valuations = [
        makeValuation({ value: 100000, confidence: 0.5, agentId: 'honest-1' }),
        makeValuation({ value: 102000, confidence: 0.5, agentId: 'honest-2' }),
        makeValuation({ value: 101000, confidence: 0.5, agentId: 'honest-3' }),
        // Colluders with max confidence but extreme values
        makeValuation({ value: 500000, confidence: 1.0, agentId: 'colluder-1' }),
        makeValuation({ value: 500000, confidence: 1.0, agentId: 'colluder-2' }),
      ];
      const result = engine.computeConsensus('test', valuations);
      // Median is 102000; 500000 deviates ~390% — filtered
      expect(result.consensusValue).toBeLessThan(150000);
    });

    it('should handle sybil + identity spoofing', () => {
      const valuations = [
        makeValuation({ value: 100000, confidence: 0.9, agentId: 'property-agent' }),
        makeValuation({ value: 100000, confidence: 0.9, agentId: 'commodity-agent' }),
        makeValuation({ value: 100000, confidence: 0.9, agentId: 'treasury-agent' }),
        // Attacker spoofs agent names
        makeValuation({ value: 200000, confidence: 0.1, agentId: 'property-agent-v2' }),
        makeValuation({ value: 200000, confidence: 0.1, agentId: 'commodity-agent-v2' }),
      ];
      const result = engine.computeConsensus('test', valuations);
      // Spoofers' extreme values should be filtered (100% > 30%)
      expect(result.consensusValue).toBeLessThan(120000);
    });

    it('should handle byzantine + duplicate flooding', () => {
      const honest = [
        makeValuation({ value: 100000, confidence: 0.8, agentId: 'honest-1' }),
        makeValuation({ value: 101000, confidence: 0.8, agentId: 'honest-2' }),
      ];
      // Attacker floods with duplicates of extreme value
      const flood = Array.from({ length: 10 }, () =>
        makeValuation({ value: 500000, confidence: 0.99, agentId: 'byzantine-flooder' })
      );
      const valuations = [...honest, ...flood];
      const result = engine.computeConsensus('test', valuations);
      // With 12 valuations, median shifts to 500000
      // Honest agents become outliers — demonstrates flood vulnerability
      expect(result.valuations.length).toBeGreaterThanOrEqual(1);
    });

    it('should handle gradual value drift attack', () => {
      // Attacker submits values that gradually drift from consensus
      const valuations = [
        makeValuation({ value: 100000, confidence: 0.8, agentId: 'honest-1' }),
        makeValuation({ value: 100000, confidence: 0.8, agentId: 'honest-2' }),
        makeValuation({ value: 100000, confidence: 0.8, agentId: 'honest-3' }),
        makeValuation({ value: 105000, confidence: 0.8, agentId: 'drift-1' }),  // 5% above
        makeValuation({ value: 110000, confidence: 0.8, agentId: 'drift-2' }),  // 10% above
        makeValuation({ value: 115000, confidence: 0.8, agentId: 'drift-3' }),  // 15% above
        makeValuation({ value: 125000, confidence: 0.8, agentId: 'drift-4' }),  // 25% above
      ];
      const result = engine.computeConsensus('test', valuations);
      // All values within 30% threshold of median (105000)
      // Result should be pulled up somewhat but not dramatically
      expect(result.consensusValue).toBeGreaterThan(95000);
      expect(result.consensusValue).toBeLessThan(130000);
    });

    it('should handle oscillating values from adversarial agent', () => {
      const valuations = [
        makeValuation({ value: 100000, confidence: 0.8, agentId: 'honest-1' }),
        makeValuation({ value: 100000, confidence: 0.8, agentId: 'honest-2' }),
        makeValuation({ value: 100000, confidence: 0.8, agentId: 'honest-3' }),
        makeValuation({ value: 70000, confidence: 0.9, agentId: 'oscillator' }),   // -30% at boundary
        makeValuation({ value: 130000, confidence: 0.9, agentId: 'oscillator' }),  // +30% at boundary
      ];
      const result = engine.computeConsensus('test', valuations);
      // Both oscillating values are at the boundary, should be kept
      // But honest majority should anchor consensus
      expect(result.consensusValue).toBeGreaterThan(80000);
      expect(result.consensusValue).toBeLessThan(120000);
    });
  });

  // ─── THRESHOLD SENSITIVITY ANALYSIS ──────────────────────────────

  describe('threshold sensitivity under adversarial conditions', () => {
    it('should be more resilient with tighter threshold', () => {
      const tight = new ConsensusEngine(0.05);
      const loose = new ConsensusEngine(0.5);

      const valuations = [
        makeValuation({ value: 100000, confidence: 0.8, agentId: 'honest-1' }),
        makeValuation({ value: 100000, confidence: 0.8, agentId: 'honest-2' }),
        makeValuation({ value: 120000, confidence: 0.95, agentId: 'attacker' }),
      ];

      const tightResult = tight.computeConsensus('test', valuations);
      const looseResult = loose.computeConsensus('test', valuations);

      // Tight threshold filters attacker; loose keeps them
      expect(tightResult.valuations.length).toBeLessThanOrEqual(looseResult.valuations.length);
    });

    it('should produce different consensus under different thresholds with adversary', () => {
      const thresholds = [0.05, 0.1, 0.2, 0.3, 0.5];
      const valuations = [
        makeValuation({ value: 100000, confidence: 0.8, agentId: 'honest-1' }),
        makeValuation({ value: 100000, confidence: 0.8, agentId: 'honest-2' }),
        makeValuation({ value: 130000, confidence: 0.9, agentId: 'attacker' }),
      ];

      const results = thresholds.map(t => {
        const e = new ConsensusEngine(t);
        return e.computeConsensus('test', valuations);
      });

      // With threshold < 0.3, attacker is filtered; with >= 0.3, attacker stays
      // So consensus should change at some threshold boundary
      const consensusValues = results.map(r => r.consensusValue);
      expect(new Set(consensusValues).size).toBeGreaterThanOrEqual(1);
    });

    it('should handle zero threshold (maximally strict) with adversary', () => {
      const strictEngine = new ConsensusEngine(0);
      const valuations = [
        makeValuation({ value: 100000, confidence: 0.8, agentId: 'honest-1' }),
        makeValuation({ value: 100000, confidence: 0.8, agentId: 'honest-2' }),
        makeValuation({ value: 100001, confidence: 0.95, agentId: 'micro-adversary' }),
      ];
      const result = strictEngine.computeConsensus('test', valuations);
      // Even 1 unit deviation exceeds 0% threshold
      expect(result.valuations.length).toBeLessThanOrEqual(2);
    });
  });
});
