# RWA Demo Day - Google Form Answers (Copy-Paste Ready)

**Form URL:** https://forms.gle/t87uDXQFspa8tyq36
**Prize:** $10,000 + $100,000 incubation program
**Deadline:** March 31, 2026
**Note:** Only 4 registrants — excellent odds!

---

## Project Name
RWA Nexus

## Team Name
Fulcria Labs

## Contact Email
agent@fulcria.com

## Project Description (short)
AI-powered real-world asset intelligence platform for BNB Chain — multi-agent valuation, consensus oracle, and DeFi lending.

## Project Description (detailed)
RWA Nexus brings institutional-grade asset valuation to DeFi through AI. Five specialized agents (Property, Commodity, Treasury, Equity, Receivables) independently analyze real-world assets using distinct methodologies. A confidence-weighted consensus engine with outlier detection produces reliable on-chain price feeds via an ERC-1155 oracle contract.

The platform enables:
- **Multi-Agent Valuation** — Five AI agents analyze assets through comparable sales, spot pricing, yield curves, P/E/DCF models, and invoice factoring analysis
- **Consensus Oracle** — Confidence-weighted consensus with automatic outlier filtering for reliable on-chain pricing
- **RWA Tokenization** — ERC-1155 tokens representing fractional ownership of real-world assets (real estate, commodities, fixed income, equities, receivables)
- **AI-Adjusted Lending** — Collateralized lending where LTV ratios dynamically adjust based on oracle confidence scores
- **Explainable Valuations** — Detailed methodology breakdowns showing exactly how each agent reached its valuation
- **MCP Integration** — 10 standardized tools allowing any AI system to interact with the platform
- **Risk Analytics** — Monte Carlo VaR/CVaR simulation, portfolio stress testing, and agent reputation tracking
- **Compliance Engine** — Full KYC/AML lifecycle, transfer validation, holding periods, jurisdiction restrictions

Built with TypeScript, Solidity 0.8.24, Hardhat, and OpenZeppelin on BNB Chain. 2,396 tests across 73 suites.

## How BNB Chain is Used
- **RWAToken.sol** — ERC-1155 contract for tokenizing real-world assets with metadata URIs
- **RWAOracle.sol** — On-chain oracle storing AI consensus valuations with confidence scores and timestamps
- **RWALending.sol** — Collateralized lending protocol using oracle prices for AI-adjusted LTV ratios
- Designed for BNB Chain BSC testnet/mainnet deployment

## What Makes This Unique
1. **Multi-agent consensus** — Not just one AI opinion, but four independent valuations with statistical consensus
2. **Confidence-weighted pricing** — Oracle reports not just price but confidence level, enabling smarter DeFi protocols
3. **Explainable AI** — Full methodology breakdowns showing data sources, agent contributions, and agreement analysis
4. **Dynamic risk adjustment** — Lending LTV ratios automatically tighten when oracle confidence is lower
5. **MCP-native** — Any AI system can plug in and use the 10-tool valuation infrastructure

## Tech Stack
- TypeScript / Node.js (agents, consensus engine, MCP server)
- Solidity 0.8.24 (smart contracts)
- Hardhat + OpenZeppelin + ethers.js v6
- BNB Chain (BSC)
- Model Context Protocol (MCP)
- Web Dashboard (real-time monitoring)

## GitHub Repository
https://github.com/Fulcria-Labs/rwa-nexus

## Demo
Demo recording included in repository.

## Team Background
Solo developer with experience in DeFi, AI agent systems, and blockchain security. CVE-2026-3515 credited researcher. Multiple open-source contributions to AI/blockchain ecosystem projects.

---
*Last updated: 2026-03-16*
