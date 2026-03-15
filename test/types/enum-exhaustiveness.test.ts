import { AssetClass, AssetData, ValuationResult, ConsensusResult, DataPoint, AgentConfig, OracleSubmission, PortfolioAsset, LendingPosition } from '../../src/types';

describe('Type System Exhaustiveness', () => {
  // ---- AssetClass enum ----
  describe('AssetClass enum', () => {
    it('has exactly 5 values', () => {
      const values = Object.values(AssetClass);
      expect(values.length).toBe(5);
    });

    it('contains real_estate', () => {
      expect(AssetClass.REAL_ESTATE).toBe('real_estate');
    });

    it('contains commodity', () => {
      expect(AssetClass.COMMODITY).toBe('commodity');
    });

    it('contains treasury', () => {
      expect(AssetClass.TREASURY).toBe('treasury');
    });

    it('contains equity', () => {
      expect(AssetClass.EQUITY).toBe('equity');
    });

    it('contains receivable', () => {
      expect(AssetClass.RECEIVABLE).toBe('receivable');
    });

    it('all values are lowercase snake_case strings', () => {
      for (const v of Object.values(AssetClass)) {
        expect(v).toMatch(/^[a-z_]+$/);
      }
    });
  });

  // ---- AssetData interface ----
  describe('AssetData structure', () => {
    it('minimal valid asset', () => {
      const asset: AssetData = {
        id: 'test',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Test',
        description: '',
        metadata: {},
      };
      expect(asset.id).toBe('test');
      expect(asset.location).toBeUndefined();
    });

    it('full asset with all fields', () => {
      const asset: AssetData = {
        id: 'full',
        assetClass: AssetClass.COMMODITY,
        name: 'Full Asset',
        description: 'A complete asset',
        location: 'New York',
        metadata: { key: 'value', nested: { deep: true } },
      };
      expect(asset.location).toBe('New York');
      expect(asset.metadata.key).toBe('value');
    });

    it('metadata supports various value types', () => {
      const asset: AssetData = {
        id: 'meta',
        assetClass: AssetClass.TREASURY,
        name: 'Meta',
        description: '',
        metadata: {
          string: 'hello',
          number: 42,
          boolean: true,
          null_val: null,
          array: [1, 2, 3],
          nested: { a: 1 },
        },
      };
      expect(asset.metadata.string).toBe('hello');
      expect(asset.metadata.number).toBe(42);
      expect(asset.metadata.array).toEqual([1, 2, 3]);
    });
  });

  // ---- ValuationResult interface ----
  describe('ValuationResult structure', () => {
    it('minimal valid result', () => {
      const result: ValuationResult = {
        assetId: 'a1',
        value: 100000,
        confidence: 0.8,
        methodology: 'test',
        dataPoints: [],
        timestamp: new Date(),
        agentId: 'agent-1',
      };
      expect(result.value).toBe(100000);
      expect(result.confidence).toBe(0.8);
    });

    it('result with data points', () => {
      const dp: DataPoint = {
        source: 'market',
        metric: 'price',
        value: 100,
        timestamp: new Date(),
        weight: 0.5,
      };
      const result: ValuationResult = {
        assetId: 'a1',
        value: 100000,
        confidence: 0.8,
        methodology: 'test',
        dataPoints: [dp],
        timestamp: new Date(),
        agentId: 'agent-1',
      };
      expect(result.dataPoints.length).toBe(1);
      expect(result.dataPoints[0].source).toBe('market');
    });
  });

  // ---- DataPoint interface ----
  describe('DataPoint structure', () => {
    it('numeric value data point', () => {
      const dp: DataPoint = {
        source: 'market_data',
        metric: 'spot_price',
        value: 2650.5,
        timestamp: new Date(),
        weight: 0.4,
      };
      expect(typeof dp.value).toBe('number');
    });

    it('string value data point', () => {
      const dp: DataPoint = {
        source: 'credit_analysis',
        metric: 'credit_rating',
        value: 'AAA',
        timestamp: new Date(),
        weight: 0.1,
      };
      expect(typeof dp.value).toBe('string');
    });

    it('weight between 0 and 1', () => {
      const weights = [0, 0.1, 0.25, 0.5, 0.75, 1.0];
      for (const w of weights) {
        const dp: DataPoint = {
          source: 'test',
          metric: 'test',
          value: 0,
          timestamp: new Date(),
          weight: w,
        };
        expect(dp.weight).toBeGreaterThanOrEqual(0);
        expect(dp.weight).toBeLessThanOrEqual(1);
      }
    });
  });

  // ---- ConsensusResult interface ----
  describe('ConsensusResult structure', () => {
    it('valid consensus result', () => {
      const cr: ConsensusResult = {
        assetId: 'a1',
        consensusValue: 150000,
        avgConfidence: 0.85,
        valuations: [],
        methodology: 'Confidence-weighted consensus',
        timestamp: new Date(),
      };
      expect(cr.consensusValue).toBe(150000);
      expect(cr.avgConfidence).toBe(0.85);
    });

    it('consensus with multiple valuations', () => {
      const v1: ValuationResult = {
        assetId: 'a1', value: 100000, confidence: 0.8,
        methodology: 'm1', dataPoints: [], timestamp: new Date(), agentId: 'ag1',
      };
      const v2: ValuationResult = {
        assetId: 'a1', value: 200000, confidence: 0.9,
        methodology: 'm2', dataPoints: [], timestamp: new Date(), agentId: 'ag2',
      };
      const cr: ConsensusResult = {
        assetId: 'a1',
        consensusValue: 155555.56,
        avgConfidence: 0.9,
        valuations: [v1, v2],
        methodology: 'Consensus from 2 agents',
        timestamp: new Date(),
      };
      expect(cr.valuations.length).toBe(2);
    });
  });

  // ---- AgentConfig interface ----
  describe('AgentConfig structure', () => {
    it('single asset class agent', () => {
      const config: AgentConfig = {
        id: 'property-agent',
        name: 'Property Valuation Agent',
        assetClasses: [AssetClass.REAL_ESTATE],
        description: 'Specializes in real estate',
      };
      expect(config.assetClasses.length).toBe(1);
    });

    it('multi-asset class agent (hypothetical)', () => {
      const config: AgentConfig = {
        id: 'multi-agent',
        name: 'Multi-Class Agent',
        assetClasses: [AssetClass.EQUITY, AssetClass.RECEIVABLE],
        description: 'Handles multiple asset classes',
      };
      expect(config.assetClasses.length).toBe(2);
      expect(config.assetClasses).toContain(AssetClass.EQUITY);
      expect(config.assetClasses).toContain(AssetClass.RECEIVABLE);
    });
  });

  // ---- OracleSubmission interface ----
  describe('OracleSubmission structure', () => {
    it('valid submission with bigint value', () => {
      const sub: OracleSubmission = {
        assetId: 'asset-1',
        value: BigInt('100000000000000000000000'), // 100,000 * 10^18
        confidence: 8500, // 85% in basis points
        methodology: 'AI consensus',
      };
      expect(sub.value).toBeGreaterThan(0n);
      expect(sub.confidence).toBe(8500);
    });

    it('zero value submission', () => {
      const sub: OracleSubmission = {
        assetId: 'asset-0',
        value: 0n,
        confidence: 0,
        methodology: 'No data',
      };
      expect(sub.value).toBe(0n);
      expect(sub.confidence).toBe(0);
    });

    it('max confidence submission', () => {
      const sub: OracleSubmission = {
        assetId: 'asset-max',
        value: 1000000000000000000n,
        confidence: 10000, // 100% in basis points
        methodology: 'Perfect data',
      };
      expect(sub.confidence).toBe(10000);
    });
  });

  // ---- PortfolioAsset interface ----
  describe('PortfolioAsset structure', () => {
    it('portfolio asset with valuation', () => {
      const pa: PortfolioAsset = {
        tokenId: 1,
        assetData: {
          id: 'pa-1',
          assetClass: AssetClass.REAL_ESTATE,
          name: 'House',
          description: '',
          metadata: {},
        },
        currentValuation: {
          assetId: 'pa-1',
          consensusValue: 500000,
          avgConfidence: 0.85,
          valuations: [],
          methodology: 'test',
          timestamp: new Date(),
        },
        tokenSupply: 1000,
        oracleAssetId: 'oracle-pa-1',
      };
      expect(pa.tokenId).toBe(1);
      expect(pa.tokenSupply).toBe(1000);
    });

    it('portfolio asset without valuation', () => {
      const pa: PortfolioAsset = {
        tokenId: 2,
        assetData: {
          id: 'pa-2',
          assetClass: AssetClass.COMMODITY,
          name: 'Gold Reserve',
          description: '',
          metadata: {},
        },
        currentValuation: null,
        tokenSupply: 100,
        oracleAssetId: 'oracle-pa-2',
      };
      expect(pa.currentValuation).toBeNull();
    });
  });

  // ---- LendingPosition interface ----
  describe('LendingPosition structure', () => {
    it('active lending position', () => {
      const lp: LendingPosition = {
        loanId: 1,
        tokenId: 1,
        collateralAmount: 100,
        loanAmount: BigInt('50000000000000000000000'), // $50k in 18 decimals
        interestRate: 0.05,
        startTime: new Date(),
        active: true,
      };
      expect(lp.active).toBe(true);
      expect(lp.loanAmount).toBeGreaterThan(0n);
    });

    it('closed lending position', () => {
      const lp: LendingPosition = {
        loanId: 2,
        tokenId: 1,
        collateralAmount: 50,
        loanAmount: BigInt('25000000000000000000000'),
        interestRate: 0.08,
        startTime: new Date('2024-01-01'),
        active: false,
      };
      expect(lp.active).toBe(false);
    });
  });

  // ---- Type coercion safety ----
  describe('type coercion boundaries', () => {
    it('Number.MAX_SAFE_INTEGER as value', () => {
      const result: ValuationResult = {
        assetId: 'max',
        value: Number.MAX_SAFE_INTEGER,
        confidence: 1.0,
        methodology: 'test',
        dataPoints: [],
        timestamp: new Date(),
        agentId: 'test',
      };
      expect(result.value).toBe(Number.MAX_SAFE_INTEGER);
      expect(Number.isSafeInteger(result.value)).toBe(true);
    });

    it('very small fractional value', () => {
      const result: ValuationResult = {
        assetId: 'tiny',
        value: 0.000001,
        confidence: 0.000001,
        methodology: 'test',
        dataPoints: [],
        timestamp: new Date(),
        agentId: 'test',
      };
      expect(result.value).toBeCloseTo(0.000001);
      expect(result.confidence).toBeCloseTo(0.000001);
    });

    it('Infinity is not a valid number (but technically possible)', () => {
      const val = Infinity;
      expect(Number.isFinite(val)).toBe(false);
    });

    it('NaN is not a valid number', () => {
      const val = NaN;
      expect(Number.isNaN(val)).toBe(true);
    });
  });
});
