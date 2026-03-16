import { RWAMCPServer } from '../../src/mcp/server';
import { ConsensusEngine } from '../../src/oracle/consensus';
import { PropertyAgent } from '../../src/agents/property-agent';
import { CommodityAgent } from '../../src/agents/commodity-agent';
import { TreasuryAgent } from '../../src/agents/treasury-agent';
import { EquityAgent } from '../../src/agents/equity-agent';
import { AssetClass } from '../../src/types';

describe('RWAMCPServer - explain_valuation and compare_agents', () => {
  let server: RWAMCPServer;
  let engine: ConsensusEngine;

  beforeEach(() => {
    engine = new ConsensusEngine();
    engine.registerAgent(new PropertyAgent());
    engine.registerAgent(new CommodityAgent());
    engine.registerAgent(new TreasuryAgent());
    engine.registerAgent(new EquityAgent());
    server = new RWAMCPServer({ consensusEngine: engine });
  });

  describe('tool definitions update', () => {
    it('should return 10 tools', () => {
      const tools = server.getToolDefinitions();
      expect(tools).toHaveLength(10);
    });

    it('should include explain_valuation tool', () => {
      const tools = server.getToolDefinitions();
      const names = tools.map(t => t.name);
      expect(names).toContain('explain_valuation');
    });

    it('should include compare_agents tool', () => {
      const tools = server.getToolDefinitions();
      const names = tools.map(t => t.name);
      expect(names).toContain('compare_agents');
    });

    it('explain_valuation should require assetId', () => {
      const tools = server.getToolDefinitions();
      const tool = tools.find(t => t.name === 'explain_valuation');
      expect(tool!.inputSchema.required).toContain('assetId');
    });

    it('compare_agents should require assetId', () => {
      const tools = server.getToolDefinitions();
      const tool = tools.find(t => t.name === 'compare_agents');
      expect(tool!.inputSchema.required).toContain('assetId');
    });
  });

  describe('explain_valuation', () => {
    it('should return error for non-existent asset', async () => {
      const result = await server.handleToolCall('explain_valuation', { assetId: 'nonexistent' });
      expect(result).toHaveProperty('error');
      expect((result as any).error).toContain('No valuation found');
    });

    it('should explain a real estate valuation', async () => {
      // First valuate
      await server.handleToolCall('valuate_asset', {
        id: 'exp-prop-1',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Manhattan Condo',
        location: 'manhattan',
        metadata: { squareFeet: 1500, condition: 'excellent', annualRent: 120000 },
      });

      const result = await server.handleToolCall('explain_valuation', { assetId: 'exp-prop-1' }) as any;

      expect(result.assetId).toBe('exp-prop-1');
      expect(result.assetName).toBe('Manhattan Condo');
      expect(result.assetClass).toBe(AssetClass.REAL_ESTATE);
      expect(result.consensusValue).toBeGreaterThan(0);
      expect(result.consensusConfidence).toBeGreaterThan(0);
      expect(result.agentBreakdowns).toBeDefined();
      expect(result.agentBreakdowns.length).toBeGreaterThan(0);
      expect(result.agreementAnalysis).toBeDefined();
      expect(result.timestamp).toBeDefined();
    });

    it('should include agent methodology breakdown', async () => {
      await server.handleToolCall('valuate_asset', {
        id: 'exp-com-1',
        assetClass: AssetClass.COMMODITY,
        name: 'Gold Reserve',
        metadata: { commodity: 'gold', quantity: 100, grade: 'premium' },
      });

      const result = await server.handleToolCall('explain_valuation', { assetId: 'exp-com-1' }) as any;
      const breakdown = result.agentBreakdowns[0];

      expect(breakdown.agentId).toBeDefined();
      expect(breakdown.methodology).toBeDefined();
      expect(breakdown.valuedAt).toBeGreaterThan(0);
      expect(breakdown.confidence).toBeGreaterThan(0);
      expect(breakdown.consensusContribution).toBeDefined();
      expect(breakdown.deviationFromConsensus).toBeDefined();
      expect(breakdown.dataSources).toBeDefined();
      expect(breakdown.dataPointCount).toBeGreaterThan(0);
    });

    it('should categorize data points by source', async () => {
      await server.handleToolCall('valuate_asset', {
        id: 'exp-src-1',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Test Property',
        location: 'chicago',
        metadata: { squareFeet: 2000, annualRent: 80000, propertyType: 'commercial' },
      });

      const result = await server.handleToolCall('explain_valuation', { assetId: 'exp-src-1' }) as any;
      const breakdown = result.agentBreakdowns[0];

      // PropertyAgent should have data from comparable_sales, property_data, etc.
      expect(Object.keys(breakdown.dataSources).length).toBeGreaterThan(0);
      for (const source of Object.values(breakdown.dataSources) as any[]) {
        expect(Array.isArray(source)).toBe(true);
        for (const dp of source) {
          expect(dp).toHaveProperty('metric');
          expect(dp).toHaveProperty('value');
          expect(dp).toHaveProperty('weight');
        }
      }
    });

    it('should include consensus contribution percentages', async () => {
      await server.handleToolCall('valuate_asset', {
        id: 'exp-pct-1',
        assetClass: AssetClass.COMMODITY,
        name: 'Silver',
        metadata: { commodity: 'silver', quantity: 1000 },
      });

      const result = await server.handleToolCall('explain_valuation', { assetId: 'exp-pct-1' }) as any;
      for (const breakdown of result.agentBreakdowns) {
        expect(breakdown.consensusContribution).toMatch(/\d+(\.\d+)?%/);
      }
    });

    it('should compute agreement analysis', async () => {
      await server.handleToolCall('valuate_asset', {
        id: 'exp-agree-1',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Agreement Test',
        location: 'miami',
        metadata: { squareFeet: 3000 },
      });

      const result = await server.handleToolCall('explain_valuation', { assetId: 'exp-agree-1' }) as any;
      const analysis = result.agreementAnalysis;

      expect(analysis.minValuation).toBeGreaterThanOrEqual(0);
      expect(analysis.maxValuation).toBeGreaterThanOrEqual(analysis.minValuation);
      expect(analysis.spreadPercent).toBeGreaterThanOrEqual(0);
      expect(['HIGH', 'MODERATE', 'LOW']).toContain(analysis.agreement);
    });

    it('should explain equity valuation', async () => {
      await server.handleToolCall('valuate_asset', {
        id: 'exp-eq-1',
        assetClass: AssetClass.EQUITY,
        name: 'TechCorp',
        metadata: {
          industry: 'technology',
          earnings: 5_000_000_000,
          freeCashFlow: 4_000_000_000,
          sharesOutstanding: 1_000_000_000,
          dividendPerShare: 1.5,
        },
      });

      const result = await server.handleToolCall('explain_valuation', { assetId: 'exp-eq-1' }) as any;
      expect(result.assetClass).toBe(AssetClass.EQUITY);
      expect(result.agentBreakdowns.length).toBe(1);
      expect(result.agentBreakdowns[0].agentId).toBe('equity-agent');
    });
  });

  describe('compare_agents', () => {
    it('should return error for non-existent asset', async () => {
      const result = await server.handleToolCall('compare_agents', { assetId: 'nonexistent' });
      expect(result).toHaveProperty('error');
    });

    it('should compare agents for a real estate asset', async () => {
      await server.handleToolCall('valuate_asset', {
        id: 'cmp-prop-1',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Compare Property',
        location: 'seattle',
        metadata: { squareFeet: 1800, annualRent: 90000 },
      });

      const result = await server.handleToolCall('compare_agents', { assetId: 'cmp-prop-1' }) as any;

      expect(result.assetId).toBe('cmp-prop-1');
      expect(result.assetName).toBe('Compare Property');
      expect(result.assetClass).toBe(AssetClass.REAL_ESTATE);
      expect(result.consensusValue).toBeGreaterThan(0);
      expect(result.agentComparisons).toBeDefined();
      expect(result.agentComparisons.length).toBeGreaterThan(0);
      expect(result.participatingAgentCount).toBeGreaterThan(0);
    });

    it('should show incapable agents', async () => {
      await server.handleToolCall('valuate_asset', {
        id: 'cmp-com-1',
        assetClass: AssetClass.COMMODITY,
        name: 'Gold Test',
        metadata: { commodity: 'gold', quantity: 10 },
      });

      const result = await server.handleToolCall('compare_agents', { assetId: 'cmp-com-1' }) as any;

      // PropertyAgent, TreasuryAgent, EquityAgent can't handle commodities
      expect(result.incapableAgents.length).toBe(3);
      const incapableIds = result.incapableAgents.map((a: any) => a.id);
      expect(incapableIds).toContain('property-agent');
      expect(incapableIds).toContain('treasury-agent');
      expect(incapableIds).toContain('equity-agent');
    });

    it('should include agent comparison details', async () => {
      await server.handleToolCall('valuate_asset', {
        id: 'cmp-detail-1',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Detail Property',
        location: 'london',
        metadata: { squareFeet: 2500 },
      });

      const result = await server.handleToolCall('compare_agents', { assetId: 'cmp-detail-1' }) as any;
      for (const comparison of result.agentComparisons) {
        expect(comparison).toHaveProperty('agentId');
        expect(comparison).toHaveProperty('agentName');
        expect(comparison).toHaveProperty('value');
        expect(comparison).toHaveProperty('confidence');
        expect(comparison).toHaveProperty('methodology');
        expect(comparison).toHaveProperty('dataPointCount');
        expect(comparison).toHaveProperty('metrics');
        expect(Array.isArray(comparison.metrics)).toBe(true);
      }
    });

    it('should analyze common and unique metrics', async () => {
      await server.handleToolCall('valuate_asset', {
        id: 'cmp-metric-1',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Metric Property',
        location: 'austin',
        metadata: { squareFeet: 1200, annualRent: 60000 },
      });

      const result = await server.handleToolCall('compare_agents', { assetId: 'cmp-metric-1' }) as any;
      const analysis = result.metricAnalysis;

      expect(analysis).toBeDefined();
      expect(Array.isArray(analysis.commonMetrics)).toBe(true);
      expect(analysis.totalUniqueMetrics).toBeGreaterThan(0);
    });

    it('should compare equity agent alone', async () => {
      await server.handleToolCall('valuate_asset', {
        id: 'cmp-eq-1',
        assetClass: AssetClass.EQUITY,
        name: 'EquityCorp',
        metadata: {
          industry: 'financials',
          earnings: 2_000_000_000,
          sharesOutstanding: 500_000_000,
        },
      });

      const result = await server.handleToolCall('compare_agents', { assetId: 'cmp-eq-1' }) as any;
      expect(result.participatingAgentCount).toBe(1);
      expect(result.agentComparisons[0].agentId).toBe('equity-agent');
      // 3 other agents can't handle equity
      expect(result.incapableAgents.length).toBe(3);
    });

    it('should include capable vs participating agent counts', async () => {
      await server.handleToolCall('valuate_asset', {
        id: 'cmp-count-1',
        assetClass: AssetClass.COMMODITY,
        name: 'Copper Test',
        metadata: { commodity: 'copper', quantity: 5000 },
      });

      const result = await server.handleToolCall('compare_agents', { assetId: 'cmp-count-1' }) as any;
      expect(result.capableAgentCount).toBe(1);
      expect(result.participatingAgentCount).toBe(1);
    });
  });

  describe('equity agent integration via MCP', () => {
    it('should valuate equity via MCP', async () => {
      const result = await server.handleToolCall('valuate_asset', {
        id: 'mcp-eq-1',
        assetClass: AssetClass.EQUITY,
        name: 'TechGiant',
        metadata: {
          industry: 'technology',
          earnings: 10_000_000_000,
          freeCashFlow: 8_000_000_000,
          sharesOutstanding: 2_000_000_000,
          dividendPerShare: 2.0,
          bookValue: 150_000_000_000,
        },
      });

      expect((result as any).consensusValue).toBeGreaterThan(0);
      expect((result as any).avgConfidence).toBeGreaterThan(0.5);
    });

    it('should list equity agent', async () => {
      const agents = await server.handleToolCall('list_agents', {}) as any[];
      const equityAgent = agents.find(a => a.id === 'equity-agent');
      expect(equityAgent).toBeDefined();
      expect(equityAgent.assetClasses).toContain(AssetClass.EQUITY);
    });

    it('should include equity in portfolio summary', async () => {
      await server.handleToolCall('valuate_asset', {
        id: 'mcp-eq-2',
        assetClass: AssetClass.EQUITY,
        name: 'HealthCare Inc',
        metadata: { industry: 'healthcare', earnings: 3_000_000_000, sharesOutstanding: 1_000_000_000 },
      });

      const summary = await server.handleToolCall('portfolio_summary', {}) as any;
      expect(summary.assetCount).toBe(1);
      const eq = summary.assets.find((a: any) => a.id === 'mcp-eq-2');
      expect(eq).toBeDefined();
      expect(eq.assetClass).toBe(AssetClass.EQUITY);
      expect(eq.value).toBeGreaterThan(0);
    });

    it('should include equity in risk analysis', async () => {
      await server.handleToolCall('valuate_asset', {
        id: 'risk-eq-1',
        assetClass: AssetClass.EQUITY,
        name: 'RiskTest Corp',
        metadata: { industry: 'technology', earnings: 5_000_000_000, sharesOutstanding: 1_000_000_000 },
      });

      const risk = await server.handleToolCall('risk_analysis', {}) as any;
      expect(risk).toBeDefined();
    });
  });

  describe('multi-asset explain and compare', () => {
    it('should handle explain after multiple valuations', async () => {
      // Valuate multiple assets
      await server.handleToolCall('valuate_asset', {
        id: 'multi-prop',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Multi Property',
        location: 'manhattan',
        metadata: { squareFeet: 1000 },
      });
      await server.handleToolCall('valuate_asset', {
        id: 'multi-gold',
        assetClass: AssetClass.COMMODITY,
        name: 'Multi Gold',
        metadata: { commodity: 'gold', quantity: 50 },
      });
      await server.handleToolCall('valuate_asset', {
        id: 'multi-eq',
        assetClass: AssetClass.EQUITY,
        name: 'Multi Equity',
        metadata: { industry: 'technology', earnings: 1_000_000_000, sharesOutstanding: 100_000_000 },
      });

      // Explain each
      const propExplain = await server.handleToolCall('explain_valuation', { assetId: 'multi-prop' }) as any;
      const goldExplain = await server.handleToolCall('explain_valuation', { assetId: 'multi-gold' }) as any;
      const eqExplain = await server.handleToolCall('explain_valuation', { assetId: 'multi-eq' }) as any;

      expect(propExplain.assetClass).toBe(AssetClass.REAL_ESTATE);
      expect(goldExplain.assetClass).toBe(AssetClass.COMMODITY);
      expect(eqExplain.assetClass).toBe(AssetClass.EQUITY);
    });

    it('should handle compare after multiple valuations', async () => {
      await server.handleToolCall('valuate_asset', {
        id: 'multi-cmp-prop',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'CMP Property',
        location: 'san_francisco',
        metadata: { squareFeet: 1500 },
      });
      await server.handleToolCall('valuate_asset', {
        id: 'multi-cmp-eq',
        assetClass: AssetClass.EQUITY,
        name: 'CMP Equity',
        metadata: { industry: 'healthcare', earnings: 2_000_000_000, sharesOutstanding: 500_000_000 },
      });

      const propCompare = await server.handleToolCall('compare_agents', { assetId: 'multi-cmp-prop' }) as any;
      const eqCompare = await server.handleToolCall('compare_agents', { assetId: 'multi-cmp-eq' }) as any;

      expect(propCompare.participatingAgentCount).toBe(1);
      expect(eqCompare.participatingAgentCount).toBe(1);
    });
  });
});
