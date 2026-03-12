import { RWAMCPServer } from '../../src/mcp/server';
import { ConsensusEngine } from '../../src/oracle/consensus';
import { PropertyAgent } from '../../src/agents/property-agent';
import { CommodityAgent } from '../../src/agents/commodity-agent';
import { TreasuryAgent } from '../../src/agents/treasury-agent';
import { AssetClass } from '../../src/types';

describe('RWAMCPServer - Security & Robustness', () => {
  let server: RWAMCPServer;
  let engine: ConsensusEngine;

  beforeEach(() => {
    engine = new ConsensusEngine();
    engine.registerAgent(new PropertyAgent());
    engine.registerAgent(new CommodityAgent());
    engine.registerAgent(new TreasuryAgent());
    server = new RWAMCPServer({ consensusEngine: engine });
  });

  describe('input validation for valuate_asset', () => {
    it('should handle missing description', async () => {
      const result = await server.handleToolCall('valuate_asset', {
        id: 'val-nodesc',
        assetClass: AssetClass.COMMODITY,
        name: 'Gold',
        metadata: { commodity: 'gold', quantity: 1 },
      });
      expect((result as any).consensusValue).toBeGreaterThan(0);
    });

    it('should handle missing metadata', async () => {
      const result = await server.handleToolCall('valuate_asset', {
        id: 'val-nometa',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Property',
      });
      expect((result as any).consensusValue).toBeGreaterThan(0);
    });

    it('should handle empty metadata object', async () => {
      const result = await server.handleToolCall('valuate_asset', {
        id: 'val-emptymeta',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Property',
        metadata: {},
      });
      expect((result as any).consensusValue).toBeGreaterThan(0);
    });

    it('should handle special characters in asset name', async () => {
      const result = await server.handleToolCall('valuate_asset', {
        id: 'val-special',
        assetClass: AssetClass.COMMODITY,
        name: '<script>alert("xss")</script>',
        metadata: { commodity: 'gold', quantity: 1 },
      });
      expect((result as any).consensusValue).toBeGreaterThan(0);
    });

    it('should handle numeric asset ID', async () => {
      const result = await server.handleToolCall('valuate_asset', {
        id: '12345',
        assetClass: AssetClass.COMMODITY,
        name: 'Gold',
        metadata: { commodity: 'gold', quantity: 1 },
      });
      expect((result as any).assetId).toBe('12345');
    });
  });

  describe('get_price error cases', () => {
    it('should return error for null assetId', async () => {
      const result = await server.handleToolCall('get_price', { assetId: null as any });
      expect(result).toHaveProperty('error');
    });

    it('should return error for undefined assetId', async () => {
      const result = await server.handleToolCall('get_price', { assetId: undefined as any });
      expect(result).toHaveProperty('error');
    });

    it('should return error for empty string assetId', async () => {
      const result = await server.handleToolCall('get_price', { assetId: '' });
      expect(result).toHaveProperty('error');
    });

    it('should return consensus for previously valued asset', async () => {
      await server.handleToolCall('valuate_asset', {
        id: 'get-test',
        assetClass: AssetClass.COMMODITY,
        name: 'Silver',
        metadata: { commodity: 'silver', quantity: 100 },
      });
      const result = await server.handleToolCall('get_price', { assetId: 'get-test' });
      expect(result).toHaveProperty('consensusValue');
    });
  });

  describe('submit_onchain error cases', () => {
    it('should return error for non-existent asset with no bridge', async () => {
      const result = await server.handleToolCall('submit_onchain', { assetId: 'doesnt-exist' });
      expect((result as any).error).toBeDefined();
    });

    it('should return error mentioning chain bridge when not configured', async () => {
      await server.handleToolCall('valuate_asset', {
        id: 'submit-test',
        assetClass: AssetClass.COMMODITY,
        name: 'Gold',
        metadata: { commodity: 'gold', quantity: 1 },
      });
      const result = await server.handleToolCall('submit_onchain', { assetId: 'submit-test' });
      expect((result as any).error).toContain('chain bridge');
    });
  });

  describe('list_agents details', () => {
    it('should return agent with all expected fields', async () => {
      const result = await server.handleToolCall('list_agents', {}) as any[];
      for (const agent of result) {
        expect(agent).toHaveProperty('id');
        expect(agent).toHaveProperty('name');
        expect(agent).toHaveProperty('assetClasses');
        expect(agent).toHaveProperty('description');
      }
    });

    it('should include property agent', async () => {
      const result = await server.handleToolCall('list_agents', {}) as any[];
      expect(result.find(a => a.id === 'property-agent')).toBeDefined();
    });

    it('should include commodity agent', async () => {
      const result = await server.handleToolCall('list_agents', {}) as any[];
      expect(result.find(a => a.id === 'commodity-agent')).toBeDefined();
    });

    it('should include treasury agent', async () => {
      const result = await server.handleToolCall('list_agents', {}) as any[];
      expect(result.find(a => a.id === 'treasury-agent')).toBeDefined();
    });

    it('should show correct asset classes for property agent', async () => {
      const result = await server.handleToolCall('list_agents', {}) as any[];
      const prop = result.find(a => a.id === 'property-agent');
      expect(prop.assetClasses).toContain(AssetClass.REAL_ESTATE);
      expect(prop.assetClasses).toHaveLength(1);
    });

    it('should show correct asset classes for commodity agent', async () => {
      const result = await server.handleToolCall('list_agents', {}) as any[];
      const com = result.find(a => a.id === 'commodity-agent');
      expect(com.assetClasses).toContain(AssetClass.COMMODITY);
    });

    it('should show correct asset classes for treasury agent', async () => {
      const result = await server.handleToolCall('list_agents', {}) as any[];
      const trs = result.find(a => a.id === 'treasury-agent');
      expect(trs.assetClasses).toContain(AssetClass.TREASURY);
    });
  });

  describe('portfolio_summary edge cases', () => {
    it('should handle overwriting same asset multiple times', async () => {
      for (let i = 0; i < 5; i++) {
        await server.handleToolCall('valuate_asset', {
          id: 'overwrite',
          assetClass: AssetClass.COMMODITY,
          name: `Gold v${i}`,
          metadata: { commodity: 'gold', quantity: (i + 1) * 10 },
        });
      }
      const portfolio = await server.handleToolCall('portfolio_summary', {}) as any;
      expect(portfolio.assetCount).toBe(1);
      // Should have the last valuation (quantity=50)
      expect(portfolio.totalValue).toBeGreaterThan(100000);
    });

    it('should compute correct totalValue for multiple assets', async () => {
      await server.handleToolCall('valuate_asset', {
        id: 'sum-1',
        assetClass: AssetClass.COMMODITY,
        name: 'Gold',
        metadata: { commodity: 'gold', quantity: 10 },
      });
      await server.handleToolCall('valuate_asset', {
        id: 'sum-2',
        assetClass: AssetClass.COMMODITY,
        name: 'Silver',
        metadata: { commodity: 'silver', quantity: 100 },
      });

      const portfolio = await server.handleToolCall('portfolio_summary', {}) as any;
      const asset1 = portfolio.assets.find((a: any) => a.id === 'sum-1');
      const asset2 = portfolio.assets.find((a: any) => a.id === 'sum-2');
      expect(portfolio.totalValue).toBeCloseTo(asset1.value + asset2.value, 0);
    });

    it('should include all asset fields in summary', async () => {
      await server.handleToolCall('valuate_asset', {
        id: 'fields-test',
        assetClass: AssetClass.COMMODITY,
        name: 'Gold',
        metadata: { commodity: 'gold', quantity: 1 },
      });
      const portfolio = await server.handleToolCall('portfolio_summary', {}) as any;
      const asset = portfolio.assets[0];
      expect(asset).toHaveProperty('id');
      expect(asset).toHaveProperty('name');
      expect(asset).toHaveProperty('assetClass');
      expect(asset).toHaveProperty('value');
      expect(asset).toHaveProperty('confidence');
      expect(asset).toHaveProperty('lastUpdated');
    });

    it('should have ISO string format for lastUpdated', async () => {
      await server.handleToolCall('valuate_asset', {
        id: 'iso-test',
        assetClass: AssetClass.COMMODITY,
        name: 'Gold',
        metadata: { commodity: 'gold', quantity: 1 },
      });
      const portfolio = await server.handleToolCall('portfolio_summary', {}) as any;
      const asset = portfolio.assets[0];
      expect(asset.lastUpdated).toMatch(/\d{4}-\d{2}-\d{2}T/);
    });
  });

  describe('tool definitions structure', () => {
    it('should have input schema for valuate_asset with required fields', () => {
      const tools = server.getToolDefinitions();
      const valuate = tools.find(t => t.name === 'valuate_asset')!;
      expect(valuate.inputSchema.required).toContain('id');
      expect(valuate.inputSchema.required).toContain('assetClass');
      expect(valuate.inputSchema.required).toContain('name');
    });

    it('should have input schema for get_price with required assetId', () => {
      const tools = server.getToolDefinitions();
      const getPrice = tools.find(t => t.name === 'get_price')!;
      expect(getPrice.inputSchema.required).toContain('assetId');
    });

    it('should have input schema for submit_onchain with required assetId', () => {
      const tools = server.getToolDefinitions();
      const submit = tools.find(t => t.name === 'submit_onchain')!;
      expect(submit.inputSchema.required).toContain('assetId');
    });

    it('should have descriptions for all tools', () => {
      const tools = server.getToolDefinitions();
      for (const tool of tools) {
        expect(tool.description).toBeTruthy();
        expect(tool.description.length).toBeGreaterThan(10);
      }
    });

    it('should have enum values for assetClass property', () => {
      const tools = server.getToolDefinitions();
      const valuate = tools.find(t => t.name === 'valuate_asset')!;
      const assetClassProp = valuate.inputSchema.properties.assetClass as any;
      expect(assetClassProp.enum).toBeDefined();
      expect(assetClassProp.enum).toContain(AssetClass.REAL_ESTATE);
      expect(assetClassProp.enum).toContain(AssetClass.COMMODITY);
      expect(assetClassProp.enum).toContain(AssetClass.TREASURY);
    });
  });

  describe('unknown tool handling', () => {
    it('should throw for empty string tool name', async () => {
      await expect(server.handleToolCall('', {})).rejects.toThrow('Unknown tool');
    });

    it('should throw for tool name with special characters', async () => {
      await expect(server.handleToolCall('!@#$%', {})).rejects.toThrow('Unknown tool');
    });

    it('should throw for similar but wrong tool names', async () => {
      await expect(server.handleToolCall('valuate_assets', {})).rejects.toThrow('Unknown tool');
      await expect(server.handleToolCall('get_prices', {})).rejects.toThrow('Unknown tool');
      await expect(server.handleToolCall('VALUATE_ASSET', {})).rejects.toThrow('Unknown tool');
    });
  });

  describe('server with no agents', () => {
    it('should return empty agent list', async () => {
      const emptyEngine = new ConsensusEngine();
      const emptyServer = new RWAMCPServer({ consensusEngine: emptyEngine });
      const result = await emptyServer.handleToolCall('list_agents', {}) as any[];
      expect(result).toHaveLength(0);
    });

    it('should throw on valuate with no capable agents', async () => {
      const emptyEngine = new ConsensusEngine();
      const emptyServer = new RWAMCPServer({ consensusEngine: emptyEngine });
      await expect(
        emptyServer.handleToolCall('valuate_asset', {
          id: 'test',
          assetClass: AssetClass.COMMODITY,
          name: 'Gold',
          metadata: { commodity: 'gold', quantity: 1 },
        })
      ).rejects.toThrow('No agents registered');
    });
  });
});
