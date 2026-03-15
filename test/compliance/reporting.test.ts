import { KYCManager } from '../../src/compliance/kyc-manager';
import { HoldingPeriodManager } from '../../src/compliance/holding-period';
import { ListManager } from '../../src/compliance/list-manager';
import { TransferValidator } from '../../src/compliance/transfer-validator';
import { ComplianceReporter } from '../../src/compliance/reporting';
import {
  AMLRiskLevel,
  ComplianceEventType,
  InvestorType,
  Jurisdiction,
  KYCStatus,
  RegulatoryFramework,
  TokenComplianceConfig,
} from '../../src/compliance/types';

function makeSimpleConfig(tokenId: string): TokenComplianceConfig {
  return {
    tokenId,
    name: 'Test Token',
    framework: RegulatoryFramework.SEC_REG_D,
    allowedJurisdictions: [],
    blockedJurisdictions: [],
    requiredKYCLevel: KYCStatus.NONE,
    requiredInvestorTypes: [],
    maxHolders: 0,
    useWhitelist: false,
    holdingPeriod: null,
    volumeLimitPercentPerDay: 0,
  };
}

describe('ComplianceReporter', () => {
  let kyc: KYCManager;
  let holdings: HoldingPeriodManager;
  let lists: ListManager;
  let validator: TransferValidator;
  let reporter: ComplianceReporter;

  beforeEach(() => {
    kyc = new KYCManager();
    holdings = new HoldingPeriodManager();
    lists = new ListManager();
    validator = new TransferValidator(kyc, holdings, lists);
    reporter = new ComplianceReporter(kyc, holdings, lists, validator);
  });

  // ── Compliance Report ─────────────────────────────────────────

  describe('generateComplianceReport', () => {
    it('should generate report for a token with no activity', () => {
      const now = new Date();
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const report = reporter.generateComplianceReport('token-1', weekAgo, now);
      expect(report.tokenId).toBe('token-1');
      expect(report.totalTransfers).toBe(0);
      expect(report.approvedTransfers).toBe(0);
      expect(report.blockedTransfers).toBe(0);
    });

    it('should count approved and blocked transfers', () => {
      validator.registerToken(makeSimpleConfig('token-1'));
      validator.registerToken({
        ...makeSimpleConfig('token-1'),
        requiredKYCLevel: KYCStatus.ENHANCED,
      });

      // Approved transfer (simple config - no KYC needed, re-register to reset)
      validator.registerToken(makeSimpleConfig('token-1'));
      validator.validateTransfer({ tokenId: 'token-1', from: '0xa', to: '0xb', amount: 100, requestedAt: new Date() });

      // Blocked transfer (add KYC requirement back)
      validator.registerToken({ ...makeSimpleConfig('token-1'), requiredKYCLevel: KYCStatus.ENHANCED });
      validator.validateTransfer({ tokenId: 'token-1', from: '0xa', to: '0xc', amount: 100, requestedAt: new Date() });

      const now = new Date();
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const report = reporter.generateComplianceReport('token-1', weekAgo, now);
      expect(report.totalTransfers).toBe(2);
      expect(report.approvedTransfers).toBe(1);
      expect(report.blockedTransfers).toBe(1);
    });

    it('should include KYC breakdown', () => {
      kyc.registerHolder({ holderId: 'h1', walletAddress: '0xa', jurisdiction: Jurisdiction.US });
      kyc.registerHolder({ holderId: 'h2', walletAddress: '0xb', jurisdiction: Jurisdiction.EU });
      kyc.approveBasicKYC('h1');
      kyc.approveEnhancedKYC('h2', { pepScreenPassed: true, sanctionsScreenPassed: true, amlRiskLevel: AMLRiskLevel.LOW });

      const now = new Date();
      const report = reporter.generateComplianceReport('token-1', new Date(0), now);
      expect(report.kycBreakdown[KYCStatus.BASIC]).toBe(1);
      expect(report.kycBreakdown[KYCStatus.ENHANCED]).toBe(1);
    });

    it('should include jurisdiction breakdown', () => {
      kyc.registerHolder({ holderId: 'h1', walletAddress: '0xa', jurisdiction: Jurisdiction.US });
      kyc.registerHolder({ holderId: 'h2', walletAddress: '0xb', jurisdiction: Jurisdiction.US });
      kyc.registerHolder({ holderId: 'h3', walletAddress: '0xc', jurisdiction: Jurisdiction.EU });

      const report = reporter.generateComplianceReport('token-1', new Date(0), new Date());
      expect(report.jurisdictionBreakdown[Jurisdiction.US]).toBe(2);
      expect(report.jurisdictionBreakdown[Jurisdiction.EU]).toBe(1);
    });

    it('should include investor type breakdown', () => {
      kyc.registerHolder({ holderId: 'h1', walletAddress: '0xa', jurisdiction: Jurisdiction.US, investorType: InvestorType.ACCREDITED });
      kyc.registerHolder({ holderId: 'h2', walletAddress: '0xb', jurisdiction: Jurisdiction.EU, investorType: InvestorType.INSTITUTIONAL });
      kyc.registerHolder({ holderId: 'h3', walletAddress: '0xc', jurisdiction: Jurisdiction.US });

      const report = reporter.generateComplianceReport('token-1', new Date(0), new Date());
      expect(report.investorTypeBreakdown[InvestorType.ACCREDITED]).toBe(1);
      expect(report.investorTypeBreakdown[InvestorType.INSTITUTIONAL]).toBe(1);
      expect(report.investorTypeBreakdown[InvestorType.RETAIL]).toBe(1);
    });
  });

  // ── Holder Concentration ──────────────────────────────────────

  describe('generateHolderConcentrationReport', () => {
    it('should compute HHI and Gini for equal distribution', () => {
      const amounts = new Map([
        ['h1', 250],
        ['h2', 250],
        ['h3', 250],
        ['h4', 250],
      ]);
      const report = reporter.generateHolderConcentrationReport('token-1', amounts);
      expect(report.totalHolders).toBe(4);
      expect(report.herfindahlIndex).toBe(2500); // 4 * (0.25^2) * 10000
      expect(report.giniCoefficient).toBe(0);
    });

    it('should compute high HHI for concentrated distribution', () => {
      const amounts = new Map([
        ['whale', 990],
        ['small1', 5],
        ['small2', 5],
      ]);
      const report = reporter.generateHolderConcentrationReport('token-1', amounts);
      expect(report.herfindahlIndex).toBeGreaterThan(9000);
      expect(report.giniCoefficient).toBeGreaterThan(0.5);
    });

    it('should return top 5 holders sorted by amount', () => {
      const amounts = new Map([
        ['h1', 100], ['h2', 500], ['h3', 300],
        ['h4', 50], ['h5', 200], ['h6', 150],
      ]);
      const report = reporter.generateHolderConcentrationReport('token-1', amounts);
      expect(report.top5Holders.length).toBe(5);
      expect(report.top5Holders[0].holderId).toBe('h2');
      expect(report.top5Holders[0].amount).toBe(500);
    });

    it('should handle single holder', () => {
      const amounts = new Map([['whale', 1000]]);
      const report = reporter.generateHolderConcentrationReport('token-1', amounts);
      expect(report.herfindahlIndex).toBe(10000);
      expect(report.giniCoefficient).toBe(0); // single holder = trivially equal
    });

    it('should handle empty holders', () => {
      const report = reporter.generateHolderConcentrationReport('token-1', new Map());
      expect(report.totalHolders).toBe(0);
      expect(report.herfindahlIndex).toBe(0);
    });

    it('should compute correct percentages', () => {
      const amounts = new Map([['h1', 700], ['h2', 300]]);
      const report = reporter.generateHolderConcentrationReport('token-1', amounts);
      expect(report.top5Holders[0].percentage).toBe(70);
      expect(report.top5Holders[1].percentage).toBe(30);
    });
  });

  // ── Jurisdiction Report ───────────────────────────────────────

  describe('generateJurisdictionReport', () => {
    it('should breakdown holders by jurisdiction', () => {
      kyc.registerHolder({ holderId: 'h1', walletAddress: '0xa', jurisdiction: Jurisdiction.US });
      kyc.registerHolder({ holderId: 'h2', walletAddress: '0xb', jurisdiction: Jurisdiction.US });
      kyc.registerHolder({ holderId: 'h3', walletAddress: '0xc', jurisdiction: Jurisdiction.EU });
      kyc.registerHolder({ holderId: 'h4', walletAddress: '0xd', jurisdiction: Jurisdiction.SG });

      const report = reporter.generateJurisdictionReport();
      expect(report.totalHolders).toBe(4);
      const usEntry = report.jurisdictionBreakdown.find(j => j.jurisdiction === Jurisdiction.US);
      expect(usEntry?.count).toBe(2);
      expect(usEntry?.percentage).toBe(50);
    });

    it('should return empty report with no holders', () => {
      const report = reporter.generateJurisdictionReport();
      expect(report.totalHolders).toBe(0);
      expect(report.jurisdictionBreakdown.length).toBe(0);
    });

    it('should sort by count descending', () => {
      kyc.registerHolder({ holderId: 'h1', walletAddress: '0xa', jurisdiction: Jurisdiction.US });
      kyc.registerHolder({ holderId: 'h2', walletAddress: '0xb', jurisdiction: Jurisdiction.US });
      kyc.registerHolder({ holderId: 'h3', walletAddress: '0xc', jurisdiction: Jurisdiction.EU });

      const report = reporter.generateJurisdictionReport();
      expect(report.jurisdictionBreakdown[0].jurisdiction).toBe(Jurisdiction.US);
    });
  });

  // ── Suspicious Activity Report ────────────────────────────────

  describe('generateSuspiciousActivityReport', () => {
    it('should identify high-risk holders', () => {
      kyc.registerHolder({ holderId: 'h1', walletAddress: '0xa', jurisdiction: Jurisdiction.US });
      kyc.approveEnhancedKYC('h1', { pepScreenPassed: false, sanctionsScreenPassed: true, amlRiskLevel: AMLRiskLevel.HIGH });

      const report = reporter.generateSuspiciousActivityReport(new Date(0), new Date());
      expect(report.highRiskHolders.length).toBe(1);
      expect(report.highRiskHolders[0].flags).toContain('AML_HIGH_RISK');
      expect(report.highRiskHolders[0].flags).toContain('PEP_FLAG');
    });

    it('should flag prohibited AML level', () => {
      kyc.registerHolder({ holderId: 'h1', walletAddress: '0xa', jurisdiction: Jurisdiction.US });
      kyc.approveEnhancedKYC('h1', { pepScreenPassed: true, sanctionsScreenPassed: false, amlRiskLevel: AMLRiskLevel.LOW });

      const report = reporter.generateSuspiciousActivityReport(new Date(0), new Date());
      expect(report.highRiskHolders.length).toBe(1);
      expect(report.highRiskHolders[0].flags).toContain('AML_PROHIBITED');
    });

    it('should count blocked transfers in period', () => {
      validator.registerToken({ ...makeSimpleConfig('token-1'), requiredKYCLevel: KYCStatus.ENHANCED });
      validator.validateTransfer({ tokenId: 'token-1', from: '0xa', to: '0xb', amount: 100, requestedAt: new Date() });

      const report = reporter.generateSuspiciousActivityReport(new Date(0), new Date());
      expect(report.blockedTransfers).toBe(1);
    });

    it('should count PEP flags', () => {
      kyc.registerHolder({ holderId: 'h1', walletAddress: '0xa', jurisdiction: Jurisdiction.US });
      kyc.approveEnhancedKYC('h1', { pepScreenPassed: false, sanctionsScreenPassed: true, amlRiskLevel: AMLRiskLevel.HIGH });

      const report = reporter.generateSuspiciousActivityReport(new Date(0), new Date());
      expect(report.pepFlags).toBe(1);
    });

    it('should return clean report when no suspicious activity', () => {
      kyc.registerHolder({ holderId: 'h1', walletAddress: '0xa', jurisdiction: Jurisdiction.US });
      kyc.approveEnhancedKYC('h1', { pepScreenPassed: true, sanctionsScreenPassed: true, amlRiskLevel: AMLRiskLevel.LOW });

      const report = reporter.generateSuspiciousActivityReport(new Date(0), new Date());
      expect(report.highRiskHolders.length).toBe(0);
      expect(report.blockedTransfers).toBe(0);
    });
  });

  // ── Audit Trail ───────────────────────────────────────────────

  describe('exportAuditTrail', () => {
    it('should export combined audit trail from all subsystems', () => {
      kyc.registerHolder({ holderId: 'h1', walletAddress: '0xa', jurisdiction: Jurisdiction.US });
      kyc.approveBasicKYC('h1');
      lists.addToBlacklist('0xbad', 'admin', 'suspicious');
      validator.registerToken(makeSimpleConfig('token-1'));
      validator.validateTransfer({ tokenId: 'token-1', from: '0xa', to: '0xb', amount: 100, requestedAt: new Date() });

      const trail = reporter.exportAuditTrail();
      expect(trail.length).toBeGreaterThan(0);
      // Should be sorted by timestamp
      for (let i = 1; i < trail.length; i++) {
        expect(trail[i].timestamp.getTime()).toBeGreaterThanOrEqual(trail[i - 1].timestamp.getTime());
      }
    });

    it('should filter by date range', () => {
      kyc.registerHolder({ holderId: 'h1', walletAddress: '0xa', jurisdiction: Jurisdiction.US });
      kyc.approveBasicKYC('h1');

      const future = new Date();
      future.setFullYear(future.getFullYear() + 1);
      const farFuture = new Date();
      farFuture.setFullYear(farFuture.getFullYear() + 2);

      const trail = reporter.exportAuditTrail(future, farFuture);
      expect(trail.length).toBe(0);
    });

    it('should return empty trail with no events', () => {
      const trail = reporter.exportAuditTrail();
      expect(trail).toEqual([]);
    });

    it('should include source identifier in audit entries', () => {
      kyc.registerHolder({ holderId: 'h1', walletAddress: '0xa', jurisdiction: Jurisdiction.US });
      kyc.approveBasicKYC('h1');

      const trail = reporter.exportAuditTrail();
      expect(trail.some(e => e.source === 'evt')).toBe(true); // from KYC events
    });
  });
});
