import { AssetData, ConsensusResult, ValuationResult } from '../types';
import { BaseValuationAgent } from '../agents/base-agent';

/**
 * Consensus engine that aggregates valuations from multiple AI agents.
 * Uses confidence-weighted averaging with outlier detection.
 */
export class ConsensusEngine {
  private agents: BaseValuationAgent[] = [];
  private readonly outlierThreshold: number;

  /**
   * @param outlierThreshold Max deviation from median (as fraction) before a valuation is considered an outlier
   */
  constructor(outlierThreshold = 0.3) {
    this.outlierThreshold = outlierThreshold;
  }

  registerAgent(agent: BaseValuationAgent): void {
    this.agents.push(agent);
  }

  getAgents(): BaseValuationAgent[] {
    return [...this.agents];
  }

  /**
   * Run all capable agents and compute consensus valuation.
   */
  async evaluateAsset(asset: AssetData): Promise<ConsensusResult> {
    const capableAgents = this.agents.filter(a => a.canValuate(asset.assetClass));

    if (capableAgents.length === 0) {
      throw new Error(`No agents registered for asset class: ${asset.assetClass}`);
    }

    // Gather valuations from all capable agents
    const valuations = await Promise.all(
      capableAgents.map(agent => agent.valuate(asset))
    );

    return this.computeConsensus(asset.id, valuations);
  }

  /**
   * Compute confidence-weighted consensus from multiple valuations.
   */
  computeConsensus(assetId: string, valuations: ValuationResult[]): ConsensusResult {
    if (valuations.length === 0) {
      throw new Error('No valuations to compute consensus from');
    }

    if (valuations.length === 1) {
      return {
        assetId,
        consensusValue: valuations[0].value,
        avgConfidence: valuations[0].confidence,
        valuations,
        methodology: `Single agent (${valuations[0].agentId}): ${valuations[0].methodology}`,
        timestamp: new Date(),
      };
    }

    // Filter outliers using median-based detection
    const filtered = this.filterOutliers(valuations);

    // Confidence-weighted average
    let weightedSum = 0;
    let totalWeight = 0;

    for (const v of filtered) {
      weightedSum += v.value * v.confidence;
      totalWeight += v.confidence;
    }

    const consensusValue = totalWeight > 0
      ? Math.round((weightedSum / totalWeight) * 100) / 100
      : 0;

    const avgConfidence = totalWeight / filtered.length;

    // Boost confidence when multiple agents agree
    const agreementBonus = filtered.length > 1 ? 0.05 : 0;
    const finalConfidence = Math.min(1, avgConfidence + agreementBonus);

    return {
      assetId,
      consensusValue,
      avgConfidence: Math.round(finalConfidence * 10000) / 10000,
      valuations: filtered,
      methodology: `Confidence-weighted consensus from ${filtered.length}/${valuations.length} agents (outlier threshold: ${this.outlierThreshold * 100}%)`,
      timestamp: new Date(),
    };
  }

  /**
   * Remove valuations that deviate too far from the median.
   */
  private filterOutliers(valuations: ValuationResult[]): ValuationResult[] {
    if (valuations.length <= 2) return valuations;

    const values = valuations.map(v => v.value).sort((a, b) => a - b);
    const median = values[Math.floor(values.length / 2)];

    return valuations.filter(v => {
      if (median === 0) return true;
      const deviation = Math.abs(v.value - median) / median;
      return deviation <= this.outlierThreshold;
    });
  }
}
