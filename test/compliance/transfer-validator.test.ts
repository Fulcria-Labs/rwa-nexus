import { KYCManager } from '../../src/compliance/kyc-manager';
import { HoldingPeriodManager } from '../../src/compliance/holding-period';
import { ListManager } from '../../src/compliance/list-manager';
import { TransferValidator, FRAMEWORK_DEFAULTS } from '../../src/compliance/transfer-validator';
import {
  AMLRiskLevel,
  InvestorType,
  Jurisdiction,
  KYCStatus,
  RegulatoryFramework,
  TokenComplianceConfig,
  TransferRestrictionType,
  TransferRequest,
} from '../../src/compliance/types';

function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

function makeTransferRequest(
  tokenId: string,
  from: string,
  to: string,
  amount: number
): TransferRequest {
  return { tokenId, from, to, amount, requestedAt: new Date() };
}

function makeRegDConfig(tokenId: string): TokenComplianceConfig {
  return {
    tokenId,
    name: 'Test Token',
    framework: RegulatoryFramework.SEC_REG_D,
    allowedJurisdictions: [Jurisdiction.US],
    blockedJurisdictions: [],
    requiredKYCLevel: KYCStatus.ENHANCED,
    requiredInvestorTypes: [InvestorType.ACCREDITED, InvestorType.QUALIFIED_PURCHASER, InvestorType.INSTITUTIONAL],
    maxHolders: 99,
    useWhitelist: false,
    holdingPeriod: null,
    volumeLimitPercentPerDay: 0,
  };
}

function makeMiFIDConfig(tokenId: string): TokenComplianceConfig {
  return {
    tokenId,
    name: 'EU Token',
    framework: RegulatoryFramework.EU_MIFID_II,
    allowedJurisdictions: [Jurisdiction.EU, Jurisdiction.UK, Jurisdiction.CH],
    blockedJurisdictions: [],
    requiredKYCLevel: KYCStatus.BASIC,
    requiredInvestorTypes: [InvestorType.PROFESSIONAL, InvestorType.INSTITUTIONAL],
    maxHolders: 0,
    useWhitelist: false,
    holdingPeriod: null,
    volumeLimitPercentPerDay: 0,
  };
}

