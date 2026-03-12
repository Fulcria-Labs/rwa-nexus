import {
  AssetClass,
  AssetData,
  ValuationResult,
  DataPoint,
  ConsensusResult,
  AgentConfig,
  OracleSubmission,
  PortfolioAsset,
  LendingPosition,
} from '../../src/types';

/**
 * Tests for types/interfaces: validates enum values, object shape,
 * and correct coercion / serialization behaviour.
 */

describe('AssetClass enum', () => {
  it('should have REAL_ESTATE with value "real_estate"', () => {
    expect(AssetClass.REAL_ESTATE).toBe('real_estate');
  });

  it('should have COMMODITY with value "commodity"', () => {
    expect(AssetClass.COMMODITY).toBe('commodity');
  });

  it('should have TREASURY with value "treasury"', () => {
    expect(AssetClass.TREASURY).toBe('treasury');
  });

  it('should have EQUITY with value "equity"', () => {
    expect(AssetClass.EQUITY).toBe('equity');
  });

  it('should have RECEIVABLE with value "receivable"', () => {
    expect(AssetClass.RECEIVABLE).toBe('receivable');
  });

  it('should expose exactly 5 asset classes', () => {
    const values = Object.values(AssetClass);
    expect(values).toHaveLength(5);
  });

  it('should contain all expected string values', () => {
    const values = Object.values(AssetClass);
    expect(values).toContain('real_estate');
    expect(values).toContain('commodity');
    expect(values).toContain('treasury');
    expect(values).toContain('equity');
    expect(values).toContain('receivable');
  });

  it('should support value comparison via equality', () => {
    const cls: string = AssetClass.COMMODITY; // typed as string to avoid TS narrowing error
    expect(cls === AssetClass.COMMODITY).toBe(true);
    expect(cls === AssetClass.REAL_ESTATE).toBe(false);
  });
});

describe('AssetData interface', () => {
  it('should accept a minimal valid object', () => {
    const asset: AssetData = {
      id: 'id-1',
      assetClass: AssetClass.REAL_ESTATE,
      name: 'Test Property',
      description: 'A test',
      metadata: {},
    };
    expect(asset.id).toBe('id-1');
    expect(asset.assetClass).toBe(AssetClass.REAL_ESTATE);
    expect(asset.name).toBe('Test Property');
    expect(asset.metadata).toEqual({});
  });

  it('should accept an optional location field', () => {
    const asset: AssetData = {
      id: 'id-2',
      assetClass: AssetClass.REAL_ESTATE,
      name: 'Located Property',
      description: '',
      location: 'manhattan',
      metadata: {},
    };
    expect(asset.location).toBe('manhattan');
  });

  it('should allow undefined location', () => {
    const asset: AssetData = {
      id: 'id-3',
      assetClass: AssetClass.COMMODITY,
      name: 'Gold Bars',
      description: '',
      metadata: { commodity: 'gold', quantity: 100 },
    };
    expect(asset.location).toBeUndefined();
  });

  it('should store arbitrary metadata', () => {
    const asset: AssetData = {
      id: 'id-4',
      assetClass: AssetClass.TREASURY,
      name: 'Bond',
      description: '',
      metadata: {
        bondType: 'us_treasury',
        maturityYears: 10,
        couponRate: 0.04,
        faceValue: 1000,
        nested: { a: 1, b: [2, 3] },
      },
    };
    expect(asset.metadata.bondType).toBe('us_treasury');
    expect(asset.metadata.maturityYears).toBe(10);
    expect(asset.metadata.nested).toEqual({ a: 1, b: [2, 3] });
  });

  it('should allow metadata values of mixed types', () => {
    const asset: AssetData = {
      id: 'id-5',
      assetClass: AssetClass.COMMODITY,
      name: 'Mixed Meta',
      description: '',
      metadata: {
        number: 42,
        string: 'hello',
        boolean: true,
        array: [1, 2, 3],
        nullValue: null,
      },
    };
    expect(typeof asset.metadata.number).toBe('number');
    expect(typeof asset.metadata.string).toBe('string');
    expect(asset.metadata.nullValue).toBeNull();
  });
});

describe('DataPoint interface', () => {
  it('should accept a numeric value', () => {
    const dp: DataPoint = {
      source: 'market_data',
      metric: 'spot_price',
      value: 2650,
      timestamp: new Date(),
      weight: 0.5,
    };
    expect(dp.value).toBe(2650);
    expect(typeof dp.value).toBe('number');
  });

  it('should accept a string value', () => {
    const dp: DataPoint = {
      source: 'credit_analysis',
      metric: 'credit_rating',
      value: 'AAA',
      timestamp: new Date(),
      weight: 0.1,
    };
    expect(dp.value).toBe('AAA');
    expect(typeof dp.value).toBe('string');
  });

  it('should store weight between 0 and 1', () => {
    const dp: DataPoint = {
      source: 'test',
      metric: 'test',
      value: 0,
      timestamp: new Date(),
      weight: 0.25,
    };
    expect(dp.weight).toBeGreaterThanOrEqual(0);
    expect(dp.weight).toBeLessThanOrEqual(1);
  });

  it('should store timestamp as Date', () => {
    const now = new Date();
    const dp: DataPoint = {
      source: 'test',
      metric: 'test',
      value: 0,
      timestamp: now,
      weight: 1,
    };
    expect(dp.timestamp).toBeInstanceOf(Date);
    expect(dp.timestamp).toBe(now);
  });
});

