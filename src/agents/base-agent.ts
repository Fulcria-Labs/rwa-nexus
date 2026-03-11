import {
  AgentConfig,
  AssetClass,
  AssetData,
  DataPoint,
  ValuationResult,
} from '../types';

/**
 * Base class for AI valuation agents.
 * Each agent specializes in one or more asset classes and uses
 * a specific methodology to assess value.
 */
export abstract class BaseValuationAgent {
  readonly config: AgentConfig;

  constructor(config: AgentConfig) {
    this.config = config;
  }

  /**
   * Check if this agent can valuate the given asset class.
   */
  canValuate(assetClass: AssetClass): boolean {
    return this.config.assetClasses.includes(assetClass);
  }

  /**
   * Main valuation entry point. Validates asset class, gathers data, and computes value.
   */
  async valuate(asset: AssetData): Promise<ValuationResult> {
    if (!this.canValuate(asset.assetClass)) {
      throw new Error(
        `Agent ${this.config.id} cannot valuate ${asset.assetClass} assets`
      );
    }

    const dataPoints = await this.gatherData(asset);
    const { value, confidence } = await this.computeValuation(asset, dataPoints);

    return {
      assetId: asset.id,
      value,
      confidence,
      methodology: this.getMethodology(),
      dataPoints,
      timestamp: new Date(),
      agentId: this.config.id,
    };
  }

  /**
   * Gather relevant data points for valuation. Override in subclasses.
   */
  protected abstract gatherData(asset: AssetData): Promise<DataPoint[]>;

  /**
   * Compute value and confidence from gathered data. Override in subclasses.
   */
  protected abstract computeValuation(
    asset: AssetData,
    dataPoints: DataPoint[]
  ): Promise<{ value: number; confidence: number }>;

  /**
   * Return a description of this agent's valuation methodology.
   */
  protected abstract getMethodology(): string;
}
