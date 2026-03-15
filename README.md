# RWA Nexus

[![CI](https://github.com/Fulcria-Labs/rwa-nexus/actions/workflows/ci.yml/badge.svg)](https://github.com/Fulcria-Labs/rwa-nexus/actions/workflows/ci.yml)

**AI-Powered Real World Asset Intelligence Platform for BNB Chain**

RWA Nexus brings AI-driven asset valuation on-chain. Multiple specialized AI agents analyze real-world assets — real estate, commodities, and fixed-income securities — then reach consensus and submit attested valuations to BNB Chain smart contracts. DeFi protocols can use these valuations for RWA-backed lending, collateralization, and portfolio management.

## Why RWA Nexus?

Tokenizing real-world assets is one of Web3's biggest opportunities, but a critical gap exists: **reliable, transparent, on-chain pricing**. Traditional appraisals are slow, expensive, and opaque. RWA Nexus solves this with:

- **Multi-Agent Valuation** — Specialized AI agents use distinct methodologies per asset class
- **Confidence-Weighted Consensus** — Higher-confidence valuations carry more weight; outliers are automatically filtered
- **On-Chain Oracle** — Consensus valuations are submitted to BNB Chain smart contracts, fully auditable
- **AI-Powered LTV** — Lending terms dynamically adjust based on oracle confidence scores
- **Portfolio Risk Analytics** — Diversification scoring, concentration analysis (HHI), stress testing across 5 scenarios, and confidence analysis
- **Liquidation Engine** — Automated undercollateralized loan liquidation with oracle price feeds
- **MCP Integration** — Any AI system can interact with RWA Nexus via 6 MCP tools

## Demo

```bash
# Run the multi-agent valuation pipeline demo
npm run demo
```

The demo initializes all 3 AI agents, valuates a diversified portfolio (Manhattan penthouse, Hong Kong commercial space, gold reserves, crude oil, treasuries, corporate bonds), and displays consensus values with confidence scores.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     RWA Nexus                           │
│                                                         │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐   │
│  │  Property     │ │  Commodity   │ │  Treasury    │   │
│  │  Agent        │ │  Agent       │ │  Agent       │   │
│  │              │ │              │ │              │   │
│  │ Comparable   │ │ Spot prices  │ │ Yield curve  │   │
│  │ sales + DCF  │ │ + seasonal   │ │ + credit     │   │
│  │ + condition  │ │ + volatility │ │ + duration   │   │
│  └──────┬───────┘ └──────┬───────┘ └──────┬───────┘   │
│         └────────────────┼────────────────┘            │
│                          ▼                              │
│  ┌─────────────────────────────────────────────────┐   │
│  │            Consensus Engine                      │   │
│  │  Confidence-weighted avg + outlier detection     │   │
│  └─────────────────────┬───────────────────────────┘   │
│                        ▼                                │
│  ┌─────────────────────────────────────────────────┐   │
│  │            BNB Chain (BSC)                       │   │
│  │                                                   │   │
│  │  RWAOracle     │  RWAToken     │  RWALending     │   │
│  │  AI-attested   │  ERC-1155     │  Collateralized │   │
│  │  price feed    │  asset tokens │  RWA lending    │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │  MCP Server (6 tools) │ Web Dashboard (port 3457)│   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

## AI Valuation Agents

| Agent | Asset Class | Methodology |
|-------|-------------|-------------|
| **PropertyAgent** | Real Estate | Blended comparable sales (60%) + income capitalization (40%), adjusted for condition and age depreciation. Covers 11 major markets. |
| **CommodityAgent** | Commodities | Spot price analysis with seasonal adjustments, quality grading, and storage cost deductions. Supports 12 commodities. Confidence inversely correlated with volatility. |
| **TreasuryAgent** | Fixed Income | DCF using interpolated yield curves (4 curve types), credit spread adjustment (7 rating levels), and PV of coupon/principal. |

## Smart Contracts

| Contract | Purpose |
|----------|---------|
| **RWAToken** | ERC-1155 multi-token for tokenized RWAs. Create assets with metadata, set oracle addresses, update valuations. |
| **RWAOracle** | On-chain oracle for AI-attested valuations. Authorized agents submit valuations; consensus computed via confidence-weighted averaging. |
| **RWALending** | Collateralized lending against RWA tokens. LTV ratios dynamically adjust based on oracle confidence (50% base → 70% for high-confidence). Includes automated liquidation for undercollateralized positions. |

## Quick Start

```bash
# Install
npm install

# Run tests (2113 passing)
npm test

# Compile smart contracts
npm run compile

# Run demo
npm run demo
```

## MCP Tools

| Tool | Description |
|------|-------------|
| `valuate_asset` | Run AI agents to valuate a real-world asset |
| `get_price` | Get current consensus price for a portfolio asset |
| `submit_onchain` | Submit consensus valuation to BNB Chain oracle |
| `list_agents` | List all registered AI valuation agents |
| `portfolio_summary` | Get portfolio overview with all valuations |
| `risk_analysis` | Portfolio risk analysis: diversification, HHI, stress tests, confidence |

## Technical Stack

- **TypeScript** / Node.js
- **Solidity** 0.8.24 / Hardhat / OpenZeppelin
- **ethers.js** v6 for BNB Chain interaction
- **MCP SDK** for AI system integration
- **2113 tests** across 66 test suites

## Deployment

```bash
# Set deployer key
export DEPLOYER_PRIVATE_KEY=your_key_here

# Deploy to BSC Testnet
npm run deploy:testnet

# Deploy to BSC Mainnet
npm run deploy:bsc
```

## RWA Demo Day Submission

Built for the [RWA Demo Day](https://rwa-demo-day.devpost.com/) pitching competition, anchored by Hong Kong Web3 Festival 2026.

**Tracks**: Real World Asset tokenization and DeFi on BNB Chain

## License

MIT
