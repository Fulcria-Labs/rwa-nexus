import { ConsensusEngine } from '../oracle/consensus';
import { ChainBridge } from '../oracle/chain-bridge';
import { analyzePortfolioRisk } from '../oracle/risk-analytics';
import { runMonteCarloSimulation } from '../oracle/monte-carlo';
import { AgentReputationTracker } from '../agents/reputation';
import { AssetClass, AssetData, ConsensusResult, PortfolioAsset } from '../types';

/**
 * MCP Server exposing RWA Nexus tools for AI system integration.
 * Provides 10 tools: valuate_asset, get_price, submit_onchain, list_agents, portfolio_summary, risk_analysis, monte_carlo_var, agent_reputation, explain_valuation, compare_agents.
 */
export class RWAMCPServer {
  private consensusEngine: ConsensusEngine;
  private chainBridge: ChainBridge | null;
  private portfolio: Map<string, { asset: AssetData; consensus: ConsensusResult | null }> = new Map();
  private reputationTracker: AgentReputationTracker = new AgentReputationTracker();

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
      {
        name: 'monte_carlo_var',
        description: 'Run Monte Carlo VaR/CVaR simulation on the portfolio. Simulates thousands of correlated return scenarios to compute Value-at-Risk, Conditional VaR, and return distribution statistics.',
        inputSchema: {
          type: 'object',
          properties: {
            numSimulations: { type: 'number', description: 'Number of simulation paths (default: 10000)' },
            timeHorizonDays: { type: 'number', description: 'Projection period in days (default: 30)' },
            confidenceLevels: { type: 'array', items: { type: 'number' }, description: 'VaR confidence levels (default: [0.95, 0.99])' },
          },
        },
      },
      {
        name: 'agent_reputation',
        description: 'Get reputation scores for all valuation agents based on their historical accuracy, consistency, bias, and trend.',
        inputSchema: { type: 'object', properties: {} },
      },
      {
        name: 'explain_valuation',
        description: 'Get a detailed methodology breakdown for an asset valuation, showing each agent\'s approach, data points used, confidence reasoning, and how consensus was reached.',
        inputSchema: {
          type: 'object',
          properties: {
            assetId: { type: 'string', description: 'Asset identifier to explain' },
          },
          required: ['assetId'],
        },
      },
      {
        name: 'compare_agents',
        description: 'Compare how different agents would valuate the same asset, showing methodology differences, data sources, and where they agree or disagree.',
        inputSchema: {
          type: 'object',
          properties: {
            assetId: { type: 'string', description: 'Asset identifier to compare agent valuations for' },
          },
          required: ['assetId'],
        },
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
      case 'monte_carlo_var':
        return this.monteCarloVaR(args);
      case 'agent_reputation':
        return this.agentReputation();
      case 'explain_valuation':
        return this.explainValuation(args.assetId as string);
      case 'compare_agents':
        return this.compareAgents(args.assetId as string);
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

    // Track agent accuracy for reputation
    this.reputationTracker.recordConsensusWithClass(consensus, asset.assetClass);

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

  private monteCarloVaR(args: Record<string, unknown>) {
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

    return runMonteCarloSimulation(assets, valuations, {
      numSimulations: (args.numSimulations as number) ?? 10000,
      timeHorizonDays: (args.timeHorizonDays as number) ?? 30,
      confidenceLevels: (args.confidenceLevels as number[]) ?? [0.95, 0.99],
    });
  }

  private agentReputation() {
    return {
      agents: this.reputationTracker.getAllReputations(),
      consensusWeights: this.reputationTracker.getConsensusWeights(
        this.consensusEngine.getAgents().map(a => a.config.id)
      ),
      underperforming: this.reputationTracker.flagUnderperformingAgents(),
      biasPatterns: this.reputationTracker.detectBiasPatterns(),
    };
  }

  private explainValuation(assetId: string) {
    const entry = this.portfolio.get(assetId);
    if (!entry?.consensus) {
      return { error: `No valuation found for asset: ${assetId}. Run valuate_asset first.` };
    }

    const consensus = entry.consensus;
    const agentBreakdowns = consensus.valuations.map(v => {
      // Categorize data points by source
      const dataBySource: Record<string, Array<{ metric: string; value: number | string; weight: number }>> = {};
      for (const dp of v.dataPoints) {
        if (!dataBySource[dp.source]) {
          dataBySource[dp.source] = [];
        }
        dataBySource[dp.source].push({
          metric: dp.metric,
          value: dp.value,
          weight: dp.weight,
        });
      }

      // Compute contribution to consensus
      const totalConfidenceWeight = consensus.valuations.reduce((sum, val) => sum + val.confidence, 0);
      const contributionWeight = totalConfidenceWeight > 0
        ? Math.round((v.confidence / totalConfidenceWeight) * 10000) / 100
        : 0;

      return {
        agentId: v.agentId,
        methodology: v.methodology,
        valuedAt: v.value,
        confidence: v.confidence,
        consensusContribution: `${contributionWeight}%`,
        deviationFromConsensus: consensus.consensusValue > 0
          ? `${Math.round(((v.value - consensus.consensusValue) / consensus.consensusValue) * 10000) / 100}%`
          : 'N/A',
        dataSources: dataBySource,
        dataPointCount: v.dataPoints.length,
      };
    });

    // Agreement analysis
    const values = consensus.valuations.map(v => v.value);
    const minVal = Math.min(...values);
    const maxVal = Math.max(...values);
    const spread = maxVal > 0 ? ((maxVal - minVal) / maxVal) * 100 : 0;

    return {
      assetId,
      assetName: entry.asset.name,
      assetClass: entry.asset.assetClass,
      consensusValue: consensus.consensusValue,
      consensusConfidence: consensus.avgConfidence,
      consensusMethodology: consensus.methodology,
      agentCount: consensus.valuations.length,
      agentBreakdowns,
      agreementAnalysis: {
        minValuation: minVal,
        maxValuation: maxVal,
        spreadPercent: Math.round(spread * 100) / 100,
        agreement: spread < 10 ? 'HIGH' : spread < 25 ? 'MODERATE' : 'LOW',
      },
      timestamp: consensus.timestamp.toISOString(),
    };
  }

  private compareAgents(assetId: string) {
    const entry = this.portfolio.get(assetId);
    if (!entry?.consensus) {
      return { error: `No valuation found for asset: ${assetId}. Run valuate_asset first.` };
    }

    const consensus = entry.consensus;
    const agents = this.consensusEngine.getAgents();

    // Find which agents participated vs didn't
    const participatingIds = new Set(consensus.valuations.map(v => v.agentId));
    const capableAgents = agents.filter(a => a.canValuate(entry.asset.assetClass));
    const incapableAgents = agents.filter(a => !a.canValuate(entry.asset.assetClass));

    // Build comparison matrix
    const comparisons = consensus.valuations.map(v => ({
      agentId: v.agentId,
      agentName: agents.find(a => a.config.id === v.agentId)?.config.name || v.agentId,
      value: v.value,
      confidence: v.confidence,
      methodology: v.methodology,
      dataPointCount: v.dataPoints.length,
      metrics: v.dataPoints.map(dp => dp.metric),
    }));

    // Find common and unique metrics
    const allMetrics = new Set<string>();
    const metricsByAgent: Record<string, Set<string>> = {};
    for (const v of consensus.valuations) {
      metricsByAgent[v.agentId] = new Set(v.dataPoints.map(dp => dp.metric));
      v.dataPoints.forEach(dp => allMetrics.add(dp.metric));
    }

    const commonMetrics: string[] = [];
    const uniqueMetrics: Record<string, string[]> = {};
    for (const metric of allMetrics) {
      const agentsWithMetric = Object.entries(metricsByAgent)
        .filter(([, metrics]) => metrics.has(metric))
        .map(([id]) => id);
      if (agentsWithMetric.length === consensus.valuations.length) {
        commonMetrics.push(metric);
      } else {
        for (const agentId of agentsWithMetric) {
          if (!uniqueMetrics[agentId]) uniqueMetrics[agentId] = [];
          uniqueMetrics[agentId].push(metric);
        }
      }
    }

    return {
      assetId,
      assetName: entry.asset.name,
      assetClass: entry.asset.assetClass,
      consensusValue: consensus.consensusValue,
      agentComparisons: comparisons,
      capableAgentCount: capableAgents.length,
      participatingAgentCount: consensus.valuations.length,
      incapableAgents: incapableAgents.map(a => ({
        id: a.config.id,
        name: a.config.name,
        assetClasses: a.config.assetClasses,
      })),
      metricAnalysis: {
        commonMetrics,
        uniqueMetrics,
        totalUniqueMetrics: allMetrics.size,
      },
    };
  }
}
