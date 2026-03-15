/**
 * Regulatory reporting helpers for RWA compliance officers.
 *
 * Generates:
 *  - Period-based compliance reports (transaction summaries, KYC breakdown, AML flags)
 *  - Holder concentration reports
 *  - Jurisdiction distribution reports
 *  - Suspicious activity summaries
 *  - Audit trail exports
 */

import { KYCManager } from './kyc-manager';
import { HoldingPeriodManager } from './holding-period';
import { ListManager } from './list-manager';
import { TransferValidator } from './transfer-validator';
import {
  AMLRiskLevel,
  ComplianceEvent,
  ComplianceEventType,
  ComplianceReport,
  InvestorType,
  Jurisdiction,
  KYCStatus,
} from './types';

export interface HolderConcentrationReport {
  tokenId: string;
  generatedAt: Date;
  totalHolders: number;
  top5Holders: { holderId: string; amount: number; percentage: number }[];
  herfindahlIndex: number;
  giniCoefficient: number;
}

export interface JurisdictionReport {
  generatedAt: Date;
  totalHolders: number;
  jurisdictionBreakdown: { jurisdiction: Jurisdiction; count: number; percentage: number }[];
  blockedJurisdictionAttempts: number;
}

export interface SuspiciousActivityReport {
  generatedAt: Date;
  periodStart: Date;
  periodEnd: Date;
  highRiskHolders: { holderId: string; riskLevel: AMLRiskLevel; flags: string[] }[];
  blockedTransfers: number;
  holdingPeriodViolations: number;
  volumeLimitExceeded: number;
  sanctionsHits: number;
  pepFlags: number;
}

export interface AuditEntry {
  timestamp: Date;
  source: string;
  eventType: ComplianceEventType;
  tokenId: string;
  actor: string;
  details: Record<string, unknown>;
}

export class ComplianceReporter {
  private kyc: KYCManager;
  private holdings: HoldingPeriodManager;
  private lists: ListManager;
  private validator: TransferValidator;

  constructor(
    kyc: KYCManager,
    holdings: HoldingPeriodManager,
    lists: ListManager,
    validator: TransferValidator
  ) {
    this.kyc = kyc;
    this.holdings = holdings;
    this.lists = lists;
    this.validator = validator;
  }

  // ── Compliance Report ─────────────────────────────────────────

  /**
   * Generate a comprehensive compliance report for a token over a time period.
   */
  generateComplianceReport(
    tokenId: string,
    periodStart: Date,
    periodEnd: Date
  ): ComplianceReport {
    const allEvents = this.getAllEvents();
    const periodEvents = allEvents.filter(
      e =>
        e.tokenId === tokenId &&
        e.timestamp >= periodStart &&
        e.timestamp <= periodEnd
    );

    const transferApproved = periodEvents.filter(
      e => e.eventType === ComplianceEventType.TRANSFER_APPROVED
    ).length;
    const transferBlocked = periodEvents.filter(
      e => e.eventType === ComplianceEventType.TRANSFER_BLOCKED
    ).length;
    const amlFlags = periodEvents.filter(
      e => e.eventType === ComplianceEventType.AML_FLAG
    ).length;
    const sanctionsHits = periodEvents.filter(
      e => e.eventType === ComplianceEventType.SANCTIONS_HIT
    ).length;
    const holdingViolations = periodEvents.filter(
      e => e.eventType === ComplianceEventType.HOLDING_PERIOD_VIOLATION
    ).length;

    const records = this.kyc.getAllRecords();

    // KYC breakdown
    const kycBreakdown = {} as Record<KYCStatus, number>;
    for (const status of Object.values(KYCStatus)) {
      kycBreakdown[status] = records.filter(r => r.status === status).length;
    }

    // Jurisdiction breakdown
    const jurisdictionBreakdown: Record<string, number> = {};
    for (const record of records) {
      jurisdictionBreakdown[record.jurisdiction] =
        (jurisdictionBreakdown[record.jurisdiction] || 0) + 1;
    }

    // Investor type breakdown
    const investorTypeBreakdown: Record<string, number> = {};
    for (const record of records) {
      investorTypeBreakdown[record.investorType] =
        (investorTypeBreakdown[record.investorType] || 0) + 1;
    }

    return {
      generatedAt: new Date(),
      periodStart,
      periodEnd,
      tokenId,
      totalTransfers: transferApproved + transferBlocked,
      approvedTransfers: transferApproved,
      blockedTransfers: transferBlocked,
      uniqueHolders: this.holdings.getUniqueHolderCount(tokenId),
      kycBreakdown,
      jurisdictionBreakdown,
      investorTypeBreakdown,
      amlFlags,
      sanctionsHits,
      holdingPeriodViolations: holdingViolations,
      events: periodEvents,
    };
  }

  // ── Holder Concentration ──────────────────────────────────────

  /**
   * Generate a holder concentration report for a token.
   * Useful for identifying whale risk and Reg D 99-holder limits.
   */
  generateHolderConcentrationReport(
    tokenId: string,
    holderAmounts: Map<string, number>
  ): HolderConcentrationReport {
    const entries = Array.from(holderAmounts.entries())
      .map(([holderId, amount]) => ({ holderId, amount }))
      .sort((a, b) => b.amount - a.amount);

    const totalSupply = entries.reduce((sum, e) => sum + e.amount, 0);

    const top5 = entries.slice(0, 5).map(e => ({
      holderId: e.holderId,
      amount: e.amount,
      percentage: totalSupply > 0 ? Math.round((e.amount / totalSupply) * 10000) / 100 : 0,
    }));

    // Herfindahl-Hirschman Index
    let hhi = 0;
    if (totalSupply > 0) {
      for (const e of entries) {
        const share = e.amount / totalSupply;
        hhi += share * share;
      }
    }
    hhi = Math.round(hhi * 10000);

    // Gini coefficient
    const gini = this.computeGini(entries.map(e => e.amount));

    return {
      tokenId,
      generatedAt: new Date(),
      totalHolders: entries.length,
      top5Holders: top5,
      herfindahlIndex: hhi,
      giniCoefficient: gini,
    };
  }

