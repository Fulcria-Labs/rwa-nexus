import { PropertyAgent } from '../../src/agents/property-agent';
import { CommodityAgent } from '../../src/agents/commodity-agent';
import { TreasuryAgent } from '../../src/agents/treasury-agent';
import { AssetClass, AssetData } from '../../src/types';

describe('PropertyAgent - valuation scenarios', () => {
  const agent = new PropertyAgent();

  describe('canValuate', () => {
    it('can valuate real estate', () => {
      expect(agent.canValuate(AssetClass.REAL_ESTATE)).toBe(true);
    });

    it('cannot valuate commodities', () => {
      expect(agent.canValuate(AssetClass.COMMODITY)).toBe(false);
    });

    it('cannot valuate treasury', () => {
      expect(agent.canValuate(AssetClass.TREASURY)).toBe(false);
    });
  });

  describe('config', () => {
    it('has correct id', () => {
      expect(agent.config.id).toBe('property-agent');
    });

    it('has correct asset classes', () => {
      expect(agent.config.assetClasses).toEqual([AssetClass.REAL_ESTATE]);
    });
  });

  describe('location-based pricing', () => {
    const locations = [
      { location: 'manhattan', minValue: 1_500_000 },
      { location: 'brooklyn', minValue: 800_000 },
      { location: 'chicago', minValue: 250_000 },
      { location: 'hong_kong', minValue: 2_000_000 },
    ];

    for (const { location, minValue } of locations) {
      it(`values ${location} property above ${minValue.toLocaleString()}`, async () => {
        const asset: AssetData = {
          id: `prop-${location}`,
          assetClass: AssetClass.REAL_ESTATE,
          name: `Property in ${location}`,
          description: '',
          location,
          metadata: { squareFeet: 1000 },
        };
        const result = await agent.valuate(asset);
        expect(result.value).toBeGreaterThan(minValue);
      });
    }

    it('uses default pricing for unknown location', async () => {
      const asset: AssetData = {
        id: 'prop-unknown',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Property',
        description: '',
        location: 'unknown_city',
        metadata: { squareFeet: 1000 },
      };
      const result = await agent.valuate(asset);
      expect(result.value).toBeGreaterThan(0);
      // Default $300/sqft * 1000 sqft = $300K base
      expect(result.value).toBeLessThan(500_000);
    });
  });

  describe('condition adjustments', () => {
    it('excellent condition increases value', async () => {
      const excellent = await agent.valuate({
        id: 'p1', assetClass: AssetClass.REAL_ESTATE, name: '', description: '',
        location: 'manhattan', metadata: { squareFeet: 1000, condition: 'excellent' },
      });
      const good = await agent.valuate({
        id: 'p2', assetClass: AssetClass.REAL_ESTATE, name: '', description: '',
        location: 'manhattan', metadata: { squareFeet: 1000, condition: 'good' },
      });
      expect(excellent.value).toBeGreaterThan(good.value);
    });

    it('poor condition decreases value', async () => {
      const poor = await agent.valuate({
        id: 'p1', assetClass: AssetClass.REAL_ESTATE, name: '', description: '',
        location: 'manhattan', metadata: { squareFeet: 1000, condition: 'poor' },
      });
      const good = await agent.valuate({
        id: 'p2', assetClass: AssetClass.REAL_ESTATE, name: '', description: '',
        location: 'manhattan', metadata: { squareFeet: 1000, condition: 'good' },
      });
      expect(poor.value).toBeLessThan(good.value);
    });
  });

  describe('income approach', () => {
    it('blends income and comparable approaches', async () => {
      const withRent = await agent.valuate({
        id: 'p1', assetClass: AssetClass.REAL_ESTATE, name: '', description: '',
        location: 'manhattan', metadata: { squareFeet: 1000, annualRent: 100000 },
      });
      expect(withRent.confidence).toBeGreaterThanOrEqual(0.85);
    });

    it('has lower confidence without income data', async () => {
      const noRent = await agent.valuate({
        id: 'p1', assetClass: AssetClass.REAL_ESTATE, name: '', description: '',
        location: 'manhattan', metadata: { squareFeet: 1000 },
      });
      expect(noRent.confidence).toBeLessThanOrEqual(0.7);
    });
  });

  describe('square footage scaling', () => {
    it('larger property has higher value', async () => {
      const small = await agent.valuate({
        id: 'p1', assetClass: AssetClass.REAL_ESTATE, name: '', description: '',
        location: 'manhattan', metadata: { squareFeet: 500 },
      });
      const large = await agent.valuate({
        id: 'p2', assetClass: AssetClass.REAL_ESTATE, name: '', description: '',
        location: 'manhattan', metadata: { squareFeet: 5000 },
      });
      expect(large.value).toBeGreaterThan(small.value);
    });
  });

  describe('throws for wrong asset class', () => {
    it('throws when valuating commodity', async () => {
      const asset: AssetData = {
        id: 'c1', assetClass: AssetClass.COMMODITY, name: '', description: '',
        metadata: {},
      };
      await expect(agent.valuate(asset)).rejects.toThrow('cannot valuate');
    });
  });
});

