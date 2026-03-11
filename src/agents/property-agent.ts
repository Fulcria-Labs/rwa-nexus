import { BaseValuationAgent } from './base-agent';
import { AssetClass, AssetData, DataPoint } from '../types';

/**
 * AI agent specializing in real estate valuation.
 * Uses comparable sales analysis, income approach, and location factors.
 */
export class PropertyAgent extends BaseValuationAgent {
  // Simulated market data for demo (in production, these would come from APIs)
  private static readonly PRICE_PER_SQFT: Record<string, number> = {
    'manhattan': 1800,
    'brooklyn': 950,
    'san_francisco': 1200,
    'los_angeles': 750,
    'miami': 600,
    'chicago': 350,
    'austin': 400,
    'seattle': 650,
    'hong_kong': 2500,
    'singapore': 1900,
    'london': 1600,
    'default': 300,
  };

  private static readonly CAP_RATES: Record<string, number> = {
    'residential': 0.05,
    'commercial': 0.07,
    'industrial': 0.08,
    'retail': 0.065,
    'default': 0.06,
  };

  constructor() {
    super({
      id: 'property-agent',
      name: 'Real Estate Valuation Agent',
      assetClasses: [AssetClass.REAL_ESTATE],
      description: 'Specializes in real estate valuation using comparable sales, income approach, and location analysis',
    });
  }

  protected async gatherData(asset: AssetData): Promise<DataPoint[]> {
    const dataPoints: DataPoint[] = [];
    const meta = asset.metadata;
    const now = new Date();

    // Location-based comparable sales
    const location = (asset.location || 'default').toLowerCase().replace(/\s+/g, '_');
    const pricePerSqft = PropertyAgent.PRICE_PER_SQFT[location] || PropertyAgent.PRICE_PER_SQFT['default'];

    dataPoints.push({
      source: 'comparable_sales',
      metric: 'price_per_sqft',
      value: pricePerSqft,
      timestamp: now,
      weight: 0.4,
    });

    // Square footage
    const sqft = (meta.squareFeet as number) || 1000;
    dataPoints.push({
      source: 'property_data',
      metric: 'square_feet',
      value: sqft,
      timestamp: now,
      weight: 0.3,
    });

    // Income approach (if rental data available)
    const annualRent = meta.annualRent as number | undefined;
    if (annualRent) {
      const propertyType = (meta.propertyType as string) || 'default';
      const capRate = PropertyAgent.CAP_RATES[propertyType] || PropertyAgent.CAP_RATES['default'];

      dataPoints.push({
        source: 'income_approach',
        metric: 'annual_rent',
        value: annualRent,
        timestamp: now,
        weight: 0.3,
      });

      dataPoints.push({
        source: 'market_data',
        metric: 'cap_rate',
        value: capRate,
        timestamp: now,
        weight: 0.2,
      });
    }

    // Property condition factor
    const condition = (meta.condition as string) || 'good';
    const conditionFactors: Record<string, number> = {
      'excellent': 1.15,
      'good': 1.0,
      'fair': 0.85,
      'poor': 0.7,
    };

    dataPoints.push({
      source: 'inspection',
      metric: 'condition_factor',
      value: conditionFactors[condition] || 1.0,
      timestamp: now,
      weight: 0.1,
    });

    // Year built depreciation
    const yearBuilt = meta.yearBuilt as number | undefined;
    if (yearBuilt) {
      const age = new Date().getFullYear() - yearBuilt;
      const depreciation = Math.max(0.5, 1 - age * 0.005); // 0.5% per year, min 50%
      dataPoints.push({
        source: 'depreciation',
        metric: 'age_factor',
        value: depreciation,
        timestamp: now,
        weight: 0.1,
      });
    }

    return dataPoints;
  }

  protected async computeValuation(
    asset: AssetData,
    dataPoints: DataPoint[]
  ): Promise<{ value: number; confidence: number }> {
    const getDP = (metric: string) => dataPoints.find(dp => dp.metric === metric);

    const priceSqft = getDP('price_per_sqft');
    const sqft = getDP('square_feet');
    const annualRent = getDP('annual_rent');
    const capRate = getDP('cap_rate');
    const condition = getDP('condition_factor');
    const ageFactor = getDP('age_factor');

    // Comparable sales approach
    let comparableValue = 0;
    if (priceSqft && sqft) {
      comparableValue = (priceSqft.value as number) * (sqft.value as number);
    }

    // Income approach
    let incomeValue = 0;
    if (annualRent && capRate) {
      incomeValue = (annualRent.value as number) / (capRate.value as number);
    }

    // Blend approaches
    let value: number;
    let confidence: number;

    if (comparableValue > 0 && incomeValue > 0) {
      // Both approaches available — higher confidence
      value = comparableValue * 0.6 + incomeValue * 0.4;
      confidence = 0.85;
    } else if (comparableValue > 0) {
      value = comparableValue;
      confidence = 0.7;
    } else {
      value = incomeValue || 100000; // fallback
      confidence = 0.5;
    }

    // Apply condition and age adjustments
    if (condition) {
      value *= condition.value as number;
    }
    if (ageFactor) {
      value *= ageFactor.value as number;
    }

    // Reduce confidence if minimal data
    if (dataPoints.length < 4) {
      confidence *= 0.8;
    }

    return {
      value: Math.round(value * 100) / 100,
      confidence: Math.min(1, Math.max(0, confidence)),
    };
  }

  protected getMethodology(): string {
    return 'Blended comparable sales analysis (60%) and income capitalization approach (40%), adjusted for property condition and age depreciation';
  }
}
