import {
  runMonteCarloSimulation,
  runSensitivityAnalysis,
  choleskyDecomposition,
  SeededRNG,
  MonteCarloConfig,
  MonteCarloResult,
  CorrelationMatrix,
} from '../../src/oracle/monte-carlo';
import { AssetClass, ConsensusResult, PortfolioAsset, AssetData } from '../../src/types';

// ─── Helpers ──────────────────────────────────────────────────────────

function makeAsset(id: string, assetClass: AssetClass, name: string): AssetData {
  return { id, assetClass, name, description: `Test ${name}`, metadata: {} };
}

function makePortfolioAsset(id: string, assetClass: AssetClass, name: string): PortfolioAsset {
  return {
    tokenId: parseInt(id.replace(/\D/g, '') || '1'),
    assetData: makeAsset(id, assetClass, name),
    currentValuation: null,
    tokenSupply: 1000,
    oracleAssetId: id,
  };
}

function makeConsensus(assetId: string, value: number, confidence: number = 0.8): ConsensusResult {
  return {
    assetId,
    consensusValue: value,
    avgConfidence: confidence,
    valuations: [],
    methodology: 'test',
    timestamp: new Date(),
  };
}

function buildPortfolio(
  specs: { id: string; class: AssetClass; name: string; value: number }[]
): { assets: PortfolioAsset[]; valuations: Map<string, ConsensusResult> } {
  const assets = specs.map(s => makePortfolioAsset(s.id, s.class, s.name));
  const valuations = new Map(specs.map(s => [s.id, makeConsensus(s.id, s.value)]));
  return { assets, valuations };
}

// ─── SeededRNG ────────────────────────────────────────────────────────

