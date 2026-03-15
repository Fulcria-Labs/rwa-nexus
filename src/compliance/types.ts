/**
 * Compliance types for RWA token transfer restrictions,
 * KYC/AML verification, and regulatory reporting.
 */

// ────────────────────────────────────────────────────────────────
// Jurisdictions & Regulatory Frameworks
// ────────────────────────────────────────────────────────────────

export enum Jurisdiction {
  US = 'US',
  EU = 'EU',
  UK = 'UK',
  SG = 'SG',       // Singapore
  HK = 'HK',       // Hong Kong
  JP = 'JP',        // Japan
  CH = 'CH',        // Switzerland
  AE = 'AE',        // UAE / DIFC
  KY = 'KY',        // Cayman Islands
  UNKNOWN = 'UNKNOWN',
}

export enum RegulatoryFramework {
  SEC_REG_D = 'SEC_REG_D',               // US - Reg D 506(b)/506(c)
  SEC_REG_S = 'SEC_REG_S',               // US - Reg S (offshore)
  SEC_REG_A_PLUS = 'SEC_REG_A_PLUS',     // US - Reg A+ (mini-IPO)
  SEC_RULE_144 = 'SEC_RULE_144',         // US - Rule 144 resale
  EU_MIFID_II = 'EU_MIFID_II',          // EU - MiFID II
  EU_MICA = 'EU_MICA',                   // EU - Markets in Crypto-Assets
  UK_FCA = 'UK_FCA',                     // UK - FCA regulated
  SG_MAS = 'SG_MAS',                     // Singapore - MAS
  HK_SFC = 'HK_SFC',                    // Hong Kong - SFC
  JP_FSA = 'JP_FSA',                     // Japan - FSA
  CH_FINMA = 'CH_FINMA',                // Switzerland - FINMA
  NONE = 'NONE',
}

// ────────────────────────────────────────────────────────────────
// KYC / AML
// ────────────────────────────────────────────────────────────────

export enum KYCStatus {
  NONE = 'NONE',
  PENDING = 'PENDING',
  BASIC = 'BASIC',           // Name + ID verified
  ENHANCED = 'ENHANCED',     // Full due diligence (source of funds, PEP screen)
  EXPIRED = 'EXPIRED',
  REJECTED = 'REJECTED',
}

export enum AMLRiskLevel {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  PROHIBITED = 'PROHIBITED',
}

export enum InvestorType {
  RETAIL = 'RETAIL',
  ACCREDITED = 'ACCREDITED',        // US accredited investor (SEC Rule 501)
  QUALIFIED_PURCHASER = 'QUALIFIED_PURCHASER',  // US $5M+
  PROFESSIONAL = 'PROFESSIONAL',    // EU MiFID II professional client
  INSTITUTIONAL = 'INSTITUTIONAL',
}

export interface KYCRecord {
  holderId: string;
  walletAddress: string;
  status: KYCStatus;
  investorType: InvestorType;
  jurisdiction: Jurisdiction;
  amlRiskLevel: AMLRiskLevel;
  verifiedAt: Date | null;
  expiresAt: Date | null;
  documents: string[];           // document reference IDs
  pepScreenPassed: boolean;      // Politically Exposed Person check
  sanctionsScreenPassed: boolean;
  lastUpdated: Date;
}

// ────────────────────────────────────────────────────────────────
// Transfer Restrictions
// ────────────────────────────────────────────────────────────────

export enum TransferRestrictionType {
  JURISDICTION_BLOCK = 'JURISDICTION_BLOCK',
  KYC_REQUIRED = 'KYC_REQUIRED',
  ACCREDITED_ONLY = 'ACCREDITED_ONLY',
  HOLDING_PERIOD = 'HOLDING_PERIOD',
  MAX_HOLDER_COUNT = 'MAX_HOLDER_COUNT',
  BLACKLISTED = 'BLACKLISTED',
  WHITELIST_ONLY = 'WHITELIST_ONLY',
  VOLUME_LIMIT = 'VOLUME_LIMIT',
}

