import { BaseValuationAgent } from './base-agent';
import { AssetClass, AssetData, DataPoint } from '../types';

/**
 * AI agent specializing in treasury/fixed-income asset valuation.
 * Uses yield curve analysis, credit ratings, and duration-based pricing.
 */
export class TreasuryAgent extends BaseValuationAgent {
  // Simulated yield curves (annualized %)
  private static readonly YIELD_CURVES: Record<string, Record<number, number>> = {
    'us_treasury': {
      1: 4.8, 2: 4.5, 3: 4.3, 5: 4.2, 7: 4.25, 10: 4.3, 20: 4.5, 30: 4.6,
    },
    'corporate_aaa': {
      1: 5.0, 2: 4.8, 3: 4.6, 5: 4.5, 7: 4.55, 10: 4.65, 20: 4.9, 30: 5.0,
    },
    'corporate_bbb': {
      1: 5.8, 2: 5.6, 3: 5.5, 5: 5.5, 7: 5.6, 10: 5.7, 20: 6.0, 30: 6.2,
    },
    'municipal': {
      1: 3.2, 2: 3.1, 3: 3.0, 5: 3.0, 7: 3.1, 10: 3.3, 20: 3.6, 30: 3.8,
    },
  };

  // Credit rating spreads over treasury (basis points)
  private static readonly CREDIT_SPREADS: Record<string, number> = {
    'AAA': 30, 'AA': 60, 'A': 100, 'BBB': 180,
    'BB': 350, 'B': 550, 'CCC': 900,
  };

  constructor() {
    super({
      id: 'treasury-agent',
      name: 'Treasury & Fixed Income Valuation Agent',
      assetClasses: [AssetClass.TREASURY],
      description: 'Specializes in fixed-income asset valuation using yield curve analysis, credit risk assessment, and duration pricing',
    });
  }

  protected async gatherData(asset: AssetData): Promise<DataPoint[]> {
    const dataPoints: DataPoint[] = [];
    const meta = asset.metadata;
    const now = new Date();

    const bondType = (meta.bondType as string) || 'us_treasury';
    const maturityYears = (meta.maturityYears as number) || 10;
    const couponRate = (meta.couponRate as number) || 0.04;  // 4%
    const faceValue = (meta.faceValue as number) || 1000;
    const creditRating = (meta.creditRating as string) || 'AAA';

    // Get appropriate yield curve
    const yieldCurve = TreasuryAgent.YIELD_CURVES[bondType] || TreasuryAgent.YIELD_CURVES['us_treasury'];

    // Interpolate yield for maturity
    const marketYield = this.interpolateYield(yieldCurve, maturityYears);
    dataPoints.push({
      source: 'yield_curve',
      metric: 'market_yield',
      value: marketYield / 100, // Convert to decimal
      timestamp: now,
      weight: 0.4,
    });

    dataPoints.push({
      source: 'bond_data',
      metric: 'coupon_rate',
      value: couponRate,
      timestamp: now,
      weight: 0.2,
    });

    dataPoints.push({
      source: 'bond_data',
      metric: 'face_value',
      value: faceValue,
      timestamp: now,
      weight: 0.15,
    });

    dataPoints.push({
      source: 'bond_data',
      metric: 'maturity_years',
      value: maturityYears,
      timestamp: now,
      weight: 0.1,
    });

    // Credit spread
    const spread = TreasuryAgent.CREDIT_SPREADS[creditRating] || 100;
    dataPoints.push({
      source: 'credit_analysis',
      metric: 'credit_spread_bps',
      value: spread,
      timestamp: now,
      weight: 0.15,
    });

    dataPoints.push({
      source: 'credit_analysis',
      metric: 'credit_rating',
      value: creditRating,
      timestamp: now,
      weight: 0.1,
    });

    return dataPoints;
  }

  protected async computeValuation(
    asset: AssetData,
    dataPoints: DataPoint[]
  ): Promise<{ value: number; confidence: number }> {
    const getDP = (metric: string) => dataPoints.find(dp => dp.metric === metric);

    const marketYieldDP = getDP('market_yield');
    const couponDP = getDP('coupon_rate');
    const faceValueDP = getDP('face_value');
    const maturityDP = getDP('maturity_years');
    const spreadDP = getDP('credit_spread_bps');
    const ratingDP = getDP('credit_rating');

    if (!marketYieldDP || !couponDP || !faceValueDP || !maturityDP) {
      return { value: 0, confidence: 0.1 };
    }

    const marketYield = marketYieldDP.value as number;
    const coupon = couponDP.value as number;
    const faceValue = faceValueDP.value as number;
    const maturity = maturityDP.value as number;
    const spread = spreadDP ? (spreadDP.value as number) / 10000 : 0;

    // Discount rate = market yield + credit spread
    const discountRate = marketYield + spread;

    // Present value of coupon payments + present value of face value
    const annualCoupon = faceValue * coupon;
    let pvCoupons = 0;
    for (let t = 1; t <= maturity; t++) {
      pvCoupons += annualCoupon / Math.pow(1 + discountRate, t);
    }
    const pvFace = faceValue / Math.pow(1 + discountRate, maturity);

    const bondPrice = pvCoupons + pvFace;

    // Scale by quantity if present
    const quantity = (asset.metadata.quantity as number) || 1;
    const totalValue = bondPrice * quantity;

    // Confidence based on credit quality and data availability
    let confidence = 0.92; // Treasuries are well-priced
    const rating = ratingDP?.value as string;
    if (rating === 'BB' || rating === 'B' || rating === 'CCC') {
      confidence = 0.65; // High-yield bonds less certain
    } else if (rating === 'BBB') {
      confidence = 0.8;
    }

    return {
      value: Math.round(totalValue * 100) / 100,
      confidence,
    };
  }

  private interpolateYield(curve: Record<number, number>, maturity: number): number {
    const maturities = Object.keys(curve).map(Number).sort((a, b) => a - b);

    if (maturity <= maturities[0]) return curve[maturities[0]];
    if (maturity >= maturities[maturities.length - 1]) return curve[maturities[maturities.length - 1]];

    for (let i = 0; i < maturities.length - 1; i++) {
      if (maturity >= maturities[i] && maturity <= maturities[i + 1]) {
        const t1 = maturities[i];
        const t2 = maturities[i + 1];
        const y1 = curve[t1];
        const y2 = curve[t2];
        return y1 + (y2 - y1) * (maturity - t1) / (t2 - t1);
      }
    }

    return curve[maturities[0]];
  }

  protected getMethodology(): string {
    return 'Discounted cash flow analysis using interpolated yield curve, credit spread adjustment, and present value of coupon/principal payments';
  }
}
