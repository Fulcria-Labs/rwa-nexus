import { ChainBridge } from '../../src/oracle/chain-bridge';
import { ConsensusEngine } from '../../src/oracle/consensus';
import { PropertyAgent } from '../../src/agents/property-agent';
import { CommodityAgent } from '../../src/agents/commodity-agent';
import { TreasuryAgent } from '../../src/agents/treasury-agent';
import { AssetClass, AssetData, ConsensusResult, ValuationResult } from '../../src/types';
import { ethers } from 'ethers';

function makeConsensus(overrides: Partial<ConsensusResult> = {}): ConsensusResult {
  return {
    assetId: 'test-asset',
    consensusValue: 100000,
    avgConfidence: 0.85,
    valuations: [],
    methodology: 'test methodology',
    timestamp: new Date(),
    ...overrides,
  };
}

function makeValuation(overrides: Partial<ValuationResult> = {}): ValuationResult {
  return {
    assetId: 'test',
    value: 100000,
    confidence: 0.8,
    methodology: 'test',
    dataPoints: [],
    timestamp: new Date(),
    agentId: 'agent-1',
    ...overrides,
  };
}

function makeBridge(privateKey?: string): ChainBridge {
  return new ChainBridge({
    rpcUrl: 'http://localhost:8545',
    oracleAddress: '0x' + '1'.repeat(40),
    ...(privateKey ? { privateKey } : {}),
  });
}

