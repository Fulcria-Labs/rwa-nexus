/**
 * KYC/AML verification status manager for RWA token holders.
 *
 * Tracks the complete lifecycle of holder verification:
 *  - identity verification (basic / enhanced)
 *  - PEP and sanctions screening
 *  - AML risk scoring
 *  - automatic expiry detection
 *  - investor accreditation classification
 */

import {
  AMLRiskLevel,
  ComplianceEvent,
  ComplianceEventType,
  InvestorType,
  Jurisdiction,
  KYCRecord,
  KYCStatus,
} from './types';

export class KYCManager {
  private records: Map<string, KYCRecord> = new Map();         // holderId -> record
  private walletIndex: Map<string, string> = new Map();        // wallet -> holderId
  private eventLog: ComplianceEvent[] = [];

  // Default KYC validity: 365 days
  private readonly defaultValidityDays: number;

  constructor(defaultValidityDays = 365) {
    this.defaultValidityDays = defaultValidityDays;
  }

  // ── Registration ──────────────────────────────────────────────

  /**
   * Register a new holder with initial KYC status.
   * @returns the newly created KYC record
   */
  registerHolder(params: {
    holderId: string;
    walletAddress: string;
    jurisdiction: Jurisdiction;
    investorType?: InvestorType;
  }): KYCRecord {
    if (this.records.has(params.holderId)) {
      throw new Error(`Holder ${params.holderId} already registered`);
    }
    if (this.walletIndex.has(params.walletAddress)) {
      throw new Error(`Wallet ${params.walletAddress} already associated with a holder`);
    }

    const record: KYCRecord = {
      holderId: params.holderId,
      walletAddress: params.walletAddress,
      status: KYCStatus.PENDING,
      investorType: params.investorType ?? InvestorType.RETAIL,
      jurisdiction: params.jurisdiction,
      amlRiskLevel: AMLRiskLevel.MEDIUM,   // default until screened
      verifiedAt: null,
      expiresAt: null,
      documents: [],
      pepScreenPassed: false,
      sanctionsScreenPassed: false,
      lastUpdated: new Date(),
    };

    this.records.set(params.holderId, record);
    this.walletIndex.set(params.walletAddress, params.holderId);
    return { ...record };
  }

  // ── Verification ──────────────────────────────────────────────

  /**
   * Approve basic KYC verification.
   */
  approveBasicKYC(holderId: string, documentIds: string[] = []): KYCRecord {
    const record = this.getRecordOrThrow(holderId);
    record.status = KYCStatus.BASIC;
    record.verifiedAt = new Date();
    record.expiresAt = this.computeExpiry();
    record.documents.push(...documentIds);
    record.lastUpdated = new Date();

    this.logEvent(ComplianceEventType.KYC_APPROVED, '', holderId, {
      level: 'BASIC',
      documents: documentIds,
    });

    return { ...record };
  }

  /**
   * Approve enhanced KYC (full due diligence).
   */
  approveEnhancedKYC(
    holderId: string,
    params: {
      documentIds?: string[];
      pepScreenPassed: boolean;
      sanctionsScreenPassed: boolean;
      amlRiskLevel: AMLRiskLevel;
    }
  ): KYCRecord {
    const record = this.getRecordOrThrow(holderId);

    if (!params.sanctionsScreenPassed) {
      record.status = KYCStatus.REJECTED;
      record.amlRiskLevel = AMLRiskLevel.PROHIBITED;
      record.lastUpdated = new Date();
      this.logEvent(ComplianceEventType.SANCTIONS_HIT, '', holderId, {
        sanctionsScreenPassed: false,
      });
      this.logEvent(ComplianceEventType.KYC_REJECTED, '', holderId, {
        reason: 'sanctions_hit',
      });
      return { ...record };
    }

    if (params.amlRiskLevel === AMLRiskLevel.PROHIBITED) {
      record.status = KYCStatus.REJECTED;
      record.amlRiskLevel = AMLRiskLevel.PROHIBITED;
      record.lastUpdated = new Date();
      this.logEvent(ComplianceEventType.KYC_REJECTED, '', holderId, {
        reason: 'aml_prohibited',
      });
      return { ...record };
    }

    record.status = KYCStatus.ENHANCED;
    record.verifiedAt = new Date();
    record.expiresAt = this.computeExpiry();
    record.pepScreenPassed = params.pepScreenPassed;
    record.sanctionsScreenPassed = params.sanctionsScreenPassed;
    record.amlRiskLevel = params.amlRiskLevel;
    if (params.documentIds) {
      record.documents.push(...params.documentIds);
    }
    record.lastUpdated = new Date();

    if (!params.pepScreenPassed) {
      this.logEvent(ComplianceEventType.AML_FLAG, '', holderId, {
        reason: 'pep_screen_failed',
      });
    }

    this.logEvent(ComplianceEventType.KYC_APPROVED, '', holderId, {
      level: 'ENHANCED',
      amlRiskLevel: params.amlRiskLevel,
    });

    return { ...record };
  }

