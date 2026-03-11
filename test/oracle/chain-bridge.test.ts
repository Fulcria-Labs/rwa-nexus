import { ChainBridge } from '../../src/oracle/chain-bridge';
import { ConsensusResult } from '../../src/types';

describe('ChainBridge', () => {
  let bridge: ChainBridge;

  beforeEach(() => {
    bridge = new ChainBridge({
      rpcUrl: 'http://localhost:8545',
      oracleAddress: '0x' + '1'.repeat(40),
    });
  });

  describe('submission conversion', () => {
    it('should convert consensus to oracle submission', () => {
      const consensus: ConsensusResult = {
        assetId: 'test-asset',
        consensusValue: 1500000.50,
        avgConfidence: 0.85,
        valuations: [],
        methodology: 'test',
        timestamp: new Date(),
      };

      const submission = bridge.toSubmission(consensus);

      expect(submission.assetId).toBe('test-asset');
      expect(submission.confidence).toBe(8500); // 0.85 * 10000
      expect(submission.methodology).toBe('test');
      // Value should be in 18 decimal format
      expect(submission.value).toBe(1500000500000000000000000n);
    });

    it('should handle zero confidence', () => {
      const consensus: ConsensusResult = {
        assetId: 'zero',
        consensusValue: 100,
        avgConfidence: 0,
        valuations: [],
        methodology: '',
        timestamp: new Date(),
      };

      const submission = bridge.toSubmission(consensus);
      expect(submission.confidence).toBe(0);
    });

    it('should handle max confidence', () => {
      const consensus: ConsensusResult = {
        assetId: 'max',
        consensusValue: 100,
        avgConfidence: 1,
        valuations: [],
        methodology: '',
        timestamp: new Date(),
      };

      const submission = bridge.toSubmission(consensus);
      expect(submission.confidence).toBe(10000);
    });

    it('should handle small values', () => {
      const consensus: ConsensusResult = {
        assetId: 'small',
        consensusValue: 0.01,
        avgConfidence: 0.5,
        valuations: [],
        methodology: '',
        timestamp: new Date(),
      };

      const submission = bridge.toSubmission(consensus);
      expect(submission.value).toBe(10000000000000000n); // 0.01 * 1e18
    });

    it('should handle large values', () => {
      const consensus: ConsensusResult = {
        assetId: 'large',
        consensusValue: 999999999.99,
        avgConfidence: 0.95,
        valuations: [],
        methodology: '',
        timestamp: new Date(),
      };

      const submission = bridge.toSubmission(consensus);
      expect(submission.value > 0n).toBe(true);
      expect(submission.confidence).toBe(9500);
    });
  });

  describe('error handling', () => {
    it('should throw when submitting without signer', async () => {
      const consensus: ConsensusResult = {
        assetId: 'test',
        consensusValue: 100,
        avgConfidence: 0.5,
        valuations: [],
        methodology: '',
        timestamp: new Date(),
      };

      await expect(bridge.submitConsensus(consensus)).rejects.toThrow('No signer');
    });

    it('should throw when getting balance without signer', async () => {
      await expect(bridge.getBalance()).rejects.toThrow('No signer');
    });

    it('should throw when getting address without signer', async () => {
      await expect(bridge.getSignerAddress()).rejects.toThrow('No signer');
    });
  });
});
