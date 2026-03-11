import http from 'http';
import { ConsensusEngine } from '../oracle/consensus';
import { AssetData, ConsensusResult } from '../types';

/**
 * Zero-dependency web dashboard for RWA Nexus.
 * Shows portfolio, valuations, agent activity, and consensus data.
 */
export class Dashboard {
  private server: http.Server | null = null;
  private consensusEngine: ConsensusEngine;
  private valuationHistory: ConsensusResult[] = [];
  private portfolio: Map<string, { asset: AssetData; consensus: ConsensusResult | null }> = new Map();
  private port: number;

  constructor(config: {
    consensusEngine: ConsensusEngine;
    port?: number;
  }) {
    this.consensusEngine = config.consensusEngine;
    this.port = config.port || 3457;
  }

  addValuation(consensus: ConsensusResult, asset: AssetData): void {
    this.valuationHistory.push(consensus);
    this.portfolio.set(consensus.assetId, { asset, consensus });
  }

  async start(): Promise<string> {
    return new Promise((resolve) => {
      this.server = http.createServer((req, res) => {
        if (req.url === '/api/data') {
          this.handleApiData(res);
        } else {
          this.handleDashboard(res);
        }
      });

      this.server.listen(this.port, () => {
        resolve(`http://localhost:${this.port}`);
      });
    });
  }

  stop(): void {
    this.server?.close();
  }

  private handleApiData(res: http.ServerResponse): void {
    const data = {
      agents: this.consensusEngine.getAgents().map(a => ({
        id: a.config.id,
        name: a.config.name,
        assetClasses: a.config.assetClasses,
      })),
      portfolio: Array.from(this.portfolio.entries()).map(([id, entry]) => ({
        id,
        name: entry.asset.name,
        assetClass: entry.asset.assetClass,
        value: entry.consensus?.consensusValue,
        confidence: entry.consensus?.avgConfidence,
        agentCount: entry.consensus?.valuations.length,
        lastUpdated: entry.consensus?.timestamp,
      })),
      recentValuations: this.valuationHistory.slice(-20).reverse(),
      stats: {
        totalAssets: this.portfolio.size,
        totalValue: Array.from(this.portfolio.values()).reduce(
          (sum, e) => sum + (e.consensus?.consensusValue || 0), 0
        ),
        totalValuations: this.valuationHistory.length,
        agentCount: this.consensusEngine.getAgents().length,
      },
    };

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  }

  private handleDashboard(res: http.ServerResponse): void {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(this.generateHTML());
  }

  private generateHTML(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>RWA Nexus Dashboard</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0a0a1a; color: #e0e0e0; }
    .header { background: linear-gradient(135deg, #1a1a3e 0%, #0d0d2b 100%); padding: 20px 30px; border-bottom: 1px solid #2a2a5a; }
    .header h1 { font-size: 24px; color: #f0b90b; }
    .header p { color: #888; margin-top: 4px; }
    .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; padding: 20px 30px; }
    .stat-card { background: #12122a; border: 1px solid #2a2a5a; border-radius: 12px; padding: 20px; }
    .stat-card .label { font-size: 12px; color: #888; text-transform: uppercase; letter-spacing: 1px; }
    .stat-card .value { font-size: 28px; font-weight: 700; color: #f0b90b; margin-top: 8px; }
    .content { padding: 0 30px 30px; }
    .section { margin-top: 24px; }
    .section h2 { font-size: 18px; margin-bottom: 12px; color: #ccc; }
    table { width: 100%; border-collapse: collapse; background: #12122a; border-radius: 8px; overflow: hidden; }
    th { background: #1a1a3e; color: #f0b90b; padding: 12px 16px; text-align: left; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px; }
    td { padding: 12px 16px; border-top: 1px solid #1a1a3e; }
    .confidence { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 12px; font-weight: 600; }
    .conf-high { background: #0d3b1d; color: #4ade80; }
    .conf-mid { background: #3b3b0d; color: #facc15; }
    .conf-low { background: #3b0d0d; color: #ef4444; }
    .agents { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
    .agent-card { background: #12122a; border: 1px solid #2a2a5a; border-radius: 8px; padding: 16px; }
    .agent-card h3 { color: #f0b90b; font-size: 14px; }
    .agent-card p { color: #888; font-size: 13px; margin-top: 4px; }
    .tag { display: inline-block; background: #1a1a3e; color: #f0b90b; padding: 2px 8px; border-radius: 4px; font-size: 11px; margin: 4px 4px 0 0; }
    .refresh { color: #888; font-size: 12px; text-align: right; margin-top: 8px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>RWA Nexus</h1>
    <p>AI-Powered Real World Asset Intelligence on BNB Chain</p>
  </div>
  <div class="stats" id="stats"></div>
  <div class="content">
    <div class="section">
      <h2>AI Valuation Agents</h2>
      <div class="agents" id="agents"></div>
    </div>
    <div class="section">
      <h2>Portfolio</h2>
      <table id="portfolio">
        <thead><tr><th>Asset</th><th>Class</th><th>Value (USD)</th><th>Confidence</th><th>Agents</th><th>Updated</th></tr></thead>
        <tbody></tbody>
      </table>
    </div>
    <div class="refresh" id="refresh"></div>
  </div>
  <script>
    async function refresh() {
      const res = await fetch('/api/data');
      const data = await res.json();
      document.getElementById('stats').innerHTML = [
        { label: 'Total Assets', value: data.stats.totalAssets },
        { label: 'Portfolio Value', value: '$' + data.stats.totalValue.toLocaleString() },
        { label: 'Valuations', value: data.stats.totalValuations },
        { label: 'AI Agents', value: data.stats.agentCount },
      ].map(s => '<div class="stat-card"><div class="label">' + s.label + '</div><div class="value">' + s.value + '</div></div>').join('');
      document.getElementById('agents').innerHTML = data.agents.map(a =>
        '<div class="agent-card"><h3>' + a.name + '</h3><p>' + a.id + '</p><div>' +
        a.assetClasses.map(c => '<span class="tag">' + c + '</span>').join('') + '</div></div>'
      ).join('');
      const tbody = document.querySelector('#portfolio tbody');
      tbody.innerHTML = data.portfolio.map(p => {
        const confClass = p.confidence > 0.8 ? 'conf-high' : p.confidence > 0.6 ? 'conf-mid' : 'conf-low';
        return '<tr><td>' + p.name + '</td><td>' + p.assetClass + '</td><td>$' +
          (p.value || 0).toLocaleString() + '</td><td><span class="confidence ' + confClass + '">' +
          ((p.confidence || 0) * 100).toFixed(1) + '%</span></td><td>' +
          (p.agentCount || 0) + '</td><td>' +
          (p.lastUpdated ? new Date(p.lastUpdated).toLocaleString() : '-') + '</td></tr>';
      }).join('') || '<tr><td colspan="6" style="text-align:center;color:#666">No assets yet. Use MCP tools or API to add assets.</td></tr>';
      document.getElementById('refresh').textContent = 'Last refreshed: ' + new Date().toLocaleString();
    }
    refresh();
    setInterval(refresh, 5000);
  </script>
</body>
</html>`;
  }
}
