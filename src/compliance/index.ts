/**
 * Compliance Engine for RWA Nexus
 *
 * Provides a complete regulatory compliance layer for tokenized real-world assets:
 *
 *  - **KYCManager** — KYC/AML verification lifecycle (registration, approval, expiry, renewal)
 *  - **TransferValidator** — Jurisdiction restrictions, investor-type gates, holding periods, whitelist/blacklist
 *  - **HoldingPeriodManager** — Rule 144, lock-up periods, FIFO transfer eligibility, drip-feed limits
 *  - **ListManager** — Global blacklist + per-token whitelists with expiry and audit trail
 *  - **ComplianceReporter** — Period reports, holder concentration, jurisdiction distribution, SAR generation
 */

export * from './types';
export { KYCManager } from './kyc-manager';
export { TransferValidator, FRAMEWORK_DEFAULTS } from './transfer-validator';
export { HoldingPeriodManager, STANDARD_HOLDING_RULES } from './holding-period';
export { ListManager } from './list-manager';
export {
  ComplianceReporter,
  HolderConcentrationReport,
  JurisdictionReport,
  SuspiciousActivityReport,
  AuditEntry,
} from './reporting';
