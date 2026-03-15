import { AssetClass, ConsensusResult, ValuationResult } from '../types';

/**
 * Agent Reputation & Accuracy Tracking System.
 *
 * Tracks historical accuracy of each valuation agent by comparing
 * their estimates against realized consensus values. Computes
 * dynamic reputation scores that can be used to weight agent
 * contributions in future consensus rounds.
 *
 * Metrics tracked:
 * - Mean Absolute Percentage Error (MAPE)
 * - Directional accuracy (over/under-valuation bias)
 * - Consistency score (low variance = reliable)
 * - Asset class specialization accuracy
 * - Recency-weighted performance (recent accuracy matters more)
 */

export interface AgentReputationScore {
  agentId: string;
  overallScore: number;             // 0-100 composite reputation
  mape: number;                     // Mean Absolute Percentage Error
  bias: number;                     // Positive = overvalues, Negative = undervalues
  consistencyScore: number;         // 0-100, higher = more consistent
  totalValuations: number;
  recentAccuracy: number;           // Accuracy over last N valuations
  assetClassScores: Record<string, AssetClassAccuracy>;
  trend: 'improving' | 'stable' | 'declining';
  confidenceCalibration: number;    // How well confidence predicts accuracy (0-1)
}

export interface AssetClassAccuracy {
  assetClass: AssetClass;
  mape: number;
  bias: number;
  sampleCount: number;
  avgConfidence: number;
}

export interface ValuationRecord {
  agentId: string;
  assetId: string;
  assetClass: AssetClass;
  predictedValue: number;
  actualValue: number;        // Consensus or realized value
  confidence: number;
  timestamp: Date;
}

export interface ReputationConfig {
  decayFactor: number;        // Exponential decay for recency weighting (default: 0.95)
  minSamples: number;         // Minimum valuations for reputation (default: 5)
  recentWindow: number;       // Number of recent valuations for trend (default: 10)
  outlierThreshold: number;   // MAPE threshold for outlier flagging (default: 0.3 = 30%)
}

const DEFAULT_CONFIG: ReputationConfig = {
  decayFactor: 0.95,
  minSamples: 5,
  recentWindow: 10,
  outlierThreshold: 0.3,
};

/**
 * Manages agent reputation scores based on historical valuation accuracy.
 */
export class AgentReputationTracker {
  private records: ValuationRecord[] = [];
  private config: ReputationConfig;

