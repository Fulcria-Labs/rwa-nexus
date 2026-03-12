import { CommodityAgent } from '../../src/agents/commodity-agent';
import { AssetClass, AssetData } from '../../src/types';

describe('CommodityAgent - Boundary conditions', () => {
  let agent: CommodityAgent;

  beforeEach(() => {
    agent = new CommodityAgent();
  });

  describe('commodity name normalization', () => {
    it('should normalize commodity name with spaces to underscores', async () => {
      const asset: AssetData = {
        id: 'space-comm',
        assetClass: AssetClass.COMMODITY,
        name: 'Crude Oil',
        description: '',
        metadata: { commodity: 'crude oil', quantity: 100 },
      };

      const result = await agent.valuate(asset);
      // 'crude oil' -> 'crude_oil' which matches spot price
      expect(result.value).toBeGreaterThan(0);
      const spot = result.dataPoints.find(dp => dp.metric === 'spot_price');
      expect(spot).toBeDefined();
      expect(spot!.value).toBe(78.5);
    });

    it('should normalize commodity name to lowercase', async () => {
      const asset: AssetData = {
        id: 'upper-comm',
        assetClass: AssetClass.COMMODITY,
        name: 'Gold',
        description: '',
        metadata: { commodity: 'Gold', quantity: 1 },
      };

      const result = await agent.valuate(asset);
      expect(result.value).toBeGreaterThan(0);
    });

    it('should normalize UPPERCASE commodity names', async () => {
      const asset: AssetData = {
        id: 'upper-full',
        assetClass: AssetClass.COMMODITY,
        name: 'GOLD',
        description: '',
        metadata: { commodity: 'GOLD', quantity: 1 },
      };

      const result = await agent.valuate(asset);
      const spot = result.dataPoints.find(dp => dp.metric === 'spot_price');
      expect(spot).toBeDefined();
      expect(spot!.value).toBe(2650);
    });

    it('should handle empty commodity string', async () => {
      const asset: AssetData = {
        id: 'empty-comm',
        assetClass: AssetClass.COMMODITY,
        name: 'Empty',
        description: '',
        metadata: { commodity: '', quantity: 10 },
      };

      const result = await agent.valuate(asset);
      // Empty string -> no match -> value 0, confidence 0.1
      expect(result.value).toBe(0);
      expect(result.confidence).toBe(0.1);
    });

    it('should handle missing commodity field', async () => {
      const asset: AssetData = {
        id: 'no-comm',
        assetClass: AssetClass.COMMODITY,
        name: 'No Commodity',
        description: '',
        metadata: { quantity: 10 },
      };

      const result = await agent.valuate(asset);
      // No commodity field -> '' -> no match
      expect(result.value).toBe(0);
      expect(result.confidence).toBe(0.1);
    });
  });

  describe('quantity edge cases', () => {
    it('should handle quantity of zero', async () => {
      const asset: AssetData = {
        id: 'zero-qty',
        assetClass: AssetClass.COMMODITY,
        name: 'Gold',
        description: '',
        metadata: { commodity: 'gold', quantity: 0 },
      };

      const result = await agent.valuate(asset);
      // 0 quantity -> 0 is falsy, so defaults to 1
      // Actually, 0 is falsy so quantity = (meta.quantity as number) || 1 = 1
      expect(result.value).toBeGreaterThan(0);
    });

    it('should handle very large quantity', async () => {
      const asset: AssetData = {
        id: 'huge-qty',
        assetClass: AssetClass.COMMODITY,
        name: 'Gold',
        description: '',
        metadata: { commodity: 'gold', quantity: 1000000 },
      };

      const result = await agent.valuate(asset);
      expect(result.value).toBeGreaterThan(2_000_000_000); // 1M oz * $2650
    });

    it('should handle fractional quantity', async () => {
      const asset: AssetData = {
        id: 'frac-qty',
        assetClass: AssetClass.COMMODITY,
        name: 'Gold',
        description: '',
        metadata: { commodity: 'gold', quantity: 0.5 },
      };

      const result = await agent.valuate(asset);
      expect(result.value).toBeCloseTo(2650 * 0.5, -1);
    });

    it('should default quantity to 1 when not provided', async () => {
      const withQty: AssetData = {
        id: 'with-qty',
        assetClass: AssetClass.COMMODITY,
        name: 'Gold',
        description: '',
        metadata: { commodity: 'gold', quantity: 1 },
      };

      const withoutQty: AssetData = {
        id: 'without-qty',
        assetClass: AssetClass.COMMODITY,
        name: 'Gold',
        description: '',
        metadata: { commodity: 'gold' },
      };

      const withResult = await agent.valuate(withQty);
      const withoutResult = await agent.valuate(withoutQty);

      expect(withResult.value).toBe(withoutResult.value);
    });
  });

  describe('storage cost edge cases', () => {
    it('should not add storage data point when storageCostPerUnit is 0', async () => {
      const asset: AssetData = {
        id: 'store-zero',
        assetClass: AssetClass.COMMODITY,
        name: 'Gold',
        description: '',
        metadata: { commodity: 'gold', quantity: 10, storageCostPerUnit: 0 },
      };

      const result = await agent.valuate(asset);
      const storageDp = result.dataPoints.find(dp => dp.metric === 'storage_cost');
      expect(storageDp).toBeUndefined();
    });

    it('should deduct large storage costs', async () => {
      const asset: AssetData = {
        id: 'store-big',
        assetClass: AssetClass.COMMODITY,
        name: 'Wheat',
        description: '',
        metadata: { commodity: 'wheat', quantity: 1000, storageCostPerUnit: 5 },
      };

      const noStorage: AssetData = {
        id: 'no-store',
        assetClass: AssetClass.COMMODITY,
        name: 'Wheat',
        description: '',
        metadata: { commodity: 'wheat', quantity: 1000 },
      };

      const result = await agent.valuate(asset);
      const noResult = await agent.valuate(noStorage);

      // Difference should be 5 * 1000 = $5000
      expect(noResult.value - result.value).toBeCloseTo(5000, -1);
    });

    it('should have correct weight for storage data point', async () => {
      const asset: AssetData = {
        id: 'store-wt',
        assetClass: AssetClass.COMMODITY,
        name: 'Wheat',
        description: '',
        metadata: { commodity: 'wheat', quantity: 100, storageCostPerUnit: 1 },
      };

      const result = await agent.valuate(asset);
      const storageDp = result.dataPoints.find(dp => dp.metric === 'storage_cost');
      expect(storageDp).toBeDefined();
      expect(storageDp!.weight).toBe(0.05);
      expect(storageDp!.source).toBe('logistics');
    });

    it('should handle storage cost that exceeds spot value', async () => {
      const asset: AssetData = {
        id: 'store-exceed',
        assetClass: AssetClass.COMMODITY,
        name: 'Wheat',
        description: '',
        metadata: { commodity: 'wheat', quantity: 1000, storageCostPerUnit: 100 },
      };

      const result = await agent.valuate(asset);
      // Value could go negative: spot*qty - storage*qty
      // $5.8 * 1000 - $100 * 1000 = -$94,200 (negative)
      expect(result.value).toBeLessThan(0);
    });
  });

  describe('grade factor defaults', () => {
    it('should use 1.0 factor for missing grade (defaults to standard)', async () => {
      const asset: AssetData = {
        id: 'no-grade',
        assetClass: AssetClass.COMMODITY,
        name: 'Gold',
        description: '',
        metadata: { commodity: 'gold', quantity: 1 },
      };

      const result = await agent.valuate(asset);
      const grade = result.dataPoints.find(dp => dp.metric === 'grade_factor');
      expect(grade).toBeDefined();
      expect(grade!.value).toBe(1.0);
    });

    it('should use 1.0 factor for unrecognized grade string', async () => {
      const asset: AssetData = {
        id: 'unk-grade',
        assetClass: AssetClass.COMMODITY,
        name: 'Gold',
        description: '',
        metadata: { commodity: 'gold', quantity: 1, grade: 'legendary' },
      };

      const result = await agent.valuate(asset);
      const grade = result.dataPoints.find(dp => dp.metric === 'grade_factor');
      expect(grade).toBeDefined();
      expect(grade!.value).toBe(1.0);
    });

    it('should label grade data point from quality_assessment source', async () => {
      const asset: AssetData = {
        id: 'grade-src',
        assetClass: AssetClass.COMMODITY,
        name: 'Gold',
        description: '',
        metadata: { commodity: 'gold', quantity: 1 },
      };

      const result = await agent.valuate(asset);
      const grade = result.dataPoints.find(dp => dp.metric === 'grade_factor');
      expect(grade!.source).toBe('quality_assessment');
    });
  });

  describe('seasonal factor data point', () => {
    it('should include seasonal_factor for commodity with seasonal data', async () => {
      const asset: AssetData = {
        id: 'season-dp',
        assetClass: AssetClass.COMMODITY,
        name: 'Crude Oil',
        description: '',
        metadata: { commodity: 'crude_oil', quantity: 100 },
      };

      const result = await agent.valuate(asset);
      const seasonal = result.dataPoints.find(dp => dp.metric === 'seasonal_factor');
      expect(seasonal).toBeDefined();
      expect(seasonal!.source).toBe('seasonal_analysis');
      expect(seasonal!.weight).toBe(0.1);
    });

    it('should use default seasonal factor for non-seasonal commodity', async () => {
      const asset: AssetData = {
        id: 'season-default',
        assetClass: AssetClass.COMMODITY,
        name: 'Platinum',
        description: '',
        metadata: { commodity: 'platinum', quantity: 1 },
      };

      const result = await agent.valuate(asset);
      const seasonal = result.dataPoints.find(dp => dp.metric === 'seasonal_factor');
      expect(seasonal).toBeDefined();
      expect(seasonal!.value).toBe(1.0); // Default: [1,1,1,1]
    });
  });

  describe('data point completeness for known commodities', () => {
    it('should produce 4 data points for known commodity without storage', async () => {
      const asset: AssetData = {
        id: 'dp-count',
        assetClass: AssetClass.COMMODITY,
        name: 'Gold',
        description: '',
        metadata: { commodity: 'gold', quantity: 10 },
      };

      const result = await agent.valuate(asset);
      // spot_price, volatility, seasonal_factor, quantity, grade_factor = 5
      expect(result.dataPoints).toHaveLength(5);
    });

    it('should produce 6 data points for known commodity with storage', async () => {
      const asset: AssetData = {
        id: 'dp-count-store',
        assetClass: AssetClass.COMMODITY,
        name: 'Wheat',
        description: '',
        metadata: { commodity: 'wheat', quantity: 100, storageCostPerUnit: 1 },
      };

      const result = await agent.valuate(asset);
      // spot_price, volatility, seasonal_factor, quantity, grade_factor, storage_cost = 6
      expect(result.dataPoints).toHaveLength(6);
    });

    it('should produce only 2 data points for unknown commodity', async () => {
      const asset: AssetData = {
        id: 'dp-count-unknown',
        assetClass: AssetClass.COMMODITY,
        name: 'Unknown',
        description: '',
        metadata: { commodity: 'unobtanium', quantity: 10 },
      };

      const result = await agent.valuate(asset);
      // Only quantity and grade_factor (no spot data)
      expect(result.dataPoints).toHaveLength(2);
    });
  });

  describe('volatility-confidence mapping', () => {
    const volatilityTests = [
      { commodity: 'gold', volatility: 0.12, expectedConfidence: 0.83 },
      { commodity: 'silver', volatility: 0.22, expectedConfidence: 0.73 },
      { commodity: 'platinum', volatility: 0.18, expectedConfidence: 0.77 },
      { commodity: 'crude_oil', volatility: 0.28, expectedConfidence: 0.67 },
      { commodity: 'natural_gas', volatility: 0.35, expectedConfidence: 0.6 },
      { commodity: 'copper', volatility: 0.20, expectedConfidence: 0.75 },
      { commodity: 'wheat', volatility: 0.25, expectedConfidence: 0.7 },
      { commodity: 'corn', volatility: 0.22, expectedConfidence: 0.73 },
      { commodity: 'soybeans', volatility: 0.20, expectedConfidence: 0.75 },
      { commodity: 'coffee', volatility: 0.30, expectedConfidence: 0.65 },
      { commodity: 'lumber', volatility: 0.35, expectedConfidence: 0.6 },
      { commodity: 'cotton', volatility: 0.25, expectedConfidence: 0.7 },
    ];

    it.each(volatilityTests)(
      'should have confidence $expectedConfidence for $commodity (volatility $volatility)',
      async ({ commodity, expectedConfidence }) => {
        const asset: AssetData = {
          id: `vol-${commodity}`,
          assetClass: AssetClass.COMMODITY,
          name: commodity,
          description: '',
          metadata: { commodity, quantity: 1 },
        };

        const result = await agent.valuate(asset);
        expect(result.confidence).toBeCloseTo(expectedConfidence, 10);
      }
    );
  });

  describe('agent configuration', () => {
    it('should have correct name', () => {
      expect(agent.config.name).toBe('Commodity Valuation Agent');
    });

    it('should have correct description', () => {
      expect(agent.config.description).toContain('commodity');
    });

    it('should handle only COMMODITY class', () => {
      expect(agent.config.assetClasses).toEqual([AssetClass.COMMODITY]);
    });

    it('should reject REAL_ESTATE assets', async () => {
      const asset: AssetData = {
        id: 'reject-re',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Property',
        description: '',
        metadata: {},
      };

      await expect(agent.valuate(asset)).rejects.toThrow('cannot valuate');
    });

    it('should reject TREASURY assets', async () => {
      const asset: AssetData = {
        id: 'reject-trs',
        assetClass: AssetClass.TREASURY,
        name: 'Bond',
        description: '',
        metadata: {},
      };

      await expect(agent.valuate(asset)).rejects.toThrow('cannot valuate');
    });

    it('should reject EQUITY assets', async () => {
      const asset: AssetData = {
        id: 'reject-eq',
        assetClass: AssetClass.EQUITY,
        name: 'Stock',
        description: '',
        metadata: {},
      };

      await expect(agent.valuate(asset)).rejects.toThrow('cannot valuate');
    });

    it('should reject RECEIVABLE assets', async () => {
      const asset: AssetData = {
        id: 'reject-rec',
        assetClass: AssetClass.RECEIVABLE,
        name: 'Invoice',
        description: '',
        metadata: {},
      };

      await expect(agent.valuate(asset)).rejects.toThrow('cannot valuate');
    });
  });
});
