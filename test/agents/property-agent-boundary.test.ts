import { PropertyAgent } from '../../src/agents/property-agent';
import { AssetClass, AssetData } from '../../src/types';

describe('PropertyAgent - Boundary conditions', () => {
  let agent: PropertyAgent;

  beforeEach(() => {
    agent = new PropertyAgent();
  });

  describe('zero and negative edge cases', () => {
    it('should handle zero square footage gracefully', async () => {
      const asset: AssetData = {
        id: 'zero-sqft',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Zero SqFt',
        description: '',
        location: 'miami',
        metadata: { squareFeet: 0 },
      };

      const result = await agent.valuate(asset);
      // 0 sqft * price = 0 comparable, should fall to fallback
      expect(result.value).toBeDefined();
      expect(typeof result.value).toBe('number');
    });

    it('should handle zero annual rent (falsy) by not adding income data points', async () => {
      const asset: AssetData = {
        id: 'zero-rent',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Zero Rent',
        description: '',
        location: 'miami',
        metadata: { squareFeet: 1000, annualRent: 0 },
      };

      const result = await agent.valuate(asset);
      const rentDp = result.dataPoints.find(dp => dp.metric === 'annual_rent');
      // annualRent is 0, which is falsy, so income data points should NOT be added
      expect(rentDp).toBeUndefined();
    });

    it('should handle negative annual rent without throwing', async () => {
      const asset: AssetData = {
        id: 'neg-rent',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Negative Rent',
        description: '',
        location: 'miami',
        metadata: { squareFeet: 1000, annualRent: -50000 },
      };

      const result = await agent.valuate(asset);
      // Negative rent is truthy, so income approach is used
      expect(result.value).toBeDefined();
      expect(typeof result.value).toBe('number');
    });

    it('should handle very large square footage (1 million sqft)', async () => {
      const asset: AssetData = {
        id: 'huge-sqft',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Mega Property',
        description: '',
        location: 'manhattan',
        metadata: { squareFeet: 1000000 },
      };

      const result = await agent.valuate(asset);
      // 1M sqft * $1800/sqft = $1.8 billion
      expect(result.value).toBeGreaterThan(1_000_000_000);
    });

    it('should handle fractional square footage', async () => {
      const asset: AssetData = {
        id: 'frac-sqft',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Tiny Space',
        description: '',
        location: 'miami',
        metadata: { squareFeet: 0.5 },
      };

      const result = await agent.valuate(asset);
      expect(result.value).toBeGreaterThan(0);
      expect(result.value).toBeLessThan(1000);
    });
  });

  describe('yearBuilt edge cases', () => {
    it('should handle yearBuilt in the future', async () => {
      const asset: AssetData = {
        id: 'future-build',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Future Build',
        description: '',
        location: 'miami',
        metadata: { squareFeet: 1000, yearBuilt: 2099 },
      };

      const result = await agent.valuate(asset);
      // Future year means negative age, depreciation = 1 - (negative * 0.005) > 1
      // Math.max(0.5, > 1) = > 1, so depreciation factor is > 1
      expect(result.value).toBeGreaterThan(0);
    });

    it('should handle yearBuilt of 0 (falsy, skips depreciation)', async () => {
      const asset: AssetData = {
        id: 'ancient',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Ancient Property',
        description: '',
        location: 'miami',
        metadata: { squareFeet: 1000, yearBuilt: 0 },
      };

      const result = await agent.valuate(asset);
      // yearBuilt is 0, which is falsy, so the depreciation block is skipped
      const ageFactor = result.dataPoints.find(dp => dp.metric === 'age_factor');
      expect(ageFactor).toBeUndefined();
    });

    it('should cap depreciation at 50% for century-old buildings', async () => {
      const currentYear = new Date().getFullYear();
      const asset: AssetData = {
        id: 'century-old',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Century Building',
        description: '',
        location: 'miami',
        metadata: { squareFeet: 1000, yearBuilt: currentYear - 150 },
      };

      const result = await agent.valuate(asset);
      const ageFactor = result.dataPoints.find(dp => dp.metric === 'age_factor');
      expect(ageFactor).toBeDefined();
      // 150 years * 0.005 = 0.75, so 1 - 0.75 = 0.25, capped at 0.5
      expect(ageFactor!.value).toBe(0.5);
    });

    it('should not have depreciation when yearBuilt equals current year', async () => {
      const currentYear = new Date().getFullYear();
      const asset: AssetData = {
        id: 'brand-new',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Brand New',
        description: '',
        location: 'miami',
        metadata: { squareFeet: 1000, yearBuilt: currentYear },
      };

      const result = await agent.valuate(asset);
      const ageFactor = result.dataPoints.find(dp => dp.metric === 'age_factor');
      expect(ageFactor).toBeDefined();
      // Age = 0, depreciation = 1 - 0 = 1.0
      expect(ageFactor!.value).toBe(1);
    });
  });

  describe('property type cap rates', () => {
    it('should use residential cap rate (0.05)', async () => {
      const asset: AssetData = {
        id: 'cap-res',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Residential',
        description: '',
        location: 'miami',
        metadata: { squareFeet: 1000, annualRent: 60000, propertyType: 'residential' },
      };

      const result = await agent.valuate(asset);
      const capRate = result.dataPoints.find(dp => dp.metric === 'cap_rate');
      expect(capRate).toBeDefined();
      expect(capRate!.value).toBe(0.05);
    });

    it('should use commercial cap rate (0.07)', async () => {
      const asset: AssetData = {
        id: 'cap-com',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Commercial',
        description: '',
        location: 'miami',
        metadata: { squareFeet: 1000, annualRent: 60000, propertyType: 'commercial' },
      };

      const result = await agent.valuate(asset);
      const capRate = result.dataPoints.find(dp => dp.metric === 'cap_rate');
      expect(capRate).toBeDefined();
      expect(capRate!.value).toBe(0.07);
    });

    it('should use industrial cap rate (0.08)', async () => {
      const asset: AssetData = {
        id: 'cap-ind',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Industrial',
        description: '',
        location: 'miami',
        metadata: { squareFeet: 1000, annualRent: 60000, propertyType: 'industrial' },
      };

      const result = await agent.valuate(asset);
      const capRate = result.dataPoints.find(dp => dp.metric === 'cap_rate');
      expect(capRate).toBeDefined();
      expect(capRate!.value).toBe(0.08);
    });

    it('should use retail cap rate (0.065)', async () => {
      const asset: AssetData = {
        id: 'cap-retail',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Retail',
        description: '',
        location: 'miami',
        metadata: { squareFeet: 1000, annualRent: 60000, propertyType: 'retail' },
      };

      const result = await agent.valuate(asset);
      const capRate = result.dataPoints.find(dp => dp.metric === 'cap_rate');
      expect(capRate).toBeDefined();
      expect(capRate!.value).toBe(0.065);
    });

    it('should use default cap rate (0.06) for unknown property type', async () => {
      const asset: AssetData = {
        id: 'cap-unk',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Unknown Type',
        description: '',
        location: 'miami',
        metadata: { squareFeet: 1000, annualRent: 60000, propertyType: 'data_center' },
      };

      const result = await agent.valuate(asset);
      const capRate = result.dataPoints.find(dp => dp.metric === 'cap_rate');
      expect(capRate).toBeDefined();
      expect(capRate!.value).toBe(0.06);
    });
  });

  describe('confidence reduction for minimal data', () => {
    it('should reduce confidence when fewer than 4 data points', async () => {
      // Minimal asset: no location (defaults), no sqft (defaults to 1000),
      // no rent, no yearBuilt, no condition data specified
      // Data points: price_per_sqft, square_feet, condition_factor = 3 data points
      const asset: AssetData = {
        id: 'minimal-dp',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Minimal',
        description: '',
        metadata: {},
      };

      const result = await agent.valuate(asset);
      // With only 3 data points, confidence should be reduced
      // Base confidence 0.7 (comparable only) * 0.8 = 0.56
      expect(result.confidence).toBeLessThanOrEqual(0.7);
    });

    it('should not reduce confidence when 4+ data points are present', async () => {
      const asset: AssetData = {
        id: 'full-dp',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Full Data',
        description: '',
        location: 'miami',
        metadata: {
          squareFeet: 1000,
          annualRent: 60000,
          propertyType: 'residential',
          yearBuilt: 2020,
          condition: 'good',
        },
      };

      const result = await agent.valuate(asset);
      // With rental data + yearBuilt, should have 5-6 data points
      expect(result.dataPoints.length).toBeGreaterThanOrEqual(4);
      // Confidence should be 0.85 (both approaches) without the 0.8 penalty
      expect(result.confidence).toBe(0.85);
    });
  });

  describe('location case normalization', () => {
    it('should normalize uppercase location to lowercase', async () => {
      const upper: AssetData = {
        id: 'upper-loc',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Upper',
        description: '',
        location: 'MANHATTAN',
        metadata: { squareFeet: 1000 },
      };

      const lower: AssetData = {
        id: 'lower-loc',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Lower',
        description: '',
        location: 'manhattan',
        metadata: { squareFeet: 1000 },
      };

      const upperResult = await agent.valuate(upper);
      const lowerResult = await agent.valuate(lower);

      expect(upperResult.value).toBe(lowerResult.value);
    });

    it('should normalize mixed-case location', async () => {
      const mixed: AssetData = {
        id: 'mixed-loc',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Mixed',
        description: '',
        location: 'Manhattan',
        metadata: { squareFeet: 1000 },
      };

      const lower: AssetData = {
        id: 'lower-loc2',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Lower',
        description: '',
        location: 'manhattan',
        metadata: { squareFeet: 1000 },
      };

      const mixedResult = await agent.valuate(mixed);
      const lowerResult = await agent.valuate(lower);

      expect(mixedResult.value).toBe(lowerResult.value);
    });

    it('should replace spaces with underscores in location', async () => {
      // 'hong kong' becomes 'hong_kong' which matches the lookup
      const withSpace: AssetData = {
        id: 'space-loc',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Hong Kong Space',
        description: '',
        location: 'hong kong',
        metadata: { squareFeet: 500 },
      };

      const withUnderscore: AssetData = {
        id: 'underscore-loc',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Hong Kong Underscore',
        description: '',
        location: 'hong_kong',
        metadata: { squareFeet: 500 },
      };

      const spaceResult = await agent.valuate(withSpace);
      const underscoreResult = await agent.valuate(withUnderscore);

      expect(spaceResult.value).toBe(underscoreResult.value);
    });
  });

  describe('valuation approach selection', () => {
    it('should use only comparable approach when no rental data', async () => {
      const asset: AssetData = {
        id: 'comp-only',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Comparable Only',
        description: '',
        location: 'miami',
        metadata: { squareFeet: 1000 },
      };

      const result = await agent.valuate(asset);
      // With comparable only (3 data points < 4), confidence is 0.7 * 0.8 = 0.56
      expect(result.confidence).toBeCloseTo(0.56, 10);
    });

    it('should blend both approaches when rental data is present', async () => {
      const asset: AssetData = {
        id: 'blended',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Blended',
        description: '',
        location: 'miami',
        metadata: { squareFeet: 1000, annualRent: 60000 },
      };

      const result = await agent.valuate(asset);
      // Both approaches: confidence is 0.85
      expect(result.confidence).toBe(0.85);
    });
  });

  describe('data point weights', () => {
    it('should have correct weight for comparable sales data point', async () => {
      const asset: AssetData = {
        id: 'w-comp',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Test',
        description: '',
        location: 'miami',
        metadata: { squareFeet: 1000 },
      };

      const result = await agent.valuate(asset);
      const comp = result.dataPoints.find(dp => dp.metric === 'price_per_sqft');
      expect(comp!.weight).toBe(0.4);
    });

    it('should have correct weight for square feet data point', async () => {
      const asset: AssetData = {
        id: 'w-sqft',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Test',
        description: '',
        location: 'miami',
        metadata: { squareFeet: 1000 },
      };

      const result = await agent.valuate(asset);
      const sqft = result.dataPoints.find(dp => dp.metric === 'square_feet');
      expect(sqft!.weight).toBe(0.3);
    });

    it('should have correct weight for annual rent data point', async () => {
      const asset: AssetData = {
        id: 'w-rent',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Test',
        description: '',
        location: 'miami',
        metadata: { squareFeet: 1000, annualRent: 50000 },
      };

      const result = await agent.valuate(asset);
      const rent = result.dataPoints.find(dp => dp.metric === 'annual_rent');
      expect(rent!.weight).toBe(0.3);
    });

    it('should have correct weight for condition factor data point', async () => {
      const asset: AssetData = {
        id: 'w-cond',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Test',
        description: '',
        location: 'miami',
        metadata: { squareFeet: 1000 },
      };

      const result = await agent.valuate(asset);
      const cond = result.dataPoints.find(dp => dp.metric === 'condition_factor');
      expect(cond!.weight).toBe(0.1);
    });

    it('should have correct weight for age factor data point', async () => {
      const asset: AssetData = {
        id: 'w-age',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Test',
        description: '',
        location: 'miami',
        metadata: { squareFeet: 1000, yearBuilt: 2000 },
      };

      const result = await agent.valuate(asset);
      const age = result.dataPoints.find(dp => dp.metric === 'age_factor');
      expect(age!.weight).toBe(0.1);
    });
  });

  describe('specific price per sqft values', () => {
    const priceTests = [
      { location: 'manhattan', expected: 1800 },
      { location: 'brooklyn', expected: 950 },
      { location: 'san_francisco', expected: 1200 },
      { location: 'los_angeles', expected: 750 },
      { location: 'miami', expected: 600 },
      { location: 'chicago', expected: 350 },
      { location: 'austin', expected: 400 },
      { location: 'seattle', expected: 650 },
      { location: 'hong_kong', expected: 2500 },
      { location: 'singapore', expected: 1900 },
      { location: 'london', expected: 1600 },
    ];

    it.each(priceTests)('should use $expected/sqft for $location', async ({ location, expected }) => {
      const asset: AssetData = {
        id: `price-${location}`,
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Test',
        description: '',
        location,
        metadata: { squareFeet: 100 },
      };

      const result = await agent.valuate(asset);
      const priceDp = result.dataPoints.find(dp => dp.metric === 'price_per_sqft');
      expect(priceDp!.value).toBe(expected);
    });

    it('should use default price (300) for unknown location', async () => {
      const asset: AssetData = {
        id: 'price-default',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Test',
        description: '',
        location: 'timbuktu',
        metadata: { squareFeet: 100 },
      };

      const result = await agent.valuate(asset);
      const priceDp = result.dataPoints.find(dp => dp.metric === 'price_per_sqft');
      expect(priceDp!.value).toBe(300);
    });
  });

  describe('condition factor values', () => {
    const conditionTests = [
      { condition: 'excellent', expected: 1.15 },
      { condition: 'good', expected: 1.0 },
      { condition: 'fair', expected: 0.85 },
      { condition: 'poor', expected: 0.7 },
    ];

    it.each(conditionTests)('should use factor $expected for $condition condition', async ({ condition, expected }) => {
      const asset: AssetData = {
        id: `cond-${condition}`,
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Test',
        description: '',
        location: 'miami',
        metadata: { squareFeet: 1000, condition },
      };

      const result = await agent.valuate(asset);
      const condDp = result.dataPoints.find(dp => dp.metric === 'condition_factor');
      expect(condDp!.value).toBe(expected);
    });
  });

  describe('data point source labels', () => {
    it('should label comparable sales source correctly', async () => {
      const asset: AssetData = {
        id: 'src-comp',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Test',
        description: '',
        location: 'miami',
        metadata: { squareFeet: 1000 },
      };

      const result = await agent.valuate(asset);
      const comp = result.dataPoints.find(dp => dp.metric === 'price_per_sqft');
      expect(comp!.source).toBe('comparable_sales');
    });

    it('should label property data source correctly', async () => {
      const asset: AssetData = {
        id: 'src-prop',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Test',
        description: '',
        location: 'miami',
        metadata: { squareFeet: 1000 },
      };

      const result = await agent.valuate(asset);
      const sqft = result.dataPoints.find(dp => dp.metric === 'square_feet');
      expect(sqft!.source).toBe('property_data');
    });

    it('should label income approach source correctly', async () => {
      const asset: AssetData = {
        id: 'src-income',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Test',
        description: '',
        location: 'miami',
        metadata: { squareFeet: 1000, annualRent: 50000 },
      };

      const result = await agent.valuate(asset);
      const rent = result.dataPoints.find(dp => dp.metric === 'annual_rent');
      expect(rent!.source).toBe('income_approach');
    });

    it('should label cap rate source correctly', async () => {
      const asset: AssetData = {
        id: 'src-cap',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Test',
        description: '',
        location: 'miami',
        metadata: { squareFeet: 1000, annualRent: 50000 },
      };

      const result = await agent.valuate(asset);
      const capRate = result.dataPoints.find(dp => dp.metric === 'cap_rate');
      expect(capRate!.source).toBe('market_data');
    });

    it('should label inspection source correctly', async () => {
      const asset: AssetData = {
        id: 'src-insp',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Test',
        description: '',
        location: 'miami',
        metadata: { squareFeet: 1000 },
      };

      const result = await agent.valuate(asset);
      const cond = result.dataPoints.find(dp => dp.metric === 'condition_factor');
      expect(cond!.source).toBe('inspection');
    });

    it('should label depreciation source correctly', async () => {
      const asset: AssetData = {
        id: 'src-dep',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Test',
        description: '',
        location: 'miami',
        metadata: { squareFeet: 1000, yearBuilt: 2000 },
      };

      const result = await agent.valuate(asset);
      const age = result.dataPoints.find(dp => dp.metric === 'age_factor');
      expect(age!.source).toBe('depreciation');
    });
  });
});