describe('SeededRNG', () => {
  test('produces deterministic sequences with same seed', () => {
    const rng1 = new SeededRNG(42);
    const rng2 = new SeededRNG(42);
    for (let i = 0; i < 100; i++) {
      expect(rng1.next()).toBe(rng2.next());
    }
  });

  test('produces different sequences with different seeds', () => {
    const rng1 = new SeededRNG(42);
    const rng2 = new SeededRNG(43);
    const values1 = Array.from({ length: 10 }, () => rng1.next());
    const values2 = Array.from({ length: 10 }, () => rng2.next());
    expect(values1).not.toEqual(values2);
  });

  test('generates values in [0, 1)', () => {
    const rng = new SeededRNG(12345);
    for (let i = 0; i < 10000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  test('gaussian distribution has approximately zero mean', () => {
    const rng = new SeededRNG(99);
    let sum = 0;
    const n = 10000;
    for (let i = 0; i < n; i++) {
      sum += rng.nextGaussian();
    }
    const mean = sum / n;
    expect(Math.abs(mean)).toBeLessThan(0.05);
  });

  test('gaussian distribution has approximately unit variance', () => {
    const rng = new SeededRNG(77);
    const values: number[] = [];
    const n = 10000;
    for (let i = 0; i < n; i++) {
      values.push(rng.nextGaussian());
    }
    const mean = values.reduce((s, v) => s + v, 0) / n;
    const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
    expect(variance).toBeGreaterThan(0.85);
    expect(variance).toBeLessThan(1.15);
  });

  test('handles seed of 0', () => {
    const rng = new SeededRNG(0);
    const v = rng.next();
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThan(1);
  });

  test('handles negative seed', () => {
    const rng = new SeededRNG(-42);
    const v = rng.next();
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThan(1);
  });

  test('handles very large seed', () => {
    const rng = new SeededRNG(2 ** 31 - 1);
    for (let i = 0; i < 100; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

// ─── Cholesky Decomposition ──────────────────────────────────────────

describe('choleskyDecomposition', () => {
  test('decomposes identity matrix', () => {
    const I = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    const L = choleskyDecomposition(I);
    expect(L).toEqual(I);
  });

  test('decomposes 2x2 correlation matrix', () => {
    const M = [[1.0, 0.5], [0.5, 1.0]];
    const L = choleskyDecomposition(M);
    // L * L^T should equal M
    const product = multiplyLLT(L);
    for (let i = 0; i < 2; i++) {
      for (let j = 0; j < 2; j++) {
        expect(product[i][j]).toBeCloseTo(M[i][j], 6);
      }
    }
  });

  test('decomposes 3x3 correlation matrix', () => {
    const M = [
      [1.0, 0.3, -0.1],
      [0.3, 1.0, 0.2],
      [-0.1, 0.2, 1.0],
    ];
    const L = choleskyDecomposition(M);
    const product = multiplyLLT(L);
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        expect(product[i][j]).toBeCloseTo(M[i][j], 6);
      }
    }
  });

  test('lower triangular: upper elements are zero', () => {
    const M = [[1.0, 0.5], [0.5, 1.0]];
    const L = choleskyDecomposition(M);
    expect(L[0][1]).toBe(0);
  });

  test('handles 1x1 matrix', () => {
    const L = choleskyDecomposition([[4]]);
    expect(L[0][0]).toBeCloseTo(2, 6);
  });

  test('handles 5x5 matrix', () => {
    const M = [
      [1.00, 0.25, -0.10, 0.55, 0.30],
      [0.25, 1.00, -0.15, 0.35, 0.10],
      [-0.10, -0.15, 1.00, -0.30, 0.20],
      [0.55, 0.35, -0.30, 1.00, 0.25],
      [0.30, 0.10, 0.20, 0.25, 1.00],
    ];
    const L = choleskyDecomposition(M);
    const product = multiplyLLT(L);
    for (let i = 0; i < 5; i++) {
      for (let j = 0; j < 5; j++) {
        expect(product[i][j]).toBeCloseTo(M[i][j], 5);
      }
    }
  });

  test('handles zero correlation matrix', () => {
    const M = [[1, 0], [0, 1]];
    const L = choleskyDecomposition(M);
    expect(L[0][0]).toBeCloseTo(1, 6);
    expect(L[1][1]).toBeCloseTo(1, 6);
    expect(L[0][1]).toBe(0);
    expect(L[1][0]).toBe(0);
  });

  test('handles perfect positive correlation', () => {
    const M = [[1, 1], [1, 1]];
    const L = choleskyDecomposition(M);
    expect(L[0][0]).toBeCloseTo(1, 6);
    expect(L[1][0]).toBeCloseTo(1, 6);
  });
});

function multiplyLLT(L: number[][]): number[][] {
  const n = L.length;
  const result: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      let sum = 0;
      for (let k = 0; k < n; k++) {
        sum += L[i][k] * L[j][k];
      }
      result[i][j] = sum;
    }
  }
  return result;
}

// ─── Monte Carlo Simulation ──────────────────────────────────────────

describe('runMonteCarloSimulation', () => {
  const { assets, valuations } = buildPortfolio([
    { id: 'prop1', class: AssetClass.REAL_ESTATE, name: 'Property', value: 500000 },
    { id: 'gold1', class: AssetClass.COMMODITY, name: 'Gold', value: 200000 },
    { id: 'tbill1', class: AssetClass.TREASURY, name: 'T-Bill', value: 300000 },
  ]);

  describe('basic functionality', () => {
    test('returns valid result structure', () => {
      const result = runMonteCarloSimulation(assets, valuations, {
        numSimulations: 1000,
        seed: 42,
      });
      expect(result.portfolioValue).toBe(1000000);
      expect(result.numSimulations).toBe(1000);
      expect(result.timeHorizonDays).toBe(30);
      expect(result.varResults).toHaveLength(2); // default 95% and 99%
      expect(result.returnDistribution).toBeDefined();
    });

    test('VaR at 99% is greater than VaR at 95%', () => {
      const result = runMonteCarloSimulation(assets, valuations, {
        numSimulations: 5000,
        seed: 42,
        confidenceLevels: [0.95, 0.99],
      });
      const var95 = result.varResults.find(v => v.confidenceLevel === 0.95)!;
      const var99 = result.varResults.find(v => v.confidenceLevel === 0.99)!;
      expect(var99.valueAtRisk).toBeGreaterThanOrEqual(var95.valueAtRisk);
    });

    test('CVaR is greater than or equal to VaR', () => {
      const result = runMonteCarloSimulation(assets, valuations, {
        numSimulations: 5000,
        seed: 42,
      });
      for (const vr of result.varResults) {
        expect(vr.conditionalVaR).toBeGreaterThanOrEqual(vr.valueAtRisk - 0.01);
      }
    });

    test('portfolio value matches sum of asset values', () => {
      const result = runMonteCarloSimulation(assets, valuations, {
        numSimulations: 100,
        seed: 42,
      });
      expect(result.portfolioValue).toBe(1000000);
    });

    test('worst case is less than best case', () => {
      const result = runMonteCarloSimulation(assets, valuations, {
        numSimulations: 5000,
        seed: 42,
      });
      expect(result.worstCase).toBeLessThan(result.bestCase);
    });

    test('median is between worst and best', () => {
      const result = runMonteCarloSimulation(assets, valuations, {
        numSimulations: 5000,
        seed: 42,
      });
      expect(result.medianReturn).toBeGreaterThanOrEqual(result.worstCase);
      expect(result.medianReturn).toBeLessThanOrEqual(result.bestCase);
    });
  });

  describe('deterministic with seed', () => {
    test('same seed produces same results', () => {
      const r1 = runMonteCarloSimulation(assets, valuations, {
        numSimulations: 1000,
        seed: 42,
      });
      const r2 = runMonteCarloSimulation(assets, valuations, {
        numSimulations: 1000,
        seed: 42,
      });
      expect(r1.varResults).toEqual(r2.varResults);
      expect(r1.returnDistribution).toEqual(r2.returnDistribution);
      expect(r1.expectedReturn).toBe(r2.expectedReturn);
    });

    test('different seeds produce different results', () => {
      const r1 = runMonteCarloSimulation(assets, valuations, {
        numSimulations: 1000,
        seed: 42,
      });
      const r2 = runMonteCarloSimulation(assets, valuations, {
        numSimulations: 1000,
        seed: 99,
      });
      expect(r1.expectedReturn).not.toBe(r2.expectedReturn);
    });
  });

  describe('return distribution', () => {
    test('percentiles are ordered', () => {
      const result = runMonteCarloSimulation(assets, valuations, {
        numSimulations: 5000,
        seed: 42,
      });
      const p = result.returnDistribution.percentiles;
      expect(p.p5).toBeLessThanOrEqual(p.p10);
      expect(p.p10).toBeLessThanOrEqual(p.p25);
      expect(p.p25).toBeLessThanOrEqual(p.p50);
      expect(p.p50).toBeLessThanOrEqual(p.p75);
      expect(p.p75).toBeLessThanOrEqual(p.p90);
      expect(p.p90).toBeLessThanOrEqual(p.p95);
    });

    test('standard deviation is positive', () => {
      const result = runMonteCarloSimulation(assets, valuations, {
        numSimulations: 5000,
        seed: 42,
      });
      expect(result.returnDistribution.stdDev).toBeGreaterThan(0);
    });

    test('kurtosis is computed', () => {
      const result = runMonteCarloSimulation(assets, valuations, {
        numSimulations: 5000,
        seed: 42,
      });
      expect(typeof result.returnDistribution.kurtosis).toBe('number');
    });

    test('skewness is computed', () => {
      const result = runMonteCarloSimulation(assets, valuations, {
        numSimulations: 5000,
        seed: 42,
      });
      expect(typeof result.returnDistribution.skewness).toBe('number');
    });
  });

  describe('edge cases', () => {
    test('empty portfolio returns zero result', () => {
      const result = runMonteCarloSimulation([], new Map(), { seed: 42 });
      expect(result.portfolioValue).toBe(0);
      expect(result.expectedReturn).toBe(0);
      expect(result.maxDrawdownEstimate).toBe(0);
    });

    test('single asset portfolio', () => {
      const singleAsset = [assets[0]];
      const singleVal = new Map([['prop1', valuations.get('prop1')!]]);
      const result = runMonteCarloSimulation(singleAsset, singleVal, {
        numSimulations: 1000,
        seed: 42,
      });
      expect(result.portfolioValue).toBe(500000);
      expect(result.varResults).toHaveLength(2);
    });

    test('assets without valuations are excluded', () => {
      const extraAsset = makePortfolioAsset('missing1', AssetClass.EQUITY, 'Missing');
      const result = runMonteCarloSimulation(
        [...assets, extraAsset],
        valuations,
        { numSimulations: 100, seed: 42 }
      );
      expect(result.portfolioValue).toBe(1000000);
    });

    test('very small portfolio value', () => {
      const { assets: small, valuations: smallVals } = buildPortfolio([
        { id: 's1', class: AssetClass.TREASURY, name: 'Small', value: 0.01 },
      ]);
      const result = runMonteCarloSimulation(small, smallVals, {
        numSimulations: 100,
        seed: 42,
      });
      expect(result.portfolioValue).toBe(0.01);
    });

    test('very large portfolio value', () => {
      const { assets: large, valuations: largeVals } = buildPortfolio([
        { id: 'l1', class: AssetClass.REAL_ESTATE, name: 'Mansion', value: 1e9 },
      ]);
      const result = runMonteCarloSimulation(large, largeVals, {
        numSimulations: 100,
        seed: 42,
      });
      expect(result.portfolioValue).toBe(1e9);
    });

    test('all same asset class', () => {
      const { assets: all_re, valuations: re_vals } = buildPortfolio([
        { id: 'r1', class: AssetClass.REAL_ESTATE, name: 'Prop A', value: 100000 },
        { id: 'r2', class: AssetClass.REAL_ESTATE, name: 'Prop B', value: 200000 },
        { id: 'r3', class: AssetClass.REAL_ESTATE, name: 'Prop C', value: 300000 },
      ]);
      const result = runMonteCarloSimulation(all_re, re_vals, {
        numSimulations: 1000,
        seed: 42,
      });
      // Same-class assets are perfectly correlated by default
      expect(result.portfolioValue).toBe(600000);
    });
  });

  describe('configuration', () => {
    test('custom confidence levels', () => {
      const result = runMonteCarloSimulation(assets, valuations, {
        numSimulations: 1000,
        seed: 42,
        confidenceLevels: [0.90, 0.95, 0.99, 0.999],
      });
      expect(result.varResults).toHaveLength(4);
      expect(result.varResults[0].confidenceLevel).toBe(0.90);
      expect(result.varResults[3].confidenceLevel).toBe(0.999);
    });

    test('longer time horizon increases VaR', () => {
      const short = runMonteCarloSimulation(assets, valuations, {
        numSimulations: 5000,
        seed: 42,
        timeHorizonDays: 7,
      });
      const long = runMonteCarloSimulation(assets, valuations, {
        numSimulations: 5000,
        seed: 42,
        timeHorizonDays: 365,
      });
      expect(long.varResults[0].valueAtRisk).toBeGreaterThan(short.varResults[0].valueAtRisk);
    });

    test('more simulations gives smoother results', () => {
      // Just verify it runs without error at higher counts
      const result = runMonteCarloSimulation(assets, valuations, {
        numSimulations: 20000,
        seed: 42,
      });
      expect(result.numSimulations).toBe(20000);
    });

    test('custom return profiles', () => {
      const highVol = {
        'prop1': {
          assetClass: AssetClass.REAL_ESTATE,
          annualizedReturn: 0.08,
          annualizedVolatility: 0.50, // Very high volatility
        },
      };
      const resultHigh = runMonteCarloSimulation(assets, valuations, {
        numSimulations: 5000,
        seed: 42,
      }, highVol);

      const resultDefault = runMonteCarloSimulation(assets, valuations, {
        numSimulations: 5000,
        seed: 42,
      });

      // Higher volatility should lead to higher VaR
      expect(resultHigh.varResults[0].valueAtRisk).toBeGreaterThan(
        resultDefault.varResults[0].valueAtRisk
      );
    });

    test('custom correlation matrix', () => {
      const perfectCorr: CorrelationMatrix = {
        assetClasses: [AssetClass.REAL_ESTATE, AssetClass.COMMODITY, AssetClass.TREASURY],
        matrix: [
          [1.0, 0.99, 0.99],
          [0.99, 1.0, 0.99],
          [0.99, 0.99, 1.0],
        ],
      };
      const result = runMonteCarloSimulation(assets, valuations, {
        numSimulations: 1000,
        seed: 42,
      }, {}, perfectCorr);

      expect(result.portfolioValue).toBe(1000000);
    });
  });

  describe('VaR results validation', () => {
    test('VaR percentage matches dollar value', () => {
      const result = runMonteCarloSimulation(assets, valuations, {
        numSimulations: 5000,
        seed: 42,
      });
      for (const vr of result.varResults) {
        const expectedPct = (vr.valueAtRisk / result.portfolioValue) * 100;
        expect(Math.abs(vr.valueAtRiskPct - expectedPct)).toBeLessThan(0.1);
      }
    });

    test('CVaR percentage matches dollar value', () => {
      const result = runMonteCarloSimulation(assets, valuations, {
        numSimulations: 5000,
        seed: 42,
      });
      for (const vr of result.varResults) {
        const expectedPct = (vr.conditionalVaR / result.portfolioValue) * 100;
        expect(Math.abs(vr.conditionalVaRPct - expectedPct)).toBeLessThan(0.1);
      }
    });

    test('VaR values are non-negative', () => {
      const result = runMonteCarloSimulation(assets, valuations, {
        numSimulations: 5000,
        seed: 42,
      });
      for (const vr of result.varResults) {
        expect(vr.valueAtRisk).toBeGreaterThanOrEqual(0);
        expect(vr.conditionalVaR).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('max drawdown', () => {
    test('max drawdown is non-negative', () => {
      const result = runMonteCarloSimulation(assets, valuations, {
        numSimulations: 5000,
        seed: 42,
      });
      expect(result.maxDrawdownEstimate).toBeGreaterThanOrEqual(0);
    });

    test('max drawdown percentage is consistent', () => {
      const result = runMonteCarloSimulation(assets, valuations, {
        numSimulations: 5000,
        seed: 42,
      });
      if (result.portfolioValue > 0) {
        const expectedPct = (result.maxDrawdownEstimate / result.portfolioValue) * 100;
        expect(Math.abs(Math.abs(result.maxDrawdownPct) - expectedPct)).toBeLessThan(0.1);
      }
    });
  });

  describe('diversified vs concentrated portfolios', () => {
    test('diversified portfolio has lower VaR than concentrated', () => {
      // Diversified across all classes
      const { assets: divAssets, valuations: divVals } = buildPortfolio([
        { id: 'd1', class: AssetClass.REAL_ESTATE, name: 'RE', value: 200000 },
        { id: 'd2', class: AssetClass.COMMODITY, name: 'Comm', value: 200000 },
        { id: 'd3', class: AssetClass.TREASURY, name: 'TB', value: 200000 },
        { id: 'd4', class: AssetClass.EQUITY, name: 'EQ', value: 200000 },
        { id: 'd5', class: AssetClass.RECEIVABLE, name: 'RV', value: 200000 },
      ]);

      // Concentrated in one high-vol class
      const { assets: conAssets, valuations: conVals } = buildPortfolio([
        { id: 'c1', class: AssetClass.COMMODITY, name: 'Comm Only', value: 1000000 },
      ]);

      const divResult = runMonteCarloSimulation(divAssets, divVals, {
        numSimulations: 10000,
        seed: 42,
      });
      const conResult = runMonteCarloSimulation(conAssets, conVals, {
        numSimulations: 10000,
        seed: 42,
      });

      // Diversification should reduce VaR
      expect(divResult.varResults[0].valueAtRiskPct).toBeLessThan(
        conResult.varResults[0].valueAtRiskPct
      );
    });
  });
});

// ─── Sensitivity Analysis ────────────────────────────────────────────

describe('runSensitivityAnalysis', () => {
  const { assets, valuations } = buildPortfolio([
    { id: 'prop1', class: AssetClass.REAL_ESTATE, name: 'Property', value: 500000 },
    { id: 'gold1', class: AssetClass.COMMODITY, name: 'Gold', value: 300000 },
    { id: 'tbill1', class: AssetClass.TREASURY, name: 'T-Bill', value: 200000 },
  ]);

  test('returns results for each weight step', () => {
    const results = runSensitivityAnalysis(assets, valuations, 'prop1', [0, 0.25, 0.5], {
      numSimulations: 1000,
      seed: 42,
    });
    expect(results).toHaveLength(3);
    expect(results[0].weight).toBe(0);
    expect(results[1].weight).toBe(0.25);
    expect(results[2].weight).toBe(0.5);
  });

  test('returns both VaR95 and VaR99', () => {
    const results = runSensitivityAnalysis(assets, valuations, 'prop1', [0.2], {
      numSimulations: 1000,
      seed: 42,
    });
    expect(results[0].var95).toBeDefined();
    expect(results[0].var99).toBeDefined();
    expect(results[0].var99).toBeGreaterThanOrEqual(results[0].var95);
  });

  test('returns empty for unknown asset', () => {
    const results = runSensitivityAnalysis(assets, valuations, 'nonexistent');
    expect(results).toEqual([]);
  });

  test('VaR changes as weight changes', () => {
    const results = runSensitivityAnalysis(
      assets,
      valuations,
      'prop1',
      [0.1, 0.5, 0.9],
      { numSimulations: 5000, seed: 42 }
    );
    // VaR should change across weight steps
    const var95s = results.map(r => r.var95);
    const allSame = var95s.every(v => v === var95s[0]);
    expect(allSame).toBe(false);
  });

  test('default weight steps work', () => {
    const results = runSensitivityAnalysis(assets, valuations, 'gold1', undefined, {
      numSimulations: 500,
      seed: 42,
    });
    expect(results.length).toBe(6); // default [0, 0.1, 0.2, 0.3, 0.4, 0.5]
  });

  test('expected return is included', () => {
    const results = runSensitivityAnalysis(assets, valuations, 'tbill1', [0.1, 0.5], {
      numSimulations: 1000,
      seed: 42,
    });
    for (const r of results) {
      expect(typeof r.expectedReturn).toBe('number');
    }
  });
});

// ─── Multi-asset class tests ──────────────────────────────────────

describe('asset class behavior', () => {
  test('treasury portfolio has lower volatility than commodity', () => {
    const { assets: tAssets, valuations: tVals } = buildPortfolio([
      { id: 't1', class: AssetClass.TREASURY, name: 'TB1', value: 500000 },
      { id: 't2', class: AssetClass.TREASURY, name: 'TB2', value: 500000 },
    ]);
    const { assets: cAssets, valuations: cVals } = buildPortfolio([
      { id: 'c1', class: AssetClass.COMMODITY, name: 'CM1', value: 500000 },
      { id: 'c2', class: AssetClass.COMMODITY, name: 'CM2', value: 500000 },
    ]);

    const tResult = runMonteCarloSimulation(tAssets, tVals, {
      numSimulations: 10000,
      seed: 42,
    });
    const cResult = runMonteCarloSimulation(cAssets, cVals, {
      numSimulations: 10000,
      seed: 42,
    });

    expect(tResult.returnDistribution.stdDev).toBeLessThan(cResult.returnDistribution.stdDev);
  });

  test('negative correlation reduces portfolio risk', () => {
    // Build portfolio with negatively correlated assets
    const { assets: ncAssets, valuations: ncVals } = buildPortfolio([
      { id: 'nc1', class: AssetClass.EQUITY, name: 'Stock', value: 500000 },
      { id: 'nc2', class: AssetClass.TREASURY, name: 'Bond', value: 500000 },
    ]);

    const negCorr: CorrelationMatrix = {
      assetClasses: [AssetClass.EQUITY, AssetClass.TREASURY],
      matrix: [[1.0, -0.8], [-0.8, 1.0]],
    };
    const posCorr: CorrelationMatrix = {
      assetClasses: [AssetClass.EQUITY, AssetClass.TREASURY],
      matrix: [[1.0, 0.8], [0.8, 1.0]],
    };

    const negResult = runMonteCarloSimulation(ncAssets, ncVals, {
      numSimulations: 10000,
      seed: 42,
    }, {}, negCorr);
    const posResult = runMonteCarloSimulation(ncAssets, ncVals, {
      numSimulations: 10000,
      seed: 42,
    }, {}, posCorr);

    expect(negResult.varResults[0].valueAtRisk).toBeLessThan(
      posResult.varResults[0].valueAtRisk
    );
  });

  test('equity portfolio has expected positive drift', () => {
    const { assets: eAssets, valuations: eVals } = buildPortfolio([
      { id: 'e1', class: AssetClass.EQUITY, name: 'EQ1', value: 1000000 },
    ]);
    const result = runMonteCarloSimulation(eAssets, eVals, {
      numSimulations: 50000,
      seed: 42,
      timeHorizonDays: 365,
    });
    // With 10% expected return, most scenarios should be positive over 1 year
    expect(result.expectedReturnPct).toBeGreaterThan(0);
  });

  test('receivable assets included in simulation', () => {
    const { assets: rAssets, valuations: rVals } = buildPortfolio([
      { id: 'rv1', class: AssetClass.RECEIVABLE, name: 'Recv', value: 100000 },
    ]);
    const result = runMonteCarloSimulation(rAssets, rVals, {
      numSimulations: 1000,
      seed: 42,
    });
    expect(result.portfolioValue).toBe(100000);
    expect(result.varResults).toHaveLength(2);
  });
});

// ─── Statistical properties ──────────────────────────────────────

describe('statistical properties', () => {
  const { assets, valuations } = buildPortfolio([
    { id: 'p1', class: AssetClass.EQUITY, name: 'EQ', value: 1000000 },
  ]);

  test('return distribution is approximately normal for GBM', () => {
    const result = runMonteCarloSimulation(assets, valuations, {
      numSimulations: 50000,
      seed: 42,
      timeHorizonDays: 30,
    });
    // Log-normal returns should have slight right skew
    // Just verify skewness and kurtosis are reasonable
    expect(Math.abs(result.returnDistribution.skewness)).toBeLessThan(2);
    expect(result.returnDistribution.kurtosis).toBeGreaterThan(-2);
    expect(result.returnDistribution.kurtosis).toBeLessThan(5);
  });

  test('expected return scales with time horizon', () => {
    const short = runMonteCarloSimulation(assets, valuations, {
      numSimulations: 20000,
      seed: 42,
      timeHorizonDays: 30,
    });
    const long = runMonteCarloSimulation(assets, valuations, {
      numSimulations: 20000,
      seed: 42,
      timeHorizonDays: 365,
    });
    expect(Math.abs(long.expectedReturnPct)).toBeGreaterThan(
      Math.abs(short.expectedReturnPct) * 0.5
    );
  });

  test('volatility scales with sqrt(time)', () => {
    const d30 = runMonteCarloSimulation(assets, valuations, {
      numSimulations: 50000,
      seed: 42,
      timeHorizonDays: 30,
    });
    const d120 = runMonteCarloSimulation(assets, valuations, {
      numSimulations: 50000,
      seed: 42,
      timeHorizonDays: 120,
    });
    // 120/30 = 4x time, so sqrt(4) = 2x vol
    const ratio = d120.returnDistribution.stdDev / d30.returnDistribution.stdDev;
    expect(ratio).toBeGreaterThan(1.5);
    expect(ratio).toBeLessThan(2.5);
  });
});
