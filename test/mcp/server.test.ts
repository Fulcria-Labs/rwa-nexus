import { RWAMCPServer } from '../../src/mcp/server';
import { ConsensusEngine } from '../../src/oracle/consensus';
import { PropertyAgent } from '../../src/agents/property-agent';
import { CommodityAgent } from '../../src/agents/commodity-agent';
import { TreasuryAgent } from '../../src/agents/treasury-agent';
import { AssetClass } from '../../src/types';

describe('RWAMCPServer', () => {
  let server: RWAMCPServer;
  let engine: ConsensusEngine;

  beforeEach(() => {
    engine = new ConsensusEngine();
    engine.registerAgent(new PropertyAgent());
    engine.registerAgent(new CommodityAgent());
    engine.registerAgent(new TreasuryAgent());
    server = new RWAMCPServer({ consensusEngine: engine });
  });

  describe('tool definitions', () => {
    it('should return 6 tools', () => {
      const tools = server.getToolDefinitions();
      expect(tools).toHaveLength(6);
    });

    it('should include all expected tools', () => {
      const tools = server.getToolDefinitions();
      const names = tools.map(t => t.name);
      expect(names).toContain('valuate_asset');
      expect(names).toContain('get_price');
      expect(names).toContain('submit_onchain');
      expect(names).toContain('list_agents');
      expect(names).toContain('portfolio_summary');
      expect(names).toContain('risk_analysis');
    });

    it('should have valid input schemas', () => {
      const tools = server.getToolDefinitions();
      for (const tool of tools) {
        expect(tool.inputSchema).toBeDefined();
        expect(tool.inputSchema.type).toBe('object');
        expect(tool.description).toBeTruthy();
      }
    });
  });

  describe('valuate_asset', () => {
    it('should valuate a real estate asset', async () => {
      const result = await server.handleToolCall('valuate_asset', {
        id: 'mcp-prop-1',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'MCP Test Property',
        location: 'san_francisco',
        metadata: { squareFeet: 2000 },
      });

      expect(result).toHaveProperty('consensusValue');
      expect(result).toHaveProperty('avgConfidence');
      expect((result as any).consensusValue).toBeGreaterThan(0);
    });

    it('should valuate a commodity', async () => {
      const result = await server.handleToolCall('valuate_asset', {
        id: 'mcp-com-1',
        assetClass: AssetClass.COMMODITY,
        name: 'Gold Reserve',
        metadata: { commodity: 'gold', quantity: 50 },
      });

      expect((result as any).consensusValue).toBeGreaterThan(100000);
    });

    it('should valuate a treasury bond', async () => {
      const result = await server.handleToolCall('valuate_asset', {
        id: 'mcp-trs-1',
        assetClass: AssetClass.TREASURY,
        name: 'US Treasury 10Y',
        metadata: { maturityYears: 10, couponRate: 0.04, faceValue: 1000 },
      });

      expect((result as any).consensusValue).toBeGreaterThan(0);
    });
  });

  describe('get_price', () => {
    it('should return error for unknown asset', async () => {
      const result = await server.handleToolCall('get_price', { assetId: 'unknown' });
      expect(result).toHaveProperty('error');
    });

    it('should return valuation after valuate_asset', async () => {
      await server.handleToolCall('valuate_asset', {
        id: 'mcp-test',
        assetClass: AssetClass.COMMODITY,
        name: 'Silver',
        metadata: { commodity: 'silver', quantity: 100 },
      });

      const result = await server.handleToolCall('get_price', { assetId: 'mcp-test' });
      expect(result).toHaveProperty('consensusValue');
    });
  });

  describe('submit_onchain', () => {
    it('should return error without chain bridge', async () => {
      await server.handleToolCall('valuate_asset', {
        id: 'mcp-submit',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Test',
        metadata: { squareFeet: 1000 },
      });

      const result = await server.handleToolCall('submit_onchain', { assetId: 'mcp-submit' });
      expect(result).toHaveProperty('error');
      expect((result as any).error).toContain('No chain bridge');
    });

    it('should return error for unvaluated asset', async () => {
      const result = await server.handleToolCall('submit_onchain', { assetId: 'nonexistent' });
      expect(result).toHaveProperty('error');
    });
  });

  describe('list_agents', () => {
    it('should return all registered agents', async () => {
      const result = await server.handleToolCall('list_agents', {});
      expect(Array.isArray(result)).toBe(true);
      expect((result as any[]).length).toBe(3);
    });

    it('should include agent details', async () => {
      const result = await server.handleToolCall('list_agents', {}) as any[];
      const property = result.find(a => a.id === 'property-agent');
      expect(property).toBeDefined();
      expect(property.assetClasses).toContain(AssetClass.REAL_ESTATE);
    });
  });

  describe('portfolio_summary', () => {
    it('should return empty portfolio initially', async () => {
      const result = await server.handleToolCall('portfolio_summary', {}) as any;
      expect(result.assetCount).toBe(0);
      expect(result.totalValue).toBe(0);
      expect(result.assets).toHaveLength(0);
    });

    it('should track assets after valuation', async () => {
      await server.handleToolCall('valuate_asset', {
        id: 'port-1',
        assetClass: AssetClass.COMMODITY,
        name: 'Gold',
        metadata: { commodity: 'gold', quantity: 10 },
      });

      await server.handleToolCall('valuate_asset', {
        id: 'port-2',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Property',
        location: 'miami',
        metadata: { squareFeet: 2000 },
      });

      const result = await server.handleToolCall('portfolio_summary', {}) as any;
      expect(result.assetCount).toBe(2);
      expect(result.totalValue).toBeGreaterThan(0);
      expect(result.assets).toHaveLength(2);
    });
  });

  describe('error handling', () => {
    it('should throw for unknown tool', async () => {
      await expect(server.handleToolCall('nonexistent', {})).rejects.toThrow('Unknown tool');
    });
  });
});