  constructor(config: Partial<ReputationConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Record a valuation result and its actual/consensus value for tracking.
   */
  recordValuation(
    valuation: ValuationResult,
    actualValue: number,
    assetClass: AssetClass
  ): void {
    this.records.push({
      agentId: valuation.agentId,
      assetId: valuation.assetId,
      assetClass,
      predictedValue: valuation.value,
      actualValue,
      confidence: valuation.confidence,
      timestamp: valuation.timestamp,
    });
  }

  /**
   * Record from a consensus result - compares each agent's value to the consensus.
   */
  recordConsensus(consensus: ConsensusResult): void {
    for (const valuation of consensus.valuations) {
      this.records.push({
        agentId: valuation.agentId,
        assetId: consensus.assetId,
        assetClass: AssetClass.EQUITY, // Default; caller should provide
        predictedValue: valuation.value,
        actualValue: consensus.consensusValue,
        confidence: valuation.confidence,
        timestamp: valuation.timestamp,
      });
    }
  }

  /**
   * Record a consensus with explicit asset class.
   */
  recordConsensusWithClass(consensus: ConsensusResult, assetClass: AssetClass): void {
    for (const valuation of consensus.valuations) {
      this.records.push({
        agentId: valuation.agentId,
        assetId: consensus.assetId,
        assetClass,
        predictedValue: valuation.value,
        actualValue: consensus.consensusValue,
        confidence: valuation.confidence,
        timestamp: valuation.timestamp,
      });
    }
  }

  /**
   * Add a raw valuation record directly.
   */
  addRecord(record: ValuationRecord): void {
    this.records.push(record);
  }

  /**
   * Get reputation score for a specific agent.
   */
  getAgentReputation(agentId: string): AgentReputationScore {
    const agentRecords = this.records.filter(r => r.agentId === agentId);

    if (agentRecords.length < this.config.minSamples) {
      return defaultReputation(agentId, agentRecords.length);
    }

    // Sort by timestamp (most recent last)
    const sorted = [...agentRecords].sort(
      (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
    );

    // Compute MAPE
    const mape = computeMAPE(sorted);

    // Compute bias
    const bias = computeBias(sorted);

    // Consistency score
    const consistencyScore = computeConsistency(sorted);

    // Recent accuracy (last N)
    const recentSlice = sorted.slice(-this.config.recentWindow);
    const recentAccuracy = recentSlice.length > 0 ? (1 - computeMAPE(recentSlice)) * 100 : 50;

    // Asset class breakdown
    const assetClassScores = computeAssetClassScores(sorted);

    // Trend detection
    const trend = detectTrend(sorted, this.config.recentWindow);

    // Confidence calibration
    const confidenceCalibration = computeConfidenceCalibration(sorted);

    // Composite score (weighted)
    const accuracyComponent = Math.max(0, (1 - mape)) * 40;  // 40% weight
    const consistencyComponent = consistencyScore * 0.25;      // 25% weight
    const recentComponent = recentAccuracy * 0.25;             // 25% weight
    const calibrationComponent = confidenceCalibration * 10;   // 10% weight

    const overallScore = Math.round(
      Math.min(100, Math.max(0, accuracyComponent + consistencyComponent + recentComponent + calibrationComponent))
    );

    return {
      agentId,
      overallScore,
      mape: Math.round(mape * 10000) / 10000,
      bias: Math.round(bias * 10000) / 10000,
      consistencyScore: Math.round(consistencyScore * 100) / 100,
      totalValuations: agentRecords.length,
      recentAccuracy: Math.round(recentAccuracy * 100) / 100,
      assetClassScores,
      trend,
      confidenceCalibration: Math.round(confidenceCalibration * 10000) / 10000,
    };
  }

  /**
   * Get reputation scores for all known agents, ranked by overall score.
   */
  getAllReputations(): AgentReputationScore[] {
    const agentIds = new Set(this.records.map(r => r.agentId));
    const scores = Array.from(agentIds).map(id => this.getAgentReputation(id));
    return scores.sort((a, b) => b.overallScore - a.overallScore);
  }

  /**
   * Compute dynamic consensus weights based on reputation.
   * Higher reputation agents get more weight in consensus.
   */
  getConsensusWeights(agentIds: string[]): Record<string, number> {
    const reputations = agentIds.map(id => ({
      id,
      score: this.getAgentReputation(id).overallScore,
    }));

    const totalScore = reputations.reduce((s, r) => s + r.score, 0);

    if (totalScore === 0) {
      // Equal weights if no reputation data
      const equalWeight = 1 / agentIds.length;
      return Object.fromEntries(agentIds.map(id => [id, equalWeight]));
    }

    return Object.fromEntries(
      reputations.map(r => [r.id, r.score / totalScore])
    );
  }

  /**
   * Flag agents whose recent performance is below threshold.
   */
  flagUnderperformingAgents(threshold: number = 30): string[] {
    return this.getAllReputations()
      .filter(r => r.overallScore < threshold && r.totalValuations >= this.config.minSamples)
      .map(r => r.agentId);
  }

  /**
   * Identify agents that consistently over- or under-value specific asset classes.
   */
  detectBiasPatterns(): { agentId: string; assetClass: string; bias: number; significance: string }[] {
    const patterns: { agentId: string; assetClass: string; bias: number; significance: string }[] = [];

    const agentIds = new Set(this.records.map(r => r.agentId));
    for (const agentId of agentIds) {
      const rep = this.getAgentReputation(agentId);
      for (const [cls, accuracy] of Object.entries(rep.assetClassScores)) {
        if (accuracy.sampleCount >= 3 && Math.abs(accuracy.bias) > 0.05) {
          patterns.push({
            agentId,
            assetClass: cls,
            bias: accuracy.bias,
            significance: Math.abs(accuracy.bias) > 0.15 ? 'high' : 'moderate',
          });
        }
      }
    }

    return patterns.sort((a, b) => Math.abs(b.bias) - Math.abs(a.bias));
  }

  /**
   * Get the total number of recorded valuations.
   */
  getTotalRecords(): number {
    return this.records.length;
  }

  /**
   * Clear all records.
   */
  reset(): void {
    this.records = [];
  }
}

function computeMAPE(records: ValuationRecord[]): number {
  if (records.length === 0) return 1;

  const errors = records.map(r => {
    if (r.actualValue === 0) return r.predictedValue === 0 ? 0 : 1;
    return Math.abs(r.predictedValue - r.actualValue) / Math.abs(r.actualValue);
  });

  return errors.reduce((s, e) => s + e, 0) / errors.length;
}

function computeBias(records: ValuationRecord[]): number {
  if (records.length === 0) return 0;

  const biases = records.map(r => {
    if (r.actualValue === 0) return 0;
    return (r.predictedValue - r.actualValue) / Math.abs(r.actualValue);
  });

  return biases.reduce((s, b) => s + b, 0) / biases.length;
}

function computeConsistency(records: ValuationRecord[]): number {
  if (records.length < 2) return 50;

  const errors = records.map(r => {
    if (r.actualValue === 0) return r.predictedValue === 0 ? 0 : 1;
    return Math.abs(r.predictedValue - r.actualValue) / Math.abs(r.actualValue);
  });

  const mean = errors.reduce((s, e) => s + e, 0) / errors.length;
  const variance = errors.reduce((s, e) => s + (e - mean) ** 2, 0) / errors.length;
  const cv = mean > 0 ? Math.sqrt(variance) / mean : 0;

  // Lower CV = more consistent. Map CV 0->100, CV 2->0
  return Math.max(0, Math.min(100, (1 - cv / 2) * 100));
}

function computeAssetClassScores(
  records: ValuationRecord[]
): Record<string, AssetClassAccuracy> {
  const grouped: Record<string, ValuationRecord[]> = {};

  for (const r of records) {
    if (!grouped[r.assetClass]) grouped[r.assetClass] = [];
    grouped[r.assetClass].push(r);
  }

  const scores: Record<string, AssetClassAccuracy> = {};
  for (const [cls, recs] of Object.entries(grouped)) {
    scores[cls] = {
      assetClass: cls as AssetClass,
      mape: Math.round(computeMAPE(recs) * 10000) / 10000,
      bias: Math.round(computeBias(recs) * 10000) / 10000,
      sampleCount: recs.length,
      avgConfidence: Math.round(
        recs.reduce((s, r) => s + r.confidence, 0) / recs.length * 10000
      ) / 10000,
    };
  }

  return scores;
}

function detectTrend(
  sortedRecords: ValuationRecord[],
  recentWindow: number
): 'improving' | 'stable' | 'declining' {
  if (sortedRecords.length < recentWindow * 2) return 'stable';

  const recent = sortedRecords.slice(-recentWindow);
  const older = sortedRecords.slice(-recentWindow * 2, -recentWindow);

  const recentMAPE = computeMAPE(recent);
  const olderMAPE = computeMAPE(older);

  const improvement = olderMAPE - recentMAPE;

  if (improvement > 0.02) return 'improving';
  if (improvement < -0.02) return 'declining';
  return 'stable';
}

function computeConfidenceCalibration(records: ValuationRecord[]): number {
  if (records.length < 3) return 0.5;

  // Group by confidence bins (0-0.2, 0.2-0.4, etc.)
  const bins: { confidence: number; accuracy: number }[] = [];

  for (const r of records) {
    const accuracy = r.actualValue !== 0
      ? 1 - Math.abs(r.predictedValue - r.actualValue) / Math.abs(r.actualValue)
      : (r.predictedValue === 0 ? 1 : 0);
    bins.push({ confidence: r.confidence, accuracy: Math.max(0, accuracy) });
  }

  // Compute correlation between confidence and accuracy
  const n = bins.length;
  const meanConf = bins.reduce((s, b) => s + b.confidence, 0) / n;
  const meanAcc = bins.reduce((s, b) => s + b.accuracy, 0) / n;

  let covSum = 0;
  let varConf = 0;
  let varAcc = 0;

  for (const b of bins) {
    covSum += (b.confidence - meanConf) * (b.accuracy - meanAcc);
    varConf += (b.confidence - meanConf) ** 2;
    varAcc += (b.accuracy - meanAcc) ** 2;
  }

  const denom = Math.sqrt(varConf * varAcc);
  if (denom === 0) return 0.5;

  // Pearson correlation, mapped to 0-1 (0.5 = uncorrelated, 1 = perfectly calibrated)
  const correlation = covSum / denom;
  return Math.max(0, Math.min(1, (correlation + 1) / 2));
}

function defaultReputation(agentId: string, totalValuations: number): AgentReputationScore {
  return {
    agentId,
    overallScore: 50, // Neutral starting score
    mape: 0,
    bias: 0,
    consistencyScore: 50,
    totalValuations,
    recentAccuracy: 50,
    assetClassScores: {},
    trend: 'stable',
    confidenceCalibration: 0.5,
  };
}
