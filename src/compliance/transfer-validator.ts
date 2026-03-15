/**
 * Transfer validation engine for RWA tokens.
 *
 * Enforces jurisdiction-based transfer restrictions, KYC requirements,
 * accredited investor rules, holding periods, whitelist/blacklist,
 * and volume limits. All checks are composable and produce a detailed
 * violation report so compliance officers know exactly why a transfer
 * was blocked.
 */

import { KYCManager } from './kyc-manager';
import { HoldingPeriodManager } from './holding-period';
import { ListManager } from './list-manager';
import {
  ComplianceEvent,
  ComplianceEventType,
  InvestorType,
  Jurisdiction,
  KYCStatus,
  RegulatoryFramework,
  TokenComplianceConfig,
  TransferRequest,
  TransferRestrictionType,
  TransferResult,
  TransferViolation,
} from './types';

/**
 * Default jurisdiction restrictions by regulatory framework.
 * These encode the most common transfer-restriction patterns.
 */
export const FRAMEWORK_DEFAULTS: Partial<
  Record<RegulatoryFramework, { blockedJurisdictions: Jurisdiction[]; requiredInvestorTypes: InvestorType[] }>
> = {
  [RegulatoryFramework.SEC_REG_D]: {
    blockedJurisdictions: [],
    requiredInvestorTypes: [InvestorType.ACCREDITED, InvestorType.QUALIFIED_PURCHASER, InvestorType.INSTITUTIONAL],
  },
  [RegulatoryFramework.SEC_REG_S]: {
    blockedJurisdictions: [Jurisdiction.US],
    requiredInvestorTypes: [],
  },
  [RegulatoryFramework.EU_MIFID_II]: {
    blockedJurisdictions: [],
    requiredInvestorTypes: [InvestorType.PROFESSIONAL, InvestorType.INSTITUTIONAL],
  },
  [RegulatoryFramework.EU_MICA]: {
    blockedJurisdictions: [],
    requiredInvestorTypes: [],
  },
};

export class TransferValidator {
  private kyc: KYCManager;
  private holdings: HoldingPeriodManager;
  private lists: ListManager;
  private configs: Map<string, TokenComplianceConfig> = new Map();
  private eventLog: ComplianceEvent[] = [];

  /** Track daily volume per (tokenId, wallet) for volume-limit enforcement. */
  private dailyVolume: Map<string, { date: string; amount: number }> = new Map();

  constructor(kyc: KYCManager, holdings: HoldingPeriodManager, lists: ListManager) {
    this.kyc = kyc;
    this.holdings = holdings;
    this.lists = lists;
  }

  // ── Configuration ─────────────────────────────────────────────

  /**
   * Register or update a token's compliance configuration.
   */
  registerToken(config: TokenComplianceConfig): void {
    this.configs.set(config.tokenId, { ...config });
  }

  getTokenConfig(tokenId: string): TokenComplianceConfig | undefined {
    const cfg = this.configs.get(tokenId);
    return cfg ? { ...cfg } : undefined;
  }

  // ── Main Validation ───────────────────────────────────────────

  /**
   * Validate a proposed transfer against all compliance rules.
   * Returns a detailed result with any violations.
   */
  validateTransfer(request: TransferRequest): TransferResult {
    const violations: TransferViolation[] = [];
    const config = this.configs.get(request.tokenId);

    if (!config) {
      violations.push({
        restriction: TransferRestrictionType.KYC_REQUIRED,
        message: `No compliance configuration found for token ${request.tokenId}`,
        severity: 'BLOCK',
      });
      return this.buildResult(request, violations);
    }

    // 1. Blacklist check (sender and receiver)
    this.checkBlacklist(request, violations);

    // 2. Whitelist check (receiver)
    this.checkWhitelist(request, config, violations);

    // 3. KYC check (receiver)
    this.checkKYC(request, config, violations);

    // 4. Investor type check (receiver)
    this.checkInvestorType(request, config, violations);

    // 5. Jurisdiction check (receiver)
    this.checkJurisdiction(request, config, violations);

    // 6. Holding period check (sender)
    this.checkHoldingPeriod(request, config, violations);

    // 7. Max holder count
    this.checkMaxHolders(request, config, violations);

    // 8. Volume limit
    this.checkVolumeLimit(request, config, violations);

    const result = this.buildResult(request, violations);

    // Log the outcome
    const eventType = result.allowed
      ? ComplianceEventType.TRANSFER_APPROVED
      : ComplianceEventType.TRANSFER_BLOCKED;

    this.logEvent(eventType, request.tokenId, request.from, {
      from: request.from,
      to: request.to,
      amount: request.amount,
      violations: violations.map(v => v.message),
    });

    return result;
  }

