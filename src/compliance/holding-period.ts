/**
 * Holding period enforcement for RWA tokens.
 *
 * Implements:
 *  - SEC Rule 144 restricted securities holding periods (6 months non-affiliate, 12 months affiliate)
 *  - Generic lock-up periods for any regulatory framework
 *  - Volume-based drip-feed selling limits (Rule 144 volume conditions)
 *  - Per-holder, per-token acquisition tracking
 */

import {
  ComplianceEvent,
  ComplianceEventType,
  HoldingPeriodRule,
  HoldingRecord,
  RegulatoryFramework,
} from './types';

/**
 * Predefined holding-period rules for common regulatory frameworks.
 */
export const STANDARD_HOLDING_RULES: Record<string, HoldingPeriodRule> = {
  // SEC Rule 144: 6-month hold for reporting issuers, 1-year for non-reporting
  RULE_144_REPORTING: {
    tokenId: '',
    framework: RegulatoryFramework.SEC_RULE_144,
    holdingDays: 180,
    affiliateHoldingDays: 365,
    dripFeedMaxPercent: 1,       // 1% of outstanding shares per 90 days
    dripFeedPeriodDays: 90,
  },
  RULE_144_NON_REPORTING: {
    tokenId: '',
    framework: RegulatoryFramework.SEC_RULE_144,
    holdingDays: 365,
    affiliateHoldingDays: 365,
    dripFeedMaxPercent: 1,
    dripFeedPeriodDays: 90,
  },
  // EU MiFID II: typically no mandatory holding, but lock-up common at issuance
  MIFID_II_LOCKUP: {
    tokenId: '',
    framework: RegulatoryFramework.EU_MIFID_II,
    holdingDays: 90,
    affiliateHoldingDays: 180,
    dripFeedMaxPercent: 0,       // no volume limit
    dripFeedPeriodDays: 0,
  },
  // Generic 12-month lockup (common in private placements)
  PRIVATE_PLACEMENT_LOCKUP: {
    tokenId: '',
    framework: RegulatoryFramework.SEC_REG_D,
    holdingDays: 365,
    affiliateHoldingDays: 365,
    dripFeedMaxPercent: 0,
    dripFeedPeriodDays: 0,
  },
};

export class HoldingPeriodManager {
  private rules: Map<string, HoldingPeriodRule> = new Map();     // tokenId -> rule
  private holdings: Map<string, HoldingRecord[]> = new Map();    // `${holderId}:${tokenId}` -> records
  private eventLog: ComplianceEvent[] = [];

  // ── Rule Configuration ────────────────────────────────────────

  /**
   * Register a holding-period rule for a token.
   */
  registerRule(rule: HoldingPeriodRule): void {
    this.rules.set(rule.tokenId, { ...rule });
  }

  /**
   * Register a standard rule template for a specific token.
   */
  registerStandardRule(tokenId: string, templateKey: string): void {
    const template = STANDARD_HOLDING_RULES[templateKey];
    if (!template) {
      throw new Error(`Unknown standard rule template: ${templateKey}`);
    }
    this.rules.set(tokenId, { ...template, tokenId });
  }

  getRule(tokenId: string): HoldingPeriodRule | undefined {
    const rule = this.rules.get(tokenId);
    return rule ? { ...rule } : undefined;
  }

  // ── Holdings Tracking ─────────────────────────────────────────

  /**
   * Record a token acquisition (e.g., primary issuance, secondary purchase).
   */
  recordAcquisition(record: HoldingRecord): void {
    const key = `${record.holderId}:${record.tokenId}`;
    const list = this.holdings.get(key) || [];
    list.push({ ...record });
    this.holdings.set(key, list);
  }

  /**
   * Get all holding records for a specific holder + token.
   */
  getHolderRecords(holderId: string, tokenId: string): HoldingRecord[] {
    const key = `${holderId}:${tokenId}`;
    return (this.holdings.get(key) || []).map(r => ({ ...r }));
  }

  /**
   * Total amount held by a holder for a specific token.
   */
  getTotalHoldings(holderId: string, tokenId: string): number {
    const key = `${holderId}:${tokenId}`;
    const records = this.holdings.get(key) || [];
    return records.reduce((sum, r) => sum + r.amount, 0);
  }

  /**
   * Number of unique holders for a token.
   */
  getUniqueHolderCount(tokenId: string): number {
    const holders = new Set<string>();
    for (const [key] of this.holdings) {
      if (key.endsWith(`:${tokenId}`)) {
        const holderId = key.split(':')[0];
        holders.add(holderId);
      }
    }
    return holders.size;
  }

  // ── Transfer Eligibility ──────────────────────────────────────