describe('CommodityAgent - valuation scenarios', () => {
  const agent = new CommodityAgent();

  describe('canValuate', () => {
    it('can valuate commodities', () => {
      expect(agent.canValuate(AssetClass.COMMODITY)).toBe(true);
    });

    it('cannot valuate real estate', () => {
      expect(agent.canValuate(AssetClass.REAL_ESTATE)).toBe(false);
    });
  });

  describe('config', () => {
    it('has correct id', () => {
      expect(agent.config.id).toBe('commodity-agent');
    });
  });

  describe('commodity pricing', () => {
    const commodities = [
      { commodity: 'gold', quantity: 10, minValue: 20_000 },
      { commodity: 'silver', quantity: 100, minValue: 2_000 },
      { commodity: 'crude_oil', quantity: 100, minValue: 5_000 },
      { commodity: 'wheat', quantity: 1000, minValue: 4_000 },
    ];

    for (const { commodity, quantity, minValue } of commodities) {
      it(`values ${quantity} units of ${commodity} above $${minValue.toLocaleString()}`, async () => {
        const asset: AssetData = {
          id: `comm-${commodity}`,
          assetClass: AssetClass.COMMODITY,
          name: commodity,
          description: '',
          metadata: { commodity, quantity },
        };
        const result = await agent.valuate(asset);
        expect(result.value).toBeGreaterThan(minValue);
      });
    }
  });

  describe('grade adjustments', () => {
    it('premium grade increases value', async () => {
      const premium = await agent.valuate({
        id: 'c1', assetClass: AssetClass.COMMODITY, name: '', description: '',
        metadata: { commodity: 'gold', quantity: 10, grade: 'premium' },
      });
      const standard = await agent.valuate({
        id: 'c2', assetClass: AssetClass.COMMODITY, name: '', description: '',
        metadata: { commodity: 'gold', quantity: 10, grade: 'standard' },
      });
      expect(premium.value).toBeGreaterThan(standard.value);
    });

    it('substandard grade decreases value', async () => {
      const sub = await agent.valuate({
        id: 'c1', assetClass: AssetClass.COMMODITY, name: '', description: '',
        metadata: { commodity: 'gold', quantity: 10, grade: 'substandard' },
      });
      const standard = await agent.valuate({
        id: 'c2', assetClass: AssetClass.COMMODITY, name: '', description: '',
        metadata: { commodity: 'gold', quantity: 10, grade: 'standard' },
      });
      expect(sub.value).toBeLessThan(standard.value);
    });
  });

  describe('storage cost deduction', () => {
    it('storage cost reduces value', async () => {
      const withStorage = await agent.valuate({
        id: 'c1', assetClass: AssetClass.COMMODITY, name: '', description: '',
        metadata: { commodity: 'gold', quantity: 10, storageCostPerUnit: 50 },
      });
      const noStorage = await agent.valuate({
        id: 'c2', assetClass: AssetClass.COMMODITY, name: '', description: '',
        metadata: { commodity: 'gold', quantity: 10 },
      });
      expect(withStorage.value).toBeLessThan(noStorage.value);
    });
  });

  describe('volatility affects confidence', () => {
    it('low volatility commodity has higher confidence', async () => {
      const gold = await agent.valuate({
        id: 'c1', assetClass: AssetClass.COMMODITY, name: '', description: '',
        metadata: { commodity: 'gold', quantity: 1 },
      });
      // Gold volatility = 0.12, confidence = 0.95 - 0.12 = 0.83
      expect(gold.confidence).toBeGreaterThanOrEqual(0.8);
    });

    it('high volatility commodity has lower confidence', async () => {
      const gas = await agent.valuate({
        id: 'c1', assetClass: AssetClass.COMMODITY, name: '', description: '',
        metadata: { commodity: 'natural_gas', quantity: 1 },
      });
      // Natural gas volatility = 0.35, confidence = 0.95 - 0.35 = 0.60
      expect(gas.confidence).toBeLessThan(0.7);
    });
  });

  describe('unknown commodity', () => {
    it('returns low confidence for unknown commodity', async () => {
      const result = await agent.valuate({
        id: 'c1', assetClass: AssetClass.COMMODITY, name: '', description: '',
        metadata: { commodity: 'unobtanium', quantity: 1 },
      });
      expect(result.confidence).toBeLessThanOrEqual(0.1);
    });
  });

  describe('quantity scaling', () => {
    it('scales linearly with quantity', async () => {
      const one = await agent.valuate({
        id: 'c1', assetClass: AssetClass.COMMODITY, name: '', description: '',
        metadata: { commodity: 'gold', quantity: 1 },
      });
      const ten = await agent.valuate({
        id: 'c2', assetClass: AssetClass.COMMODITY, name: '', description: '',
        metadata: { commodity: 'gold', quantity: 10 },
      });
      // Should be approximately 10x (accounting for seasonal factors)
      expect(ten.value / one.value).toBeCloseTo(10, 0);
    });
  });
});

