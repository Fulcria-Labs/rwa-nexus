import { TreasuryAgent } from '../../src/agents/treasury-agent';
import { AssetClass, AssetData } from '../../src/types';

describe('TreasuryAgent', () => {
  let agent: TreasuryAgent;

  beforeEach(() => {
    agent = new TreasuryAgent();
  });

  describe('configuration', () => {
    it('should have correct agent ID', () => {
      expect(agent.config.id).toBe('treasury-agent');
    });

    it('should handle treasury asset class', () => {
      expect(agent.canValuate(AssetClass.TREASURY)).toBe(true);
    });

    it('should not handle other classes', () => {
      expect(agent.canValuate(AssetClass.REAL_ESTATE)).toBe(false);
      expect(agent.canValuate(AssetClass.COMMODITY)).toBe(false);
    });
  });

  describe('valuation', () => {
    it('should valuate US Treasury bond', async () => {
      const asset: AssetData = {
        id: 'trs-001',
        assetClass: AssetClass.TREASURY,
        name: '10Y US Treasury',
        description: '',
        metadata: {
          bondType: 'us_treasury',
          maturityYears: 10,
          couponRate: 0.04,
          faceValue: 1000,
          creditRating: 'AAA',
        },
      };

      const result = await agent.valuate(asset);

      expect(result.assetId).toBe('trs-001');
      expect(result.value).toBeGreaterThan(800);
      expect(result.value).toBeLessThan(1200);
      expect(result.confidence).toBeGreaterThan(0.8);
    });

    it('should price premium bond above par', async () => {
      // High coupon relative to market yield = premium
      const asset: AssetData = {
        id: 'trs-premium',
        assetClass: AssetClass.TREASURY,
        name: 'Premium Bond',
        description: '',
        metadata: {
          bondType: 'us_treasury',
          maturityYears: 5,
          couponRate: 0.08, // 8% coupon vs ~4.2% market
          faceValue: 1000,
          creditRating: 'AAA',
        },
      };

      const result = await agent.valuate(asset);
      expect(result.value).toBeGreaterThan(1000); // Above par
    });

    it('should price discount bond below par', async () => {
      // Low coupon relative to market yield = discount
      const asset: AssetData = {
        id: 'trs-discount',
        assetClass: AssetClass.TREASURY,
        name: 'Discount Bond',
        description: '',
        metadata: {
          bondType: 'us_treasury',
          maturityYears: 10,
          couponRate: 0.02, // 2% coupon vs ~4.3% market
          faceValue: 1000,
          creditRating: 'AAA',
        },
      };

      const result = await agent.valuate(asset);
      expect(result.value).toBeLessThan(1000); // Below par
    });

    it('should apply credit spread for corporate bonds', async () => {
      const treasury: AssetData = {
        id: 'trs-gov',
        assetClass: AssetClass.TREASURY,
        name: 'Treasury',
        description: '',
        metadata: {
          bondType: 'us_treasury',
          maturityYears: 10,
          couponRate: 0.05,
          faceValue: 1000,
          creditRating: 'AAA',
        },
      };

      const corporate: AssetData = {
        id: 'trs-corp',
        assetClass: AssetClass.TREASURY,
        name: 'Corporate BBB',
        description: '',
        metadata: {
          bondType: 'us_treasury',
          maturityYears: 10,
          couponRate: 0.05,
          faceValue: 1000,
          creditRating: 'BBB',
        },
      };

      const trsResult = await agent.valuate(treasury);
      const corpResult = await agent.valuate(corporate);

      // Higher credit spread → lower price
      expect(trsResult.value).toBeGreaterThan(corpResult.value);
    });

    it('should have lower confidence for high-yield bonds', async () => {
      const aaa: AssetData = {
        id: 'trs-aaa',
        assetClass: AssetClass.TREASURY,
        name: 'AAA Bond',
        description: '',
        metadata: { maturityYears: 5, couponRate: 0.04, faceValue: 1000, creditRating: 'AAA' },
      };

      const bb: AssetData = {
        id: 'trs-bb',
        assetClass: AssetClass.TREASURY,
        name: 'BB Bond',
        description: '',
        metadata: { maturityYears: 5, couponRate: 0.04, faceValue: 1000, creditRating: 'BB' },
      };

      const aaaResult = await agent.valuate(aaa);
      const bbResult = await agent.valuate(bb);

      expect(aaaResult.confidence).toBeGreaterThan(bbResult.confidence);
    });

    it('should scale value by quantity', async () => {
      const single: AssetData = {
        id: 'trs-1',
        assetClass: AssetClass.TREASURY,
        name: 'Single Bond',
        description: '',
        metadata: { maturityYears: 5, couponRate: 0.04, faceValue: 1000, quantity: 1 },
      };

      const ten: AssetData = {
        id: 'trs-10',
        assetClass: AssetClass.TREASURY,
        name: 'Ten Bonds',
        description: '',
        metadata: { maturityYears: 5, couponRate: 0.04, faceValue: 1000, quantity: 10 },
      };

      const singleResult = await agent.valuate(single);
      const tenResult = await agent.valuate(ten);

      expect(Math.abs(tenResult.value - singleResult.value * 10)).toBeLessThan(1);
    });

    it('should handle different bond types', async () => {
      const types = ['us_treasury', 'corporate_aaa', 'corporate_bbb', 'municipal'];

      for (const bondType of types) {
        const asset: AssetData = {
          id: `trs-${bondType}`,
          assetClass: AssetClass.TREASURY,
          name: bondType,
          description: '',
          metadata: { bondType, maturityYears: 10, couponRate: 0.05, faceValue: 1000 },
        };

        const result = await agent.valuate(asset);
        expect(result.value).toBeGreaterThan(0);
      }
    });

    it('should handle very short maturity', async () => {
      const asset: AssetData = {
        id: 'trs-short',
        assetClass: AssetClass.TREASURY,
        name: '1Y Note',
        description: '',
        metadata: { maturityYears: 1, couponRate: 0.04, faceValue: 1000, creditRating: 'AAA' },
      };

      const result = await agent.valuate(asset);
      // Short maturity bond should be close to par
      expect(Math.abs(result.value - 1000)).toBeLessThan(50);
    });

    it('should handle very long maturity', async () => {
      const asset: AssetData = {
        id: 'trs-long',
        assetClass: AssetClass.TREASURY,
        name: '30Y Bond',
        description: '',
        metadata: { maturityYears: 30, couponRate: 0.04, faceValue: 1000, creditRating: 'AAA' },
      };

      const result = await agent.valuate(asset);
      expect(result.value).toBeGreaterThan(0);
    });
  });
});
