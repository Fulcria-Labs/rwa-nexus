import { PropertyAgent } from '../../src/agents/property-agent';
import { CommodityAgent } from '../../src/agents/commodity-agent';
import { TreasuryAgent } from '../../src/agents/treasury-agent';
import { AssetClass, AssetData } from '../../src/types';

describe('Agent Comparison & Cross-Validation', () => {
  const propAgent = new PropertyAgent();
  const comAgent = new CommodityAgent();
  const trsAgent = new TreasuryAgent();

  describe('agent identity uniqueness', () => {
    it('should have unique IDs across all agents', () => {
      const ids = [propAgent.config.id, comAgent.config.id, trsAgent.config.id];
      expect(new Set(ids).size).toBe(3);
    });

    it('should have unique names across all agents', () => {
      const names = [propAgent.config.name, comAgent.config.name, trsAgent.config.name];
      expect(new Set(names).size).toBe(3);
    });

    it('should have non-overlapping asset classes', () => {
      const propClasses = new Set(propAgent.config.assetClasses);
      const comClasses = new Set(comAgent.config.assetClasses);
      const trsClasses = new Set(trsAgent.config.assetClasses);

      // No intersection
      for (const cls of propClasses) {
        expect(comClasses.has(cls)).toBe(false);
        expect(trsClasses.has(cls)).toBe(false);
      }
      for (const cls of comClasses) {
        expect(trsClasses.has(cls)).toBe(false);
      }
    });
  });

  describe('cross-class rejection', () => {
    it('property agent rejects all non-real-estate classes', async () => {
      for (const cls of [AssetClass.COMMODITY, AssetClass.TREASURY, AssetClass.EQUITY, AssetClass.RECEIVABLE]) {
        const asset: AssetData = {
          id: `rej-${cls}`,
          assetClass: cls,
          name: 'Test',
          description: '',
          metadata: {},
        };
        await expect(propAgent.valuate(asset)).rejects.toThrow();
      }
    });

    it('commodity agent rejects all non-commodity classes', async () => {
      for (const cls of [AssetClass.REAL_ESTATE, AssetClass.TREASURY, AssetClass.EQUITY, AssetClass.RECEIVABLE]) {
        const asset: AssetData = {
          id: `rej-${cls}`,
          assetClass: cls,
          name: 'Test',
          description: '',
          metadata: {},
        };
        await expect(comAgent.valuate(asset)).rejects.toThrow();
      }
    });

    it('treasury agent rejects all non-treasury classes', async () => {
      for (const cls of [AssetClass.REAL_ESTATE, AssetClass.COMMODITY, AssetClass.EQUITY, AssetClass.RECEIVABLE]) {
        const asset: AssetData = {
          id: `rej-${cls}`,
          assetClass: cls,
          name: 'Test',
          description: '',
          metadata: {},
        };
        await expect(trsAgent.valuate(asset)).rejects.toThrow();
      }
    });
  });

  describe('value range comparisons', () => {
    it('manhattan property should be worth more than default location', async () => {
      const manhattan: AssetData = {
        id: 'cmp-man',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Manhattan',
        description: '',
        location: 'manhattan',
        metadata: { squareFeet: 1000 },
      };
      const defaultLoc: AssetData = {
        id: 'cmp-def',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Default',
        description: '',
        location: 'unknown_place',
        metadata: { squareFeet: 1000 },
      };

      const manResult = await propAgent.valuate(manhattan);
      const defResult = await propAgent.valuate(defaultLoc);
      expect(manResult.value).toBeGreaterThan(defResult.value);
    });

    it('gold should be worth more per unit than silver', async () => {
      const gold: AssetData = {
        id: 'cmp-gold',
        assetClass: AssetClass.COMMODITY,
        name: 'Gold',
        description: '',
        metadata: { commodity: 'gold', quantity: 1 },
      };
      const silver: AssetData = {
        id: 'cmp-silver',
        assetClass: AssetClass.COMMODITY,
        name: 'Silver',
        description: '',
        metadata: { commodity: 'silver', quantity: 1 },
      };

      const goldResult = await comAgent.valuate(gold);
      const silverResult = await comAgent.valuate(silver);
      expect(goldResult.value).toBeGreaterThan(silverResult.value);
    });

    it('AAA bonds should be worth more than CCC bonds (same terms)', async () => {
      const aaa: AssetData = {
        id: 'cmp-aaa',
        assetClass: AssetClass.TREASURY,
        name: 'AAA',
        description: '',
        metadata: { maturityYears: 10, couponRate: 0.04, faceValue: 1000, creditRating: 'AAA' },
      };
      const ccc: AssetData = {
        id: 'cmp-ccc',
        assetClass: AssetClass.TREASURY,
        name: 'CCC',
        description: '',
        metadata: { maturityYears: 10, couponRate: 0.04, faceValue: 1000, creditRating: 'CCC' },
      };

      const aaaResult = await trsAgent.valuate(aaa);
      const cccResult = await trsAgent.valuate(ccc);
      expect(aaaResult.value).toBeGreaterThan(cccResult.value);
    });
  });

  describe('methodology strings', () => {
    it('property agent methodology mentions comparable sales', async () => {
      const asset: AssetData = {
        id: 'meth-p',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Test',
        description: '',
        metadata: { squareFeet: 1000 },
      };
      const result = await propAgent.valuate(asset);
      expect(result.methodology.toLowerCase()).toContain('comparable');
    });

    it('commodity agent methodology mentions spot price', async () => {
      const asset: AssetData = {
        id: 'meth-c',
        assetClass: AssetClass.COMMODITY,
        name: 'Gold',
        description: '',
        metadata: { commodity: 'gold', quantity: 1 },
      };
      const result = await comAgent.valuate(asset);
      expect(result.methodology.toLowerCase()).toContain('spot');
    });

    it('treasury agent methodology mentions yield or cash flow', async () => {
      const asset: AssetData = {
        id: 'meth-t',
        assetClass: AssetClass.TREASURY,
        name: 'Bond',
        description: '',
        metadata: { maturityYears: 10, couponRate: 0.04, faceValue: 1000 },
      };
      const result = await trsAgent.valuate(asset);
      const meth = result.methodology.toLowerCase();
      expect(meth.includes('yield') || meth.includes('cash flow')).toBe(true);
    });
  });

  describe('data point consistency', () => {
    it('property agent data points have valid weights', async () => {
      const asset: AssetData = {
        id: 'dp-p',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Test',
        description: '',
        location: 'miami',
        metadata: { squareFeet: 2000, annualRent: 80000, condition: 'good', yearBuilt: 2010 },
      };
      const result = await propAgent.valuate(asset);
      for (const dp of result.dataPoints) {
        expect(dp.weight).toBeGreaterThanOrEqual(0);
        expect(dp.weight).toBeLessThanOrEqual(1);
      }
    });

    it('commodity agent data points have valid weights', async () => {
      const asset: AssetData = {
        id: 'dp-c',
        assetClass: AssetClass.COMMODITY,
        name: 'Gold',
        description: '',
        metadata: { commodity: 'gold', quantity: 100, grade: 'premium', storageCostPerUnit: 5 },
      };
      const result = await comAgent.valuate(asset);
      for (const dp of result.dataPoints) {
        expect(dp.weight).toBeGreaterThanOrEqual(0);
        expect(dp.weight).toBeLessThanOrEqual(1);
      }
    });

    it('treasury agent data points have valid weights', async () => {
      const asset: AssetData = {
        id: 'dp-t',
        assetClass: AssetClass.TREASURY,
        name: 'Bond',
        description: '',
        metadata: { maturityYears: 10, couponRate: 0.04, faceValue: 1000, creditRating: 'AAA' },
      };
      const result = await trsAgent.valuate(asset);
      for (const dp of result.dataPoints) {
        expect(dp.weight).toBeGreaterThanOrEqual(0);
        expect(dp.weight).toBeLessThanOrEqual(1);
      }
    });

    it('all agents return timestamps on data points', async () => {
      const assets: AssetData[] = [
        { id: 'ts-p', assetClass: AssetClass.REAL_ESTATE, name: 'P', description: '', metadata: { squareFeet: 1000 } },
        { id: 'ts-c', assetClass: AssetClass.COMMODITY, name: 'C', description: '', metadata: { commodity: 'gold', quantity: 1 } },
        { id: 'ts-t', assetClass: AssetClass.TREASURY, name: 'T', description: '', metadata: { maturityYears: 10, couponRate: 0.04, faceValue: 1000 } },
      ];
      const agents = [propAgent, comAgent, trsAgent];

      for (let i = 0; i < assets.length; i++) {
        const result = await agents[i].valuate(assets[i]);
        for (const dp of result.dataPoints) {
          expect(dp.timestamp).toBeInstanceOf(Date);
        }
      }
    });
  });

  describe('confidence ranges', () => {
    it('property agent confidence is between 0 and 1', async () => {
      const asset: AssetData = {
        id: 'conf-p',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Test',
        description: '',
        metadata: { squareFeet: 1000 },
      };
      const result = await propAgent.valuate(asset);
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });

    it('commodity agent confidence is between 0 and 1', async () => {
      const asset: AssetData = {
        id: 'conf-c',
        assetClass: AssetClass.COMMODITY,
        name: 'Gold',
        description: '',
        metadata: { commodity: 'gold', quantity: 1 },
      };
      const result = await comAgent.valuate(asset);
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });

    it('treasury agent confidence is between 0 and 1', async () => {
      const asset: AssetData = {
        id: 'conf-t',
        assetClass: AssetClass.TREASURY,
        name: 'Bond',
        description: '',
        metadata: { maturityYears: 10, couponRate: 0.04, faceValue: 1000 },
      };
      const result = await trsAgent.valuate(asset);
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });
  });
});