  // ── Individual Checks ─────────────────────────────────────────

  private checkBlacklist(request: TransferRequest, violations: TransferViolation[]): void {
    if (this.lists.isBlacklisted(request.from)) {
      violations.push({
        restriction: TransferRestrictionType.BLACKLISTED,
        message: `Sender ${request.from} is blacklisted`,
        severity: 'BLOCK',
      });
    }
    if (this.lists.isBlacklisted(request.to)) {
      violations.push({
        restriction: TransferRestrictionType.BLACKLISTED,
        message: `Receiver ${request.to} is blacklisted`,
        severity: 'BLOCK',
      });
    }
  }

  private checkWhitelist(
    request: TransferRequest,
    config: TokenComplianceConfig,
    violations: TransferViolation[]
  ): void {
    if (config.useWhitelist && !this.lists.isWhitelisted(request.to, request.tokenId)) {
      violations.push({
        restriction: TransferRestrictionType.WHITELIST_ONLY,
        message: `Receiver ${request.to} is not whitelisted for token ${request.tokenId}`,
        severity: 'BLOCK',
      });
    }
  }

  private checkKYC(
    request: TransferRequest,
    config: TokenComplianceConfig,
    violations: TransferViolation[]
  ): void {
    if (config.requiredKYCLevel === KYCStatus.NONE) return;

    const receiverRecord = this.kyc.getRecordByWallet(request.to);
    if (!receiverRecord) {
      violations.push({
        restriction: TransferRestrictionType.KYC_REQUIRED,
        message: `Receiver ${request.to} has no KYC record`,
        severity: 'BLOCK',
      });
      return;
    }

    // Check expiry
    const holderId = receiverRecord.holderId;
    if (!this.kyc.checkExpiry(holderId)) {
      violations.push({
        restriction: TransferRestrictionType.KYC_REQUIRED,
        message: `Receiver ${request.to} KYC is ${receiverRecord.status}`,
        severity: 'BLOCK',
      });
      return;
    }

    if (!this.kyc.meetsKYCLevel(holderId, config.requiredKYCLevel)) {
      violations.push({
        restriction: TransferRestrictionType.KYC_REQUIRED,
        message: `Receiver ${request.to} KYC level ${receiverRecord.status} does not meet required ${config.requiredKYCLevel}`,
        severity: 'BLOCK',
      });
    }
  }

  private checkInvestorType(
    request: TransferRequest,
    config: TokenComplianceConfig,
    violations: TransferViolation[]
  ): void {
    if (config.requiredInvestorTypes.length === 0) return;

    const receiverRecord = this.kyc.getRecordByWallet(request.to);
    if (!receiverRecord) {
      // Already flagged in KYC check; only add investor violation if KYC not required
      if (config.requiredKYCLevel === KYCStatus.NONE) {
        violations.push({
          restriction: TransferRestrictionType.ACCREDITED_ONLY,
          message: `Receiver ${request.to} has no KYC record to verify investor type`,
          severity: 'BLOCK',
        });
      }
      return;
    }

    if (!this.kyc.meetsInvestorRequirement(receiverRecord.holderId, config.requiredInvestorTypes)) {
      violations.push({
        restriction: TransferRestrictionType.ACCREDITED_ONLY,
        message: `Receiver investor type ${receiverRecord.investorType} not in allowed types: ${config.requiredInvestorTypes.join(', ')}`,
        severity: 'BLOCK',
      });
    }
  }

