import { ReceivablesAgent } from '../../src/agents/receivables-agent';
import { AssetClass, AssetData } from '../../src/types';

describe('ReceivablesAgent', () => {
  let agent: ReceivablesAgent;

  beforeEach(() => {
    agent = new ReceivablesAgent();
  });

  describe('configuration', () => {
    it('should have correct agent ID', () => {
      expect(agent.config.id).toBe('receivables-agent');
    });

    it('should have descriptive name', () => {
      expect(agent.config.name).toBe('Receivables Factoring Agent');
    });

    it('should handle receivable asset class', () => {
      expect(agent.canValuate(AssetClass.RECEIVABLE)).toBe(true);
    });

    it('should not handle real estate', () => {
      expect(agent.canValuate(AssetClass.REAL_ESTATE)).toBe(false);
    });

    it('should not handle commodity', () => {
      expect(agent.canValuate(AssetClass.COMMODITY)).toBe(false);
    });

    it('should not handle treasury', () => {
      expect(agent.canValuate(AssetClass.TREASURY)).toBe(false);
    });

    it('should not handle equity', () => {
      expect(agent.canValuate(AssetClass.EQUITY)).toBe(false);
    });

    it('should have description mentioning factoring', () => {
      expect(agent.config.description).toContain('factoring');
    });
  });

  describe('basic valuation', () => {
    it('should valuate a fresh high-quality invoice', async () => {
      const asset: AssetData = {
        id: 'inv-001',
        assetClass: AssetClass.RECEIVABLE,
        name: 'Tech Invoice',
        description: 'Net-30 invoice from Fortune 500 tech company',
        metadata: {
          faceValue: 100000,
          daysPastDue: 0,
          creditRating: 'AAA',
          industry: 'technology',
          paymentHistory: 0.99,
          daysToMaturity: 30,
        },
      };

      const result = await agent.valuate(asset);

      expect(result.assetId).toBe('inv-001');
      expect(result.agentId).toBe('receivables-agent');
      // High-quality fresh invoice should be close to face value
      expect(result.value).toBeGreaterThan(90000);
      expect(result.value).toBeLessThan(100000);
      expect(result.confidence).toBeGreaterThan(0.8);
    });

    it('should valuate a distressed aged invoice', async () => {
      const asset: AssetData = {
        id: 'inv-002',
        assetClass: AssetClass.RECEIVABLE,
        name: 'Delinquent Invoice',
        description: '6-month overdue invoice from struggling retailer',
        metadata: {
          faceValue: 50000,
          daysPastDue: 200,
          creditRating: 'CCC',
          industry: 'retail',
          paymentHistory: 0.5,
          daysToMaturity: 30,
        },
      };

      const result = await agent.valuate(asset);

      // Distressed invoice should be significantly discounted
      expect(result.value).toBeLessThan(25000);
      expect(result.value).toBeGreaterThan(0);
      expect(result.confidence).toBeLessThan(0.7);
    });

    it('should return zero value for zero face value', async () => {
      const asset: AssetData = {
        id: 'inv-zero',
        assetClass: AssetClass.RECEIVABLE,
        name: 'Zero Invoice',
        description: '',
        metadata: { faceValue: 0 },
      };

      const result = await agent.valuate(asset);
      expect(result.value).toBe(0);
      expect(result.confidence).toBe(0.1);
    });
  });

  describe('aging analysis', () => {
    const makeInvoice = (daysPastDue: number): AssetData => ({
      id: `inv-age-${daysPastDue}`,
      assetClass: AssetClass.RECEIVABLE,
      name: `Invoice ${daysPastDue}d`,
      description: '',
      metadata: {
        faceValue: 100000,
        daysPastDue,
        creditRating: 'A',
        industry: 'technology',
        paymentHistory: 0.9,
        daysToMaturity: 30,
      },
    });

    it('should value current invoices highest', async () => {
      const result = await agent.valuate(makeInvoice(0));
      expect(result.value).toBeGreaterThan(90000);
    });

    it('should discount 30-day invoices less than 60-day', async () => {
      const result30 = await agent.valuate(makeInvoice(30));
      const result60 = await agent.valuate(makeInvoice(60));
      expect(result30.value).toBeGreaterThan(result60.value);
    });

    it('should discount 60-day invoices less than 90-day', async () => {
      const result60 = await agent.valuate(makeInvoice(60));
      const result90 = await agent.valuate(makeInvoice(90));
      expect(result60.value).toBeGreaterThan(result90.value);
    });

    it('should discount 90-day invoices less than 120-day', async () => {
      const result90 = await agent.valuate(makeInvoice(90));
      const result120 = await agent.valuate(makeInvoice(120));
      expect(result90.value).toBeGreaterThan(result120.value);
    });

    it('should heavily discount 180-day invoices', async () => {
      const result = await agent.valuate(makeInvoice(180));
      expect(result.value).toBeLessThan(70000);
    });

    it('should severely discount 365+ day invoices', async () => {
      const result = await agent.valuate(makeInvoice(400));
      expect(result.value).toBeLessThan(40000);
    });

    it('should monotonically decrease value with aging', async () => {
      const ages = [0, 31, 61, 91, 121, 181, 271, 366, 500];
      const values: number[] = [];

      for (const age of ages) {
        const result = await agent.valuate(makeInvoice(age));
        values.push(result.value);
      }

      for (let i = 1; i < values.length; i++) {
        expect(values[i]).toBeLessThanOrEqual(values[i - 1]);
      }
    });
  });

  describe('credit rating impact', () => {
    const makeRatedInvoice = (creditRating: string): AssetData => ({
      id: `inv-${creditRating}`,
      assetClass: AssetClass.RECEIVABLE,
      name: `${creditRating} Invoice`,
      description: '',
      metadata: {
        faceValue: 100000,
        daysPastDue: 15,
        creditRating,
        industry: 'technology',
        paymentHistory: 0.9,
        daysToMaturity: 60,
      },
    });

    it('should value AAA higher than BBB', async () => {
      const aaa = await agent.valuate(makeRatedInvoice('AAA'));
      const bbb = await agent.valuate(makeRatedInvoice('BBB'));
      expect(aaa.value).toBeGreaterThan(bbb.value);
    });

    it('should value A higher than BB', async () => {
      const a = await agent.valuate(makeRatedInvoice('A'));
      const bb = await agent.valuate(makeRatedInvoice('BB'));
      expect(a.value).toBeGreaterThan(bb.value);
    });

    it('should value investment grade higher than junk', async () => {
      const bbb = await agent.valuate(makeRatedInvoice('BBB'));
      const ccc = await agent.valuate(makeRatedInvoice('CCC'));
      expect(bbb.value).toBeGreaterThan(ccc.value);
    });

    it('should give higher confidence for investment grade', async () => {
      const aaa = await agent.valuate(makeRatedInvoice('AAA'));
      const ccc = await agent.valuate(makeRatedInvoice('CCC'));
      expect(aaa.confidence).toBeGreaterThan(ccc.confidence);
    });

    it('should handle unrated debtors', async () => {
      const result = await agent.valuate(makeRatedInvoice('unrated'));
      expect(result.value).toBeGreaterThan(0);
      expect(result.value).toBeLessThan(100000);
    });

    it('should handle D-rated (defaulted) debtors', async () => {
      const result = await agent.valuate(makeRatedInvoice('D'));
      expect(result.value).toBeLessThan(90000);
    });

    it('should value D rated lower than CCC', async () => {
      const d = await agent.valuate(makeRatedInvoice('D'));
      const ccc = await agent.valuate(makeRatedInvoice('CCC'));
      expect(d.value).toBeLessThan(ccc.value);
    });
  });

  describe('industry default rates', () => {
    const makeIndustryInvoice = (industry: string): AssetData => ({
      id: `inv-${industry}`,
      assetClass: AssetClass.RECEIVABLE,
      name: `${industry} Invoice`,
      description: '',
      metadata: {
        faceValue: 100000,
        daysPastDue: 10,
        creditRating: 'A',
        industry,
        paymentHistory: 0.9,
        daysToMaturity: 30,
      },
    });

    it('should value government invoices highest (lowest default rate)', async () => {
      const gov = await agent.valuate(makeIndustryInvoice('government'));
      const retail = await agent.valuate(makeIndustryInvoice('retail'));
      expect(gov.value).toBeGreaterThan(retail.value);
    });

    it('should value healthcare higher than construction', async () => {
      const health = await agent.valuate(makeIndustryInvoice('healthcare'));
      const construction = await agent.valuate(makeIndustryInvoice('construction'));
      expect(health.value).toBeGreaterThan(construction.value);
    });

    it('should value financial services higher than hospitality', async () => {
      const fin = await agent.valuate(makeIndustryInvoice('financial_services'));
      const hosp = await agent.valuate(makeIndustryInvoice('hospitality'));
      expect(fin.value).toBeGreaterThan(hosp.value);
    });

    it('should handle unknown industries with default rate', async () => {
      const result = await agent.valuate(makeIndustryInvoice('unknown_industry'));
      expect(result.value).toBeGreaterThan(0);
    });
  });

  describe('payment history impact', () => {
    const makeHistoryInvoice = (paymentHistory: number): AssetData => ({
      id: `inv-hist-${paymentHistory}`,
      assetClass: AssetClass.RECEIVABLE,
      name: 'History Invoice',
      description: '',
      metadata: {
        faceValue: 100000,
        daysPastDue: 15,
        creditRating: 'A',
        industry: 'technology',
        paymentHistory,
        daysToMaturity: 30,
      },
    });

    it('should value perfect payment history higher', async () => {
      const perfect = await agent.valuate(makeHistoryInvoice(1.0));
      const poor = await agent.valuate(makeHistoryInvoice(0.5));
      expect(perfect.value).toBeGreaterThan(poor.value);
    });

    it('should give higher confidence for excellent payment history', async () => {
      const excellent = await agent.valuate(makeHistoryInvoice(0.98));
      const poor = await agent.valuate(makeHistoryInvoice(0.4));
      expect(excellent.confidence).toBeGreaterThan(poor.confidence);
    });

    it('should clamp payment history to [0, 1]', async () => {
      const over = await agent.valuate(makeHistoryInvoice(1.5));
      const under = await agent.valuate(makeHistoryInvoice(-0.5));
      // Should not crash and values should be reasonable
      expect(over.value).toBeGreaterThan(0);
      expect(under.value).toBeGreaterThan(0);
    });
  });

  describe('concentration risk', () => {
    const makeConcentratedInvoice = (concentrationPct: number): AssetData => ({
      id: `inv-conc-${concentrationPct}`,
      assetClass: AssetClass.RECEIVABLE,
      name: 'Concentrated Invoice',
      description: '',
      metadata: {
        faceValue: 100000,
        daysPastDue: 10,
        creditRating: 'A',
        industry: 'technology',
        paymentHistory: 0.9,
        concentrationPct,
        daysToMaturity: 30,
      },
    });

    it('should not penalize diversified portfolios (under 50%)', async () => {
      const div = await agent.valuate(makeConcentratedInvoice(0.3));
      const noConc = await agent.valuate(makeConcentratedInvoice(0));
      // Values should be similar since both are below threshold
      expect(Math.abs(div.value - noConc.value)).toBeLessThan(1000);
    });

    it('should penalize high concentration (over 50%)', async () => {
      const low = await agent.valuate(makeConcentratedInvoice(0.3));
      const high = await agent.valuate(makeConcentratedInvoice(0.8));
      expect(low.value).toBeGreaterThan(high.value);
    });

    it('should penalize 100% concentration', async () => {
      const result = await agent.valuate(makeConcentratedInvoice(1.0));
      expect(result.value).toBeLessThan(95000);
    });
  });

  describe('recourse impact', () => {
    it('should value recourse receivables higher', async () => {
      const recourse: AssetData = {
        id: 'inv-rec',
        assetClass: AssetClass.RECEIVABLE,
        name: 'Recourse Invoice',
        description: '',
        metadata: {
          faceValue: 100000,
          daysPastDue: 15,
          creditRating: 'A',
          industry: 'technology',
          paymentHistory: 0.9,
          recourse: true,
          daysToMaturity: 30,
        },
      };

      const nonRecourse: AssetData = {
        ...recourse,
        id: 'inv-norec',
        name: 'Non-Recourse Invoice',
        metadata: { ...recourse.metadata, recourse: false },
      };

      const recResult = await agent.valuate(recourse);
      const noRecResult = await agent.valuate(nonRecourse);

      expect(recResult.value).toBeGreaterThan(noRecResult.value);
    });
  });

  describe('diversification bonus', () => {
    const makePoolInvoice = (invoiceCount: number): AssetData => ({
      id: `inv-pool-${invoiceCount}`,
      assetClass: AssetClass.RECEIVABLE,
      name: 'Invoice Pool',
      description: '',
      metadata: {
        faceValue: 100000,
        daysPastDue: 15,
        creditRating: 'A',
        industry: 'technology',
        paymentHistory: 0.9,
        invoiceCount,
        daysToMaturity: 30,
      },
    });

    it('should give bonus for diversified pools (>10 invoices)', async () => {
      const diversified = await agent.valuate(makePoolInvoice(25));
      const single = await agent.valuate(makePoolInvoice(1));
      expect(diversified.value).toBeGreaterThan(single.value);
    });

    it('should give higher confidence for larger pools', async () => {
      const large = await agent.valuate(makePoolInvoice(20));
      const small = await agent.valuate(makePoolInvoice(2));
      expect(large.confidence).toBeGreaterThan(small.confidence);
    });
  });

  describe('time-value discounting', () => {
    const makeMaturityInvoice = (daysToMaturity: number): AssetData => ({
      id: `inv-mat-${daysToMaturity}`,
      assetClass: AssetClass.RECEIVABLE,
      name: 'Maturity Invoice',
      description: '',
      metadata: {
        faceValue: 100000,
        daysPastDue: 0,
        creditRating: 'A',
        industry: 'technology',
        paymentHistory: 0.9,
        daysToMaturity,
      },
    });

    it('should value near-maturity higher than far-maturity', async () => {
      const near = await agent.valuate(makeMaturityInvoice(7));
      const far = await agent.valuate(makeMaturityInvoice(180));
      expect(near.value).toBeGreaterThan(far.value);
    });

    it('should apply time-value discount proportionally', async () => {
      const d30 = await agent.valuate(makeMaturityInvoice(30));
      const d90 = await agent.valuate(makeMaturityInvoice(90));
      const d180 = await agent.valuate(makeMaturityInvoice(180));

      expect(d30.value).toBeGreaterThan(d90.value);
      expect(d90.value).toBeGreaterThan(d180.value);
    });
  });

  describe('methodology', () => {
    it('should include methodology in result', async () => {
      const asset: AssetData = {
        id: 'inv-method',
        assetClass: AssetClass.RECEIVABLE,
        name: 'Test Invoice',
        description: '',
        metadata: { faceValue: 10000 },
      };

      const result = await agent.valuate(asset);
      expect(result.methodology).toContain('factoring');
      expect(result.methodology).toContain('collection');
    });
  });

  describe('data points', () => {
    it('should include all expected data points', async () => {
      const asset: AssetData = {
        id: 'inv-dp',
        assetClass: AssetClass.RECEIVABLE,
        name: 'Full Data Invoice',
        description: '',
        metadata: {
          faceValue: 100000,
          daysPastDue: 30,
          creditRating: 'BBB',
          industry: 'healthcare',
          paymentHistory: 0.85,
          concentrationPct: 0.3,
          daysToMaturity: 60,
          invoiceCount: 5,
          recourse: true,
        },
      };

      const result = await agent.valuate(asset);
      const metrics = result.dataPoints.map(dp => dp.metric);

      expect(metrics).toContain('face_value');
      expect(metrics).toContain('days_past_due');
      expect(metrics).toContain('collection_probability');
      expect(metrics).toContain('credit_spread');
      expect(metrics).toContain('credit_rating');
      expect(metrics).toContain('default_rate');
      expect(metrics).toContain('payment_history_score');
      expect(metrics).toContain('concentration_pct');
      expect(metrics).toContain('days_to_maturity');
      expect(metrics).toContain('invoice_count');
      expect(metrics).toContain('recourse');
    });

    it('should have proper sources', async () => {
      const asset: AssetData = {
        id: 'inv-src',
        assetClass: AssetClass.RECEIVABLE,
        name: 'Source Invoice',
        description: '',
        metadata: { faceValue: 50000, concentrationPct: 0.2 },
      };

      const result = await agent.valuate(asset);
      const sources = new Set(result.dataPoints.map(dp => dp.source));

      expect(sources).toContain('invoice_data');
      expect(sources).toContain('aging_analysis');
      expect(sources).toContain('credit_analysis');
      expect(sources).toContain('industry_data');
    });

    it('should have timestamps on all data points', async () => {
      const asset: AssetData = {
        id: 'inv-ts',
        assetClass: AssetClass.RECEIVABLE,
        name: 'TS Invoice',
        description: '',
        metadata: { faceValue: 10000 },
      };

      const result = await agent.valuate(asset);
      for (const dp of result.dataPoints) {
        expect(dp.timestamp).toBeInstanceOf(Date);
      }
    });

    it('should have weights that sum to approximately 1', async () => {
      const asset: AssetData = {
        id: 'inv-wt',
        assetClass: AssetClass.RECEIVABLE,
        name: 'Weight Invoice',
        description: '',
        metadata: {
          faceValue: 100000,
          concentrationPct: 0.2,
          daysPastDue: 30,
        },
      };

      const result = await agent.valuate(asset);
      const totalWeight = result.dataPoints.reduce((sum, dp) => sum + dp.weight, 0);
      // Should be roughly 1.0 (some variation based on optional fields)
      expect(totalWeight).toBeGreaterThan(0.5);
      expect(totalWeight).toBeLessThan(2.0);
    });
  });

  describe('error handling', () => {
    it('should reject non-receivable asset class', async () => {
      const asset: AssetData = {
        id: 'wrong-class',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Wrong Class',
        description: '',
        metadata: {},
      };

      await expect(agent.valuate(asset)).rejects.toThrow('cannot valuate');
    });

    it('should handle missing metadata gracefully', async () => {
      const asset: AssetData = {
        id: 'inv-empty',
        assetClass: AssetClass.RECEIVABLE,
        name: 'Empty Metadata',
        description: '',
        metadata: {},
      };

      const result = await agent.valuate(asset);
      expect(result.value).toBe(0);
      expect(result.confidence).toBe(0.1);
    });

    it('should handle negative face value', async () => {
      const asset: AssetData = {
        id: 'inv-neg',
        assetClass: AssetClass.RECEIVABLE,
        name: 'Negative Invoice',
        description: '',
        metadata: { faceValue: -50000 },
      };

      const result = await agent.valuate(asset);
      expect(result.value).toBe(0);
    });
  });

  describe('edge cases', () => {
    it('should handle very large face values', async () => {
      const asset: AssetData = {
        id: 'inv-large',
        assetClass: AssetClass.RECEIVABLE,
        name: 'Large Invoice',
        description: '',
        metadata: {
          faceValue: 10000000, // $10M
          daysPastDue: 10,
          creditRating: 'AA',
          industry: 'financial_services',
          paymentHistory: 0.99,
        },
      };

      const result = await agent.valuate(asset);
      expect(result.value).toBeGreaterThan(9000000);
      expect(result.value).toBeLessThan(10000000);
      expect(Number.isFinite(result.value)).toBe(true);
    });

    it('should handle very small face values', async () => {
      const asset: AssetData = {
        id: 'inv-small',
        assetClass: AssetClass.RECEIVABLE,
        name: 'Small Invoice',
        description: '',
        metadata: {
          faceValue: 100, // $100
          daysPastDue: 5,
          creditRating: 'A',
        },
      };

      const result = await agent.valuate(asset);
      expect(result.value).toBeGreaterThan(80);
      expect(result.value).toBeLessThan(100);
    });

    it('should return confidence between 0 and 1', async () => {
      const scenarios = [
        { faceValue: 100000, daysPastDue: 0, creditRating: 'AAA', paymentHistory: 1.0 },
        { faceValue: 100000, daysPastDue: 500, creditRating: 'D', paymentHistory: 0.1 },
        { faceValue: 100000, daysPastDue: 60, creditRating: 'BBB', paymentHistory: 0.7 },
      ];

      for (const meta of scenarios) {
        const result = await agent.valuate({
          id: `inv-conf-${meta.creditRating}`,
          assetClass: AssetClass.RECEIVABLE,
          name: 'Confidence Test',
          description: '',
          metadata: meta,
        });

        expect(result.confidence).toBeGreaterThanOrEqual(0);
        expect(result.confidence).toBeLessThanOrEqual(1);
      }
    });

    it('should handle all supported industries', async () => {
      const industries = [
        'technology', 'healthcare', 'manufacturing', 'retail', 'construction',
        'energy', 'financial_services', 'government', 'education',
        'transportation', 'telecommunications', 'agriculture', 'hospitality',
        'real_estate', 'professional_services',
      ];

      for (const industry of industries) {
        const result = await agent.valuate({
          id: `inv-ind-${industry}`,
          assetClass: AssetClass.RECEIVABLE,
          name: `${industry} Invoice`,
          description: '',
          metadata: { faceValue: 50000, industry },
        });

        expect(result.value).toBeGreaterThan(0);
      }
    });

    it('should handle all supported credit ratings', async () => {
      const ratings = ['AAA', 'AA', 'A', 'BBB', 'BB', 'B', 'CCC', 'CC', 'C', 'D', 'unrated'];

      for (const creditRating of ratings) {
        const result = await agent.valuate({
          id: `inv-rate-${creditRating}`,
          assetClass: AssetClass.RECEIVABLE,
          name: `${creditRating} Invoice`,
          description: '',
          metadata: { faceValue: 50000, creditRating },
        });

        expect(result.value).toBeGreaterThan(0);
      }
    });
  });

  describe('combined factors', () => {
    it('should produce best value for ideal conditions', async () => {
      const ideal: AssetData = {
        id: 'inv-ideal',
        assetClass: AssetClass.RECEIVABLE,
        name: 'Ideal Invoice',
        description: '',
        metadata: {
          faceValue: 100000,
          daysPastDue: 0,
          creditRating: 'AAA',
          industry: 'government',
          paymentHistory: 1.0,
          invoiceCount: 50,
          recourse: true,
          daysToMaturity: 7,
          concentrationPct: 0.05,
        },
      };

      const result = await agent.valuate(ideal);
      // Best possible conditions should get close to face value
      expect(result.value).toBeGreaterThan(95000);
      expect(result.confidence).toBeGreaterThan(0.85);
    });

    it('should produce worst value for terrible conditions', async () => {
      const terrible: AssetData = {
        id: 'inv-terrible',
        assetClass: AssetClass.RECEIVABLE,
        name: 'Terrible Invoice',
        description: '',
        metadata: {
          faceValue: 100000,
          daysPastDue: 400,
          creditRating: 'D',
          industry: 'hospitality',
          paymentHistory: 0.1,
          invoiceCount: 1,
          recourse: false,
          daysToMaturity: 365,
          concentrationPct: 0.9,
        },
      };

      const result = await agent.valuate(terrible);
      expect(result.value).toBeLessThan(15000);
      expect(result.confidence).toBeLessThan(0.6);
    });

    it('should produce intermediate value for mixed conditions', async () => {
      const mixed: AssetData = {
        id: 'inv-mixed',
        assetClass: AssetClass.RECEIVABLE,
        name: 'Mixed Invoice',
        description: '',
        metadata: {
          faceValue: 100000,
          daysPastDue: 45,
          creditRating: 'BBB',
          industry: 'manufacturing',
          paymentHistory: 0.75,
          invoiceCount: 8,
          daysToMaturity: 60,
        },
      };

      const result = await agent.valuate(mixed);
      expect(result.value).toBeGreaterThan(50000);
      expect(result.value).toBeLessThan(95000);
      expect(result.confidence).toBeGreaterThan(0.5);
      expect(result.confidence).toBeLessThan(0.9);
    });
  });
});