describe('TransferValidator', () => {
  let kyc: KYCManager;
  let holdings: HoldingPeriodManager;
  let lists: ListManager;
  let validator: TransferValidator;

  beforeEach(() => {
    kyc = new KYCManager();
    holdings = new HoldingPeriodManager();
    lists = new ListManager();
    validator = new TransferValidator(kyc, holdings, lists);
  });

  // ── Framework Defaults ────────────────────────────────────────

  describe('FRAMEWORK_DEFAULTS', () => {
    it('should define SEC Reg D defaults (accredited only)', () => {
      const defs = FRAMEWORK_DEFAULTS[RegulatoryFramework.SEC_REG_D]!;
      expect(defs.requiredInvestorTypes).toContain(InvestorType.ACCREDITED);
    });

    it('should define SEC Reg S defaults (US blocked)', () => {
      const defs = FRAMEWORK_DEFAULTS[RegulatoryFramework.SEC_REG_S]!;
      expect(defs.blockedJurisdictions).toContain(Jurisdiction.US);
    });

    it('should define EU MiFID II defaults (professional only)', () => {
      const defs = FRAMEWORK_DEFAULTS[RegulatoryFramework.EU_MIFID_II]!;
      expect(defs.requiredInvestorTypes).toContain(InvestorType.PROFESSIONAL);
    });
  });

  // ── Token Registration ────────────────────────────────────────

  describe('registerToken', () => {
    it('should register a token compliance config', () => {
      validator.registerToken(makeRegDConfig('token-1'));
      const config = validator.getTokenConfig('token-1');
      expect(config?.framework).toBe(RegulatoryFramework.SEC_REG_D);
    });

    it('should return undefined for unregistered token', () => {
      expect(validator.getTokenConfig('nonexistent')).toBeUndefined();
    });
  });

  // ── No Config ─────────────────────────────────────────────────

  describe('no compliance config', () => {
    it('should block transfer when no config exists', () => {
      const result = validator.validateTransfer(
        makeTransferRequest('unknown-token', '0xa', '0xb', 100)
      );
      expect(result.allowed).toBe(false);
      expect(result.violations[0].restriction).toBe(TransferRestrictionType.KYC_REQUIRED);
    });
  });

  // ── Blacklist ─────────────────────────────────────────────────

  describe('blacklist checks', () => {
    beforeEach(() => {
      validator.registerToken({ ...makeRegDConfig('token-1'), requiredKYCLevel: KYCStatus.NONE, requiredInvestorTypes: [] });
    });

    it('should block transfer from blacklisted sender', () => {
      lists.addToBlacklist('0xbad_sender', 'admin', 'sanctioned');
      const result = validator.validateTransfer(
        makeTransferRequest('token-1', '0xbad_sender', '0xgood', 100)
      );
      expect(result.allowed).toBe(false);
      expect(result.violations.some(v => v.restriction === TransferRestrictionType.BLACKLISTED)).toBe(true);
    });

    it('should block transfer to blacklisted receiver', () => {
      lists.addToBlacklist('0xbad_receiver', 'admin', 'sanctioned');
      const result = validator.validateTransfer(
        makeTransferRequest('token-1', '0xgood', '0xbad_receiver', 100)
      );
      expect(result.allowed).toBe(false);
    });

    it('should report both sender and receiver blacklisted', () => {
      lists.addToBlacklist('0xbad1', 'admin', 'sanctioned');
      lists.addToBlacklist('0xbad2', 'admin', 'sanctioned');
      const result = validator.validateTransfer(
        makeTransferRequest('token-1', '0xbad1', '0xbad2', 100)
      );
      const blacklistViolations = result.violations.filter(
        v => v.restriction === TransferRestrictionType.BLACKLISTED
      );
      expect(blacklistViolations.length).toBe(2);
    });
  });

  // ── Whitelist ─────────────────────────────────────────────────

  describe('whitelist checks', () => {
    beforeEach(() => {
      validator.registerToken({
        ...makeRegDConfig('token-1'),
        requiredKYCLevel: KYCStatus.NONE,
        requiredInvestorTypes: [],
        useWhitelist: true,
      });
    });

    it('should block transfer to non-whitelisted address', () => {
      const result = validator.validateTransfer(
        makeTransferRequest('token-1', '0xa', '0xb', 100)
      );
      expect(result.allowed).toBe(false);
      expect(result.violations.some(v => v.restriction === TransferRestrictionType.WHITELIST_ONLY)).toBe(true);
    });

    it('should allow transfer to whitelisted address', () => {
      lists.addToWhitelist('token-1', '0xb', 'admin', 'approved');
      const result = validator.validateTransfer(
        makeTransferRequest('token-1', '0xa', '0xb', 100)
      );
      expect(result.violations.some(v => v.restriction === TransferRestrictionType.WHITELIST_ONLY)).toBe(false);
    });
  });

  // ── KYC Checks ────────────────────────────────────────────────

  describe('KYC checks', () => {
    beforeEach(() => {
      validator.registerToken(makeRegDConfig('token-1'));
    });

    it('should block when receiver has no KYC record', () => {
      const result = validator.validateTransfer(
        makeTransferRequest('token-1', '0xa', '0xb', 100)
      );
      expect(result.violations.some(v => v.restriction === TransferRestrictionType.KYC_REQUIRED)).toBe(true);
    });

    it('should block when receiver KYC level insufficient', () => {
      kyc.registerHolder({ holderId: 'h1', walletAddress: '0xb', jurisdiction: Jurisdiction.US, investorType: InvestorType.ACCREDITED });
      kyc.approveBasicKYC('h1'); // BASIC, needs ENHANCED
      const result = validator.validateTransfer(
        makeTransferRequest('token-1', '0xa', '0xb', 100)
      );
      expect(result.violations.some(v => v.restriction === TransferRestrictionType.KYC_REQUIRED)).toBe(true);
    });

    it('should pass when receiver has sufficient KYC', () => {
      kyc.registerHolder({ holderId: 'h1', walletAddress: '0xb', jurisdiction: Jurisdiction.US, investorType: InvestorType.ACCREDITED });
      kyc.approveEnhancedKYC('h1', { pepScreenPassed: true, sanctionsScreenPassed: true, amlRiskLevel: AMLRiskLevel.LOW });
      const result = validator.validateTransfer(
        makeTransferRequest('token-1', '0xa', '0xb', 100)
      );
      expect(result.violations.some(v => v.restriction === TransferRestrictionType.KYC_REQUIRED)).toBe(false);
    });
  });

  // ── Investor Type Checks ──────────────────────────────────────

  describe('investor type checks', () => {
    beforeEach(() => {
      validator.registerToken(makeRegDConfig('token-1'));
    });

    it('should block retail investor from receiving Reg D tokens', () => {
      kyc.registerHolder({ holderId: 'h1', walletAddress: '0xb', jurisdiction: Jurisdiction.US, investorType: InvestorType.RETAIL });
      kyc.approveEnhancedKYC('h1', { pepScreenPassed: true, sanctionsScreenPassed: true, amlRiskLevel: AMLRiskLevel.LOW });
      const result = validator.validateTransfer(
        makeTransferRequest('token-1', '0xa', '0xb', 100)
      );
      expect(result.violations.some(v => v.restriction === TransferRestrictionType.ACCREDITED_ONLY)).toBe(true);
    });

    it('should allow accredited investor to receive Reg D tokens', () => {
      kyc.registerHolder({ holderId: 'h1', walletAddress: '0xb', jurisdiction: Jurisdiction.US, investorType: InvestorType.ACCREDITED });
      kyc.approveEnhancedKYC('h1', { pepScreenPassed: true, sanctionsScreenPassed: true, amlRiskLevel: AMLRiskLevel.LOW });
      const result = validator.validateTransfer(
        makeTransferRequest('token-1', '0xa', '0xb', 100)
      );
      expect(result.violations.some(v => v.restriction === TransferRestrictionType.ACCREDITED_ONLY)).toBe(false);
    });

    it('should allow institutional investor for Reg D', () => {
      kyc.registerHolder({ holderId: 'h1', walletAddress: '0xb', jurisdiction: Jurisdiction.US, investorType: InvestorType.INSTITUTIONAL });
      kyc.approveEnhancedKYC('h1', { pepScreenPassed: true, sanctionsScreenPassed: true, amlRiskLevel: AMLRiskLevel.LOW });
      const result = validator.validateTransfer(
        makeTransferRequest('token-1', '0xa', '0xb', 100)
      );
      expect(result.violations.some(v => v.restriction === TransferRestrictionType.ACCREDITED_ONLY)).toBe(false);
    });
  });

  // ── Jurisdiction Checks ───────────────────────────────────────

  describe('jurisdiction checks', () => {
    it('should block receiver in blocked jurisdiction', () => {
      validator.registerToken({
        ...makeRegDConfig('token-1'),
        requiredKYCLevel: KYCStatus.NONE,
        requiredInvestorTypes: [],
        blockedJurisdictions: [Jurisdiction.US],
        allowedJurisdictions: [],
      });
      kyc.registerHolder({ holderId: 'h1', walletAddress: '0xb', jurisdiction: Jurisdiction.US });
      kyc.approveBasicKYC('h1');
      const result = validator.validateTransfer(
        makeTransferRequest('token-1', '0xa', '0xb', 100)
      );
      expect(result.violations.some(v => v.restriction === TransferRestrictionType.JURISDICTION_BLOCK)).toBe(true);
    });

    it('should block receiver not in allowed jurisdiction list', () => {
      validator.registerToken(makeMiFIDConfig('token-1'));
      kyc.registerHolder({ holderId: 'h1', walletAddress: '0xb', jurisdiction: Jurisdiction.US, investorType: InvestorType.PROFESSIONAL });
      kyc.approveBasicKYC('h1');
      const result = validator.validateTransfer(
        makeTransferRequest('token-1', '0xa', '0xb', 100)
      );
      expect(result.violations.some(v => v.restriction === TransferRestrictionType.JURISDICTION_BLOCK)).toBe(true);
    });

    it('should allow receiver in allowed jurisdiction', () => {
      validator.registerToken(makeMiFIDConfig('token-1'));
      kyc.registerHolder({ holderId: 'h1', walletAddress: '0xb', jurisdiction: Jurisdiction.EU, investorType: InvestorType.PROFESSIONAL });
      kyc.approveBasicKYC('h1');
      const result = validator.validateTransfer(
        makeTransferRequest('token-1', '0xa', '0xb', 100)
      );
      expect(result.violations.some(v => v.restriction === TransferRestrictionType.JURISDICTION_BLOCK)).toBe(false);
    });
  });

  // ── Holding Period ────────────────────────────────────────────

  describe('holding period checks', () => {
    it('should block transfer within holding period', () => {
      const config: TokenComplianceConfig = {
        ...makeRegDConfig('token-1'),
        requiredKYCLevel: KYCStatus.NONE,
        requiredInvestorTypes: [],
        allowedJurisdictions: [],
        maxHolders: 0,
        holdingPeriod: {
          tokenId: 'token-1',
          framework: RegulatoryFramework.SEC_RULE_144,
          holdingDays: 180,
          affiliateHoldingDays: 365,
          dripFeedMaxPercent: 0,
          dripFeedPeriodDays: 0,
        },
      };
      validator.registerToken(config);
      holdings.registerRule(config.holdingPeriod!);
      holdings.recordAcquisition({
        holderId: '0xa',
        tokenId: 'token-1',
        acquiredAt: daysAgo(30),
        amount: 100,
        isAffiliate: false,
        source: 'PRIMARY',
      });

      const result = validator.validateTransfer(
        makeTransferRequest('token-1', '0xa', '0xb', 50)
      );
      expect(result.violations.some(v => v.restriction === TransferRestrictionType.HOLDING_PERIOD)).toBe(true);
    });

    it('should allow transfer after holding period clears', () => {
      const config: TokenComplianceConfig = {
        ...makeRegDConfig('token-1'),
        requiredKYCLevel: KYCStatus.NONE,
        requiredInvestorTypes: [],
        allowedJurisdictions: [],
        maxHolders: 0,
        holdingPeriod: {
          tokenId: 'token-1',
          framework: RegulatoryFramework.SEC_RULE_144,
          holdingDays: 180,
          affiliateHoldingDays: 365,
          dripFeedMaxPercent: 0,
          dripFeedPeriodDays: 0,
        },
      };
      validator.registerToken(config);
      holdings.registerRule(config.holdingPeriod!);
      holdings.recordAcquisition({
        holderId: '0xa',
        tokenId: 'token-1',
        acquiredAt: daysAgo(200),
        amount: 100,
        isAffiliate: false,
        source: 'PRIMARY',
      });

      const result = validator.validateTransfer(
        makeTransferRequest('token-1', '0xa', '0xb', 50)
      );
      expect(result.violations.some(v => v.restriction === TransferRestrictionType.HOLDING_PERIOD)).toBe(false);
    });
  });

  // ── Max Holder Count ──────────────────────────────────────────

  describe('max holder count checks', () => {
    it('should block when max holders reached', () => {
      validator.registerToken({
        ...makeRegDConfig('token-1'),
        requiredKYCLevel: KYCStatus.NONE,
        requiredInvestorTypes: [],
        allowedJurisdictions: [],
        maxHolders: 2,
      });

      // Two existing holders
      holdings.recordAcquisition({ holderId: '0xh1', tokenId: 'token-1', acquiredAt: new Date(), amount: 100, isAffiliate: false, source: 'PRIMARY' });
      holdings.recordAcquisition({ holderId: '0xh2', tokenId: 'token-1', acquiredAt: new Date(), amount: 100, isAffiliate: false, source: 'PRIMARY' });

      // New holder trying to receive
      const result = validator.validateTransfer(
        makeTransferRequest('token-1', '0xh1', '0xh3', 50)
      );
      expect(result.violations.some(v => v.restriction === TransferRestrictionType.MAX_HOLDER_COUNT)).toBe(true);
    });

    it('should allow transfer to existing holder even at max', () => {
      validator.registerToken({
        ...makeRegDConfig('token-1'),
        requiredKYCLevel: KYCStatus.NONE,
        requiredInvestorTypes: [],
        allowedJurisdictions: [],
        maxHolders: 2,
      });

      holdings.recordAcquisition({ holderId: '0xh1', tokenId: 'token-1', acquiredAt: new Date(), amount: 100, isAffiliate: false, source: 'PRIMARY' });
      holdings.recordAcquisition({ holderId: '0xh2', tokenId: 'token-1', acquiredAt: new Date(), amount: 100, isAffiliate: false, source: 'PRIMARY' });

      const result = validator.validateTransfer(
        makeTransferRequest('token-1', '0xh1', '0xh2', 50)
      );
      expect(result.violations.some(v => v.restriction === TransferRestrictionType.MAX_HOLDER_COUNT)).toBe(false);
    });
  });

  // ── Volume Limit ──────────────────────────────────────────────

  describe('volume limit checks', () => {
    it('should block when daily volume exceeds limit', () => {
      validator.registerToken({
        ...makeRegDConfig('token-1'),
        requiredKYCLevel: KYCStatus.NONE,
        requiredInvestorTypes: [],
        allowedJurisdictions: [],
        maxHolders: 0,
        volumeLimitPercentPerDay: 10,
      });

      holdings.recordAcquisition({ holderId: '0xa', tokenId: 'token-1', acquiredAt: new Date(), amount: 1000, isAffiliate: false, source: 'PRIMARY' });

      // Try to transfer 200 (20% > 10% limit)
      const result = validator.validateTransfer(
        makeTransferRequest('token-1', '0xa', '0xb', 200)
      );
      expect(result.violations.some(v => v.restriction === TransferRestrictionType.VOLUME_LIMIT)).toBe(true);
    });

    it('should allow transfer within daily volume limit', () => {
      validator.registerToken({
        ...makeRegDConfig('token-1'),
        requiredKYCLevel: KYCStatus.NONE,
        requiredInvestorTypes: [],
        allowedJurisdictions: [],
        maxHolders: 0,
        volumeLimitPercentPerDay: 10,
      });

      holdings.recordAcquisition({ holderId: '0xa', tokenId: 'token-1', acquiredAt: new Date(), amount: 1000, isAffiliate: false, source: 'PRIMARY' });

      const result = validator.validateTransfer(
        makeTransferRequest('token-1', '0xa', '0xb', 50)
      );
      expect(result.violations.some(v => v.restriction === TransferRestrictionType.VOLUME_LIMIT)).toBe(false);
    });
  });

  // ── Full Compliance Scenario ──────────────────────────────────

  describe('full compliance scenario - US Reg D', () => {
    it('should approve compliant transfer end-to-end', () => {
      validator.registerToken(makeRegDConfig('token-1'));

      // Register and verify receiver
      kyc.registerHolder({ holderId: 'receiver', walletAddress: '0xb', jurisdiction: Jurisdiction.US, investorType: InvestorType.ACCREDITED });
      kyc.approveEnhancedKYC('receiver', { pepScreenPassed: true, sanctionsScreenPassed: true, amlRiskLevel: AMLRiskLevel.LOW });

      const result = validator.validateTransfer(
        makeTransferRequest('token-1', '0xa', '0xb', 100)
      );
      expect(result.allowed).toBe(true);
      expect(result.violations.length).toBe(0);
    });

    it('should block non-compliant transfer with multiple violations', () => {
      validator.registerToken(makeRegDConfig('token-1'));
      lists.addToBlacklist('0xa', 'admin', 'sanctioned'); // sender blacklisted

      // Receiver is retail, not accredited
      kyc.registerHolder({ holderId: 'receiver', walletAddress: '0xb', jurisdiction: Jurisdiction.EU, investorType: InvestorType.RETAIL });
      kyc.approveBasicKYC('receiver'); // BASIC, needs ENHANCED

      const result = validator.validateTransfer(
        makeTransferRequest('token-1', '0xa', '0xb', 100)
      );
      expect(result.allowed).toBe(false);
      expect(result.violations.length).toBeGreaterThanOrEqual(3); // blacklist + KYC + jurisdiction
    });
  });

  // ── EU MiFID II Scenario ──────────────────────────────────────

  describe('EU MiFID II scenario', () => {
    it('should allow EU professional investor', () => {
      validator.registerToken(makeMiFIDConfig('token-1'));
      kyc.registerHolder({ holderId: 'eu_pro', walletAddress: '0xeu', jurisdiction: Jurisdiction.EU, investorType: InvestorType.PROFESSIONAL });
      kyc.approveBasicKYC('eu_pro');

      const result = validator.validateTransfer(
        makeTransferRequest('token-1', '0xa', '0xeu', 100)
      );
      expect(result.allowed).toBe(true);
    });

    it('should block US retail investor from EU token', () => {
      validator.registerToken(makeMiFIDConfig('token-1'));
      kyc.registerHolder({ holderId: 'us_retail', walletAddress: '0xus', jurisdiction: Jurisdiction.US, investorType: InvestorType.RETAIL });
      kyc.approveBasicKYC('us_retail');

      const result = validator.validateTransfer(
        makeTransferRequest('token-1', '0xa', '0xus', 100)
      );
      expect(result.allowed).toBe(false);
    });
  });

  // ── Event Logging ─────────────────────────────────────────────

  describe('event logging', () => {
    it('should log TRANSFER_APPROVED for successful transfers', () => {
      validator.registerToken({ ...makeRegDConfig('token-1'), requiredKYCLevel: KYCStatus.NONE, requiredInvestorTypes: [], allowedJurisdictions: [] });
      validator.validateTransfer(makeTransferRequest('token-1', '0xa', '0xb', 100));
      const events = validator.getEvents();
      expect(events.some(e => e.eventType === 'TRANSFER_APPROVED')).toBe(true);
    });

    it('should log TRANSFER_BLOCKED for failed transfers', () => {
      validator.registerToken(makeRegDConfig('token-1'));
      validator.validateTransfer(makeTransferRequest('token-1', '0xa', '0xb', 100));
      const events = validator.getEvents();
      expect(events.some(e => e.eventType === 'TRANSFER_BLOCKED')).toBe(true);
    });
  });
});