export interface TransferRestriction {
  type: TransferRestrictionType;
  description: string;
  parameters: Record<string, unknown>;
}

export interface TransferRequest {
  tokenId: string;
  from: string;           // wallet address
  to: string;             // wallet address
  amount: number;
  requestedAt: Date;
}

export interface TransferResult {
  allowed: boolean;
  request: TransferRequest;
  violations: TransferViolation[];
  checkedAt: Date;
}

export interface TransferViolation {
  restriction: TransferRestrictionType;
  message: string;
  severity: 'BLOCK' | 'WARNING';
}

// ────────────────────────────────────────────────────────────────
// Holding Periods
// ────────────────────────────────────────────────────────────────

export interface HoldingPeriodRule {
  tokenId: string;
  framework: RegulatoryFramework;
  holdingDays: number;                // minimum holding period in days
  affiliateHoldingDays: number;       // extended holding for affiliates/insiders
  dripFeedMaxPercent: number;         // max % of volume that can be sold per period (Rule 144)
  dripFeedPeriodDays: number;         // the period over which volume limits apply
}

export interface HoldingRecord {
  holderId: string;
  tokenId: string;
  acquiredAt: Date;
  amount: number;
  isAffiliate: boolean;
  source: 'PRIMARY' | 'SECONDARY' | 'AIRDROP';
}

// ────────────────────────────────────────────────────────────────
// Whitelist / Blacklist
// ────────────────────────────────────────────────────────────────

export interface ListEntry {
  walletAddress: string;
  addedAt: Date;
  addedBy: string;          // admin/compliance officer ID
  reason: string;
  expiresAt: Date | null;   // null = permanent
}

// ────────────────────────────────────────────────────────────────
// Regulatory Reporting
// ────────────────────────────────────────────────────────────────

export interface ComplianceEvent {
  id: string;
  eventType: ComplianceEventType;
  timestamp: Date;
  tokenId: string;
  details: Record<string, unknown>;
  holderId?: string;
  walletAddress?: string;
}

export enum ComplianceEventType {
  KYC_APPROVED = 'KYC_APPROVED',
  KYC_REJECTED = 'KYC_REJECTED',
  KYC_EXPIRED = 'KYC_EXPIRED',
  TRANSFER_BLOCKED = 'TRANSFER_BLOCKED',
  TRANSFER_APPROVED = 'TRANSFER_APPROVED',
  BLACKLIST_ADD = 'BLACKLIST_ADD',
  BLACKLIST_REMOVE = 'BLACKLIST_REMOVE',
  WHITELIST_ADD = 'WHITELIST_ADD',
  WHITELIST_REMOVE = 'WHITELIST_REMOVE',
  HOLDING_PERIOD_VIOLATION = 'HOLDING_PERIOD_VIOLATION',
  VOLUME_LIMIT_EXCEEDED = 'VOLUME_LIMIT_EXCEEDED',
  AML_FLAG = 'AML_FLAG',
  SANCTIONS_HIT = 'SANCTIONS_HIT',
}

export interface ComplianceReport {
  generatedAt: Date;
  periodStart: Date;
  periodEnd: Date;
  tokenId: string;
  totalTransfers: number;
  blockedTransfers: number;
  approvedTransfers: number;
  uniqueHolders: number;
  kycBreakdown: Record<KYCStatus, number>;
  jurisdictionBreakdown: Record<string, number>;
  investorTypeBreakdown: Record<string, number>;
  amlFlags: number;
  sanctionsHits: number;
  holdingPeriodViolations: number;
  events: ComplianceEvent[];
}

export interface TokenComplianceConfig {
  tokenId: string;
  name: string;
  framework: RegulatoryFramework;
  allowedJurisdictions: Jurisdiction[];
  blockedJurisdictions: Jurisdiction[];
  requiredKYCLevel: KYCStatus;
  requiredInvestorTypes: InvestorType[];
  maxHolders: number;            // 0 = unlimited
  useWhitelist: boolean;         // if true, only whitelisted addresses can receive
  holdingPeriod: HoldingPeriodRule | null;
  volumeLimitPercentPerDay: number;  // 0 = unlimited
}
