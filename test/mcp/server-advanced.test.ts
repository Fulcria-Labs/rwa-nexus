import { RWAMCPServer } from '../../src/mcp/server';
import { ConsensusEngine } from '../../src/oracle/consensus';
import { PropertyAgent } from '../../src/agents/property-agent';
import { CommodityAgent } from '../../src/agents/commodity-agent';
import { TreasuryAgent } from '../../src/agents/treasury-agent';
import { AssetClass } from '../../src/types';

describe('RWAMCPServer - Advanced', () => {
  let server: RWAMCPServer;
  let engine: ConsensusEngine;

  beforeEach(() => {
    engine = new ConsensusEngine();
    engine.registerAgent(new PropertyAgent());
    engine.registerAgent(new CommodityAgent());
    engine.registerAgent(new TreasuryAgent());
    server = new RWAMCPServer({ consensusEngine: engine });
  });

  describe('tool schema validation', () => {
    it('valuate_asset should require id, assetClass, name', () => {
      const tools = server.getToolDefinitions();
      const valuateTool = tools.find(t => t.name === 'valuate_asset');
      expect(valuateTool!.inputSchema.required).toContain('id');
      expect(valuateTool!.inputSchema.required).toContain('assetClass');
      expect(valuateTool!.inputSchema.required).toContain('name');
    });

    it('get_price should require assetId', () => {
      const tools = server.getToolDefinitions();
      const getPriceTool = tools.find(t => t.name === 'get_price');
      expect(getPriceTool!.inputSchema.required).toContain('assetId');
    });

    it('submit_onchain should require assetId', () => {
      const tools = server.getToolDefinitions();
      const submitTool = tools.find(t => t.name === 'submit_onchain');
      expect(submitTool!.inputSchema.required).toContain('assetId');
    });

    it('list_agents should not require any fields', () => {
      const tools = server.getToolDefinitions();
      const listTool = tools.find(t => t.name === 'list_agents');
      expect(listTool!.inputSchema.required).toBeUndefined();
    });

    it('portfolio_summary should not require any fields', () => {
      const tools = server.getToolDefinitions();
      const portfolioTool = tools.find(t => t.name === 'portfolio_summary');
      expect(portfolioTool!.inputSchema.required).toBeUndefined();
    });

    it('all tools should have descriptions', () => {
      const tools = server.getToolDefinitions();
      for (const tool of tools) {
        expect(tool.description).toBeTruthy();
        expect(tool.description.length).toBeGreaterThan(10);
      }
    });

    it('valuate_asset should list assetClass enum values', () => {
      const tools = server.getToolDefinitions();
      const valuateTool = tools.find(t => t.name === 'valuate_asset');
      const assetClassProp = valuateTool!.inputSchema.properties.assetClass as any;
      expect(assetClassProp.enum).toContain('real_estate');
      expect(assetClassProp.enum).toContain('commodity');
      expect(assetClassProp.enum).toContain('treasury');
    });
  });

  describe('valuate_asset edge cases', () => {
    it('should handle minimal args (only required fields)', async () => {
      const result = await server.handleToolCall('valuate_asset', {
        id: 'min-prop',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Minimal Property',
      }) as any;

      expect(result.consensusValue).toBeGreaterThan(0);
    });

    it('should handle empty metadata', async () => {
      const result = await server.handleToolCall('valuate_asset', {
        id: 'empty-meta',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Empty Meta',
        metadata: {},
      }) as any;

      expect(result.consensusValue).toBeGreaterThan(0);
    });

    it('should handle missing optional description', async () => {
      const result = await server.handleToolCall('valuate_asset', {
        id: 'no-desc',
        assetClass: AssetClass.COMMODITY,
        name: 'Gold',
        metadata: { commodity: 'gold', quantity: 1 },
      }) as any;

      expect(result.consensusValue).toBeGreaterThan(0);
    });

    it('should store asset in portfolio after valuation', async () => {
      await server.handleToolCall('valuate_asset', {
        id: 'stored-asset',
        assetClass: AssetClass.COMMODITY,
        name: 'Stored Gold',
        metadata: { commodity: 'gold', quantity: 5 },
      });

      const portfolio = await server.handleToolCall('portfolio_summary', {}) as any;
      expect(portfolio.assetCount).toBe(1);
      expect(portfolio.assets[0].id).toBe('stored-asset');
      expect(portfolio.assets[0].name).toBe('Stored Gold');
    });
  });

  describe('get_price edge cases', () => {
    it('should return error object for missing asset', async () => {
      const result = await server.handleToolCall('get_price', { assetId: 'not-found' }) as any;
      expect(result.error).toBeDefined();
      expect(result.error).toContain('not-found');
    });

    it('should return full consensus result for existing asset', async () => {
      await server.handleToolCall('valuate_asset', {
        id: 'price-check',
        assetClass: AssetClass.COMMODITY,
        name: 'Silver',
        metadata: { commodity: 'silver', quantity: 100 },
      });

      const result = await server.handleToolCall('get_price', { assetId: 'price-check' }) as any;
      expect(result.consensusValue).toBeGreaterThan(0);
      expect(result.avgConfidence).toBeGreaterThan(0);
      expect(result.methodology).toBeTruthy();
    });
  });

  describe('submit_onchain edge cases', () => {
    it('should return error when no bridge and asset not found', async () => {
      const result = await server.handleToolCall('submit_onchain', { assetId: 'ghost' }) as any;
      expect(result.error).toBeDefined();
    });

    it('should prefer bridge check error message', async () => {
      await server.handleToolCall('valuate_asset', {
        id: 'chain-test',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Test',
        metadata: { squareFeet: 1000 },
      });

      const result = await server.handleToolCall('submit_onchain', { assetId: 'chain-test' }) as any;
      expect(result.error).toContain('No chain bridge');
    });
  });

  describe('list_agents details', () => {
    it('should return correct agent details', async () => {
      const result = await server.handleToolCall('list_agents', {}) as any[];

      const property = result.find(a => a.id === 'property-agent');
      expect(property.name).toContain('Real Estate');
      expect(property.assetClasses).toEqual([AssetClass.REAL_ESTATE]);
      expect(property.description).toBeTruthy();

      const commodity = result.find(a => a.id === 'commodity-agent');
      expect(commodity.name).toContain('Commodity');
      expect(commodity.assetClasses).toEqual([AssetClass.COMMODITY]);

      const treasury = result.find(a => a.id === 'treasury-agent');
      expect(treasury.name).toContain('Treasury');
      expect(treasury.assetClasses).toEqual([AssetClass.TREASURY]);
    });
  });

  describe('portfolio_summary with multiple valuations', () => {
    it('should compute correct total value', async () => {
      await server.handleToolCall('valuate_asset', {
        id: 'ps-1',
        assetClass: AssetClass.COMMODITY,
        name: 'Gold',
        metadata: { commodity: 'gold', quantity: 10 },
      });

      await server.handleToolCall('valuate_asset', {
        id: 'ps-2',
        assetClass: AssetClass.COMMODITY,
        name: 'Silver',
        metadata: { commodity: 'silver', quantity: 100 },
      });

      const price1 = await server.handleToolCall('get_price', { assetId: 'ps-1' }) as any;
      const price2 = await server.handleToolCall('get_price', { assetId: 'ps-2' }) as any;
      const portfolio = await server.handleToolCall('portfolio_summary', {}) as any;

      expect(portfolio.totalValue).toBeCloseTo(
        price1.consensusValue + price2.consensusValue,
        0
      );
    });

    it('should include asset class in summary', async () => {
      await server.handleToolCall('valuate_asset', {
        id: 'class-test',
        assetClass: AssetClass.TREASURY,
        name: 'Bond',
        metadata: { maturityYears: 5, couponRate: 0.04, faceValue: 1000 },
      });

      const portfolio = await server.handleToolCall('portfolio_summary', {}) as any;
      expect(portfolio.assets[0].assetClass).toBe(AssetClass.TREASURY);
    });

    it('should include lastUpdated timestamp', async () => {
      await server.handleToolCall('valuate_asset', {
        id: 'ts-test',
        assetClass: AssetClass.COMMODITY,
        name: 'Gold',
        metadata: { commodity: 'gold', quantity: 1 },
      });

      const portfolio = await server.handleToolCall('portfolio_summary', {}) as any;
      expect(portfolio.assets[0].lastUpdated).toBeTruthy();
      expect(new Date(portfolio.assets[0].lastUpdated).getTime()).toBeGreaterThan(0);
    });
  });
});
