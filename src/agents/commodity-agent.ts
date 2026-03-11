import { BaseValuationAgent } from './base-agent';
import { AssetClass, AssetData, DataPoint } from '../types';

/**
 * AI agent specializing in commodity valuation.
 * Uses spot prices, historical trends, supply/demand factors, and seasonal adjustments.
 */
export class CommodityAgent extends BaseValuationAgent {
  // Simulated spot prices (USD per unit)
  private static readonly SPOT_PRICES: Record<string, { price: number; unit: string; volatility: number }> = {
    'gold': { price: 2650, unit: 'oz', volatility: 0.12 },
    'silver': { price: 31.5, unit: 'oz', volatility: 0.22 },
    'platinum': { price: 1020, unit: 'oz', volatility: 0.18 },
    'crude_oil': { price: 78.5, unit: 'barrel', volatility: 0.28 },
    'natural_gas': { price: 3.2, unit: 'mmbtu', volatility: 0.35 },
    'copper': { price: 4.15, unit: 'lb', volatility: 0.20 },
    'wheat': { price: 5.8, unit: 'bushel', volatility: 0.25 },
    'corn': { price: 4.5, unit: 'bushel', volatility: 0.22 },
    'soybeans': { price: 12.3, unit: 'bushel', volatility: 0.20 },
    'coffee': { price: 3.8, unit: 'lb', volatility: 0.30 },
    'lumber': { price: 580, unit: '1000bf', volatility: 0.35 },
    'cotton': { price: 0.82, unit: 'lb', volatility: 0.25 },
  };

  // Seasonal adjustment factors by quarter
  private static readonly SEASONAL_FACTORS: Record<string, number[]> = {
    'crude_oil': [1.02, 0.98, 1.05, 0.95],
    'natural_gas': [1.15, 0.85, 0.90, 1.10],
    'wheat': [0.95, 1.05, 1.10, 0.90],
    'corn': [0.98, 1.02, 1.08, 0.92],
    'coffee': [1.05, 0.95, 0.98, 1.02],
    'default': [1.0, 1.0, 1.0, 1.0],
  };

  constructor() {
    super({
      id: 'commodity-agent',
      name: 'Commodity Valuation Agent',
      assetClasses: [AssetClass.COMMODITY],
      description: 'Specializes in commodity valuation using spot prices, supply/demand analysis, and seasonal adjustments',
    });
  }

  protected async gatherData(asset: AssetData): Promise<DataPoint[]> {
    const dataPoints: DataPoint[] = [];
    const meta = asset.metadata;
    const now = new Date();

    const commodity = (meta.commodity as string || '').toLowerCase().replace(/\s+/g, '_');
    const spotData = CommodityAgent.SPOT_PRICES[commodity];

    if (spotData) {
      dataPoints.push({
        source: 'market_data',
        metric: 'spot_price',
        value: spotData.price,
        timestamp: now,
        weight: 0.5,
      });

      dataPoints.push({
        source: 'market_data',
        metric: 'volatility',
        value: spotData.volatility,
        timestamp: now,
        weight: 0.15,
      });

      // Seasonal adjustment
      const quarter = Math.floor(now.getMonth() / 3);
      const seasonalFactors = CommodityAgent.SEASONAL_FACTORS[commodity] || CommodityAgent.SEASONAL_FACTORS['default'];
      dataPoints.push({
        source: 'seasonal_analysis',
        metric: 'seasonal_factor',
        value: seasonalFactors[quarter],
        timestamp: now,
        weight: 0.1,
      });
    }

    // Quantity
    const quantity = (meta.quantity as number) || 1;
    dataPoints.push({
      source: 'asset_data',
      metric: 'quantity',
      value: quantity,
      timestamp: now,
      weight: 0.25,
    });

    // Purity/Grade factor
    const grade = (meta.grade as string) || 'standard';
    const gradeFactors: Record<string, number> = {
      'premium': 1.05,
      'standard': 1.0,
      'substandard': 0.90,
    };
    dataPoints.push({
      source: 'quality_assessment',
      metric: 'grade_factor',
      value: gradeFactors[grade] || 1.0,
      timestamp: now,
      weight: 0.1,
    });

    // Storage/delivery cost adjustment
    const storageCostPerUnit = (meta.storageCostPerUnit as number) || 0;
    if (storageCostPerUnit > 0) {
      dataPoints.push({
        source: 'logistics',
        metric: 'storage_cost',
        value: storageCostPerUnit,
        timestamp: now,
        weight: 0.05,
      });
    }

    return dataPoints;
  }

  protected async computeValuation(
    asset: AssetData,
    dataPoints: DataPoint[]
  ): Promise<{ value: number; confidence: number }> {
    const getDP = (metric: string) => dataPoints.find(dp => dp.metric === metric);

    const spotPrice = getDP('spot_price');
    const quantity = getDP('quantity');
    const seasonalFactor = getDP('seasonal_factor');
    const gradeFactor = getDP('grade_factor');
    const storageCost = getDP('storage_cost');
    const volatility = getDP('volatility');

    if (!spotPrice || !quantity) {
      return { value: 0, confidence: 0.1 };
    }

    let baseValue = (spotPrice.value as number) * (quantity.value as number);

    // Apply seasonal adjustment
    if (seasonalFactor) {
      baseValue *= seasonalFactor.value as number;
    }

    // Apply grade factor
    if (gradeFactor) {
      baseValue *= gradeFactor.value as number;
    }

    // Subtract storage costs
    if (storageCost) {
      baseValue -= (storageCost.value as number) * (quantity.value as number);
    }

    // Confidence based on volatility
    let confidence = 0.85;
    if (volatility) {
      // Higher volatility → lower confidence
      confidence = Math.max(0.4, 0.95 - (volatility.value as number));
    }

    return {
      value: Math.round(baseValue * 100) / 100,
      confidence: Math.min(1, Math.max(0, confidence)),
    };
  }

  protected getMethodology(): string {
    return 'Spot price analysis with seasonal adjustments, quality grading, and storage cost deductions. Confidence inversely correlated with historical volatility.';
  }
}
