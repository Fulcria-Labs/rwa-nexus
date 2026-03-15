import { RWAMCPServer } from '../../src/mcp/server';
import { ConsensusEngine } from '../../src/oracle/consensus';
import { PropertyAgent } from '../../src/agents/property-agent';
import { CommodityAgent } from '../../src/agents/commodity-agent';
import { TreasuryAgent } from '../../src/agents/treasury-agent';
import { AssetClass, ConsensusResult } from '../../src/types';

/**
 * End-to-end portfolio lifecycle tests.
 * Covers: multi-asset portfolio building, re-valuation, portfolio summary accuracy,
 * asset class diversity, and MCP tool interaction sequences.
 */

describe('Portfolio Lifecycle', () => {
  let server: RWAMCPServer;
  let engine: ConsensusEngine;

  beforeEach(() => {
    engine = new ConsensusEngine();
    engine.registerAgent(new PropertyAgent());
    engine.registerAgent(new CommodityAgent());
    engine.registerAgent(new TreasuryAgent());
    server = new RWAMCPServer({ consensusEngine: engine });
  });

  describe('empty portfolio state', () => {
    it('should start with zero assets', async () => {
      const summary = await server.handleToolCall('portfolio_summary', {}) as any;
      expect(summary.assetCount).toBe(0);
      expect(summary.totalValue).toBe(0);
      expect(summary.assets).toHaveLength(0);
    });

    it('should return empty agent list initially', async () => {
      const agents = await server.handleToolCall('list_agents', {}) as any[];
      expect(agents).toHaveLength(3);
      expect(agents.map((a: any) => a.id).sort()).toEqual([
        'commodity-agent', 'property-agent', 'treasury-agent',
      ]);
    });

    it('should return error when getting price of non-existent asset', async () => {
      const result = await server.handleToolCall('get_price', { assetId: 'no-such-asset' }) as any;
      expect(result.error).toBeDefined();
      expect(result.error).toContain('no-such-asset');
    });
  });

  describe('single asset operations', () => {
    it('should add a property and retrieve its price', async () => {
      const valuation = await server.handleToolCall('valuate_asset', {
        id: 'prop-lifecycle-1',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Manhattan Apartment',
        location: 'manhattan',
        metadata: { squareFeet: 1500, condition: 'good' },
      }) as ConsensusResult;

      expect(valuation.consensusValue).toBeGreaterThan(0);
      expect(valuation.avgConfidence).toBeGreaterThan(0);

      const price = await server.handleToolCall('get_price', { assetId: 'prop-lifecycle-1' }) as ConsensusResult;
      expect(price.consensusValue).toBe(valuation.consensusValue);
    });

    it('should add a commodity and retrieve its price', async () => {
      const valuation = await server.handleToolCall('valuate_asset', {
        id: 'gold-lifecycle-1',
        assetClass: AssetClass.COMMODITY,
        name: 'Gold Bars',
        metadata: { commodity: 'gold', quantity: 10, grade: 'premium' },
      }) as ConsensusResult;

      expect(valuation.consensusValue).toBeGreaterThan(20000);

      const price = await server.handleToolCall('get_price', { assetId: 'gold-lifecycle-1' }) as ConsensusResult;
      expect(price.consensusValue).toBe(valuation.consensusValue);
    });

    it('should add a treasury bond and retrieve its price', async () => {
      const valuation = await server.handleToolCall('valuate_asset', {
        id: 'bond-lifecycle-1',
        assetClass: AssetClass.TREASURY,
        name: 'US Treasury 5Y',
        metadata: { maturityYears: 5, couponRate: 0.04, faceValue: 10000 },
      }) as ConsensusResult;

      expect(valuation.consensusValue).toBeGreaterThan(0);

      const price = await server.handleToolCall('get_price', { assetId: 'bond-lifecycle-1' }) as ConsensusResult;
      expect(price.consensusValue).toBe(valuation.consensusValue);
    });
  });

  describe('multi-asset portfolio building', () => {
    it('should build a diversified portfolio of 5 assets', async () => {
      const assets = [
        { id: 'div-prop', assetClass: AssetClass.REAL_ESTATE, name: 'SF Condo', location: 'san_francisco', metadata: { squareFeet: 1200 } },
        { id: 'div-gold', assetClass: AssetClass.COMMODITY, name: 'Gold', metadata: { commodity: 'gold', quantity: 5 } },
        { id: 'div-oil', assetClass: AssetClass.COMMODITY, name: 'Oil', metadata: { commodity: 'crude_oil', quantity: 100 } },
        { id: 'div-bond1', assetClass: AssetClass.TREASURY, name: 'Treasury 10Y', metadata: { maturityYears: 10, couponRate: 0.04, faceValue: 5000 } },
        { id: 'div-bond2', assetClass: AssetClass.TREASURY, name: 'Corp AAA 5Y', metadata: { maturityYears: 5, couponRate: 0.05, faceValue: 10000, bondType: 'corporate_aaa' } },
      ];

      for (const asset of assets) {
        await server.handleToolCall('valuate_asset', asset);
      }

      const summary = await server.handleToolCall('portfolio_summary', {}) as any;
      expect(summary.assetCount).toBe(5);
      expect(summary.totalValue).toBeGreaterThan(0);
      expect(summary.assets).toHaveLength(5);
    });

    it('should track individual asset values correctly in summary', async () => {
      const vals: number[] = [];

      const v1 = await server.handleToolCall('valuate_asset', {
        id: 'track-1',
        assetClass: AssetClass.COMMODITY,
        name: 'Silver',
        metadata: { commodity: 'silver', quantity: 100 },
      }) as ConsensusResult;
      vals.push(v1.consensusValue);

      const v2 = await server.handleToolCall('valuate_asset', {
        id: 'track-2',
        assetClass: AssetClass.COMMODITY,
        name: 'Copper',
        metadata: { commodity: 'copper', quantity: 1000 },
      }) as ConsensusResult;
      vals.push(v2.consensusValue);

      const summary = await server.handleToolCall('portfolio_summary', {}) as any;
      expect(summary.assetCount).toBe(2);
      expect(summary.totalValue).toBeCloseTo(vals[0] + vals[1], 0);
    });

    it('should handle 10 assets in portfolio', async () => {
      const commodities = ['gold', 'silver', 'platinum', 'copper', 'wheat', 'corn', 'soybeans', 'coffee', 'cotton', 'lumber'];

      for (let i = 0; i < 10; i++) {
        await server.handleToolCall('valuate_asset', {
          id: `bulk-${i}`,
          assetClass: AssetClass.COMMODITY,
          name: `Commodity ${i}`,
          metadata: { commodity: commodities[i], quantity: (i + 1) * 10 },
        });
      }

      const summary = await server.handleToolCall('portfolio_summary', {}) as any;
      expect(summary.assetCount).toBe(10);
      expect(summary.totalValue).toBeGreaterThan(0);
      expect(summary.assets).toHaveLength(10);

      // Each asset should have a valid value
      for (const asset of summary.assets) {
        expect(asset.value).toBeGreaterThan(0);
        expect(asset.confidence).toBeGreaterThan(0);
        expect(asset.name).toBeDefined();
      }
    });
  });

  describe('asset re-valuation', () => {
    it('should update existing asset when re-valuated', async () => {
      await server.handleToolCall('valuate_asset', {
        id: 'reval-1',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Miami Property',
        location: 'miami',
        metadata: { squareFeet: 2000 },
      });

      const summary1 = await server.handleToolCall('portfolio_summary', {}) as any;
      expect(summary1.assetCount).toBe(1);

      // Re-valuate the same asset
      await server.handleToolCall('valuate_asset', {
        id: 'reval-1',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Miami Property Updated',
        location: 'miami',
        metadata: { squareFeet: 2500, condition: 'excellent' },
      });

      const summary2 = await server.handleToolCall('portfolio_summary', {}) as any;
      // Should still be 1 asset, not 2 (it was updated, not duplicated)
      expect(summary2.assetCount).toBe(1);
    });

    it('should update price when asset is re-valuated with different metadata', async () => {
      await server.handleToolCall('valuate_asset', {
        id: 'reval-price',
        assetClass: AssetClass.COMMODITY,
        name: 'Gold',
        metadata: { commodity: 'gold', quantity: 1 },
      });

      const price1 = await server.handleToolCall('get_price', { assetId: 'reval-price' }) as ConsensusResult;

      // Re-valuate with 10x quantity
      await server.handleToolCall('valuate_asset', {
        id: 'reval-price',
        assetClass: AssetClass.COMMODITY,
        name: 'Gold',
        metadata: { commodity: 'gold', quantity: 10 },
      });

      const price2 = await server.handleToolCall('get_price', { assetId: 'reval-price' }) as ConsensusResult;

      // Price should be roughly 10x higher
      expect(price2.consensusValue).toBeGreaterThan(price1.consensusValue * 5);
    });
  });

  describe('portfolio summary calculations', () => {
    it('should correctly sum total portfolio value', async () => {
      const valuations: ConsensusResult[] = [];

      for (let i = 0; i < 3; i++) {
        const v = await server.handleToolCall('valuate_asset', {
          id: `sum-${i}`,
          assetClass: AssetClass.COMMODITY,
          name: `Gold ${i}`,
          metadata: { commodity: 'gold', quantity: (i + 1) * 5 },
        }) as ConsensusResult;
        valuations.push(v);
      }

      const summary = await server.handleToolCall('portfolio_summary', {}) as any;
      const expectedTotal = valuations.reduce((s, v) => s + v.consensusValue, 0);
      expect(summary.totalValue).toBeCloseTo(expectedTotal, 0);
    });

    it('should include asset class in summary entries', async () => {
      await server.handleToolCall('valuate_asset', {
        id: 'class-check',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Test Property',
        location: 'austin',
        metadata: { squareFeet: 1000 },
      });

      const summary = await server.handleToolCall('portfolio_summary', {}) as any;
      expect(summary.assets[0].assetClass).toBe(AssetClass.REAL_ESTATE);
    });

    it('should include name and ID in summary entries', async () => {
      await server.handleToolCall('valuate_asset', {
        id: 'name-check-42',
        assetClass: AssetClass.TREASURY,
        name: 'My Treasury Bond',
        metadata: { maturityYears: 10, faceValue: 1000 },
      });

      const summary = await server.handleToolCall('portfolio_summary', {}) as any;
      expect(summary.assets[0].id).toBe('name-check-42');
      expect(summary.assets[0].name).toBe('My Treasury Bond');
    });

    it('should include lastUpdated timestamp', async () => {
      await server.handleToolCall('valuate_asset', {
        id: 'ts-check',
        assetClass: AssetClass.COMMODITY,
        name: 'Wheat',
        metadata: { commodity: 'wheat', quantity: 500 },
      });

      const summary = await server.handleToolCall('portfolio_summary', {}) as any;
      expect(summary.assets[0].lastUpdated).toBeDefined();
      expect(typeof summary.assets[0].lastUpdated).toBe('string');
    });
  });

  describe('cross-asset-class portfolio', () => {
    it('should handle all three asset classes in one portfolio', async () => {
      await server.handleToolCall('valuate_asset', {
        id: 'cross-re',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'London Office',
        location: 'london',
        metadata: { squareFeet: 5000, condition: 'excellent', annualRent: 200000, propertyType: 'commercial' },
      });

      await server.handleToolCall('valuate_asset', {
        id: 'cross-com',
        assetClass: AssetClass.COMMODITY,
        name: 'Platinum Reserve',
        metadata: { commodity: 'platinum', quantity: 100, grade: 'premium' },
      });

      await server.handleToolCall('valuate_asset', {
        id: 'cross-bond',
        assetClass: AssetClass.TREASURY,
        name: 'Municipal Bond',
        metadata: { bondType: 'municipal', maturityYears: 20, couponRate: 0.035, faceValue: 50000, creditRating: 'AA' },
      });

      const summary = await server.handleToolCall('portfolio_summary', {}) as any;
      expect(summary.assetCount).toBe(3);
      expect(summary.totalValue).toBeGreaterThan(0);

      const classes = summary.assets.map((a: any) => a.assetClass);
      expect(classes).toContain(AssetClass.REAL_ESTATE);
      expect(classes).toContain(AssetClass.COMMODITY);
      expect(classes).toContain(AssetClass.TREASURY);
    });
  });

  describe('tool interaction sequences', () => {
    it('should support: list_agents → valuate → get_price → summary', async () => {
      const agents = await server.handleToolCall('list_agents', {}) as any[];
      expect(agents.length).toBeGreaterThan(0);

      await server.handleToolCall('valuate_asset', {
        id: 'seq-1',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Sequence Test',
        location: 'chicago',
        metadata: { squareFeet: 3000 },
      });

      const price = await server.handleToolCall('get_price', { assetId: 'seq-1' }) as any;
      expect(price.consensusValue).toBeGreaterThan(0);

      const summary = await server.handleToolCall('portfolio_summary', {}) as any;
      expect(summary.assetCount).toBe(1);
      expect(summary.totalValue).toBe(price.consensusValue);
    });

    it('should handle submit_onchain error gracefully in sequence', async () => {
      await server.handleToolCall('valuate_asset', {
        id: 'submit-seq',
        assetClass: AssetClass.COMMODITY,
        name: 'Gold',
        metadata: { commodity: 'gold', quantity: 5 },
      });

      // submit_onchain should fail gracefully without chain bridge
      const result = await server.handleToolCall('submit_onchain', { assetId: 'submit-seq' }) as any;
      expect(result.error).toContain('No chain bridge');

      // Portfolio should still work fine after failed submit
      const summary = await server.handleToolCall('portfolio_summary', {}) as any;
      expect(summary.assetCount).toBe(1);
    });

    it('should handle unknown tool name gracefully', async () => {
      await expect(server.handleToolCall('nonexistent_tool', {})).rejects.toThrow('Unknown tool');
    });

    it('should handle sequential valuations of different asset classes', async () => {
      const sequence = [
        { id: 'seq-a', assetClass: AssetClass.COMMODITY, name: 'Oil', metadata: { commodity: 'crude_oil', quantity: 50 } },
        { id: 'seq-b', assetClass: AssetClass.REAL_ESTATE, name: 'Property', location: 'seattle', metadata: { squareFeet: 2000 } },
        { id: 'seq-c', assetClass: AssetClass.TREASURY, name: 'Bond', metadata: { maturityYears: 7, faceValue: 25000 } },
        { id: 'seq-d', assetClass: AssetClass.COMMODITY, name: 'Silver', metadata: { commodity: 'silver', quantity: 200 } },
      ];

      for (const asset of sequence) {
        const result = await server.handleToolCall('valuate_asset', asset) as ConsensusResult;
        expect(result.consensusValue).toBeGreaterThan(0);
      }

      const summary = await server.handleToolCall('portfolio_summary', {}) as any;
      expect(summary.assetCount).toBe(4);
    });
  });

  describe('agent listing details', () => {
    it('should include description for each agent', async () => {
      const agents = await server.handleToolCall('list_agents', {}) as any[];
      for (const agent of agents) {
        expect(agent.description).toBeDefined();
        expect(agent.description.length).toBeGreaterThan(10);
      }
    });

    it('should include asset classes for each agent', async () => {
      const agents = await server.handleToolCall('list_agents', {}) as any[];
      const propAgent = agents.find((a: any) => a.id === 'property-agent');
      const comAgent = agents.find((a: any) => a.id === 'commodity-agent');
      const trsAgent = agents.find((a: any) => a.id === 'treasury-agent');

      expect(propAgent.assetClasses).toContain(AssetClass.REAL_ESTATE);
      expect(comAgent.assetClasses).toContain(AssetClass.COMMODITY);
      expect(trsAgent.assetClasses).toContain(AssetClass.TREASURY);
    });

    it('should include name for each agent', async () => {
      const agents = await server.handleToolCall('list_agents', {}) as any[];
      for (const agent of agents) {
        expect(agent.name).toBeDefined();
        expect(agent.name.length).toBeGreaterThan(0);
      }
    });
  });

  describe('valuation result structure', () => {
    it('should return full ConsensusResult from valuate_asset', async () => {
      const result = await server.handleToolCall('valuate_asset', {
        id: 'struct-test',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Structure Test',
        location: 'manhattan',
        metadata: { squareFeet: 1000 },
      }) as ConsensusResult;

      expect(result.assetId).toBe('struct-test');
      expect(result.consensusValue).toBeGreaterThan(0);
      expect(result.avgConfidence).toBeGreaterThan(0);
      expect(result.avgConfidence).toBeLessThanOrEqual(1);
      expect(result.valuations).toBeDefined();
      expect(Array.isArray(result.valuations)).toBe(true);
      expect(result.methodology).toBeDefined();
      expect(result.timestamp).toBeDefined();
    });

    it('should include individual agent valuations in result', async () => {
      const result = await server.handleToolCall('valuate_asset', {
        id: 'agents-test',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Agent Test',
        location: 'brooklyn',
        metadata: { squareFeet: 800 },
      }) as ConsensusResult;

      // Should have at least one valuation from property-agent
      expect(result.valuations.length).toBeGreaterThanOrEqual(1);
      const propertyVal = result.valuations.find(v => v.agentId === 'property-agent');
      expect(propertyVal).toBeDefined();
      expect(propertyVal!.value).toBeGreaterThan(0);
    });
  });

  describe('edge case: unsupported asset class', () => {
    it('should throw for EQUITY asset class (no agent registered)', async () => {
      await expect(server.handleToolCall('valuate_asset', {
        id: 'equity-fail',
        assetClass: AssetClass.EQUITY,
        name: 'Stock ABC',
        metadata: {},
      })).rejects.toThrow();
    });

    it('should throw for RECEIVABLE asset class (no agent registered)', async () => {
      await expect(server.handleToolCall('valuate_asset', {
        id: 'recv-fail',
        assetClass: AssetClass.RECEIVABLE,
        name: 'Invoice 123',
        metadata: {},
      })).rejects.toThrow();
    });
  });

  describe('tool definitions structure', () => {
    it('should have 6 tool definitions', () => {
      const tools = server.getToolDefinitions();
      expect(tools).toHaveLength(6);
    });

    it('should have required fields in valuate_asset schema', () => {
      const tools = server.getToolDefinitions();
      const valuate = tools.find(t => t.name === 'valuate_asset');
      expect(valuate).toBeDefined();
      expect(valuate!.inputSchema.required).toContain('id');
      expect(valuate!.inputSchema.required).toContain('assetClass');
      expect(valuate!.inputSchema.required).toContain('name');
    });

    it('should have required field in get_price schema', () => {
      const tools = server.getToolDefinitions();
      const getPrice = tools.find(t => t.name === 'get_price');
      expect(getPrice).toBeDefined();
      expect(getPrice!.inputSchema.required).toContain('assetId');
    });

    it('should have required field in submit_onchain schema', () => {
      const tools = server.getToolDefinitions();
      const submit = tools.find(t => t.name === 'submit_onchain');
      expect(submit).toBeDefined();
      expect(submit!.inputSchema.required).toContain('assetId');
    });

    it('should have descriptions for all tools', () => {
      const tools = server.getToolDefinitions();
      for (const tool of tools) {
        expect(tool.description).toBeDefined();
        expect(tool.description.length).toBeGreaterThan(10);
      }
    });

    it('should have valid enum for assetClass in valuate_asset', () => {
      const tools = server.getToolDefinitions();
      const valuate = tools.find(t => t.name === 'valuate_asset');
      const assetClassProp = valuate!.inputSchema.properties.assetClass as any;
      expect(assetClassProp).toBeDefined();
      expect(assetClassProp.enum).toBeDefined();
      expect(assetClassProp.enum).toContain(AssetClass.REAL_ESTATE);
      expect(assetClassProp.enum).toContain(AssetClass.COMMODITY);
      expect(assetClassProp.enum).toContain(AssetClass.TREASURY);
    });
  });
});
