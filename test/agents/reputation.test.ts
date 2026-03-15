import {
  AgentReputationTracker,
  AgentReputationScore,
  ValuationRecord,
} from '../../src/agents/reputation';
import { AssetClass, ValuationResult, ConsensusResult } from '../../src/types';

// ─── Helpers ──────────────────────────────────────────────────────────

function makeValuationResult(
  agentId: string,
  assetId: string,
  value: number,
  confidence: number = 0.8
): ValuationResult {
  return {
    assetId,
    value,
    confidence,
    methodology: 'test',
    dataPoints: [],
    timestamp: new Date(),
    agentId,
  };
}

function makeRecord(
  agentId: string,
  predicted: number,
  actual: number,
  assetClass: AssetClass = AssetClass.REAL_ESTATE,
  confidence: number = 0.8,
  timestamp?: Date
): ValuationRecord {
  return {
    agentId,
    assetId: `asset-${Math.random().toString(36).slice(2, 7)}`,
    assetClass,
    predictedValue: predicted,
    actualValue: actual,
    confidence,
    timestamp: timestamp || new Date(),
  };
}

function addRecordsWithTimestamps(
  tracker: AgentReputationTracker,
  agentId: string,
  errors: number[], // percentage errors: 0.05 = predicted is 5% off
  assetClass: AssetClass = AssetClass.REAL_ESTATE
): void {
  const baseTime = new Date('2025-01-01').getTime();
  for (let i = 0; i < errors.length; i++) {
    const actual = 100000;
    const predicted = actual * (1 + errors[i]);
    tracker.addRecord({
      agentId,
      assetId: `asset-${i}`,
      assetClass,
      predictedValue: predicted,
      actualValue: actual,
      confidence: 0.8,
      timestamp: new Date(baseTime + i * 86400000), // 1 day apart
    });
  }
}

// ─── Basic Functionality ──────────────────────────────────────────────

