import { PropertyAgent } from '../../src/agents/property-agent';
import { AssetClass, AssetData } from '../../src/types';

describe('PropertyAgent', () => {
  let agent: PropertyAgent;

  beforeEach(() => {
    agent = new PropertyAgent();
  });

  describe('configuration', () => {
    it('should have correct agent ID', () => {
      expect(agent.config.id).toBe('property-agent');
    });

    it('should handle real_estate asset class', () => {
      expect(agent.canValuate(AssetClass.REAL_ESTATE)).toBe(true);
    });

    it('should not handle commodity asset class', () => {
      expect(agent.canValuate(AssetClass.COMMODITY)).toBe(false);
    });

    it('should not handle treasury asset class', () => {
      expect(agent.canValuate(AssetClass.TREASURY)).toBe(false);
    });
  });

  describe('valuation', () => {
    it('should valuate a Manhattan property', async () => {
      const asset: AssetData = {
        id: 'prop-001',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Manhattan Apartment',
        description: '2BR in Upper East Side',
        location: 'manhattan',
        metadata: { squareFeet: 1200, condition: 'good' },
      };

      const result = await agent.valuate(asset);

      expect(result.assetId).toBe('prop-001');
      expect(result.agentId).toBe('property-agent');
      expect(result.value).toBeGreaterThan(1000000); // Manhattan + 1200sqft
      expect(result.confidence).toBeGreaterThan(0.5);
      expect(result.confidence).toBeLessThanOrEqual(1);
      expect(result.methodology).toContain('comparable sales');
      expect(result.dataPoints.length).toBeGreaterThan(0);
    });

    it('should valuate with rental income for higher confidence', async () => {
      const asset: AssetData = {
        id: 'prop-002',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Commercial Building',
        description: 'Retail space in Chicago',
        location: 'chicago',
        metadata: {
          squareFeet: 5000,
          annualRent: 150000,
          propertyType: 'commercial',
          condition: 'excellent',
        },
      };

      const result = await agent.valuate(asset);

      expect(result.value).toBeGreaterThan(1000000);
      expect(result.confidence).toBe(0.85); // Both approaches available
      expect(result.dataPoints.some(dp => dp.metric === 'annual_rent')).toBe(true);
      expect(result.dataPoints.some(dp => dp.metric === 'cap_rate')).toBe(true);
    });

    it('should apply condition factor', async () => {
      const excellent: AssetData = {
        id: 'prop-ex',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Excellent Property',
        description: '',
        location: 'austin',
        metadata: { squareFeet: 2000, condition: 'excellent' },
      };

      const poor: AssetData = {
        id: 'prop-poor',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Poor Property',
        description: '',
        location: 'austin',
        metadata: { squareFeet: 2000, condition: 'poor' },
      };

      const exResult = await agent.valuate(excellent);
      const poorResult = await agent.valuate(poor);

      expect(exResult.value).toBeGreaterThan(poorResult.value);
    });

    it('should apply age depreciation', async () => {
      const newBuild: AssetData = {
        id: 'prop-new',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'New Build',
        description: '',
        location: 'miami',
        metadata: { squareFeet: 1500, yearBuilt: 2024 },
      };

      const oldBuild: AssetData = {
        id: 'prop-old',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Old Build',
        description: '',
        location: 'miami',
        metadata: { squareFeet: 1500, yearBuilt: 1960 },
      };

      const newResult = await agent.valuate(newBuild);
      const oldResult = await agent.valuate(oldBuild);

      expect(newResult.value).toBeGreaterThan(oldResult.value);
    });

    it('should use default price for unknown locations', async () => {
      const asset: AssetData = {
        id: 'prop-unknown',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Rural Property',
        description: '',
        location: 'rural_montana',
        metadata: { squareFeet: 3000 },
      };

      const result = await agent.valuate(asset);
      expect(result.value).toBeGreaterThan(0);
      expect(result.value).toBeLessThan(2000000); // Default price is low
    });

    it('should reject non-real-estate assets', async () => {
      const asset: AssetData = {
        id: 'gold-001',
        assetClass: AssetClass.COMMODITY,
        name: 'Gold Bars',
        description: '',
        metadata: {},
      };

      await expect(agent.valuate(asset)).rejects.toThrow('cannot valuate');
    });

    it('should include timestamp in result', async () => {
      const asset: AssetData = {
        id: 'prop-ts',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Test',
        description: '',
        location: 'seattle',
        metadata: { squareFeet: 1000 },
      };

      const before = new Date();
      const result = await agent.valuate(asset);
      const after = new Date();

      expect(result.timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(result.timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('should handle missing metadata gracefully', async () => {
      const asset: AssetData = {
        id: 'prop-min',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Minimal Property',
        description: '',
        metadata: {},
      };

      const result = await agent.valuate(asset);
      expect(result.value).toBeGreaterThan(0);
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('should valuate Hong Kong property at high price', async () => {
      const asset: AssetData = {
        id: 'prop-hk',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'HK Flat',
        description: '',
        location: 'hong_kong',
        metadata: { squareFeet: 500 },
      };

      const result = await agent.valuate(asset);
      // Hong Kong is $2500/sqft * 500 = $1.25M base
      expect(result.value).toBeGreaterThan(1000000);
    });
  });
});
