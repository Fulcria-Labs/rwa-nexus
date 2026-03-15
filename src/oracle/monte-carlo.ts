import { AssetClass, ConsensusResult, PortfolioAsset } from '../types';

/**
 * Monte Carlo VaR/CVaR Risk Engine for RWA Portfolios.
 *
 * Simulates thousands of correlated asset return scenarios to compute:
 * - Value at Risk (VaR) at configurable confidence levels
 * - Conditional VaR (Expected Shortfall) for tail risk
 * - Portfolio return distributions with percentile analysis
 * - Correlation-aware scenario generation
 * - Maximum drawdown estimation
 */

export interface MonteCarloConfig {
  numSimulations: number;       // Number of Monte Carlo paths (default: 10000)
  timeHorizonDays: number;      // Projection period in days (default: 30)
  confidenceLevels: number[];   // VaR confidence levels e.g. [0.95, 0.99]
  seed?: number;                // Optional seed for reproducibility
}

export interface AssetReturnProfile {
  assetClass: AssetClass;
  annualizedReturn: number;     // Expected annual return (e.g., 0.08 = 8%)
  annualizedVolatility: number; // Annual volatility (e.g., 0.15 = 15%)
}

export interface CorrelationMatrix {
  assetClasses: AssetClass[];
  matrix: number[][];           // NxN correlation matrix
}

export interface VaRResult {
  confidenceLevel: number;
  valueAtRisk: number;          // Maximum expected loss at confidence level (positive = loss)
  valueAtRiskPct: number;       // As percentage of portfolio
  conditionalVaR: number;       // Expected loss beyond VaR (positive = loss)
  conditionalVaRPct: number;    // As percentage of portfolio
}

export interface MonteCarloResult {
  portfolioValue: number;
  numSimulations: number;
  timeHorizonDays: number;
  varResults: VaRResult[];
  returnDistribution: ReturnDistribution;
  maxDrawdownEstimate: number;
  maxDrawdownPct: number;
  expectedReturn: number;
  expectedReturnPct: number;
  worstCase: number;
  bestCase: number;
  medianReturn: number;
}

export interface ReturnDistribution {
  mean: number;
  stdDev: number;
  skewness: number;
  kurtosis: number;
  percentiles: Record<string, number>; // "p5", "p10", "p25", "p50", "p75", "p90", "p95"
}

// Default return profiles based on historical RWA asset class characteristics
const DEFAULT_RETURN_PROFILES: Record<AssetClass, AssetReturnProfile> = {
  [AssetClass.REAL_ESTATE]: {
    assetClass: AssetClass.REAL_ESTATE,
    annualizedReturn: 0.08,
    annualizedVolatility: 0.14,
  },
  [AssetClass.COMMODITY]: {
    assetClass: AssetClass.COMMODITY,
    annualizedReturn: 0.05,
    annualizedVolatility: 0.22,
  },
  [AssetClass.TREASURY]: {
    assetClass: AssetClass.TREASURY,
    annualizedReturn: 0.04,
    annualizedVolatility: 0.06,
  },
  [AssetClass.EQUITY]: {
    assetClass: AssetClass.EQUITY,
    annualizedReturn: 0.10,
    annualizedVolatility: 0.18,
  },
  [AssetClass.RECEIVABLE]: {
    assetClass: AssetClass.RECEIVABLE,
    annualizedReturn: 0.06,
    annualizedVolatility: 0.10,
  },
};

// Default cross-asset correlation matrix (symmetric)
const DEFAULT_CORRELATION: CorrelationMatrix = {
  assetClasses: [
    AssetClass.REAL_ESTATE,
    AssetClass.COMMODITY,
    AssetClass.TREASURY,
    AssetClass.EQUITY,
    AssetClass.RECEIVABLE,
  ],
  matrix: [
    [1.00, 0.25, -0.10, 0.55, 0.30],  // RE
    [0.25, 1.00, -0.15, 0.35, 0.10],   // Commodity
    [-0.10, -0.15, 1.00, -0.30, 0.20], // Treasury
    [0.55, 0.35, -0.30, 1.00, 0.25],   // Equity
    [0.30, 0.10, 0.20, 0.25, 1.00],    // Receivable
  ],
};

/**
 * Seeded pseudo-random number generator (xoshiro128**).
 * Provides reproducible random sequences for Monte Carlo simulation.
 */
export class SeededRNG {
  private s: Uint32Array;

