import { RWAMCPServer } from '../../src/mcp/server';
import { ConsensusEngine } from '../../src/oracle/consensus';
import { ChainBridge } from '../../src/oracle/chain-bridge';
import { PropertyAgent } from '../../src/agents/property-agent';
import { CommodityAgent } from '../../src/agents/commodity-agent';
import { TreasuryAgent } from '../../src/agents/treasury-agent';
import { AssetClass, ConsensusResult } from '../../src/types';

function makeEngine(): ConsensusEngine {
  const engine = new ConsensusEngine();
  engine.registerAgent(new PropertyAgent());
  engine.registerAgent(new CommodityAgent());
  engine.registerAgent(new TreasuryAgent());
  return engine;
}

function makeConsensus(overrides: Partial<ConsensusResult> = {}): ConsensusResult {
  return {
    assetId: 'test-asset',
    consensusValue: 100000,
    avgConfidence: 0.85,
    valuations: [],
    methodology: 'test',
    timestamp: new Date(),
    ...overrides,
  };
}

describe('RWAMCPServer — edge cases', () => {
  describe('tool definitions completeness', () => {
    it('should have unique tool names', () => {
      const server = new RWAMCPServer({ consensusEngine: makeEngine() });
      const tools = server.getToolDefinitions();
      const names = tools.map(t => t.name);
      const unique = new Set(names);
      expect(unique.size).toBe(names.length);
    });

    it('all tool input schemas should be of type object', () => {
      const server = new RWAMCPServer({ consensusEngine: makeEngine() });
      const tools = server.getToolDefinitions();
      for (const tool of tools) {
        expect(tool.inputSchema.type).toBe('object');
      }
    });

    it('valuate_asset schema should define id, assetClass, name, description, location, metadata properties', () => {
      const server = new RWAMCPServer({ consensusEngine: makeEngine() });
      const tools = server.getToolDefinitions();
      const valuateTool = tools.find(t => t.name === 'valuate_asset')!;
      const props = Object.keys(valuateTool.inputSchema.properties);
      expect(props).toContain('id');
      expect(props).toContain('assetClass');
      expect(props).toContain('name');
      expect(props).toContain('description');
      expect(props).toContain('location');
      expect(props).toContain('metadata');
    });

    it('get_price schema should define assetId property', () => {
      const server = new RWAMCPServer({ consensusEngine: makeEngine() });
      const tools = server.getToolDefinitions();
      const getPriceTool = tools.find(t => t.name === 'get_price')!;
      expect(getPriceTool.inputSchema.properties).toHaveProperty('assetId');
    });

    it('submit_onchain schema should define assetId property', () => {
      const server = new RWAMCPServer({ consensusEngine: makeEngine() });
      const tools = server.getToolDefinitions();
      const submitTool = tools.find(t => t.name === 'submit_onchain')!;
      expect(submitTool.inputSchema.properties).toHaveProperty('assetId');
    });
  });

  describe('valuate_asset — input variations', () => {
    it('should use empty string description when description not provided', async () => {
      const server = new RWAMCPServer({ consensusEngine: makeEngine() });
      // Does not throw — description defaults to empty string
      const result: any = await server.handleToolCall('valuate_asset', {
        id: 'no-desc',
        assetClass: AssetClass.COMMODITY,
        name: 'Gold',
        metadata: { commodity: 'gold', quantity: 1 },
      });
      expect(result.assetId).toBe('no-desc');
    });

    it('should pass through location to the underlying asset', async () => {
      const server = new RWAMCPServer({ consensusEngine: makeEngine() });
      const result: any = await server.handleToolCall('valuate_asset', {
        id: 'loc-prop',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Manhattan Apt',
        location: 'manhattan',
        metadata: { squareFeet: 1000 },
      });
      // Manhattan pricing should produce a high value
      expect(result.consensusValue).toBeGreaterThan(1000000);
    });

    it('should default metadata to empty object when not provided', async () => {
      const server = new RWAMCPServer({ consensusEngine: makeEngine() });
      // Without metadata, agent uses defaults
      const result: any = await server.handleToolCall('valuate_asset', {
        id: 'no-meta',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Bare Property',
      });
      expect(result.consensusValue).toBeGreaterThan(0);
    });

    it('should overwrite existing asset when same id is valuated again', async () => {
      const server = new RWAMCPServer({ consensusEngine: makeEngine() });

      await server.handleToolCall('valuate_asset', {
        id: 'reuse-id',
        assetClass: AssetClass.COMMODITY,
        name: 'Small Gold',
        metadata: { commodity: 'gold', quantity: 1 },
      });

      const firstPrice: any = await server.handleToolCall('get_price', { assetId: 'reuse-id' });

      await server.handleToolCall('valuate_asset', {
        id: 'reuse-id',
        assetClass: AssetClass.COMMODITY,
        name: 'Big Gold',
        metadata: { commodity: 'gold', quantity: 1000 },
      });

      const secondPrice: any = await server.handleToolCall('get_price', { assetId: 'reuse-id' });

      // 1000x quantity should yield much higher value
      expect(secondPrice.consensusValue).toBeGreaterThan(firstPrice.consensusValue * 10);
    });

    it('should reject unsupported asset class with an error', async () => {
      const server = new RWAMCPServer({ consensusEngine: makeEngine() });
      await expect(
        server.handleToolCall('valuate_asset', {
          id: 'equity-test',
          assetClass: AssetClass.EQUITY,
          name: 'Stock',
          metadata: {},
        }),
      ).rejects.toThrow();
    });
  });

  describe('get_price — detailed error messages', () => {
    it('should include the asset id in the error message', async () => {
      const server = new RWAMCPServer({ consensusEngine: makeEngine() });
      const result: any = await server.handleToolCall('get_price', { assetId: 'missing-xyz' });
      expect(result.error).toContain('missing-xyz');
    });

    it('should return the full consensus result including methodology', async () => {
      const server = new RWAMCPServer({ consensusEngine: makeEngine() });
      await server.handleToolCall('valuate_asset', {
        id: 'full-result',
        assetClass: AssetClass.COMMODITY,
        name: 'Gold',
        metadata: { commodity: 'gold', quantity: 10 },
      });

      const result: any = await server.handleToolCall('get_price', { assetId: 'full-result' });
      expect(result.methodology).toBeTruthy();
      expect(result.valuations).toBeDefined();
      expect(result.timestamp).toBeDefined();
    });

    it('should return the same value as the valuate call', async () => {
      const server = new RWAMCPServer({ consensusEngine: makeEngine() });
      const valuateResult: any = await server.handleToolCall('valuate_asset', {
        id: 'consistency-test',
        assetClass: AssetClass.TREASURY,
        name: 'Bond',
        metadata: { maturityYears: 5, couponRate: 0.04, faceValue: 1000 },
      });

      const priceResult: any = await server.handleToolCall('get_price', { assetId: 'consistency-test' });
      expect(priceResult.consensusValue).toBe(valuateResult.consensusValue);
    });
  });

  describe('submit_onchain — without bridge', () => {
    it('should return error object (not throw) when bridge missing', async () => {
      const server = new RWAMCPServer({ consensusEngine: makeEngine() });
      await server.handleToolCall('valuate_asset', {
        id: 'no-bridge-test',
        assetClass: AssetClass.COMMODITY,
        name: 'Gold',
        metadata: { commodity: 'gold', quantity: 1 },
      });

      const result: any = await server.handleToolCall('submit_onchain', { assetId: 'no-bridge-test' });
      expect(result).toHaveProperty('error');
      expect(typeof result.error).toBe('string');
    });

    it('should mention chain bridge in the error when asset exists', async () => {
      const server = new RWAMCPServer({ consensusEngine: makeEngine() });
      await server.handleToolCall('valuate_asset', {
        id: 'chain-err-test',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Property',
        metadata: { squareFeet: 1000 },
      });

      const result: any = await server.handleToolCall('submit_onchain', { assetId: 'chain-err-test' });
      expect(result.error).toContain('chain bridge');
    });

    it('should return error for non-existent asset without bridge', async () => {
      const server = new RWAMCPServer({ consensusEngine: makeEngine() });
      const result: any = await server.handleToolCall('submit_onchain', { assetId: 'ghost-asset' });
      expect(result.error).toBeDefined();
    });
  });

  describe('list_agents — output shape', () => {
    it('should return array with id, name, assetClasses, description for each agent', async () => {
      const server = new RWAMCPServer({ consensusEngine: makeEngine() });
      const result: any[] = await server.handleToolCall('list_agents', {}) as any[];

      for (const agent of result) {
        expect(agent).toHaveProperty('id');
        expect(agent).toHaveProperty('name');
        expect(agent).toHaveProperty('assetClasses');
        expect(agent).toHaveProperty('description');
        expect(typeof agent.id).toBe('string');
        expect(Array.isArray(agent.assetClasses)).toBe(true);
      }
    });

    it('should return empty array when no agents registered', async () => {
      const emptyEngine = new ConsensusEngine();
      const server = new RWAMCPServer({ consensusEngine: emptyEngine });
      const result: any[] = await server.handleToolCall('list_agents', {}) as any[];
      expect(result).toHaveLength(0);
    });

    it('should reflect agents in the order they were registered', async () => {
      const engine = new ConsensusEngine();
      engine.registerAgent(new PropertyAgent());
      engine.registerAgent(new CommodityAgent());
      const server = new RWAMCPServer({ consensusEngine: engine });

      const result: any[] = await server.handleToolCall('list_agents', {}) as any[];
      expect(result[0].id).toBe('property-agent');
      expect(result[1].id).toBe('commodity-agent');
    });

    it('should not expose internal agent implementation details', async () => {
      const server = new RWAMCPServer({ consensusEngine: makeEngine() });
      const result: any[] = await server.handleToolCall('list_agents', {}) as any[];

      for (const agent of result) {
        // These internal properties should not be exposed
        expect(agent).not.toHaveProperty('config');
        expect(agent).not.toHaveProperty('gatherData');
        expect(agent).not.toHaveProperty('computeValuation');
      }
    });
  });

  describe('portfolio_summary — correctness', () => {
    it('should include id, name, assetClass, value, confidence, lastUpdated for each asset', async () => {
      const server = new RWAMCPServer({ consensusEngine: makeEngine() });
      await server.handleToolCall('valuate_asset', {
        id: 'shape-test',
        assetClass: AssetClass.COMMODITY,
        name: 'Silver',
        metadata: { commodity: 'silver', quantity: 50 },
      });

      const result: any = await server.handleToolCall('portfolio_summary', {});
      const asset = result.assets[0];
      expect(asset).toHaveProperty('id');
      expect(asset).toHaveProperty('name');
      expect(asset).toHaveProperty('assetClass');
      expect(asset).toHaveProperty('value');
      expect(asset).toHaveProperty('confidence');
      expect(asset).toHaveProperty('lastUpdated');
    });

    it('should include assetCount equal to number of distinct assets', async () => {
      const server = new RWAMCPServer({ consensusEngine: makeEngine() });

      await server.handleToolCall('valuate_asset', {
        id: 'count-a',
        assetClass: AssetClass.COMMODITY,
        name: 'Gold',
        metadata: { commodity: 'gold', quantity: 1 },
      });
      await server.handleToolCall('valuate_asset', {
        id: 'count-b',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Property',
        metadata: { squareFeet: 1000 },
      });
      // Re-valuate count-a — should not increase count
      await server.handleToolCall('valuate_asset', {
        id: 'count-a',
        assetClass: AssetClass.COMMODITY,
        name: 'Gold v2',
        metadata: { commodity: 'gold', quantity: 2 },
      });

      const result: any = await server.handleToolCall('portfolio_summary', {});
      expect(result.assetCount).toBe(2);
    });

    it('should sum individual asset values for totalValue', async () => {
      const server = new RWAMCPServer({ consensusEngine: makeEngine() });

      await server.handleToolCall('valuate_asset', {
        id: 'sum-a',
        assetClass: AssetClass.COMMODITY,
        name: 'Gold',
        metadata: { commodity: 'gold', quantity: 1 },
      });
      await server.handleToolCall('valuate_asset', {
        id: 'sum-b',
        assetClass: AssetClass.COMMODITY,
        name: 'Silver',
        metadata: { commodity: 'silver', quantity: 10 },
      });

      const priceA: any = await server.handleToolCall('get_price', { assetId: 'sum-a' });
      const priceB: any = await server.handleToolCall('get_price', { assetId: 'sum-b' });
      const summary: any = await server.handleToolCall('portfolio_summary', {});

      expect(summary.totalValue).toBeCloseTo(priceA.consensusValue + priceB.consensusValue, 1);
    });

    it('should report lastUpdated as an ISO string', async () => {
      const server = new RWAMCPServer({ consensusEngine: makeEngine() });
      await server.handleToolCall('valuate_asset', {
        id: 'ts-check',
        assetClass: AssetClass.TREASURY,
        name: 'Bond',
        metadata: { maturityYears: 10, couponRate: 0.04, faceValue: 1000 },
      });

      const result: any = await server.handleToolCall('portfolio_summary', {});
      const ts = result.assets[0].lastUpdated;
      expect(ts).toBeTruthy();
      expect(() => new Date(ts)).not.toThrow();
      expect(new Date(ts).getTime()).toBeGreaterThan(0);
    });
  });

  describe('handleToolCall — unknown tool', () => {
    it('should throw an error containing the unknown tool name', async () => {
      const server = new RWAMCPServer({ consensusEngine: makeEngine() });
      await expect(server.handleToolCall('foo_bar', {})).rejects.toThrow('foo_bar');
    });

    it('should throw for empty string tool name', async () => {
      const server = new RWAMCPServer({ consensusEngine: makeEngine() });
      await expect(server.handleToolCall('', {})).rejects.toThrow();
    });

    it('should throw even when args are valid', async () => {
      const server = new RWAMCPServer({ consensusEngine: makeEngine() });
      await expect(
        server.handleToolCall('not_a_real_tool', { id: 'x', assetClass: 'real_estate', name: 'X' }),
      ).rejects.toThrow();
    });
  });

  describe('server with chain bridge configured', () => {
    it('should use bridge to submit when both bridge and asset are present', async () => {
      // We can't actually transact on chain, so we spy on bridge behaviour
      const engine = makeEngine();
      const bridge = new ChainBridge({
        rpcUrl: 'http://localhost:8545',
        oracleAddress: '0x' + '1'.repeat(40),
        // No private key — so submission will fail with "No signer"
      });
      const server = new RWAMCPServer({ consensusEngine: engine, chainBridge: bridge });

      await server.handleToolCall('valuate_asset', {
        id: 'bridge-test',
        assetClass: AssetClass.COMMODITY,
        name: 'Gold',
        metadata: { commodity: 'gold', quantity: 1 },
      });

      // Bridge is present but has no signer — should reject with "No signer" error
      await expect(
        server.handleToolCall('submit_onchain', { assetId: 'bridge-test' }),
      ).rejects.toThrow('No signer');
    });
  });
});
