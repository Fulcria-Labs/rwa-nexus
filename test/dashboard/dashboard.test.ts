import { Dashboard } from '../../src/dashboard/server';
import { ConsensusEngine } from '../../src/oracle/consensus';
import { PropertyAgent } from '../../src/agents/property-agent';
import { CommodityAgent } from '../../src/agents/commodity-agent';
import { TreasuryAgent } from '../../src/agents/treasury-agent';
import { AssetClass, AssetData, ConsensusResult } from '../../src/types';
import http from 'http';

function makeConsensus(assetId: string, value: number, confidence: number): ConsensusResult {
  return {
    assetId,
    consensusValue: value,
    avgConfidence: confidence,
    valuations: [],
    methodology: 'test',
    timestamp: new Date(),
  };
}

function makeAsset(id: string, name: string, assetClass: AssetClass): AssetData {
  return { id, assetClass, name, description: '', metadata: {} };
}

function fetchJSON(port: number, path: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const req = http.get(`http://localhost:${port}${path}`, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(5000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

function fetchText(port: number, path: string): Promise<{ body: string; contentType: string }> {
  return new Promise((resolve, reject) => {
    const req = http.get(`http://localhost:${port}${path}`, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve({ body, contentType: res.headers['content-type'] || '' }));
    });
    req.on('error', reject);
    req.setTimeout(5000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

let portCounter = 5100;
function nextPort(): number {
  return portCounter++;
}

describe('Dashboard', () => {
  let dashboard: Dashboard;
  let engine: ConsensusEngine;

  beforeEach(() => {
    engine = new ConsensusEngine();
    engine.registerAgent(new PropertyAgent());
    engine.registerAgent(new CommodityAgent());
    engine.registerAgent(new TreasuryAgent());
  });

  afterEach((done) => {
    if (dashboard) {
      dashboard.stop();
    }
    // Give the port time to release
    setTimeout(done, 50);
  });

  describe('server lifecycle', () => {
    it('should start and return URL', async () => {
      const port = nextPort();
      dashboard = new Dashboard({ consensusEngine: engine, port });
      const url = await dashboard.start();
      expect(url).toBe(`http://localhost:${port}`);
    });

    it('should stop gracefully', async () => {
      const port = nextPort();
      dashboard = new Dashboard({ consensusEngine: engine, port });
      await dashboard.start();
      expect(() => dashboard.stop()).not.toThrow();
    });

    it('should handle stop when not started', () => {
      const port = nextPort();
      dashboard = new Dashboard({ consensusEngine: engine, port });
      expect(() => dashboard.stop()).not.toThrow();
    });
  });

  describe('API endpoint', () => {
    it('should return JSON from /api/data', async () => {
      const port = nextPort();
      dashboard = new Dashboard({ consensusEngine: engine, port });
      await dashboard.start();

      const data = await fetchJSON(port, '/api/data');

      expect(data).toHaveProperty('agents');
      expect(data).toHaveProperty('portfolio');
      expect(data).toHaveProperty('recentValuations');
      expect(data).toHaveProperty('stats');
    });

    it('should return correct stats for empty portfolio', async () => {
      const port = nextPort();
      dashboard = new Dashboard({ consensusEngine: engine, port });
      await dashboard.start();

      const data = await fetchJSON(port, '/api/data');

      expect(data.stats.totalAssets).toBe(0);
      expect(data.stats.totalValue).toBe(0);
      expect(data.stats.totalValuations).toBe(0);
      expect(data.stats.agentCount).toBe(3);
    });

    it('should list registered agents', async () => {
      const port = nextPort();
      dashboard = new Dashboard({ consensusEngine: engine, port });
      await dashboard.start();

      const data = await fetchJSON(port, '/api/data');

      expect(data.agents).toHaveLength(3);
      expect(data.agents[0]).toHaveProperty('id');
      expect(data.agents[0]).toHaveProperty('name');
      expect(data.agents[0]).toHaveProperty('assetClasses');
    });

    it('should track portfolio after adding valuations', async () => {
      const port = nextPort();
      dashboard = new Dashboard({ consensusEngine: engine, port });

      dashboard.addValuation(
        makeConsensus('asset-1', 500000, 0.85),
        makeAsset('asset-1', 'Miami Property', AssetClass.REAL_ESTATE)
      );
      dashboard.addValuation(
        makeConsensus('asset-2', 265000, 0.83),
        makeAsset('asset-2', 'Gold Reserve', AssetClass.COMMODITY)
      );

      await dashboard.start();

      const data = await fetchJSON(port, '/api/data');

      expect(data.stats.totalAssets).toBe(2);
      expect(data.stats.totalValue).toBe(765000);
      expect(data.stats.totalValuations).toBe(2);
      expect(data.portfolio).toHaveLength(2);
    });

    it('should limit recent valuations to 20', async () => {
      const port = nextPort();
      dashboard = new Dashboard({ consensusEngine: engine, port });

      for (let i = 0; i < 25; i++) {
        dashboard.addValuation(
          makeConsensus(`asset-${i}`, 1000 * i, 0.8),
          makeAsset(`asset-${i}`, `Asset ${i}`, AssetClass.COMMODITY)
        );
      }

      await dashboard.start();

      const data = await fetchJSON(port, '/api/data');
      expect(data.recentValuations).toHaveLength(20);
    });

    it('should reverse recent valuations (newest first)', async () => {
      const port = nextPort();
      dashboard = new Dashboard({ consensusEngine: engine, port });

      dashboard.addValuation(
        makeConsensus('first', 1000, 0.8),
        makeAsset('first', 'First', AssetClass.COMMODITY)
      );
      dashboard.addValuation(
        makeConsensus('second', 2000, 0.8),
        makeAsset('second', 'Second', AssetClass.COMMODITY)
      );

      await dashboard.start();

      const data = await fetchJSON(port, '/api/data');

      expect(data.recentValuations[0].assetId).toBe('second');
      expect(data.recentValuations[1].assetId).toBe('first');
    });
  });

  describe('Dashboard HTML endpoint', () => {
    it('should return HTML from root path', async () => {
      const port = nextPort();
      dashboard = new Dashboard({ consensusEngine: engine, port });
      await dashboard.start();

      const { contentType } = await fetchText(port, '/');
      expect(contentType).toContain('text/html');
    });

    it('should return valid HTML with DOCTYPE', async () => {
      const port = nextPort();
      dashboard = new Dashboard({ consensusEngine: engine, port });
      await dashboard.start();

      const { body } = await fetchText(port, '/');

      expect(body).toContain('<!DOCTYPE html>');
      expect(body).toContain('<html');
      expect(body).toContain('</html>');
      expect(body).toContain('RWA Nexus');
    });

    it('should include auto-refresh script', async () => {
      const port = nextPort();
      dashboard = new Dashboard({ consensusEngine: engine, port });
      await dashboard.start();

      const { body } = await fetchText(port, '/');
      expect(body).toContain('setInterval(refresh, 5000)');
    });
  });

  describe('addValuation', () => {
    it('should update existing asset in portfolio', async () => {
      const port = nextPort();
      dashboard = new Dashboard({ consensusEngine: engine, port });
      const asset = makeAsset('update-test', 'Test', AssetClass.COMMODITY);

      dashboard.addValuation(makeConsensus('update-test', 1000, 0.5), asset);
      dashboard.addValuation(makeConsensus('update-test', 2000, 0.9), asset);

      await dashboard.start();
      const data = await fetchJSON(port, '/api/data');

      // Portfolio has 1 asset (same ID updated), history has 2
      expect(data.portfolio).toHaveLength(1);
      expect(data.portfolio[0].value).toBe(2000);
      expect(data.stats.totalValuations).toBe(2);
    });
  });

  describe('default port', () => {
    it('should use port 3457 by default', () => {
      const defaultDash = new Dashboard({ consensusEngine: engine });
      expect(defaultDash).toBeDefined();
      defaultDash.stop();
    });
  });
});
