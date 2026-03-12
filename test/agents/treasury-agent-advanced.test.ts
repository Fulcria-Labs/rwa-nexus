import { TreasuryAgent } from '../../src/agents/treasury-agent';
import { AssetClass, AssetData } from '../../src/types';

describe('TreasuryAgent - Advanced', () => {
  let agent: TreasuryAgent;

  beforeEach(() => {
    agent = new TreasuryAgent();
  });

  describe('yield curve interpolation', () => {
    it('should interpolate between 5Y and 7Y maturity', async () => {
      const fiveYear: AssetData = {
        id: 'yc-5',
        assetClass: AssetClass.TREASURY,
        name: '5Y',
        description: '',
        metadata: { bondType: 'us_treasury', maturityYears: 5, couponRate: 0.04, faceValue: 1000, creditRating: 'AAA' },
      };

      const sevenYear: AssetData = {
        id: 'yc-7',
        assetClass: AssetClass.TREASURY,
        name: '7Y',
        description: '',
        metadata: { bondType: 'us_treasury', maturityYears: 7, couponRate: 0.04, faceValue: 1000, creditRating: 'AAA' },
      };

      const sixYear: AssetData = {
        id: 'yc-6',
        assetClass: AssetClass.TREASURY,
        name: '6Y',
        description: '',
        metadata: { bondType: 'us_treasury', maturityYears: 6, couponRate: 0.04, faceValue: 1000, creditRating: 'AAA' },
      };

      const r5 = await agent.valuate(fiveYear);
      const r7 = await agent.valuate(sevenYear);
      const r6 = await agent.valuate(sixYear);

      // 6Y value should be between 5Y and 7Y (or close to them)
      const min = Math.min(r5.value, r7.value);
      const max = Math.max(r5.value, r7.value);
      expect(r6.value).toBeGreaterThanOrEqual(min - 1);
      expect(r6.value).toBeLessThanOrEqual(max + 1);
    });

    it('should clamp maturity below minimum (1Y)', async () => {
      const halfYear: AssetData = {
        id: 'yc-half',
        assetClass: AssetClass.TREASURY,
        name: 'Half Year',
        description: '',
        metadata: { bondType: 'us_treasury', maturityYears: 0.5, couponRate: 0.04, faceValue: 1000, creditRating: 'AAA' },
      };

      const result = await agent.valuate(halfYear);
      // Should use 1Y yield (4.8%)
      expect(result.value).toBeGreaterThan(0);
      expect(result.value).toBeLessThan(1100);
    });

    it('should clamp maturity above maximum (30Y)', async () => {
      const fiftyYear: AssetData = {
        id: 'yc-50',
        assetClass: AssetClass.TREASURY,
        name: '50Y',
        description: '',
        metadata: { bondType: 'us_treasury', maturityYears: 50, couponRate: 0.04, faceValue: 1000, creditRating: 'AAA' },
      };

      const result = await agent.valuate(fiftyYear);
      // Should use 30Y yield (4.6%)
      expect(result.value).toBeGreaterThan(0);
    });
  });

  describe('credit ratings', () => {
    const ratings = ['AAA', 'AA', 'A', 'BBB', 'BB', 'B', 'CCC'];

    it('should price progressively lower for worse credit ratings', async () => {
      const values: number[] = [];

      for (const rating of ratings) {
        const asset: AssetData = {
          id: `cr-${rating}`,
          assetClass: AssetClass.TREASURY,
          name: `${rating} Bond`,
          description: '',
          metadata: {
            bondType: 'us_treasury',
            maturityYears: 10,
            couponRate: 0.05,
            faceValue: 1000,
            creditRating: rating,
          },
        };

        const result = await agent.valuate(asset);
        values.push(result.value);
      }

      // Better credit rating → lower spread → higher bond price
      for (let i = 0; i < values.length - 1; i++) {
        expect(values[i]).toBeGreaterThan(values[i + 1]);
      }
    });

    it('should have confidence 0.92 for investment grade (AAA)', async () => {
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

    it('should have confidence 0.92 for AA rating', async () => {
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

    it('should have confidence 0.80 for BBB rating', async () => {
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

    it('should have confidence 0.65 for BB/B/CCC ratings', async () => {
      for (const rating of ['BB', 'B', 'CCC']) {
        const asset: AssetData = {
          id: `conf-${rating}`,
          assetClass: AssetClass.TREASURY,
          name: `${rating}`,
          description: '',
          metadata: { maturityYears: 10, couponRate: 0.04, faceValue: 1000, creditRating: rating },
        };

        const result = await agent.valuate(asset);
        expect(result.confidence).toBe(0.65);
      }
    });

    it('should use default spread (100bp) for unknown rating', async () => {
      const asset: AssetData = {
        id: 'cr-unknown',
        assetClass: AssetClass.TREASURY,
        name: 'Unknown Rating',
        description: '',
        metadata: {
          maturityYears: 10,
          couponRate: 0.05,
          faceValue: 1000,
          creditRating: 'NR',
        },
      };

      const result = await agent.valuate(asset);
      expect(result.value).toBeGreaterThan(0);
    });
  });

  describe('bond type yield curves', () => {
    it('should price differently across bond types', async () => {
      const types = ['us_treasury', 'corporate_aaa', 'corporate_bbb', 'municipal'];
      const values: number[] = [];

      for (const bondType of types) {
        const asset: AssetData = {
          id: `bt-${bondType}`,
          assetClass: AssetClass.TREASURY,
          name: bondType,
          description: '',
          metadata: {
            bondType,
            maturityYears: 10,
            couponRate: 0.05,
            faceValue: 1000,
            creditRating: 'AAA',
          },
        };

        const result = await agent.valuate(asset);
        values.push(result.value);
      }

      // Municipal bonds have lowest yields → highest price
      expect(values[3]).toBeGreaterThan(values[0]); // municipal > treasury
    });

    it('should default to us_treasury curve for unknown bond type', async () => {
      const asset: AssetData = {
        id: 'bt-unknown',
        assetClass: AssetClass.TREASURY,
        name: 'Unknown Type',
        description: '',
        metadata: {
          bondType: 'sovereign_emerging',
          maturityYears: 10,
          couponRate: 0.05,
          faceValue: 1000,
        },
      };

      const treasury: AssetData = {
        id: 'bt-trs',
        assetClass: AssetClass.TREASURY,
        name: 'Treasury',
        description: '',
        metadata: {
          bondType: 'us_treasury',
          maturityYears: 10,
          couponRate: 0.05,
          faceValue: 1000,
        },
      };

      const unknownResult = await agent.valuate(asset);
      const treasuryResult = await agent.valuate(treasury);

      expect(unknownResult.value).toBe(treasuryResult.value);
    });
  });

  describe('coupon rate edge cases', () => {
    it('should handle zero coupon bond', async () => {
      const asset: AssetData = {
        id: 'zc-bond',
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
      // Zero coupon: PV = faceValue / (1+r)^n, r includes yield + credit spread
      // Should be below par for positive discount rate
      expect(result.value).toBeLessThan(1000);
      expect(result.value).toBeGreaterThan(400);
    });

    it('should handle very high coupon bond', async () => {
      const asset: AssetData = {
        id: 'hc-bond',
        assetClass: AssetClass.TREASURY,
        name: 'High Coupon',
        description: '',
        metadata: {
          bondType: 'us_treasury',
          maturityYears: 5,
          couponRate: 0.20, // 20% coupon
          faceValue: 1000,
          creditRating: 'AAA',
        },
      };

      const result = await agent.valuate(asset);
      // Very high coupon should be well above par
      expect(result.value).toBeGreaterThan(1500);
    });

    it('should default coupon rate to 4% when not provided', async () => {
      const asset: AssetData = {
        id: 'dc-bond',
        assetClass: AssetClass.TREASURY,
        name: 'Default Coupon',
        description: '',
        metadata: {
          bondType: 'us_treasury',
          maturityYears: 10,
          faceValue: 1000,
        },
      };

      const result = await agent.valuate(asset);
      expect(result.value).toBeGreaterThan(0);
    });
  });

  describe('face value handling', () => {
    it('should scale with face value', async () => {
      const small: AssetData = {
        id: 'fv-100',
        assetClass: AssetClass.TREASURY,
        name: '$100 Bond',
        description: '',
        metadata: { maturityYears: 5, couponRate: 0.04, faceValue: 100 },
      };

      const large: AssetData = {
        id: 'fv-10000',
        assetClass: AssetClass.TREASURY,
        name: '$10K Bond',
        description: '',
        metadata: { maturityYears: 5, couponRate: 0.04, faceValue: 10000 },
      };

      const smallResult = await agent.valuate(small);
      const largeResult = await agent.valuate(large);

      expect(largeResult.value / smallResult.value).toBeCloseTo(100, 0);
    });

    it('should default face value to 1000', async () => {
      const asset: AssetData = {
        id: 'fv-default',
        assetClass: AssetClass.TREASURY,
        name: 'Default FV',
        description: '',
        metadata: { maturityYears: 5, couponRate: 0.04 },
      };

      const result = await agent.valuate(asset);
      // Near par at ~1000
      expect(result.value).toBeGreaterThan(800);
      expect(result.value).toBeLessThan(1200);
    });
  });

  describe('data points', () => {
    it('should include market_yield data point', async () => {
      const asset: AssetData = {
        id: 'dp-yield',
        assetClass: AssetClass.TREASURY,
        name: 'Test',
        description: '',
        metadata: { maturityYears: 10, couponRate: 0.04, faceValue: 1000 },
      };

      const result = await agent.valuate(asset);
      const yieldDp = result.dataPoints.find(dp => dp.metric === 'market_yield');
      expect(yieldDp).toBeDefined();
      expect(typeof yieldDp!.value).toBe('number');
    });

    it('should include credit_spread_bps data point', async () => {
      const asset: AssetData = {
        id: 'dp-spread',
        assetClass: AssetClass.TREASURY,
        name: 'Test',
        description: '',
        metadata: { maturityYears: 10, couponRate: 0.04, faceValue: 1000, creditRating: 'BBB' },
      };

      const result = await agent.valuate(asset);
      const spreadDp = result.dataPoints.find(dp => dp.metric === 'credit_spread_bps');
      expect(spreadDp).toBeDefined();
      expect(spreadDp!.value).toBe(180); // BBB spread
    });

    it('should include credit_rating data point', async () => {
      const asset: AssetData = {
        id: 'dp-rating',
        assetClass: AssetClass.TREASURY,
        name: 'Test',
        description: '',
        metadata: { maturityYears: 10, couponRate: 0.04, faceValue: 1000, creditRating: 'A' },
      };

      const result = await agent.valuate(asset);
      const ratingDp = result.dataPoints.find(dp => dp.metric === 'credit_rating');
      expect(ratingDp).toBeDefined();
      expect(ratingDp!.value).toBe('A');
    });

    it('should have 6 data points', async () => {
      const asset: AssetData = {
        id: 'dp-count',
        assetClass: AssetClass.TREASURY,
        name: 'Test',
        description: '',
        metadata: { maturityYears: 10, couponRate: 0.04, faceValue: 1000, creditRating: 'AAA' },
      };

      const result = await agent.valuate(asset);
      expect(result.dataPoints).toHaveLength(6);
    });
  });

  describe('rounding', () => {
    it('should round value to 2 decimal places', async () => {
      const asset: AssetData = {
        id: 'round-test',
        assetClass: AssetClass.TREASURY,
        name: 'Rounding Test',
        description: '',
        metadata: { maturityYears: 7, couponRate: 0.0333, faceValue: 1000, creditRating: 'A' },
      };

      const result = await agent.valuate(asset);
      const decimals = result.value.toString().split('.')[1];
      if (decimals) {
        expect(decimals.length).toBeLessThanOrEqual(2);
      }
    });
  });
});