  /**
   * Reject a holder's KYC application.
   */
  rejectKYC(holderId: string, reason: string): KYCRecord {
    const record = this.getRecordOrThrow(holderId);
    record.status = KYCStatus.REJECTED;
    record.lastUpdated = new Date();

    this.logEvent(ComplianceEventType.KYC_REJECTED, '', holderId, { reason });
    return { ...record };
  }

  // ── Expiry ────────────────────────────────────────────────────

  /**
   * Check if a holder's KYC has expired and mark it if so.
   * @returns true if the KYC is currently valid (BASIC or ENHANCED and not expired)
   */
  checkExpiry(holderId: string, asOf: Date = new Date()): boolean {
    const record = this.getRecordOrThrow(holderId);
    if (record.status !== KYCStatus.BASIC && record.status !== KYCStatus.ENHANCED) {
      return false;
    }
    if (record.expiresAt && asOf > record.expiresAt) {
      record.status = KYCStatus.EXPIRED;
      record.lastUpdated = asOf;
      this.logEvent(ComplianceEventType.KYC_EXPIRED, '', holderId, {
        expiredAt: record.expiresAt.toISOString(),
      });
      return false;
    }
    return true;
  }

  /**
   * Renew KYC for a holder, extending expiry from now.
   */
  renewKYC(holderId: string): KYCRecord {
    const record = this.getRecordOrThrow(holderId);
    if (record.status === KYCStatus.REJECTED) {
      throw new Error('Cannot renew rejected KYC');
    }
    if (record.status === KYCStatus.NONE || record.status === KYCStatus.PENDING) {
      throw new Error('Cannot renew KYC that has not been approved');
    }
    record.expiresAt = this.computeExpiry();
    record.lastUpdated = new Date();
    return { ...record };
  }

  // ── Update investor type ──────────────────────────────────────

  /**
   * Update a holder's investor classification.
   */
  setInvestorType(holderId: string, investorType: InvestorType): KYCRecord {
    const record = this.getRecordOrThrow(holderId);
    record.investorType = investorType;
    record.lastUpdated = new Date();
    return { ...record };
  }

  // ── Queries ───────────────────────────────────────────────────

  getRecord(holderId: string): KYCRecord | undefined {
    const record = this.records.get(holderId);
    return record ? { ...record } : undefined;
  }

  getRecordByWallet(walletAddress: string): KYCRecord | undefined {
    const holderId = this.walletIndex.get(walletAddress);
    if (!holderId) return undefined;
    return this.getRecord(holderId);
  }

  getAllRecords(): KYCRecord[] {
    return Array.from(this.records.values()).map(r => ({ ...r }));
  }

  getRecordsByStatus(status: KYCStatus): KYCRecord[] {
    return Array.from(this.records.values())
      .filter(r => r.status === status)
      .map(r => ({ ...r }));
  }

  getRecordsByJurisdiction(jurisdiction: Jurisdiction): KYCRecord[] {
    return Array.from(this.records.values())
      .filter(r => r.jurisdiction === jurisdiction)
      .map(r => ({ ...r }));
  }

  getRecordsByInvestorType(investorType: InvestorType): KYCRecord[] {
    return Array.from(this.records.values())
      .filter(r => r.investorType === investorType)
      .map(r => ({ ...r }));
  }

  /**
   * Check if a holder meets the minimum KYC level.
   */
  meetsKYCLevel(holderId: string, requiredLevel: KYCStatus): boolean {
    const record = this.records.get(holderId);
    if (!record) return false;

    const hierarchy: Record<KYCStatus, number> = {
      [KYCStatus.NONE]: 0,
      [KYCStatus.PENDING]: 0,
      [KYCStatus.REJECTED]: 0,
      [KYCStatus.EXPIRED]: 0,
      [KYCStatus.BASIC]: 1,
      [KYCStatus.ENHANCED]: 2,
    };

    return hierarchy[record.status] >= hierarchy[requiredLevel];
  }

  /**
   * Check if a holder has a specific investor type (or higher).
   */
  meetsInvestorRequirement(holderId: string, requiredTypes: InvestorType[]): boolean {
    const record = this.records.get(holderId);
    if (!record) return false;
    if (requiredTypes.length === 0) return true;
    return requiredTypes.includes(record.investorType);
  }

  /**
   * Return all compliance events in the log.
   */
  getEvents(): ComplianceEvent[] {
    return [...this.eventLog];
  }

  getHolderCount(): number {
    return this.records.size;
  }

  // ── Internals ─────────────────────────────────────────────────

  private getRecordOrThrow(holderId: string): KYCRecord {
    const record = this.records.get(holderId);
    if (!record) {
      throw new Error(`Holder ${holderId} not found`);
    }
    return record;
  }

  private computeExpiry(): Date {
    const expiry = new Date();
    expiry.setDate(expiry.getDate() + this.defaultValidityDays);
    return expiry;
  }

  private logEvent(
    eventType: ComplianceEventType,
    tokenId: string,
    holderId: string,
    details: Record<string, unknown>
  ): void {
    this.eventLog.push({
      id: `evt-${this.eventLog.length + 1}`,
      eventType,
      timestamp: new Date(),
      tokenId,
      holderId,
      details,
    });
  }
}