describe('AgentReputationTracker', () => {
  describe('initialization', () => {
    test('creates with default config', () => {
      const tracker = new AgentReputationTracker();
      expect(tracker.getTotalRecords()).toBe(0);
    });

    test('creates with custom config', () => {
      const tracker = new AgentReputationTracker({
        decayFactor: 0.9,
        minSamples: 3,
        recentWindow: 5,
      });
      expect(tracker.getTotalRecords()).toBe(0);
    });
  });

  describe('recording valuations', () => {
    test('records a valuation result', () => {
      const tracker = new AgentReputationTracker();
      const vr = makeValuationResult('agent1', 'asset1', 100000);
      tracker.recordValuation(vr, 95000, AssetClass.REAL_ESTATE);
      expect(tracker.getTotalRecords()).toBe(1);
    });

    test('records consensus results', () => {
      const tracker = new AgentReputationTracker();
      const consensus: ConsensusResult = {
        assetId: 'asset1',
        consensusValue: 100000,
        avgConfidence: 0.85,
        valuations: [
          makeValuationResult('agent1', 'asset1', 105000),
          makeValuationResult('agent2', 'asset1', 95000),
          makeValuationResult('agent3', 'asset1', 100000),
        ],
        methodology: 'weighted-average',
        timestamp: new Date(),
      };
      tracker.recordConsensus(consensus);
      expect(tracker.getTotalRecords()).toBe(3);
    });

    test('records consensus with explicit asset class', () => {
      const tracker = new AgentReputationTracker();
      const consensus: ConsensusResult = {
        assetId: 'gold1',
        consensusValue: 50000,
        avgConfidence: 0.9,
        valuations: [makeValuationResult('agent1', 'gold1', 48000)],
        methodology: 'test',
        timestamp: new Date(),
      };
      tracker.recordConsensusWithClass(consensus, AssetClass.COMMODITY);
      expect(tracker.getTotalRecords()).toBe(1);
    });

    test('adds raw records', () => {
      const tracker = new AgentReputationTracker();
      tracker.addRecord(makeRecord('agent1', 100000, 100000));
      tracker.addRecord(makeRecord('agent2', 200000, 190000));
      expect(tracker.getTotalRecords()).toBe(2);
    });
  });

  describe('reputation scoring', () => {
    test('returns default score for agent with insufficient data', () => {
      const tracker = new AgentReputationTracker();
      tracker.addRecord(makeRecord('agent1', 100000, 100000));
      const score = tracker.getAgentReputation('agent1');
      expect(score.overallScore).toBe(50);
      expect(score.trend).toBe('stable');
    });

    test('returns default score for unknown agent', () => {
      const tracker = new AgentReputationTracker();
      const score = tracker.getAgentReputation('unknown');
      expect(score.overallScore).toBe(50);
      expect(score.totalValuations).toBe(0);
    });

    test('perfect agent gets high score', () => {
      const tracker = new AgentReputationTracker();
      // Agent with perfect predictions
      for (let i = 0; i < 10; i++) {
        tracker.addRecord(makeRecord('perfect', 100000, 100000));
      }
      const score = tracker.getAgentReputation('perfect');
      expect(score.overallScore).toBeGreaterThan(80);
      expect(score.mape).toBe(0);
      expect(score.bias).toBe(0);
    });

    test('poor agent gets lower score than perfect agent', () => {
      const tracker = new AgentReputationTracker();
      // Agent consistently 50% off
      for (let i = 0; i < 10; i++) {
        tracker.addRecord(makeRecord('poor', 150000, 100000));
        tracker.addRecord(makeRecord('perfect', 100000, 100000));
      }
      const poorScore = tracker.getAgentReputation('poor');
      const perfectScore = tracker.getAgentReputation('perfect');
      expect(poorScore.overallScore).toBeLessThan(perfectScore.overallScore);
      expect(poorScore.mape).toBeCloseTo(0.5, 2);
    });

    test('accurate agent scores higher than inaccurate', () => {
      const tracker = new AgentReputationTracker();
      addRecordsWithTimestamps(tracker, 'good', [0.01, -0.01, 0.02, -0.01, 0.01, 0.02, -0.02, 0.01, -0.01, 0.01]);
      addRecordsWithTimestamps(tracker, 'bad', [0.2, -0.3, 0.25, -0.15, 0.3, 0.2, -0.25, 0.15, -0.2, 0.3]);

      const goodScore = tracker.getAgentReputation('good');
      const badScore = tracker.getAgentReputation('bad');

      expect(goodScore.overallScore).toBeGreaterThan(badScore.overallScore);
    });
  });

  describe('MAPE calculation', () => {
    test('zero MAPE for perfect predictions', () => {
      const tracker = new AgentReputationTracker();
      for (let i = 0; i < 5; i++) {
        tracker.addRecord(makeRecord('agent1', 100000, 100000));
      }
      const score = tracker.getAgentReputation('agent1');
      expect(score.mape).toBe(0);
    });

    test('correct MAPE for consistent 10% error', () => {
      const tracker = new AgentReputationTracker();
      for (let i = 0; i < 5; i++) {
        tracker.addRecord(makeRecord('agent1', 110000, 100000));
      }
      const score = tracker.getAgentReputation('agent1');
      expect(score.mape).toBeCloseTo(0.1, 3);
    });

    test('MAPE handles alternating over/under predictions', () => {
      const tracker = new AgentReputationTracker();
      addRecordsWithTimestamps(tracker, 'agent1', [0.1, -0.1, 0.1, -0.1, 0.1]);
      const score = tracker.getAgentReputation('agent1');
      expect(score.mape).toBeCloseTo(0.1, 3);
    });

    test('MAPE handles zero actual value', () => {
      const tracker = new AgentReputationTracker();
      for (let i = 0; i < 5; i++) {
        tracker.addRecord(makeRecord('agent1', 100, 0));
      }
      const score = tracker.getAgentReputation('agent1');
      expect(score.mape).toBe(1);
    });

    test('MAPE handles both zero predicted and actual', () => {
      const tracker = new AgentReputationTracker();
      for (let i = 0; i < 5; i++) {
        tracker.addRecord(makeRecord('agent1', 0, 0));
      }
      const score = tracker.getAgentReputation('agent1');
      expect(score.mape).toBe(0);
    });
  });

  describe('bias detection', () => {
    test('positive bias for consistent overvaluation', () => {
      const tracker = new AgentReputationTracker();
      for (let i = 0; i < 10; i++) {
        tracker.addRecord(makeRecord('agent1', 120000, 100000));
      }
      const score = tracker.getAgentReputation('agent1');
      expect(score.bias).toBeGreaterThan(0);
      expect(score.bias).toBeCloseTo(0.2, 2);
    });

    test('negative bias for consistent undervaluation', () => {
      const tracker = new AgentReputationTracker();
      for (let i = 0; i < 10; i++) {
        tracker.addRecord(makeRecord('agent1', 80000, 100000));
      }
      const score = tracker.getAgentReputation('agent1');
      expect(score.bias).toBeLessThan(0);
      expect(score.bias).toBeCloseTo(-0.2, 2);
    });

    test('near-zero bias for unbiased agent', () => {
      const tracker = new AgentReputationTracker();
      addRecordsWithTimestamps(tracker, 'agent1', [0.05, -0.05, 0.03, -0.03, 0.04, -0.04, 0.02, -0.02, 0.01, -0.01]);
      const score = tracker.getAgentReputation('agent1');
      expect(Math.abs(score.bias)).toBeLessThan(0.01);
    });
  });

  describe('consistency score', () => {
    test('high consistency for uniform errors', () => {
      const tracker = new AgentReputationTracker();
      // Very consistent errors (all 5% off)
      for (let i = 0; i < 10; i++) {
        tracker.addRecord(makeRecord('consistent', 105000, 100000));
      }
      const score = tracker.getAgentReputation('consistent');
      expect(score.consistencyScore).toBeGreaterThan(80);
    });

    test('low consistency for erratic errors', () => {
      const tracker = new AgentReputationTracker();
      // Wildly varying errors
      addRecordsWithTimestamps(tracker, 'erratic', [0.01, 0.5, -0.3, 0.02, 0.4, -0.2, 0.01, 0.6, -0.1, 0.3]);
      const score = tracker.getAgentReputation('erratic');
      expect(score.consistencyScore).toBeLessThan(70);
    });
  });

  describe('recent accuracy and trend', () => {
    test('detects improving trend', () => {
      const tracker = new AgentReputationTracker({ recentWindow: 10 });
      const baseTime = new Date('2025-01-01').getTime();
      // Older: bad accuracy (first 20 records)
      for (let i = 0; i < 20; i++) {
        tracker.addRecord({
          agentId: 'agent1',
          assetId: `a${i}`,
          assetClass: AssetClass.REAL_ESTATE,
          predictedValue: 100000 * (1 + 0.3), // 30% off
          actualValue: 100000,
          confidence: 0.5,
          timestamp: new Date(baseTime + i * 86400000),
        });
      }
      // Recent: good accuracy (last 10 records)
      for (let i = 20; i < 30; i++) {
        tracker.addRecord({
          agentId: 'agent1',
          assetId: `a${i}`,
          assetClass: AssetClass.REAL_ESTATE,
          predictedValue: 100000 * (1 + 0.02), // 2% off
          actualValue: 100000,
          confidence: 0.9,
          timestamp: new Date(baseTime + i * 86400000),
        });
      }

      const score = tracker.getAgentReputation('agent1');
      expect(score.trend).toBe('improving');
      expect(score.recentAccuracy).toBeGreaterThan(90);
    });

    test('detects declining trend', () => {
      const tracker = new AgentReputationTracker({ recentWindow: 10 });
      const baseTime = new Date('2025-01-01').getTime();
      // Older: good accuracy (first 20)
      for (let i = 0; i < 20; i++) {
        tracker.addRecord({
          agentId: 'agent1',
          assetId: `a${i}`,
          assetClass: AssetClass.REAL_ESTATE,
          predictedValue: 100000 * (1 + 0.01),
          actualValue: 100000,
          confidence: 0.9,
          timestamp: new Date(baseTime + i * 86400000),
        });
      }
      // Recent: bad accuracy (last 10)
      for (let i = 20; i < 30; i++) {
        tracker.addRecord({
          agentId: 'agent1',
          assetId: `a${i}`,
          assetClass: AssetClass.REAL_ESTATE,
          predictedValue: 100000 * (1 + 0.35),
          actualValue: 100000,
          confidence: 0.5,
          timestamp: new Date(baseTime + i * 86400000),
        });
      }

      const score = tracker.getAgentReputation('agent1');
      expect(score.trend).toBe('declining');
    });

    test('stable trend for consistent performance', () => {
      const tracker = new AgentReputationTracker({ recentWindow: 10 });
      const baseTime = new Date('2025-01-01').getTime();
      for (let i = 0; i < 30; i++) {
        tracker.addRecord({
          agentId: 'agent1',
          assetId: `a${i}`,
          assetClass: AssetClass.REAL_ESTATE,
          predictedValue: 105000,
          actualValue: 100000,
          confidence: 0.8,
          timestamp: new Date(baseTime + i * 86400000),
        });
      }
      const score = tracker.getAgentReputation('agent1');
      expect(score.trend).toBe('stable');
    });
  });

  describe('asset class breakdown', () => {
    test('computes per-class accuracy', () => {
      const tracker = new AgentReputationTracker();
      // Good at real estate
      for (let i = 0; i < 5; i++) {
        tracker.addRecord(makeRecord('agent1', 101000, 100000, AssetClass.REAL_ESTATE));
      }
      // Bad at commodities
      for (let i = 0; i < 5; i++) {
        tracker.addRecord(makeRecord('agent1', 150000, 100000, AssetClass.COMMODITY));
      }

      const score = tracker.getAgentReputation('agent1');
      expect(score.assetClassScores[AssetClass.REAL_ESTATE]).toBeDefined();
      expect(score.assetClassScores[AssetClass.COMMODITY]).toBeDefined();
      expect(score.assetClassScores[AssetClass.REAL_ESTATE].mape).toBeLessThan(
        score.assetClassScores[AssetClass.COMMODITY].mape
      );
    });

    test('tracks sample count per class', () => {
      const tracker = new AgentReputationTracker();
      for (let i = 0; i < 7; i++) {
        tracker.addRecord(makeRecord('agent1', 100000, 100000, AssetClass.TREASURY));
      }
      for (let i = 0; i < 3; i++) {
        tracker.addRecord(makeRecord('agent1', 100000, 100000, AssetClass.EQUITY));
      }
      const score = tracker.getAgentReputation('agent1');
      expect(score.assetClassScores[AssetClass.TREASURY].sampleCount).toBe(7);
      expect(score.assetClassScores[AssetClass.EQUITY].sampleCount).toBe(3);
    });

    test('tracks average confidence per class', () => {
      const tracker = new AgentReputationTracker();
      for (let i = 0; i < 5; i++) {
        tracker.addRecord(makeRecord('agent1', 100000, 100000, AssetClass.REAL_ESTATE, 0.9));
      }
      for (let i = 0; i < 5; i++) {
        tracker.addRecord(makeRecord('agent1', 100000, 100000, AssetClass.COMMODITY, 0.5));
      }
      const score = tracker.getAgentReputation('agent1');
      expect(score.assetClassScores[AssetClass.REAL_ESTATE].avgConfidence).toBeCloseTo(0.9, 2);
      expect(score.assetClassScores[AssetClass.COMMODITY].avgConfidence).toBeCloseTo(0.5, 2);
    });
  });

  describe('confidence calibration', () => {
    test('high calibration when confidence predicts accuracy', () => {
      const tracker = new AgentReputationTracker();
      const baseTime = new Date('2025-01-01').getTime();
      // High confidence = high accuracy
      for (let i = 0; i < 10; i++) {
        tracker.addRecord({
          agentId: 'agent1',
          assetId: `a${i}`,
          assetClass: AssetClass.REAL_ESTATE,
          predictedValue: 101000, // 1% off when confident
          actualValue: 100000,
          confidence: 0.95,
          timestamp: new Date(baseTime + i * 86400000),
        });
      }
      // Low confidence = low accuracy
      for (let i = 10; i < 20; i++) {
        tracker.addRecord({
          agentId: 'agent1',
          assetId: `a${i}`,
          assetClass: AssetClass.REAL_ESTATE,
          predictedValue: 130000, // 30% off when not confident
          actualValue: 100000,
          confidence: 0.2,
          timestamp: new Date(baseTime + i * 86400000),
        });
      }
      const score = tracker.getAgentReputation('agent1');
      expect(score.confidenceCalibration).toBeGreaterThan(0.6);
    });

    test('default calibration for insufficient data', () => {
      const tracker = new AgentReputationTracker({ minSamples: 3 });
      tracker.addRecord(makeRecord('agent1', 100000, 100000));
      const score = tracker.getAgentReputation('agent1');
      expect(score.confidenceCalibration).toBe(0.5);
    });
  });

  describe('getAllReputations', () => {
    test('returns all agents sorted by score', () => {
      const tracker = new AgentReputationTracker();
      addRecordsWithTimestamps(tracker, 'good', [0.01, -0.01, 0.02, -0.02, 0.01]);
      addRecordsWithTimestamps(tracker, 'bad', [0.3, -0.25, 0.4, -0.35, 0.3]);
      addRecordsWithTimestamps(tracker, 'avg', [0.1, -0.08, 0.12, -0.09, 0.1]);

      const all = tracker.getAllReputations();
      expect(all).toHaveLength(3);
      // Sorted by score descending
      expect(all[0].overallScore).toBeGreaterThanOrEqual(all[1].overallScore);
      expect(all[1].overallScore).toBeGreaterThanOrEqual(all[2].overallScore);
    });

    test('returns empty for no agents', () => {
      const tracker = new AgentReputationTracker();
      expect(tracker.getAllReputations()).toEqual([]);
    });
  });

  describe('getConsensusWeights', () => {
    test('equal weights when no reputation data', () => {
      const tracker = new AgentReputationTracker();
      const weights = tracker.getConsensusWeights(['a1', 'a2', 'a3']);
      expect(weights['a1']).toBeCloseTo(1 / 3, 5);
      expect(weights['a2']).toBeCloseTo(1 / 3, 5);
      expect(weights['a3']).toBeCloseTo(1 / 3, 5);
    });

    test('weights proportional to reputation', () => {
      const tracker = new AgentReputationTracker();
      addRecordsWithTimestamps(tracker, 'good', [0.01, -0.01, 0.02, -0.02, 0.01]);
      addRecordsWithTimestamps(tracker, 'bad', [0.4, -0.3, 0.45, -0.35, 0.4]);

      const weights = tracker.getConsensusWeights(['good', 'bad']);
      expect(weights['good']).toBeGreaterThan(weights['bad']);
    });

    test('weights sum to 1', () => {
      const tracker = new AgentReputationTracker();
      addRecordsWithTimestamps(tracker, 'a1', [0.05, -0.03, 0.04, -0.02, 0.03]);
      addRecordsWithTimestamps(tracker, 'a2', [0.1, -0.08, 0.12, -0.09, 0.1]);
      addRecordsWithTimestamps(tracker, 'a3', [0.02, -0.01, 0.01, -0.02, 0.01]);

      const weights = tracker.getConsensusWeights(['a1', 'a2', 'a3']);
      const sum = Object.values(weights).reduce((s, w) => s + w, 0);
      expect(sum).toBeCloseTo(1.0, 5);
    });

    test('includes unknown agents with default weight', () => {
      const tracker = new AgentReputationTracker();
      addRecordsWithTimestamps(tracker, 'known', [0.05, -0.03, 0.04, -0.02, 0.03]);

      const weights = tracker.getConsensusWeights(['known', 'unknown']);
      expect(weights['known']).toBeDefined();
      expect(weights['unknown']).toBeDefined();
      expect(weights['known'] + weights['unknown']).toBeCloseTo(1.0, 5);
    });
  });

  describe('flagUnderperformingAgents', () => {
    test('flags agents below threshold', () => {
      const tracker = new AgentReputationTracker();
      addRecordsWithTimestamps(tracker, 'good', [0.01, -0.01, 0.02, -0.02, 0.01]);
      // Extremely terrible and erratic agent
      addRecordsWithTimestamps(tracker, 'terrible', [2.0, -0.9, 3.0, -0.8, 2.5]);

      const goodScore = tracker.getAgentReputation('good');
      const terribleScore = tracker.getAgentReputation('terrible');
      // Terrible agent should score significantly lower
      expect(terribleScore.overallScore).toBeLessThan(goodScore.overallScore);
      // Use a threshold above the terrible agent's score
      const flagged = tracker.flagUnderperformingAgents(terribleScore.overallScore + 1);
      expect(flagged).toContain('terrible');
      expect(flagged).not.toContain('good');
    });

    test('does not flag agents with insufficient data', () => {
      const tracker = new AgentReputationTracker();
      tracker.addRecord(makeRecord('newbie', 200000, 100000)); // Terrible but only 1 record
      const flagged = tracker.flagUnderperformingAgents(30);
      expect(flagged).not.toContain('newbie');
    });

    test('custom threshold', () => {
      const tracker = new AgentReputationTracker();
      addRecordsWithTimestamps(tracker, 'mediocre', [0.15, -0.12, 0.18, -0.14, 0.16]);

      const flaggedStrict = tracker.flagUnderperformingAgents(70);
      const flaggedLenient = tracker.flagUnderperformingAgents(20);

      expect(flaggedStrict.length).toBeGreaterThanOrEqual(flaggedLenient.length);
    });
  });

  describe('detectBiasPatterns', () => {
    test('detects overvaluation bias in specific asset class', () => {
      const tracker = new AgentReputationTracker();
      // Agent overvalues real estate consistently
      for (let i = 0; i < 5; i++) {
        tracker.addRecord(makeRecord('agent1', 120000, 100000, AssetClass.REAL_ESTATE));
      }
      // Agent is accurate for treasuries
      for (let i = 0; i < 5; i++) {
        tracker.addRecord(makeRecord('agent1', 100500, 100000, AssetClass.TREASURY));
      }

      const patterns = tracker.detectBiasPatterns();
      const reBias = patterns.find(
        p => p.agentId === 'agent1' && p.assetClass === AssetClass.REAL_ESTATE
      );
      expect(reBias).toBeDefined();
      expect(reBias!.bias).toBeGreaterThan(0.1);
    });

    test('detects undervaluation bias', () => {
      const tracker = new AgentReputationTracker();
      for (let i = 0; i < 5; i++) {
        tracker.addRecord(makeRecord('agent1', 80000, 100000, AssetClass.COMMODITY));
      }
      const patterns = tracker.detectBiasPatterns();
      const commBias = patterns.find(
        p => p.agentId === 'agent1' && p.assetClass === AssetClass.COMMODITY
      );
      expect(commBias).toBeDefined();
      expect(commBias!.bias).toBeLessThan(-0.1);
    });

    test('returns empty when no significant biases', () => {
      const tracker = new AgentReputationTracker();
      for (let i = 0; i < 5; i++) {
        tracker.addRecord(makeRecord('agent1', 100000, 100000, AssetClass.REAL_ESTATE));
      }
      const patterns = tracker.detectBiasPatterns();
      expect(patterns).toHaveLength(0);
    });

    test('sorted by absolute bias descending', () => {
      const tracker = new AgentReputationTracker();
      for (let i = 0; i < 5; i++) {
        tracker.addRecord(makeRecord('a1', 110000, 100000, AssetClass.REAL_ESTATE));
        tracker.addRecord(makeRecord('a1', 130000, 100000, AssetClass.COMMODITY));
      }
      const patterns = tracker.detectBiasPatterns();
      if (patterns.length >= 2) {
        expect(Math.abs(patterns[0].bias)).toBeGreaterThanOrEqual(Math.abs(patterns[1].bias));
      }
    });

    test('classifies bias significance', () => {
      const tracker = new AgentReputationTracker();
      for (let i = 0; i < 5; i++) {
        tracker.addRecord(makeRecord('a1', 108000, 100000, AssetClass.REAL_ESTATE)); // 8% bias
        tracker.addRecord(makeRecord('a1', 125000, 100000, AssetClass.COMMODITY));   // 25% bias
      }
      const patterns = tracker.detectBiasPatterns();
      const reBias = patterns.find(p => p.assetClass === AssetClass.REAL_ESTATE);
      const commBias = patterns.find(p => p.assetClass === AssetClass.COMMODITY);
      if (reBias) expect(reBias.significance).toBe('moderate');
      if (commBias) expect(commBias.significance).toBe('high');
    });
  });

  describe('reset', () => {
    test('clears all records', () => {
      const tracker = new AgentReputationTracker();
      for (let i = 0; i < 10; i++) {
        tracker.addRecord(makeRecord('agent1', 100000, 100000));
      }
      expect(tracker.getTotalRecords()).toBe(10);
      tracker.reset();
      expect(tracker.getTotalRecords()).toBe(0);
    });
  });

  describe('edge cases', () => {
    test('handles very small values', () => {
      const tracker = new AgentReputationTracker();
      for (let i = 0; i < 5; i++) {
        tracker.addRecord(makeRecord('agent1', 0.001, 0.001));
      }
      const score = tracker.getAgentReputation('agent1');
      expect(score.mape).toBe(0);
    });

    test('handles very large values', () => {
      const tracker = new AgentReputationTracker();
      for (let i = 0; i < 5; i++) {
        tracker.addRecord(makeRecord('agent1', 1e12, 1e12));
      }
      const score = tracker.getAgentReputation('agent1');
      expect(score.mape).toBe(0);
    });

    test('handles mixed positive and negative predictions', () => {
      const tracker = new AgentReputationTracker();
      addRecordsWithTimestamps(tracker, 'agent1', [0.5, -0.5, 0.3, -0.3, 0.1]);
      const score = tracker.getAgentReputation('agent1');
      expect(typeof score.overallScore).toBe('number');
      expect(score.overallScore).toBeGreaterThanOrEqual(0);
      expect(score.overallScore).toBeLessThanOrEqual(100);
    });

    test('handles single record above min samples', () => {
      const tracker = new AgentReputationTracker({ minSamples: 1 });
      tracker.addRecord(makeRecord('agent1', 110000, 100000));
      const score = tracker.getAgentReputation('agent1');
      expect(score.totalValuations).toBe(1);
      expect(score.mape).toBeCloseTo(0.1, 3);
    });

    test('handles many agents', () => {
      const tracker = new AgentReputationTracker();
      for (let a = 0; a < 50; a++) {
        for (let i = 0; i < 5; i++) {
          const error = (a / 100); // 0% to 50% error
          tracker.addRecord(makeRecord(`agent${a}`, 100000 * (1 + error), 100000));
        }
      }
      const all = tracker.getAllReputations();
      expect(all).toHaveLength(50);
      // First agent should have highest score (least error)
      expect(all[0].agentId).toBe('agent0');
    });

    test('score is bounded between 0 and 100', () => {
      const tracker = new AgentReputationTracker();
      // Extremely bad agent
      for (let i = 0; i < 10; i++) {
        tracker.addRecord(makeRecord('terrible', 1000000, 100));
      }
      const score = tracker.getAgentReputation('terrible');
      expect(score.overallScore).toBeGreaterThanOrEqual(0);
      expect(score.overallScore).toBeLessThanOrEqual(100);
    });
  });

  describe('multi-agent ranking', () => {
    test('ranks agents correctly by accuracy', () => {
      const tracker = new AgentReputationTracker();
      addRecordsWithTimestamps(tracker, 'best', [0.005, -0.005, 0.003, -0.004, 0.006]);
      addRecordsWithTimestamps(tracker, 'mid', [0.08, -0.06, 0.07, -0.09, 0.08]);
      addRecordsWithTimestamps(tracker, 'worst', [0.3, -0.25, 0.35, -0.28, 0.32]);

      const all = tracker.getAllReputations();
      expect(all[0].agentId).toBe('best');
      expect(all[2].agentId).toBe('worst');
    });

    test('consensus weights reflect ranking', () => {
      const tracker = new AgentReputationTracker();
      addRecordsWithTimestamps(tracker, 'alpha', [0.01, -0.01, 0.02, -0.02, 0.01]);
      addRecordsWithTimestamps(tracker, 'beta', [0.15, -0.12, 0.18, -0.14, 0.16]);

      const weights = tracker.getConsensusWeights(['alpha', 'beta']);
      expect(weights['alpha']).toBeGreaterThan(weights['beta']);
    });
  });
});
