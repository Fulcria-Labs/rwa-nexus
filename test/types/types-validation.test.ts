import {
  AssetClass,
  AssetData,
  ValuationResult,
  ConsensusResult,
  DataPoint,
  AgentConfig,
  OracleSubmission,
  PortfolioAsset,
  LendingPosition,
} from '../../src/types';

describe('Type Enumerations', () => {
  describe('AssetClass enum', () => {
    it('should have REAL_ESTATE value', () => {
      expect(AssetClass.REAL_ESTATE).toBe('real_estate');
    });

    it('should have COMMODITY value', () => {
      expect(AssetClass.COMMODITY).toBe('commodity');
    });

    it('should have TREASURY value', () => {
      expect(AssetClass.TREASURY).toBe('treasury');
    });

    it('should have EQUITY value', () => {
      expect(AssetClass.EQUITY).toBe('equity');
    });

    it('should have RECEIVABLE value', () => {
      expect(AssetClass.RECEIVABLE).toBe('receivable');
    });

    it('should have exactly 5 asset classes', () => {
      const values = Object.values(AssetClass);
      expect(values).toHaveLength(5);
    });

    it('should have unique values for all entries', () => {
      const values = Object.values(AssetClass);
      const unique = new Set(values);
      expect(unique.size).toBe(values.length);
    });

    it('should use snake_case format for all values', () => {
      for (const value of Object.values(AssetClass)) {
        expect(value).toMatch(/^[a-z]+(_[a-z]+)*$/);
      }
    });
  });
});

