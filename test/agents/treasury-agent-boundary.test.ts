import { TreasuryAgent } from '../../src/agents/treasury-agent';
import { AssetClass, AssetData } from '../../src/types';

describe('TreasuryAgent - Boundary conditions', () => {
  let agent: TreasuryAgent;

  beforeEach(() => {
    agent = new TreasuryAgent();
  });

  describe('yield curve interpolation boundaries', () => {
    it('should use exact 1Y yield for maturity of exactly 1', async () => {
      const asset: AssetData = {
        id: 'yc-1y',
        assetClass: AssetClass.TREASURY,
        name: '1Y Bond',
        description: '',
        metadata: { bondType: 'us_treasury', maturityYears: 1, couponRate: 0.04, faceValue: 1000, creditRating: 'AAA' },
      };

      const result = await agent.valuate(asset);
      const yieldDp = result.dataPoints.find(dp => dp.metric === 'market_yield');
      // 1Y US Treasury = 4.8%, converted to decimal = 0.048
      expect(yieldDp!.value).toBe(0.048);
    });

    it('should use exact 30Y yield for maturity of exactly 30', async () => {
      const asset: AssetData = {
        id: 'yc-30y',
        assetClass: AssetClass.TREASURY,
        name: '30Y Bond',
        description: '',
        metadata: { bondType: 'us_treasury', maturityYears: 30, couponRate: 0.04, faceValue: 1000, creditRating: 'AAA' },
      };

      const result = await agent.valuate(asset);
      const yieldDp = result.dataPoints.find(dp => dp.metric === 'market_yield');
      // 30Y US Treasury = 4.6%, converted to decimal = 0.046
      expect(yieldDp!.value).toBe(0.046);
    });

    it('should clamp maturity below 1Y to 1Y yield', async () => {
      const asset: AssetData = {
        id: 'yc-0.1y',
        assetClass: AssetClass.TREASURY,
        name: 'Very Short',
        description: '',
        metadata: { bondType: 'us_treasury', maturityYears: 0.1, couponRate: 0.04, faceValue: 1000 },
      };

      const result = await agent.valuate(asset);
      const yieldDp = result.dataPoints.find(dp => dp.metric === 'market_yield');
      // Should clamp to 1Y yield = 0.048
      expect(yieldDp!.value).toBe(0.048);
    });

    it('should clamp maturity above 30Y to 30Y yield', async () => {
      const asset: AssetData = {
        id: 'yc-100y',
        assetClass: AssetClass.TREASURY,
        name: 'Century Bond',
        description: '',
        metadata: { bondType: 'us_treasury', maturityYears: 100, couponRate: 0.04, faceValue: 1000 },
      };

      const result = await agent.valuate(asset);
      const yieldDp = result.dataPoints.find(dp => dp.metric === 'market_yield');
      // Should clamp to 30Y yield = 0.046
      expect(yieldDp!.value).toBe(0.046);
    });

    it('should interpolate 15Y yield between 10Y and 20Y', async () => {
      const asset: AssetData = {
        id: 'yc-15y',
        assetClass: AssetClass.TREASURY,
        name: '15Y Bond',
        description: '',
        metadata: { bondType: 'us_treasury', maturityYears: 15, couponRate: 0.04, faceValue: 1000 },
      };

      const result = await agent.valuate(asset);
      const yieldDp = result.dataPoints.find(dp => dp.metric === 'market_yield');
      // 10Y=4.3%, 20Y=4.5%, midpoint=4.4%, decimal=0.044
      expect(yieldDp!.value).toBeCloseTo(0.044, 4);
    });

    it('should handle maturity of exactly 0', async () => {
      const asset: AssetData = {
        id: 'yc-0',
        assetClass: AssetClass.TREASURY,
        name: 'Zero Maturity',
        description: '',
        metadata: { bondType: 'us_treasury', maturityYears: 0, couponRate: 0.04, faceValue: 1000 },
      };

      const result = await agent.valuate(asset);
      // Should clamp to 1Y yield
      expect(result.value).toBeGreaterThan(0);
    });

    it('should handle negative maturity gracefully', async () => {
      const asset: AssetData = {
        id: 'yc-neg',
        assetClass: AssetClass.TREASURY,
        name: 'Negative Maturity',
        description: '',
        metadata: { bondType: 'us_treasury', maturityYears: -5, couponRate: 0.04, faceValue: 1000 },
      };

      const result = await agent.valuate(asset);
      // Should clamp to 1Y yield
      expect(result.value).toBeGreaterThan(0);
    });
  });

  describe('credit spread values', () => {
    const spreadTests = [
      { rating: 'AAA', expectedSpread: 30 },
      { rating: 'AA', expectedSpread: 60 },
      { rating: 'A', expectedSpread: 100 },
      { rating: 'BBB', expectedSpread: 180 },
      { rating: 'BB', expectedSpread: 350 },
      { rating: 'B', expectedSpread: 550 },
      { rating: 'CCC', expectedSpread: 900 },
    ];

    it.each(spreadTests)('should use $expectedSpread bps spread for $rating', async ({ rating, expectedSpread }) => {
      const asset: AssetData = {
        id: `spread-${rating}`,
        assetClass: AssetClass.TREASURY,
        name: `${rating} Bond`,
        description: '',
        metadata: { maturityYears: 10, couponRate: 0.04, faceValue: 1000, creditRating: rating },
      };

      const result = await agent.valuate(asset);
      const spreadDp = result.dataPoints.find(dp => dp.metric === 'credit_spread_bps');
      expect(spreadDp!.value).toBe(expectedSpread);
    });

    it('should use default spread (100 bps) for unrecognized rating', async () => {
      const asset: AssetData = {
        id: 'spread-unknown',
        assetClass: AssetClass.TREASURY,
        name: 'Unknown Rating',
        description: '',
        metadata: { maturityYears: 10, couponRate: 0.04, faceValue: 1000, creditRating: 'D' },
      };

      const result = await agent.valuate(asset);
      const spreadDp = result.dataPoints.find(dp => dp.metric === 'credit_spread_bps');
      expect(spreadDp!.value).toBe(100);
    });
  });

  describe('yield curve types', () => {
    it('should use corporate_aaa curve yields', async () => {
      const asset: AssetData = {
        id: 'yc-corp-aaa',
        assetClass: AssetClass.TREASURY,
        name: 'Corp AAA',
        description: '',
        metadata: { bondType: 'corporate_aaa', maturityYears: 10, couponRate: 0.04, faceValue: 1000 },
      };

      const result = await agent.valuate(asset);
      const yieldDp = result.dataPoints.find(dp => dp.metric === 'market_yield');
      // corporate_aaa 10Y = 4.65%, decimal = 0.0465
      expect(yieldDp!.value).toBeCloseTo(0.0465, 10);
    });

    it('should use corporate_bbb curve yields', async () => {
      const asset: AssetData = {
        id: 'yc-corp-bbb',
        assetClass: AssetClass.TREASURY,
        name: 'Corp BBB',
        description: '',
        metadata: { bondType: 'corporate_bbb', maturityYears: 10, couponRate: 0.04, faceValue: 1000 },
      };

      const result = await agent.valuate(asset);
      const yieldDp = result.dataPoints.find(dp => dp.metric === 'market_yield');
      // corporate_bbb 10Y = 5.7%, decimal = 0.057
      expect(yieldDp!.value).toBe(0.057);
    });

    it('should use municipal curve yields', async () => {
      const asset: AssetData = {
        id: 'yc-muni',
        assetClass: AssetClass.TREASURY,
        name: 'Municipal',
        description: '',
        metadata: { bondType: 'municipal', maturityYears: 10, couponRate: 0.04, faceValue: 1000 },
      };

      const result = await agent.valuate(asset);
      const yieldDp = result.dataPoints.find(dp => dp.metric === 'market_yield');
      // municipal 10Y = 3.3%, decimal = 0.033
      expect(yieldDp!.value).toBe(0.033);
    });

    it('should produce higher price for municipal (lower yield) than corporate_bbb', async () => {
      const muni: AssetData = {
        id: 'muni-price',
        assetClass: AssetClass.TREASURY,
        name: 'Municipal',
        description: '',
        metadata: { bondType: 'municipal', maturityYears: 10, couponRate: 0.05, faceValue: 1000, creditRating: 'AAA' },
      };

      const corpBBB: AssetData = {
        id: 'corp-bbb-price',
        assetClass: AssetClass.TREASURY,
        name: 'Corp BBB',
        description: '',
        metadata: { bondType: 'corporate_bbb', maturityYears: 10, couponRate: 0.05, faceValue: 1000, creditRating: 'AAA' },
      };

      const muniResult = await agent.valuate(muni);
      const corpResult = await agent.valuate(corpBBB);

      // Lower yield -> higher bond price
      expect(muniResult.value).toBeGreaterThan(corpResult.value);
    });
  });

  describe('DCF computation edge cases', () => {
    it('should handle zero coupon rate (defaults to 4% because 0 is falsy)', async () => {
      const asset: AssetData = {
        id: 'zero-coupon',
        assetClass: AssetClass.TREASURY,
        name: 'Zero Coupon',
        description: '',
        metadata: {
          bondType: 'us_treasury',
          maturityYears: 10,
          couponRate: 0,
          faceValue: 1000,
          creditRating: 'AAA',
        },
      };

      const result = await agent.valuate(asset);
      // couponRate=0 is falsy, so defaults to 0.04 (4%)
      // This means it behaves the same as a 4% coupon bond
      const couponDp = result.dataPoints.find(dp => dp.metric === 'coupon_rate');
      expect(couponDp!.value).toBe(0.04);
      // Bond price should be close to par with 4% coupon
      expect(result.value).toBeGreaterThan(900);
      expect(result.value).toBeLessThan(1100);
    });

    it('should handle very low but non-zero coupon rate', async () => {
      const asset: AssetData = {
        id: 'low-coupon',
        assetClass: AssetClass.TREASURY,
        name: 'Low Coupon',
        description: '',
        metadata: {
          bondType: 'us_treasury',
          maturityYears: 10,
          couponRate: 0.001, // 0.1% - very low but truthy
          faceValue: 1000,
          creditRating: 'AAA',
        },
      };

      const result = await agent.valuate(asset);
      const couponDp = result.dataPoints.find(dp => dp.metric === 'coupon_rate');
      expect(couponDp!.value).toBe(0.001);
      // Very low coupon = deep discount
      expect(result.value).toBeLessThan(800);
    });

    it('should compute par bond when coupon equals discount rate', async () => {
      // If coupon rate matches the discount rate, bond price = face value (par)
      // Market yield for us_treasury 5Y = 4.2%, credit spread AAA = 30bp
      // Discount rate = 0.042 + 0.003 = 0.045
      const asset: AssetData = {
        id: 'par-bond',
        assetClass: AssetClass.TREASURY,
        name: 'Par Bond',
        description: '',
        metadata: {
          bondType: 'us_treasury',
          maturityYears: 5,
          couponRate: 0.045,
          faceValue: 1000,
          creditRating: 'AAA',
        },
      };

      const result = await agent.valuate(asset);
      // Should be very close to par (1000)
      expect(Math.abs(result.value - 1000)).toBeLessThan(5);
    });

    it('should handle maturity of 1 (single period)', async () => {
      const asset: AssetData = {
        id: 'single-period',
        assetClass: AssetClass.TREASURY,
        name: '1Y Bond',
        description: '',
        metadata: {
          bondType: 'us_treasury',
          maturityYears: 1,
          couponRate: 0.04,
          faceValue: 1000,
          creditRating: 'AAA',
        },
      };

      const result = await agent.valuate(asset);
      // PV = (coupon + face) / (1 + rate)
      // (40 + 1000) / (1 + 0.048 + 0.003) = 1040 / 1.051 ≈ 989.5
      expect(result.value).toBeGreaterThan(950);
      expect(result.value).toBeLessThan(1010);
    });

    it('should scale linearly with face value', async () => {
      const fv100: AssetData = {
        id: 'fv-100',
        assetClass: AssetClass.TREASURY,
        name: '$100 Bond',
        description: '',
        metadata: { maturityYears: 10, couponRate: 0.04, faceValue: 100 },
      };

      const fv1000: AssetData = {
        id: 'fv-1000',
        assetClass: AssetClass.TREASURY,
        name: '$1000 Bond',
        description: '',
        metadata: { maturityYears: 10, couponRate: 0.04, faceValue: 1000 },
      };

      const r100 = await agent.valuate(fv100);
      const r1000 = await agent.valuate(fv1000);

      expect(r1000.value / r100.value).toBeCloseTo(10, 1);
    });
  });

  describe('confidence by credit rating', () => {
    it('should have 0.92 confidence for AAA', async () => {
      const asset: AssetData = {
        id: 'conf-aaa',
        assetClass: AssetClass.TREASURY,
        name: 'AAA',
        description: '',
        metadata: { maturityYears: 10, couponRate: 0.04, faceValue: 1000, creditRating: 'AAA' },
      };
      const result = await agent.valuate(asset);
      expect(result.confidence).toBe(0.92);
    });

    it('should have 0.92 confidence for AA', async () => {
      const asset: AssetData = {
        id: 'conf-aa',
        assetClass: AssetClass.TREASURY,
        name: 'AA',
        description: '',
        metadata: { maturityYears: 10, couponRate: 0.04, faceValue: 1000, creditRating: 'AA' },
      };
      const result = await agent.valuate(asset);
      expect(result.confidence).toBe(0.92);
    });

    it('should have 0.92 confidence for A', async () => {
      const asset: AssetData = {
        id: 'conf-a',
        assetClass: AssetClass.TREASURY,
        name: 'A',
        description: '',
        metadata: { maturityYears: 10, couponRate: 0.04, faceValue: 1000, creditRating: 'A' },
      };
      const result = await agent.valuate(asset);
      expect(result.confidence).toBe(0.92);
    });

    it('should have 0.8 confidence for BBB', async () => {
      const asset: AssetData = {
        id: 'conf-bbb',
        assetClass: AssetClass.TREASURY,
        name: 'BBB',
        description: '',
        metadata: { maturityYears: 10, couponRate: 0.04, faceValue: 1000, creditRating: 'BBB' },
      };
      const result = await agent.valuate(asset);
      expect(result.confidence).toBe(0.8);
    });

    it('should have 0.65 confidence for B', async () => {
      const asset: AssetData = {
        id: 'conf-b',
        assetClass: AssetClass.TREASURY,
        name: 'B',
        description: '',
        metadata: { maturityYears: 10, couponRate: 0.04, faceValue: 1000, creditRating: 'B' },
      };
      const result = await agent.valuate(asset);
      expect(result.confidence).toBe(0.65);
    });

    it('should have 0.92 for unrecognized rating (default path)', async () => {
      const asset: AssetData = {
        id: 'conf-nr',
        assetClass: AssetClass.TREASURY,
        name: 'NR',
        description: '',
        metadata: { maturityYears: 10, couponRate: 0.04, faceValue: 1000, creditRating: 'NR' },
      };
      const result = await agent.valuate(asset);
      // NR doesn't match BB, B, CCC, or BBB, so stays at 0.92
      expect(result.confidence).toBe(0.92);
    });
  });

  describe('default metadata values', () => {
    it('should default bondType to us_treasury', async () => {
      const withDefault: AssetData = {
        id: 'def-bt',
        assetClass: AssetClass.TREASURY,
        name: 'Default BondType',
        description: '',
        metadata: { maturityYears: 10, couponRate: 0.04, faceValue: 1000 },
      };

      const explicit: AssetData = {
        id: 'exp-bt',
        assetClass: AssetClass.TREASURY,
        name: 'Explicit BondType',
        description: '',
        metadata: { bondType: 'us_treasury', maturityYears: 10, couponRate: 0.04, faceValue: 1000 },
      };

      const defResult = await agent.valuate(withDefault);
      const expResult = await agent.valuate(explicit);

      expect(defResult.value).toBe(expResult.value);
    });

    it('should default maturityYears to 10', async () => {
      const asset: AssetData = {
        id: 'def-mat',
        assetClass: AssetClass.TREASURY,
        name: 'Default Maturity',
        description: '',
        metadata: { couponRate: 0.04, faceValue: 1000 },
      };

      const result = await agent.valuate(asset);
      const matDp = result.dataPoints.find(dp => dp.metric === 'maturity_years');
      expect(matDp!.value).toBe(10);
    });

    it('should default couponRate to 0.04', async () => {
      const asset: AssetData = {
        id: 'def-coupon',
        assetClass: AssetClass.TREASURY,
        name: 'Default Coupon',
        description: '',
        metadata: { maturityYears: 5, faceValue: 1000 },
      };

      const result = await agent.valuate(asset);
      const couponDp = result.dataPoints.find(dp => dp.metric === 'coupon_rate');
      expect(couponDp!.value).toBe(0.04);
    });

    it('should default faceValue to 1000', async () => {
      const asset: AssetData = {
        id: 'def-fv',
        assetClass: AssetClass.TREASURY,
        name: 'Default FV',
        description: '',
        metadata: { maturityYears: 5, couponRate: 0.04 },
      };

      const result = await agent.valuate(asset);
      const fvDp = result.dataPoints.find(dp => dp.metric === 'face_value');
      expect(fvDp!.value).toBe(1000);
    });

    it('should default creditRating to AAA', async () => {
      const asset: AssetData = {
        id: 'def-cr',
        assetClass: AssetClass.TREASURY,
        name: 'Default Rating',
        description: '',
        metadata: { maturityYears: 5, couponRate: 0.04, faceValue: 1000 },
      };

      const result = await agent.valuate(asset);
      const ratingDp = result.dataPoints.find(dp => dp.metric === 'credit_rating');
      expect(ratingDp!.value).toBe('AAA');
    });

    it('should default quantity to 1', async () => {
      const single: AssetData = {
        id: 'def-qty',
        assetClass: AssetClass.TREASURY,
        name: 'Default Qty',
        description: '',
        metadata: { maturityYears: 5, couponRate: 0.04, faceValue: 1000 },
      };

      const explicitQty: AssetData = {
        id: 'exp-qty',
        assetClass: AssetClass.TREASURY,
        name: 'Explicit Qty',
        description: '',
        metadata: { maturityYears: 5, couponRate: 0.04, faceValue: 1000, quantity: 1 },
      };

      const singleResult = await agent.valuate(single);
      const expResult = await agent.valuate(explicitQty);

      expect(singleResult.value).toBe(expResult.value);
    });
  });

  describe('data point structure', () => {
    it('should always produce exactly 6 data points', async () => {
      const asset: AssetData = {
        id: 'dp-struct',
        assetClass: AssetClass.TREASURY,
        name: 'Structured',
        description: '',
        metadata: { maturityYears: 10, couponRate: 0.04, faceValue: 1000, creditRating: 'BBB' },
      };

      const result = await agent.valuate(asset);
      expect(result.dataPoints).toHaveLength(6);

      const metrics = result.dataPoints.map(dp => dp.metric).sort();
      expect(metrics).toEqual([
        'coupon_rate',
        'credit_rating',
        'credit_spread_bps',
        'face_value',
        'market_yield',
        'maturity_years',
      ]);
    });

    it('should have correct data point weights', async () => {
      const asset: AssetData = {
        id: 'dp-weights',
        assetClass: AssetClass.TREASURY,
        name: 'Weights',
        description: '',
        metadata: { maturityYears: 10, couponRate: 0.04, faceValue: 1000 },
      };

      const result = await agent.valuate(asset);

      const weights: Record<string, number> = {};
      for (const dp of result.dataPoints) {
        weights[dp.metric] = dp.weight;
      }

      expect(weights['market_yield']).toBe(0.4);
      expect(weights['coupon_rate']).toBe(0.2);
      expect(weights['face_value']).toBe(0.15);
      expect(weights['maturity_years']).toBe(0.1);
      expect(weights['credit_spread_bps']).toBe(0.15);
      expect(weights['credit_rating']).toBe(0.1);
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

      const sources: Record<string, string> = {};
      for (const dp of result.dataPoints) {
        sources[dp.metric] = dp.source;
      }

      expect(sources['market_yield']).toBe('yield_curve');
      expect(sources['coupon_rate']).toBe('bond_data');
      expect(sources['face_value']).toBe('bond_data');
      expect(sources['maturity_years']).toBe('bond_data');
      expect(sources['credit_spread_bps']).toBe('credit_analysis');
      expect(sources['credit_rating']).toBe('credit_analysis');
    });
  });

  describe('methodology string', () => {
    it('should describe DCF methodology', async () => {
      const asset: AssetData = {
        id: 'meth',
        assetClass: AssetClass.TREASURY,
        name: 'Test',
        description: '',
        metadata: { maturityYears: 10, couponRate: 0.04, faceValue: 1000 },
      };

      const result = await agent.valuate(asset);
      expect(result.methodology).toContain('Discounted cash flow');
      expect(result.methodology).toContain('yield curve');
      expect(result.methodology).toContain('credit spread');
    });
  });

  describe('agent rejection', () => {
    it('should reject COMMODITY assets', async () => {
      await expect(agent.valuate({
        id: 'rej-com',
        assetClass: AssetClass.COMMODITY,
        name: 'Gold',
        description: '',
        metadata: {},
      })).rejects.toThrow('cannot valuate');
    });

    it('should reject REAL_ESTATE assets', async () => {
      await expect(agent.valuate({
        id: 'rej-re',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Property',
        description: '',
        metadata: {},
      })).rejects.toThrow('cannot valuate');
    });

    it('should reject EQUITY assets', async () => {
      await expect(agent.valuate({
        id: 'rej-eq',
        assetClass: AssetClass.EQUITY,
        name: 'Stock',
        description: '',
        metadata: {},
      })).rejects.toThrow('cannot valuate');
    });
  });
});
