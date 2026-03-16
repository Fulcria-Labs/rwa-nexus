import { ReceivablesAgent } from '../../src/agents/receivables-agent';
import { ConsensusEngine } from '../../src/oracle/consensus';
import { AssetClass, AssetData } from '../../src/types';

describe('ReceivablesAgent Advanced', () => {
  let agent: ReceivablesAgent;

  beforeEach(() => {
    agent = new ReceivablesAgent();
  });

  describe('factoring scenarios', () => {
    it('should handle supply chain finance (net-30 tech)', async () => {
      const asset: AssetData = {
        id: 'scf-001',
        assetClass: AssetClass.RECEIVABLE,
        name: 'Apple Supply Chain Invoice',
        description: 'Net-30 supplier invoice to Apple Inc',
        metadata: {
          faceValue: 250000,
          daysPastDue: 0,
          creditRating: 'AA',
          industry: 'technology',
          paymentHistory: 0.98,
          daysToMaturity: 30,
          invoiceCount: 1,
          recourse: false,
        },
      };

      const result = await agent.valuate(asset);
      // High-quality tech debtor, fresh invoice
      expect(result.value).toBeGreaterThan(230000);
      expect(result.confidence).toBeGreaterThan(0.75);
    });

    it('should handle government contract receivables', async () => {
      const asset: AssetData = {
        id: 'gov-001',
        assetClass: AssetClass.RECEIVABLE,
        name: 'DoD Contract Payment',
        description: 'US government defense contract milestone payment',
        metadata: {
          faceValue: 1000000,
          daysPastDue: 45, // government often pays slowly
          creditRating: 'AAA',
          industry: 'government',
          paymentHistory: 0.95,
          daysToMaturity: 90,
          recourse: false,
        },
      };

      const result = await agent.valuate(asset);
      // Government is safest debtor, just slow
      expect(result.value).toBeGreaterThan(900000);
      expect(result.confidence).toBeGreaterThan(0.7);
    });

    it('should handle distressed retail receivables pool', async () => {
      const asset: AssetData = {
        id: 'retail-pool',
        assetClass: AssetClass.RECEIVABLE,
        name: 'Retail AR Pool',
        description: 'Pool of aging retail invoices',
        metadata: {
          faceValue: 500000,
          daysPastDue: 120,
          creditRating: 'B',
          industry: 'retail',
          paymentHistory: 0.6,
          invoiceCount: 50,
          daysToMaturity: 30,
          concentrationPct: 0.15,
        },
      };

      const result = await agent.valuate(asset);
      // Distressed but diversified pool
      expect(result.value).toBeLessThan(350000);
      expect(result.value).toBeGreaterThan(100000);
    });

    it('should handle healthcare receivables with insurance delays', async () => {
      const asset: AssetData = {
        id: 'health-001',
        assetClass: AssetClass.RECEIVABLE,
        name: 'Hospital Insurance Claims',
        description: 'Bundled insurance claim receivables',
        metadata: {
          faceValue: 200000,
          daysPastDue: 60, // insurance processing delay
          creditRating: 'A',
          industry: 'healthcare',
          paymentHistory: 0.88,
          invoiceCount: 30,
          daysToMaturity: 45,
        },
      };

      const result = await agent.valuate(asset);
      expect(result.value).toBeGreaterThan(150000);
      expect(result.value).toBeLessThan(195000);
    });

    it('should handle construction progress billing', async () => {
      const asset: AssetData = {
        id: 'const-001',
        assetClass: AssetClass.RECEIVABLE,
        name: 'Construction Progress Payment',
        description: 'Commercial construction milestone billing',
        metadata: {
          faceValue: 750000,
          daysPastDue: 90,
          creditRating: 'BBB',
          industry: 'construction',
          paymentHistory: 0.7,
          daysToMaturity: 60,
          concentrationPct: 0.8, // single project
          recourse: true,
        },
      };

      const result = await agent.valuate(asset);
      // High concentration + construction risk + aging
      expect(result.value).toBeLessThan(600000);
      expect(result.value).toBeGreaterThan(300000);
    });
  });

  describe('portfolio-level receivables', () => {
    it('should show diversification benefits', async () => {
      const singleDebtor: AssetData = {
        id: 'single',
        assetClass: AssetClass.RECEIVABLE,
        name: 'Single Debtor',
        description: '',
        metadata: {
          faceValue: 100000,
          daysPastDue: 20,
          creditRating: 'A',
          industry: 'technology',
          paymentHistory: 0.9,
          invoiceCount: 1,
          concentrationPct: 1.0,
        },
      };

      const diversified: AssetData = {
        ...singleDebtor,
        id: 'diverse',
        name: 'Diversified Pool',
        metadata: {
          ...singleDebtor.metadata,
          invoiceCount: 20,
          concentrationPct: 0.1,
        },
      };

      const singleResult = await agent.valuate(singleDebtor);
      const diverseResult = await agent.valuate(diversified);

      expect(diverseResult.value).toBeGreaterThan(singleResult.value);
      expect(diverseResult.confidence).toBeGreaterThan(singleResult.confidence);
    });
  });

  describe('consensus engine integration', () => {
    it('should integrate with consensus engine for receivables', async () => {
      const engine = new ConsensusEngine();
      engine.registerAgent(agent);

      const asset: AssetData = {
        id: 'consensus-recv',
        assetClass: AssetClass.RECEIVABLE,
        name: 'Consensus Test Invoice',
        description: '',
        metadata: {
          faceValue: 100000,
          daysPastDue: 15,
          creditRating: 'A',
          industry: 'technology',
          paymentHistory: 0.95,
        },
      };

      const result = await engine.evaluateAsset(asset);
      expect(result.consensusValue).toBeGreaterThan(0);
      expect(result.valuations).toHaveLength(1);
      expect(result.valuations[0].agentId).toBe('receivables-agent');
    });

    it('should not interfere with other asset classes', async () => {
      const engine = new ConsensusEngine();
      engine.registerAgent(agent);

      // Receivables agent should not be selected for real estate
      const capableForRE = engine.getAgents().filter(a => a.canValuate(AssetClass.REAL_ESTATE));
      expect(capableForRE).toHaveLength(0);
    });
  });

  describe('discount rate sensitivity', () => {
    it('should be sensitive to credit spread changes', async () => {
      // AAA has 0.5% spread, CCC has 10% spread
      // This should create meaningful valuation differences
      const baseAsset: AssetData = {
        id: 'spread-test',
        assetClass: AssetClass.RECEIVABLE,
        name: 'Spread Test',
        description: '',
        metadata: {
          faceValue: 100000,
          daysPastDue: 10,
          industry: 'technology',
          paymentHistory: 0.9,
          daysToMaturity: 180, // longer maturity amplifies spread impact
        },
      };

      const aaa = await agent.valuate({
        ...baseAsset,
        id: 'spread-aaa',
        metadata: { ...baseAsset.metadata, creditRating: 'AAA' },
      });

      const ccc = await agent.valuate({
        ...baseAsset,
        id: 'spread-ccc',
        metadata: { ...baseAsset.metadata, creditRating: 'CCC' },
      });

      // With 180-day maturity, the spread difference should create a meaningful gap
      const spreadImpact = aaa.value - ccc.value;
      expect(spreadImpact).toBeGreaterThan(1000);
    });
  });

  describe('valuation consistency', () => {
    it('should produce deterministic results', async () => {
      const asset: AssetData = {
        id: 'det-test',
        assetClass: AssetClass.RECEIVABLE,
        name: 'Deterministic Test',
        description: '',
        metadata: {
          faceValue: 100000,
          daysPastDue: 30,
          creditRating: 'BBB',
          industry: 'healthcare',
          paymentHistory: 0.85,
        },
      };

      const result1 = await agent.valuate(asset);
      const result2 = await agent.valuate(asset);

      expect(result1.value).toBe(result2.value);
      expect(result1.confidence).toBe(result2.confidence);
    });

    it('should handle rapid sequential valuations', async () => {
      const promises = Array.from({ length: 20 }, (_, i) =>
        agent.valuate({
          id: `rapid-${i}`,
          assetClass: AssetClass.RECEIVABLE,
          name: `Invoice ${i}`,
          description: '',
          metadata: {
            faceValue: 10000 * (i + 1),
            daysPastDue: i * 10,
            creditRating: 'A',
          },
        })
      );

      const results = await Promise.all(promises);
      expect(results).toHaveLength(20);

      // Values should decrease as aging increases
      for (let i = 1; i < results.length; i++) {
        // Normalize by face value to compare apples to apples
        const ratio1 = results[i - 1].value / (10000 * i);
        const ratio2 = results[i].value / (10000 * (i + 1));
        expect(ratio1).toBeGreaterThanOrEqual(ratio2 * 0.99); // Allow small rounding tolerance
      }
    });
  });

  describe('real-world invoice patterns', () => {
    it('should handle net-30 terms correctly', async () => {
      const asset: AssetData = {
        id: 'net30',
        assetClass: AssetClass.RECEIVABLE,
        name: 'Net-30 Invoice',
        description: '',
        metadata: {
          faceValue: 50000,
          daysPastDue: 0,
          daysToMaturity: 30,
          creditRating: 'A',
          industry: 'professional_services',
          paymentHistory: 0.92,
        },
      };

      const result = await agent.valuate(asset);
      // Net-30 with good credit should retain ~95%+ of face value
      expect(result.value / 50000).toBeGreaterThan(0.93);
    });

    it('should handle net-60 terms correctly', async () => {
      const asset: AssetData = {
        id: 'net60',
        assetClass: AssetClass.RECEIVABLE,
        name: 'Net-60 Invoice',
        description: '',
        metadata: {
          faceValue: 50000,
          daysPastDue: 0,
          daysToMaturity: 60,
          creditRating: 'A',
          industry: 'professional_services',
          paymentHistory: 0.92,
        },
      };

      const result = await agent.valuate(asset);
      expect(result.value / 50000).toBeGreaterThan(0.90);
    });

    it('should handle net-90 terms correctly', async () => {
      const asset: AssetData = {
        id: 'net90',
        assetClass: AssetClass.RECEIVABLE,
        name: 'Net-90 Invoice',
        description: '',
        metadata: {
          faceValue: 50000,
          daysPastDue: 0,
          daysToMaturity: 90,
          creditRating: 'A',
          industry: 'professional_services',
          paymentHistory: 0.92,
        },
      };

      const result = await agent.valuate(asset);
      expect(result.value / 50000).toBeGreaterThan(0.88);
    });

    it('should handle overdue net-30 invoice', async () => {
      const asset: AssetData = {
        id: 'overdue-net30',
        assetClass: AssetClass.RECEIVABLE,
        name: 'Overdue Net-30',
        description: '',
        metadata: {
          faceValue: 50000,
          daysPastDue: 60, // 30 days past terms
          daysToMaturity: 15,
          creditRating: 'BBB',
          industry: 'manufacturing',
          paymentHistory: 0.75,
        },
      };

      const result = await agent.valuate(asset);
      // Overdue reduces collection probability
      expect(result.value / 50000).toBeLessThan(0.92);
    });
  });
});