describe('Contract Edge Cases — Value Boundaries & Precision', () => {
  // ─── VERY LARGE VALUES (close to uint256 max territory) ──────────

  describe('very large values', () => {
    it('should convert a billion-dollar consensus to 18-decimal', () => {
      const bridge = makeBridge();
      const submission = bridge.toSubmission(makeConsensus({ consensusValue: 1000000000 }));
      // 1e9 * 1e18 = 1e27
      expect(submission.value).toBe(1000000000000000000000000000n);
    });

    it('should convert a 100-billion-dollar consensus correctly', () => {
      const bridge = makeBridge();
      const submission = bridge.toSubmission(makeConsensus({ consensusValue: 100000000000 }));
      expect(submission.value).toBe(100000000000000000000000000000n);
    });

    it('should handle largest safe JS integer value for consensus', () => {
      const bridge = makeBridge();
      // Number.MAX_SAFE_INTEGER = 9007199254740991
      // toFixed(2) should work for this
      const submission = bridge.toSubmission(makeConsensus({ consensusValue: 9007199254740991 }));
      expect(submission.value > 0n).toBe(true);
      expect(typeof submission.value).toBe('bigint');
    });

    it('should handle value of exactly 1 trillion', () => {
      const bridge = makeBridge();
      const submission = bridge.toSubmission(makeConsensus({ consensusValue: 1000000000000 }));
      expect(submission.value).toBe(1000000000000000000000000000000n);
    });

    it('should maintain bigint precision for very large value conversions', () => {
      const bridge = makeBridge();
      const sub1 = bridge.toSubmission(makeConsensus({ consensusValue: 999999999.99 }));
      const sub2 = bridge.toSubmission(makeConsensus({ consensusValue: 999999999.98 }));
      // Should differ by exactly 0.01 * 1e18 = 1e16
      expect(sub1.value - sub2.value).toBe(10000000000000000n);
    });

    it('should handle value where float precision gets tricky (0.1 + 0.2)', () => {
      const bridge = makeBridge();
      // 0.30 after toFixed(2)
      const submission = bridge.toSubmission(makeConsensus({ consensusValue: 0.1 + 0.2 }));
      expect(submission.value).toBe(300000000000000000n);
    });
  });

  // ─── ZERO VALUES AND EMPTY SUBMISSIONS ────────────────────────────

  describe('zero values and empty submissions', () => {
    it('should handle zero consensus value', () => {
      const bridge = makeBridge();
      const submission = bridge.toSubmission(makeConsensus({ consensusValue: 0 }));
      expect(submission.value).toBe(0n);
    });

    it('should handle zero confidence', () => {
      const bridge = makeBridge();
      const submission = bridge.toSubmission(makeConsensus({ avgConfidence: 0 }));
      expect(submission.confidence).toBe(0);
    });

    it('should handle both zero value and zero confidence', () => {
      const bridge = makeBridge();
      const submission = bridge.toSubmission(makeConsensus({
        consensusValue: 0,
        avgConfidence: 0,
      }));
      expect(submission.value).toBe(0n);
      expect(submission.confidence).toBe(0);
    });

    it('should handle empty methodology string', () => {
      const bridge = makeBridge();
      const submission = bridge.toSubmission(makeConsensus({ methodology: '' }));
      expect(submission.methodology).toBe('');
    });

    it('should handle empty assetId', () => {
      const bridge = makeBridge();
      const submission = bridge.toSubmission(makeConsensus({ assetId: '' }));
      expect(submission.assetId).toBe('');
    });

    it('should handle empty valuations array in consensus', () => {
      const bridge = makeBridge();
      const submission = bridge.toSubmission(makeConsensus({ valuations: [] }));
      expect(submission.value > 0n || submission.value === 0n).toBe(true);
    });
  });

  // ─── DECIMAL PRECISION EDGE CASES (18-decimal math) ───────────────

  describe('18-decimal precision edge cases', () => {
    it('should convert 0.01 to exactly 1e16 in 18-decimal', () => {
      const bridge = makeBridge();
      const submission = bridge.toSubmission(makeConsensus({ consensusValue: 0.01 }));
      expect(submission.value).toBe(10000000000000000n);
    });

    it('should convert 0.99 to exactly 9.9e17', () => {
      const bridge = makeBridge();
      const submission = bridge.toSubmission(makeConsensus({ consensusValue: 0.99 }));
      expect(submission.value).toBe(990000000000000000n);
    });

    it('should convert 1.00 to exactly 1e18', () => {
      const bridge = makeBridge();
      const submission = bridge.toSubmission(makeConsensus({ consensusValue: 1.00 }));
      expect(submission.value).toBe(1000000000000000000n);
    });

    it('should convert 100.50 correctly', () => {
      const bridge = makeBridge();
      const submission = bridge.toSubmission(makeConsensus({ consensusValue: 100.50 }));
      expect(submission.value).toBe(100500000000000000000n);
    });

    it('should handle value with trailing zeros after toFixed(2)', () => {
      const bridge = makeBridge();
      const submission = bridge.toSubmission(makeConsensus({ consensusValue: 50.10 }));
      expect(submission.value).toBe(50100000000000000000n);
    });

    it('should handle sub-cent precision being truncated via toFixed(2)', () => {
      const bridge = makeBridge();
      // 1.234 -> toFixed(2) -> "1.23"
      const submission = bridge.toSubmission(makeConsensus({ consensusValue: 1.234 }));
      expect(submission.value).toBe(1230000000000000000n);
    });

    it('should handle banker rounding edge case via toFixed(2)', () => {
      const bridge = makeBridge();
      // 2.555 -> toFixed(2) may produce "2.55" or "2.56" (implementation-dependent)
      const submission = bridge.toSubmission(makeConsensus({ consensusValue: 2.555 }));
      // Accept either valid rounding
      expect(
        submission.value === 2550000000000000000n || submission.value === 2560000000000000000n
      ).toBe(true);
    });

    it('should convert confidence 0.8500 to exactly 8500 basis points', () => {
      const bridge = makeBridge();
      const submission = bridge.toSubmission(makeConsensus({ avgConfidence: 0.85 }));
      expect(submission.confidence).toBe(8500);
    });

    it('should round confidence 0.85555 to 8556 basis points', () => {
      const bridge = makeBridge();
      const submission = bridge.toSubmission(makeConsensus({ avgConfidence: 0.85555 }));
      expect(submission.confidence).toBe(8556);
    });

    it('should convert confidence 0.00005 to 1 basis point (rounded)', () => {
      const bridge = makeBridge();
      const submission = bridge.toSubmission(makeConsensus({ avgConfidence: 0.00005 }));
      expect(submission.confidence).toBe(1);
    });

    it('should convert confidence 0.00004 to 0 basis points (rounded)', () => {
      const bridge = makeBridge();
      const submission = bridge.toSubmission(makeConsensus({ avgConfidence: 0.00004 }));
      expect(submission.confidence).toBe(0);
    });
  });

  // ─── SIMULTANEOUS MULTI-AGENT SUBMISSIONS ────────────────────────

  describe('simultaneous multi-agent submissions', () => {
    it('should handle concurrent evaluateAsset calls for same asset', async () => {
      const engine = new ConsensusEngine();
      engine.registerAgent(new PropertyAgent());

      const asset: AssetData = {
        id: 'concurrent-prop',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Concurrent Property',
        description: '',
        location: 'manhattan',
        metadata: { squareFeet: 1000 },
      };

      // Fire 10 concurrent evaluations
      const results = await Promise.all(
        Array.from({ length: 10 }, () => engine.evaluateAsset(asset))
      );

      // All should produce identical results (deterministic agent)
      const values = results.map(r => r.consensusValue);
      expect(new Set(values).size).toBe(1);
    });

    it('should handle concurrent evaluations of different asset types', async () => {
      const engine = new ConsensusEngine();
      engine.registerAgent(new PropertyAgent());
      engine.registerAgent(new CommodityAgent());
      engine.registerAgent(new TreasuryAgent());

      const propAsset: AssetData = {
        id: 'prop-1',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Property',
        description: '',
        location: 'miami',
        metadata: { squareFeet: 2000 },
      };

      const goldAsset: AssetData = {
        id: 'gold-1',
        assetClass: AssetClass.COMMODITY,
        name: 'Gold',
        description: '',
        metadata: { commodity: 'gold', quantity: 10 },
      };

      const bondAsset: AssetData = {
        id: 'bond-1',
        assetClass: AssetClass.TREASURY,
        name: 'Bond',
        description: '',
        metadata: { maturityYears: 10, couponRate: 0.04, faceValue: 1000 },
      };

      const [propResult, goldResult, bondResult] = await Promise.all([
        engine.evaluateAsset(propAsset),
        engine.evaluateAsset(goldAsset),
        engine.evaluateAsset(bondAsset),
      ]);

      expect(propResult.assetId).toBe('prop-1');
      expect(goldResult.assetId).toBe('gold-1');
      expect(bondResult.assetId).toBe('bond-1');
      expect(propResult.consensusValue).toBeGreaterThan(0);
      expect(goldResult.consensusValue).toBeGreaterThan(0);
      expect(bondResult.consensusValue).toBeGreaterThan(0);
    });

    it('should handle 50 concurrent consensus computations', () => {
      const engine = new ConsensusEngine();
      const results = Array.from({ length: 50 }, (_, i) => {
        const valuations = [
          makeValuation({ value: 100000 + i * 100, agentId: 'a1' }),
          makeValuation({ value: 100000 + i * 100, agentId: 'a2' }),
        ];
        return engine.computeConsensus(`asset-${i}`, valuations);
      });

      expect(results).toHaveLength(50);
      results.forEach((r, i) => {
        expect(r.assetId).toBe(`asset-${i}`);
        expect(r.consensusValue).toBe(100000 + i * 100);
      });
    });

    it('should convert 50 concurrent consensus results to submissions', () => {
      const bridge = makeBridge();
      const submissions = Array.from({ length: 50 }, (_, i) =>
        bridge.toSubmission(makeConsensus({ consensusValue: 1000 * (i + 1) }))
      );

      expect(submissions).toHaveLength(50);
      submissions.forEach((s, i) => {
        const expectedValue = ethers.parseUnits((1000 * (i + 1)).toFixed(2), 18);
        expect(s.value).toBe(expectedValue);
      });
    });
  });

  // ─── ORACLE PRICE STALENESS SCENARIOS ────────────────────────────

  describe('oracle price staleness scenarios', () => {
    it('should include timestamp in consensus result', () => {
      const engine = new ConsensusEngine();
      const before = new Date();
      const result = engine.computeConsensus('test', [makeValuation()]);
      const after = new Date();

      expect(result.timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(result.timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('should produce fresh timestamps for sequential evaluations', () => {
      const engine = new ConsensusEngine();
      const timestamps: number[] = [];

      for (let i = 0; i < 5; i++) {
        const result = engine.computeConsensus(`asset-${i}`, [makeValuation()]);
        timestamps.push(result.timestamp.getTime());
      }

      // Each timestamp should be >= the previous
      for (let i = 1; i < timestamps.length; i++) {
        expect(timestamps[i]).toBeGreaterThanOrEqual(timestamps[i - 1]);
      }
    });

    it('should maintain old valuation timestamps while creating fresh consensus timestamp', () => {
      const engine = new ConsensusEngine();
      const oldTimestamp = new Date('2020-01-01');
      const valuations = [
        makeValuation({ timestamp: oldTimestamp, agentId: 'a1' }),
        makeValuation({ timestamp: oldTimestamp, agentId: 'a2' }),
      ];

      const result = engine.computeConsensus('test', valuations);
      // Consensus timestamp is fresh
      expect(result.timestamp.getTime()).toBeGreaterThan(oldTimestamp.getTime());
      // Individual valuation timestamps are preserved (from filtered set)
      result.valuations.forEach(v => {
        expect(v.timestamp.getTime()).toBe(oldTimestamp.getTime());
      });
    });

    it('should handle valuations with future timestamps', () => {
      const engine = new ConsensusEngine();
      const futureDate = new Date('2099-12-31');
      const valuations = [
        makeValuation({ timestamp: futureDate, agentId: 'a1' }),
        makeValuation({ timestamp: futureDate, agentId: 'a2' }),
      ];

      const result = engine.computeConsensus('test', valuations);
      expect(result.consensusValue).toBe(100000);
      expect(result.timestamp instanceof Date).toBe(true);
    });

    it('should handle valuations with epoch 0 timestamp', () => {
      const engine = new ConsensusEngine();
      const epoch0 = new Date(0);
      const valuations = [
        makeValuation({ timestamp: epoch0, agentId: 'a1' }),
      ];

      const result = engine.computeConsensus('test', valuations);
      expect(result.consensusValue).toBe(100000);
      expect(result.valuations[0].timestamp.getTime()).toBe(0);
    });
  });

  // ─── RE-ENTRANCY-STYLE SEQUENTIAL CALLS ──────────────────────────

  describe('re-entrancy-style sequential operations', () => {
    it('should handle rapid sequential consensus computations on same asset', () => {
      const engine = new ConsensusEngine();
      const results: ConsensusResult[] = [];

      for (let i = 0; i < 100; i++) {
        const valuations = [
          makeValuation({ value: 100000 + i, agentId: 'a1' }),
          makeValuation({ value: 100000 + i, agentId: 'a2' }),
        ];
        results.push(engine.computeConsensus('same-asset', valuations));
      }

      expect(results).toHaveLength(100);
      // Each should have the correct value
      results.forEach((r, i) => {
        expect(r.consensusValue).toBe(100000 + i);
      });
    });

    it('should handle rapid sequential submissions from bridge', () => {
      const bridge = makeBridge();
      const submissions = [];

      for (let i = 0; i < 100; i++) {
        submissions.push(bridge.toSubmission(makeConsensus({ consensusValue: 1000 + i })));
      }

      expect(submissions).toHaveLength(100);
      submissions.forEach((s, i) => {
        const expected = ethers.parseUnits((1000 + i).toFixed(2), 18);
        expect(s.value).toBe(expected);
      });
    });

    it('should not leak state between sequential evaluations', async () => {
      const engine = new ConsensusEngine();
      engine.registerAgent(new PropertyAgent());

      const asset1: AssetData = {
        id: 'prop-a',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Property A',
        description: '',
        location: 'manhattan',
        metadata: { squareFeet: 1000 },
      };

      const asset2: AssetData = {
        id: 'prop-b',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Property B',
        description: '',
        location: 'chicago',
        metadata: { squareFeet: 1000 },
      };

      const result1 = await engine.evaluateAsset(asset1);
      const result2 = await engine.evaluateAsset(asset2);

      // Different locations should yield different values
      expect(result1.assetId).toBe('prop-a');
      expect(result2.assetId).toBe('prop-b');
      expect(result1.consensusValue).not.toBe(result2.consensusValue);
    });

    it('should handle re-registration of agents between evaluations', async () => {
      const engine = new ConsensusEngine();
      engine.registerAgent(new PropertyAgent());

      const asset: AssetData = {
        id: 'prop-1',
        assetClass: AssetClass.REAL_ESTATE,
        name: 'Test',
        description: '',
        location: 'miami',
        metadata: { squareFeet: 1000 },
      };

      const result1 = await engine.evaluateAsset(asset);
      expect(result1.valuations).toHaveLength(1);

      // Register another property agent (duplicate)
      engine.registerAgent(new PropertyAgent());
      const result2 = await engine.evaluateAsset(asset);
      expect(result2.valuations).toHaveLength(2);
    });

    it('should handle alternating asset types in rapid sequence', async () => {
      const engine = new ConsensusEngine();
      engine.registerAgent(new PropertyAgent());
      engine.registerAgent(new CommodityAgent());

      const assets: AssetData[] = [
        { id: 'p1', assetClass: AssetClass.REAL_ESTATE, name: 'Prop', description: '', location: 'miami', metadata: { squareFeet: 1000 } },
        { id: 'c1', assetClass: AssetClass.COMMODITY, name: 'Gold', description: '', metadata: { commodity: 'gold', quantity: 1 } },
        { id: 'p2', assetClass: AssetClass.REAL_ESTATE, name: 'Prop2', description: '', location: 'chicago', metadata: { squareFeet: 500 } },
        { id: 'c2', assetClass: AssetClass.COMMODITY, name: 'Silver', description: '', metadata: { commodity: 'silver', quantity: 100 } },
      ];

      for (const asset of assets) {
        const result = await engine.evaluateAsset(asset);
        expect(result.assetId).toBe(asset.id);
        expect(result.consensusValue).toBeGreaterThan(0);
      }
    });
  });

  // ─── ASSETID ENCODING EDGE CASES ──────────────────────────────────

  describe('assetId encoding edge cases for on-chain', () => {
    it('should handle assetId at exactly 31 characters (max for bytes32)', () => {
      const bridge = makeBridge();
      const assetId = 'a'.repeat(31);
      const submission = bridge.toSubmission(makeConsensus({ assetId }));
      expect(submission.assetId).toBe(assetId);
    });

    it('should handle assetId longer than 31 characters (truncated on-chain)', () => {
      const bridge = makeBridge();
      const assetId = 'a'.repeat(50);
      const submission = bridge.toSubmission(makeConsensus({ assetId }));
      // The toSubmission preserves original; truncation happens in submitConsensus
      expect(submission.assetId).toBe(assetId);
    });

    it('should handle assetId with slashes and hyphens', () => {
      const bridge = makeBridge();
      const assetId = 'real-estate/manhattan/apt-001';
      const submission = bridge.toSubmission(makeConsensus({ assetId }));
      expect(submission.assetId).toBe(assetId);
    });

    it('should handle assetId with numeric characters', () => {
      const bridge = makeBridge();
      const assetId = '1234567890';
      const submission = bridge.toSubmission(makeConsensus({ assetId }));
      expect(submission.assetId).toBe(assetId);
    });

    it('should handle single character assetId', () => {
      const bridge = makeBridge();
      const submission = bridge.toSubmission(makeConsensus({ assetId: 'x' }));
      expect(submission.assetId).toBe('x');
    });
  });

  // ─── ETHERS PARSEUNITS EDGE CASES ─────────────────────────────────

  describe('ethers.parseUnits edge cases for value conversion', () => {
    it('should correctly parse "0.00" to 0n', () => {
      const result = ethers.parseUnits('0.00', 18);
      expect(result).toBe(0n);
    });

    it('should correctly parse "1.00" to 1e18', () => {
      const result = ethers.parseUnits('1.00', 18);
      expect(result).toBe(1000000000000000000n);
    });

    it('should correctly parse "999999.99"', () => {
      const result = ethers.parseUnits('999999.99', 18);
      expect(result).toBe(999999990000000000000000n);
    });

    it('should correctly parse whole numbers without decimals', () => {
      const result = ethers.parseUnits('42', 18);
      expect(result).toBe(42000000000000000000n);
    });

    it('should handle single decimal place', () => {
      const result = ethers.parseUnits('1.5', 18);
      expect(result).toBe(1500000000000000000n);
    });
  });
});