describe('Type Structure Validation', () => {
  describe('AssetData interface compliance', () => {
    it('should accept minimal valid asset data', () => {
      const asset: AssetData = {
        id: 'test-1',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Test Property',
        description: 'A test property',
        metadata: {},
      };
      expect(asset.id).toBe('test-1');
      expect(asset.location).toBeUndefined();
    });

    it('should accept asset data with location', () => {
      const asset: AssetData = {
        id: 'test-2',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'NYC Property',
        description: 'Manhattan apartment',
        location: 'manhattan',
        metadata: { squareFeet: 1500 },
      };
      expect(asset.location).toBe('manhattan');
    });

    it('should accept asset data with complex metadata', () => {
      const asset: AssetData = {
        id: 'test-3',
        assetClass: AssetClass.COMMODITY,
        name: 'Gold Reserve',
        description: 'Physical gold',
        metadata: {
          commodity: 'gold',
          quantity: 100,
          grade: 'premium',
          nested: { a: 1, b: [2, 3] },
        },
      };
      expect(asset.metadata.commodity).toBe('gold');
      expect(asset.metadata.nested).toBeDefined();
    });

    it('should accept empty string id', () => {
      const asset: AssetData = {
        id: '',
        assetClass: AssetClass.TREASURY,
        name: '',
        description: '',
        metadata: {},
      };
      expect(asset.id).toBe('');
    });
  });

  describe('DataPoint interface compliance', () => {
    it('should accept numeric value', () => {
      const dp: DataPoint = {
        source: 'market',
        metric: 'price',
        value: 2650.50,
        timestamp: new Date(),
        weight: 0.5,
      };
      expect(dp.value).toBe(2650.50);
    });

    it('should accept string value', () => {
      const dp: DataPoint = {
        source: 'credit_agency',
        metric: 'credit_rating',
        value: 'AAA',
        timestamp: new Date(),
        weight: 0.1,
      };
      expect(dp.value).toBe('AAA');
    });

    it('should accept zero weight', () => {
      const dp: DataPoint = {
        source: 'test',
        metric: 'test',
        value: 0,
        timestamp: new Date(),
        weight: 0,
      };
      expect(dp.weight).toBe(0);
    });

    it('should accept weight of 1', () => {
      const dp: DataPoint = {
        source: 'test',
        metric: 'test',
        value: 100,
        timestamp: new Date(),
        weight: 1,
      };
      expect(dp.weight).toBe(1);
    });

    it('should accept negative numeric value', () => {
      const dp: DataPoint = {
        source: 'pnl',
        metric: 'loss',
        value: -500,
        timestamp: new Date(),
        weight: 0.3,
      };
      expect(dp.value).toBe(-500);
    });
  });

  describe('ValuationResult interface compliance', () => {
    it('should accept complete valuation result', () => {
      const result: ValuationResult = {
        assetId: 'asset-1',
        value: 500000,
        confidence: 0.85,
        methodology: 'DCF analysis',
        dataPoints: [],
        timestamp: new Date(),
        agentId: 'agent-1',
      };
      expect(result.value).toBe(500000);
      expect(result.confidence).toBe(0.85);
    });

    it('should accept zero value valuation', () => {
      const result: ValuationResult = {
        assetId: 'zero-asset',
        value: 0,
        confidence: 0.1,
        methodology: 'unknown',
        dataPoints: [],
        timestamp: new Date(),
        agentId: 'agent-1',
      };
      expect(result.value).toBe(0);
    });

    it('should accept valuation with multiple data points', () => {
      const now = new Date();
      const result: ValuationResult = {
        assetId: 'multi-dp',
        value: 100000,
        confidence: 0.9,
        methodology: 'blended',
        dataPoints: [
          { source: 'a', metric: 'm1', value: 1, timestamp: now, weight: 0.3 },
          { source: 'b', metric: 'm2', value: 2, timestamp: now, weight: 0.3 },
          { source: 'c', metric: 'm3', value: 3, timestamp: now, weight: 0.4 },
        ],
        timestamp: now,
        agentId: 'agent-1',
      };
      expect(result.dataPoints).toHaveLength(3);
    });
  });

  describe('ConsensusResult interface compliance', () => {
    it('should accept valid consensus result', () => {
      const result: ConsensusResult = {
        assetId: 'cons-1',
        consensusValue: 250000,
        avgConfidence: 0.82,
        valuations: [],
        methodology: 'weighted average',
        timestamp: new Date(),
      };
      expect(result.consensusValue).toBe(250000);
    });

    it('should accept consensus with multiple valuations', () => {
      const now = new Date();
      const v1: ValuationResult = {
        assetId: 'a', value: 100, confidence: 0.8,
        methodology: 'm1', dataPoints: [], timestamp: now, agentId: 'ag1',
      };
      const v2: ValuationResult = {
        assetId: 'a', value: 120, confidence: 0.9,
        methodology: 'm2', dataPoints: [], timestamp: now, agentId: 'ag2',
      };
      const result: ConsensusResult = {
        assetId: 'a',
        consensusValue: 110,
        avgConfidence: 0.85,
        valuations: [v1, v2],
        methodology: 'consensus',
        timestamp: now,
      };
      expect(result.valuations).toHaveLength(2);
    });
  });

  describe('AgentConfig interface compliance', () => {
    it('should accept minimal agent config', () => {
      const config: AgentConfig = {
        id: 'agent-1',
        name: 'Test Agent',
        assetClasses: [],
        description: 'test',
      };
      expect(config.assetClasses).toHaveLength(0);
    });

    it('should accept multi-class agent config', () => {
      const config: AgentConfig = {
        id: 'multi',
        name: 'Multi Agent',
        assetClasses: [AssetClass.REAL_ESTATE, AssetClass.COMMODITY, AssetClass.TREASURY],
        description: 'Handles multiple asset classes',
      };
      expect(config.assetClasses).toHaveLength(3);
    });
  });

  describe('OracleSubmission interface compliance', () => {
    it('should accept valid oracle submission', () => {
      const submission: OracleSubmission = {
        assetId: 'oracle-1',
        value: BigInt('500000000000000000000000'),
        confidence: 8500,
        methodology: 'consensus',
      };
      expect(submission.confidence).toBe(8500);
      expect(typeof submission.value).toBe('bigint');
    });

    it('should accept zero confidence submission', () => {
      const submission: OracleSubmission = {
        assetId: 'low-conf',
        value: 0n,
        confidence: 0,
        methodology: 'unknown',
      };
      expect(submission.confidence).toBe(0);
    });

    it('should accept max confidence (10000 basis points)', () => {
      const submission: OracleSubmission = {
        assetId: 'high-conf',
        value: 1000000000000000000n,
        confidence: 10000,
        methodology: 'certain',
      };
      expect(submission.confidence).toBe(10000);
    });
  });

  describe('PortfolioAsset interface compliance', () => {
    it('should accept portfolio asset with null valuation', () => {
      const pa: PortfolioAsset = {
        tokenId: 1,
        assetData: {
          id: 'pa-1',
          assetClass: AssetClass.REAL_ESTATE,
          name: 'Property',
          description: '',
          metadata: {},
        },
        currentValuation: null,
        tokenSupply: 1000,
        oracleAssetId: 'oracle-pa-1',
      };
      expect(pa.currentValuation).toBeNull();
    });

    it('should accept portfolio asset with valuation', () => {
      const pa: PortfolioAsset = {
        tokenId: 42,
        assetData: {
          id: 'pa-2',
          assetClass: AssetClass.COMMODITY,
          name: 'Gold',
          description: '',
          metadata: {},
        },
        currentValuation: {
          assetId: 'pa-2',
          consensusValue: 265000,
          avgConfidence: 0.83,
          valuations: [],
          methodology: 'spot',
          timestamp: new Date(),
        },
        tokenSupply: 500,
        oracleAssetId: 'oracle-pa-2',
      };
      expect(pa.currentValuation!.consensusValue).toBe(265000);
    });
  });

  describe('LendingPosition interface compliance', () => {
    it('should accept active lending position', () => {
      const pos: LendingPosition = {
        loanId: 1,
        tokenId: 42,
        collateralAmount: 100,
        loanAmount: BigInt('50000000000000000000000'),
        interestRate: 0.08,
        startTime: new Date(),
        active: true,
      };
      expect(pos.active).toBe(true);
      expect(typeof pos.loanAmount).toBe('bigint');
    });

    it('should accept inactive lending position', () => {
      const pos: LendingPosition = {
        loanId: 2,
        tokenId: 42,
        collateralAmount: 0,
        loanAmount: 0n,
        interestRate: 0.08,
        startTime: new Date('2025-01-01'),
        active: false,
      };
      expect(pos.active).toBe(false);
    });

    it('should accept zero interest rate', () => {
      const pos: LendingPosition = {
        loanId: 3,
        tokenId: 1,
        collateralAmount: 50,
        loanAmount: 25000n,
        interestRate: 0,
        startTime: new Date(),
        active: true,
      };
      expect(pos.interestRate).toBe(0);
    });
  });
});
