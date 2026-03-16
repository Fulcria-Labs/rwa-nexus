import { BaseValuationAgent } from './base-agent';
import { AssetClass, AssetData, DataPoint } from '../types';

/**
 * AI agent specializing in equity/stock valuation.
 * Uses P/E multiples, discounted cash flow (DCF), and dividend discount model (DDM).
 */
export class EquityAgent extends BaseValuationAgent {
  // Industry P/E multiples (trailing twelve months)
  private static readonly INDUSTRY_PE: Record<string, { pe: number; growth: number }> = {
    'technology': { pe: 28, growth: 0.15 },
    'healthcare': { pe: 22, growth: 0.10 },
    'financials': { pe: 12, growth: 0.05 },
    'energy': { pe: 10, growth: 0.03 },
    'consumer_discretionary': { pe: 20, growth: 0.08 },
    'consumer_staples': { pe: 18, growth: 0.04 },
    'industrials': { pe: 16, growth: 0.06 },
    'materials': { pe: 14, growth: 0.04 },
    'real_estate': { pe: 25, growth: 0.07 },
    'utilities': { pe: 15, growth: 0.03 },
    'communications': { pe: 19, growth: 0.09 },
    'default': { pe: 17, growth: 0.06 },
  };

  // Discount rates by risk profile
  private static readonly DISCOUNT_RATES: Record<string, number> = {
    'low': 0.08,
    'medium': 0.10,
    'high': 0.12,
    'very_high': 0.15,
    'default': 0.10,
  };

  // Market cap size premiums
  private static readonly SIZE_PREMIUMS: Record<string, number> = {
    'mega': 0.0,      // >$200B
    'large': 0.005,   // $10B-$200B
    'mid': 0.01,      // $2B-$10B
    'small': 0.02,    // $300M-$2B
    'micro': 0.04,    // <$300M
    'default': 0.01,
  };

  constructor() {
    super({
      id: 'equity-agent',
      name: 'Equity Valuation Agent',
      assetClasses: [AssetClass.EQUITY],
      description: 'Specializes in equity/stock valuation using P/E multiples, DCF analysis, and dividend discount model',
    });
  }

  protected async gatherData(asset: AssetData): Promise<DataPoint[]> {
    const dataPoints: DataPoint[] = [];
    const meta = asset.metadata;
    const now = new Date();

    // Earnings data
    const earnings = (meta.earnings as number) || 0;
    const revenue = (meta.revenue as number) || 0;
    const sharesOutstanding = (meta.sharesOutstanding as number) || 1;

    if (earnings > 0) {
      const eps = earnings / sharesOutstanding;
      dataPoints.push({
        source: 'financial_statements',
        metric: 'earnings_per_share',
        value: eps,
        timestamp: now,
        weight: 0.3,
      });
    }

    if (revenue > 0) {
      dataPoints.push({
        source: 'financial_statements',
        metric: 'revenue',
        value: revenue,
        timestamp: now,
        weight: 0.15,
      });

      // Profit margin
      if (earnings > 0) {
        dataPoints.push({
          source: 'financial_analysis',
          metric: 'profit_margin',
          value: earnings / revenue,
          timestamp: now,
          weight: 0.1,
        });
      }
    }

    // Industry P/E multiple
    const industry = ((meta.industry as string) || 'default').toLowerCase().replace(/\s+/g, '_');
    const industryData = EquityAgent.INDUSTRY_PE[industry] || EquityAgent.INDUSTRY_PE['default'];

    dataPoints.push({
      source: 'market_data',
      metric: 'industry_pe',
      value: industryData.pe,
      timestamp: now,
      weight: 0.2,
    });

    dataPoints.push({
      source: 'market_data',
      metric: 'industry_growth_rate',
      value: industryData.growth,
      timestamp: now,
      weight: 0.1,
    });

    // Free cash flow for DCF
    const freeCashFlow = (meta.freeCashFlow as number) || 0;
    if (freeCashFlow > 0) {
      dataPoints.push({
        source: 'financial_statements',
        metric: 'free_cash_flow',
        value: freeCashFlow,
        timestamp: now,
        weight: 0.25,
      });
    }

    // Dividend data for DDM
    const dividendPerShare = (meta.dividendPerShare as number) || 0;
    if (dividendPerShare > 0) {
      dataPoints.push({
        source: 'financial_statements',
        metric: 'dividend_per_share',
        value: dividendPerShare,
        timestamp: now,
        weight: 0.15,
      });
    }

    // Growth rate override
    const growthRate = (meta.growthRate as number) || industryData.growth;
    dataPoints.push({
      source: 'analyst_estimate',
      metric: 'growth_rate',
      value: growthRate,
      timestamp: now,
      weight: 0.1,
    });

    // Risk profile and discount rate
    const riskProfile = ((meta.riskProfile as string) || 'default').toLowerCase();
    const discountRate = EquityAgent.DISCOUNT_RATES[riskProfile] || EquityAgent.DISCOUNT_RATES['default'];

    dataPoints.push({
      source: 'risk_assessment',
      metric: 'discount_rate',
      value: discountRate,
      timestamp: now,
      weight: 0.1,
    });

    // Size premium
    const marketCapSize = ((meta.marketCapSize as string) || 'default').toLowerCase();
    const sizePremium = EquityAgent.SIZE_PREMIUMS[marketCapSize] ?? EquityAgent.SIZE_PREMIUMS['default'];

    dataPoints.push({
      source: 'risk_assessment',
      metric: 'size_premium',
      value: sizePremium,
      timestamp: now,
      weight: 0.05,
    });

    // Book value for P/B floor
    const bookValue = (meta.bookValue as number) || 0;
    if (bookValue > 0) {
      dataPoints.push({
        source: 'financial_statements',
        metric: 'book_value',
        value: bookValue,
        timestamp: now,
        weight: 0.1,
      });
    }

    // Shares outstanding
    dataPoints.push({
      source: 'market_data',
      metric: 'shares_outstanding',
      value: sharesOutstanding,
      timestamp: now,
      weight: 0.05,
    });

    return dataPoints;
  }

