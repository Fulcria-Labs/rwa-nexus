import { RWAMCPServer } from '../../src/mcp/server';
import { ConsensusEngine } from '../../src/oracle/consensus';
import { PropertyAgent } from '../../src/agents/property-agent';
import { CommodityAgent } from '../../src/agents/commodity-agent';
import { TreasuryAgent } from '../../src/agents/treasury-agent';
import { AssetClass } from '../../src/types';

describe('MCP Server Lifecycle & Validation', () => {
  let server: RWAMCPServer;
  let engine: ConsensusEngine;

  beforeEach(() => {
    engine = new ConsensusEngine();
    engine.registerAgent(new PropertyAgent());
    engine.registerAgent(new CommodityAgent());
    engine.registerAgent(new TreasuryAgent());
    server = new RWAMCPServer({ consensusEngine: engine });
  });

  // ---- Tool definitions validation ----
  describe('tool definitions', () => {
    it('valuate_asset has required fields', () => {
      const tools = server.getToolDefinitions();
      const valuate = tools.find(t => t.name === 'valuate_asset');
      expect(valuate).toBeDefined();
      expect(valuate!.inputSchema.required).toContain('id');
      expect(valuate!.inputSchema.required).toContain('assetClass');
      expect(valuate!.inputSchema.required).toContain('name');
    });

    it('get_price has required fields', () => {
      const tools = server.getToolDefinitions();
      const price = tools.find(t => t.name === 'get_price');
      expect(price).toBeDefined();
      expect(price!.inputSchema.required).toContain('assetId');
    });

    it('submit_onchain has required fields', () => {
      const tools = server.getToolDefinitions();
      const submit = tools.find(t => t.name === 'submit_onchain');
      expect(submit).toBeDefined();
      expect(submit!.inputSchema.required).toContain('assetId');
    });

    it('list_agents has no required fields', () => {
      const tools = server.getToolDefinitions();
      const list = tools.find(t => t.name === 'list_agents');
      expect(list).toBeDefined();
      expect(list!.inputSchema.required).toBeUndefined();
    });

    it('portfolio_summary has no required fields', () => {
      const tools = server.getToolDefinitions();
      const portfolio = tools.find(t => t.name === 'portfolio_summary');
      expect(portfolio).toBeDefined();
      expect(portfolio!.inputSchema.required).toBeUndefined();
    });

    it('valuate_asset schema includes all AssetClass enum values', () => {
      const tools = server.getToolDefinitions();
      const valuate = tools.find(t => t.name === 'valuate_asset');
      const props = valuate!.inputSchema.properties as Record<string, any>;
      const enumValues = props.assetClass.enum;
      expect(enumValues).toContain('real_estate');
      expect(enumValues).toContain('commodity');
      expect(enumValues).toContain('treasury');
      expect(enumValues).toContain('equity');
      expect(enumValues).toContain('receivable');
    });
  });

  // ---- Valuate asset edge cases ----
  describe('valuate_asset edge cases', () => {
    it('handles special characters in asset ID', async () => {
      const result = await server.handleToolCall('valuate_asset', {
        id: 'asset/with:special$chars!@#',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Special',
        metadata: { squareFeet: 1000 },
      }) as any;
      expect(result.assetId).toBe('asset/with:special$chars!@#');
    });

    it('handles empty string asset ID', async () => {
      const result = await server.handleToolCall('valuate_asset', {
        id: '',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Empty ID',
        metadata: { squareFeet: 1000 },
      }) as any;
      expect(result.assetId).toBe('');
      expect(result.consensusValue).toBeGreaterThan(0);
    });

    it('handles very long asset ID', async () => {
      const longId = 'a'.repeat(1000);
      const result = await server.handleToolCall('valuate_asset', {
        id: longId,
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Long ID',
        metadata: { squareFeet: 1000 },
      }) as any;
      expect(result.assetId).toBe(longId);
    });

    it('handles unicode in asset name', async () => {
      const result = await server.handleToolCall('valuate_asset', {
        id: 'unicode-1',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Maison de Paris',
        description: 'Appartement parisien',
        metadata: { squareFeet: 1000 },
      }) as any;
      expect(result.consensusValue).toBeGreaterThan(0);
    });

    it('handles missing description (optional)', async () => {
      const result = await server.handleToolCall('valuate_asset', {
        id: 'no-desc',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'No Description',
        metadata: { squareFeet: 1000 },
      }) as any;
      expect(result.consensusValue).toBeGreaterThan(0);
    });

    it('handles missing metadata (defaults to empty object)', async () => {
      const result = await server.handleToolCall('valuate_asset', {
        id: 'no-meta',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'No Metadata',
      }) as any;
      expect(result.consensusValue).toBeGreaterThan(0);
    });

    it('handles EQUITY asset class (no agents available)', async () => {
      await expect(
        server.handleToolCall('valuate_asset', {
          id: 'equity-1',
          assetClass: AssetClass.EQUITY,
          name: 'Stock',
          metadata: {},
        })
      ).rejects.toThrow('No agents registered');
    });

    it('handles RECEIVABLE asset class (no agents available)', async () => {
      await expect(
        server.handleToolCall('valuate_asset', {
          id: 'recv-1',
          assetClass: AssetClass.RECEIVABLE,
          name: 'Invoice',
          metadata: {},
        })
      ).rejects.toThrow('No agents registered');
    });
  });

  // ---- Portfolio management ----
  describe('portfolio management', () => {
    it('empty portfolio summary', async () => {
      const result = await server.handleToolCall('portfolio_summary', {}) as any;
      expect(result.assetCount).toBe(0);
      expect(result.totalValue).toBe(0);
      expect(result.assets).toEqual([]);
    });

    it('portfolio tracks asset class', async () => {
      await server.handleToolCall('valuate_asset', {
        id: 'house', assetClass: AssetClass.REAL_ESTATE, name: 'House',
        metadata: { squareFeet: 1000 },
      });
      const portfolio = await server.handleToolCall('portfolio_summary', {}) as any;
      expect(portfolio.assets[0].assetClass).toBe('real_estate');
    });

    it('portfolio totalValue sums all assets', async () => {
      await server.handleToolCall('valuate_asset', {
        id: 'h1', assetClass: AssetClass.REAL_ESTATE, name: 'H1',
        metadata: { squareFeet: 1000 },
      });
      await server.handleToolCall('valuate_asset', {
        id: 'h2', assetClass: AssetClass.REAL_ESTATE, name: 'H2',
        metadata: { squareFeet: 1000 },
      });
      const portfolio = await server.handleToolCall('portfolio_summary', {}) as any;
      expect(portfolio.assetCount).toBe(2);
      // Both should have same value (same metadata)
      expect(portfolio.assets[0].value).toBe(portfolio.assets[1].value);
      expect(portfolio.totalValue).toBe(portfolio.assets[0].value * 2);
    });

    it('portfolio includes confidence for each asset', async () => {
      await server.handleToolCall('valuate_asset', {
        id: 'h1', assetClass: AssetClass.REAL_ESTATE, name: 'H1',
        metadata: { squareFeet: 1000 },
      });
      const portfolio = await server.handleToolCall('portfolio_summary', {}) as any;
      expect(portfolio.assets[0].confidence).toBeGreaterThan(0);
      expect(portfolio.assets[0].confidence).toBeLessThanOrEqual(1);
    });

    it('portfolio includes lastUpdated timestamp', async () => {
      await server.handleToolCall('valuate_asset', {
        id: 'h1', assetClass: AssetClass.REAL_ESTATE, name: 'H1',
        metadata: { squareFeet: 1000 },
      });
      const portfolio = await server.handleToolCall('portfolio_summary', {}) as any;
      expect(portfolio.assets[0].lastUpdated).toBeTruthy();
      // Should be valid ISO string
      expect(new Date(portfolio.assets[0].lastUpdated).getTime()).toBeGreaterThan(0);
    });

    it('get_price returns consensus result for existing asset', async () => {
      await server.handleToolCall('valuate_asset', {
        id: 'h1', assetClass: AssetClass.REAL_ESTATE, name: 'House',
        metadata: { squareFeet: 1000 },
      });
      const price = await server.handleToolCall('get_price', { assetId: 'h1' }) as any;
      expect(price.consensusValue).toBeGreaterThan(0);
      expect(price.assetId).toBe('h1');
    });
  });

  // ---- list_agents ----
  describe('list_agents details', () => {
    it('agent entries have all required fields', async () => {
      const agents = await server.handleToolCall('list_agents', {}) as any[];
      for (const agent of agents) {
        expect(agent.id).toBeTruthy();
        expect(agent.name).toBeTruthy();
        expect(agent.assetClasses).toBeInstanceOf(Array);
        expect(agent.assetClasses.length).toBeGreaterThan(0);
        expect(agent.description).toBeTruthy();
      }
    });

    it('PropertyAgent listed with correct asset classes', async () => {
      const agents = await server.handleToolCall('list_agents', {}) as any[];
      const prop = agents.find(a => a.id === 'property-agent');
      expect(prop).toBeDefined();
      expect(prop.assetClasses).toContain('real_estate');
      expect(prop.assetClasses.length).toBe(1);
    });

    it('CommodityAgent listed with correct asset classes', async () => {
      const agents = await server.handleToolCall('list_agents', {}) as any[];
      const comm = agents.find(a => a.id === 'commodity-agent');
      expect(comm).toBeDefined();
      expect(comm.assetClasses).toContain('commodity');
    });

    it('TreasuryAgent listed with correct asset classes', async () => {
      const agents = await server.handleToolCall('list_agents', {}) as any[];
      const treas = agents.find(a => a.id === 'treasury-agent');
      expect(treas).toBeDefined();
      expect(treas.assetClasses).toContain('treasury');
    });
  });

  // ---- Server without optional components ----
  describe('server without chain bridge', () => {
    it('constructs without chain bridge', () => {
      const s = new RWAMCPServer({ consensusEngine: engine });
      expect(s).toBeDefined();
    });

    it('submit_onchain returns error without bridge', async () => {
      const s = new RWAMCPServer({ consensusEngine: engine });
      await s.handleToolCall('valuate_asset', {
        id: 'h1', assetClass: AssetClass.REAL_ESTATE, name: 'House',
        metadata: {},
      });
      const result = await s.handleToolCall('submit_onchain', { assetId: 'h1' }) as any;
      expect(result.error).toContain('chain bridge');
    });
  });

  // ---- Batch valuations via MCP ----
  describe('batch operations', () => {
    it('valuate 20 assets sequentially', async () => {
      for (let i = 0; i < 20; i++) {
        await server.handleToolCall('valuate_asset', {
          id: `asset-${i}`,
          assetClass: AssetClass.REAL_ESTATE,
          name: `Asset ${i}`,
          metadata: { squareFeet: 1000 + i * 100 },
        });
      }
      const portfolio = await server.handleToolCall('portfolio_summary', {}) as any;
      expect(portfolio.assetCount).toBe(20);
      expect(portfolio.totalValue).toBeGreaterThan(0);
    });

    it('all 20 assets have increasing values', async () => {
      for (let i = 0; i < 20; i++) {
        await server.handleToolCall('valuate_asset', {
          id: `asset-${i}`,
          assetClass: AssetClass.REAL_ESTATE,
          name: `Asset ${i}`,
          metadata: { squareFeet: 1000 + i * 100 },
        });
      }
      const portfolio = await server.handleToolCall('portfolio_summary', {}) as any;
      for (let i = 1; i < portfolio.assets.length; i++) {
        expect(portfolio.assets[i].value).toBeGreaterThan(portfolio.assets[i - 1].value);
      }
    });
  });

  // ---- Diverse asset type portfolio ----
  describe('diverse portfolio', () => {
    it('portfolio with all three asset classes', async () => {
      await server.handleToolCall('valuate_asset', {
        id: 'house', assetClass: AssetClass.REAL_ESTATE, name: 'House',
        metadata: { squareFeet: 2000, annualRent: 80000, propertyType: 'residential' },
      });
      await server.handleToolCall('valuate_asset', {
        id: 'gold', assetClass: AssetClass.COMMODITY, name: 'Gold',
        metadata: { commodity: 'gold', quantity: 50, grade: 'premium' },
      });
      await server.handleToolCall('valuate_asset', {
        id: 'bond', assetClass: AssetClass.TREASURY, name: 'US Treasury',
        metadata: { bondType: 'us_treasury', maturityYears: 10, couponRate: 0.04, faceValue: 10000 },
      });

      const portfolio = await server.handleToolCall('portfolio_summary', {}) as any;
      expect(portfolio.assetCount).toBe(3);

      const classes = portfolio.assets.map((a: any) => a.assetClass);
      expect(classes).toContain('real_estate');
      expect(classes).toContain('commodity');
      expect(classes).toContain('treasury');

      // All should have positive values
      for (const asset of portfolio.assets) {
        expect(asset.value).toBeGreaterThan(0);
        expect(asset.confidence).toBeGreaterThan(0);
      }
    });
  });
});
