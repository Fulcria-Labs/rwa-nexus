/**
 * Core types for RWA Nexus
 */

export enum AssetClass {
  REAL_ESTATE = 'real_estate',
  COMMODITY = 'commodity',
  TREASURY = 'treasury',
  EQUITY = 'equity',
  RECEIVABLE = 'receivable',
}

export interface AssetData {
  id: string;
  assetClass: AssetClass;
  name: string;
  description: string;
  location?: string;
  metadata: Record<string, unknown>;
}

export interface ValuationResult {
  assetId: string;
  value: number;          // USD value
  confidence: number;     // 0-1 scale
  methodology: string;
  dataPoints: DataPoint[];
  timestamp: Date;
  agentId: string;
}

export interface DataPoint {
  source: string;
  metric: string;
  value: number | string;
  timestamp: Date;
  weight: number;
}

export interface ConsensusResult {
  assetId: string;
  consensusValue: number;
  avgConfidence: number;
  valuations: ValuationResult[];
  methodology: string;
  timestamp: Date;
}

export interface AgentConfig {
  id: string;
  name: string;
  assetClasses: AssetClass[];
  description: string;
}

export interface OracleSubmission {
  assetId: string;
  value: bigint;         // 18 decimal USD
  confidence: number;    // 0-10000 basis points
  methodology: string;
}

export interface PortfolioAsset {
  tokenId: number;
  assetData: AssetData;
  currentValuation: ConsensusResult | null;
  tokenSupply: number;
  oracleAssetId: string;
}

export interface LendingPosition {
  loanId: number;
  tokenId: number;
  collateralAmount: number;
  loanAmount: bigint;
  interestRate: number;
  startTime: Date;
  active: boolean;
}

export type ValuationAgent = {
  config: AgentConfig;
  valuate(asset: AssetData): Promise<ValuationResult>;
};