  constructor(seed: number) {
    this.s = new Uint32Array(4);
    // SplitMix32 to initialize state
    let z = seed | 0;
    for (let i = 0; i < 4; i++) {
      z = (z + 0x9e3779b9) | 0;
      let t = z ^ (z >>> 16);
      t = Math.imul(t, 0x21f0aaad);
      t = t ^ (t >>> 15);
      t = Math.imul(t, 0x735a2d97);
      t = t ^ (t >>> 15);
      this.s[i] = t >>> 0;
    }
  }

  /** Returns a uniform random float in [0, 1) */
  next(): number {
    const s = this.s;
    const result = Math.imul(s[1] * 5, 7) >>> 0;
    const t = s[1] << 9;

    s[2] ^= s[0];
    s[3] ^= s[1];
    s[1] ^= s[2];
    s[0] ^= s[3];

    s[2] ^= t;
    s[3] = ((s[3] << 11) | (s[3] >>> 21)) >>> 0;

    return (result >>> 0) / 0x100000000;
  }

  /** Box-Muller transform for standard normal distribution */
  nextGaussian(): number {
    const u1 = this.next();
    const u2 = this.next();
    // Avoid log(0)
    const r = Math.sqrt(-2 * Math.log(u1 || 1e-10));
    return r * Math.cos(2 * Math.PI * u2);
  }
}

/**
 * Cholesky decomposition of a positive semi-definite matrix.
 * Used to generate correlated random variables from independent ones.
 */
export function choleskyDecomposition(matrix: number[][]): number[][] {
  const n = matrix.length;
  const L: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));

  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = 0;
      for (let k = 0; k < j; k++) {
        sum += L[i][k] * L[j][k];
      }

      if (i === j) {
        const val = matrix[i][i] - sum;
        L[i][j] = val > 0 ? Math.sqrt(val) : 0;
      } else {
        L[i][j] = L[j][j] !== 0 ? (matrix[i][j] - sum) / L[j][j] : 0;
      }
    }
  }

  return L;
}

/**
 * Run Monte Carlo VaR/CVaR simulation for a portfolio.
 */
export function runMonteCarloSimulation(
  assets: PortfolioAsset[],
  valuations: Map<string, ConsensusResult>,
  config: Partial<MonteCarloConfig> = {},
  returnProfiles: Record<string, AssetReturnProfile> = {},
  correlationOverride?: CorrelationMatrix
): MonteCarloResult {
  const fullConfig: MonteCarloConfig = {
    numSimulations: config.numSimulations ?? 10000,
    timeHorizonDays: config.timeHorizonDays ?? 30,
    confidenceLevels: config.confidenceLevels ?? [0.95, 0.99],
    seed: config.seed,
  };

  // Filter to assets with valuations
  const valuedAssets = assets.filter(a => valuations.has(a.assetData.id));
  if (valuedAssets.length === 0) {
    return emptyMonteCarloResult(fullConfig);
  }

  const portfolioValue = valuedAssets.reduce((sum, a) => {
    const v = valuations.get(a.assetData.id)!;
    return sum + v.consensusValue;
  }, 0);

  if (portfolioValue <= 0) {
    return emptyMonteCarloResult(fullConfig);
  }

  // Get return profiles for each asset
  const profiles: AssetReturnProfile[] = valuedAssets.map(a => {
    const custom = returnProfiles[a.assetData.id];
    if (custom) return custom;
    return DEFAULT_RETURN_PROFILES[a.assetData.assetClass] || DEFAULT_RETURN_PROFILES[AssetClass.EQUITY];
  });

  // Asset weights
  const weights = valuedAssets.map(a => {
    const v = valuations.get(a.assetData.id)!;
    return v.consensusValue / portfolioValue;
  });

  // Build correlation matrix for portfolio assets
  const correlation = correlationOverride || DEFAULT_CORRELATION;
  const corrMatrix = buildPortfolioCorrelationMatrix(valuedAssets, correlation);

  // Cholesky decomposition for correlated sampling
  const choleskyL = choleskyDecomposition(corrMatrix);

  // Scale returns to time horizon
  const timeFraction = fullConfig.timeHorizonDays / 365;
  const sqrtTime = Math.sqrt(timeFraction);

  // RNG
  const rng = new SeededRNG(fullConfig.seed ?? Date.now());

  // Simulate portfolio returns
  const portfolioReturns: number[] = new Array(fullConfig.numSimulations);

  for (let sim = 0; sim < fullConfig.numSimulations; sim++) {
    // Generate independent standard normals
    const z: number[] = new Array(valuedAssets.length);
    for (let i = 0; i < valuedAssets.length; i++) {
      z[i] = rng.nextGaussian();
    }

    // Apply Cholesky to get correlated normals
    const correlated: number[] = new Array(valuedAssets.length);
    for (let i = 0; i < valuedAssets.length; i++) {
      let sum = 0;
      for (let j = 0; j <= i; j++) {
        sum += choleskyL[i][j] * z[j];
      }
      correlated[i] = sum;
    }

    // Compute portfolio return
    let portfolioReturn = 0;
    for (let i = 0; i < valuedAssets.length; i++) {
      const drift = (profiles[i].annualizedReturn - 0.5 * profiles[i].annualizedVolatility ** 2) * timeFraction;
      const diffusion = profiles[i].annualizedVolatility * sqrtTime * correlated[i];
      const assetReturn = Math.exp(drift + diffusion) - 1;
      portfolioReturn += weights[i] * assetReturn;
    }

    portfolioReturns[sim] = portfolioReturn;
  }

  // Sort for percentile analysis
  portfolioReturns.sort((a, b) => a - b);

  // Compute VaR results
  const varResults = fullConfig.confidenceLevels.map(cl => {
    return computeVaR(portfolioReturns, portfolioValue, cl);
  });

  // Return distribution statistics
  const returnDistribution = computeDistribution(portfolioReturns, portfolioValue);

  // Expected return
  const expectedReturn = portfolioReturns.reduce((s, r) => s + r, 0) / portfolioReturns.length;

  // Max drawdown estimate (worst scenario)
  const worstReturn = portfolioReturns[0];
  const bestReturn = portfolioReturns[portfolioReturns.length - 1];
  const medianReturn = portfolioReturns[Math.floor(portfolioReturns.length / 2)];

  return {
    portfolioValue,
    numSimulations: fullConfig.numSimulations,
    timeHorizonDays: fullConfig.timeHorizonDays,
    varResults,
    returnDistribution,
    maxDrawdownEstimate: Math.round(Math.abs(worstReturn * portfolioValue) * 100) / 100,
    maxDrawdownPct: Math.round(worstReturn * 10000) / 100,
    expectedReturn: Math.round(expectedReturn * portfolioValue * 100) / 100,
    expectedReturnPct: Math.round(expectedReturn * 10000) / 100,
    worstCase: Math.round(worstReturn * portfolioValue * 100) / 100,
    bestCase: Math.round(bestReturn * portfolioValue * 100) / 100,
    medianReturn: Math.round(medianReturn * portfolioValue * 100) / 100,
  };
}

