import { ConsensusEngine } from '../oracle/consensus';
import { ChainBridge } from '../oracle/chain-bridge';
import { analyzePortfolioRisk } from '../oracle/risk-analytics';
import { AssetClass, AssetData, ConsensusResult, PortfolioAsset } from '../types';

/**
 * MCP Server exposing RWA Nexus tools for AI system integration.
 * Provides 6 tools: valuate_asset, get_price, submit_onchain, list_agents, portfolio_summary, risk_analysis.
 */
export class RWAMCPServer {
  private consensusEngine: ConsensusEngine;
  private chainBridge: ChainBridge | null;
  private portfolio: Map<string, { asset: AssetData; consensus: ConsensusResult | null }> = new Map();

  constructor(config: {
    consensusEngine: ConsensusEngine;
    chainBridge?: ChainBridge;
  }) {
    this.consensusEngine = config.consensusEngine;
    this.chainBridge = config.chainBridge || null;
  }

  /**
   * Get MCP tool definitions.
   */
  getToolDefinitions() {
    return [
      {
        name: 'valuate_asset',
        description: 'Run AI agents to valuate a real-world asset. Returns consensus valuation from multiple AI models.',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Unique asset identifier' },
            assetClass: { type: 'string', enum: Object.values(AssetClass), description: 'Asset class category' },
            name: { type: 'string', description: 'Asset name' },
            description: { type: 'string', description: 'Asset description' },
            location: { type: 'string', description: 'Geographic location (for real estate)' },
            metadata: { type: 'object', description: 'Asset-specific metadata' },
          },
          required: ['id', 'assetClass', 'name'],
        },
      },
      {
        name: 'get_price',
        description: 'Get the current AI consensus price for an asset already in the portfolio.',
        inputSchema: {
          type: 'object',
          properties: {
            assetId: { type: 'string', description: 'Asset identifier' },
          },
          required: ['assetId'],
        },
      },
      {
        name: 'submit_onchain',
        description: 'Submit a consensus valuation to the BNB Chain oracle contract.',
        inputSchema: {
          type: 'object',
          properties: {
            assetId: { type: 'string', description: 'Asset identifier to submit' },
          },
          required: ['assetId'],
        },
      },
      {
        name: 'list_agents',
        description: 'List all registered AI valuation agents and their capabilities.',
        inputSchema: { type: 'object', properties: {} },
      },
      {
        name: 'portfolio_summary',
        description: 'Get a summary of all assets in the portfolio with their latest valuations.',
        inputSchema: { type: 'object', properties: {} },
      },
      {
        name: 'risk_analysis',
        description: 'Analyze portfolio risk including diversification score, concentration risk (HHI), stress tests across 5 scenarios, and confidence analysis. Returns actionable risk rating.',
        inputSchema: { type: 'object', properties: {} },
      },
    ];
  }

  /**
   * Handle an MCP tool call.
   */
  async handleToolCall(name: string, args: Record<string, unknown>): Promise<unknown> {
    switch (name) {
      case 'valuate_asset':
        return this.valuateAsset(args);
      case 'get_price':
        return this.getPrice(args.assetId as string);
      case 'submit_onchain':
        return this.submitOnchain(args.assetId as string);
      case 'list_agents':
        return this.listAgents();
      case 'portfolio_summary':
        return this.portfolioSummary();
      case 'risk_analysis':
        return this.riskAnalysis();
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  private async valuateAsset(args: Record<string, unknown>): Promise<ConsensusResult> {
    const asset: AssetData = {
      id: args.id as string,
      assetClass: args.assetClass as AssetClass,
      name: args.name as string,
      description: (args.description as string) || '',
      location: args.location as string | undefined,
      metadata: (args.metadata as Record<string, unknown>) || {},
    };

    const consensus = await this.consensusEngine.evaluateAsset(asset);
    this.portfolio.set(asset.id, { asset, consensus });
    return consensus;
  }

  private async getPrice(assetId: string): Promise<ConsensusResult | { error: string }> {
    const entry = this.portfolio.get(assetId);
    if (!entry?.consensus) {
      return { error: `No valuation found for asset: ${assetId}` };
    }
    return entry.consensus;
  }

  private async submitOnchain(assetId: string): Promise<{ txHash: string } | { error: string }> {
    if (!this.chainBridge) {
      return { error: 'No chain bridge configured. Set RPC URL and oracle address.' };
    }

    const entry = this.portfolio.get(assetId);
    if (!entry?.consensus) {
      return { error: `No valuation found for asset: ${assetId}. Run valuate_asset first.` };
    }

    const txHash = await this.chainBridge.submitConsensus(entry.consensus);
    return { txHash };
  }

  private listAgents() {
    return this.consensusEngine.getAgents().map(a => ({
      id: a.config.id,
      name: a.config.name,
      assetClasses: a.config.assetClasses,
      description: a.config.description,
    }));
  }

  private riskAnalysis() {
    const assets: PortfolioAsset[] = [];
    const valuations = new Map<string, ConsensusResult>();

    let tokenId = 0;
    for (const [id, entry] of this.portfolio) {
      assets.push({
        tokenId: tokenId++,
        assetData: entry.asset,
        currentValuation: entry.consensus,
        tokenSupply: 1000,
        oracleAssetId: `oracle-${id}`,
      });
      if (entry.consensus) {
        valuations.set(id, entry.consensus);
      }
    }

    return analyzePortfolioRisk(assets, valuations);
  }

  private portfolioSummary() {
    const assets: Array<{
      id: string;
      name: string;
      assetClass: string;
      value: number | null;
      confidence: number | null;
      lastUpdated: string | null;
    }> = [];

    for (const [id, entry] of this.portfolio) {
      assets.push({
        id,
        name: entry.asset.name,
        assetClass: entry.asset.assetClass,
        value: entry.consensus?.consensusValue ?? null,
        confidence: entry.consensus?.avgConfidence ?? null,
        lastUpdated: entry.consensus?.timestamp.toISOString() ?? null,
      });
    }

    const totalValue = assets.reduce((sum, a) => sum + (a.value || 0), 0);

    return {
      assetCount: assets.length,
      totalValue,
      assets,
    };
  }
}
