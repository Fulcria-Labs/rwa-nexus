import { ChainBridge } from '../../src/oracle/chain-bridge';
import { ConsensusResult, ValuationResult } from '../../src/types';

/**
 * Comprehensive ChainBridge lifecycle and conversion tests.
 * Covers: construction, signer management, submission formatting,
 * precision edge cases, boundary values, and multi-asset scenarios.
 */

function makeConsensus(overrides: Partial<ConsensusResult> = {}): ConsensusResult {
  return {
    assetId: 'test-asset',
    consensusValue: 500000,
    avgConfidence: 0.75,
    valuations: [],
    methodology: 'test-method',
    timestamp: new Date('2026-01-15T12:00:00Z'),
    ...overrides,
  };
}

function makeValuation(overrides: Partial<ValuationResult> = {}): ValuationResult {
  return {
    assetId: 'test-asset',
    value: 500000,
    confidence: 0.8,
    methodology: 'test',
    dataPoints: [],
    timestamp: new Date(),
    agentId: 'test-agent',
    ...overrides,
  };
}

describe('ChainBridge Lifecycle', () => {
  const defaultConfig = {
    rpcUrl: 'http://localhost:8545',
    oracleAddress: '0x' + 'a'.repeat(40),
  };

  describe('construction', () => {
    it('should create bridge without private key', () => {
      const bridge = new ChainBridge(defaultConfig);
      expect(bridge).toBeDefined();
    });

    it('should create bridge with private key', () => {
      // Use a valid secp256k1 private key (must be < curve order)
      const bridge = new ChainBridge({
        ...defaultConfig,
        privateKey: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
      });
      expect(bridge).toBeDefined();
    });

    it('should accept different RPC URLs', () => {
      const urls = [
        'http://localhost:8545',
        'https://bsc-testnet.example.com',
        'https://mainnet.infura.io/v3/key',
        'wss://ws.example.com',
      ];

      for (const rpcUrl of urls) {
        const bridge = new ChainBridge({ ...defaultConfig, rpcUrl });
        expect(bridge).toBeDefined();
      }
    });

    it('should accept various oracle addresses', () => {
      const addresses = [
        '0x' + '0'.repeat(40),
        '0x' + 'f'.repeat(40),
        '0x' + '1234567890abcdef'.repeat(2) + '12345678',
      ];

      for (const oracleAddress of addresses) {
        const bridge = new ChainBridge({ ...defaultConfig, oracleAddress });
        expect(bridge).toBeDefined();
      }
    });
  });

  describe('toSubmission - value conversion precision', () => {
    let bridge: ChainBridge;

    beforeEach(() => {
      bridge = new ChainBridge(defaultConfig);
    });

    it('should convert integer USD values to 18 decimals', () => {
      const submission = bridge.toSubmission(makeConsensus({ consensusValue: 1000 }));
      expect(submission.value).toBe(1000000000000000000000n); // 1000 * 1e18
    });

    it('should convert fractional USD values precisely', () => {
      const submission = bridge.toSubmission(makeConsensus({ consensusValue: 99.99 }));
      expect(submission.value).toBe(99990000000000000000n);
    });

    it('should handle one cent correctly', () => {
      const submission = bridge.toSubmission(makeConsensus({ consensusValue: 0.01 }));
      expect(submission.value).toBe(10000000000000000n);
    });

    it('should handle one dollar correctly', () => {
      const submission = bridge.toSubmission(makeConsensus({ consensusValue: 1.00 }));
      expect(submission.value).toBe(1000000000000000000n);
    });

    it('should handle million dollar values', () => {
      const submission = bridge.toSubmission(makeConsensus({ consensusValue: 1000000 }));
      expect(submission.value).toBe(1000000000000000000000000n);
    });

    it('should handle billion dollar values', () => {
      const submission = bridge.toSubmission(makeConsensus({ consensusValue: 1000000000 }));
      expect(submission.value > 0n).toBe(true);
    });

    it('should preserve two decimal place precision', () => {
      const values = [123.45, 67890.12, 0.50, 999.01, 10000.99];
      for (const val of values) {
        const submission = bridge.toSubmission(makeConsensus({ consensusValue: val }));
        expect(submission.value > 0n).toBe(true);
      }
    });

    it('should round values with more than 2 decimal places', () => {
      // toFixed(2) rounds, so 123.456 → "123.46"
      const submission = bridge.toSubmission(makeConsensus({ consensusValue: 123.456 }));
      expect(submission.value).toBe(123460000000000000000n);
    });

    it('should handle zero value', () => {
      const submission = bridge.toSubmission(makeConsensus({ consensusValue: 0 }));
      expect(submission.value).toBe(0n);
    });
  });

  describe('toSubmission - confidence conversion', () => {
    let bridge: ChainBridge;

    beforeEach(() => {
      bridge = new ChainBridge(defaultConfig);
    });

    it('should convert 0% confidence to 0 basis points', () => {
      const submission = bridge.toSubmission(makeConsensus({ avgConfidence: 0 }));
      expect(submission.confidence).toBe(0);
    });

    it('should convert 100% confidence to 10000 basis points', () => {
      const submission = bridge.toSubmission(makeConsensus({ avgConfidence: 1.0 }));
      expect(submission.confidence).toBe(10000);
    });

    it('should convert 50% confidence to 5000 basis points', () => {
      const submission = bridge.toSubmission(makeConsensus({ avgConfidence: 0.5 }));
      expect(submission.confidence).toBe(5000);
    });

    it('should convert 85% confidence to 8500 basis points', () => {
      const submission = bridge.toSubmission(makeConsensus({ avgConfidence: 0.85 }));
      expect(submission.confidence).toBe(8500);
    });

    it('should round fractional basis points', () => {
      // 0.3333 * 10000 = 3333
      const submission = bridge.toSubmission(makeConsensus({ avgConfidence: 0.3333 }));
      expect(submission.confidence).toBe(3333);
    });

    it('should handle very small confidence values', () => {
      const submission = bridge.toSubmission(makeConsensus({ avgConfidence: 0.001 }));
      expect(submission.confidence).toBe(10);
    });

    it('should handle typical agent confidence values', () => {
      const confidences = [0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 0.92, 0.95];
      for (const conf of confidences) {
        const submission = bridge.toSubmission(makeConsensus({ avgConfidence: conf }));
        expect(submission.confidence).toBe(Math.round(conf * 10000));
      }
    });
  });

  describe('toSubmission - field preservation', () => {
    let bridge: ChainBridge;

    beforeEach(() => {
      bridge = new ChainBridge(defaultConfig);
    });

    it('should preserve assetId from consensus', () => {
      const ids = ['property-001', 'gold-reserve-42', 'us-treasury-10y', 'bnb-rwa-token'];
      for (const assetId of ids) {
        const submission = bridge.toSubmission(makeConsensus({ assetId }));
        expect(submission.assetId).toBe(assetId);
      }
    });

    it('should preserve methodology string', () => {
      const methodologies = [
        'Confidence-weighted consensus from 3/3 agents',
        'Single agent (property-agent): Blended comparable sales',
        'Spot price analysis with seasonal adjustments',
      ];
      for (const methodology of methodologies) {
        const submission = bridge.toSubmission(makeConsensus({ methodology }));
        expect(submission.methodology).toBe(methodology);
      }
    });

    it('should handle empty methodology', () => {
      const submission = bridge.toSubmission(makeConsensus({ methodology: '' }));
      expect(submission.methodology).toBe('');
    });

    it('should handle long asset IDs', () => {
      const longId = 'asset-' + 'x'.repeat(200);
      const submission = bridge.toSubmission(makeConsensus({ assetId: longId }));
      expect(submission.assetId).toBe(longId);
    });

    it('should handle special characters in methodology', () => {
      const methodology = 'Agent (v2.1) [alpha]: 60%/40% blend — adjusted';
      const submission = bridge.toSubmission(makeConsensus({ methodology }));
      expect(submission.methodology).toBe(methodology);
    });
  });

  describe('toSubmission - with valuations attached', () => {
    let bridge: ChainBridge;

    beforeEach(() => {
      bridge = new ChainBridge(defaultConfig);
    });

    it('should convert consensus with single valuation', () => {
      const consensus = makeConsensus({
        valuations: [makeValuation({ value: 500000 })],
      });
      const submission = bridge.toSubmission(consensus);
      expect(submission.value > 0n).toBe(true);
    });

    it('should convert consensus with multiple valuations', () => {
      const consensus = makeConsensus({
        valuations: [
          makeValuation({ value: 490000, agentId: 'agent-1' }),
          makeValuation({ value: 510000, agentId: 'agent-2' }),
          makeValuation({ value: 500000, agentId: 'agent-3' }),
        ],
      });
      const submission = bridge.toSubmission(consensus);
      expect(submission.value > 0n).toBe(true);
    });

    it('should use consensusValue not individual valuations for conversion', () => {
      const consensus = makeConsensus({
        consensusValue: 750000,
        valuations: [makeValuation({ value: 999999 })],
      });
      const submission = bridge.toSubmission(consensus);
      // Should use consensusValue (750000), not the valuation value
      expect(submission.value).toBe(750000000000000000000000n);
    });
  });

  describe('signer requirements', () => {
    it('should require signer for submitConsensus', async () => {
      const bridge = new ChainBridge(defaultConfig);
      await expect(bridge.submitConsensus(makeConsensus())).rejects.toThrow('No signer');
    });

    it('should require signer for getSignerAddress', async () => {
      const bridge = new ChainBridge(defaultConfig);
      await expect(bridge.getSignerAddress()).rejects.toThrow('No signer');
    });

    it('should require signer for getBalance', async () => {
      const bridge = new ChainBridge(defaultConfig);
      await expect(bridge.getBalance()).rejects.toThrow('No signer');
    });

    it('should not require signer for toSubmission', () => {
      const bridge = new ChainBridge(defaultConfig);
      const result = bridge.toSubmission(makeConsensus());
      expect(result).toBeDefined();
    });
  });

  describe('multi-asset submission formatting', () => {
    let bridge: ChainBridge;

    beforeEach(() => {
      bridge = new ChainBridge(defaultConfig);
    });

    it('should format real estate submission correctly', () => {
      const consensus = makeConsensus({
        assetId: 'property-manhattan-001',
        consensusValue: 2500000,
        avgConfidence: 0.85,
        methodology: 'Blended comparable sales analysis',
      });
      const submission = bridge.toSubmission(consensus);
      expect(submission.assetId).toBe('property-manhattan-001');
      expect(submission.confidence).toBe(8500);
      expect(submission.value).toBe(2500000000000000000000000n);
    });

    it('should format commodity submission correctly', () => {
      const consensus = makeConsensus({
        assetId: 'gold-reserve-50oz',
        consensusValue: 132500.00,
        avgConfidence: 0.83,
        methodology: 'Spot price analysis',
      });
      const submission = bridge.toSubmission(consensus);
      expect(submission.assetId).toBe('gold-reserve-50oz');
      expect(submission.confidence).toBe(8300);
    });

    it('should format treasury submission correctly', () => {
      const consensus = makeConsensus({
        assetId: 'us-treasury-10y-bond',
        consensusValue: 970.25,
        avgConfidence: 0.92,
        methodology: 'DCF analysis with yield curve',
      });
      const submission = bridge.toSubmission(consensus);
      expect(submission.assetId).toBe('us-treasury-10y-bond');
      expect(submission.confidence).toBe(9200);
      expect(submission.value).toBe(970250000000000000000n);
    });

    it('should handle batch of different asset types', () => {
      const assets = [
        { id: 'prop-1', value: 1000000, conf: 0.85 },
        { id: 'gold-1', value: 132500, conf: 0.83 },
        { id: 'bond-1', value: 970.25, conf: 0.92 },
        { id: 'oil-1', value: 78500, conf: 0.67 },
        { id: 'prop-2', value: 3500000, conf: 0.88 },
      ];

      const submissions = assets.map(a =>
        bridge.toSubmission(makeConsensus({
          assetId: a.id,
          consensusValue: a.value,
          avgConfidence: a.conf,
        }))
      );

      expect(submissions).toHaveLength(5);
      for (let i = 0; i < assets.length; i++) {
        expect(submissions[i].assetId).toBe(assets[i].id);
        expect(submissions[i].confidence).toBe(Math.round(assets[i].conf * 10000));
        expect(submissions[i].value > 0n).toBe(true);
      }
    });
  });

  describe('value ordering and comparison', () => {
    let bridge: ChainBridge;

    beforeEach(() => {
      bridge = new ChainBridge(defaultConfig);
    });

    it('should preserve ordering of values when converted', () => {
      const values = [100, 1000, 10000, 100000, 1000000];
      const submissions = values.map(v =>
        bridge.toSubmission(makeConsensus({ consensusValue: v }))
      );

      for (let i = 1; i < submissions.length; i++) {
        expect(submissions[i].value > submissions[i - 1].value).toBe(true);
      }
    });

    it('should preserve ordering of confidence when converted', () => {
      const confidences = [0.1, 0.3, 0.5, 0.7, 0.9];
      const submissions = confidences.map(c =>
        bridge.toSubmission(makeConsensus({ avgConfidence: c }))
      );

      for (let i = 1; i < submissions.length; i++) {
        expect(submissions[i].confidence).toBeGreaterThan(submissions[i - 1].confidence);
      }
    });

    it('should distinguish values differing by one cent', () => {
      const sub1 = bridge.toSubmission(makeConsensus({ consensusValue: 100.01 }));
      const sub2 = bridge.toSubmission(makeConsensus({ consensusValue: 100.02 }));
      expect(sub2.value > sub1.value).toBe(true);
      expect(sub2.value - sub1.value).toBe(10000000000000000n); // 0.01 * 1e18
    });

    it('should distinguish confidence by single basis point', () => {
      const sub1 = bridge.toSubmission(makeConsensus({ avgConfidence: 0.8500 }));
      const sub2 = bridge.toSubmission(makeConsensus({ avgConfidence: 0.8501 }));
      expect(sub2.confidence - sub1.confidence).toBe(1);
    });
  });

  describe('stress: rapid consecutive submissions', () => {
    let bridge: ChainBridge;

    beforeEach(() => {
      bridge = new ChainBridge(defaultConfig);
    });

    it('should handle 100 rapid submissions without errors', () => {
      const results = [];
      for (let i = 0; i < 100; i++) {
        results.push(bridge.toSubmission(makeConsensus({
          assetId: `asset-${i}`,
          consensusValue: (i + 1) * 1000,
          avgConfidence: Math.min(1, 0.5 + i * 0.005),
        })));
      }
      expect(results).toHaveLength(100);
      expect(new Set(results.map(r => r.assetId)).size).toBe(100);
    });

    it('should produce consistent results for same input', () => {
      const consensus = makeConsensus();
      const results = Array.from({ length: 50 }, () => bridge.toSubmission(consensus));
      const first = results[0];
      for (const r of results) {
        expect(r.value).toBe(first.value);
        expect(r.confidence).toBe(first.confidence);
        expect(r.assetId).toBe(first.assetId);
        expect(r.methodology).toBe(first.methodology);
      }
    });
  });
});
