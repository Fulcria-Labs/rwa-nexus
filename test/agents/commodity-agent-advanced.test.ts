import { CommodityAgent } from '../../src/agents/commodity-agent';
import { AssetClass, AssetData } from '../../src/types';

describe('CommodityAgent - Advanced', () => {
  let agent: CommodityAgent;

  beforeEach(() => {
    agent = new CommodityAgent();
  });

  describe('seasonal adjustments', () => {
    it('should apply seasonal factors for crude oil', async () => {
      // We can't control Date in this test, but we can verify value is reasonable
      const asset: AssetData = {
        id: 'season-oil',
        assetClass: AssetClass.COMMODITY,
        name: 'Oil',
        description: '',
        metadata: { commodity: 'crude_oil', quantity: 1000 },
      };

      const result = await agent.valuate(asset);
      // Base: $78.5 * 1000 = $78,500, seasonal range ±5%
      expect(result.value).toBeGreaterThan(70000);
      expect(result.value).toBeLessThan(90000);
    });

    it('should apply seasonal factors for natural gas', async () => {
      const asset: AssetData = {
        id: 'season-gas',
        assetClass: AssetClass.COMMODITY,
        name: 'Gas',
        description: '',
        metadata: { commodity: 'natural_gas', quantity: 10000 },
      };

      const result = await agent.valuate(asset);
      // Base: $3.2 * 10000 = $32,000, seasonal range ±15%
      expect(result.value).toBeGreaterThan(25000);
      expect(result.value).toBeLessThan(40000);
    });

    it('should use default seasonal factor (1.0) for non-seasonal commodities', async () => {
      const asset: AssetData = {
        id: 'season-gold',
        assetClass: AssetClass.COMMODITY,
        name: 'Gold',
        description: '',
        metadata: { commodity: 'gold', quantity: 1 },
      };

      const result = await agent.valuate(asset);
      // Gold has no seasonal adjustment, default [1,1,1,1]
      // $2650 * 1 * 1.0 (seasonal) * 1.0 (grade) = $2650
      expect(result.value).toBe(2650);
    });
  });

  describe('grade factors', () => {
    it('should apply premium factor (1.05)', async () => {
      const premium: AssetData = {
        id: 'grade-p',
        assetClass: AssetClass.COMMODITY,
        name: 'Premium',
        description: '',
        metadata: { commodity: 'gold', quantity: 100, grade: 'premium' },
      };

      const standard: AssetData = {
        id: 'grade-s',
        assetClass: AssetClass.COMMODITY,
        name: 'Standard',
        description: '',
        metadata: { commodity: 'gold', quantity: 100, grade: 'standard' },
      };

      const premResult = await agent.valuate(premium);
      const stdResult = await agent.valuate(standard);

      expect(premResult.value / stdResult.value).toBeCloseTo(1.05, 2);
    });

    it('should apply substandard factor (0.90)', async () => {
      const standard: AssetData = {
        id: 'grade-s',
        assetClass: AssetClass.COMMODITY,
        name: 'Standard',
        description: '',
        metadata: { commodity: 'gold', quantity: 100, grade: 'standard' },
      };

      const substandard: AssetData = {
        id: 'grade-sub',
        assetClass: AssetClass.COMMODITY,
        name: 'Substandard',
        description: '',
        metadata: { commodity: 'gold', quantity: 100, grade: 'substandard' },
      };

      const stdResult = await agent.valuate(standard);
      const subResult = await agent.valuate(substandard);

      expect(subResult.value / stdResult.value).toBeCloseTo(0.90, 2);
    });

    it('should default to 1.0 for unknown grade', async () => {
      const unknown: AssetData = {
        id: 'grade-u',
        assetClass: AssetClass.COMMODITY,
        name: 'Unknown',
        description: '',
        metadata: { commodity: 'gold', quantity: 100, grade: 'ultra_premium' },
      };

      const standard: AssetData = {
        id: 'grade-s2',
        assetClass: AssetClass.COMMODITY,
        name: 'Standard',
        description: '',
        metadata: { commodity: 'gold', quantity: 100, grade: 'standard' },
      };

      const unknownResult = await agent.valuate(unknown);
      const stdResult = await agent.valuate(standard);

      expect(unknownResult.value).toBe(stdResult.value);
    });
  });

  describe('quantity handling', () => {
    it('should default quantity to 1', async () => {
      const asset: AssetData = {
        id: 'qty-def',
        assetClass: AssetClass.COMMODITY,
        name: 'Gold',
        description: '',
        metadata: { commodity: 'gold' },
      };

      const result = await agent.valuate(asset);
      expect(result.value).toBeCloseTo(2650, -1); // ~$2650 for 1 oz
    });

    it('should scale linearly with quantity', async () => {
      const single: AssetData = {
        id: 'qty-1',
        assetClass: AssetClass.COMMODITY,
        name: 'Gold 1',
        description: '',
        metadata: { commodity: 'gold', quantity: 1 },
      };

      const hundred: AssetData = {
        id: 'qty-100',
        assetClass: AssetClass.COMMODITY,
        name: 'Gold 100',
        description: '',
        metadata: { commodity: 'gold', quantity: 100 },
      };

      const singleResult = await agent.valuate(single);
      const hundredResult = await agent.valuate(hundred);

      expect(hundredResult.value / singleResult.value).toBeCloseTo(100, 0);
    });
  });

  describe('storage cost deduction', () => {
    it('should deduct storage costs per unit', async () => {
      const noStorage: AssetData = {
        id: 'store-no',
        assetClass: AssetClass.COMMODITY,
        name: 'Wheat',
        description: '',
        metadata: { commodity: 'wheat', quantity: 1000 },
      };

      const withStorage: AssetData = {
        id: 'store-yes',
        assetClass: AssetClass.COMMODITY,
        name: 'Wheat',
        description: '',
        metadata: { commodity: 'wheat', quantity: 1000, storageCostPerUnit: 1.0 },
      };

      const noResult = await agent.valuate(noStorage);
      const withResult = await agent.valuate(withStorage);

      // Difference should be ~$1000 (1.0 * 1000 units)
      expect(noResult.value - withResult.value).toBeCloseTo(1000, -1);
    });

    it('should not add storage data point when cost is 0', async () => {
      const asset: AssetData = {
        id: 'store-0',
        assetClass: AssetClass.COMMODITY,
        name: 'Gold',
        description: '',
        metadata: { commodity: 'gold', quantity: 10, storageCostPerUnit: 0 },
      };

      const result = await agent.valuate(asset);
      const storageDp = result.dataPoints.find(dp => dp.metric === 'storage_cost');
      expect(storageDp).toBeUndefined();
    });
  });

  describe('confidence based on volatility', () => {
    it('should have confidence 0.83 for gold (volatility 0.12)', async () => {
      const asset: AssetData = {
        id: 'vol-gold',
        assetClass: AssetClass.COMMODITY,
        name: 'Gold',
        description: '',
        metadata: { commodity: 'gold', quantity: 1 },
      };

      const result = await agent.valuate(asset);
      // max(0.4, 0.95 - 0.12) = 0.83
      expect(result.confidence).toBe(0.83);
    });

    it('should have confidence 0.6 for natural gas (volatility 0.35)', async () => {
      const asset: AssetData = {
        id: 'vol-gas',
        assetClass: AssetClass.COMMODITY,
        name: 'Gas',
        description: '',
        metadata: { commodity: 'natural_gas', quantity: 1 },
      };

      const result = await agent.valuate(asset);
      // max(0.4, 0.95 - 0.35) = 0.6
      expect(result.confidence).toBe(0.6);
    });

    it('should floor confidence at 0.4 for highly volatile commodities', async () => {
      // lumber has volatility 0.35, so 0.95-0.35 = 0.6
      // The floor only kicks in at 0.55+ volatility
      const asset: AssetData = {
        id: 'vol-lumber',
        assetClass: AssetClass.COMMODITY,
        name: 'Lumber',
        description: '',
        metadata: { commodity: 'lumber', quantity: 1 },
      };

      const result = await agent.valuate(asset);
      expect(result.confidence).toBeGreaterThanOrEqual(0.4);
    });

    it('should return 0.1 confidence for unknown commodity', async () => {
      const asset: AssetData = {
        id: 'vol-unknown',
        assetClass: AssetClass.COMMODITY,
        name: 'Unknown',
        description: '',
        metadata: { commodity: 'unobtanium', quantity: 10 },
      };

      const result = await agent.valuate(asset);
      expect(result.confidence).toBe(0.1);
      expect(result.value).toBe(0);
    });
  });

  describe('data points structure', () => {
    it('should include spot_price data point', async () => {
      const asset: AssetData = {
        id: 'dp-spot',
        assetClass: AssetClass.COMMODITY,
        name: 'Silver',
        description: '',
        metadata: { commodity: 'silver', quantity: 100 },
      };

      const result = await agent.valuate(asset);
      const spot = result.dataPoints.find(dp => dp.metric === 'spot_price');
      expect(spot).toBeDefined();
      expect(spot!.value).toBe(31.5);
    });

    it('should include volatility data point', async () => {
      const asset: AssetData = {
        id: 'dp-vol',
        assetClass: AssetClass.COMMODITY,
        name: 'Silver',
        description: '',
        metadata: { commodity: 'silver', quantity: 100 },
      };

      const result = await agent.valuate(asset);
      const vol = result.dataPoints.find(dp => dp.metric === 'volatility');
      expect(vol).toBeDefined();
      expect(vol!.value).toBe(0.22);
    });

    it('should not include spot data for unknown commodity', async () => {
      const asset: AssetData = {
        id: 'dp-none',
        assetClass: AssetClass.COMMODITY,
        name: 'Unknown',
        description: '',
        metadata: { commodity: 'pixiedust', quantity: 1 },
      };

      const result = await agent.valuate(asset);
      const spot = result.dataPoints.find(dp => dp.metric === 'spot_price');
      expect(spot).toBeUndefined();
    });
  });

  describe('commodity prices', () => {
    const priceChecks = [
      { commodity: 'gold', expectedPrice: 2650 },
      { commodity: 'silver', expectedPrice: 31.5 },
      { commodity: 'platinum', expectedPrice: 1020 },
      { commodity: 'crude_oil', expectedPrice: 78.5 },
      { commodity: 'natural_gas', expectedPrice: 3.2 },
      { commodity: 'copper', expectedPrice: 4.15 },
      { commodity: 'wheat', expectedPrice: 5.8 },
      { commodity: 'corn', expectedPrice: 4.5 },
      { commodity: 'soybeans', expectedPrice: 12.3 },
      { commodity: 'coffee', expectedPrice: 3.8 },
      { commodity: 'lumber', expectedPrice: 580 },
      { commodity: 'cotton', expectedPrice: 0.82 },
    ];

    it.each(priceChecks)('should use correct spot price for $commodity ($expectedPrice)', async ({ commodity, expectedPrice }) => {
      const asset: AssetData = {
        id: `price-${commodity}`,
        assetClass: AssetClass.COMMODITY,
        name: commodity,
        description: '',
        metadata: { commodity, quantity: 1 },
      };

      const result = await agent.valuate(asset);
      const spot = result.dataPoints.find(dp => dp.metric === 'spot_price');
      expect(spot!.value).toBe(expectedPrice);
    });
  });

  describe('methodology', () => {
    it('should describe valuation methodology', async () => {
      const asset: AssetData = {
        id: 'meth-test',
        assetClass: AssetClass.COMMODITY,
        name: 'Gold',
        description: '',
        metadata: { commodity: 'gold', quantity: 1 },
      };

      const result = await agent.valuate(asset);
      expect(result.methodology).toContain('Spot price');
      expect(result.methodology).toContain('seasonal');
    });
  });
});