describe('TreasuryAgent - valuation scenarios', () => {
  const agent = new TreasuryAgent();

  describe('canValuate', () => {
    it('can valuate treasury', () => {
      expect(agent.canValuate(AssetClass.TREASURY)).toBe(true);
    });

    it('cannot valuate real estate', () => {
      expect(agent.canValuate(AssetClass.REAL_ESTATE)).toBe(false);
    });

    it('cannot valuate commodity', () => {
      expect(agent.canValuate(AssetClass.COMMODITY)).toBe(false);
    });
  });

  describe('config', () => {
    it('has correct id', () => {
      expect(agent.config.id).toBe('treasury-agent');
    });

    it('has correct asset classes', () => {
      expect(agent.config.assetClasses).toEqual([AssetClass.TREASURY]);
    });
  });

  describe('treasury valuation', () => {
    it('values T-Bill with face value', async () => {
      const result = await agent.valuate({
        id: 't1', assetClass: AssetClass.TREASURY, name: 'T-Bill', description: '',
        metadata: { faceValue: 10000, maturityYears: 1 },
      });
      expect(result.value).toBeGreaterThan(0);
      // T-Bill should be worth close to face value
      expect(result.value).toBeLessThanOrEqual(10000);
    });

    it('has high confidence for treasury', async () => {
      const result = await agent.valuate({
        id: 't1', assetClass: AssetClass.TREASURY, name: 'T-Bill', description: '',
        metadata: { faceValue: 10000, maturityYears: 1 },
      });
      expect(result.confidence).toBeGreaterThanOrEqual(0.8);
    });

    it('longer maturity has more discount', async () => {
      const short = await agent.valuate({
        id: 't1', assetClass: AssetClass.TREASURY, name: '', description: '',
        metadata: { faceValue: 10000, maturityYears: 1 },
      });
      const long = await agent.valuate({
        id: 't2', assetClass: AssetClass.TREASURY, name: '', description: '',
        metadata: { faceValue: 10000, maturityYears: 30 },
      });
      expect(short.value).toBeGreaterThan(long.value);
    });
  });
});

describe('Cross-agent valuation result structure', () => {
  const agents = [
    { name: 'PropertyAgent', agent: new PropertyAgent(), asset: {
      id: 'p1', assetClass: AssetClass.REAL_ESTATE as AssetClass, name: 'Prop', description: '',
      location: 'manhattan', metadata: { squareFeet: 1000 },
    }},
    { name: 'CommodityAgent', agent: new CommodityAgent(), asset: {
      id: 'c1', assetClass: AssetClass.COMMODITY as AssetClass, name: 'Gold', description: '',
      metadata: { commodity: 'gold', quantity: 10 },
    }},
    { name: 'TreasuryAgent', agent: new TreasuryAgent(), asset: {
      id: 't1', assetClass: AssetClass.TREASURY as AssetClass, name: 'T-Bill', description: '',
      metadata: { faceValue: 10000, maturityMonths: 6 },
    }},
  ];

  for (const { name, agent, asset } of agents) {
    describe(`${name}`, () => {
      it('returns valid ValuationResult', async () => {
        const result = await agent.valuate(asset as AssetData);
        expect(result.assetId).toBe(asset.id);
        expect(result.agentId).toBe(agent.config.id);
        expect(typeof result.value).toBe('number');
        expect(result.confidence).toBeGreaterThanOrEqual(0);
        expect(result.confidence).toBeLessThanOrEqual(1);
        expect(result.timestamp).toBeInstanceOf(Date);
        expect(typeof result.methodology).toBe('string');
        expect(result.methodology.length).toBeGreaterThan(0);
        expect(Array.isArray(result.dataPoints)).toBe(true);
        expect(result.dataPoints.length).toBeGreaterThan(0);
      });

      it('data points have required fields', async () => {
        const result = await agent.valuate(asset as AssetData);
        for (const dp of result.dataPoints) {
          expect(typeof dp.source).toBe('string');
          expect(typeof dp.metric).toBe('string');
          expect(dp.value !== undefined).toBe(true);
          expect(dp.timestamp).toBeInstanceOf(Date);
          expect(typeof dp.weight).toBe('number');
          expect(dp.weight).toBeGreaterThan(0);
          expect(dp.weight).toBeLessThanOrEqual(1);
        }
      });
    });
  }
});
