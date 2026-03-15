import { Dashboard } from '../../src/dashboard/server';
import { ConsensusEngine } from '../../src/oracle/consensus';
import { PropertyAgent } from '../../src/agents/property-agent';
import { CommodityAgent } from '../../src/agents/commodity-agent';
import { TreasuryAgent } from '../../src/agents/treasury-agent';
import { AssetClass, AssetData, ConsensusResult } from '../../src/types';
import http from 'http';

function makeConsensus(assetId: string, value: number, confidence: number, agentCount = 2): ConsensusResult {
  return {
    assetId,
    consensusValue: value,
    avgConfidence: confidence,
    valuations: Array.from({ length: agentCount }, (_, i) => ({
      assetId,
      value: value + (i - 1) * 100,
      confidence,
      methodology: `agent-${i}`,
      dataPoints: [],
      timestamp: new Date(),
      agentId: `agent-${i}`,
    })),
    methodology: 'test-consensus',
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

function fetchRaw(port: number, path: string): Promise<{ body: string; statusCode: number; headers: http.IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    const req = http.get(`http://localhost:${port}${path}`, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve({ body, statusCode: res.statusCode || 0, headers: res.headers }));
    });
    req.on('error', reject);
    req.setTimeout(5000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

let portCounter = 6100;
function nextPort(): number {
  return portCounter++;
}

describe('Dashboard API & HTTP', () => {
  let dashboard: Dashboard;
  let engine: ConsensusEngine;
  let port: number;

  beforeEach(() => {
    engine = new ConsensusEngine();
    engine.registerAgent(new PropertyAgent());
    engine.registerAgent(new CommodityAgent());
    engine.registerAgent(new TreasuryAgent());
    port = nextPort();
    dashboard = new Dashboard({ consensusEngine: engine, port });
  });

  afterEach(() => {
    dashboard.stop();
  });

  describe('API /api/data response structure', () => {
    it('should return valid JSON with all top-level keys', async () => {
      await dashboard.start();
      const data = await fetchJSON(port, '/api/data');
      expect(data).toHaveProperty('agents');
      expect(data).toHaveProperty('portfolio');
      expect(data).toHaveProperty('recentValuations');
      expect(data).toHaveProperty('stats');
    });

    it('should return correct stats with empty portfolio', async () => {
      await dashboard.start();
      const data = await fetchJSON(port, '/api/data');
      expect(data.stats.totalAssets).toBe(0);
      expect(data.stats.totalValue).toBe(0);
      expect(data.stats.totalValuations).toBe(0);
      expect(data.stats.agentCount).toBe(3);
    });

    it('should list all registered agents', async () => {
      await dashboard.start();
      const data = await fetchJSON(port, '/api/data');
      expect(data.agents).toHaveLength(3);
      expect(data.agents.map((a: any) => a.id)).toEqual(
        expect.arrayContaining(['property-agent', 'commodity-agent', 'treasury-agent'])
      );
    });

    it('should include agent asset classes', async () => {
      await dashboard.start();
      const data = await fetchJSON(port, '/api/data');
      const propAgent = data.agents.find((a: any) => a.id === 'property-agent');
      expect(propAgent.assetClasses).toContain(AssetClass.REAL_ESTATE);
    });

    it('should include agent names', async () => {
      await dashboard.start();
      const data = await fetchJSON(port, '/api/data');
      for (const agent of data.agents) {
        expect(typeof agent.name).toBe('string');
        expect(agent.name.length).toBeGreaterThan(0);
      }
    });
  });

  describe('API portfolio data', () => {
    it('should reflect added valuations in portfolio', async () => {
      const asset = makeAsset('prop-1', 'Manhattan Office', AssetClass.REAL_ESTATE);
      const consensus = makeConsensus('prop-1', 500000, 0.9);
      dashboard.addValuation(consensus, asset);
      await dashboard.start();
      const data = await fetchJSON(port, '/api/data');
      expect(data.portfolio).toHaveLength(1);
      expect(data.portfolio[0].id).toBe('prop-1');
      expect(data.portfolio[0].name).toBe('Manhattan Office');
      expect(data.portfolio[0].value).toBe(500000);
    });

    it('should update existing asset on re-valuation', async () => {
      const asset = makeAsset('gold-1', 'Gold Bar', AssetClass.COMMODITY);
      dashboard.addValuation(makeConsensus('gold-1', 50000, 0.85), asset);
      dashboard.addValuation(makeConsensus('gold-1', 52000, 0.88), asset);
      await dashboard.start();
      const data = await fetchJSON(port, '/api/data');
      expect(data.portfolio).toHaveLength(1);
      expect(data.portfolio[0].value).toBe(52000);
    });

    it('should calculate total portfolio value across assets', async () => {
      dashboard.addValuation(makeConsensus('a', 100000, 0.9), makeAsset('a', 'A', AssetClass.REAL_ESTATE));
      dashboard.addValuation(makeConsensus('b', 200000, 0.85), makeAsset('b', 'B', AssetClass.COMMODITY));
      dashboard.addValuation(makeConsensus('c', 300000, 0.92), makeAsset('c', 'C', AssetClass.TREASURY));
      await dashboard.start();
      const data = await fetchJSON(port, '/api/data');
      expect(data.stats.totalValue).toBe(600000);
      expect(data.stats.totalAssets).toBe(3);
    });

    it('should include confidence in portfolio entries', async () => {
      dashboard.addValuation(makeConsensus('t', 1000, 0.73), makeAsset('t', 'T', AssetClass.TREASURY));
      await dashboard.start();
      const data = await fetchJSON(port, '/api/data');
      expect(data.portfolio[0].confidence).toBe(0.73);
    });

    it('should include agent count in portfolio entries', async () => {
      dashboard.addValuation(makeConsensus('t', 1000, 0.73, 3), makeAsset('t', 'T', AssetClass.TREASURY));
      await dashboard.start();
      const data = await fetchJSON(port, '/api/data');
      expect(data.portfolio[0].agentCount).toBe(3);
    });

    it('should include lastUpdated timestamp', async () => {
      dashboard.addValuation(makeConsensus('t', 1000, 0.73), makeAsset('t', 'T', AssetClass.TREASURY));
      await dashboard.start();
      const data = await fetchJSON(port, '/api/data');
      expect(data.portfolio[0].lastUpdated).toBeTruthy();
    });

    it('should include asset class in portfolio', async () => {
      dashboard.addValuation(makeConsensus('g', 50000, 0.8), makeAsset('g', 'Gold', AssetClass.COMMODITY));
      await dashboard.start();
      const data = await fetchJSON(port, '/api/data');
      expect(data.portfolio[0].assetClass).toBe(AssetClass.COMMODITY);
    });
  });

  describe('API recent valuations', () => {
    it('should track valuation history', async () => {
      for (let i = 0; i < 5; i++) {
        dashboard.addValuation(
          makeConsensus(`a-${i}`, 1000 * (i + 1), 0.8),
          makeAsset(`a-${i}`, `Asset ${i}`, AssetClass.COMMODITY)
        );
      }
      await dashboard.start();
      const data = await fetchJSON(port, '/api/data');
      expect(data.recentValuations).toHaveLength(5);
      expect(data.stats.totalValuations).toBe(5);
    });

    it('should limit recent valuations to last 20', async () => {
      for (let i = 0; i < 25; i++) {
        dashboard.addValuation(
          makeConsensus(`a-${i}`, 1000, 0.8),
          makeAsset(`a-${i}`, `Asset ${i}`, AssetClass.COMMODITY)
        );
      }
      await dashboard.start();
      const data = await fetchJSON(port, '/api/data');
      expect(data.recentValuations).toHaveLength(20);
      expect(data.stats.totalValuations).toBe(25);
    });

    it('should return recent valuations in reverse order', async () => {
      for (let i = 0; i < 3; i++) {
        dashboard.addValuation(
          makeConsensus(`a-${i}`, 1000 * (i + 1), 0.8),
          makeAsset(`a-${i}`, `Asset ${i}`, AssetClass.COMMODITY)
        );
      }
      await dashboard.start();
      const data = await fetchJSON(port, '/api/data');
      expect(data.recentValuations[0].consensusValue).toBe(3000);
      expect(data.recentValuations[2].consensusValue).toBe(1000);
    });
  });

  describe('HTTP response headers and status', () => {
    it('should return 200 for /api/data', async () => {
      await dashboard.start();
      const res = await fetchRaw(port, '/api/data');
      expect(res.statusCode).toBe(200);
    });

    it('should return application/json for /api/data', async () => {
      await dashboard.start();
      const res = await fetchRaw(port, '/api/data');
      expect(res.headers['content-type']).toBe('application/json');
    });

    it('should return 200 for dashboard HTML', async () => {
      await dashboard.start();
      const res = await fetchRaw(port, '/');
      expect(res.statusCode).toBe(200);
    });

    it('should return text/html for dashboard', async () => {
      await dashboard.start();
      const res = await fetchRaw(port, '/');
      expect(res.headers['content-type']).toBe('text/html');
    });

    it('should return HTML for any non-api path', async () => {
      await dashboard.start();
      const res = await fetchRaw(port, '/some/random/path');
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toBe('text/html');
    });
  });

  describe('Dashboard HTML content', () => {
    it('should contain HTML doctype', async () => {
      await dashboard.start();
      const res = await fetchRaw(port, '/');
      expect(res.body).toContain('<!DOCTYPE html>');
    });

    it('should contain RWA Nexus title', async () => {
      await dashboard.start();
      const res = await fetchRaw(port, '/');
      expect(res.body).toContain('<title>RWA Nexus Dashboard</title>');
    });

    it('should contain BNB Chain reference', async () => {
      await dashboard.start();
      const res = await fetchRaw(port, '/');
      expect(res.body).toContain('BNB Chain');
    });

    it('should contain stat-card CSS classes', async () => {
      await dashboard.start();
      const res = await fetchRaw(port, '/');
      expect(res.body).toContain('stat-card');
      expect(res.body).toContain('.stat-card .label');
      expect(res.body).toContain('.stat-card .value');
    });

    it('should contain confidence CSS classes', async () => {
      await dashboard.start();
      const res = await fetchRaw(port, '/');
      expect(res.body).toContain('conf-high');
      expect(res.body).toContain('conf-mid');
      expect(res.body).toContain('conf-low');
    });

    it('should contain portfolio table headers', async () => {
      await dashboard.start();
      const res = await fetchRaw(port, '/');
      expect(res.body).toContain('<th>Asset</th>');
      expect(res.body).toContain('<th>Class</th>');
      expect(res.body).toContain('<th>Value (USD)</th>');
      expect(res.body).toContain('<th>Confidence</th>');
    });

    it('should contain auto-refresh script', async () => {
      await dashboard.start();
      const res = await fetchRaw(port, '/');
      expect(res.body).toContain('setInterval(refresh, 5000)');
    });

    it('should contain agent section', async () => {
      await dashboard.start();
      const res = await fetchRaw(port, '/');
      expect(res.body).toContain('AI Valuation Agents');
    });

    it('should contain fetch API call', async () => {
      await dashboard.start();
      const res = await fetchRaw(port, '/');
      expect(res.body).toContain("fetch('/api/data')");
    });
  });

  describe('server lifecycle', () => {
    it('should return URL on start', async () => {
      const url = await dashboard.start();
      expect(url).toBe(`http://localhost:${port}`);
    });

    it('should use default port 3457 when not specified', () => {
      const d = new Dashboard({ consensusEngine: engine });
      expect((d as any).port).toBe(3457);
      d.stop();
    });

    it('should accept custom port', () => {
      expect((dashboard as any).port).toBe(port);
    });

    it('should stop gracefully', async () => {
      await dashboard.start();
      expect(() => dashboard.stop()).not.toThrow();
    });

    it('should handle stop without start', () => {
      expect(() => dashboard.stop()).not.toThrow();
    });
  });

  describe('addValuation state management', () => {
    it('should handle adding same asset multiple times', () => {
      const asset = makeAsset('a', 'A', AssetClass.COMMODITY);
      dashboard.addValuation(makeConsensus('a', 100, 0.8), asset);
      dashboard.addValuation(makeConsensus('a', 200, 0.9), asset);
      dashboard.addValuation(makeConsensus('a', 300, 0.95), asset);
      expect((dashboard as any).portfolio.size).toBe(1);
      expect((dashboard as any).valuationHistory).toHaveLength(3);
    });

    it('should handle many distinct assets', () => {
      for (let i = 0; i < 50; i++) {
        dashboard.addValuation(
          makeConsensus(`a-${i}`, 1000 * i, 0.8),
          makeAsset(`a-${i}`, `Asset ${i}`, AssetClass.COMMODITY)
        );
      }
      expect((dashboard as any).portfolio.size).toBe(50);
      expect((dashboard as any).valuationHistory).toHaveLength(50);
    });

    it('should preserve most recent consensus per asset', () => {
      const asset = makeAsset('x', 'X', AssetClass.TREASURY);
      dashboard.addValuation(makeConsensus('x', 1000, 0.5), asset);
      dashboard.addValuation(makeConsensus('x', 9999, 0.99), asset);
      const entry = (dashboard as any).portfolio.get('x');
      expect(entry.consensus.consensusValue).toBe(9999);
      expect(entry.consensus.avgConfidence).toBe(0.99);
    });
  });

  describe('API with large datasets', () => {
    it('should handle portfolio with 100 assets', async () => {
      for (let i = 0; i < 100; i++) {
        dashboard.addValuation(
          makeConsensus(`asset-${i}`, (i + 1) * 10000, 0.75 + Math.random() * 0.2),
          makeAsset(`asset-${i}`, `Asset #${i}`, AssetClass.COMMODITY)
        );
      }
      await dashboard.start();
      const data = await fetchJSON(port, '/api/data');
      expect(data.portfolio).toHaveLength(100);
      expect(data.stats.totalAssets).toBe(100);
      expect(data.stats.totalValue).toBeGreaterThan(0);
    });

    it('should handle zero-value consensus', async () => {
      dashboard.addValuation(makeConsensus('z', 0, 0.5), makeAsset('z', 'Zero', AssetClass.COMMODITY));
      await dashboard.start();
      const data = await fetchJSON(port, '/api/data');
      expect(data.portfolio[0].value).toBe(0);
      expect(data.stats.totalValue).toBe(0);
    });

    it('should handle very large values', async () => {
      dashboard.addValuation(
        makeConsensus('big', 1_000_000_000, 0.95),
        makeAsset('big', 'Billion Dollar Asset', AssetClass.REAL_ESTATE)
      );
      await dashboard.start();
      const data = await fetchJSON(port, '/api/data');
      expect(data.portfolio[0].value).toBe(1_000_000_000);
    });

    it('should handle null consensus gracefully in portfolio value', async () => {
      const asset = makeAsset('nc', 'NoConsensus', AssetClass.COMMODITY);
      (dashboard as any).portfolio.set('nc', { asset, consensus: null });
      await dashboard.start();
      const data = await fetchJSON(port, '/api/data');
      expect(data.stats.totalValue).toBe(0);
      expect(data.portfolio[0].value).toBeUndefined();
    });
  });

  describe('engine with no agents', () => {
    it('should return empty agents array', async () => {
      const emptyEngine = new ConsensusEngine();
      const p = nextPort();
      const d = new Dashboard({ consensusEngine: emptyEngine, port: p });
      await d.start();
      const data = await fetchJSON(p, '/api/data');
      expect(data.agents).toHaveLength(0);
      expect(data.stats.agentCount).toBe(0);
      d.stop();
    });
  });
});
