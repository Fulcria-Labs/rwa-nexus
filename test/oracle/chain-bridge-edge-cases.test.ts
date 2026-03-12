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

function makeBridge(privateKey?: string): ChainBridge {
  return new ChainBridge({
    rpcUrl: 'http://localhost:8545',
    oracleAddress: '0x' + '1'.repeat(40),
    ...(privateKey ? { privateKey } : {}),
  });
}

describe('ChainBridge — edge cases and additional coverage', () => {
  describe('constructor variations', () => {
    it('should construct without privateKey (read-only mode)', () => {
      expect(() => new ChainBridge({
        rpcUrl: 'http://localhost:8545',
        oracleAddress: '0x' + '2'.repeat(40),
      })).not.toThrow();
    });

    it('should construct with privateKey (signing mode)', () => {
      expect(() => new ChainBridge({
        rpcUrl: 'http://localhost:8545',
        oracleAddress: '0x' + '3'.repeat(40),
        privateKey: '0x' + 'a'.repeat(64),
      })).not.toThrow();
    });

    it('should construct with BNB testnet RPC URL', () => {
      expect(() => new ChainBridge({
        rpcUrl: 'https://data-seed-prebsc-1-s1.binance.org:8545',
        oracleAddress: '0x' + '4'.repeat(40),
      })).not.toThrow();
    });

    it('should construct with different oracle address formats', () => {
      const validAddress = '0xAbCdEf1234567890AbCdEf1234567890AbCdEf12';
      expect(() => new ChainBridge({
        rpcUrl: 'http://localhost:8545',
        oracleAddress: validAddress,
      })).not.toThrow();
    });
  });

  describe('toSubmission — value precision', () => {
    it('should handle value with exactly 2 decimal places', () => {
      const bridge = makeBridge();
      const submission = bridge.toSubmission(makeConsensus({ consensusValue: 12345.67 }));
      expect(submission.value).toBe(12345670000000000000000n);
    });

    it('should handle whole number values (no cents)', () => {
      const bridge = makeBridge();
      const submission = bridge.toSubmission(makeConsensus({ consensusValue: 500000 }));
      expect(submission.value).toBe(500000000000000000000000n);
    });

    it('should truncate values beyond 2 decimal places via toFixed(2)', () => {
      const bridge = makeBridge();
      // 1.005 rounded to 2dp is 1.00 or 1.01 depending on float representation
      const submission = bridge.toSubmission(makeConsensus({ consensusValue: 1.005 }));
      // Should be either 1000000000000000000 or 1010000000000000000
      expect(submission.value).toBeGreaterThanOrEqual(1000000000000000000n);
    });

    it('should handle the minimum non-zero value (1 cent = 0.01)', () => {
      const bridge = makeBridge();
      const submission = bridge.toSubmission(makeConsensus({ consensusValue: 0.01 }));
      expect(submission.value).toBe(10000000000000000n); // 0.01 * 1e18
    });

    it('should produce correct value for $1.00', () => {
      const bridge = makeBridge();
      const submission = bridge.toSubmission(makeConsensus({ consensusValue: 1.00 }));
      expect(submission.value).toBe(1000000000000000000n); // 1 * 1e18
    });

    it('should produce correct value for $1,000,000.00', () => {
      const bridge = makeBridge();
      const submission = bridge.toSubmission(makeConsensus({ consensusValue: 1000000 }));
      expect(submission.value).toBe(1000000000000000000000000n); // 1e6 * 1e18
    });
  });

  describe('toSubmission — confidence precision', () => {
    it('should convert 0.75 confidence to 7500 basis points', () => {
      const bridge = makeBridge();
      const submission = bridge.toSubmission(makeConsensus({ avgConfidence: 0.75 }));
      expect(submission.confidence).toBe(7500);
    });

    it('should convert 0.6789 confidence to 6789 basis points', () => {
      const bridge = makeBridge();
      const submission = bridge.toSubmission(makeConsensus({ avgConfidence: 0.6789 }));
      expect(submission.confidence).toBe(6789);
    });

    it('should convert 0.0001 to 1 basis point', () => {
      const bridge = makeBridge();
      const submission = bridge.toSubmission(makeConsensus({ avgConfidence: 0.0001 }));
      expect(submission.confidence).toBe(1);
    });

    it('should round fractional basis points', () => {
      const bridge = makeBridge();
      // 0.12345 * 10000 = 1234.5, Math.round => 1235
      const submission = bridge.toSubmission(makeConsensus({ avgConfidence: 0.12345 }));
      expect(submission.confidence).toBe(1235);
    });

    it('should produce integer basis points', () => {
      const bridge = makeBridge();
      const submission = bridge.toSubmission(makeConsensus({ avgConfidence: 0.33333 }));
      expect(Number.isInteger(submission.confidence)).toBe(true);
    });
  });

  describe('toSubmission — fields passed through', () => {
    it('should preserve long methodology strings', () => {
      const bridge = makeBridge();
      const methodology = 'Confidence-weighted consensus from 3/3 agents (outlier threshold: 30%) using DCF analysis with interpolated yield curves';
      const submission = bridge.toSubmission(makeConsensus({ methodology }));
      expect(submission.methodology).toBe(methodology);
    });

    it('should preserve methodology with special characters', () => {
      const bridge = makeBridge();
      const methodology = 'Test: 60% sales + 40% income => $500K @85% confidence';
      const submission = bridge.toSubmission(makeConsensus({ methodology }));
      expect(submission.methodology).toBe(methodology);
    });

    it('should preserve empty methodology string', () => {
      const bridge = makeBridge();
      const submission = bridge.toSubmission(makeConsensus({ methodology: '' }));
      expect(submission.methodology).toBe('');
    });
  });

  describe('signer operations — with valid private key', () => {
    it('should derive a valid Ethereum address from private key', async () => {
      const bridge = makeBridge('0x' + 'a'.repeat(64));
      const address = await bridge.getSignerAddress();
      expect(address).toMatch(/^0x[0-9a-fA-F]{40}$/);
    });

    it('should derive the same address on repeated calls', async () => {
      const bridge = makeBridge('0x' + 'b'.repeat(64));
      const addr1 = await bridge.getSignerAddress();
      const addr2 = await bridge.getSignerAddress();
      expect(addr1).toBe(addr2);
    });

    it('should derive different addresses from different private keys', async () => {
      const bridge1 = makeBridge('0x' + 'a'.repeat(64));
      const bridge2 = makeBridge('0x' + 'b'.repeat(64));

      const addr1 = await bridge1.getSignerAddress();
      const addr2 = await bridge2.getSignerAddress();
      expect(addr1).not.toBe(addr2);
    });
  });

  describe('signer operations — without private key', () => {
    it('getSignerAddress should reject with descriptive message', async () => {
      const bridge = makeBridge();
      await expect(bridge.getSignerAddress()).rejects.toThrow('No signer configured');
    });

    it('getBalance should reject with descriptive message', async () => {
      const bridge = makeBridge();
      await expect(bridge.getBalance()).rejects.toThrow('No signer configured');
    });

    it('submitConsensus should reject with descriptive message', async () => {
      const bridge = makeBridge();
      await expect(bridge.submitConsensus(makeConsensus())).rejects.toThrow('No signer configured');
    });
  });

  describe('getOnChainPrice — requires live RPC (network failure expected)', () => {
    it('should reject when RPC is unreachable', async () => {
      const bridge = new ChainBridge({
        rpcUrl: 'http://localhost:1', // Unreachable port
        oracleAddress: '0x' + '1'.repeat(40),
      });

      // Should fail with a network/connection error
      await expect(bridge.getOnChainPrice('test-asset')).rejects.toThrow();
    });
  });

  describe('isAuthorizedAgent — requires live RPC (network failure expected)', () => {
    it('should reject when RPC is unreachable', async () => {
      const bridge = new ChainBridge({
        rpcUrl: 'http://localhost:1',
        oracleAddress: '0x' + '1'.repeat(40),
      });

      await expect(bridge.isAuthorizedAgent('0x' + '0'.repeat(40))).rejects.toThrow();
    });
  });

  describe('toSubmission — OracleSubmission shape', () => {
    it('should return an object with exactly the OracleSubmission fields', () => {
      const bridge = makeBridge();
      const submission = bridge.toSubmission(makeConsensus());

      const keys = Object.keys(submission);
      expect(keys).toContain('assetId');
      expect(keys).toContain('value');
      expect(keys).toContain('confidence');
      expect(keys).toContain('methodology');
    });

    it('should return value as BigInt type', () => {
      const bridge = makeBridge();
      const submission = bridge.toSubmission(makeConsensus());
      expect(typeof submission.value).toBe('bigint');
    });

    it('should return confidence as number type', () => {
      const bridge = makeBridge();
      const submission = bridge.toSubmission(makeConsensus());
      expect(typeof submission.confidence).toBe('number');
    });

    it('should return assetId as string type', () => {
      const bridge = makeBridge();
      const submission = bridge.toSubmission(makeConsensus({ assetId: 'my-asset' }));
      expect(typeof submission.assetId).toBe('string');
      expect(submission.assetId).toBe('my-asset');
    });
  });

  describe('submitConsensus — with signer but no live RPC', () => {
    it('should reject with network error when RPC is unreachable', async () => {
      const bridge = new ChainBridge({
        rpcUrl: 'http://localhost:1',
        oracleAddress: '0x' + '1'.repeat(40),
        privateKey: '0x' + 'a'.repeat(64),
      });

      // Should fail with a network error since there's no RPC
      await expect(bridge.submitConsensus(makeConsensus())).rejects.toThrow();
    });
  });
});