  private checkJurisdiction(
    request: TransferRequest,
    config: TokenComplianceConfig,
    violations: TransferViolation[]
  ): void {
    const receiverRecord = this.kyc.getRecordByWallet(request.to);
    if (!receiverRecord) return; // Can't check jurisdiction without KYC record

    const jurisdiction = receiverRecord.jurisdiction;

    // Check blocked jurisdictions
    if (config.blockedJurisdictions.includes(jurisdiction)) {
      violations.push({
        restriction: TransferRestrictionType.JURISDICTION_BLOCK,
        message: `Jurisdiction ${jurisdiction} is blocked for token ${config.tokenId}`,
        severity: 'BLOCK',
      });
    }

    // Check allowed jurisdictions (if specified, acts as a positive list)
    if (
      config.allowedJurisdictions.length > 0 &&
      !config.allowedJurisdictions.includes(jurisdiction)
    ) {
      violations.push({
        restriction: TransferRestrictionType.JURISDICTION_BLOCK,
        message: `Jurisdiction ${jurisdiction} is not in the allowed list for token ${config.tokenId}`,
        severity: 'BLOCK',
      });
    }
  }

  private checkHoldingPeriod(
    request: TransferRequest,
    config: TokenComplianceConfig,
    violations: TransferViolation[]
  ): void {
    if (!config.holdingPeriod) return;

    const canTransfer = this.holdings.canTransfer(
      request.from,
      request.tokenId,
      request.amount,
      request.requestedAt
    );

    if (!canTransfer.allowed) {
      violations.push({
        restriction: TransferRestrictionType.HOLDING_PERIOD,
        message: canTransfer.reason,
        severity: 'BLOCK',
      });
    }
  }

  private checkMaxHolders(
    request: TransferRequest,
    config: TokenComplianceConfig,
    violations: TransferViolation[]
  ): void {
    if (config.maxHolders <= 0) return;

    // Check if receiver is already a holder (if so, no new holder is added)
    const existingHoldings = this.holdings.getHolderRecords(request.to, request.tokenId);
    if (existingHoldings.length > 0) return; // Already a holder

    const currentHolderCount = this.holdings.getUniqueHolderCount(request.tokenId);
    if (currentHolderCount >= config.maxHolders) {
      violations.push({
        restriction: TransferRestrictionType.MAX_HOLDER_COUNT,
        message: `Token ${request.tokenId} has reached maximum holder count of ${config.maxHolders}`,
        severity: 'BLOCK',
      });
    }
  }

  private checkVolumeLimit(
    request: TransferRequest,
    config: TokenComplianceConfig,
    violations: TransferViolation[]
  ): void {
    if (config.volumeLimitPercentPerDay <= 0) return;

    const dateKey = request.requestedAt.toISOString().slice(0, 10);
    const volumeKey = `${request.tokenId}:${request.from}:${dateKey}`;

    const existing = this.dailyVolume.get(volumeKey);
    const currentVolume = existing?.date === dateKey ? existing.amount : 0;
    const totalVolume = currentVolume + request.amount;

    // Volume limit is a percent of total holdings
    const totalHoldings = this.holdings.getTotalHoldings(request.from, request.tokenId);
    if (totalHoldings <= 0) return;

    const maxVolume = totalHoldings * (config.volumeLimitPercentPerDay / 100);
    if (totalVolume > maxVolume) {
      violations.push({
        restriction: TransferRestrictionType.VOLUME_LIMIT,
        message: `Daily volume ${totalVolume} exceeds ${config.volumeLimitPercentPerDay}% limit (${maxVolume}) for ${request.from}`,
        severity: 'BLOCK',
      });
      this.logEvent(ComplianceEventType.VOLUME_LIMIT_EXCEEDED, request.tokenId, request.from, {
        attempted: totalVolume,
        limit: maxVolume,
      });
    }

    // Update volume tracker (even if blocked, for accurate tracking)
    this.dailyVolume.set(volumeKey, { date: dateKey, amount: totalVolume });
  }

  // ── Helpers ───────────────────────────────────────────────────

  private buildResult(request: TransferRequest, violations: TransferViolation[]): TransferResult {
    const blockingViolations = violations.filter(v => v.severity === 'BLOCK');
    return {
      allowed: blockingViolations.length === 0,
      request,
      violations,
      checkedAt: new Date(),
    };
  }

  private logEvent(
    eventType: ComplianceEventType,
    tokenId: string,
    walletAddress: string,
    details: Record<string, unknown>
  ): void {
    this.eventLog.push({
      id: `txv-${this.eventLog.length + 1}`,
      eventType,
      timestamp: new Date(),
      tokenId,
      walletAddress,
      details,
    });
  }

  getEvents(): ComplianceEvent[] {
    return [...this.eventLog];
  }
}
