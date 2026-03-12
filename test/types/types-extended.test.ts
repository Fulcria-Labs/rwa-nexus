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

describe('Types - Extended Edge Cases', () => {
  describe('AssetClass enum completeness', () => {
    it('should have exactly 5 unique values', () => {
      const values = Object.values(AssetClass);
      const unique = new Set(values);
      expect(unique.size).toBe(5);
    });

    it('should have snake_case values', () => {
      Object.values(AssetClass).forEach(val => {
        expect(val).toMatch(/^[a-z_]+$/);
      });
    });

    it('should be usable in array operations', () => {
      const classes = [AssetClass.REAL_ESTATE, AssetClass.COMMODITY, AssetClass.TREASURY];
      expect(classes.includes(AssetClass.REAL_ESTATE)).toBe(true);
      expect(classes.includes(AssetClass.EQUITY)).toBe(false);
    });

    it('should be usable in Set operations', () => {
      const classSet = new Set([AssetClass.REAL_ESTATE, AssetClass.COMMODITY]);
      expect(classSet.has(AssetClass.REAL_ESTATE)).toBe(true);
      expect(classSet.has(AssetClass.TREASURY)).toBe(false);
    });

    it('should be usable in Map keys', () => {
      const map = new Map<AssetClass, number>();
      map.set(AssetClass.REAL_ESTATE, 100);
      map.set(AssetClass.COMMODITY, 200);
      expect(map.get(AssetClass.REAL_ESTATE)).toBe(100);
      expect(map.get(AssetClass.COMMODITY)).toBe(200);
    });

    it('should allow iteration over all values', () => {
      const values = Object.values(AssetClass);
      let count = 0;
      for (const _ of values) {
        count++;
      }
      expect(count).toBe(5);
    });
  });

  describe('AssetData edge cases', () => {
    it('should handle deeply nested metadata', () => {
      const asset: AssetData = {
        id: 'deep',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Deep',
        description: '',
        metadata: {
          level1: {
            level2: {
              level3: {
                value: 42,
              },
            },
          },
        },
      };
      expect((asset.metadata.level1 as any).level2.level3.value).toBe(42);
    });

    it('should handle metadata with array values', () => {
      const asset: AssetData = {
        id: 'array-meta',
        assetClass: AssetClass.COMMODITY,
        name: 'Array',
        description: '',
        metadata: {
          tags: ['gold', 'precious', 'metal'],
          prices: [2600, 2650, 2700],
        },
      };
      expect((asset.metadata.tags as string[])).toHaveLength(3);
    });

    it('should handle metadata with Date values', () => {
      const now = new Date();
      const asset: AssetData = {
        id: 'date-meta',
        assetClass: AssetClass.TREASURY,
        name: 'Date',
        description: '',
        metadata: {
          issueDate: now,
          maturityDate: new Date('2030-01-01'),
        },
      };
      expect(asset.metadata.issueDate).toBe(now);
    });

    it('should serialize to JSON correctly', () => {
      const asset: AssetData = {
        id: 'json-test',
        assetClass: AssetClass.COMMODITY,
        name: 'JSON',
        description: 'Test',
        metadata: { price: 100 },
      };
      const json = JSON.stringify(asset);
      const parsed = JSON.parse(json);
      expect(parsed.id).toBe('json-test');
      expect(parsed.assetClass).toBe('commodity');
      expect(parsed.metadata.price).toBe(100);
    });

    it('should support spread operator', () => {
      const asset: AssetData = {
        id: 'spread',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Spread',
        description: '',
        metadata: {},
      };
      const copy = { ...asset };
      expect(copy.id).toBe('spread');
      expect(copy).not.toBe(asset);
    });

    it('should support object destructuring', () => {
      const asset: AssetData = {
        id: 'destructure',
        assetClass: AssetClass.COMMODITY,
        name: 'Destr',
        description: '',
        metadata: { qty: 10 },
      };
      const { id, assetClass, metadata } = asset;
      expect(id).toBe('destructure');
      expect(assetClass).toBe(AssetClass.COMMODITY);
      expect(metadata.qty).toBe(10);
    });
  });

  describe('DataPoint edge cases', () => {
    it('should handle zero weight', () => {
      const dp: DataPoint = {
        source: 'test',
        metric: 'test',
        value: 100,
        timestamp: new Date(),
        weight: 0,
      };
      expect(dp.weight).toBe(0);
    });

    it('should handle weight of 1', () => {
      const dp: DataPoint = {
        source: 'test',
        metric: 'test',
        value: 100,
        timestamp: new Date(),
        weight: 1,
      };
      expect(dp.weight).toBe(1);
    });

    it('should handle very large numeric value', () => {
      const dp: DataPoint = {
        source: 'test',
        metric: 'test',
        value: Number.MAX_SAFE_INTEGER,
        timestamp: new Date(),
        weight: 0.5,
      };
      expect(dp.value).toBe(Number.MAX_SAFE_INTEGER);
    });

    it('should handle very small numeric value', () => {
      const dp: DataPoint = {
        source: 'test',
        metric: 'test',
        value: Number.MIN_SAFE_INTEGER,
        timestamp: new Date(),
        weight: 0.5,
      };
      expect(dp.value).toBe(Number.MIN_SAFE_INTEGER);
    });

    it('should handle empty string value', () => {
      const dp: DataPoint = {
        source: 'test',
        metric: 'test',
        value: '',
        timestamp: new Date(),
        weight: 0.5,
      };
      expect(dp.value).toBe('');
    });

    it('should handle long string value', () => {
      const longStr = 'a'.repeat(10000);
      const dp: DataPoint = {
        source: 'test',
        metric: 'test',
        value: longStr,
        timestamp: new Date(),
        weight: 0.5,
      };
      expect(dp.value).toBe(longStr);
    });
  });

  describe('ValuationResult edge cases', () => {
    it('should handle zero confidence', () => {
      const vr: ValuationResult = {
        assetId: 'test',
        value: 100000,
        confidence: 0,
        methodology: 'test',
        dataPoints: [],
        timestamp: new Date(),
        agentId: 'agent',
      };
      expect(vr.confidence).toBe(0);
    });

    it('should handle max confidence of 1', () => {
      const vr: ValuationResult = {
        assetId: 'test',
        value: 100000,
        confidence: 1,
        methodology: 'test',
        dataPoints: [],
        timestamp: new Date(),
        agentId: 'agent',
      };
      expect(vr.confidence).toBe(1);
    });

    it('should handle zero value', () => {
      const vr: ValuationResult = {
        assetId: 'test',
        value: 0,
        confidence: 0.5,
        methodology: 'test',
        dataPoints: [],
        timestamp: new Date(),
        agentId: 'agent',
      };
      expect(vr.value).toBe(0);
    });

    it('should handle negative value', () => {
      const vr: ValuationResult = {
        assetId: 'test',
        value: -50000,
        confidence: 0.5,
        methodology: 'test',
        dataPoints: [],
        timestamp: new Date(),
        agentId: 'agent',
      };
      expect(vr.value).toBe(-50000);
    });

    it('should handle many data points', () => {
      const dps: DataPoint[] = Array.from({ length: 100 }, (_, i) => ({
        source: `source-${i}`,
        metric: `metric-${i}`,
        value: i,
        timestamp: new Date(),
        weight: 0.01,
      }));
      const vr: ValuationResult = {
        assetId: 'test',
        value: 100000,
        confidence: 0.8,
        methodology: 'test',
        dataPoints: dps,
        timestamp: new Date(),
        agentId: 'agent',
      };
      expect(vr.dataPoints).toHaveLength(100);
    });
  });

  describe('ConsensusResult edge cases', () => {
    it('should handle empty valuations array', () => {
      const cr: ConsensusResult = {
        assetId: 'test',
        consensusValue: 100000,
        avgConfidence: 0.8,
        valuations: [],
        methodology: 'test',
        timestamp: new Date(),
      };
      expect(cr.valuations).toHaveLength(0);
    });

    it('should handle many valuations', () => {
      const valuations: ValuationResult[] = Array.from({ length: 50 }, (_, i) => ({
        assetId: 'test',
        value: 100000 + i * 1000,
        confidence: 0.7,
        methodology: 'test',
        dataPoints: [],
        timestamp: new Date(),
        agentId: `agent-${i}`,
      }));

      const cr: ConsensusResult = {
        assetId: 'test',
        consensusValue: 125000,
        avgConfidence: 0.75,
        valuations,
        methodology: 'consensus',
        timestamp: new Date(),
      };
      expect(cr.valuations).toHaveLength(50);
    });

    it('should be serializable to JSON', () => {
      const cr: ConsensusResult = {
        assetId: 'json-test',
        consensusValue: 100000.50,
        avgConfidence: 0.85,
        valuations: [],
        methodology: 'test',
        timestamp: new Date('2025-01-01T00:00:00Z'),
      };
      const json = JSON.stringify(cr);
      const parsed = JSON.parse(json);
      expect(parsed.assetId).toBe('json-test');
      expect(parsed.consensusValue).toBe(100000.50);
    });
  });

  describe('OracleSubmission edge cases', () => {
    it('should handle maximum bigint value', () => {
      const sub: OracleSubmission = {
        assetId: 'max',
        value: BigInt('999999999999999999999999999999'),
        confidence: 10000,
        methodology: 'test',
      };
      expect(sub.value).toBeGreaterThan(0n);
    });

    it('should handle zero value', () => {
      const sub: OracleSubmission = {
        assetId: 'zero',
        value: 0n,
        confidence: 0,
        methodology: 'test',
      };
      expect(sub.value).toBe(0n);
      expect(sub.confidence).toBe(0);
    });

    it('should handle max confidence basis points', () => {
      const sub: OracleSubmission = {
        assetId: 'max-conf',
        value: 1000n,
        confidence: 10000,
        methodology: 'test',
      };
      expect(sub.confidence).toBe(10000);
    });

    it('should handle min confidence basis points', () => {
      const sub: OracleSubmission = {
        assetId: 'min-conf',
        value: 1000n,
        confidence: 0,
        methodology: 'test',
      };
      expect(sub.confidence).toBe(0);
    });
  });

  describe('PortfolioAsset edge cases', () => {
    it('should handle zero tokenSupply', () => {
      const pa: PortfolioAsset = {
        tokenId: 0,
        assetData: { id: 'test', assetClass: AssetClass.COMMODITY, name: 'Test', description: '', metadata: {} },
        currentValuation: null,
        tokenSupply: 0,
        oracleAssetId: 'oracle-0',
      };
      expect(pa.tokenSupply).toBe(0);
    });

    it('should handle large tokenId', () => {
      const pa: PortfolioAsset = {
        tokenId: 999999,
        assetData: { id: 'test', assetClass: AssetClass.COMMODITY, name: 'Test', description: '', metadata: {} },
        currentValuation: null,
        tokenSupply: 1000,
        oracleAssetId: 'oracle-large',
      };
      expect(pa.tokenId).toBe(999999);
    });
  });

  describe('LendingPosition edge cases', () => {
    it('should handle zero interest rate', () => {
      const lp: LendingPosition = {
        loanId: 1,
        tokenId: 1,
        collateralAmount: 100000,
        loanAmount: 50000n,
        interestRate: 0,
        startTime: new Date(),
        active: true,
      };
      expect(lp.interestRate).toBe(0);
    });

    it('should handle very high interest rate', () => {
      const lp: LendingPosition = {
        loanId: 1,
        tokenId: 1,
        collateralAmount: 100000,
        loanAmount: 50000n,
        interestRate: 1.0, // 100%
        startTime: new Date(),
        active: true,
      };
      expect(lp.interestRate).toBe(1.0);
    });

    it('should handle zero collateral', () => {
      const lp: LendingPosition = {
        loanId: 1,
        tokenId: 1,
        collateralAmount: 0,
        loanAmount: 50000n,
        interestRate: 0.05,
        startTime: new Date(),
        active: true,
      };
      expect(lp.collateralAmount).toBe(0);
    });

    it('should handle very old startTime', () => {
      const lp: LendingPosition = {
        loanId: 1,
        tokenId: 1,
        collateralAmount: 100000,
        loanAmount: 50000n,
        interestRate: 0.05,
        startTime: new Date('2000-01-01'),
        active: false,
      };
      expect(lp.startTime.getFullYear()).toBe(2000);
    });

    it('should handle future startTime', () => {
      const lp: LendingPosition = {
        loanId: 1,
        tokenId: 1,
        collateralAmount: 100000,
        loanAmount: 50000n,
        interestRate: 0.05,
        startTime: new Date('2030-12-31'),
        active: true,
      };
      expect(lp.startTime.getFullYear()).toBe(2030);
    });
  });
});