  /**
   * Check whether a holder can transfer a given amount of tokens.
   *
   * Uses FIFO: oldest acquisitions are checked first. The transfer is
   * allowed only if enough tokens have cleared their holding period.
   */
  canTransfer(
    holderId: string,
    tokenId: string,
    amount: number,
    asOf: Date = new Date()
  ): { allowed: boolean; reason: string; transferableAmount: number } {
    const rule = this.rules.get(tokenId);
    if (!rule) {
      // No holding-period rule means no restriction
      return { allowed: true, reason: 'No holding period rule', transferableAmount: amount };
    }

    const records = this.getHolderRecords(holderId, tokenId);
    if (records.length === 0) {
      return { allowed: false, reason: `No holdings found for ${holderId} on token ${tokenId}`, transferableAmount: 0 };
    }

    // Sort FIFO (oldest first)
    records.sort((a, b) => a.acquiredAt.getTime() - b.acquiredAt.getTime());

    let transferable = 0;
    const asOfMs = asOf.getTime();

    for (const record of records) {
      const holdingDays = record.isAffiliate ? rule.affiliateHoldingDays : rule.holdingDays;
      const holdingMs = holdingDays * 24 * 60 * 60 * 1000;
      const clearDate = new Date(record.acquiredAt.getTime() + holdingMs);

      if (asOfMs >= clearDate.getTime()) {
        transferable += record.amount;
      }
    }

    // Apply drip-feed volume limit if configured
    if (rule.dripFeedMaxPercent > 0 && rule.dripFeedPeriodDays > 0) {
      const totalHoldings = this.getTotalHoldings(holderId, tokenId);
      const maxDripFeed = totalHoldings * (rule.dripFeedMaxPercent / 100);
      if (transferable > maxDripFeed) {
        transferable = maxDripFeed;
      }
    }

    if (transferable >= amount) {
      return {
        allowed: true,
        reason: `${transferable} tokens transferable (holding period cleared)`,
        transferableAmount: transferable,
      };
    }

    const shortfall = amount - transferable;
    const nextClearRecord = records.find(r => {
      const holdingDays = r.isAffiliate ? rule.affiliateHoldingDays : rule.holdingDays;
      const clearDate = new Date(r.acquiredAt.getTime() + holdingDays * 24 * 60 * 60 * 1000);
      return asOfMs < clearDate.getTime();
    });

    let reason = `Only ${transferable} of ${amount} tokens have cleared the holding period`;
    if (nextClearRecord) {
      const holdingDays = nextClearRecord.isAffiliate ? rule.affiliateHoldingDays : rule.holdingDays;
      const clearDate = new Date(nextClearRecord.acquiredAt.getTime() + holdingDays * 24 * 60 * 60 * 1000);
      const daysRemaining = Math.ceil((clearDate.getTime() - asOfMs) / (24 * 60 * 60 * 1000));
      reason += ` (next batch clears in ${daysRemaining} days)`;
    }

    this.logEvent(ComplianceEventType.HOLDING_PERIOD_VIOLATION, tokenId, holderId, {
      requested: amount,
      transferable,
      shortfall,
    });

    return { allowed: false, reason, transferableAmount: transferable };
  }

  /**
   * Compute the earliest date at which a holder could transfer a given amount.
   */
  getEarliestTransferDate(holderId: string, tokenId: string, amount: number): Date | null {
    const rule = this.rules.get(tokenId);
    if (!rule) return new Date();    // no restriction

    const records = this.getHolderRecords(holderId, tokenId);
    if (records.length === 0) return null;

    records.sort((a, b) => a.acquiredAt.getTime() - b.acquiredAt.getTime());

    let cumulative = 0;
    for (const record of records) {
      cumulative += record.amount;
      if (cumulative >= amount) {
        const holdingDays = record.isAffiliate ? rule.affiliateHoldingDays : rule.holdingDays;
        return new Date(record.acquiredAt.getTime() + holdingDays * 24 * 60 * 60 * 1000);
      }
    }

    return null;  // Not enough holdings period
  }

  /**
   * Record that a transfer happened (reduces holdings via FIFO).
   */
  recordTransfer(holderId: string, tokenId: string, amount: number): void {
    const key = `${holderId}:${tokenId}`;
    const records = this.holdings.get(key) || [];
    records.sort((a, b) => a.acquiredAt.getTime() - b.acquiredAt.getTime());

    let remaining = amount;
    const updated: HoldingRecord[] = [];

    for (const record of records) {
      if (remaining <= 0) {
        updated.push(record);
        continue;
      }
      if (record.amount <= remaining) {
        remaining -= record.amount;
        // Record fully consumed, don't add to updated
      } else {
        record.amount -= remaining;
        remaining = 0;
        updated.push(record);
      }
    }

    this.holdings.set(key, updated);
  }

  getEvents(): ComplianceEvent[] {
    return [...this.eventLog];
  }

  private logEvent(
    eventType: ComplianceEventType,
    tokenId: string,
    holderId: string,
    details: Record<string, unknown>
  ): void {
    this.eventLog.push({
      id: `hp-${this.eventLog.length + 1}`,
      eventType,
      timestamp: new Date(),
      tokenId,
      holderId,
      details,
    });
  }
}
