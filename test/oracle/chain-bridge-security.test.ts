import { ChainBridge } from '../../src/oracle/chain-bridge';
import { ConsensusResult } from '../../src/types';

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

describe('ChainBridge - Security & Robustness', () => {
  let bridge: ChainBridge;

  beforeEach(() => {
    bridge = new ChainBridge({
      rpcUrl: 'http://localhost:8545',
      oracleAddress: '0x' + '1'.repeat(40),
    });
  });

  describe('value conversion precision', () => {
    it('should convert integer values correctly', () => {
      const submission = bridge.toSubmission(makeConsensus({ consensusValue: 1000 }));
      expect(submission.value).toBe(1000000000000000000000n);
    });

    it('should convert values with 1 decimal place', () => {
      const submission = bridge.toSubmission(makeConsensus({ consensusValue: 100.5 }));
      expect(submission.value).toBe(100500000000000000000n);
    });

    it('should convert values with 2 decimal places', () => {
      const submission = bridge.toSubmission(makeConsensus({ consensusValue: 99.99 }));
      expect(submission.value).toBe(99990000000000000000n);
    });

    it('should handle value of exactly 1', () => {
      const submission = bridge.toSubmission(makeConsensus({ consensusValue: 1 }));
      expect(submission.value).toBe(1000000000000000000n);
    });

    it('should handle value of exactly 0', () => {
      const submission = bridge.toSubmission(makeConsensus({ consensusValue: 0 }));
      expect(submission.value).toBe(0n);
    });

    it('should handle very precise values (rounds to 2 decimals)', () => {
      const submission = bridge.toSubmission(makeConsensus({ consensusValue: 123.456789 }));
      // toFixed(2) rounds to 123.46
      expect(submission.value).toBe(123460000000000000000n);
    });

    it('should handle million-dollar values', () => {
      const submission = bridge.toSubmission(makeConsensus({ consensusValue: 5000000 }));
      expect(submission.value).toBe(5000000000000000000000000n);
    });
  });

  describe('confidence conversion', () => {
    it('should convert 0.5 to 5000 basis points', () => {
      const submission = bridge.toSubmission(makeConsensus({ avgConfidence: 0.5 }));
      expect(submission.confidence).toBe(5000);
    });

    it('should convert 0.1 to 1000 basis points', () => {
      const submission = bridge.toSubmission(makeConsensus({ avgConfidence: 0.1 }));
      expect(submission.confidence).toBe(1000);
    });

    it('should convert 0.99 to 9900 basis points', () => {
      const submission = bridge.toSubmission(makeConsensus({ avgConfidence: 0.99 }));
      expect(submission.confidence).toBe(9900);
    });

    it('should handle very small confidence', () => {
      const submission = bridge.toSubmission(makeConsensus({ avgConfidence: 0.001 }));
      expect(submission.confidence).toBe(10);
    });

    it('should handle fractional basis points rounding', () => {
      const submission = bridge.toSubmission(makeConsensus({ avgConfidence: 0.8333 }));
      expect(submission.confidence).toBe(8333);
    });

    it('should handle confidence of 0.0001', () => {
      const submission = bridge.toSubmission(makeConsensus({ avgConfidence: 0.0001 }));
      expect(submission.confidence).toBe(1);
    });
  });

  describe('asset ID handling', () => {
    it('should preserve short asset IDs', () => {
      const submission = bridge.toSubmission(makeConsensus({ assetId: 'abc' }));
      expect(submission.assetId).toBe('abc');
    });

    it('should preserve long asset IDs', () => {
      const longId = 'a'.repeat(100);
      const submission = bridge.toSubmission(makeConsensus({ assetId: longId }));
      expect(submission.assetId).toBe(longId);
    });

    it('should handle asset ID with special characters', () => {
      const submission = bridge.toSubmission(makeConsensus({ assetId: 'asset-123/test:v1' }));
      expect(submission.assetId).toBe('asset-123/test:v1');
    });

    it('should handle empty asset ID', () => {
      const submission = bridge.toSubmission(makeConsensus({ assetId: '' }));
      expect(submission.assetId).toBe('');
    });
  });

  describe('methodology preservation', () => {
    it('should preserve methodology string', () => {
      const methodology = 'Complex multi-factor DCF analysis with Monte Carlo simulation';
      const submission = bridge.toSubmission(makeConsensus({ methodology }));
      expect(submission.methodology).toBe(methodology);
    });

    it('should handle empty methodology', () => {
      const submission = bridge.toSubmission(makeConsensus({ methodology: '' }));
      expect(submission.methodology).toBe('');
    });

    it('should handle very long methodology', () => {
      const longMethodology = 'x'.repeat(10000);
      const submission = bridge.toSubmission(makeConsensus({ methodology: longMethodology }));
      expect(submission.methodology).toBe(longMethodology);
    });
  });

  describe('signer-required operations', () => {
    it('should throw when submitting consensus without signer', async () => {
      await expect(bridge.submitConsensus(makeConsensus())).rejects.toThrow('No signer');
    });

    it('should throw when getting balance without signer', async () => {
      await expect(bridge.getBalance()).rejects.toThrow('No signer');
    });

    it('should throw when getting signer address without signer', async () => {
      await expect(bridge.getSignerAddress()).rejects.toThrow('No signer');
    });
  });

  describe('constructor configuration', () => {
    it('should accept valid configuration without private key', () => {
      const b = new ChainBridge({
        rpcUrl: 'http://localhost:8545',
        oracleAddress: '0x' + 'a'.repeat(40),
      });
      expect(b).toBeDefined();
    });

    it('should accept configuration with private key', () => {
      const b = new ChainBridge({
        rpcUrl: 'http://localhost:8545',
        oracleAddress: '0x' + 'a'.repeat(40),
        privateKey: '0x' + 'b'.repeat(64),
      });
      expect(b).toBeDefined();
    });

    it('should create separate instances', () => {
      const b1 = new ChainBridge({
        rpcUrl: 'http://localhost:8545',
        oracleAddress: '0x' + '1'.repeat(40),
      });
      const b2 = new ChainBridge({
        rpcUrl: 'http://localhost:8546',
        oracleAddress: '0x' + '2'.repeat(40),
      });
      expect(b1).not.toBe(b2);
    });
  });

  describe('multiple conversions', () => {
    it('should produce consistent results for same input', () => {
      const consensus = makeConsensus();
      const s1 = bridge.toSubmission(consensus);
      const s2 = bridge.toSubmission(consensus);
      expect(s1.value).toBe(s2.value);
      expect(s1.confidence).toBe(s2.confidence);
      expect(s1.assetId).toBe(s2.assetId);
    });

    it('should handle sequential conversions of different consensuses', () => {
      const c1 = makeConsensus({ consensusValue: 100, avgConfidence: 0.5 });
      const c2 = makeConsensus({ consensusValue: 200, avgConfidence: 0.9 });
      const s1 = bridge.toSubmission(c1);
      const s2 = bridge.toSubmission(c2);
      expect(s2.value).toBeGreaterThan(s1.value);
      expect(s2.confidence).toBeGreaterThan(s1.confidence);
    });
  });

  describe('boundary values for on-chain format', () => {
    it('should handle minimum representable value (0.01)', () => {
      const submission = bridge.toSubmission(makeConsensus({ consensusValue: 0.01 }));
      expect(submission.value).toBe(10000000000000000n);
    });

    it('should handle typical RWA property value ($2.5M)', () => {
      const submission = bridge.toSubmission(makeConsensus({ consensusValue: 2500000 }));
      expect(submission.value).toBe(2500000000000000000000000n);
    });

    it('should handle typical commodity value ($265,000)', () => {
      const submission = bridge.toSubmission(makeConsensus({ consensusValue: 265000 }));
      expect(submission.value).toBe(265000000000000000000000n);
    });

    it('should handle typical bond value ($975.50)', () => {
      const submission = bridge.toSubmission(makeConsensus({ consensusValue: 975.5 }));
      expect(submission.value).toBe(975500000000000000000n);
    });
  });
});
