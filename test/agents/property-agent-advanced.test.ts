import { PropertyAgent } from '../../src/agents/property-agent';
import { AssetClass, AssetData } from '../../src/types';

describe('PropertyAgent - Advanced', () => {
  let agent: PropertyAgent;

  beforeEach(() => {
    agent = new PropertyAgent();
  });

  describe('location pricing', () => {
    const locations = [
      { name: 'manhattan', minPrice: 1500000 },
      { name: 'brooklyn', minPrice: 800000 },
      { name: 'san_francisco', minPrice: 1000000 },
      { name: 'los_angeles', minPrice: 600000 },
      { name: 'miami', minPrice: 450000 },
      { name: 'chicago', minPrice: 250000 },
      { name: 'austin', minPrice: 300000 },
      { name: 'seattle', minPrice: 500000 },
      { name: 'hong_kong', minPrice: 1000000 },
      { name: 'singapore', minPrice: 1500000 },
      { name: 'london', minPrice: 1200000 },
    ];

    it.each(locations)('should valuate $name correctly above $minPrice', async ({ name, minPrice }) => {
      const asset: AssetData = {
        id: `loc-${name}`,
        assetClass: AssetClass.REAL_ESTATE,
        name: `${name} property`,
        description: '',
        location: name,
        metadata: { squareFeet: 1000 },
      };

      const result = await agent.valuate(asset);
      expect(result.value).toBeGreaterThan(minPrice);
    });

    it('should handle location with spaces', async () => {
      const asset: AssetData = {
        id: 'loc-space',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Spaced Location',
        description: '',
        location: 'new york', // should become new_york -> default
        metadata: { squareFeet: 1000 },
      };

      const result = await agent.valuate(asset);
      expect(result.value).toBeGreaterThan(0);
    });

    it('should handle empty location string', async () => {
      const asset: AssetData = {
        id: 'loc-empty',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'No Location',
        description: '',
        location: '',
        metadata: { squareFeet: 1000 },
      };

      const result = await agent.valuate(asset);
      expect(result.value).toBeGreaterThan(0); // Uses default
    });

    it('should handle undefined location', async () => {
      const asset: AssetData = {
        id: 'loc-undef',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'No Location',
        description: '',
        metadata: { squareFeet: 1000 },
      };

      const result = await agent.valuate(asset);
      expect(result.value).toBeGreaterThan(0);
    });
  });

  describe('condition factors', () => {
    it('should rank conditions excellent > good > fair > poor', async () => {
      const conditions = ['excellent', 'good', 'fair', 'poor'];
      const values: number[] = [];

      for (const condition of conditions) {
        const asset: AssetData = {
          id: `cond-${condition}`,
          assetClass: AssetClass.REAL_ESTATE,
          name: `${condition} property`,
          description: '',
          location: 'miami',
          metadata: { squareFeet: 2000, condition },
        };
        const result = await agent.valuate(asset);
        values.push(result.value);
      }

      for (let i = 0; i < values.length - 1; i++) {
        expect(values[i]).toBeGreaterThan(values[i + 1]);
      }
    });

    it('should default to good condition when unspecified', async () => {
      const withGood: AssetData = {
        id: 'cond-g',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Good',
        description: '',
        location: 'miami',
        metadata: { squareFeet: 2000, condition: 'good' },
      };

      const noCondition: AssetData = {
        id: 'cond-none',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Default',
        description: '',
        location: 'miami',
        metadata: { squareFeet: 2000 },
      };

      const goodResult = await agent.valuate(withGood);
      const defaultResult = await agent.valuate(noCondition);

      expect(goodResult.value).toBe(defaultResult.value);
    });

    it('should default to 1.0 for unknown condition', async () => {
      const asset: AssetData = {
        id: 'cond-unknown',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Unknown Condition',
        description: '',
        location: 'miami',
        metadata: { squareFeet: 2000, condition: 'unknown_state' },
      };

      const defaultAsset: AssetData = {
        id: 'cond-def',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Good Condition',
        description: '',
        location: 'miami',
        metadata: { squareFeet: 2000, condition: 'good' },
      };

      const unknownResult = await agent.valuate(asset);
      const defaultResult = await agent.valuate(defaultAsset);

      // Unknown condition factor is 1.0, same as 'good'
      expect(unknownResult.value).toBe(defaultResult.value);
    });
  });

  describe('depreciation', () => {
    it('should depreciate at 0.5% per year', async () => {
      const currentYear = new Date().getFullYear();
      const asset10yr: AssetData = {
        id: 'dep-10',
        assetClass: AssetClass.REAL_ESTATE,
        name: '10yr old',
        description: '',
        location: 'austin',
        metadata: { squareFeet: 2000, yearBuilt: currentYear - 10 },
      };

      const assetNew: AssetData = {
        id: 'dep-new',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'New',
        description: '',
        location: 'austin',
        metadata: { squareFeet: 2000, yearBuilt: currentYear },
      };

      const old = await agent.valuate(asset10yr);
      const fresh = await agent.valuate(assetNew);

      // 10 years * 0.5% = 5% depreciation, so old should be ~95% of new
      const ratio = old.value / fresh.value;
      expect(ratio).toBeGreaterThan(0.93);
      expect(ratio).toBeLessThan(0.97);
    });

    it('should cap depreciation at 50%', async () => {
      const currentYear = new Date().getFullYear();
      const veryOld: AssetData = {
        id: 'dep-old',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Very Old',
        description: '',
        location: 'austin',
        metadata: { squareFeet: 2000, yearBuilt: currentYear - 200 },
      };

      const fresh: AssetData = {
        id: 'dep-fresh',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Fresh',
        description: '',
        location: 'austin',
        metadata: { squareFeet: 2000, yearBuilt: currentYear },
      };

      const oldResult = await agent.valuate(veryOld);
      const freshResult = await agent.valuate(fresh);

      // Floor is 50%
      const ratio = oldResult.value / freshResult.value;
      expect(ratio).toBeGreaterThanOrEqual(0.49);
      expect(ratio).toBeLessThanOrEqual(0.51);
    });

    it('should not apply depreciation without yearBuilt', async () => {
      const withYear: AssetData = {
        id: 'dep-wy',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'With Year',
        description: '',
        location: 'austin',
        metadata: { squareFeet: 2000, yearBuilt: new Date().getFullYear() },
      };

      const withoutYear: AssetData = {
        id: 'dep-ny',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Without Year',
        description: '',
        location: 'austin',
        metadata: { squareFeet: 2000 },
      };

      const withResult = await agent.valuate(withYear);
      const withoutResult = await agent.valuate(withoutYear);

      // Both should be similar (yearBuilt=currentYear means 0% depreciation)
      expect(Math.abs(withResult.value - withoutResult.value)).toBeLessThan(1);
    });
  });

  describe('income approach', () => {
    it('should blend sales and income approaches at 60/40', async () => {
      const asset: AssetData = {
        id: 'blend-test',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Blended',
        description: '',
        location: 'miami', // $600/sqft
        metadata: {
          squareFeet: 1000,
          annualRent: 60000,
          propertyType: 'residential', // cap rate 0.05
        },
      };

      const result = await agent.valuate(asset);

      // Comparable: $600 * 1000 = $600,000
      // Income: $60,000 / 0.05 = $1,200,000
      // Blend: $600,000 * 0.6 + $1,200,000 * 0.4 = $840,000
      expect(result.value).toBeGreaterThan(800000);
      expect(result.value).toBeLessThan(900000);
    });

    it('should use different cap rates for property types', async () => {
      const makeAsset = (type: string): AssetData => ({
        id: `cap-${type}`,
        assetClass: AssetClass.REAL_ESTATE,
        name: type,
        description: '',
        location: 'miami',
        metadata: { squareFeet: 1000, annualRent: 100000, propertyType: type },
      });

      const residential = await agent.valuate(makeAsset('residential'));
      const industrial = await agent.valuate(makeAsset('industrial'));

      // Lower cap rate (residential 5%) => higher income value => higher overall
      expect(residential.value).toBeGreaterThan(industrial.value);
    });

    it('should default cap rate for unknown property type', async () => {
      const asset: AssetData = {
        id: 'cap-default',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Unknown Type',
        description: '',
        location: 'miami',
        metadata: { squareFeet: 1000, annualRent: 100000, propertyType: 'warehouse' },
      };

      const result = await agent.valuate(asset);
      // Default cap rate is 0.06, income = 100000/0.06 ≈ 1,666,667
      expect(result.value).toBeGreaterThan(0);
    });

    it('should have higher confidence with both approaches', async () => {
      const withIncome: AssetData = {
        id: 'conf-income',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'With Income',
        description: '',
        location: 'miami',
        metadata: { squareFeet: 1000, annualRent: 50000 },
      };

      const withoutIncome: AssetData = {
        id: 'conf-no-income',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Without Income',
        description: '',
        location: 'miami',
        metadata: { squareFeet: 1000 },
      };

      const incomeResult = await agent.valuate(withIncome);
      const noIncomeResult = await agent.valuate(withoutIncome);

      expect(incomeResult.confidence).toBeGreaterThan(noIncomeResult.confidence);
    });
  });

  describe('square footage edge cases', () => {
    it('should default sqft to 1000 when missing', async () => {
      const withSqft: AssetData = {
        id: 'sqft-1000',
        assetClass: AssetClass.REAL_ESTATE,
        name: '1000sqft',
        description: '',
        location: 'miami',
        metadata: { squareFeet: 1000 },
      };

      const noSqft: AssetData = {
        id: 'sqft-none',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'no sqft',
        description: '',
        location: 'miami',
        metadata: {},
      };

      const withResult = await agent.valuate(withSqft);
      const noResult = await agent.valuate(noSqft);

      expect(withResult.value).toBe(noResult.value);
    });

    it('should handle very large square footage', async () => {
      const asset: AssetData = {
        id: 'sqft-large',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Large Property',
        description: '',
        location: 'manhattan',
        metadata: { squareFeet: 100000 },
      };

      const result = await agent.valuate(asset);
      // $1800/sqft * 100000 = $180M
      expect(result.value).toBeGreaterThan(100000000);
    });

    it('should handle very small square footage', async () => {
      const asset: AssetData = {
        id: 'sqft-small',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Tiny Property',
        description: '',
        location: 'miami',
        metadata: { squareFeet: 1 },
      };

      const result = await agent.valuate(asset);
      expect(result.value).toBeGreaterThan(0);
      expect(result.value).toBeLessThan(5000);
    });
  });

  describe('data points', () => {
    it('should include price_per_sqft data point', async () => {
      const asset: AssetData = {
        id: 'dp-test',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Test',
        description: '',
        location: 'manhattan',
        metadata: { squareFeet: 1000 },
      };

      const result = await agent.valuate(asset);
      const priceDp = result.dataPoints.find(dp => dp.metric === 'price_per_sqft');
      expect(priceDp).toBeDefined();
      expect(priceDp!.value).toBe(1800);
      expect(priceDp!.source).toBe('comparable_sales');
    });

    it('should include condition_factor data point', async () => {
      const asset: AssetData = {
        id: 'dp-cond',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Test',
        description: '',
        location: 'miami',
        metadata: { squareFeet: 1000, condition: 'excellent' },
      };

      const result = await agent.valuate(asset);
      const condDp = result.dataPoints.find(dp => dp.metric === 'condition_factor');
      expect(condDp).toBeDefined();
      expect(condDp!.value).toBe(1.15);
    });

    it('should include age_factor data point when yearBuilt provided', async () => {
      const asset: AssetData = {
        id: 'dp-age',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Test',
        description: '',
        location: 'miami',
        metadata: { squareFeet: 1000, yearBuilt: 2000 },
      };

      const result = await agent.valuate(asset);
      const ageDp = result.dataPoints.find(dp => dp.metric === 'age_factor');
      expect(ageDp).toBeDefined();
      expect(ageDp!.source).toBe('depreciation');
    });
  });

  describe('methodology', () => {
    it('should return blended methodology string', async () => {
      const asset: AssetData = {
        id: 'meth-test',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Test',
        description: '',
        location: 'miami',
        metadata: { squareFeet: 1000 },
      };

      const result = await agent.valuate(asset);
      expect(result.methodology).toContain('comparable sales');
      expect(result.methodology).toContain('income capitalization');
    });
  });

  describe('rounding', () => {
    it('should round value to 2 decimal places', async () => {
      const asset: AssetData = {
        id: 'round-test',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Test',
        description: '',
        location: 'miami',
        metadata: { squareFeet: 1333, condition: 'fair' },
      };

      const result = await agent.valuate(asset);
      const decimalPart = result.value.toString().split('.')[1];
      if (decimalPart) {
        expect(decimalPart.length).toBeLessThanOrEqual(2);
      }
    });
  });
});
