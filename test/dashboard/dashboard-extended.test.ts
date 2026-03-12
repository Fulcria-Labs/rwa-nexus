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
        try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.setTimeout(5000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

function fetchText(port: number, path: string): Promise<{ body: string; statusCode: number; contentType: string }> {
  return new Promise((resolve, reject) => {
    const req = http.get(`http://localhost:${port}${path}`, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve({
        body,
        statusCode: res.statusCode || 0,
        contentType: res.headers['content-type'] || '',
      }));
    });
    req.on('error', reject);
    req.setTimeout(5000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

let portCounter = 6100;
function nextPort(): number {
  return portCounter++;
}

describe('Dashboard - Extended Tests', () => {
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
    setTimeout(done, 50);
  });

  describe('HTML content validation', () => {
    it('should include BNB Chain branding', async () => {
      const port = nextPort();
      dashboard = new Dashboard({ consensusEngine: engine, port });
      await dashboard.start();
      const { body } = await fetchText(port, '/');
      expect(body).toContain('BNB Chain');
    });

    it('should include CSS styles', async () => {
      const port = nextPort();
      dashboard = new Dashboard({ consensusEngine: engine, port });
      await dashboard.start();
      const { body } = await fetchText(port, '/');
      expect(body).toContain('<style>');
      expect(body).toContain('</style>');
    });

    it('should include JavaScript', async () => {
      const port = nextPort();
      dashboard = new Dashboard({ consensusEngine: engine, port });
      await dashboard.start();
      const { body } = await fetchText(port, '/');
      expect(body).toContain('<script>');
      expect(body).toContain('</script>');
    });

    it('should include fetch call to /api/data', async () => {
      const port = nextPort();
      dashboard = new Dashboard({ consensusEngine: engine, port });
      await dashboard.start();
      const { body } = await fetchText(port, '/');
      expect(body).toContain("fetch('/api/data')");
    });

    it('should include stat cards section', async () => {
      const port = nextPort();
      dashboard = new Dashboard({ consensusEngine: engine, port });
      await dashboard.start();
      const { body } = await fetchText(port, '/');
      expect(body).toContain('id="stats"');
    });

    it('should include portfolio table', async () => {
      const port = nextPort();
      dashboard = new Dashboard({ consensusEngine: engine, port });
      await dashboard.start();
      const { body } = await fetchText(port, '/');
      expect(body).toContain('id="portfolio"');
    });

    it('should include agents section', async () => {
      const port = nextPort();
      dashboard = new Dashboard({ consensusEngine: engine, port });
      await dashboard.start();
      const { body } = await fetchText(port, '/');
      expect(body).toContain('id="agents"');
    });

    it('should return status 200', async () => {
      const port = nextPort();
      dashboard = new Dashboard({ consensusEngine: engine, port });
      await dashboard.start();
      const { statusCode } = await fetchText(port, '/');
      expect(statusCode).toBe(200);
    });
  });

  describe('API data structure', () => {
    it('should return agents array', async () => {
      const port = nextPort();
      dashboard = new Dashboard({ consensusEngine: engine, port });
      await dashboard.start();
      const data = await fetchJSON(port, '/api/data');
      expect(Array.isArray(data.agents)).toBe(true);
    });

    it('should return portfolio array', async () => {
      const port = nextPort();
      dashboard = new Dashboard({ consensusEngine: engine, port });
      await dashboard.start();
      const data = await fetchJSON(port, '/api/data');
      expect(Array.isArray(data.portfolio)).toBe(true);
    });

    it('should return recentValuations array', async () => {
      const port = nextPort();
      dashboard = new Dashboard({ consensusEngine: engine, port });
      await dashboard.start();
      const data = await fetchJSON(port, '/api/data');
      expect(Array.isArray(data.recentValuations)).toBe(true);
    });

    it('should return stats object', async () => {
      const port = nextPort();
      dashboard = new Dashboard({ consensusEngine: engine, port });
      await dashboard.start();
      const data = await fetchJSON(port, '/api/data');
      expect(typeof data.stats).toBe('object');
      expect(data.stats).toHaveProperty('totalAssets');
      expect(data.stats).toHaveProperty('totalValue');
      expect(data.stats).toHaveProperty('totalValuations');
      expect(data.stats).toHaveProperty('agentCount');
    });

    it('should return correct agent count in stats', async () => {
      const port = nextPort();
      dashboard = new Dashboard({ consensusEngine: engine, port });
      await dashboard.start();
      const data = await fetchJSON(port, '/api/data');
      expect(data.stats.agentCount).toBe(3);
    });

    it('should return agent details with id, name, assetClasses', async () => {
      const port = nextPort();
      dashboard = new Dashboard({ consensusEngine: engine, port });
      await dashboard.start();
      const data = await fetchJSON(port, '/api/data');
      for (const agent of data.agents) {
        expect(agent).toHaveProperty('id');
        expect(agent).toHaveProperty('name');
        expect(agent).toHaveProperty('assetClasses');
      }
    });
  });

  describe('multiple valuations tracking', () => {
    it('should track 10 different assets', async () => {
      const port = nextPort();
      dashboard = new Dashboard({ consensusEngine: engine, port });

      for (let i = 0; i < 10; i++) {
        dashboard.addValuation(
          makeConsensus(`asset-${i}`, (i + 1) * 10000, 0.8),
          makeAsset(`asset-${i}`, `Asset ${i}`, AssetClass.COMMODITY)
        );
      }

      await dashboard.start();
      const data = await fetchJSON(port, '/api/data');
      expect(data.stats.totalAssets).toBe(10);
      expect(data.portfolio).toHaveLength(10);
      expect(data.stats.totalValuations).toBe(10);
    });

    it('should compute totalValue correctly for 5 assets', async () => {
      const port = nextPort();
      dashboard = new Dashboard({ consensusEngine: engine, port });

      const values = [100000, 200000, 300000, 400000, 500000];
      for (let i = 0; i < values.length; i++) {
        dashboard.addValuation(
          makeConsensus(`val-${i}`, values[i], 0.8),
          makeAsset(`val-${i}`, `Asset ${i}`, AssetClass.COMMODITY)
        );
      }

      await dashboard.start();
      const data = await fetchJSON(port, '/api/data');
      expect(data.stats.totalValue).toBe(1500000);
    });

    it('should keep valuation history distinct from portfolio count', async () => {
      const port = nextPort();
      dashboard = new Dashboard({ consensusEngine: engine, port });
      const asset = makeAsset('same', 'Same Asset', AssetClass.COMMODITY);

      // Add 5 valuations for same asset
      for (let i = 0; i < 5; i++) {
        dashboard.addValuation(
          makeConsensus('same', (i + 1) * 1000, 0.8),
          asset
        );
      }

      await dashboard.start();
      const data = await fetchJSON(port, '/api/data');
      expect(data.stats.totalAssets).toBe(1); // Same asset, updated
      expect(data.stats.totalValuations).toBe(5); // 5 valuations recorded
    });
  });

  describe('portfolio data format', () => {
    it('should include all expected portfolio fields', async () => {
      const port = nextPort();
      dashboard = new Dashboard({ consensusEngine: engine, port });
      dashboard.addValuation(
        makeConsensus('format-test', 50000, 0.85),
        makeAsset('format-test', 'Format Test', AssetClass.REAL_ESTATE)
      );

      await dashboard.start();
      const data = await fetchJSON(port, '/api/data');
      const item = data.portfolio[0];
      expect(item).toHaveProperty('id');
      expect(item).toHaveProperty('name');
      expect(item).toHaveProperty('assetClass');
      expect(item).toHaveProperty('value');
      expect(item).toHaveProperty('confidence');
      expect(item).toHaveProperty('agentCount');
      expect(item).toHaveProperty('lastUpdated');
    });

    it('should show correct asset class in portfolio', async () => {
      const port = nextPort();
      dashboard = new Dashboard({ consensusEngine: engine, port });
      dashboard.addValuation(
        makeConsensus('class-test', 50000, 0.8),
        makeAsset('class-test', 'Test', AssetClass.TREASURY)
      );

      await dashboard.start();
      const data = await fetchJSON(port, '/api/data');
      expect(data.portfolio[0].assetClass).toBe(AssetClass.TREASURY);
    });
  });

  describe('API content type', () => {
    it('should return application/json for /api/data', async () => {
      const port = nextPort();
      dashboard = new Dashboard({ consensusEngine: engine, port });
      await dashboard.start();
      const { contentType } = await fetchText(port, '/api/data');
      expect(contentType).toContain('application/json');
    });

    it('should return text/html for root path', async () => {
      const port = nextPort();
      dashboard = new Dashboard({ consensusEngine: engine, port });
      await dashboard.start();
      const { contentType } = await fetchText(port, '/');
      expect(contentType).toContain('text/html');
    });

    it('should return text/html for unknown paths', async () => {
      const port = nextPort();
      dashboard = new Dashboard({ consensusEngine: engine, port });
      await dashboard.start();
      const { contentType } = await fetchText(port, '/unknown');
      expect(contentType).toContain('text/html');
    });
  });

  describe('empty engine dashboard', () => {
    it('should work with engine that has no agents', async () => {
      const port = nextPort();
      const emptyEngine = new ConsensusEngine();
      dashboard = new Dashboard({ consensusEngine: emptyEngine, port });
      await dashboard.start();
      const data = await fetchJSON(port, '/api/data');
      expect(data.stats.agentCount).toBe(0);
      expect(data.agents).toHaveLength(0);
    });
  });
});
