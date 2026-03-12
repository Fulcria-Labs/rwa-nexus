import { ChainBridge } from '../../src/oracle/chain-bridge';
import { ConsensusResult, ValuationResult } from '../../src/types';
import { ethers } from 'ethers';

function mockConsensus(value: number, confidence: number, assetId = 'asset-1'): ConsensusResult {
  return {
    assetId,
    consensusValue: value,
    avgConfidence: confidence,
    valuations: [],
    methodology: 'test consensus',
    timestamp: new Date(),
  };
}

describe('ChainBridge - toSubmission conversion', () => {
  let bridge: ChainBridge;

  beforeEach(() => {
    bridge = new ChainBridge({
      rpcUrl: 'http://localhost:8545',
      oracleAddress: '0x0000000000000000000000000000000000000001',
    });
  });

  describe('value conversion to 18 decimals', () => {
    it('converts integer value', () => {
      const sub = bridge.toSubmission(mockConsensus(1000, 0.9));
      expect(sub.value).toBe(ethers.parseUnits('1000.00', 18));
    });

    it('converts decimal value', () => {
      const sub = bridge.toSubmission(mockConsensus(1234.56, 0.9));
      expect(sub.value).toBe(ethers.parseUnits('1234.56', 18));
    });

    it('converts zero value', () => {
      const sub = bridge.toSubmission(mockConsensus(0, 0.9));
      expect(sub.value).toBe(0n);
    });

    it('converts very large value', () => {
      const sub = bridge.toSubmission(mockConsensus(1_000_000_000, 0.9));
      expect(sub.value).toBe(ethers.parseUnits('1000000000.00', 18));
    });

    it('converts small fractional value', () => {
      const sub = bridge.toSubmission(mockConsensus(0.01, 0.9));
      expect(sub.value).toBe(ethers.parseUnits('0.01', 18));
    });

    it('rounds to 2 decimal places', () => {
      const sub = bridge.toSubmission(mockConsensus(99.999, 0.9));
      // toFixed(2) rounds 99.999 to "100.00"
      expect(sub.value).toBe(ethers.parseUnits('100.00', 18));
    });
  });

  describe('confidence conversion to basis points', () => {
    it('converts 1.0 to 10000', () => {
      const sub = bridge.toSubmission(mockConsensus(100, 1.0));
      expect(sub.confidence).toBe(10000);
    });

    it('converts 0.0 to 0', () => {
      const sub = bridge.toSubmission(mockConsensus(100, 0.0));
      expect(sub.confidence).toBe(0);
    });

    it('converts 0.5 to 5000', () => {
      const sub = bridge.toSubmission(mockConsensus(100, 0.5));
      expect(sub.confidence).toBe(5000);
    });

    it('converts 0.85 to 8500', () => {
      const sub = bridge.toSubmission(mockConsensus(100, 0.85));
      expect(sub.confidence).toBe(8500);
    });

    it('rounds to nearest integer', () => {
      const sub = bridge.toSubmission(mockConsensus(100, 0.333));
      expect(sub.confidence).toBe(3330);
    });

    it('handles 0.9999', () => {
      const sub = bridge.toSubmission(mockConsensus(100, 0.9999));
      expect(sub.confidence).toBe(9999);
    });
  });

  describe('field pass-through', () => {
    it('preserves assetId', () => {
      const sub = bridge.toSubmission(mockConsensus(100, 0.9, 'my-special-asset'));
      expect(sub.assetId).toBe('my-special-asset');
    });

    it('preserves methodology', () => {
      const consensus = mockConsensus(100, 0.9);
      consensus.methodology = 'Custom multi-agent blend';
      const sub = bridge.toSubmission(consensus);
      expect(sub.methodology).toBe('Custom multi-agent blend');
    });
  });
});

describe('ChainBridge - constructor and signer', () => {
  it('creates without private key (read-only)', () => {
    const bridge = new ChainBridge({
      rpcUrl: 'http://localhost:8545',
      oracleAddress: '0x0000000000000000000000000000000000000001',
    });
    expect(bridge).toBeDefined();
  });

  it('creates with private key', () => {
    const wallet = ethers.Wallet.createRandom();
    const bridge = new ChainBridge({
      rpcUrl: 'http://localhost:8545',
      oracleAddress: '0x0000000000000000000000000000000000000001',
      privateKey: wallet.privateKey,
    });
    expect(bridge).toBeDefined();
  });

  it('throws on submitConsensus without signer', async () => {
    const bridge = new ChainBridge({
      rpcUrl: 'http://localhost:8545',
      oracleAddress: '0x0000000000000000000000000000000000000001',
    });
    await expect(bridge.submitConsensus(mockConsensus(100, 0.9)))
      .rejects.toThrow('No signer configured');
  });

  it('throws on getSignerAddress without signer', async () => {
    const bridge = new ChainBridge({
      rpcUrl: 'http://localhost:8545',
      oracleAddress: '0x0000000000000000000000000000000000000001',
    });
    await expect(bridge.getSignerAddress()).rejects.toThrow('No signer configured');
  });

  it('throws on getBalance without signer', async () => {
    const bridge = new ChainBridge({
      rpcUrl: 'http://localhost:8545',
      oracleAddress: '0x0000000000000000000000000000000000000001',
    });
    await expect(bridge.getBalance()).rejects.toThrow('No signer configured');
  });

  it('getSignerAddress returns wallet address', async () => {
    const wallet = ethers.Wallet.createRandom();
    const bridge = new ChainBridge({
      rpcUrl: 'http://localhost:8545',
      oracleAddress: '0x0000000000000000000000000000000000000001',
      privateKey: wallet.privateKey,
    });
    const address = await bridge.getSignerAddress();
    expect(address).toBe(wallet.address);
  });
});
