import { TreasuryAgent } from '../../src/agents/treasury-agent';
import { AssetClass, AssetData } from '../../src/types';

describe('TreasuryAgent - Security & Edge Cases', () => {
  let agent: TreasuryAgent;

  beforeEach(() => {
    agent = new TreasuryAgent();
  });

  describe('bond type handling', () => {
    const bondTypes = ['us_treasury', 'corporate_aaa', 'corporate_bbb', 'municipal'];

    it.each(bondTypes)('should valuate %s bonds', async (bondType) => {
      const asset: AssetData = {
        id: `bond-${bondType}`,
        assetClass: AssetClass.TREASURY,
        name: `${bondType} bond`,
        description: '',
        metadata: { bondType, maturityYears: 10, couponRate: 0.04, faceValue: 1000 },
      };
      const result = await agent.valuate(asset);
      expect(result.value).toBeGreaterThan(0);
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('should default to us_treasury for unknown bond type', async () => {
      const known: AssetData = {
        id: 'bt-known',
        assetClass: AssetClass.TREASURY,
        name: 'Known',
        description: '',
        metadata: { bondType: 'us_treasury', maturityYears: 10, couponRate: 0.04, faceValue: 1000 },
      };
      const unknown: AssetData = {
        id: 'bt-unknown',
        assetClass: AssetClass.TREASURY,
        name: 'Unknown',
        description: '',
        metadata: { bondType: 'exotic_bond', maturityYears: 10, couponRate: 0.04, faceValue: 1000 },
      };
      const knownResult = await agent.valuate(known);
      const unknownResult = await agent.valuate(unknown);
      expect(knownResult.value).toBe(unknownResult.value);
    });
  });

  describe('credit rating handling', () => {
    const ratings = ['AAA', 'AA', 'A', 'BBB', 'BB', 'B', 'CCC'];

    it.each(ratings)('should valuate with credit rating %s', async (creditRating) => {
      const asset: AssetData = {
        id: `cr-${creditRating}`,
        assetClass: AssetClass.TREASURY,
        name: `${creditRating} Bond`,
        description: '',
        metadata: { maturityYears: 10, couponRate: 0.04, faceValue: 1000, creditRating },
      };
      const result = await agent.valuate(asset);
      expect(result.value).toBeGreaterThan(0);
    });

    it('should have higher confidence for AAA than CCC', async () => {
      const aaa: AssetData = {
        id: 'conf-aaa',
        assetClass: AssetClass.TREASURY,
        name: 'AAA Bond',
        description: '',
        metadata: { maturityYears: 10, couponRate: 0.04, faceValue: 1000, creditRating: 'AAA' },
      };
      const ccc: AssetData = {
        id: 'conf-ccc',
        assetClass: AssetClass.TREASURY,
        name: 'CCC Bond',
        description: '',
        metadata: { maturityYears: 10, couponRate: 0.04, faceValue: 1000, creditRating: 'CCC' },
      };
      const aaaResult = await agent.valuate(aaa);
      const cccResult = await agent.valuate(ccc);
      expect(aaaResult.confidence).toBeGreaterThan(cccResult.confidence);
    });

    it('should have BBB confidence at 0.8', async () => {
      const asset: AssetData = {
        id: 'conf-bbb',
        assetClass: AssetClass.TREASURY,
        name: 'BBB Bond',
        description: '',
        metadata: { maturityYears: 10, couponRate: 0.04, faceValue: 1000, creditRating: 'BBB' },
      };
      const result = await agent.valuate(asset);
      expect(result.confidence).toBe(0.8);
    });

    it('should have BB confidence at 0.65', async () => {
      const asset: AssetData = {
        id: 'conf-bb',
        assetClass: AssetClass.TREASURY,
        name: 'BB Bond',
        description: '',
        metadata: { maturityYears: 10, couponRate: 0.04, faceValue: 1000, creditRating: 'BB' },
      };
      const result = await agent.valuate(asset);
      expect(result.confidence).toBe(0.65);
    });

    it('should default unknown credit rating spread to 100bps', async () => {
      const asset: AssetData = {
        id: 'cr-unknown',
        assetClass: AssetClass.TREASURY,
        name: 'Unknown Rating',
        description: '',
        metadata: { maturityYears: 10, couponRate: 0.04, faceValue: 1000, creditRating: 'XYZ' },
      };
      const result = await agent.valuate(asset);
      const spreadDp = result.dataPoints.find(dp => dp.metric === 'credit_spread_bps');
      expect(spreadDp!.value).toBe(100);
    });

    it('should lower bond value for higher credit spreads', async () => {
      const aaa: AssetData = {
        id: 'spread-aaa',
        assetClass: AssetClass.TREASURY,
        name: 'AAA',
        description: '',
        metadata: { maturityYears: 10, couponRate: 0.04, faceValue: 1000, creditRating: 'AAA' },
      };
      const ccc: AssetData = {
        id: 'spread-ccc',
        assetClass: AssetClass.TREASURY,
        name: 'CCC',
        description: '',
        metadata: { maturityYears: 10, couponRate: 0.04, faceValue: 1000, creditRating: 'CCC' },
      };
      const aaaResult = await agent.valuate(aaa);
      const cccResult = await agent.valuate(ccc);
      // CCC has much higher spread so lower present value
      expect(aaaResult.value).toBeGreaterThan(cccResult.value);
    });
  });

  describe('maturity edge cases', () => {
    it('should handle 1 year maturity', async () => {
      const asset: AssetData = {
        id: 'mat-1',
        assetClass: AssetClass.TREASURY,
        name: '1Y Bond',
        description: '',
        metadata: { maturityYears: 1, couponRate: 0.04, faceValue: 1000 },
      };
      const result = await agent.valuate(asset);
      expect(result.value).toBeGreaterThan(900);
      expect(result.value).toBeLessThan(1100);
    });

    it('should handle 30 year maturity', async () => {
      const asset: AssetData = {
        id: 'mat-30',
        assetClass: AssetClass.TREASURY,
        name: '30Y Bond',
        description: '',
        metadata: { maturityYears: 30, couponRate: 0.04, faceValue: 1000 },
      };
      const result = await agent.valuate(asset);
      expect(result.value).toBeGreaterThan(0);
    });

    it('should handle fractional maturity years', async () => {
      const asset: AssetData = {
        id: 'mat-frac',
        assetClass: AssetClass.TREASURY,
        name: 'Fractional',
        description: '',
        metadata: { maturityYears: 2.5, couponRate: 0.04, faceValue: 1000 },
      };
      const result = await agent.valuate(asset);
      expect(result.value).toBeGreaterThan(0);
    });

    it('should handle very short maturity (less than 1 year)', async () => {
      const asset: AssetData = {
        id: 'mat-short',
        assetClass: AssetClass.TREASURY,
        name: 'Short Maturity',
        description: '',
        metadata: { maturityYears: 0.5, couponRate: 0.04, faceValue: 1000 },
      };
      const result = await agent.valuate(asset);
      // With maturity < 1, the loop runs 0 times, only pvFace contributes
      expect(result.value).toBeGreaterThan(0);
    });

    it('should handle zero maturity', async () => {
      const asset: AssetData = {
        id: 'mat-zero',
        assetClass: AssetClass.TREASURY,
        name: 'Zero Maturity',
        description: '',
        metadata: { maturityYears: 0, couponRate: 0.04, faceValue: 1000 },
      };
      const result = await agent.valuate(asset);
      // maturity=0 is falsy, defaults to 10
      expect(result.value).toBeGreaterThan(0);
    });

    it('short maturity bonds should be closer to face value than long', async () => {
      const short: AssetData = {
        id: 'comp-short',
        assetClass: AssetClass.TREASURY,
        name: 'Short',
        description: '',
        metadata: { maturityYears: 1, couponRate: 0.04, faceValue: 1000 },
      };
      const long: AssetData = {
        id: 'comp-long',
        assetClass: AssetClass.TREASURY,
        name: 'Long',
        description: '',
        metadata: { maturityYears: 30, couponRate: 0.04, faceValue: 1000 },
      };
      const shortResult = await agent.valuate(short);
      const longResult = await agent.valuate(long);
      // Short maturity bond price closer to face value
      expect(Math.abs(shortResult.value - 1000)).toBeLessThan(Math.abs(longResult.value - 1000));
    });
  });

  describe('coupon rate edge cases', () => {
    it('should handle zero coupon bond', async () => {
      const asset: AssetData = {
        id: 'cpn-zero',
        assetClass: AssetClass.TREASURY,
        name: 'Zero Coupon',
        description: '',
        metadata: { maturityYears: 10, couponRate: 0, faceValue: 1000 },
      };
      const result = await agent.valuate(asset);
      // Zero coupon: value is just PV of face value
      expect(result.value).toBeLessThan(1000);
      expect(result.value).toBeGreaterThan(0);
    });

    it('should handle high coupon rate bond', async () => {
      const asset: AssetData = {
        id: 'cpn-high',
        assetClass: AssetClass.TREASURY,
        name: 'High Coupon',
        description: '',
        metadata: { maturityYears: 10, couponRate: 0.15, faceValue: 1000 },
      };
      const result = await agent.valuate(asset);
      // High coupon should be above face value
      expect(result.value).toBeGreaterThan(1000);
    });

    it('should default coupon rate when missing', async () => {
      const asset: AssetData = {
        id: 'cpn-default',
        assetClass: AssetClass.TREASURY,
        name: 'Default Coupon',
        description: '',
        metadata: { maturityYears: 10, faceValue: 1000 },
      };
      const result = await agent.valuate(asset);
      // Default coupon is 4%
      expect(result.value).toBeGreaterThan(0);
    });
  });

  describe('face value edge cases', () => {
    it('should handle large face value', async () => {
      const asset: AssetData = {
        id: 'fv-large',
        assetClass: AssetClass.TREASURY,
        name: 'Large Face',
        description: '',
        metadata: { maturityYears: 10, couponRate: 0.04, faceValue: 1000000 },
      };
      const result = await agent.valuate(asset);
      expect(result.value).toBeGreaterThan(500000);
    });

    it('should handle small face value', async () => {
      const asset: AssetData = {
        id: 'fv-small',
        assetClass: AssetClass.TREASURY,
        name: 'Small Face',
        description: '',
        metadata: { maturityYears: 10, couponRate: 0.04, faceValue: 1 },
      };
      const result = await agent.valuate(asset);
      expect(result.value).toBeGreaterThan(0);
      expect(result.value).toBeLessThan(5);
    });

    it('should default face value to 1000', async () => {
      const withFV: AssetData = {
        id: 'fv-explicit',
        assetClass: AssetClass.TREASURY,
        name: 'Explicit',
        description: '',
        metadata: { maturityYears: 10, couponRate: 0.04, faceValue: 1000 },
      };
      const noFV: AssetData = {
        id: 'fv-default',
        assetClass: AssetClass.TREASURY,
        name: 'Default',
        description: '',
        metadata: { maturityYears: 10, couponRate: 0.04 },
      };
      const withResult = await agent.valuate(withFV);
      const noResult = await agent.valuate(noFV);
      expect(withResult.value).toBe(noResult.value);
    });
  });

  describe('quantity scaling', () => {
    it('should scale value linearly with quantity', async () => {
      const single: AssetData = {
        id: 'qty-1',
        assetClass: AssetClass.TREASURY,
        name: 'Single',
        description: '',
        metadata: { maturityYears: 10, couponRate: 0.04, faceValue: 1000, quantity: 1 },
      };
      const ten: AssetData = {
        id: 'qty-10',
        assetClass: AssetClass.TREASURY,
        name: 'Ten',
        description: '',
        metadata: { maturityYears: 10, couponRate: 0.04, faceValue: 1000, quantity: 10 },
      };
      const singleResult = await agent.valuate(single);
      const tenResult = await agent.valuate(ten);
      expect(Math.abs(tenResult.value - singleResult.value * 10)).toBeLessThan(1);
    });

    it('should default quantity to 1', async () => {
      const asset: AssetData = {
        id: 'qty-default',
        assetClass: AssetClass.TREASURY,
        name: 'Default Qty',
        description: '',
        metadata: { maturityYears: 10, couponRate: 0.04, faceValue: 1000 },
      };
      const result = await agent.valuate(asset);
      // Face value 1000 with ~4% coupon and ~4.3% yield, should be around 970-1000
      expect(result.value).toBeGreaterThan(800);
      expect(result.value).toBeLessThan(1100);
    });
  });

  describe('data points verification', () => {
    it('should include all expected data points', async () => {
      const asset: AssetData = {
        id: 'dp-all',
        assetClass: AssetClass.TREASURY,
        name: 'All DPs',
        description: '',
        metadata: { bondType: 'us_treasury', maturityYears: 10, couponRate: 0.04, faceValue: 1000, creditRating: 'AAA' },
      };
      const result = await agent.valuate(asset);
      const metrics = result.dataPoints.map(dp => dp.metric);
      expect(metrics).toContain('market_yield');
      expect(metrics).toContain('coupon_rate');
      expect(metrics).toContain('face_value');
      expect(metrics).toContain('maturity_years');
      expect(metrics).toContain('credit_spread_bps');
      expect(metrics).toContain('credit_rating');
    });

    it('should have correct data point sources', async () => {
      const asset: AssetData = {
        id: 'dp-sources',
        assetClass: AssetClass.TREASURY,
        name: 'Sources',
        description: '',
        metadata: { maturityYears: 10, couponRate: 0.04, faceValue: 1000 },
      };
      const result = await agent.valuate(asset);
      expect(result.dataPoints.find(dp => dp.metric === 'market_yield')!.source).toBe('yield_curve');
      expect(result.dataPoints.find(dp => dp.metric === 'coupon_rate')!.source).toBe('bond_data');
      expect(result.dataPoints.find(dp => dp.metric === 'credit_spread_bps')!.source).toBe('credit_analysis');
    });
  });

  describe('rejection of wrong asset classes', () => {
    it('should reject commodity assets', async () => {
      const asset: AssetData = {
        id: 'rej-com',
        assetClass: AssetClass.COMMODITY,
        name: 'Gold',
        description: '',
        metadata: {},
      };
      await expect(agent.valuate(asset)).rejects.toThrow('cannot valuate');
    });

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
  });
});
