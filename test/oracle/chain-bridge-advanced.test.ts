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

describe('ChainBridge - Advanced', () => {
  describe('value encoding', () => {
    it('should encode integer value to 18 decimals', () => {
      const bridge = new ChainBridge({
        rpcUrl: 'http://localhost:8545',
        oracleAddress: '0x' + '1'.repeat(40),
      });

      const submission = bridge.toSubmission(makeConsensus({ consensusValue: 1 }));
      expect(submission.value).toBe(1000000000000000000n); // 1e18
    });

    it('should encode decimal value correctly', () => {
      const bridge = new ChainBridge({
        rpcUrl: 'http://localhost:8545',
        oracleAddress: '0x' + '1'.repeat(40),
      });

      const submission = bridge.toSubmission(makeConsensus({ consensusValue: 123.45 }));
      expect(submission.value).toBe(123450000000000000000n);
    });

    it('should handle very small value (1 cent)', () => {
      const bridge = new ChainBridge({
        rpcUrl: 'http://localhost:8545',
        oracleAddress: '0x' + '1'.repeat(40),
      });

      const submission = bridge.toSubmission(makeConsensus({ consensusValue: 0.01 }));
      expect(submission.value).toBe(10000000000000000n);
    });

    it('should handle very large value (1 billion)', () => {
      const bridge = new ChainBridge({
        rpcUrl: 'http://localhost:8545',
        oracleAddress: '0x' + '1'.repeat(40),
      });

      const submission = bridge.toSubmission(makeConsensus({ consensusValue: 1000000000 }));
      expect(submission.value).toBe(1000000000000000000000000000n);
    });

    it('should truncate to 2 decimal places before encoding', () => {
      const bridge = new ChainBridge({
        rpcUrl: 'http://localhost:8545',
        oracleAddress: '0x' + '1'.repeat(40),
      });

      const submission = bridge.toSubmission(makeConsensus({ consensusValue: 99.999 }));
      // toFixed(2) rounds 99.999 to "100.00"
      expect(submission.value).toBe(100000000000000000000n);
    });
  });

  describe('confidence encoding', () => {
    it('should encode 0 confidence as 0 basis points', () => {
      const bridge = new ChainBridge({
        rpcUrl: 'http://localhost:8545',
        oracleAddress: '0x' + '1'.repeat(40),
      });

      const submission = bridge.toSubmission(makeConsensus({ avgConfidence: 0 }));
      expect(submission.confidence).toBe(0);
    });

    it('should encode 1.0 confidence as 10000 basis points', () => {
      const bridge = new ChainBridge({
        rpcUrl: 'http://localhost:8545',
        oracleAddress: '0x' + '1'.repeat(40),
      });

      const submission = bridge.toSubmission(makeConsensus({ avgConfidence: 1.0 }));
      expect(submission.confidence).toBe(10000);
    });

    it('should encode 0.5 confidence as 5000 basis points', () => {
      const bridge = new ChainBridge({
        rpcUrl: 'http://localhost:8545',
        oracleAddress: '0x' + '1'.repeat(40),
      });

      const submission = bridge.toSubmission(makeConsensus({ avgConfidence: 0.5 }));
      expect(submission.confidence).toBe(5000);
    });

    it('should round intermediate confidence values', () => {
      const bridge = new ChainBridge({
        rpcUrl: 'http://localhost:8545',
        oracleAddress: '0x' + '1'.repeat(40),
      });

      const submission = bridge.toSubmission(makeConsensus({ avgConfidence: 0.8567 }));
      expect(submission.confidence).toBe(8567);
    });

    it('should handle confidence 0.0001 (1 basis point)', () => {
      const bridge = new ChainBridge({
        rpcUrl: 'http://localhost:8545',
        oracleAddress: '0x' + '1'.repeat(40),
      });

      const submission = bridge.toSubmission(makeConsensus({ avgConfidence: 0.0001 }));
      expect(submission.confidence).toBe(1);
    });
  });

  describe('asset ID handling', () => {
    it('should preserve short asset IDs', () => {
      const bridge = new ChainBridge({
        rpcUrl: 'http://localhost:8545',
        oracleAddress: '0x' + '1'.repeat(40),
      });

      const submission = bridge.toSubmission(makeConsensus({ assetId: 'prop-001' }));
      expect(submission.assetId).toBe('prop-001');
    });

    it('should preserve methodology string', () => {
      const bridge = new ChainBridge({
        rpcUrl: 'http://localhost:8545',
        oracleAddress: '0x' + '1'.repeat(40),
      });

      const methodology = 'Confidence-weighted consensus from 3/3 agents';
      const submission = bridge.toSubmission(makeConsensus({ methodology }));
      expect(submission.methodology).toBe(methodology);
    });
  });

  describe('signer operations', () => {
    it('should create bridge without private key', () => {
      const bridge = new ChainBridge({
        rpcUrl: 'http://localhost:8545',
        oracleAddress: '0x' + '1'.repeat(40),
      });

      expect(bridge).toBeDefined();
    });

    it('should throw on submitConsensus without signer', async () => {
      const bridge = new ChainBridge({
        rpcUrl: 'http://localhost:8545',
        oracleAddress: '0x' + '1'.repeat(40),
      });

      await expect(bridge.submitConsensus(makeConsensus())).rejects.toThrow('No signer');
    });

    it('should throw on getSignerAddress without signer', async () => {
      const bridge = new ChainBridge({
        rpcUrl: 'http://localhost:8545',
        oracleAddress: '0x' + '1'.repeat(40),
      });

      await expect(bridge.getSignerAddress()).rejects.toThrow('No signer');
    });

    it('should throw on getBalance without signer', async () => {
      const bridge = new ChainBridge({
        rpcUrl: 'http://localhost:8545',
        oracleAddress: '0x' + '1'.repeat(40),
      });

      await expect(bridge.getBalance()).rejects.toThrow('No signer');
    });

    it('should create bridge with private key', () => {
      const bridge = new ChainBridge({
        rpcUrl: 'http://localhost:8545',
        oracleAddress: '0x' + '1'.repeat(40),
        privateKey: '0x' + 'a'.repeat(64),
      });

      expect(bridge).toBeDefined();
    });

    it('should get signer address with private key', async () => {
      const bridge = new ChainBridge({
        rpcUrl: 'http://localhost:8545',
        oracleAddress: '0x' + '1'.repeat(40),
        privateKey: '0x' + 'a'.repeat(64),
      });

      const address = await bridge.getSignerAddress();
      expect(address).toBeTruthy();
      expect(address.startsWith('0x')).toBe(true);
    });
  });

  describe('toSubmission completeness', () => {
    it('should return all required OracleSubmission fields', () => {
      const bridge = new ChainBridge({
        rpcUrl: 'http://localhost:8545',
        oracleAddress: '0x' + '1'.repeat(40),
      });

      const submission = bridge.toSubmission(makeConsensus());

      expect(submission).toHaveProperty('assetId');
      expect(submission).toHaveProperty('value');
      expect(submission).toHaveProperty('confidence');
      expect(submission).toHaveProperty('methodology');
      expect(typeof submission.value).toBe('bigint');
      expect(typeof submission.confidence).toBe('number');
    });
  });
});
