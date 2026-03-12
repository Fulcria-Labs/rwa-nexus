import { PropertyAgent } from '../../src/agents/property-agent';
import { AssetClass, AssetData } from '../../src/types';

describe('PropertyAgent - Security & Injection', () => {
  let agent: PropertyAgent;

  beforeEach(() => {
    agent = new PropertyAgent();
  });

  describe('location input sanitization', () => {
    it('should handle location with SQL injection characters', async () => {
      const asset: AssetData = {
        id: 'sec-sql',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'SQL Test',
        description: '',
        location: "'; DROP TABLE properties; --",
        metadata: { squareFeet: 1000 },
      };
      const result = await agent.valuate(asset);
      expect(result.value).toBeGreaterThan(0);
    });

    it('should handle location with XSS script tags', async () => {
      const asset: AssetData = {
        id: 'sec-xss',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'XSS Test',
        description: '',
        location: '<script>alert("xss")</script>',
        metadata: { squareFeet: 1000 },
      };
      const result = await agent.valuate(asset);
      expect(result.value).toBeGreaterThan(0);
    });

    it('should handle location with null bytes', async () => {
      const asset: AssetData = {
        id: 'sec-null',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Null Byte Test',
        description: '',
        location: 'manhattan\x00malicious',
        metadata: { squareFeet: 1000 },
      };
      const result = await agent.valuate(asset);
      expect(result.value).toBeGreaterThan(0);
    });

    it('should handle location with unicode characters', async () => {
      const asset: AssetData = {
        id: 'sec-unicode',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Unicode Test',
        description: '',
        location: '\u0000\u200B\uFEFF',
        metadata: { squareFeet: 1000 },
      };
      const result = await agent.valuate(asset);
      expect(result.value).toBeGreaterThan(0);
    });

    it('should handle extremely long location string', async () => {
      const asset: AssetData = {
        id: 'sec-long',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Long Location',
        description: '',
        location: 'a'.repeat(10000),
        metadata: { squareFeet: 1000 },
      };
      const result = await agent.valuate(asset);
      expect(result.value).toBeGreaterThan(0);
    });

    it('should handle location with path traversal', async () => {
      const asset: AssetData = {
        id: 'sec-path',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Path Traversal',
        description: '',
        location: '../../../etc/passwd',
        metadata: { squareFeet: 1000 },
      };
      const result = await agent.valuate(asset);
      expect(result.value).toBeGreaterThan(0);
    });
  });

  describe('metadata input sanitization', () => {
    it('should handle negative squareFeet gracefully', async () => {
      const asset: AssetData = {
        id: 'sec-negsqft',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Negative SqFt',
        description: '',
        location: 'miami',
        metadata: { squareFeet: -1000 },
      };
      const result = await agent.valuate(asset);
      expect(typeof result.value).toBe('number');
    });

    it('should handle zero squareFeet gracefully', async () => {
      const asset: AssetData = {
        id: 'sec-zerosqft',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Zero SqFt',
        description: '',
        location: 'miami',
        metadata: { squareFeet: 0 },
      };
      const result = await agent.valuate(asset);
      expect(typeof result.value).toBe('number');
    });

    it('should handle Infinity squareFeet', async () => {
      const asset: AssetData = {
        id: 'sec-inf',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Infinite SqFt',
        description: '',
        location: 'miami',
        metadata: { squareFeet: Infinity },
      };
      const result = await agent.valuate(asset);
      expect(typeof result.value).toBe('number');
    });

    it('should handle NaN squareFeet', async () => {
      const asset: AssetData = {
        id: 'sec-nan',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'NaN SqFt',
        description: '',
        location: 'miami',
        metadata: { squareFeet: NaN },
      };
      const result = await agent.valuate(asset);
      expect(typeof result.value).toBe('number');
    });

    it('should handle negative annualRent', async () => {
      const asset: AssetData = {
        id: 'sec-negrent',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Negative Rent',
        description: '',
        location: 'miami',
        metadata: { squareFeet: 1000, annualRent: -50000 },
      };
      const result = await agent.valuate(asset);
      expect(typeof result.value).toBe('number');
    });

    it('should handle zero annualRent as no income approach', async () => {
      const asset: AssetData = {
        id: 'sec-zerorent',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Zero Rent',
        description: '',
        location: 'miami',
        metadata: { squareFeet: 1000, annualRent: 0 },
      };
      const result = await agent.valuate(asset);
      // annualRent=0 is falsy, so income approach not used
      expect(result.confidence).toBeLessThanOrEqual(0.7);
    });

    it('should handle very large yearBuilt in the future', async () => {
      const asset: AssetData = {
        id: 'sec-future',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Future Build',
        description: '',
        location: 'miami',
        metadata: { squareFeet: 1000, yearBuilt: 3000 },
      };
      const result = await agent.valuate(asset);
      expect(typeof result.value).toBe('number');
    });

    it('should handle yearBuilt of 0', async () => {
      const asset: AssetData = {
        id: 'sec-year0',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Year Zero',
        description: '',
        location: 'miami',
        metadata: { squareFeet: 1000, yearBuilt: 0 },
      };
      const result = await agent.valuate(asset);
      // yearBuilt=0 is falsy so no depreciation applied
      expect(typeof result.value).toBe('number');
    });

    it('should handle string values in numeric metadata fields', async () => {
      const asset: AssetData = {
        id: 'sec-strnum',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'String in Numeric',
        description: '',
        location: 'miami',
        metadata: { squareFeet: 'abc' as any },
      };
      const result = await agent.valuate(asset);
      expect(typeof result.value).toBe('number');
    });
  });

  describe('asset id edge cases', () => {
    it('should handle empty string asset id', async () => {
      const asset: AssetData = {
        id: '',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Empty ID',
        description: '',
        location: 'miami',
        metadata: { squareFeet: 1000 },
      };
      const result = await agent.valuate(asset);
      expect(result.assetId).toBe('');
    });

    it('should handle very long asset id', async () => {
      const longId = 'x'.repeat(10000);
      const asset: AssetData = {
        id: longId,
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Long ID',
        description: '',
        location: 'miami',
        metadata: { squareFeet: 1000 },
      };
      const result = await agent.valuate(asset);
      expect(result.assetId).toBe(longId);
    });

    it('should handle special characters in asset id', async () => {
      const asset: AssetData = {
        id: 'asset/with:special@chars!#$%',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Special ID',
        description: '',
        location: 'miami',
        metadata: { squareFeet: 1000 },
      };
      const result = await agent.valuate(asset);
      expect(result.assetId).toBe('asset/with:special@chars!#$%');
    });
  });

  describe('property type edge cases', () => {
    it('should handle residential propertyType', async () => {
      const asset: AssetData = {
        id: 'pt-res',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Residential',
        description: '',
        location: 'miami',
        metadata: { squareFeet: 1000, annualRent: 50000, propertyType: 'residential' },
      };
      const result = await agent.valuate(asset);
      const capDp = result.dataPoints.find(dp => dp.metric === 'cap_rate');
      expect(capDp).toBeDefined();
      expect(capDp!.value).toBe(0.05);
    });

    it('should handle commercial propertyType', async () => {
      const asset: AssetData = {
        id: 'pt-com',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Commercial',
        description: '',
        location: 'miami',
        metadata: { squareFeet: 1000, annualRent: 50000, propertyType: 'commercial' },
      };
      const result = await agent.valuate(asset);
      const capDp = result.dataPoints.find(dp => dp.metric === 'cap_rate');
      expect(capDp!.value).toBe(0.07);
    });

    it('should handle industrial propertyType', async () => {
      const asset: AssetData = {
        id: 'pt-ind',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Industrial',
        description: '',
        location: 'miami',
        metadata: { squareFeet: 1000, annualRent: 50000, propertyType: 'industrial' },
      };
      const result = await agent.valuate(asset);
      const capDp = result.dataPoints.find(dp => dp.metric === 'cap_rate');
      expect(capDp!.value).toBe(0.08);
    });

    it('should handle retail propertyType', async () => {
      const asset: AssetData = {
        id: 'pt-ret',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Retail',
        description: '',
        location: 'miami',
        metadata: { squareFeet: 1000, annualRent: 50000, propertyType: 'retail' },
      };
      const result = await agent.valuate(asset);
      const capDp = result.dataPoints.find(dp => dp.metric === 'cap_rate');
      expect(capDp!.value).toBe(0.065);
    });
  });

  describe('description and name edge cases', () => {
    it('should handle empty name', async () => {
      const asset: AssetData = {
        id: 'name-empty',
        assetClass: AssetClass.REAL_ESTATE,
        name: '',
        description: '',
        location: 'miami',
        metadata: { squareFeet: 1000 },
      };
      const result = await agent.valuate(asset);
      expect(result.value).toBeGreaterThan(0);
    });

    it('should handle very long description', async () => {
      const asset: AssetData = {
        id: 'desc-long',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Long Desc',
        description: 'x'.repeat(100000),
        location: 'miami',
        metadata: { squareFeet: 1000 },
      };
      const result = await agent.valuate(asset);
      expect(result.value).toBeGreaterThan(0);
    });
  });
});
