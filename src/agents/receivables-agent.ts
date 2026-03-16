import { BaseValuationAgent } from './base-agent';
import { AssetClass, AssetData, DataPoint } from '../types';

/**
 * AI agent specializing in accounts receivable / invoice factoring valuation.
 * Uses debtor creditworthiness, invoice aging, collection probability,
 * industry default rates, and concentration risk analysis.
 */
export class ReceivablesAgent extends BaseValuationAgent {
  // Industry-specific default rates (annual, as decimal)
  private static readonly INDUSTRY_DEFAULT_RATES: Record<string, number> = {
    'technology': 0.012,
    'healthcare': 0.008,
    'manufacturing': 0.015,
    'retail': 0.022,
    'construction': 0.028,
    'energy': 0.018,
    'financial_services': 0.006,
    'government': 0.002,
    'education': 0.005,
    'transportation': 0.020,
    'telecommunications': 0.014,
    'agriculture': 0.025,
    'hospitality': 0.030,
    'real_estate': 0.016,
    'professional_services': 0.010,
    'default': 0.018,
  };

  // Credit rating discount factors (spread over risk-free rate)
  private static readonly CREDIT_SPREADS: Record<string, number> = {
    'AAA': 0.005,
    'AA': 0.010,
    'A': 0.015,
    'BBB': 0.025,
    'BB': 0.040,
    'B': 0.060,
    'CCC': 0.100,
    'CC': 0.150,
    'C': 0.200,
    'D': 0.400,
    'unrated': 0.050,
  };

  // Collection probability by aging bucket (days past due)
  private static readonly AGING_COLLECTION_RATES: { maxDays: number; rate: number }[] = [
    { maxDays: 30, rate: 0.98 },
    { maxDays: 60, rate: 0.92 },
    { maxDays: 90, rate: 0.82 },
    { maxDays: 120, rate: 0.70 },
    { maxDays: 180, rate: 0.55 },
    { maxDays: 270, rate: 0.38 },
    { maxDays: 365, rate: 0.22 },
    { maxDays: Infinity, rate: 0.10 },
  ];

  // Risk-free rate (US Treasury 1-year proxy)
  private static readonly RISK_FREE_RATE = 0.045;

  constructor() {
    super({
      id: 'receivables-agent',
      name: 'Receivables Factoring Agent',
      assetClasses: [AssetClass.RECEIVABLE],
      description: 'Specializes in accounts receivable and invoice factoring valuation using debtor creditworthiness, aging analysis, industry default rates, and concentration risk',
    });
  }

