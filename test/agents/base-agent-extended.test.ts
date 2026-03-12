import { BaseValuationAgent } from '../../src/agents/base-agent';
import { PropertyAgent } from '../../src/agents/property-agent';
import { CommodityAgent } from '../../src/agents/commodity-agent';
import { TreasuryAgent } from '../../src/agents/treasury-agent';
import { AssetClass, AssetData, DataPoint } from '../../src/types';

describe('BaseValuationAgent - Extended Tests', () => {
  describe('PropertyAgent as BaseValuationAgent', () => {
    let agent: BaseValuationAgent;

    beforeEach(() => {
      agent = new PropertyAgent();
    });

    it('should have config.id', () => {
      expect(agent.config.id).toBeTruthy();
    });

    it('should have config.name', () => {
      expect(agent.config.name).toBeTruthy();
    });

    it('should have config.description', () => {
      expect(agent.config.description).toBeTruthy();
    });

    it('should have config.assetClasses as non-empty array', () => {
      expect(agent.config.assetClasses.length).toBeGreaterThan(0);
    });

    it('should return false for canValuate with unrelated class', () => {
      expect(agent.canValuate(AssetClass.EQUITY)).toBe(false);
      expect(agent.canValuate(AssetClass.RECEIVABLE)).toBe(false);
    });

    it('should return true for canValuate with its class', () => {
      expect(agent.canValuate(AssetClass.REAL_ESTATE)).toBe(true);
    });

    it('should return ValuationResult with all required fields', async () => {
      const asset: AssetData = {
        id: 'base-test',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Test',
        description: '',
        location: 'miami',
        metadata: { squareFeet: 1000 },
      };
      const result = await agent.valuate(asset);
      expect(result).toHaveProperty('assetId');
      expect(result).toHaveProperty('value');
      expect(result).toHaveProperty('confidence');
      expect(result).toHaveProperty('methodology');
      expect(result).toHaveProperty('dataPoints');
      expect(result).toHaveProperty('timestamp');
      expect(result).toHaveProperty('agentId');
    });

    it('should set agentId to config.id', async () => {
      const asset: AssetData = {
        id: 'agentid-test',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Test',
        description: '',
        metadata: { squareFeet: 1000 },
      };
      const result = await agent.valuate(asset);
      expect(result.agentId).toBe(agent.config.id);
    });

    it('should set assetId from input asset', async () => {
      const asset: AssetData = {
        id: 'my-unique-id',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Test',
        description: '',
        metadata: { squareFeet: 1000 },
      };
      const result = await agent.valuate(asset);
      expect(result.assetId).toBe('my-unique-id');
    });

    it('should throw for wrong asset class with descriptive message', async () => {
      const asset: AssetData = {
        id: 'wrong-class',
        assetClass: AssetClass.COMMODITY,
        name: 'Gold',
        description: '',
        metadata: {},
      };
      try {
        await agent.valuate(asset);
        fail('Should have thrown');
      } catch (e: any) {
        expect(e.message).toContain(agent.config.id);
        expect(e.message).toContain(AssetClass.COMMODITY);
      }
    });
  });

  describe('CommodityAgent as BaseValuationAgent', () => {
    let agent: BaseValuationAgent;

    beforeEach(() => {
      agent = new CommodityAgent();
    });

    it('should have correct ID', () => {
      expect(agent.config.id).toBe('commodity-agent');
    });

    it('should only handle COMMODITY class', () => {
      expect(agent.canValuate(AssetClass.COMMODITY)).toBe(true);
      expect(agent.canValuate(AssetClass.REAL_ESTATE)).toBe(false);
      expect(agent.canValuate(AssetClass.TREASURY)).toBe(false);
      expect(agent.canValuate(AssetClass.EQUITY)).toBe(false);
      expect(agent.canValuate(AssetClass.RECEIVABLE)).toBe(false);
    });

    it('should return non-empty methodology', async () => {
      const asset: AssetData = {
        id: 'meth-com',
        assetClass: AssetClass.COMMODITY,
        name: 'Gold',
        description: '',
        metadata: { commodity: 'gold', quantity: 1 },
      };
      const result = await agent.valuate(asset);
      expect(result.methodology.length).toBeGreaterThan(10);
    });

    it('should return dataPoints array', async () => {
      const asset: AssetData = {
        id: 'dp-com',
        assetClass: AssetClass.COMMODITY,
        name: 'Gold',
        description: '',
        metadata: { commodity: 'gold', quantity: 1 },
      };
      const result = await agent.valuate(asset);
      expect(Array.isArray(result.dataPoints)).toBe(true);
      expect(result.dataPoints.length).toBeGreaterThan(0);
    });
  });

  describe('TreasuryAgent as BaseValuationAgent', () => {
    let agent: BaseValuationAgent;

    beforeEach(() => {
      agent = new TreasuryAgent();
    });

    it('should have correct ID', () => {
      expect(agent.config.id).toBe('treasury-agent');
    });

    it('should only handle TREASURY class', () => {
      expect(agent.canValuate(AssetClass.TREASURY)).toBe(true);
      expect(agent.canValuate(AssetClass.REAL_ESTATE)).toBe(false);
      expect(agent.canValuate(AssetClass.COMMODITY)).toBe(false);
    });

    it('should return non-empty methodology', async () => {
      const asset: AssetData = {
        id: 'meth-trs',
        assetClass: AssetClass.TREASURY,
        name: 'Bond',
        description: '',
        metadata: { maturityYears: 10, couponRate: 0.04, faceValue: 1000 },
      };
      const result = await agent.valuate(asset);
      expect(result.methodology.length).toBeGreaterThan(10);
    });
  });

  describe('readonly config', () => {
    it('should expose config as readonly', () => {
      const agent = new PropertyAgent();
      const config = agent.config;
      expect(config.id).toBe('property-agent');
      // Config object reference is stable
      expect(agent.config).toBe(config);
    });
  });

  describe('all agents have consistent interface', () => {
    const agents: BaseValuationAgent[] = [
      new PropertyAgent(),
      new CommodityAgent(),
      new TreasuryAgent(),
    ];

    it.each([0, 1, 2])('agent[%i] should have non-empty id', (i) => {
      expect(agents[i].config.id).toBeTruthy();
    });

    it.each([0, 1, 2])('agent[%i] should have non-empty name', (i) => {
      expect(agents[i].config.name).toBeTruthy();
    });

    it.each([0, 1, 2])('agent[%i] should have non-empty description', (i) => {
      expect(agents[i].config.description).toBeTruthy();
    });

    it.each([0, 1, 2])('agent[%i] should have at least one asset class', (i) => {
      expect(agents[i].config.assetClasses.length).toBeGreaterThan(0);
    });

    it.each([0, 1, 2])('agent[%i] should have unique id', (i) => {
      const otherIds = agents.filter((_, j) => j !== i).map(a => a.config.id);
      expect(otherIds).not.toContain(agents[i].config.id);
    });
  });
});