function computeVaR(
  sortedReturns: number[],
  portfolioValue: number,
  confidenceLevel: number
): VaRResult {
  const n = sortedReturns.length;
  const varIndex = Math.floor(n * (1 - confidenceLevel));

  // VaR: loss at the confidence level threshold
  const varReturn = sortedReturns[varIndex];
  const var$ = Math.abs(Math.min(varReturn, 0)) * portfolioValue;

  // CVaR: average of all losses beyond VaR
  let cvarSum = 0;
  let cvarCount = 0;
  for (let i = 0; i <= varIndex; i++) {
    cvarSum += sortedReturns[i];
    cvarCount++;
  }
  const avgTailReturn = cvarCount > 0 ? cvarSum / cvarCount : 0;
  const cvar$ = Math.abs(Math.min(avgTailReturn, 0)) * portfolioValue;

  return {
    confidenceLevel,
    valueAtRisk: Math.round(var$ * 100) / 100,
    valueAtRiskPct: Math.round(Math.abs(Math.min(varReturn, 0)) * 10000) / 100,
    conditionalVaR: Math.round(cvar$ * 100) / 100,
    conditionalVaRPct: Math.round(Math.abs(Math.min(avgTailReturn, 0)) * 10000) / 100,
  };
}

function computeDistribution(
  sortedReturns: number[],
  portfolioValue: number
): ReturnDistribution {
  const n = sortedReturns.length;

  // Mean
  const mean = sortedReturns.reduce((s, r) => s + r, 0) / n;

  // Std Dev
  const variance = sortedReturns.reduce((s, r) => s + (r - mean) ** 2, 0) / n;
  const stdDev = Math.sqrt(variance);

  // Skewness
  const skewness = stdDev > 0
    ? sortedReturns.reduce((s, r) => s + ((r - mean) / stdDev) ** 3, 0) / n
    : 0;

  // Kurtosis (excess)
  const kurtosis = stdDev > 0
    ? sortedReturns.reduce((s, r) => s + ((r - mean) / stdDev) ** 4, 0) / n - 3
    : 0;

  // Percentiles
  const getPercentile = (p: number) => {
    const idx = Math.floor(n * p);
    return Math.round(sortedReturns[Math.min(idx, n - 1)] * portfolioValue * 100) / 100;
  };

  return {
    mean: Math.round(mean * 10000) / 10000,
    stdDev: Math.round(stdDev * 10000) / 10000,
    skewness: Math.round(skewness * 10000) / 10000,
    kurtosis: Math.round(kurtosis * 10000) / 10000,
    percentiles: {
      p5: getPercentile(0.05),
      p10: getPercentile(0.10),
      p25: getPercentile(0.25),
      p50: getPercentile(0.50),
      p75: getPercentile(0.75),
      p90: getPercentile(0.90),
      p95: getPercentile(0.95),
    },
  };
}

