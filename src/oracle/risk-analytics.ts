import { AssetClass, ConsensusResult, PortfolioAsset } from '../types';

/**
 * Portfolio risk analytics for RWA portfolios.
 * Provides diversification scoring, concentration analysis,
 * stress testing, and risk-adjusted performance metrics.
 */

export interface RiskReport {
  portfolioValue: number;
  assetCount: number;
  diversificationScore: number;  // 0-100
  concentrationRisk: ConcentrationRisk;
  stressTestResults: StressTestResult[];
  confidenceAnalysis: ConfidenceAnalysis;
  riskRating: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

export interface ConcentrationRisk {
  herfindahlIndex: number;        // HHI: 0-10000
  largestPosition: number;        // % of portfolio
  largestPositionAsset: string;
  assetClassBreakdown: Record<string, number>;  // class -> % allocation
}

export interface StressTestResult {
  scenario: string;
  priceShock: number;             // e.g., -0.20 = 20% drop
  portfolioImpact: number;        // absolute USD loss
  portfolioImpactPct: number;     // % loss
  assetsAffected: number;
}

export interface ConfidenceAnalysis {
  avgConfidence: number;
  minConfidence: number;
  maxConfidence: number;
  lowConfidenceAssets: string[];   // assets with confidence < 0.5
  weightedConfidence: number;     // value-weighted confidence
}

/**
 * Analyze risk metrics for a portfolio of RWA assets.
 */
export function analyzePortfolioRisk(
  assets: PortfolioAsset[],
  valuations: Map<string, ConsensusResult>
): RiskReport {
  const valuedAssets = assets.filter(a => valuations.has(a.assetData.id));

  if (valuedAssets.length === 0) {
    return emptyReport();
  }

  const portfolioValue = computePortfolioValue(valuedAssets, valuations);
  const concentrationRisk = computeConcentration(valuedAssets, valuations, portfolioValue);
  const diversificationScore = computeDiversification(valuedAssets, concentrationRisk);
  const stressTestResults = runStressTests(valuedAssets, valuations, portfolioValue);
  const confidenceAnalysis = computeConfidenceAnalysis(valuedAssets, valuations, portfolioValue);

  const riskRating = deriveRiskRating(
    diversificationScore,
    concentrationRisk,
    confidenceAnalysis,
    stressTestResults
  );

  return {
    portfolioValue,
    assetCount: valuedAssets.length,
    diversificationScore,
    concentrationRisk,
    stressTestResults,
    confidenceAnalysis,
    riskRating,
  };
}

function emptyReport(): RiskReport {
  return {
    portfolioValue: 0,
    assetCount: 0,
    diversificationScore: 0,
    concentrationRisk: {
      herfindahlIndex: 10000,
      largestPosition: 0,
      largestPositionAsset: '',
      assetClassBreakdown: {},
    },
    stressTestResults: [],
    confidenceAnalysis: {
      avgConfidence: 0,
      minConfidence: 0,
      maxConfidence: 0,
      lowConfidenceAssets: [],
      weightedConfidence: 0,
    },
    riskRating: 'CRITICAL',
  };
}

function computePortfolioValue(
  assets: PortfolioAsset[],
  valuations: Map<string, ConsensusResult>
): number {
  return assets.reduce((sum, a) => {
    const v = valuations.get(a.assetData.id);
    return sum + (v ? v.consensusValue : 0);
  }, 0);
}

function computeConcentration(
  assets: PortfolioAsset[],
  valuations: Map<string, ConsensusResult>,
  portfolioValue: number
): ConcentrationRisk {
  if (portfolioValue === 0) {
    return {
      herfindahlIndex: 10000,
      largestPosition: 0,
      largestPositionAsset: '',
      assetClassBreakdown: {},
    };
  }

  const weights: { assetId: string; weight: number; assetClass: AssetClass }[] = [];

  for (const asset of assets) {
    const v = valuations.get(asset.assetData.id);
    if (!v) continue;
    weights.push({
      assetId: asset.assetData.id,
      weight: v.consensusValue / portfolioValue,
      assetClass: asset.assetData.assetClass,
    });
  }

  // Herfindahl-Hirschman Index (sum of squared weights * 10000)
  const hhi = Math.round(
    weights.reduce((sum, w) => sum + w.weight * w.weight, 0) * 10000
  );

  // Largest position
  const sorted = [...weights].sort((a, b) => b.weight - a.weight);
  const largest = sorted[0];

  // Asset class breakdown
  const classBreakdown: Record<string, number> = {};
  for (const w of weights) {
    classBreakdown[w.assetClass] = (classBreakdown[w.assetClass] || 0) + w.weight * 100;
  }
  // Round to 2 decimals
  for (const key in classBreakdown) {
    classBreakdown[key] = Math.round(classBreakdown[key] * 100) / 100;
  }

  return {
    herfindahlIndex: hhi,
    largestPosition: Math.round(largest.weight * 10000) / 100,
    largestPositionAsset: largest.assetId,
    assetClassBreakdown: classBreakdown,
  };
}

function computeDiversification(
  assets: PortfolioAsset[],
  concentration: ConcentrationRisk
): number {
  if (assets.length === 0) return 0;

  // Factors:
  // 1. Number of assets (more = better, up to ~10)
  const assetCountScore = Math.min(assets.length / 10, 1) * 30;

  // 2. HHI (lower = more diversified). Perfect = 1/n*10000, worst = 10000
  const maxHHI = 10000;
  const minHHI = Math.round(10000 / assets.length);
  const hhiRange = maxHHI - minHHI;
  const hhiScore = hhiRange > 0
    ? ((maxHHI - concentration.herfindahlIndex) / hhiRange) * 40
    : 0;

  // 3. Number of distinct asset classes (more = better)
  const classCount = Object.keys(concentration.assetClassBreakdown).length;
  const maxClasses = 5; // AssetClass enum count
  const classScore = Math.min(classCount / maxClasses, 1) * 30;

  return Math.round(assetCountScore + hhiScore + classScore);
}

/**
 * Run predefined stress test scenarios on the portfolio.
 */
function runStressTests(
  assets: PortfolioAsset[],
  valuations: Map<string, ConsensusResult>,
  portfolioValue: number
): StressTestResult[] {
  const scenarios: { name: string; shocks: Partial<Record<AssetClass, number>> }[] = [
    {
      name: 'Real Estate Crash (-30%)',
      shocks: { [AssetClass.REAL_ESTATE]: -0.30 },
    },
    {
      name: 'Commodity Crash (-40%)',
      shocks: { [AssetClass.COMMODITY]: -0.40 },
    },
    {
      name: 'Interest Rate Spike (Treasuries -15%)',
      shocks: { [AssetClass.TREASURY]: -0.15 },
    },
    {
      name: 'Broad Market Stress (-20% all)',
      shocks: {
        [AssetClass.REAL_ESTATE]: -0.20,
        [AssetClass.COMMODITY]: -0.20,
        [AssetClass.TREASURY]: -0.20,
        [AssetClass.EQUITY]: -0.20,
        [AssetClass.RECEIVABLE]: -0.20,
      },
    },
    {
      name: 'Stagflation (RE -25%, Commodities +15%, Treasuries -20%)',
      shocks: {
        [AssetClass.REAL_ESTATE]: -0.25,
        [AssetClass.COMMODITY]: 0.15,
        [AssetClass.TREASURY]: -0.20,
      },
    },
  ];

  return scenarios.map(scenario => {
    let impact = 0;
    let affected = 0;

    for (const asset of assets) {
      const v = valuations.get(asset.assetData.id);
      if (!v) continue;

      const shock = scenario.shocks[asset.assetData.assetClass];
      if (shock !== undefined && shock !== 0) {
        impact += v.consensusValue * shock;
        affected++;
      }
    }

    return {
      scenario: scenario.name,
      priceShock: Object.values(scenario.shocks)[0] || 0,
      portfolioImpact: Math.round(impact * 100) / 100,
      portfolioImpactPct: portfolioValue > 0
        ? Math.round((impact / portfolioValue) * 10000) / 100
        : 0,
      assetsAffected: affected,
    };
  });
}

function computeConfidenceAnalysis(
  assets: PortfolioAsset[],
  valuations: Map<string, ConsensusResult>,
  portfolioValue: number
): ConfidenceAnalysis {
  const confidences: { id: string; confidence: number; value: number }[] = [];

  for (const asset of assets) {
    const v = valuations.get(asset.assetData.id);
    if (!v) continue;
    confidences.push({
      id: asset.assetData.id,
      confidence: v.avgConfidence,
      value: v.consensusValue,
    });
  }

  if (confidences.length === 0) {
    return {
      avgConfidence: 0,
      minConfidence: 0,
      maxConfidence: 0,
      lowConfidenceAssets: [],
      weightedConfidence: 0,
    };
  }

  const avgConfidence = confidences.reduce((s, c) => s + c.confidence, 0) / confidences.length;
  const minConfidence = Math.min(...confidences.map(c => c.confidence));
  const maxConfidence = Math.max(...confidences.map(c => c.confidence));
  const lowConfidenceAssets = confidences
    .filter(c => c.confidence < 0.5)
    .map(c => c.id);

  const weightedConfidence = portfolioValue > 0
    ? confidences.reduce((s, c) => s + c.confidence * c.value, 0) / portfolioValue
    : 0;

  return {
    avgConfidence: Math.round(avgConfidence * 10000) / 10000,
    minConfidence: Math.round(minConfidence * 10000) / 10000,
    maxConfidence: Math.round(maxConfidence * 10000) / 10000,
    lowConfidenceAssets,
    weightedConfidence: Math.round(weightedConfidence * 10000) / 10000,
  };
}

function deriveRiskRating(
  diversification: number,
  concentration: ConcentrationRisk,
  confidence: ConfidenceAnalysis,
  stressTests: StressTestResult[]
): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
  let riskScore = 0;

  // Low diversification = higher risk
  if (diversification < 20) riskScore += 3;
  else if (diversification < 40) riskScore += 2;
  else if (diversification < 60) riskScore += 1;

  // High concentration = higher risk (HHI > 5000 = highly concentrated)
  if (concentration.herfindahlIndex > 7500) riskScore += 3;
  else if (concentration.herfindahlIndex > 5000) riskScore += 2;
  else if (concentration.herfindahlIndex > 2500) riskScore += 1;

  // Low confidence = higher risk
  if (confidence.weightedConfidence < 0.3) riskScore += 3;
  else if (confidence.weightedConfidence < 0.5) riskScore += 2;
  else if (confidence.weightedConfidence < 0.7) riskScore += 1;

  // Worst-case stress test > 30% loss
  const worstLoss = Math.min(...stressTests.map(s => s.portfolioImpactPct));
  if (worstLoss < -30) riskScore += 2;
  else if (worstLoss < -20) riskScore += 1;

  if (riskScore >= 8) return 'CRITICAL';
  if (riskScore >= 5) return 'HIGH';
  if (riskScore >= 3) return 'MEDIUM';
  return 'LOW';
}
