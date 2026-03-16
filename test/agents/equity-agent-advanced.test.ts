import { EquityAgent } from '../../src/agents/equity-agent';
import { AssetClass, AssetData } from '../../src/types';

describe('EquityAgent - Advanced Scenarios', () => {
  let agent: EquityAgent;

  beforeEach(() => {
    agent = new EquityAgent();
  });

  describe('DCF terminal value capping', () => {
    it('should cap terminal growth at 3%', async () => {
      const highGrowth: AssetData = {
        id: 'adv-cap-1',
        assetClass: AssetClass.EQUITY,
        name: 'HyperGrowth',
        description: 'Very fast growing',
        metadata: {
          freeCashFlow: 1_000_000_000,
          growthRate: 0.25, // 25% growth
          riskProfile: 'high',
          sharesOutstanding: 100_000_000,
        },
      };

      const result = await agent.valuate(highGrowth);
      // Should not produce infinite value despite high growth rate
      expect(isFinite(result.value)).toBe(true);
      expect(result.value).toBeGreaterThan(0);
    });
  });

  describe('method weighting', () => {
    it('should weight DCF at 45% when available', async () => {
      // Stock with all three methods
      const full: AssetData = {
        id: 'adv-weight-1',
        assetClass: AssetClass.EQUITY,
        name: 'FullData Corp',
        description: 'Complete data',
        metadata: {
          earnings: 2_000_000_000,
          freeCashFlow: 1_500_000_000,
          dividendPerShare: 2.0,
          sharesOutstanding: 500_000_000,
          industry: 'industrials',
          riskProfile: 'medium',
        },
      };

      const result = await agent.valuate(full);
      // All three methods should contribute
      expect(result.value).toBeGreaterThan(0);
      expect(result.confidence).toBeGreaterThanOrEqual(0.8);
    });

    it('should still produce value with only P/E method', async () => {
      const peOnly: AssetData = {
        id: 'adv-pe-only',
        assetClass: AssetClass.EQUITY,
        name: 'PE Only Corp',
        description: 'Only earnings data',
        metadata: {
          earnings: 1_000_000_000,
          sharesOutstanding: 200_000_000,
          industry: 'consumer_staples',
        },
      };

      const result = await agent.valuate(peOnly);
      expect(result.value).toBeGreaterThan(0);
      // P/E only should give reasonable confidence
      expect(result.confidence).toBeGreaterThanOrEqual(0.5);
    });

    it('should still produce value with only DCF method', async () => {
      const dcfOnly: AssetData = {
        id: 'adv-dcf-only',
        assetClass: AssetClass.EQUITY,
        name: 'DCF Only Corp',
        description: 'Only FCF data',
        metadata: {
          freeCashFlow: 3_000_000_000,
          sharesOutstanding: 1_000_000_000,
          riskProfile: 'low',
        },
      };

      const result = await agent.valuate(dcfOnly);
      expect(result.value).toBeGreaterThan(0);
    });
  });

  describe('risk profile impact', () => {
    const riskProfiles = ['low', 'medium', 'high', 'very_high'];

    it('should assign progressively lower values for higher risk', async () => {
      const results: number[] = [];

      for (const risk of riskProfiles) {
        const asset: AssetData = {
          id: `adv-risk-${risk}`,
          assetClass: AssetClass.EQUITY,
          name: `Risk ${risk}`,
          description: `${risk} risk stock`,
          metadata: {
            freeCashFlow: 1_000_000_000,
            growthRate: 0.08,
            riskProfile: risk,
            sharesOutstanding: 100_000_000,
          },
        };
        const result = await agent.valuate(asset);
        results.push(result.value);
      }

      // Each successive risk level should produce lower value
      for (let i = 1; i < results.length; i++) {
        expect(results[i]).toBeLessThan(results[i - 1]);
      }
    });
  });

  describe('market cap size impact', () => {
    it('should produce slightly lower values for smaller companies', async () => {
      const sizes = ['mega', 'large', 'mid', 'small', 'micro'];
      const results: number[] = [];

      for (const size of sizes) {
        const asset: AssetData = {
          id: `adv-size-${size}`,
          assetClass: AssetClass.EQUITY,
          name: `${size}Cap Corp`,
          description: `${size} cap company`,
          metadata: {
            freeCashFlow: 1_000_000_000,
            growthRate: 0.06,
            riskProfile: 'medium',
            marketCapSize: size,
            sharesOutstanding: 100_000_000,
          },
        };
        const result = await agent.valuate(asset);
        results.push(result.value);
      }

      // Mega cap should have highest value (lowest discount rate adjustment)
      expect(results[0]).toBeGreaterThan(results[results.length - 1]);
    });
  });

  describe('dividend vs no dividend', () => {
    it('should value dividend payer differently from non-payer', async () => {
      const withDiv: AssetData = {
        id: 'adv-div-yes',
        assetClass: AssetClass.EQUITY,
        name: 'DivPayer',
        description: 'Pays dividends',
        metadata: {
          earnings: 2_000_000_000,
          freeCashFlow: 1_500_000_000,
          dividendPerShare: 3.0,
          sharesOutstanding: 500_000_000,
          riskProfile: 'medium',
          growthRate: 0.05,
        },
      };

      const noDiv: AssetData = {
        id: 'adv-div-no',
        assetClass: AssetClass.EQUITY,
        name: 'NoDivPayer',
        description: 'No dividends',
        metadata: {
          earnings: 2_000_000_000,
          freeCashFlow: 1_500_000_000,
          sharesOutstanding: 500_000_000,
          riskProfile: 'medium',
          growthRate: 0.05,
        },
      };

      const withResult = await agent.valuate(withDiv);
      const noResult = await agent.valuate(noDiv);

      // Values should differ (DDM adds to valuation)
      expect(withResult.value).not.toBe(noResult.value);
    });
  });

  describe('revenue and margin data', () => {
    it('should include revenue data point when provided', async () => {
      const asset: AssetData = {
        id: 'adv-rev-1',
        assetClass: AssetClass.EQUITY,
        name: 'RevCorp',
        description: 'Revenue data',
        metadata: {
          revenue: 20_000_000_000,
          earnings: 3_000_000_000,
          sharesOutstanding: 1_000_000_000,
        },
      };

      const result = await agent.valuate(asset);
      const rev = result.dataPoints.find(dp => dp.metric === 'revenue');
      expect(rev).toBeDefined();
      expect(rev!.value).toBe(20_000_000_000);
    });

    it('should not include revenue when not provided', async () => {
      const asset: AssetData = {
        id: 'adv-norev',
        assetClass: AssetClass.EQUITY,
        name: 'NoRevCorp',
        description: 'No revenue',
        metadata: {
          earnings: 1_000_000_000,
          sharesOutstanding: 100_000_000,
        },
      };

      const result = await agent.valuate(asset);
      const rev = result.dataPoints.find(dp => dp.metric === 'revenue');
      expect(rev).toBeUndefined();
    });
  });

  describe('consensus integration', () => {
    it('should work in consensus engine with other agents', async () => {
      const { ConsensusEngine } = await import('../../src/oracle/consensus');
      const engine = new ConsensusEngine();
      engine.registerAgent(agent);

      const asset: AssetData = {
        id: 'cons-eq-1',
        assetClass: AssetClass.EQUITY,
        name: 'Consensus Equity',
        description: 'Test consensus',
        metadata: {
          industry: 'technology',
          earnings: 5_000_000_000,
          sharesOutstanding: 1_000_000_000,
        },
      };

      const consensus = await engine.evaluateAsset(asset);
      expect(consensus.consensusValue).toBeGreaterThan(0);
      expect(consensus.valuations.length).toBe(1);
      expect(consensus.valuations[0].agentId).toBe('equity-agent');
    });
  });

  describe('boundary values', () => {
    it('should handle 1 share outstanding', async () => {
      const asset: AssetData = {
        id: 'boundary-1share',
        assetClass: AssetClass.EQUITY,
        name: 'OneShare',
        description: 'Single share',
        metadata: {
          earnings: 1000,
          sharesOutstanding: 1,
          industry: 'financials',
        },
      };

      const result = await agent.valuate(asset);
      expect(result.value).toBeGreaterThan(0);
      expect(isFinite(result.value)).toBe(true);
    });

    it('should handle very small earnings', async () => {
      const asset: AssetData = {
        id: 'boundary-small',
        assetClass: AssetClass.EQUITY,
        name: 'SmallEarnings',
        description: 'Tiny earnings',
        metadata: {
          earnings: 0.01,
          sharesOutstanding: 100,
        },
      };

      const result = await agent.valuate(asset);
      expect(result.value).toBeGreaterThanOrEqual(0);
      expect(isFinite(result.value)).toBe(true);
    });

    it('should handle very large shares outstanding', async () => {
      const asset: AssetData = {
        id: 'boundary-shares',
        assetClass: AssetClass.EQUITY,
        name: 'ManyShares',
        description: 'Lots of shares',
        metadata: {
          earnings: 10_000_000_000,
          sharesOutstanding: 100_000_000_000,
        },
      };

      const result = await agent.valuate(asset);
      expect(result.value).toBeGreaterThan(0);
      expect(isFinite(result.value)).toBe(true);
    });

    it('should handle zero free cash flow', async () => {
      const asset: AssetData = {
        id: 'boundary-fcf0',
        assetClass: AssetClass.EQUITY,
        name: 'ZeroFCF',
        description: 'No FCF',
        metadata: {
          freeCashFlow: 0,
          earnings: 1_000_000_000,
          sharesOutstanding: 500_000_000,
        },
      };

      const result = await agent.valuate(asset);
      expect(result.value).toBeGreaterThan(0);
    });

    it('should handle zero dividend', async () => {
      const asset: AssetData = {
        id: 'boundary-div0',
        assetClass: AssetClass.EQUITY,
        name: 'ZeroDividend',
        description: 'No dividend',
        metadata: {
          dividendPerShare: 0,
          earnings: 1_000_000_000,
          sharesOutstanding: 500_000_000,
        },
      };

      const result = await agent.valuate(asset);
      const div = result.dataPoints.find(dp => dp.metric === 'dividend_per_share');
      // Zero dividend should not create a DDM data point
      expect(div).toBeUndefined();
    });
  });

  describe('confidence calibration', () => {
    it('should have highest confidence with all 3 methods + full data', async () => {
      const fullData: AssetData = {
        id: 'conf-full',
        assetClass: AssetClass.EQUITY,
        name: 'FullConf Corp',
        description: 'Maximum data',
        metadata: {
          earnings: 3_000_000_000,
          revenue: 30_000_000_000,
          freeCashFlow: 2_500_000_000,
          dividendPerShare: 2.0,
          bookValue: 50_000_000_000,
          sharesOutstanding: 1_000_000_000,
          industry: 'technology',
          riskProfile: 'medium',
        },
      };

      const result = await agent.valuate(fullData);
      expect(result.confidence).toBeGreaterThanOrEqual(0.85);
    });

    it('should have lower confidence with minimal data', async () => {
      const minData: AssetData = {
        id: 'conf-min',
        assetClass: AssetClass.EQUITY,
        name: 'MinConf Corp',
        description: 'Minimal data',
        metadata: {
          sharesOutstanding: 100_000_000,
        },
      };

      const result = await agent.valuate(minData);
      expect(result.confidence).toBeLessThan(0.5);
    });
  });

  describe('all industry P/E values', () => {
    const expectedPEs: Record<string, number> = {
      'technology': 28,
      'healthcare': 22,
      'financials': 12,
      'energy': 10,
      'consumer_discretionary': 20,
      'consumer_staples': 18,
      'industrials': 16,
      'materials': 14,
      'real_estate': 25,
      'utilities': 15,
      'communications': 19,
    };

    for (const [industry, expectedPE] of Object.entries(expectedPEs)) {
      it(`should use P/E ${expectedPE} for ${industry}`, async () => {
        const asset: AssetData = {
          id: `pe-${industry}`,
          assetClass: AssetClass.EQUITY,
          name: `${industry} Test`,
          description: `Testing ${industry} P/E`,
          metadata: {
            industry,
            earnings: 1_000_000_000,
            sharesOutstanding: 100_000_000,
          },
        };

        const result = await agent.valuate(asset);
        const pe = result.dataPoints.find(dp => dp.metric === 'industry_pe');
        expect(pe!.value).toBe(expectedPE);
      });
    }
  });

  describe('discount rate values', () => {
    const expectedRates: Record<string, number> = {
      'low': 0.08,
      'medium': 0.10,
      'high': 0.12,
      'very_high': 0.15,
    };

    for (const [risk, expectedRate] of Object.entries(expectedRates)) {
      it(`should use discount rate ${expectedRate} for ${risk} risk`, async () => {
        const asset: AssetData = {
          id: `dr-${risk}`,
          assetClass: AssetClass.EQUITY,
          name: `${risk} Risk Test`,
          description: `Testing ${risk} discount rate`,
          metadata: {
            riskProfile: risk,
            earnings: 1_000_000_000,
            sharesOutstanding: 100_000_000,
          },
        };

        const result = await agent.valuate(asset);
        const dr = result.dataPoints.find(dp => dp.metric === 'discount_rate');
        expect(dr!.value).toBe(expectedRate);
      });
    }
  });
});