  protected async gatherData(asset: AssetData): Promise<DataPoint[]> {
    const dataPoints: DataPoint[] = [];
    const meta = asset.metadata;
    const now = new Date();

    // Face value of receivable(s)
    const faceValue = (meta.faceValue as number) || 0;
    dataPoints.push({
      source: 'invoice_data',
      metric: 'face_value',
      value: faceValue,
      timestamp: now,
      weight: 0.3,
    });

    // Invoice aging (days since issuance)
    const daysPastDue = (meta.daysPastDue as number) || 0;
    const collectionRate = this.getCollectionRate(daysPastDue);
    dataPoints.push({
      source: 'aging_analysis',
      metric: 'days_past_due',
      value: daysPastDue,
      timestamp: now,
      weight: 0.2,
    });

    dataPoints.push({
      source: 'aging_analysis',
      metric: 'collection_probability',
      value: collectionRate,
      timestamp: now,
      weight: 0.25,
    });

    // Debtor credit rating
    const creditRating = (meta.creditRating as string) || 'unrated';
    const creditSpread = ReceivablesAgent.CREDIT_SPREADS[creditRating] ?? ReceivablesAgent.CREDIT_SPREADS['unrated'];
    dataPoints.push({
      source: 'credit_analysis',
      metric: 'credit_spread',
      value: creditSpread,
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

    // Industry default rate
    const industry = (meta.industry as string || 'default').toLowerCase().replace(/\s+/g, '_');
    const defaultRate = ReceivablesAgent.INDUSTRY_DEFAULT_RATES[industry] ?? ReceivablesAgent.INDUSTRY_DEFAULT_RATES['default'];
    dataPoints.push({
      source: 'industry_data',
      metric: 'default_rate',
      value: defaultRate,
      timestamp: now,
      weight: 0.1,
    });

    // Debtor payment history (0-1 score, 1 = perfect)
    const paymentHistory = (meta.paymentHistory as number) ?? 0.8;
    dataPoints.push({
      source: 'historical_data',
      metric: 'payment_history_score',
      value: Math.min(1, Math.max(0, paymentHistory)),
      timestamp: now,
      weight: 0.15,
    });

    // Concentration risk — % of portfolio from single debtor
    const concentrationPct = (meta.concentrationPct as number) || 0;
    if (concentrationPct > 0) {
      dataPoints.push({
        source: 'portfolio_analysis',
        metric: 'concentration_pct',
        value: concentrationPct,
        timestamp: now,
        weight: 0.05,
      });
    }

    // Days until maturity (for time-value discounting)
    const daysToMaturity = (meta.daysToMaturity as number) || Math.max(30, 90 - daysPastDue);
    dataPoints.push({
      source: 'invoice_data',
      metric: 'days_to_maturity',
      value: Math.max(1, daysToMaturity),
      timestamp: now,
      weight: 0.1,
    });

    // Number of invoices in pool (diversification)
    const invoiceCount = (meta.invoiceCount as number) || 1;
    dataPoints.push({
      source: 'pool_data',
      metric: 'invoice_count',
      value: invoiceCount,
      timestamp: now,
      weight: 0.05,
    });

    // Recourse vs non-recourse
    const hasRecourse = (meta.recourse as boolean) ?? false;
    dataPoints.push({
      source: 'contract_terms',
      metric: 'recourse',
      value: hasRecourse ? 1 : 0,
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

    const faceValue = (getDP('face_value')?.value as number) || 0;
    const collectionProb = (getDP('collection_probability')?.value as number) || 0.5;
    const creditSpread = (getDP('credit_spread')?.value as number) || 0.05;
    const defaultRate = (getDP('default_rate')?.value as number) || 0.018;
    const paymentHistory = (getDP('payment_history_score')?.value as number) || 0.8;
    const concentrationPct = (getDP('concentration_pct')?.value as number) || 0;
    const daysToMaturity = (getDP('days_to_maturity')?.value as number) || 30;
    const invoiceCount = (getDP('invoice_count')?.value as number) || 1;
    const hasRecourse = (getDP('recourse')?.value as number) || 0;
    const daysPastDue = (getDP('days_past_due')?.value as number) || 0;

    if (faceValue <= 0) {
      return { value: 0, confidence: 0.1 };
    }

    // Step 1: Expected collection amount
    // Blend collection probability with payment history
    const adjustedCollectionProb = collectionProb * 0.7 + paymentHistory * 0.3;
    let expectedCollection = faceValue * adjustedCollectionProb;

    // Step 2: Apply industry default risk
    expectedCollection *= (1 - defaultRate);

    // Step 3: Time-value discount (discount rate = risk-free + credit spread)
    const discountRate = ReceivablesAgent.RISK_FREE_RATE + creditSpread;
    const yearFraction = daysToMaturity / 365;
    const discountFactor = 1 / (1 + discountRate * yearFraction);
    let value = expectedCollection * discountFactor;

    // Step 4: Concentration risk penalty
    if (concentrationPct > 0.5) {
      // Significant single-debtor concentration — apply haircut
      const concentrationHaircut = 1 - (concentrationPct - 0.5) * 0.2;
      value *= Math.max(0.8, concentrationHaircut);
    }

    // Step 5: Recourse premium (recourse receivables are worth more)
    if (hasRecourse) {
      value *= 1.03; // 3% premium for recourse
    }

    // Step 6: Diversification bonus for pooled invoices
    if (invoiceCount > 10) {
      value *= 1.02; // 2% bonus for well-diversified pools
    }

    // Confidence calculation
    let confidence = 0.75; // Base confidence for receivables

    // Better credit rating → higher confidence
    if (creditSpread <= 0.015) {
      confidence += 0.10; // Investment grade
    } else if (creditSpread >= 0.10) {
      confidence -= 0.15; // Distressed
    }

    // Fresh invoices → higher confidence
    if (daysPastDue <= 30) {
      confidence += 0.05;
    } else if (daysPastDue > 180) {
      confidence -= 0.15;
    }

    // Diversified pools → higher confidence
    if (invoiceCount > 5) {
      confidence += 0.05;
    }

    // Good payment history → higher confidence
    if (paymentHistory >= 0.95) {
      confidence += 0.05;
    } else if (paymentHistory < 0.6) {
      confidence -= 0.10;
    }

    // Low data → reduce confidence
    if (dataPoints.length < 6) {
      confidence *= 0.85;
    }

    return {
      value: Math.round(value * 100) / 100,
      confidence: Math.min(1, Math.max(0, confidence)),
    };
  }

  /**
   * Get collection probability based on days past due.
   */
  private getCollectionRate(daysPastDue: number): number {
    for (const bucket of ReceivablesAgent.AGING_COLLECTION_RATES) {
      if (daysPastDue <= bucket.maxDays) {
        return bucket.rate;
      }
    }
    return 0.10;
  }

  protected getMethodology(): string {
    return 'Receivables factoring valuation using expected collection analysis (aging-weighted collection probability × payment history blend), industry default rate adjustment, time-value discounting (risk-free + credit spread), concentration risk penalties, and recourse/diversification premiums';
  }
}