describe('ValuationResult interface', () => {
  function makeValuationResult(overrides: Partial<ValuationResult> = {}): ValuationResult {
    return {
      assetId: 'asset-001',
      value: 100000,
      confidence: 0.85,
      methodology: 'test methodology',
      dataPoints: [],
      timestamp: new Date(),
      agentId: 'agent-001',
      ...overrides,
    };
  }

  it('should have all required fields', () => {
    const result = makeValuationResult();
    expect(result).toHaveProperty('assetId');
    expect(result).toHaveProperty('value');
    expect(result).toHaveProperty('confidence');
    expect(result).toHaveProperty('methodology');
    expect(result).toHaveProperty('dataPoints');
    expect(result).toHaveProperty('timestamp');
    expect(result).toHaveProperty('agentId');
  });

  it('should represent USD value as a number', () => {
    const result = makeValuationResult({ value: 1500000.50 });
    expect(typeof result.value).toBe('number');
    expect(result.value).toBe(1500000.50);
  });

  it('should represent confidence on 0-1 scale', () => {
    const result = makeValuationResult({ confidence: 0.75 });
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  it('should accept empty dataPoints array', () => {
    const result = makeValuationResult({ dataPoints: [] });
    expect(result.dataPoints).toHaveLength(0);
  });

  it('should accept non-empty dataPoints array', () => {
    const dp: DataPoint = {
      source: 's',
      metric: 'm',
      value: 1,
      timestamp: new Date(),
      weight: 0.5,
    };
    const result = makeValuationResult({ dataPoints: [dp] });
    expect(result.dataPoints).toHaveLength(1);
  });
});

describe('ConsensusResult interface', () => {
  function makeConsensusResult(overrides: Partial<ConsensusResult> = {}): ConsensusResult {
    return {
      assetId: 'asset-001',
      consensusValue: 200000,
      avgConfidence: 0.87,
      valuations: [],
      methodology: 'confidence-weighted consensus',
      timestamp: new Date(),
      ...overrides,
    };
  }

  it('should have all required fields', () => {
    const result = makeConsensusResult();
    expect(result).toHaveProperty('assetId');
    expect(result).toHaveProperty('consensusValue');
    expect(result).toHaveProperty('avgConfidence');
    expect(result).toHaveProperty('valuations');
    expect(result).toHaveProperty('methodology');
    expect(result).toHaveProperty('timestamp');
  });

  it('should store valuations as an array', () => {
    const result = makeConsensusResult({ valuations: [] });
    expect(Array.isArray(result.valuations)).toBe(true);
  });

  it('should allow nested ValuationResult objects in valuations', () => {
    const valuation: ValuationResult = {
      assetId: 'asset-001',
      value: 100000,
      confidence: 0.8,
      methodology: 'test',
      dataPoints: [],
      timestamp: new Date(),
      agentId: 'agent-1',
    };
    const result = makeConsensusResult({ valuations: [valuation] });
    expect(result.valuations).toHaveLength(1);
    expect(result.valuations[0].agentId).toBe('agent-1');
  });

  it('should distinguish consensusValue from individual valuation values', () => {
    const valuation: ValuationResult = {
      assetId: 'asset-001',
      value: 95000,
      confidence: 0.9,
      methodology: 'test',
      dataPoints: [],
      timestamp: new Date(),
      agentId: 'agent-1',
    };
    const result = makeConsensusResult({ consensusValue: 100000, valuations: [valuation] });
    expect(result.consensusValue).toBe(100000);
    expect(result.valuations[0].value).toBe(95000);
  });
});

describe('AgentConfig interface', () => {
  it('should accept a valid configuration', () => {
    const config: AgentConfig = {
      id: 'prop-agent',
      name: 'Property Agent',
      assetClasses: [AssetClass.REAL_ESTATE],
      description: 'Handles real estate',
    };
    expect(config.id).toBe('prop-agent');
    expect(config.assetClasses).toContain(AssetClass.REAL_ESTATE);
  });

  it('should accept multiple asset classes', () => {
    const config: AgentConfig = {
      id: 'multi-agent',
      name: 'Multi Agent',
      assetClasses: [AssetClass.COMMODITY, AssetClass.TREASURY],
      description: 'Handles multiple classes',
    };
    expect(config.assetClasses).toHaveLength(2);
    expect(config.assetClasses[0]).toBe(AssetClass.COMMODITY);
  });

  it('should accept empty assetClasses array', () => {
    const config: AgentConfig = {
      id: 'empty-agent',
      name: 'Empty',
      assetClasses: [],
      description: 'No classes',
    };
    expect(config.assetClasses).toHaveLength(0);
  });
});

describe('OracleSubmission interface', () => {
  it('should represent value as bigint', () => {
    const submission: OracleSubmission = {
      assetId: 'asset-001',
      value: 1500000000000000000000n,
      confidence: 8500,
      methodology: 'test',
    };
    expect(typeof submission.value).toBe('bigint');
    expect(submission.value).toBe(1500000000000000000000n);
  });

  it('should represent confidence as integer basis points (0-10000)', () => {
    const submission: OracleSubmission = {
      assetId: 'asset-001',
      value: 0n,
      confidence: 9500,
      methodology: 'test',
    };
    expect(submission.confidence).toBe(9500);
    expect(submission.confidence).toBeGreaterThanOrEqual(0);
    expect(submission.confidence).toBeLessThanOrEqual(10000);
  });

  it('should store assetId as string', () => {
    const submission: OracleSubmission = {
      assetId: 'gold-reserve-001',
      value: 1000n,
      confidence: 7500,
      methodology: 'spot price',
    };
    expect(typeof submission.assetId).toBe('string');
  });
});

describe('PortfolioAsset interface', () => {
  it('should accept a valid portfolio asset with null valuation', () => {
    const asset: PortfolioAsset = {
      tokenId: 1,
      assetData: {
        id: 'asset-001',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Property',
        description: '',
        metadata: {},
      },
      currentValuation: null,
      tokenSupply: 1000,
      oracleAssetId: 'oracle-asset-001',
    };
    expect(asset.currentValuation).toBeNull();
    expect(asset.tokenId).toBe(1);
  });

  it('should accept a portfolio asset with a ConsensusResult', () => {
    const consensus: ConsensusResult = {
      assetId: 'asset-001',
      consensusValue: 500000,
      avgConfidence: 0.88,
      valuations: [],
      methodology: 'test',
      timestamp: new Date(),
    };

    const asset: PortfolioAsset = {
      tokenId: 42,
      assetData: {
        id: 'asset-001',
        assetClass: AssetClass.COMMODITY,
        name: 'Gold',
        description: '',
        metadata: {},
      },
      currentValuation: consensus,
      tokenSupply: 5000,
      oracleAssetId: 'gold-oracle-001',
    };
    expect(asset.currentValuation).not.toBeNull();
    expect(asset.currentValuation!.consensusValue).toBe(500000);
  });
});

describe('LendingPosition interface', () => {
  it('should accept a valid active lending position', () => {
    const position: LendingPosition = {
      loanId: 1,
      tokenId: 10,
      collateralAmount: 100000,
      loanAmount: 50000000000000000000000n,
      interestRate: 0.08,
      startTime: new Date(),
      active: true,
    };
    expect(position.active).toBe(true);
    expect(typeof position.loanAmount).toBe('bigint');
  });

  it('should accept an inactive lending position', () => {
    const position: LendingPosition = {
      loanId: 2,
      tokenId: 20,
      collateralAmount: 50000,
      loanAmount: 25000000000000000000000n,
      interestRate: 0.06,
      startTime: new Date('2025-01-01'),
      active: false,
    };
    expect(position.active).toBe(false);
  });

  it('should store loanAmount as bigint', () => {
    const position: LendingPosition = {
      loanId: 3,
      tokenId: 5,
      collateralAmount: 10000,
      loanAmount: 999999999999999999999n,
      interestRate: 0.05,
      startTime: new Date(),
      active: true,
    };
    expect(typeof position.loanAmount).toBe('bigint');
  });
});

describe('Type compatibility and runtime shape', () => {
  it('should confirm AssetClass enum values are strings at runtime', () => {
    for (const val of Object.values(AssetClass)) {
      expect(typeof val).toBe('string');
    }
  });

  it('should be able to use AssetClass value as a Record key', () => {
    const capRates: Record<string, number> = {
      [AssetClass.REAL_ESTATE]: 0.05,
      [AssetClass.COMMODITY]: 0,
    };
    expect(capRates[AssetClass.REAL_ESTATE]).toBe(0.05);
    expect(capRates[AssetClass.COMMODITY]).toBe(0);
  });

  it('should support switch/case on AssetClass', () => {
    function describeClass(cls: AssetClass): string {
      switch (cls) {
        case AssetClass.REAL_ESTATE: return 'property';
        case AssetClass.COMMODITY: return 'commodity';
        case AssetClass.TREASURY: return 'bond';
        case AssetClass.EQUITY: return 'stock';
        case AssetClass.RECEIVABLE: return 'receivable';
        default: return 'unknown';
      }
    }
    expect(describeClass(AssetClass.REAL_ESTATE)).toBe('property');
    expect(describeClass(AssetClass.TREASURY)).toBe('bond');
  });
});
