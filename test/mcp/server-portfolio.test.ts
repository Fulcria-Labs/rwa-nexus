import { RWAMCPServer } from '../../src/mcp/server';
import { ConsensusEngine } from '../../src/oracle/consensus';
import { PropertyAgent } from '../../src/agents/property-agent';
import { CommodityAgent } from '../../src/agents/commodity-agent';
import { TreasuryAgent } from '../../src/agents/treasury-agent';
import { ChainBridge } from '../../src/oracle/chain-bridge';
import { AssetClass } from '../../src/types';

describe('RWAMCPServer - Portfolio and tool interaction', () => {
  let server: RWAMCPServer;
  let engine: ConsensusEngine;

  beforeEach(() => {
    engine = new ConsensusEngine();
    engine.registerAgent(new PropertyAgent());
    engine.registerAgent(new CommodityAgent());
    engine.registerAgent(new TreasuryAgent());
    server = new RWAMCPServer({ consensusEngine: engine });
  });

  describe('portfolio lifecycle', () => {
    it('should track multiple assets after sequential valuations', async () => {
      await server.handleToolCall('valuate_asset', {
        id: 'p1',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Property 1',
        location: 'manhattan',
        metadata: { squareFeet: 1000 },
      });

      await server.handleToolCall('valuate_asset', {
        id: 'c1',
        assetClass: AssetClass.COMMODITY,
        name: 'Gold',
        metadata: { commodity: 'gold', quantity: 10 },
      });

      await server.handleToolCall('valuate_asset', {
        id: 't1',
        assetClass: AssetClass.TREASURY,
        name: 'Bond',
        metadata: { maturityYears: 10, couponRate: 0.04, faceValue: 1000 },
      });

      const summary = await server.handleToolCall('portfolio_summary', {}) as any;
      expect(summary.assetCount).toBe(3);
      expect(summary.assets).toHaveLength(3);
      expect(summary.totalValue).toBeGreaterThan(0);
    });

    it('should overwrite existing asset valuation on re-valuate', async () => {
      await server.handleToolCall('valuate_asset', {
        id: 'overwrite',
        assetClass: AssetClass.COMMODITY,
        name: 'Gold v1',
        metadata: { commodity: 'gold', quantity: 1 },
      });

      const price1 = await server.handleToolCall('get_price', { assetId: 'overwrite' }) as any;

      await server.handleToolCall('valuate_asset', {
        id: 'overwrite',
        assetClass: AssetClass.COMMODITY,
        name: 'Gold v2',
        metadata: { commodity: 'gold', quantity: 100 },
      });

      const price2 = await server.handleToolCall('get_price', { assetId: 'overwrite' }) as any;

      expect(price2.consensusValue).toBeGreaterThan(price1.consensusValue * 50);

      const summary = await server.handleToolCall('portfolio_summary', {}) as any;
      expect(summary.assetCount).toBe(1);
    });

    it('should return correct total value across portfolio', async () => {
      const r1 = await server.handleToolCall('valuate_asset', {
        id: 'a1',
        assetClass: AssetClass.COMMODITY,
        name: 'Gold',
        metadata: { commodity: 'gold', quantity: 1 },
      }) as any;

      const r2 = await server.handleToolCall('valuate_asset', {
        id: 'a2',
        assetClass: AssetClass.COMMODITY,
        name: 'Silver',
        metadata: { commodity: 'silver', quantity: 1 },
      }) as any;

      const summary = await server.handleToolCall('portfolio_summary', {}) as any;
      expect(summary.totalValue).toBe(r1.consensusValue + r2.consensusValue);
    });
  });

  describe('portfolio_summary asset details', () => {
    it('should include asset name in summary', async () => {
      await server.handleToolCall('valuate_asset', {
        id: 'detail-test',
        assetClass: AssetClass.COMMODITY,
        name: 'Premium Gold Reserve',
        metadata: { commodity: 'gold', quantity: 10 },
      });

      const summary = await server.handleToolCall('portfolio_summary', {}) as any;
      expect(summary.assets[0].name).toBe('Premium Gold Reserve');
    });

    it('should include asset class in summary', async () => {
      await server.handleToolCall('valuate_asset', {
        id: 'class-test',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Property',
        location: 'miami',
        metadata: { squareFeet: 1000 },
      });

      const summary = await server.handleToolCall('portfolio_summary', {}) as any;
      expect(summary.assets[0].assetClass).toBe(AssetClass.REAL_ESTATE);
    });

    it('should include value and confidence', async () => {
      await server.handleToolCall('valuate_asset', {
        id: 'vc-test',
        assetClass: AssetClass.COMMODITY,
        name: 'Gold',
        metadata: { commodity: 'gold', quantity: 10 },
      });

      const summary = await server.handleToolCall('portfolio_summary', {}) as any;
      const asset = summary.assets[0];
      expect(asset.value).toBeGreaterThan(0);
      expect(asset.confidence).toBeGreaterThan(0);
      expect(asset.confidence).toBeLessThanOrEqual(1);
    });

    it('should include lastUpdated as ISO string', async () => {
      await server.handleToolCall('valuate_asset', {
        id: 'ts-test',
        assetClass: AssetClass.COMMODITY,
        name: 'Gold',
        metadata: { commodity: 'gold', quantity: 1 },
      });

      const summary = await server.handleToolCall('portfolio_summary', {}) as any;
      const lastUpdated = summary.assets[0].lastUpdated;
      expect(lastUpdated).toBeDefined();
      // Should be a valid ISO date string
      expect(new Date(lastUpdated).toISOString()).toBe(lastUpdated);
    });
  });

  describe('get_price edge cases', () => {
    it('should return error object for empty string assetId', async () => {
      const result = await server.handleToolCall('get_price', { assetId: '' }) as any;
      expect(result.error).toBeDefined();
    });

    it('should return full consensus result when asset exists', async () => {
      await server.handleToolCall('valuate_asset', {
        id: 'full-price',
        assetClass: AssetClass.COMMODITY,
        name: 'Gold',
        metadata: { commodity: 'gold', quantity: 10 },
      });

      const result = await server.handleToolCall('get_price', { assetId: 'full-price' }) as any;
      expect(result).toHaveProperty('assetId');
      expect(result).toHaveProperty('consensusValue');
      expect(result).toHaveProperty('avgConfidence');
      expect(result).toHaveProperty('valuations');
      expect(result).toHaveProperty('methodology');
      expect(result).toHaveProperty('timestamp');
    });

    it('should return same consensus value as original valuation', async () => {
      const valuation = await server.handleToolCall('valuate_asset', {
        id: 'match-test',
        assetClass: AssetClass.COMMODITY,
        name: 'Gold',
        metadata: { commodity: 'gold', quantity: 50 },
      }) as any;

      const price = await server.handleToolCall('get_price', { assetId: 'match-test' }) as any;
      expect(price.consensusValue).toBe(valuation.consensusValue);
    });
  });

  describe('submit_onchain edge cases', () => {
    it('should return error when no chain bridge configured', async () => {
      await server.handleToolCall('valuate_asset', {
        id: 'submit-test',
        assetClass: AssetClass.COMMODITY,
        name: 'Gold',
        metadata: { commodity: 'gold', quantity: 1 },
      });

      const result = await server.handleToolCall('submit_onchain', { assetId: 'submit-test' }) as any;
      expect(result.error).toContain('No chain bridge');
    });

    it('should return error for non-existent asset with bridge configured', async () => {
      const bridge = new ChainBridge({
        rpcUrl: 'http://localhost:8545',
        oracleAddress: '0x' + '1'.repeat(40),
      });
      const serverWithBridge = new RWAMCPServer({ consensusEngine: engine, chainBridge: bridge });

      const result = await serverWithBridge.handleToolCall('submit_onchain', { assetId: 'missing' }) as any;
      expect(result.error).toContain('No valuation found');
      expect(result.error).toContain('missing');
    });

    it('should mention running valuate_asset first in error', async () => {
      const bridge = new ChainBridge({
        rpcUrl: 'http://localhost:8545',
        oracleAddress: '0x' + '1'.repeat(40),
      });
      const serverWithBridge = new RWAMCPServer({ consensusEngine: engine, chainBridge: bridge });

      const result = await serverWithBridge.handleToolCall('submit_onchain', { assetId: 'not-found' }) as any;
      expect(result.error).toContain('valuate_asset');
    });
  });

  describe('list_agents details', () => {
    it('should include all agent properties', async () => {
      const agents = await server.handleToolCall('list_agents', {}) as any[];

      for (const agent of agents) {
        expect(agent).toHaveProperty('id');
        expect(agent).toHaveProperty('name');
        expect(agent).toHaveProperty('assetClasses');
        expect(agent).toHaveProperty('description');
      }
    });

    it('should list property agent with correct details', async () => {
      const agents = await server.handleToolCall('list_agents', {}) as any[];
      const prop = agents.find(a => a.id === 'property-agent');

      expect(prop).toBeDefined();
      expect(prop.name).toBe('Real Estate Valuation Agent');
      expect(prop.assetClasses).toContain(AssetClass.REAL_ESTATE);
    });

    it('should list commodity agent with correct details', async () => {
      const agents = await server.handleToolCall('list_agents', {}) as any[];
      const comm = agents.find(a => a.id === 'commodity-agent');

      expect(comm).toBeDefined();
      expect(comm.name).toBe('Commodity Valuation Agent');
      expect(comm.assetClasses).toContain(AssetClass.COMMODITY);
    });

    it('should list treasury agent with correct details', async () => {
      const agents = await server.handleToolCall('list_agents', {}) as any[];
      const trs = agents.find(a => a.id === 'treasury-agent');

      expect(trs).toBeDefined();
      expect(trs.name).toBe('Treasury & Fixed Income Valuation Agent');
      expect(trs.assetClasses).toContain(AssetClass.TREASURY);
    });
  });

  describe('tool definitions schema', () => {
    it('should have valuate_asset with assetClass enum values', () => {
      const tools = server.getToolDefinitions();
      const valuateTool = tools.find(t => t.name === 'valuate_asset');

      expect(valuateTool!.inputSchema.properties).toHaveProperty('assetClass');
      const assetClassSchema = valuateTool!.inputSchema.properties!.assetClass as any;
      expect(assetClassSchema.enum).toBeDefined();
      expect(assetClassSchema.enum).toContain('real_estate');
      expect(assetClassSchema.enum).toContain('commodity');
      expect(assetClassSchema.enum).toContain('treasury');
    });

    it('should have valuate_asset with metadata as object type', () => {
      const tools = server.getToolDefinitions();
      const valuateTool = tools.find(t => t.name === 'valuate_asset');

      const metadataSchema = valuateTool!.inputSchema.properties!.metadata as any;
      expect(metadataSchema.type).toBe('object');
    });

    it('should have submit_onchain with required assetId', () => {
      const tools = server.getToolDefinitions();
      const submitTool = tools.find(t => t.name === 'submit_onchain');

      expect(submitTool!.inputSchema.required).toContain('assetId');
    });

    it('should have list_agents with no required fields', () => {
      const tools = server.getToolDefinitions();
      const listTool = tools.find(t => t.name === 'list_agents');

      expect(listTool!.inputSchema.required).toBeUndefined();
    });

    it('should have portfolio_summary with no required fields', () => {
      const tools = server.getToolDefinitions();
      const summaryTool = tools.find(t => t.name === 'portfolio_summary');

      expect(summaryTool!.inputSchema.required).toBeUndefined();
    });

    it('each tool should have a non-empty description', () => {
      const tools = server.getToolDefinitions();
      for (const tool of tools) {
        expect(tool.description.length).toBeGreaterThan(10);
      }
    });
  });

  describe('valuate_asset with minimal args', () => {
    it('should work with minimal required args for real estate', async () => {
      const result = await server.handleToolCall('valuate_asset', {
        id: 'min-re',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Minimal Property',
      }) as any;

      expect(result.consensusValue).toBeGreaterThan(0);
    });

    it('should default description to empty string', async () => {
      const result = await server.handleToolCall('valuate_asset', {
        id: 'def-desc',
        assetClass: AssetClass.COMMODITY,
        name: 'Gold',
        metadata: { commodity: 'gold', quantity: 1 },
      }) as any;

      expect(result.consensusValue).toBeGreaterThan(0);
    });

    it('should default metadata to empty object', async () => {
      const result = await server.handleToolCall('valuate_asset', {
        id: 'def-meta',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'No Metadata',
      }) as any;

      expect(result.consensusValue).toBeGreaterThan(0);
    });
  });

  describe('error handling', () => {
    it('should throw for unknown tool name', async () => {
      await expect(server.handleToolCall('nonexistent', {})).rejects.toThrow('Unknown tool');
    });

    it('should throw for unsupported asset class', async () => {
      await expect(
        server.handleToolCall('valuate_asset', {
          id: 'err',
          assetClass: AssetClass.EQUITY,
          name: 'Stock',
        })
      ).rejects.toThrow('No agents registered');
    });

    it('should throw for RECEIVABLE asset class', async () => {
      await expect(
        server.handleToolCall('valuate_asset', {
          id: 'err-rec',
          assetClass: AssetClass.RECEIVABLE,
          name: 'Invoice',
        })
      ).rejects.toThrow('No agents registered');
    });
  });

  describe('server with no agents', () => {
    it('should return empty list from list_agents', async () => {
      const emptyEngine = new ConsensusEngine();
      const emptyServer = new RWAMCPServer({ consensusEngine: emptyEngine });

      const agents = await emptyServer.handleToolCall('list_agents', {}) as any[];
      expect(agents).toHaveLength(0);
    });

    it('should return empty portfolio from portfolio_summary', async () => {
      const emptyEngine = new ConsensusEngine();
      const emptyServer = new RWAMCPServer({ consensusEngine: emptyEngine });

      const summary = await emptyServer.handleToolCall('portfolio_summary', {}) as any;
      expect(summary.assetCount).toBe(0);
      expect(summary.totalValue).toBe(0);
    });

    it('should throw when valuating with no agents', async () => {
      const emptyEngine = new ConsensusEngine();
      const emptyServer = new RWAMCPServer({ consensusEngine: emptyEngine });

      await expect(
        emptyServer.handleToolCall('valuate_asset', {
          id: 'err',
          assetClass: AssetClass.COMMODITY,
          name: 'Gold',
        })
      ).rejects.toThrow();
    });
  });
});