  protected async computeValuation(
    asset: AssetData,
    dataPoints: DataPoint[]
  ): Promise<{ value: number; confidence: number }> {
    const getDP = (metric: string) => dataPoints.find(dp => dp.metric === metric);

    const eps = getDP('earnings_per_share');
    const industryPE = getDP('industry_pe');
    const fcf = getDP('free_cash_flow');
    const dividend = getDP('dividend_per_share');
    const growthRate = getDP('growth_rate');
    const discountRate = getDP('discount_rate');
    const sizePremium = getDP('size_premium');
    const sharesOutstanding = getDP('shares_outstanding');
    const bookValue = getDP('book_value');

    const shares = (sharesOutstanding?.value as number) || 1;
    const growth = (growthRate?.value as number) || 0.06;
    const discount = (discountRate?.value as number) || 0.10;
    const sizeAdj = (sizePremium?.value as number) || 0.01;
    const adjDiscount = discount + sizeAdj;

    const valuations: { method: string; value: number }[] = [];

    // Method 1: P/E Multiple
    if (eps && industryPE && (eps.value as number) > 0) {
      const peValue = (eps.value as number) * (industryPE.value as number) * shares;
      valuations.push({ method: 'pe_multiple', value: peValue });
    }

    // Method 2: DCF (5-year projection + terminal value)
    if (fcf && (fcf.value as number) > 0) {
      let dcfValue = 0;
      let currentFCF = fcf.value as number;

      // 5-year projected cash flows
      for (let year = 1; year <= 5; year++) {
        currentFCF *= (1 + growth);
        dcfValue += currentFCF / Math.pow(1 + adjDiscount, year);
      }

      // Terminal value (Gordon Growth Model with 2% perpetual growth)
      const terminalGrowth = Math.min(growth, 0.03); // cap at 3%
      const terminalValue = (currentFCF * (1 + terminalGrowth)) / (adjDiscount - terminalGrowth);
      dcfValue += terminalValue / Math.pow(1 + adjDiscount, 5);

      valuations.push({ method: 'dcf', value: dcfValue });
    }

    // Method 3: Dividend Discount Model (Gordon Growth)
    if (dividend && (dividend.value as number) > 0 && adjDiscount > growth) {
      const ddmValue = ((dividend.value as number) * (1 + growth)) / (adjDiscount - growth) * shares;
      valuations.push({ method: 'ddm', value: ddmValue });
    }

    // Compute blended value
    if (valuations.length === 0) {
      // Fallback: use book value or minimal estimate
      const bv = (bookValue?.value as number) || 0;
      return {
        value: bv > 0 ? bv : 0,
        confidence: bv > 0 ? 0.3 : 0.1,
      };
    }

    // Weight methods: DCF gets highest weight when available
    let totalValue = 0;
    let totalWeight = 0;
    const methodWeights: Record<string, number> = {
      'pe_multiple': 0.35,
      'dcf': 0.45,
      'ddm': 0.20,
    };

    for (const v of valuations) {
      const w = methodWeights[v.method] || 0.33;
      totalValue += v.value * w;
      totalWeight += w;
    }

    const value = totalValue / totalWeight;

    // Floor at book value (margin of safety)
    const bv = (bookValue?.value as number) || 0;
    const finalValue = bv > 0 ? Math.max(value, bv * 0.8) : value;

    // Confidence based on number of methods and data quality
    let confidence = 0.5 + (valuations.length * 0.12);
    if (eps && (eps.value as number) > 0) confidence += 0.05;
    if (fcf && (fcf.value as number) > 0) confidence += 0.05;
    if (bookValue && (bookValue.value as number) > 0) confidence += 0.03;

    return {
      value: Math.round(finalValue * 100) / 100,
      confidence: Math.min(1, Math.max(0, confidence)),
    };
  }

  protected getMethodology(): string {
    return 'Blended equity valuation using P/E multiples (35%), discounted cash flow analysis (45%), and dividend discount model (20%). Adjusted for size premium and floored at 80% of book value.';
  }
}
