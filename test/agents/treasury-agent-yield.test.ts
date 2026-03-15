import { TreasuryAgent } from '../../src/agents/treasury-agent';
import { AssetClass, AssetData } from '../../src/types';

describe('TreasuryAgent - Yield Interpolation & Edge Cases', () => {
  let agent: TreasuryAgent;

  beforeEach(() => {
    agent = new TreasuryAgent();
  });

  function makeAsset(overrides: Partial<AssetData['metadata']> = {}): AssetData {
    return {
      id: 'yield-test',
      assetClass: AssetClass.TREASURY,
      name: 'Test Bond',
      description: '',
      metadata: {
        bondType: 'us_treasury',
        maturityYears: 10,
        couponRate: 0.04,
        faceValue: 1000,
        creditRating: 'AAA',
        ...overrides,
      },
    };
  }

  describe('interpolateYield via valuation', () => {
    it('should match exact maturity point (1Y)', async () => {
      const result = await agent.valuate(makeAsset({ maturityYears: 1 }));
      expect(result.value).toBeGreaterThan(0);
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should match exact maturity point (5Y)', async () => {
      const result = await agent.valuate(makeAsset({ maturityYears: 5 }));
      expect(result.value).toBeGreaterThan(0);
    });

    it('should match exact maturity point (30Y)', async () => {
      const result = await agent.valuate(makeAsset({ maturityYears: 30 }));
      expect(result.value).toBeGreaterThan(0);
    });

    it('should interpolate between 1Y and 2Y', async () => {
      const r1 = await agent.valuate(makeAsset({ maturityYears: 1 }));
      const r1_5 = await agent.valuate(makeAsset({ maturityYears: 1.5 }));
      const r2 = await agent.valuate(makeAsset({ maturityYears: 2 }));
      // 1.5Y value should be between 1Y and 2Y
      expect(r1_5.value).not.toBe(r1.value);
      expect(r1_5.value).not.toBe(r2.value);
    });

    it('should interpolate between 5Y and 7Y', async () => {
      const r5 = await agent.valuate(makeAsset({ maturityYears: 5 }));
      const r6 = await agent.valuate(makeAsset({ maturityYears: 6 }));
      const r7 = await agent.valuate(makeAsset({ maturityYears: 7 }));
      expect(r6.value).not.toBe(r5.value);
      expect(r6.value).not.toBe(r7.value);
    });

    it('should clamp below minimum maturity', async () => {
      const r_low = await agent.valuate(makeAsset({ maturityYears: 0.5 }));
      const r_1 = await agent.valuate(makeAsset({ maturityYears: 1 }));
      // Below-min maturity uses min yield but different discounting periods
      expect(r_low.value).toBeGreaterThan(0);
    });

    it('should clamp above maximum maturity', async () => {
      const r_high = await agent.valuate(makeAsset({ maturityYears: 50 }));
      expect(r_high.value).toBeGreaterThan(0);
    });

    it('should produce different values for different maturities', async () => {
      const results = await Promise.all(
        [1, 5, 10, 20, 30].map(m => agent.valuate(makeAsset({ maturityYears: m })))
      );
      const values = results.map(r => r.value);
      const unique = new Set(values);
      expect(unique.size).toBeGreaterThan(1);
    });
  });

  describe('bond type curves', () => {
    it('should use us_treasury curve by default', async () => {
      const result = await agent.valuate(makeAsset({ bondType: 'us_treasury' }));
      expect(result.value).toBeGreaterThan(0);
    });

    it('should use corporate_aaa curve', async () => {
      const result = await agent.valuate(makeAsset({ bondType: 'corporate_aaa' }));
      expect(result.value).toBeGreaterThan(0);
    });

    it('should use corporate_bbb curve', async () => {
      const result = await agent.valuate(makeAsset({ bondType: 'corporate_bbb' }));
      expect(result.value).toBeGreaterThan(0);
    });

    it('should use municipal curve', async () => {
      const result = await agent.valuate(makeAsset({ bondType: 'municipal' }));
      expect(result.value).toBeGreaterThan(0);
    });

    it('should fallback to us_treasury for unknown bond type', async () => {
      const unknown = await agent.valuate(makeAsset({ bondType: 'exotic_bond' }));
      const treasury = await agent.valuate(makeAsset({ bondType: 'us_treasury' }));
      expect(unknown.value).toBe(treasury.value);
    });

    it('should price corporate_bbb lower than us_treasury (higher yield)', async () => {
      const treasury = await agent.valuate(makeAsset({ bondType: 'us_treasury', creditRating: 'AAA' }));
      const bbb = await agent.valuate(makeAsset({ bondType: 'corporate_bbb', creditRating: 'BBB' }));
      // Higher yields mean lower bond prices
      expect(bbb.value).toBeLessThan(treasury.value);
    });

    it('should price municipal higher than corporate (lower yield)', async () => {
      const muni = await agent.valuate(makeAsset({ bondType: 'municipal', creditRating: 'AAA' }));
      const corp = await agent.valuate(makeAsset({ bondType: 'corporate_aaa', creditRating: 'AAA' }));
      expect(muni.value).toBeGreaterThan(corp.value);
    });
  });

  describe('credit spread effects', () => {
    it('should apply AAA credit spread', async () => {
      const result = await agent.valuate(makeAsset({ creditRating: 'AAA' }));
      expect(result.confidence).toBe(0.92);
    });

    it('should apply BBB credit spread with lower confidence', async () => {
      const result = await agent.valuate(makeAsset({ creditRating: 'BBB' }));
      expect(result.confidence).toBe(0.8);
    });

    it('should apply BB high-yield spread with low confidence', async () => {
      const result = await agent.valuate(makeAsset({ creditRating: 'BB' }));
      expect(result.confidence).toBe(0.65);
    });

    it('should apply B spread with low confidence', async () => {
      const result = await agent.valuate(makeAsset({ creditRating: 'B' }));
      expect(result.confidence).toBe(0.65);
    });

    it('should apply CCC spread with low confidence', async () => {
      const result = await agent.valuate(makeAsset({ creditRating: 'CCC' }));
      expect(result.confidence).toBe(0.65);
    });

    it('should default credit spread for unknown rating', async () => {
      const result = await agent.valuate(makeAsset({ creditRating: 'NR' }));
      expect(result.value).toBeGreaterThan(0);
    });

    it('should price AAA higher than CCC (lower spread)', async () => {
      const aaa = await agent.valuate(makeAsset({ creditRating: 'AAA' }));
      const ccc = await agent.valuate(makeAsset({ creditRating: 'CCC' }));
      expect(aaa.value).toBeGreaterThan(ccc.value);
    });

    it('should price AA between AAA and A', async () => {
      const aaa = await agent.valuate(makeAsset({ creditRating: 'AAA' }));
      const aa = await agent.valuate(makeAsset({ creditRating: 'AA' }));
      const a = await agent.valuate(makeAsset({ creditRating: 'A' }));
      expect(aa.value).toBeLessThan(aaa.value);
      expect(aa.value).toBeGreaterThan(a.value);
    });
  });

  describe('coupon rate effects', () => {
    it('should price zero coupon bond', async () => {
      const result = await agent.valuate(makeAsset({ couponRate: 0 }));
      expect(result.value).toBeGreaterThan(0);
      expect(result.value).toBeLessThan(1000);
    });

    it('should price high coupon above par', async () => {
      const result = await agent.valuate(makeAsset({ couponRate: 0.10 }));
      expect(result.value).toBeGreaterThan(1000);
    });

    it('should increase value with higher coupon rate', async () => {
      const low = await agent.valuate(makeAsset({ couponRate: 0.02 }));
      const mid = await agent.valuate(makeAsset({ couponRate: 0.05 }));
      const high = await agent.valuate(makeAsset({ couponRate: 0.10 }));
      expect(high.value).toBeGreaterThan(mid.value);
      expect(mid.value).toBeGreaterThan(low.value);
    });
  });

  describe('face value and quantity', () => {
    it('should scale with face value', async () => {
      const r1k = await agent.valuate(makeAsset({ faceValue: 1000 }));
      const r10k = await agent.valuate(makeAsset({ faceValue: 10000 }));
      expect(r10k.value).toBeCloseTo(r1k.value * 10, -1);
    });

    it('should scale with quantity', async () => {
      const r1 = await agent.valuate(makeAsset({ quantity: 1 }));
      const r5 = await agent.valuate(makeAsset({ quantity: 5 }));
      expect(r5.value).toBeCloseTo(r1.value * 5, -1);
    });

    it('should default quantity to 1', async () => {
      const noQty = await agent.valuate(makeAsset({}));
      const qty1 = await agent.valuate(makeAsset({ quantity: 1 }));
      expect(noQty.value).toBe(qty1.value);
    });
  });

  describe('default metadata handling', () => {
    it('should use default values when metadata is empty', async () => {
      const asset: AssetData = {
        id: 'default-test',
        assetClass: AssetClass.TREASURY,
        name: 'Default Bond',
        description: '',
        metadata: {},
      };
      const result = await agent.valuate(asset);
      expect(result.value).toBeGreaterThan(0);
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('should default to us_treasury bond type', async () => {
      const explicit = await agent.valuate(makeAsset({ bondType: 'us_treasury' }));
      const defaulted = await agent.valuate(makeAsset({}));
      expect(defaulted.value).toBe(explicit.value);
    });

    it('should default maturity to 10 years', async () => {
      const explicit = await agent.valuate(makeAsset({ maturityYears: 10 }));
      const defaulted = await agent.valuate(makeAsset({}));
      expect(defaulted.value).toBe(explicit.value);
    });

    it('should default coupon rate to 4%', async () => {
      const explicit = await agent.valuate(makeAsset({ couponRate: 0.04 }));
      const defaulted = await agent.valuate(makeAsset({}));
      expect(defaulted.value).toBe(explicit.value);
    });

    it('should default face value to 1000', async () => {
      const explicit = await agent.valuate(makeAsset({ faceValue: 1000 }));
      const defaulted = await agent.valuate(makeAsset({}));
      expect(defaulted.value).toBe(explicit.value);
    });
  });

  describe('data points generation', () => {
    it('should include market yield data point', async () => {
      const result = await agent.valuate(makeAsset());
      const yieldDP = result.dataPoints.find(dp => dp.metric === 'market_yield');
      expect(yieldDP).toBeDefined();
      expect(yieldDP!.source).toBe('yield_curve');
      expect(yieldDP!.value).toBeGreaterThan(0);
    });

    it('should include coupon rate data point', async () => {
      const result = await agent.valuate(makeAsset());
      const couponDP = result.dataPoints.find(dp => dp.metric === 'coupon_rate');
      expect(couponDP).toBeDefined();
      expect(couponDP!.value).toBe(0.04);
    });

    it('should include face value data point', async () => {
      const result = await agent.valuate(makeAsset());
      const fvDP = result.dataPoints.find(dp => dp.metric === 'face_value');
      expect(fvDP).toBeDefined();
      expect(fvDP!.value).toBe(1000);
    });

    it('should include maturity data point', async () => {
      const result = await agent.valuate(makeAsset());
      const matDP = result.dataPoints.find(dp => dp.metric === 'maturity_years');
      expect(matDP).toBeDefined();
      expect(matDP!.value).toBe(10);
    });

    it('should include credit spread data point', async () => {
      const result = await agent.valuate(makeAsset());
      const spreadDP = result.dataPoints.find(dp => dp.metric === 'credit_spread_bps');
      expect(spreadDP).toBeDefined();
      expect(spreadDP!.value).toBeGreaterThanOrEqual(0);
    });

    it('should include credit rating data point', async () => {
      const result = await agent.valuate(makeAsset({ creditRating: 'BBB' }));
      const ratingDP = result.dataPoints.find(dp => dp.metric === 'credit_rating');
      expect(ratingDP).toBeDefined();
      expect(ratingDP!.value).toBe('BBB');
    });

    it('should generate 6 data points total', async () => {
      const result = await agent.valuate(makeAsset());
      expect(result.dataPoints).toHaveLength(6);
    });
  });

  describe('methodology', () => {
    it('should describe DCF methodology', async () => {
      const result = await agent.valuate(makeAsset());
      expect(result.methodology).toContain('Discounted cash flow');
      expect(result.methodology).toContain('yield curve');
    });
  });

  describe('mathematical correctness', () => {
    it('should price par bond near face value', async () => {
      // When coupon rate ≈ market yield, price should be near par
      const result = await agent.valuate(makeAsset({
        bondType: 'us_treasury',
        maturityYears: 10,
        couponRate: 0.043, // Close to 10Y US treasury yield 4.3%
        faceValue: 1000,
        creditRating: 'AAA',
      }));
      // With AAA credit spread of 30bps, total discount rate is ~4.6%
      // So coupon of 4.3% is slightly below discount rate -> slight discount
      expect(result.value).toBeGreaterThan(900);
      expect(result.value).toBeLessThan(1100);
    });

    it('should handle very short maturity', async () => {
      const result = await agent.valuate(makeAsset({ maturityYears: 0.1 }));
      // Very short maturity should be close to face value + fractional coupon
      expect(result.value).toBeGreaterThan(900);
      expect(result.value).toBeLessThan(1100);
    });

    it('should handle very long maturity', async () => {
      const result = await agent.valuate(makeAsset({ maturityYears: 100 }));
      // Very long maturity with fixed coupon - value depends on discount rate
      expect(result.value).toBeGreaterThan(0);
    });

    it('should produce rounding to 2 decimal places', async () => {
      const result = await agent.valuate(makeAsset());
      const decimals = (result.value.toString().split('.')[1] || '').length;
      expect(decimals).toBeLessThanOrEqual(2);
    });
  });
});
