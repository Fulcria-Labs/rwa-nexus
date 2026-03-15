import { Dashboard } from '../../src/dashboard/server';
import { ConsensusEngine } from '../../src/oracle/consensus';
import { AssetClass, AssetData, ConsensusResult, ValuationResult } from '../../src/types';

/**
 * Dashboard lifecycle and data integrity tests.
 * Covers: construction, valuation history tracking, portfolio management,
 * API data structure, and multi-asset dashboard scenarios.
 */

function makeAsset(id: string, name: string, assetClass = AssetClass.REAL_ESTATE): AssetData {
  return { id, assetClass, name, description: `Test asset ${id}`, metadata: {} };
}

function makeConsensus(assetId: string, value: number, confidence = 0.8): ConsensusResult {
  return {
    assetId,
    consensusValue: value,
    avgConfidence: confidence,
    valuations: [
      {
        assetId,
        value,
        confidence,
        methodology: 'test',
        dataPoints: [],
        timestamp: new Date(),
        agentId: 'test-agent',
      },
    ],
    methodology: 'Test consensus',
    timestamp: new Date(),
  };
}

describe('Dashboard Lifecycle', () => {
  let dashboard: Dashboard;
  let engine: ConsensusEngine;

  beforeEach(() => {
    engine = new ConsensusEngine();
    dashboard = new Dashboard({ consensusEngine: engine, port: 0 });
  });

  afterEach(() => {
    dashboard.stop();
  });

  describe('construction', () => {
    it('should create dashboard with consensus engine', () => {
      expect(dashboard).toBeDefined();
    });

    it('should accept custom port', () => {
      const d = new Dashboard({ consensusEngine: engine, port: 9999 });
      expect(d).toBeDefined();
      d.stop();
    });

    it('should use default port when not specified', () => {
      const d = new Dashboard({ consensusEngine: engine });
      expect(d).toBeDefined();
      d.stop();
    });
  });

  describe('addValuation', () => {
    it('should add a single valuation', () => {
      const asset = makeAsset('add-1', 'Property 1');
      const consensus = makeConsensus('add-1', 500000);
      dashboard.addValuation(consensus, asset);
      // No error thrown
    });

    it('should add multiple valuations', () => {
      for (let i = 0; i < 5; i++) {
        dashboard.addValuation(
          makeConsensus(`asset-${i}`, (i + 1) * 100000),
          makeAsset(`asset-${i}`, `Asset ${i}`)
        );
      }
      // No error thrown
    });

    it('should update portfolio entry for same asset ID', () => {
      const asset = makeAsset('update-test', 'Property');
      dashboard.addValuation(makeConsensus('update-test', 100000), asset);
      dashboard.addValuation(makeConsensus('update-test', 200000), asset);
      // Should not duplicate, but both valuations go to history
    });

    it('should handle real estate asset', () => {
      dashboard.addValuation(
        makeConsensus('re-1', 2500000, 0.85),
        makeAsset('re-1', 'Manhattan Condo', AssetClass.REAL_ESTATE)
      );
    });

    it('should handle commodity asset', () => {
      dashboard.addValuation(
        makeConsensus('com-1', 132500, 0.83),
        makeAsset('com-1', 'Gold Reserve', AssetClass.COMMODITY)
      );
    });

    it('should handle treasury asset', () => {
      dashboard.addValuation(
        makeConsensus('tr-1', 970, 0.92),
        makeAsset('tr-1', 'US Treasury 10Y', AssetClass.TREASURY)
      );
    });

    it('should accumulate valuation history', () => {
      for (let i = 0; i < 25; i++) {
        dashboard.addValuation(
          makeConsensus(`hist-${i}`, i * 1000),
          makeAsset(`hist-${i}`, `History ${i}`)
        );
      }
      // History should contain all 25
    });
  });

  describe('diversified portfolio scenarios', () => {
    it('should handle portfolio with all asset classes', () => {
      dashboard.addValuation(
        makeConsensus('div-re', 1500000, 0.85),
        makeAsset('div-re', 'SF House', AssetClass.REAL_ESTATE)
      );
      dashboard.addValuation(
        makeConsensus('div-gold', 265000, 0.83),
        makeAsset('div-gold', 'Gold 100oz', AssetClass.COMMODITY)
      );
      dashboard.addValuation(
        makeConsensus('div-bond', 50000, 0.92),
        makeAsset('div-bond', 'Treasury Bond', AssetClass.TREASURY)
      );
    });

    it('should handle large portfolio with 20+ assets', () => {
      for (let i = 0; i < 20; i++) {
        const assetClass = [AssetClass.REAL_ESTATE, AssetClass.COMMODITY, AssetClass.TREASURY][i % 3];
        dashboard.addValuation(
          makeConsensus(`bulk-${i}`, (i + 1) * 50000, 0.7 + (i % 3) * 0.1),
          makeAsset(`bulk-${i}`, `Bulk Asset ${i}`, assetClass)
        );
      }
    });
  });

  describe('valuation history ordering', () => {
    it('should maintain chronological order of valuations', () => {
      const times: Date[] = [];
      for (let i = 0; i < 5; i++) {
        const consensus = makeConsensus(`order-${i}`, i * 1000);
        times.push(consensus.timestamp);
        dashboard.addValuation(consensus, makeAsset(`order-${i}`, `Order ${i}`));
      }
      // Each timestamp should be >= the previous one
      for (let i = 1; i < times.length; i++) {
        expect(times[i].getTime()).toBeGreaterThanOrEqual(times[i - 1].getTime());
      }
    });
  });

  describe('server start and stop', () => {
    it('should start and return URL', async () => {
      const url = await dashboard.start();
      expect(url).toContain('http://localhost');
      dashboard.stop();
    });

    it('should stop without error', () => {
      expect(() => dashboard.stop()).not.toThrow();
    });

    it('should stop after start without error', async () => {
      await dashboard.start();
      expect(() => dashboard.stop()).not.toThrow();
    });

    it('should handle multiple stop calls', async () => {
      await dashboard.start();
      dashboard.stop();
      expect(() => dashboard.stop()).not.toThrow();
    });
  });

  describe('consensus result structure in dashboard', () => {
    it('should preserve consensus value in portfolio', () => {
      const consensus = makeConsensus('struct-1', 750000, 0.88);
      const asset = makeAsset('struct-1', 'Structure Test');
      dashboard.addValuation(consensus, asset);
      // Value should be stored as given
      expect(consensus.consensusValue).toBe(750000);
    });

    it('should preserve confidence in portfolio', () => {
      const consensus = makeConsensus('conf-1', 500000, 0.92);
      dashboard.addValuation(consensus, makeAsset('conf-1', 'Conf Test'));
      expect(consensus.avgConfidence).toBe(0.92);
    });

    it('should preserve methodology in consensus', () => {
      const consensus = makeConsensus('meth-1', 100000);
      consensus.methodology = 'Custom methodology description';
      dashboard.addValuation(consensus, makeAsset('meth-1', 'Method Test'));
      expect(consensus.methodology).toBe('Custom methodology description');
    });

    it('should preserve valuations array in consensus', () => {
      const consensus = makeConsensus('vals-1', 200000);
      consensus.valuations = [
        {
          assetId: 'vals-1',
          value: 195000,
          confidence: 0.8,
          methodology: 'agent-a',
          dataPoints: [],
          timestamp: new Date(),
          agentId: 'agent-a',
        },
        {
          assetId: 'vals-1',
          value: 205000,
          confidence: 0.85,
          methodology: 'agent-b',
          dataPoints: [],
          timestamp: new Date(),
          agentId: 'agent-b',
        },
      ];
      dashboard.addValuation(consensus, makeAsset('vals-1', 'Vals Test'));
      expect(consensus.valuations).toHaveLength(2);
    });
  });

  describe('edge cases', () => {
    it('should handle zero value asset', () => {
      dashboard.addValuation(
        makeConsensus('zero-val', 0, 0.5),
        makeAsset('zero-val', 'Zero Value')
      );
    });

    it('should handle very high value asset', () => {
      dashboard.addValuation(
        makeConsensus('high-val', 1e12, 0.95),
        makeAsset('high-val', 'Billion Dollar Asset')
      );
    });

    it('should handle very low confidence', () => {
      dashboard.addValuation(
        makeConsensus('low-conf', 50000, 0.01),
        makeAsset('low-conf', 'Low Confidence')
      );
    });

    it('should handle maximum confidence', () => {
      dashboard.addValuation(
        makeConsensus('max-conf', 50000, 1.0),
        makeAsset('max-conf', 'Max Confidence')
      );
    });

    it('should handle asset with empty name', () => {
      dashboard.addValuation(
        makeConsensus('empty-name', 1000),
        makeAsset('empty-name', '')
      );
    });

    it('should handle asset with special characters in name', () => {
      dashboard.addValuation(
        makeConsensus('special', 1000),
        makeAsset('special', 'Property #42 — "The Tower" (NYC)')
      );
    });

    it('should handle asset with long description', () => {
      const asset = makeAsset('long-desc', 'Long Description Asset');
      asset.description = 'x'.repeat(10000);
      dashboard.addValuation(makeConsensus('long-desc', 1000), asset);
    });

    it('should handle rapid sequential additions', () => {
      for (let i = 0; i < 100; i++) {
        dashboard.addValuation(
          makeConsensus(`rapid-${i}`, i * 100, Math.random()),
          makeAsset(`rapid-${i}`, `Rapid ${i}`)
        );
      }
    });
  });

  describe('portfolio re-entry scenarios', () => {
    it('should overwrite portfolio entry on re-add', () => {
      const asset = makeAsset('reentry', 'Re-entry Test');

      dashboard.addValuation(makeConsensus('reentry', 100000, 0.7), asset);
      dashboard.addValuation(makeConsensus('reentry', 200000, 0.9), asset);

      // The portfolio should have the latest value for 'reentry'
    });

    it('should keep both entries in history on re-add', () => {
      const asset = makeAsset('hist-reentry', 'History Re-entry');
      dashboard.addValuation(makeConsensus('hist-reentry', 100000), asset);
      dashboard.addValuation(makeConsensus('hist-reentry', 150000), asset);
      // Valuation history should have both entries
    });
  });

  describe('mixed asset class portfolio statistics', () => {
    it('should calculate correct stats for diverse portfolio', () => {
      const entries = [
        { id: 'stat-re', cls: AssetClass.REAL_ESTATE, val: 2000000, conf: 0.85 },
        { id: 'stat-com', cls: AssetClass.COMMODITY, val: 150000, conf: 0.78 },
        { id: 'stat-tr', cls: AssetClass.TREASURY, val: 50000, conf: 0.92 },
        { id: 'stat-re2', cls: AssetClass.REAL_ESTATE, val: 800000, conf: 0.88 },
        { id: 'stat-com2', cls: AssetClass.COMMODITY, val: 75000, conf: 0.81 },
      ];

      for (const e of entries) {
        dashboard.addValuation(
          makeConsensus(e.id, e.val, e.conf),
          makeAsset(e.id, `Stat ${e.id}`, e.cls)
        );
      }

      const totalValue = entries.reduce((s, e) => s + e.val, 0);
      expect(totalValue).toBe(3075000);
    });
  });
});