  // ── Jurisdiction Report ───────────────────────────────────────

  /**
   * Generate a jurisdiction distribution report for all registered holders.
   */
  generateJurisdictionReport(): JurisdictionReport {
    const records = this.kyc.getAllRecords();
    const counts: Record<string, number> = {};

    for (const record of records) {
      counts[record.jurisdiction] = (counts[record.jurisdiction] || 0) + 1;
    }

    const total = records.length;
    const breakdown = Object.entries(counts)
      .map(([jurisdiction, count]) => ({
        jurisdiction: jurisdiction as Jurisdiction,
        count,
        percentage: total > 0 ? Math.round((count / total) * 10000) / 100 : 0,
      }))
      .sort((a, b) => b.count - a.count);

    // Count blocked jurisdiction attempts from events
    const allEvents = this.getAllEvents();
    const blockedAttempts = allEvents.filter(e => {
      if (e.eventType !== ComplianceEventType.TRANSFER_BLOCKED) return false;
      const violations = (e.details?.violations as string[]) || [];
      return violations.some(v => v.includes('Jurisdiction'));
    }).length;

    return {
      generatedAt: new Date(),
      totalHolders: total,
      jurisdictionBreakdown: breakdown,
      blockedJurisdictionAttempts: blockedAttempts,
    };
  }

  // ── Suspicious Activity ───────────────────────────────────────

  /**
   * Generate a suspicious activity report for a time period.
   * Highlights high-risk holders, blocked transfers, and compliance flags.
   */
  generateSuspiciousActivityReport(
    periodStart: Date,
    periodEnd: Date
  ): SuspiciousActivityReport {
    const allEvents = this.getAllEvents();
    const periodEvents = allEvents.filter(
      e => e.timestamp >= periodStart && e.timestamp <= periodEnd
    );

    // Find high-risk holders
    const records = this.kyc.getAllRecords();
    const highRiskHolders = records
      .filter(r => r.amlRiskLevel === AMLRiskLevel.HIGH || r.amlRiskLevel === AMLRiskLevel.PROHIBITED)
      .map(r => {
        const flags: string[] = [];
        if (r.amlRiskLevel === AMLRiskLevel.PROHIBITED) flags.push('AML_PROHIBITED');
        if (r.amlRiskLevel === AMLRiskLevel.HIGH) flags.push('AML_HIGH_RISK');
        if (!r.pepScreenPassed) flags.push('PEP_FLAG');
        if (!r.sanctionsScreenPassed) flags.push('SANCTIONS_FLAG');
        return {
          holderId: r.holderId,
          riskLevel: r.amlRiskLevel,
          flags,
        };
      });

    return {
      generatedAt: new Date(),
      periodStart,
      periodEnd,
      highRiskHolders,
      blockedTransfers: periodEvents.filter(
        e => e.eventType === ComplianceEventType.TRANSFER_BLOCKED
      ).length,
      holdingPeriodViolations: periodEvents.filter(
        e => e.eventType === ComplianceEventType.HOLDING_PERIOD_VIOLATION
      ).length,
      volumeLimitExceeded: periodEvents.filter(
        e => e.eventType === ComplianceEventType.VOLUME_LIMIT_EXCEEDED
      ).length,
      sanctionsHits: periodEvents.filter(
        e => e.eventType === ComplianceEventType.SANCTIONS_HIT
      ).length,
      pepFlags: periodEvents.filter(
        e =>
          e.eventType === ComplianceEventType.AML_FLAG &&
          (e.details?.reason === 'pep_screen_failed')
      ).length,
    };
  }

  // ── Audit Trail ───────────────────────────────────────────────

  /**
   * Export the full audit trail across all compliance subsystems.
   */
  exportAuditTrail(
    periodStart?: Date,
    periodEnd?: Date
  ): AuditEntry[] {
    const allEvents = this.getAllEvents();

    let filtered = allEvents;
    if (periodStart) {
      filtered = filtered.filter(e => e.timestamp >= periodStart);
    }
    if (periodEnd) {
      filtered = filtered.filter(e => e.timestamp <= periodEnd);
    }

    return filtered
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
      .map(e => ({
        timestamp: e.timestamp,
        source: e.id.split('-')[0],
        eventType: e.eventType,
        tokenId: e.tokenId,
        actor: e.walletAddress || e.holderId || '',
        details: e.details,
      }));
  }

  // ── Helpers ───────────────────────────────────────────────────

  private getAllEvents(): ComplianceEvent[] {
    return [
      ...this.kyc.getEvents(),
      ...this.holdings.getEvents(),
      ...this.lists.getEvents(),
      ...this.validator.getEvents(),
    ];
  }

  /**
   * Compute Gini coefficient for a set of amounts.
   * 0 = perfect equality, 1 = maximum inequality.
   */
  private computeGini(amounts: number[]): number {
    if (amounts.length <= 1) return 0;

    const sorted = [...amounts].sort((a, b) => a - b);
    const n = sorted.length;
    const sum = sorted.reduce((s, v) => s + v, 0);

    if (sum === 0) return 0;

    let numerator = 0;
    for (let i = 0; i < n; i++) {
      numerator += (2 * (i + 1) - n - 1) * sorted[i];
    }

    const gini = numerator / (n * sum);
    return Math.round(gini * 10000) / 10000;
  }
}
