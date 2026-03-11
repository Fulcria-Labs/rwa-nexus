import { CommodityAgent } from '../../src/agents/commodity-agent';
import { AssetClass, AssetData } from '../../src/types';

describe('CommodityAgent', () => {
  let agent: CommodityAgent;

  beforeEach(() => {
    agent = new CommodityAgent();
  });

  describe('configuration', () => {
    it('should have correct agent ID', () => {
      expect(agent.config.id).toBe('commodity-agent');
    });

    it('should handle commodity asset class', () => {
      expect(agent.canValuate(AssetClass.COMMODITY)).toBe(true);
    });

    it('should not handle real estate', () => {
      expect(agent.canValuate(AssetClass.REAL_ESTATE)).toBe(false);
    });
  });

  describe('valuation', () => {
    it('should valuate gold', async () => {
      const asset: AssetData = {
        id: 'com-gold',
        assetClass: AssetClass.COMMODITY,
        name: '100oz Gold Bars',
        description: '',
        metadata: { commodity: 'gold', quantity: 100, grade: 'premium' },
      };

      const result = await agent.valuate(asset);

      expect(result.assetId).toBe('com-gold');
      expect(result.agentId).toBe('commodity-agent');
      // ~$2650/oz * 100 * seasonal * grade
      expect(result.value).toBeGreaterThan(250000);
      expect(result.confidence).toBeGreaterThan(0.7);
    });

    it('should valuate crude oil', async () => {
      const asset: AssetData = {
        id: 'com-oil',
        assetClass: AssetClass.COMMODITY,
        name: 'Crude Oil Futures',
        description: '',
        metadata: { commodity: 'crude_oil', quantity: 1000 },
      };

      const result = await agent.valuate(asset);
      // ~$78.5/barrel * 1000
      expect(result.value).toBeGreaterThan(70000);
      expect(result.value).toBeLessThan(100000);
    });

    it('should apply grade factors', async () => {
      const premium: AssetData = {
        id: 'com-p',
        assetClass: AssetClass.COMMODITY,
        name: 'Premium Silver',
        description: '',
        metadata: { commodity: 'silver', quantity: 500, grade: 'premium' },
      };

      const substandard: AssetData = {
        id: 'com-s',
        assetClass: AssetClass.COMMODITY,
        name: 'Substandard Silver',
        description: '',
        metadata: { commodity: 'silver', quantity: 500, grade: 'substandard' },
      };

      const premResult = await agent.valuate(premium);
      const subResult = await agent.valuate(substandard);

      expect(premResult.value).toBeGreaterThan(subResult.value);
    });

    it('should deduct storage costs', async () => {
      const noStorage: AssetData = {
        id: 'com-ns',
        assetClass: AssetClass.COMMODITY,
        name: 'Wheat',
        description: '',
        metadata: { commodity: 'wheat', quantity: 10000 },
      };

      const withStorage: AssetData = {
        id: 'com-ws',
        assetClass: AssetClass.COMMODITY,
        name: 'Wheat (stored)',
        description: '',
        metadata: { commodity: 'wheat', quantity: 10000, storageCostPerUnit: 0.5 },
      };

      const nsResult = await agent.valuate(noStorage);
      const wsResult = await agent.valuate(withStorage);

      expect(nsResult.value).toBeGreaterThan(wsResult.value);
    });

    it('should handle unknown commodity', async () => {
      const asset: AssetData = {
        id: 'com-unknown',
        assetClass: AssetClass.COMMODITY,
        name: 'Unknown Commodity',
        description: '',
        metadata: { commodity: 'unobtanium', quantity: 10 },
      };

      const result = await agent.valuate(asset);
      expect(result.value).toBe(0);
      expect(result.confidence).toBe(0.1);
    });

    it('should valuate all supported commodities', async () => {
      const commodities = ['gold', 'silver', 'platinum', 'crude_oil', 'natural_gas',
        'copper', 'wheat', 'corn', 'soybeans', 'coffee', 'lumber', 'cotton'];

      for (const commodity of commodities) {
        const asset: AssetData = {
          id: `com-${commodity}`,
          assetClass: AssetClass.COMMODITY,
          name: commodity,
          description: '',
          metadata: { commodity, quantity: 10 },
        };

        const result = await agent.valuate(asset);
        expect(result.value).toBeGreaterThan(0);
        expect(result.confidence).toBeGreaterThan(0.3);
      }
    });

    it('should have lower confidence for volatile commodities', async () => {
      const gold: AssetData = {
        id: 'com-g',
        assetClass: AssetClass.COMMODITY,
        name: 'Gold',
        description: '',
        metadata: { commodity: 'gold', quantity: 1 },
      };

      const gas: AssetData = {
        id: 'com-ng',
        assetClass: AssetClass.COMMODITY,
        name: 'Natural Gas',
        description: '',
        metadata: { commodity: 'natural_gas', quantity: 1 },
      };

      const goldResult = await agent.valuate(gold);
      const gasResult = await agent.valuate(gas);

      // Gold volatility 0.12 vs natural gas 0.35
      expect(goldResult.confidence).toBeGreaterThan(gasResult.confidence);
    });
  });
});
