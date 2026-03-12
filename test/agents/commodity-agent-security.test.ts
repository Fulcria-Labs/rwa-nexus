import { CommodityAgent } from '../../src/agents/commodity-agent';
import { AssetClass, AssetData } from '../../src/types';

describe('CommodityAgent - Security & Edge Cases', () => {
  let agent: CommodityAgent;

  beforeEach(() => {
    agent = new CommodityAgent();
  });

  describe('commodity name handling', () => {
    it('should handle unknown commodity gracefully', async () => {
      const asset: AssetData = {
        id: 'com-unknown',
        assetClass: AssetClass.COMMODITY,
        name: 'Unknown',
        description: '',
        metadata: { commodity: 'unobtanium', quantity: 10 },
      };
      const result = await agent.valuate(asset);
      // No spot price -> value=0, confidence=0.1
      expect(result.confidence).toBe(0.1);
    });

    it('should handle empty commodity string', async () => {
      const asset: AssetData = {
        id: 'com-empty',
        assetClass: AssetClass.COMMODITY,
        name: 'Empty',
        description: '',
        metadata: { commodity: '', quantity: 10 },
      };
      const result = await agent.valuate(asset);
      expect(result.confidence).toBe(0.1);
    });

    it('should handle commodity with SQL injection', async () => {
      const asset: AssetData = {
        id: 'com-sql',
        assetClass: AssetClass.COMMODITY,
        name: 'SQL Test',
        description: '',
        metadata: { commodity: "'; DROP TABLE commodities;--", quantity: 10 },
      };
      const result = await agent.valuate(asset);
      expect(typeof result.value).toBe('number');
    });

    it('should handle commodity with special characters', async () => {
      const asset: AssetData = {
        id: 'com-special',
        assetClass: AssetClass.COMMODITY,
        name: 'Special',
        description: '',
        metadata: { commodity: '!@#$%^&*()', quantity: 10 },
      };
      const result = await agent.valuate(asset);
      expect(typeof result.value).toBe('number');
    });

    it('should handle commodity name case insensitivity', async () => {
      const upper: AssetData = {
        id: 'com-upper',
        assetClass: AssetClass.COMMODITY,
        name: 'Gold Upper',
        description: '',
        metadata: { commodity: 'GOLD', quantity: 10 },
      };
      const lower: AssetData = {
        id: 'com-lower',
        assetClass: AssetClass.COMMODITY,
        name: 'Gold Lower',
        description: '',
        metadata: { commodity: 'gold', quantity: 10 },
      };
      const upperResult = await agent.valuate(upper);
      const lowerResult = await agent.valuate(lower);
      expect(upperResult.value).toBe(lowerResult.value);
    });

    it('should handle commodity name with spaces', async () => {
      const asset: AssetData = {
        id: 'com-space',
        assetClass: AssetClass.COMMODITY,
        name: 'Crude Oil',
        description: '',
        metadata: { commodity: 'crude oil', quantity: 100 },
      };
      const result = await agent.valuate(asset);
      expect(result.value).toBeGreaterThan(0);
    });

    it('should handle missing commodity field entirely', async () => {
      const asset: AssetData = {
        id: 'com-nofield',
        assetClass: AssetClass.COMMODITY,
        name: 'No Commodity',
        description: '',
        metadata: { quantity: 10 },
      };
      const result = await agent.valuate(asset);
      expect(result.confidence).toBe(0.1);
    });
  });

  describe('quantity edge cases', () => {
    it('should handle zero quantity', async () => {
      const asset: AssetData = {
        id: 'qty-zero',
        assetClass: AssetClass.COMMODITY,
        name: 'Zero Qty',
        description: '',
        metadata: { commodity: 'gold', quantity: 0 },
      };
      const result = await agent.valuate(asset);
      // quantity=0 is falsy, defaults to 1
      expect(typeof result.value).toBe('number');
    });

    it('should handle negative quantity', async () => {
      const asset: AssetData = {
        id: 'qty-neg',
        assetClass: AssetClass.COMMODITY,
        name: 'Negative Qty',
        description: '',
        metadata: { commodity: 'gold', quantity: -5 },
      };
      const result = await agent.valuate(asset);
      expect(typeof result.value).toBe('number');
    });

    it('should handle very large quantity', async () => {
      const asset: AssetData = {
        id: 'qty-huge',
        assetClass: AssetClass.COMMODITY,
        name: 'Huge Qty',
        description: '',
        metadata: { commodity: 'gold', quantity: 1000000 },
      };
      const result = await agent.valuate(asset);
      expect(result.value).toBeGreaterThan(1000000000);
    });

    it('should handle fractional quantity', async () => {
      const asset: AssetData = {
        id: 'qty-frac',
        assetClass: AssetClass.COMMODITY,
        name: 'Fractional Qty',
        description: '',
        metadata: { commodity: 'gold', quantity: 0.5 },
      };
      const result = await agent.valuate(asset);
      expect(result.value).toBeGreaterThan(0);
      expect(result.value).toBeLessThan(2650);
    });

    it('should handle missing quantity defaulting to 1', async () => {
      const withQty: AssetData = {
        id: 'qty-one',
        assetClass: AssetClass.COMMODITY,
        name: 'One Unit',
        description: '',
        metadata: { commodity: 'gold', quantity: 1 },
      };
      const noQty: AssetData = {
        id: 'qty-default',
        assetClass: AssetClass.COMMODITY,
        name: 'Default Unit',
        description: '',
        metadata: { commodity: 'gold' },
      };
      const withResult = await agent.valuate(withQty);
      const noResult = await agent.valuate(noQty);
      expect(withResult.value).toBe(noResult.value);
    });
  });

  describe('grade factor edge cases', () => {
    it('should handle premium grade', async () => {
      const asset: AssetData = {
        id: 'grade-prem',
        assetClass: AssetClass.COMMODITY,
        name: 'Premium',
        description: '',
        metadata: { commodity: 'gold', quantity: 10, grade: 'premium' },
      };
      const result = await agent.valuate(asset);
      const gradeDp = result.dataPoints.find(dp => dp.metric === 'grade_factor');
      expect(gradeDp!.value).toBe(1.05);
    });

    it('should handle standard grade', async () => {
      const asset: AssetData = {
        id: 'grade-std',
        assetClass: AssetClass.COMMODITY,
        name: 'Standard',
        description: '',
        metadata: { commodity: 'gold', quantity: 10, grade: 'standard' },
      };
      const result = await agent.valuate(asset);
      const gradeDp = result.dataPoints.find(dp => dp.metric === 'grade_factor');
      expect(gradeDp!.value).toBe(1.0);
    });

    it('should handle substandard grade', async () => {
      const asset: AssetData = {
        id: 'grade-sub',
        assetClass: AssetClass.COMMODITY,
        name: 'Substandard',
        description: '',
        metadata: { commodity: 'gold', quantity: 10, grade: 'substandard' },
      };
      const result = await agent.valuate(asset);
      const gradeDp = result.dataPoints.find(dp => dp.metric === 'grade_factor');
      expect(gradeDp!.value).toBe(0.9);
    });

    it('should default unknown grade to 1.0', async () => {
      const asset: AssetData = {
        id: 'grade-unk',
        assetClass: AssetClass.COMMODITY,
        name: 'Unknown Grade',
        description: '',
        metadata: { commodity: 'gold', quantity: 10, grade: 'mystery' },
      };
      const result = await agent.valuate(asset);
      const gradeDp = result.dataPoints.find(dp => dp.metric === 'grade_factor');
      expect(gradeDp!.value).toBe(1.0);
    });

    it('should produce premium > standard > substandard values', async () => {
      const makeAsset = (grade: string): AssetData => ({
        id: `grade-${grade}`,
        assetClass: AssetClass.COMMODITY,
        name: grade,
        description: '',
        metadata: { commodity: 'gold', quantity: 100, grade },
      });

      const premResult = await agent.valuate(makeAsset('premium'));
      const stdResult = await agent.valuate(makeAsset('standard'));
      const subResult = await agent.valuate(makeAsset('substandard'));

      expect(premResult.value).toBeGreaterThan(stdResult.value);
      expect(stdResult.value).toBeGreaterThan(subResult.value);
    });
  });

  describe('storage cost edge cases', () => {
    it('should reduce value by storage costs', async () => {
      const noStorage: AssetData = {
        id: 'store-no',
        assetClass: AssetClass.COMMODITY,
        name: 'No Storage',
        description: '',
        metadata: { commodity: 'gold', quantity: 100 },
      };
      const withStorage: AssetData = {
        id: 'store-yes',
        assetClass: AssetClass.COMMODITY,
        name: 'With Storage',
        description: '',
        metadata: { commodity: 'gold', quantity: 100, storageCostPerUnit: 10 },
      };

      const noResult = await agent.valuate(noStorage);
      const withResult = await agent.valuate(withStorage);

      expect(noResult.value).toBeGreaterThan(withResult.value);
    });

    it('should handle zero storage cost', async () => {
      const asset: AssetData = {
        id: 'store-zero',
        assetClass: AssetClass.COMMODITY,
        name: 'Zero Storage',
        description: '',
        metadata: { commodity: 'gold', quantity: 100, storageCostPerUnit: 0 },
      };
      const result = await agent.valuate(asset);
      // storageCostPerUnit=0 is falsy, storage dp not added
      expect(result.dataPoints.find(dp => dp.metric === 'storage_cost')).toBeUndefined();
    });

    it('should handle negative storage cost', async () => {
      const asset: AssetData = {
        id: 'store-neg',
        assetClass: AssetClass.COMMODITY,
        name: 'Negative Storage',
        description: '',
        metadata: { commodity: 'gold', quantity: 100, storageCostPerUnit: -5 },
      };
      const result = await agent.valuate(asset);
      // Negative cost would increase value
      expect(typeof result.value).toBe('number');
    });
  });

  describe('all commodity types', () => {
    const commodities = [
      'gold', 'silver', 'platinum', 'crude_oil', 'natural_gas',
      'copper', 'wheat', 'corn', 'soybeans', 'coffee', 'lumber', 'cotton',
    ];

    it.each(commodities)('should valuate %s with positive value', async (commodity) => {
      const asset: AssetData = {
        id: `all-${commodity}`,
        assetClass: AssetClass.COMMODITY,
        name: commodity,
        description: '',
        metadata: { commodity, quantity: 10 },
      };
      const result = await agent.valuate(asset);
      expect(result.value).toBeGreaterThan(0);
      expect(result.confidence).toBeGreaterThan(0.3);
    });

    it.each(commodities)('should include spot_price data point for %s', async (commodity) => {
      const asset: AssetData = {
        id: `dp-${commodity}`,
        assetClass: AssetClass.COMMODITY,
        name: commodity,
        description: '',
        metadata: { commodity, quantity: 1 },
      };
      const result = await agent.valuate(asset);
      expect(result.dataPoints.find(dp => dp.metric === 'spot_price')).toBeDefined();
    });

    it.each(commodities)('should include volatility data point for %s', async (commodity) => {
      const asset: AssetData = {
        id: `vol-${commodity}`,
        assetClass: AssetClass.COMMODITY,
        name: commodity,
        description: '',
        metadata: { commodity, quantity: 1 },
      };
      const result = await agent.valuate(asset);
      expect(result.dataPoints.find(dp => dp.metric === 'volatility')).toBeDefined();
    });
  });

  describe('confidence based on volatility', () => {
    it('should have higher confidence for gold (low volatility) than natural gas (high)', async () => {
      const gold: AssetData = {
        id: 'conf-gold',
        assetClass: AssetClass.COMMODITY,
        name: 'Gold',
        description: '',
        metadata: { commodity: 'gold', quantity: 1 },
      };
      const gas: AssetData = {
        id: 'conf-gas',
        assetClass: AssetClass.COMMODITY,
        name: 'Gas',
        description: '',
        metadata: { commodity: 'natural_gas', quantity: 1 },
      };
      const goldResult = await agent.valuate(gold);
      const gasResult = await agent.valuate(gas);
      expect(goldResult.confidence).toBeGreaterThan(gasResult.confidence);
    });

    it('should clamp confidence at minimum 0.4', async () => {
      // natural_gas has volatility 0.35, so confidence = 0.95-0.35=0.60 > 0.4
      // but all commodities should stay above 0.4
      const commodities = ['crude_oil', 'natural_gas', 'lumber'];
      for (const commodity of commodities) {
        const asset: AssetData = {
          id: `min-conf-${commodity}`,
          assetClass: AssetClass.COMMODITY,
          name: commodity,
          description: '',
          metadata: { commodity, quantity: 1 },
        };
        const result = await agent.valuate(asset);
        expect(result.confidence).toBeGreaterThanOrEqual(0.4);
      }
    });
  });

  describe('rejection of wrong asset classes', () => {
    it('should reject real estate assets', async () => {
      const asset: AssetData = {
        id: 'rej-re',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Property',
        description: '',
        metadata: {},
      };
      await expect(agent.valuate(asset)).rejects.toThrow('cannot valuate');
    });

    it('should reject treasury assets', async () => {
      const asset: AssetData = {
        id: 'rej-trs',
        assetClass: AssetClass.TREASURY,
        name: 'Bond',
        description: '',
        metadata: {},
      };
      await expect(agent.valuate(asset)).rejects.toThrow('cannot valuate');
    });

    it('should reject equity assets', async () => {
      const asset: AssetData = {
        id: 'rej-eq',
        assetClass: AssetClass.EQUITY,
        name: 'Stock',
        description: '',
        metadata: {},
      };
      await expect(agent.valuate(asset)).rejects.toThrow('cannot valuate');
    });

    it('should reject receivable assets', async () => {
      const asset: AssetData = {
        id: 'rej-rcv',
        assetClass: AssetClass.RECEIVABLE,
        name: 'Invoice',
        description: '',
        metadata: {},
      };
      await expect(agent.valuate(asset)).rejects.toThrow('cannot valuate');
    });
  });
});
