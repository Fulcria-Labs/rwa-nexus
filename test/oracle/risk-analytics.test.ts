import { analyzePortfolioRisk, RiskReport } from '../../src/oracle/risk-analytics';
import { AssetClass, ConsensusResult, PortfolioAsset } from '../../src/types';

function makeAsset(id: string, assetClass: AssetClass): PortfolioAsset {
  return {
    tokenId: parseInt(id.replace(/\D/g, '') || '0'),
    assetData: { id, assetClass, name: `Asset ${id}`, description: '', metadata: {} },
    currentValuation: null,
    tokenSupply: 1000,
    oracleAssetId: `oracle-${id}`,
  };
}

function makeValuation(assetId: string, value: number, confidence: number): ConsensusResult {
  return {
    assetId,
    consensusValue: value,
    avgConfidence: confidence,
    valuations: [],
    methodology: 'test',
    timestamp: new Date(),
  };
}

describe('Risk Analytics', () => {
  describe('analyzePortfolioRisk', () => {
    it('should return empty report for no assets', () => {
      const report = analyzePortfolioRisk([], new Map());
      expect(report.portfolioValue).toBe(0);
      expect(report.assetCount).toBe(0);
      expect(report.riskRating).toBe('CRITICAL');
      expect(report.diversificationScore).toBe(0);
    });

    it('should compute portfolio value correctly', () => {
      const assets = [
        makeAsset('a1', AssetClass.REAL_ESTATE),
        makeAsset('a2', AssetClass.COMMODITY),
      ];
      const valuations = new Map<string, ConsensusResult>([
        ['a1', makeValuation('a1', 500000, 0.8)],
        ['a2', makeValuation('a2', 300000, 0.7)],
      ]);

      const report = analyzePortfolioRisk(assets, valuations);
      expect(report.portfolioValue).toBe(800000);
      expect(report.assetCount).toBe(2);
    });

    it('should skip assets without valuations', () => {
      const assets = [
        makeAsset('a1', AssetClass.REAL_ESTATE),
        makeAsset('a2', AssetClass.COMMODITY),
      ];
      const valuations = new Map<string, ConsensusResult>([
        ['a1', makeValuation('a1', 500000, 0.8)],
      ]);

      const report = analyzePortfolioRisk(assets, valuations);
      expect(report.portfolioValue).toBe(500000);
      expect(report.assetCount).toBe(1);
    });
  });

  describe('Concentration Risk', () => {
    it('should compute HHI for single asset = 10000', () => {
      const assets = [makeAsset('a1', AssetClass.REAL_ESTATE)];
      const valuations = new Map([['a1', makeValuation('a1', 100000, 0.8)]]);

      const report = analyzePortfolioRisk(assets, valuations);
      expect(report.concentrationRisk.herfindahlIndex).toBe(10000);
      expect(report.concentrationRisk.largestPosition).toBe(100);
    });

    it('should compute HHI for equal-weighted portfolio', () => {
      const assets = [
        makeAsset('a1', AssetClass.REAL_ESTATE),
        makeAsset('a2', AssetClass.COMMODITY),
        makeAsset('a3', AssetClass.TREASURY),
        makeAsset('a4', AssetClass.EQUITY),
      ];
      const valuations = new Map(
        assets.map(a => [a.assetData.id, makeValuation(a.assetData.id, 250000, 0.8)])
      );

      const report = analyzePortfolioRisk(assets, valuations);
      // Each weight = 0.25, HHI = 4 * 0.0625 * 10000 = 2500
      expect(report.concentrationRisk.herfindahlIndex).toBe(2500);
      expect(report.concentrationRisk.largestPosition).toBe(25);
    });

    it('should identify largest position', () => {
      const assets = [
        makeAsset('small', AssetClass.COMMODITY),
        makeAsset('large', AssetClass.REAL_ESTATE),
      ];
      const valuations = new Map([
        ['small', makeValuation('small', 100000, 0.7)],
        ['large', makeValuation('large', 900000, 0.9)],
      ]);

      const report = analyzePortfolioRisk(assets, valuations);
      expect(report.concentrationRisk.largestPositionAsset).toBe('large');
      expect(report.concentrationRisk.largestPosition).toBe(90);
    });

    it('should compute asset class breakdown', () => {
      const assets = [
        makeAsset('re1', AssetClass.REAL_ESTATE),
        makeAsset('re2', AssetClass.REAL_ESTATE),
        makeAsset('com1', AssetClass.COMMODITY),
      ];
      const valuations = new Map([
        ['re1', makeValuation('re1', 400000, 0.8)],
        ['re2', makeValuation('re2', 400000, 0.8)],
        ['com1', makeValuation('com1', 200000, 0.7)],
      ]);

      const report = analyzePortfolioRisk(assets, valuations);
      expect(report.concentrationRisk.assetClassBreakdown[AssetClass.REAL_ESTATE]).toBe(80);
      expect(report.concentrationRisk.assetClassBreakdown[AssetClass.COMMODITY]).toBe(20);
    });
  });

  describe('Diversification Score', () => {
    it('should be low for single-asset portfolio', () => {
      const assets = [makeAsset('a1', AssetClass.REAL_ESTATE)];
      const valuations = new Map([['a1', makeValuation('a1', 100000, 0.8)]]);

      const report = analyzePortfolioRisk(assets, valuations);
      expect(report.diversificationScore).toBeLessThan(20);
    });

    it('should be high for well-diversified portfolio', () => {
      const classes = [AssetClass.REAL_ESTATE, AssetClass.COMMODITY, AssetClass.TREASURY, AssetClass.EQUITY, AssetClass.RECEIVABLE];
      const assets = [];
      const valuations = new Map<string, ConsensusResult>();

      // 10 assets across 5 classes, equal-weighted
      for (let i = 0; i < 10; i++) {
        const id = `asset-${i}`;
        assets.push(makeAsset(id, classes[i % 5]));
        valuations.set(id, makeValuation(id, 100000, 0.8));
      }

      const report = analyzePortfolioRisk(assets, valuations);
      expect(report.diversificationScore).toBeGreaterThan(70);
    });

    it('should increase with more asset classes', () => {
      // 2 assets, same class
      const assets1 = [
        makeAsset('a1', AssetClass.REAL_ESTATE),
        makeAsset('a2', AssetClass.REAL_ESTATE),
      ];
      const v1 = new Map([
        ['a1', makeValuation('a1', 50000, 0.8)],
        ['a2', makeValuation('a2', 50000, 0.8)],
      ]);

      // 2 assets, different classes
      const assets2 = [
        makeAsset('b1', AssetClass.REAL_ESTATE),
        makeAsset('b2', AssetClass.COMMODITY),
      ];
      const v2 = new Map([
        ['b1', makeValuation('b1', 50000, 0.8)],
        ['b2', makeValuation('b2', 50000, 0.8)],
      ]);

      const report1 = analyzePortfolioRisk(assets1, v1);
      const report2 = analyzePortfolioRisk(assets2, v2);
      expect(report2.diversificationScore).toBeGreaterThan(report1.diversificationScore);
    });
  });

  describe('Stress Tests', () => {
    it('should run all 5 scenarios', () => {
      const assets = [makeAsset('a1', AssetClass.REAL_ESTATE)];
      const valuations = new Map([['a1', makeValuation('a1', 1000000, 0.8)]]);

      const report = analyzePortfolioRisk(assets, valuations);
      expect(report.stressTestResults.length).toBe(5);
    });

    it('should compute real estate crash impact', () => {
      const assets = [makeAsset('a1', AssetClass.REAL_ESTATE)];
      const valuations = new Map([['a1', makeValuation('a1', 1000000, 0.8)]]);

      const report = analyzePortfolioRisk(assets, valuations);
      const reCrash = report.stressTestResults.find(s => s.scenario.includes('Real Estate'));
      expect(reCrash).toBeDefined();
      expect(reCrash!.portfolioImpact).toBe(-300000); // -30% of 1M
      expect(reCrash!.portfolioImpactPct).toBe(-30);
      expect(reCrash!.assetsAffected).toBe(1);
    });

    it('should not affect unrelated asset classes', () => {
      const assets = [makeAsset('a1', AssetClass.TREASURY)];
      const valuations = new Map([['a1', makeValuation('a1', 500000, 0.9)]]);

      const report = analyzePortfolioRisk(assets, valuations);
      const reCrash = report.stressTestResults.find(s => s.scenario.includes('Real Estate'));
      expect(reCrash!.assetsAffected).toBe(0);
      expect(reCrash!.portfolioImpact).toBe(0);
    });

    it('should compute broad market stress across all classes', () => {
      const assets = [
        makeAsset('re', AssetClass.REAL_ESTATE),
        makeAsset('com', AssetClass.COMMODITY),
      ];
      const valuations = new Map([
        ['re', makeValuation('re', 600000, 0.8)],
        ['com', makeValuation('com', 400000, 0.7)],
      ]);

      const report = analyzePortfolioRisk(assets, valuations);
      const broad = report.stressTestResults.find(s => s.scenario.includes('Broad Market'));
      expect(broad!.portfolioImpact).toBe(-200000); // -20% of 1M
      expect(broad!.assetsAffected).toBe(2);
    });

    it('should handle stagflation scenario with mixed shocks', () => {
      const assets = [
        makeAsset('re', AssetClass.REAL_ESTATE),
        makeAsset('com', AssetClass.COMMODITY),
      ];
      const valuations = new Map([
        ['re', makeValuation('re', 500000, 0.8)],
        ['com', makeValuation('com', 500000, 0.7)],
      ]);

      const report = analyzePortfolioRisk(assets, valuations);
      const stagflation = report.stressTestResults.find(s => s.scenario.includes('Stagflation'));
      // RE: -25% of 500K = -125K; Commodity: +15% of 500K = +75K; Net: -50K
      expect(stagflation!.portfolioImpact).toBe(-50000);
      expect(stagflation!.assetsAffected).toBe(2);
    });
  });

  describe('Confidence Analysis', () => {
    it('should compute average confidence', () => {
      const assets = [
        makeAsset('a1', AssetClass.REAL_ESTATE),
        makeAsset('a2', AssetClass.COMMODITY),
      ];
      const valuations = new Map([
        ['a1', makeValuation('a1', 500000, 0.8)],
        ['a2', makeValuation('a2', 500000, 0.6)],
      ]);

      const report = analyzePortfolioRisk(assets, valuations);
      expect(report.confidenceAnalysis.avgConfidence).toBe(0.7);
      expect(report.confidenceAnalysis.minConfidence).toBe(0.6);
      expect(report.confidenceAnalysis.maxConfidence).toBe(0.8);
    });

    it('should identify low-confidence assets', () => {
      const assets = [
        makeAsset('good', AssetClass.REAL_ESTATE),
        makeAsset('bad', AssetClass.COMMODITY),
      ];
      const valuations = new Map([
        ['good', makeValuation('good', 500000, 0.8)],
        ['bad', makeValuation('bad', 500000, 0.3)],
      ]);

      const report = analyzePortfolioRisk(assets, valuations);
      expect(report.confidenceAnalysis.lowConfidenceAssets).toContain('bad');
      expect(report.confidenceAnalysis.lowConfidenceAssets).not.toContain('good');
    });

    it('should compute value-weighted confidence', () => {
      const assets = [
        makeAsset('large', AssetClass.REAL_ESTATE),
        makeAsset('small', AssetClass.COMMODITY),
      ];
      const valuations = new Map([
        ['large', makeValuation('large', 900000, 0.9)],
        ['small', makeValuation('small', 100000, 0.3)],
      ]);

      const report = analyzePortfolioRisk(assets, valuations);
      // Weighted = (0.9 * 900000 + 0.3 * 100000) / 1000000 = (810000 + 30000) / 1000000 = 0.84
      expect(report.confidenceAnalysis.weightedConfidence).toBe(0.84);
    });
  });

  describe('Risk Rating', () => {
    it('should rate single low-confidence asset as HIGH or CRITICAL', () => {
      const assets = [makeAsset('a1', AssetClass.REAL_ESTATE)];
      const valuations = new Map([['a1', makeValuation('a1', 100000, 0.2)]]);

      const report = analyzePortfolioRisk(assets, valuations);
      expect(['HIGH', 'CRITICAL']).toContain(report.riskRating);
    });

    it('should rate well-diversified high-confidence portfolio as LOW', () => {
      const classes = [AssetClass.REAL_ESTATE, AssetClass.COMMODITY, AssetClass.TREASURY, AssetClass.EQUITY, AssetClass.RECEIVABLE];
      const assets = [];
      const valuations = new Map<string, ConsensusResult>();

      for (let i = 0; i < 10; i++) {
        const id = `asset-${i}`;
        assets.push(makeAsset(id, classes[i % 5]));
        valuations.set(id, makeValuation(id, 100000, 0.85));
      }

      const report = analyzePortfolioRisk(assets, valuations);
      expect(report.riskRating).toBe('LOW');
    });

    it('should rate concentrated portfolio as MEDIUM or higher', () => {
      const assets = [
        makeAsset('dom', AssetClass.REAL_ESTATE),
        makeAsset('tiny', AssetClass.COMMODITY),
      ];
      const valuations = new Map([
        ['dom', makeValuation('dom', 950000, 0.8)],
        ['tiny', makeValuation('tiny', 50000, 0.8)],
      ]);

      const report = analyzePortfolioRisk(assets, valuations);
      expect(['MEDIUM', 'HIGH', 'CRITICAL']).toContain(report.riskRating);
    });
  });

  describe('Edge Cases', () => {
    it('should handle portfolio with zero-value assets', () => {
      const assets = [makeAsset('a1', AssetClass.REAL_ESTATE)];
      const valuations = new Map([['a1', makeValuation('a1', 0, 0.5)]]);

      // Zero value means portfolioValue = 0, should handle gracefully
      const report = analyzePortfolioRisk(assets, valuations);
      expect(report.portfolioValue).toBe(0);
    });

    it('should handle single asset across all stress scenarios', () => {
      const assets = [makeAsset('a1', AssetClass.COMMODITY)];
      const valuations = new Map([['a1', makeValuation('a1', 100000, 0.7)]]);

      const report = analyzePortfolioRisk(assets, valuations);
      // Commodity crash should affect it
      const comCrash = report.stressTestResults.find(s => s.scenario.includes('Commodity'));
      expect(comCrash!.portfolioImpact).toBe(-40000);
    });

    it('should handle large portfolio', () => {
      const assets = [];
      const valuations = new Map<string, ConsensusResult>();

      for (let i = 0; i < 100; i++) {
        const id = `asset-${i}`;
        const cls = [AssetClass.REAL_ESTATE, AssetClass.COMMODITY, AssetClass.TREASURY][i % 3];
        assets.push(makeAsset(id, cls));
        valuations.set(id, makeValuation(id, 10000 + i * 100, 0.5 + (i % 5) * 0.1));
      }

      const report = analyzePortfolioRisk(assets, valuations);
      expect(report.assetCount).toBe(100);
      expect(report.diversificationScore).toBeGreaterThan(0);
      expect(report.stressTestResults.length).toBe(5);
    });
  });
});