function buildPortfolioCorrelationMatrix(
  assets: PortfolioAsset[],
  correlation: CorrelationMatrix
): number[][] {
  const n = assets.length;
  const matrix: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) {
        matrix[i][j] = 1.0;
      } else {
        const classI = assets[i].assetData.assetClass;
        const classJ = assets[j].assetData.assetClass;
        const idxI = correlation.assetClasses.indexOf(classI);
        const idxJ = correlation.assetClasses.indexOf(classJ);
        if (idxI >= 0 && idxJ >= 0) {
          matrix[i][j] = correlation.matrix[idxI][idxJ];
        } else {
          // Unknown class: assume moderate positive correlation
          matrix[i][j] = 0.3;
        }
      }
    }
  }

  return matrix;
}

function emptyMonteCarloResult(config: MonteCarloConfig): MonteCarloResult {
  return {
    portfolioValue: 0,
    numSimulations: config.numSimulations,
    timeHorizonDays: config.timeHorizonDays,
    varResults: config.confidenceLevels.map(cl => ({
      confidenceLevel: cl,
      valueAtRisk: 0,
      valueAtRiskPct: 0,
      conditionalVaR: 0,
      conditionalVaRPct: 0,
    })),
    returnDistribution: {
      mean: 0,
      stdDev: 0,
      skewness: 0,
      kurtosis: 0,
      percentiles: { p5: 0, p10: 0, p25: 0, p50: 0, p75: 0, p90: 0, p95: 0 },
    },
    maxDrawdownEstimate: 0,
    maxDrawdownPct: 0,
    expectedReturn: 0,
    expectedReturnPct: 0,
    worstCase: 0,
    bestCase: 0,
    medianReturn: 0,
  };
}

/**
 * Run sensitivity analysis: vary one asset's weight and observe VaR changes.
 */
export function runSensitivityAnalysis(
  assets: PortfolioAsset[],
  valuations: Map<string, ConsensusResult>,
  targetAssetId: string,
  weightSteps: number[] = [0, 0.1, 0.2, 0.3, 0.4, 0.5],
  config: Partial<MonteCarloConfig> = {}
): { weight: number; var95: number; var99: number; expectedReturn: number }[] {
  const targetAsset = assets.find(a => a.assetData.id === targetAssetId);
  if (!targetAsset) return [];

  const otherAssets = assets.filter(a => a.assetData.id !== targetAssetId);
  const totalValue = assets.reduce((sum, a) => {
    const v = valuations.get(a.assetData.id);
    return sum + (v ? v.consensusValue : 0);
  }, 0);

  if (totalValue <= 0) return [];

  return weightSteps.map(w => {
    // Create modified valuations with adjusted weights
    const modifiedValuations = new Map(valuations);
    const targetVal = valuations.get(targetAssetId);
    if (targetVal) {
      const newTargetValue = totalValue * w;
      modifiedValuations.set(targetAssetId, {
        ...targetVal,
        consensusValue: newTargetValue,
      });

      // Redistribute remaining weight proportionally
      const remainingValue = totalValue - newTargetValue;
      const otherTotal = otherAssets.reduce((s, a) => {
        const v = valuations.get(a.assetData.id);
        return s + (v ? v.consensusValue : 0);
      }, 0);

      if (otherTotal > 0) {
        for (const other of otherAssets) {
          const v = valuations.get(other.assetData.id);
          if (v) {
            const otherWeight = v.consensusValue / otherTotal;
            modifiedValuations.set(other.assetData.id, {
              ...v,
              consensusValue: remainingValue * otherWeight,
            });
          }
        }
      }
    }

    const result = runMonteCarloSimulation(
      assets,
      modifiedValuations,
      { ...config, confidenceLevels: [0.95, 0.99], numSimulations: config.numSimulations ?? 5000 }
    );

    return {
      weight: w,
      var95: result.varResults[0]?.valueAtRiskPct ?? 0,
      var99: result.varResults[1]?.valueAtRiskPct ?? 0,
      expectedReturn: result.expectedReturnPct,
    };
  });
}
