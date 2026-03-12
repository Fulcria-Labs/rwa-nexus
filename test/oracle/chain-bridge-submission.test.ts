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

describe('ChainBridge - Submission conversion edge cases', () => {
  let bridge: ChainBridge;

  beforeEach(() => {
    bridge = new ChainBridge({
      rpcUrl: 'http://localhost:8545',
      oracleAddress: '0x' + '1'.repeat(40),
    });
  });

  describe('value conversion to 18 decimals', () => {
    it('should convert integer value correctly', () => {
      const consensus = makeConsensus({ consensusValue: 1000 });
      const submission = bridge.toSubmission(consensus);
      expect(submission.value).toBe(1000000000000000000000n); // 1000 * 1e18
    });

    it('should convert value with 1 decimal place', () => {
      const consensus = makeConsensus({ consensusValue: 123.5 });
      const submission = bridge.toSubmission(consensus);
      expect(submission.value).toBe(123500000000000000000n);
    });

    it('should convert value with 2 decimal places', () => {
      const consensus = makeConsensus({ consensusValue: 99.99 });
      const submission = bridge.toSubmission(consensus);
      expect(submission.value).toBe(99990000000000000000n);
    });

    it('should convert zero value', () => {
      const consensus = makeConsensus({ consensusValue: 0 });
      const submission = bridge.toSubmission(consensus);
      expect(submission.value).toBe(0n);
    });

    it('should convert very small value (0.01)', () => {
      const consensus = makeConsensus({ consensusValue: 0.01 });
      const submission = bridge.toSubmission(consensus);
      expect(submission.value).toBe(10000000000000000n); // 0.01 * 1e18
    });

    it('should convert large value (1 billion)', () => {
      const consensus = makeConsensus({ consensusValue: 1000000000 });
      const submission = bridge.toSubmission(consensus);
      expect(submission.value > 0n).toBe(true);
    });

    it('should handle value of exactly 1', () => {
      const consensus = makeConsensus({ consensusValue: 1 });
      const submission = bridge.toSubmission(consensus);
      expect(submission.value).toBe(1000000000000000000n);
    });
  });

  describe('confidence conversion to basis points', () => {
    it('should convert 0.85 to 8500 bps', () => {
      const consensus = makeConsensus({ avgConfidence: 0.85 });
      const submission = bridge.toSubmission(consensus);
      expect(submission.confidence).toBe(8500);
    });

    it('should convert 0 to 0 bps', () => {
      const consensus = makeConsensus({ avgConfidence: 0 });
      const submission = bridge.toSubmission(consensus);
      expect(submission.confidence).toBe(0);
    });

    it('should convert 1.0 to 10000 bps', () => {
      const consensus = makeConsensus({ avgConfidence: 1.0 });
      const submission = bridge.toSubmission(consensus);
      expect(submission.confidence).toBe(10000);
    });

    it('should convert 0.5 to 5000 bps', () => {
      const consensus = makeConsensus({ avgConfidence: 0.5 });
      const submission = bridge.toSubmission(consensus);
      expect(submission.confidence).toBe(5000);
    });

    it('should convert 0.1 to 1000 bps', () => {
      const consensus = makeConsensus({ avgConfidence: 0.1 });
      const submission = bridge.toSubmission(consensus);
      expect(submission.confidence).toBe(1000);
    });

    it('should round fractional basis points', () => {
      const consensus = makeConsensus({ avgConfidence: 0.123456 });
      const submission = bridge.toSubmission(consensus);
      // Math.round(0.123456 * 10000) = Math.round(1234.56) = 1235
      expect(submission.confidence).toBe(1235);
    });

    it('should handle confidence of 0.0001', () => {
      const consensus = makeConsensus({ avgConfidence: 0.0001 });
      const submission = bridge.toSubmission(consensus);
      expect(submission.confidence).toBe(1);
    });

    it('should handle confidence of 0.00001 (rounds to 0)', () => {
      const consensus = makeConsensus({ avgConfidence: 0.00001 });
      const submission = bridge.toSubmission(consensus);
      expect(submission.confidence).toBe(0);
    });
  });

  describe('assetId and methodology passthrough', () => {
    it('should pass assetId unchanged', () => {
      const consensus = makeConsensus({ assetId: 'my-unique-asset' });
      const submission = bridge.toSubmission(consensus);
      expect(submission.assetId).toBe('my-unique-asset');
    });

    it('should pass methodology unchanged', () => {
      const consensus = makeConsensus({ methodology: 'DCF analysis with adjustments' });
      const submission = bridge.toSubmission(consensus);
      expect(submission.methodology).toBe('DCF analysis with adjustments');
    });

    it('should handle empty methodology', () => {
      const consensus = makeConsensus({ methodology: '' });
      const submission = bridge.toSubmission(consensus);
      expect(submission.methodology).toBe('');
    });

    it('should handle very long methodology string', () => {
      const longMethodology = 'A'.repeat(10000);
      const consensus = makeConsensus({ methodology: longMethodology });
      const submission = bridge.toSubmission(consensus);
      expect(submission.methodology.length).toBe(10000);
    });

    it('should handle special characters in assetId', () => {
      const consensus = makeConsensus({ assetId: 'asset/type:123_v2' });
      const submission = bridge.toSubmission(consensus);
      expect(submission.assetId).toBe('asset/type:123_v2');
    });
  });

  describe('signer-dependent methods', () => {
    it('should throw on submitConsensus without signer', async () => {
      const consensus = makeConsensus();
      await expect(bridge.submitConsensus(consensus)).rejects.toThrow('No signer');
    });

    it('should throw on getSignerAddress without signer', async () => {
      await expect(bridge.getSignerAddress()).rejects.toThrow('No signer');
    });

    it('should throw on getBalance without signer', async () => {
      await expect(bridge.getBalance()).rejects.toThrow('No signer');
    });

    it('should throw with descriptive message for submitConsensus', async () => {
      const consensus = makeConsensus();
      await expect(bridge.submitConsensus(consensus)).rejects.toThrow(
        'No signer configured. Set privateKey to submit on-chain.'
      );
    });

    it('should throw with descriptive message for getSignerAddress', async () => {
      await expect(bridge.getSignerAddress()).rejects.toThrow('No signer configured');
    });

    it('should throw with descriptive message for getBalance', async () => {
      await expect(bridge.getBalance()).rejects.toThrow('No signer configured');
    });
  });

  describe('construction with different configs', () => {
    it('should construct without private key', () => {
      const b = new ChainBridge({
        rpcUrl: 'http://localhost:8545',
        oracleAddress: '0x' + 'a'.repeat(40),
      });
      expect(b).toBeDefined();
    });

    it('should construct with private key', () => {
      const b = new ChainBridge({
        rpcUrl: 'http://localhost:8545',
        oracleAddress: '0x' + 'b'.repeat(40),
        privateKey: '0x' + 'c'.repeat(64),
      });
      expect(b).toBeDefined();
    });

    it('should be able to call toSubmission regardless of signer', () => {
      const noSigner = new ChainBridge({
        rpcUrl: 'http://localhost:8545',
        oracleAddress: '0x' + 'd'.repeat(40),
      });

      const consensus = makeConsensus();
      const submission = noSigner.toSubmission(consensus);
      expect(submission).toBeDefined();
      expect(submission.value).toBeGreaterThan(0n);
    });
  });

  describe('OracleSubmission output shape', () => {
    it('should return object with exactly 4 properties', () => {
      const consensus = makeConsensus();
      const submission = bridge.toSubmission(consensus);

      const keys = Object.keys(submission).sort();
      expect(keys).toEqual(['assetId', 'confidence', 'methodology', 'value']);
    });

    it('should return bigint for value', () => {
      const consensus = makeConsensus();
      const submission = bridge.toSubmission(consensus);
      expect(typeof submission.value).toBe('bigint');
    });

    it('should return number for confidence', () => {
      const consensus = makeConsensus();
      const submission = bridge.toSubmission(consensus);
      expect(typeof submission.confidence).toBe('number');
    });

    it('should return string for assetId', () => {
      const consensus = makeConsensus();
      const submission = bridge.toSubmission(consensus);
      expect(typeof submission.assetId).toBe('string');
    });

    it('should return string for methodology', () => {
      const consensus = makeConsensus();
      const submission = bridge.toSubmission(consensus);
      expect(typeof submission.methodology).toBe('string');
    });
  });
});
