import { EquityAgent } from '../../src/agents/equity-agent';
import { AssetClass, AssetData } from '../../src/types';

describe('EquityAgent', () => {
  let agent: EquityAgent;

  beforeEach(() => {
    agent = new EquityAgent();
  });

  describe('configuration', () => {
    it('should have correct agent ID', () => {
      expect(agent.config.id).toBe('equity-agent');
    });

    it('should handle equity asset class', () => {
      expect(agent.canValuate(AssetClass.EQUITY)).toBe(true);
    });

    it('should not handle real_estate', () => {
      expect(agent.canValuate(AssetClass.REAL_ESTATE)).toBe(false);
    });

    it('should not handle commodity', () => {
      expect(agent.canValuate(AssetClass.COMMODITY)).toBe(false);
    });

    it('should not handle treasury', () => {
      expect(agent.canValuate(AssetClass.TREASURY)).toBe(false);
    });

    it('should have descriptive name', () => {
      expect(agent.config.name).toContain('Equity');
    });

    it('should describe methodology in config', () => {
      expect(agent.config.description).toContain('P/E');
    });
  });

  describe('valuation with all data', () => {
    const techStock: AssetData = {
      id: 'eq-001',
      assetClass: AssetClass.EQUITY,
      name: 'TechCorp Inc',
      description: 'Large-cap technology company',
      metadata: {
        industry: 'technology',
        earnings: 5_000_000_000,
        revenue: 50_000_000_000,
        freeCashFlow: 4_000_000_000,
        dividendPerShare: 1.5,
        sharesOutstanding: 1_000_000_000,
        growthRate: 0.12,
        riskProfile: 'medium',
        marketCapSize: 'large',
        bookValue: 80_000_000_000,
      },
    };

    it('should produce a valuation for a tech stock', async () => {
      const result = await agent.valuate(techStock);
      expect(result.assetId).toBe('eq-001');
      expect(result.agentId).toBe('equity-agent');
      expect(result.value).toBeGreaterThan(0);
      expect(result.confidence).toBeGreaterThan(0.5);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });

    it('should include methodology description', async () => {
      const result = await agent.valuate(techStock);
      expect(result.methodology).toContain('P/E');
      expect(result.methodology).toContain('discounted cash flow');
      expect(result.methodology).toContain('dividend');
    });

    it('should gather multiple data points', async () => {
      const result = await agent.valuate(techStock);
      expect(result.dataPoints.length).toBeGreaterThanOrEqual(8);
    });

    it('should include EPS data point', async () => {
      const result = await agent.valuate(techStock);
      const eps = result.dataPoints.find(dp => dp.metric === 'earnings_per_share');
      expect(eps).toBeDefined();
      expect(eps!.value).toBe(5); // 5B earnings / 1B shares
    });

    it('should include industry P/E multiple', async () => {
      const result = await agent.valuate(techStock);
      const pe = result.dataPoints.find(dp => dp.metric === 'industry_pe');
      expect(pe).toBeDefined();
      expect(pe!.value).toBe(28); // technology P/E
    });

    it('should include free cash flow', async () => {
      const result = await agent.valuate(techStock);
      const fcf = result.dataPoints.find(dp => dp.metric === 'free_cash_flow');
      expect(fcf).toBeDefined();
      expect(fcf!.value).toBe(4_000_000_000);
    });

    it('should include dividend per share', async () => {
      const result = await agent.valuate(techStock);
      const div = result.dataPoints.find(dp => dp.metric === 'dividend_per_share');
      expect(div).toBeDefined();
      expect(div!.value).toBe(1.5);
    });

    it('should produce high confidence with full data', async () => {
      const result = await agent.valuate(techStock);
      expect(result.confidence).toBeGreaterThanOrEqual(0.8);
    });

    it('should have reasonable valuation for tech company', async () => {
      const result = await agent.valuate(techStock);
      // Tech stock with $5B earnings, P/E 28 → ~$140B just from P/E
      expect(result.value).toBeGreaterThan(50_000_000_000);
    });
  });

  describe('P/E multiple valuation', () => {
    it('should use correct industry P/E for healthcare', async () => {
      const asset: AssetData = {
        id: 'eq-health',
        assetClass: AssetClass.EQUITY,
        name: 'HealthCorp',
        description: 'Healthcare company',
        metadata: {
          industry: 'healthcare',
          earnings: 1_000_000_000,
          sharesOutstanding: 500_000_000,
        },
      };

      const result = await agent.valuate(asset);
      const pe = result.dataPoints.find(dp => dp.metric === 'industry_pe');
      expect(pe!.value).toBe(22);
    });

    it('should use correct P/E for financials', async () => {
      const asset: AssetData = {
        id: 'eq-fin',
        assetClass: AssetClass.EQUITY,
        name: 'FinCorp',
        description: 'Financial services',
        metadata: { industry: 'financials', earnings: 2_000_000_000, sharesOutstanding: 1_000_000_000 },
      };
      const result = await agent.valuate(asset);
      const pe = result.dataPoints.find(dp => dp.metric === 'industry_pe');
      expect(pe!.value).toBe(12);
    });

    it('should use correct P/E for energy', async () => {
      const asset: AssetData = {
        id: 'eq-energy',
        assetClass: AssetClass.EQUITY,
        name: 'EnergyCorp',
        description: 'Energy company',
        metadata: { industry: 'energy', earnings: 3_000_000_000, sharesOutstanding: 1_000_000_000 },
      };
      const result = await agent.valuate(asset);
      const pe = result.dataPoints.find(dp => dp.metric === 'industry_pe');
      expect(pe!.value).toBe(10);
    });

    it('should use default P/E for unknown industry', async () => {
      const asset: AssetData = {
        id: 'eq-unknown',
        assetClass: AssetClass.EQUITY,
        name: 'UnknownCorp',
        description: 'Unknown industry',
        metadata: { industry: 'quantum_computing', earnings: 500_000_000, sharesOutstanding: 100_000_000 },
      };
      const result = await agent.valuate(asset);
      const pe = result.dataPoints.find(dp => dp.metric === 'industry_pe');
      expect(pe!.value).toBe(17); // default
    });
  });

  describe('DCF valuation', () => {
    it('should compute DCF when free cash flow is provided', async () => {
      const asset: AssetData = {
        id: 'eq-dcf',
        assetClass: AssetClass.EQUITY,
        name: 'CashCow Inc',
        description: 'Strong free cash flow',
        metadata: {
          freeCashFlow: 2_000_000_000,
          growthRate: 0.08,
          riskProfile: 'low',
          sharesOutstanding: 500_000_000,
        },
      };

      const result = await agent.valuate(asset);
      expect(result.value).toBeGreaterThan(0);
      // With $2B FCF, 8% growth, 8% discount → substantial value
      expect(result.value).toBeGreaterThan(10_000_000_000);
    });

    it('should apply higher discount rate for high risk', async () => {
      const lowRisk: AssetData = {
        id: 'eq-low',
        assetClass: AssetClass.EQUITY,
        name: 'StableCorp',
        description: 'Low risk',
        metadata: { freeCashFlow: 1_000_000_000, riskProfile: 'low', sharesOutstanding: 100_000_000 },
      };
      const highRisk: AssetData = {
        id: 'eq-high',
        assetClass: AssetClass.EQUITY,
        name: 'RiskyCorp',
        description: 'High risk',
        metadata: { freeCashFlow: 1_000_000_000, riskProfile: 'high', sharesOutstanding: 100_000_000 },
      };

      const lowResult = await agent.valuate(lowRisk);
      const highResult = await agent.valuate(highRisk);

      // Lower discount rate → higher valuation
      expect(lowResult.value).toBeGreaterThan(highResult.value);
    });
  });

  describe('dividend discount model', () => {
    it('should use DDM when dividend is provided', async () => {
      const asset: AssetData = {
        id: 'eq-div',
        assetClass: AssetClass.EQUITY,
        name: 'DividendKing',
        description: 'High dividend stock',
        metadata: {
          dividendPerShare: 3.0,
          growthRate: 0.04,
          riskProfile: 'low',
          sharesOutstanding: 1_000_000_000,
          earnings: 5_000_000_000,
        },
      };

      const result = await agent.valuate(asset);
      expect(result.value).toBeGreaterThan(0);
      const div = result.dataPoints.find(dp => dp.metric === 'dividend_per_share');
      expect(div).toBeDefined();
      expect(div!.value).toBe(3.0);
    });
  });

  describe('size premium adjustment', () => {
    it('should apply zero premium for mega cap', async () => {
      const asset: AssetData = {
        id: 'eq-mega',
        assetClass: AssetClass.EQUITY,
        name: 'MegaCorp',
        description: 'Mega cap',
        metadata: {
          earnings: 10_000_000_000,
          freeCashFlow: 8_000_000_000,
          sharesOutstanding: 1_000_000_000,
          marketCapSize: 'mega',
        },
      };
      const result = await agent.valuate(asset);
      const sizePrem = result.dataPoints.find(dp => dp.metric === 'size_premium');
      expect(sizePrem!.value).toBe(0.0);
    });

    it('should apply higher premium for micro cap', async () => {
      const asset: AssetData = {
        id: 'eq-micro',
        assetClass: AssetClass.EQUITY,
        name: 'MicroCorp',
        description: 'Micro cap',
        metadata: {
          earnings: 10_000_000,
          freeCashFlow: 8_000_000,
          sharesOutstanding: 10_000_000,
          marketCapSize: 'micro',
        },
      };
      const result = await agent.valuate(asset);
      const sizePrem = result.dataPoints.find(dp => dp.metric === 'size_premium');
      expect(sizePrem!.value).toBe(0.04);
    });
  });

  describe('book value floor', () => {
    it('should floor value at 80% of book value', async () => {
      const asset: AssetData = {
        id: 'eq-bv',
        assetClass: AssetClass.EQUITY,
        name: 'BookValueCorp',
        description: 'High book value, low earnings',
        metadata: {
          bookValue: 100_000_000_000,
          earnings: 100_000, // tiny earnings
          sharesOutstanding: 1_000_000_000,
        },
      };
      const result = await agent.valuate(asset);
      // Value should be at least 80% of book value
      expect(result.value).toBeGreaterThanOrEqual(80_000_000_000);
    });
  });

  describe('edge cases', () => {
    it('should handle zero earnings', async () => {
      const asset: AssetData = {
        id: 'eq-zero',
        assetClass: AssetClass.EQUITY,
        name: 'ZeroEarnings',
        description: 'Pre-revenue startup',
        metadata: { earnings: 0, sharesOutstanding: 100_000_000 },
      };
      const result = await agent.valuate(asset);
      expect(result.value).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThan(0.5);
    });

    it('should handle missing metadata gracefully', async () => {
      const asset: AssetData = {
        id: 'eq-minimal',
        assetClass: AssetClass.EQUITY,
        name: 'MinimalData',
        description: 'Barely any data',
        metadata: {},
      };
      const result = await agent.valuate(asset);
      expect(result.value).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThan(0.5);
    });

    it('should throw for wrong asset class', async () => {
      const asset: AssetData = {
        id: 'wrong',
        assetClass: AssetClass.COMMODITY,
        name: 'NotEquity',
        description: 'Wrong class',
        metadata: {},
      };
      await expect(agent.valuate(asset)).rejects.toThrow('cannot valuate');
    });

    it('should handle very large earnings', async () => {
      const asset: AssetData = {
        id: 'eq-large',
        assetClass: AssetClass.EQUITY,
        name: 'MegaEarner',
        description: 'Massive earnings',
        metadata: {
          earnings: 100_000_000_000,
          sharesOutstanding: 5_000_000_000,
          industry: 'technology',
        },
      };
      const result = await agent.valuate(asset);
      expect(result.value).toBeGreaterThan(0);
      expect(isFinite(result.value)).toBe(true);
    });

    it('should handle negative earnings gracefully', async () => {
      const asset: AssetData = {
        id: 'eq-neg',
        assetClass: AssetClass.EQUITY,
        name: 'LossMaker',
        description: 'Losing money',
        metadata: {
          earnings: -500_000_000,
          freeCashFlow: 200_000_000,
          sharesOutstanding: 100_000_000,
        },
      };
      const result = await agent.valuate(asset);
      // Should still produce a valuation from DCF
      expect(result.value).toBeGreaterThan(0);
    });
  });

  describe('profit margin calculation', () => {
    it('should compute profit margin from earnings and revenue', async () => {
      const asset: AssetData = {
        id: 'eq-margin',
        assetClass: AssetClass.EQUITY,
        name: 'MarginCorp',
        description: 'Good margins',
        metadata: {
          earnings: 2_000_000_000,
          revenue: 10_000_000_000,
          sharesOutstanding: 500_000_000,
        },
      };
      const result = await agent.valuate(asset);
      const margin = result.dataPoints.find(dp => dp.metric === 'profit_margin');
      expect(margin).toBeDefined();
      expect(margin!.value).toBeCloseTo(0.2, 2); // 20% margin
    });
  });

  describe('industry coverage', () => {
    const industries = [
      'technology', 'healthcare', 'financials', 'energy',
      'consumer_discretionary', 'consumer_staples', 'industrials',
      'materials', 'utilities', 'communications',
    ];

    for (const industry of industries) {
      it(`should handle ${industry} industry`, async () => {
        const asset: AssetData = {
          id: `eq-${industry}`,
          assetClass: AssetClass.EQUITY,
          name: `${industry} Corp`,
          description: `${industry} company`,
          metadata: {
            industry,
            earnings: 1_000_000_000,
            sharesOutstanding: 500_000_000,
          },
        };
        const result = await agent.valuate(asset);
        expect(result.value).toBeGreaterThan(0);
        expect(result.confidence).toBeGreaterThan(0);
      });
    }
  });

  describe('growth rate impact', () => {
    it('should value high-growth company more than low-growth', async () => {
      const highGrowth: AssetData = {
        id: 'eq-hg',
        assetClass: AssetClass.EQUITY,
        name: 'HighGrowth',
        description: 'Fast growing',
        metadata: {
          freeCashFlow: 1_000_000_000,
          growthRate: 0.20,
          riskProfile: 'medium',
          sharesOutstanding: 100_000_000,
        },
      };
      const lowGrowth: AssetData = {
        id: 'eq-lg',
        assetClass: AssetClass.EQUITY,
        name: 'LowGrowth',
        description: 'Slow growing',
        metadata: {
          freeCashFlow: 1_000_000_000,
          growthRate: 0.02,
          riskProfile: 'medium',
          sharesOutstanding: 100_000_000,
        },
      };

      const hgResult = await agent.valuate(highGrowth);
      const lgResult = await agent.valuate(lowGrowth);
      expect(hgResult.value).toBeGreaterThan(lgResult.value);
    });
  });

  describe('timestamp and metadata', () => {
    it('should include timestamp in valuation', async () => {
      const asset: AssetData = {
        id: 'eq-ts',
        assetClass: AssetClass.EQUITY,
        name: 'TimeCorp',
        description: 'Timestamp test',
        metadata: { earnings: 1_000_000_000, sharesOutstanding: 100_000_000 },
      };
      const result = await agent.valuate(asset);
      expect(result.timestamp).toBeInstanceOf(Date);
    });

    it('should have data points with timestamps', async () => {
      const asset: AssetData = {
        id: 'eq-dp',
        assetClass: AssetClass.EQUITY,
        name: 'DataPointCorp',
        description: 'Data point test',
        metadata: { earnings: 1_000_000_000, sharesOutstanding: 100_000_000 },
      };
      const result = await agent.valuate(asset);
      for (const dp of result.dataPoints) {
        expect(dp.timestamp).toBeInstanceOf(Date);
        expect(dp.weight).toBeGreaterThan(0);
        expect(dp.weight).toBeLessThanOrEqual(1);
      }
    });
  });
});
