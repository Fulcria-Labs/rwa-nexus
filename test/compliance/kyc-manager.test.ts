import { KYCManager } from '../../src/compliance/kyc-manager';
import {
  AMLRiskLevel,
  ComplianceEventType,
  InvestorType,
  Jurisdiction,
  KYCStatus,
} from '../../src/compliance/types';

describe('KYCManager', () => {
  let kyc: KYCManager;

  beforeEach(() => {
    kyc = new KYCManager(365);
  });

  // ── Registration ──────────────────────────────────────────────

  describe('registerHolder', () => {
    it('should register a new holder with PENDING status', () => {
      const record = kyc.registerHolder({
        holderId: 'h1',
        walletAddress: '0xabc',
        jurisdiction: Jurisdiction.US,
      });
      expect(record.holderId).toBe('h1');
      expect(record.status).toBe(KYCStatus.PENDING);
      expect(record.investorType).toBe(InvestorType.RETAIL);
      expect(record.jurisdiction).toBe(Jurisdiction.US);
      expect(record.amlRiskLevel).toBe(AMLRiskLevel.MEDIUM);
      expect(record.verifiedAt).toBeNull();
    });

    it('should register with specified investor type', () => {
      const record = kyc.registerHolder({
        holderId: 'h1',
        walletAddress: '0xabc',
        jurisdiction: Jurisdiction.EU,
        investorType: InvestorType.ACCREDITED,
      });
      expect(record.investorType).toBe(InvestorType.ACCREDITED);
    });

    it('should throw on duplicate holder ID', () => {
      kyc.registerHolder({ holderId: 'h1', walletAddress: '0xabc', jurisdiction: Jurisdiction.US });
      expect(() =>
        kyc.registerHolder({ holderId: 'h1', walletAddress: '0xdef', jurisdiction: Jurisdiction.US })
      ).toThrow('Holder h1 already registered');
    });

    it('should throw on duplicate wallet address', () => {
      kyc.registerHolder({ holderId: 'h1', walletAddress: '0xabc', jurisdiction: Jurisdiction.US });
      expect(() =>
        kyc.registerHolder({ holderId: 'h2', walletAddress: '0xabc', jurisdiction: Jurisdiction.EU })
      ).toThrow('Wallet 0xabc already associated');
    });

    it('should correctly increment holder count', () => {
      expect(kyc.getHolderCount()).toBe(0);
      kyc.registerHolder({ holderId: 'h1', walletAddress: '0xa', jurisdiction: Jurisdiction.US });
      kyc.registerHolder({ holderId: 'h2', walletAddress: '0xb', jurisdiction: Jurisdiction.EU });
      expect(kyc.getHolderCount()).toBe(2);
    });
  });

  // ── Basic KYC Approval ────────────────────────────────────────

  describe('approveBasicKYC', () => {
    it('should approve basic KYC and set verified date', () => {
      kyc.registerHolder({ holderId: 'h1', walletAddress: '0xa', jurisdiction: Jurisdiction.US });
      const record = kyc.approveBasicKYC('h1', ['doc-1', 'doc-2']);
      expect(record.status).toBe(KYCStatus.BASIC);
      expect(record.verifiedAt).toBeInstanceOf(Date);
      expect(record.expiresAt).toBeInstanceOf(Date);
      expect(record.documents).toContain('doc-1');
      expect(record.documents).toContain('doc-2');
    });

    it('should throw for unknown holder', () => {
      expect(() => kyc.approveBasicKYC('unknown')).toThrow('not found');
    });

    it('should log a KYC_APPROVED event', () => {
      kyc.registerHolder({ holderId: 'h1', walletAddress: '0xa', jurisdiction: Jurisdiction.US });
      kyc.approveBasicKYC('h1');
      const events = kyc.getEvents();
      expect(events.some(e => e.eventType === ComplianceEventType.KYC_APPROVED)).toBe(true);
    });
  });

  // ── Enhanced KYC ──────────────────────────────────────────────

  describe('approveEnhancedKYC', () => {
    beforeEach(() => {
      kyc.registerHolder({ holderId: 'h1', walletAddress: '0xa', jurisdiction: Jurisdiction.US });
    });

    it('should approve enhanced KYC with all checks passing', () => {
      const record = kyc.approveEnhancedKYC('h1', {
        pepScreenPassed: true,
        sanctionsScreenPassed: true,
        amlRiskLevel: AMLRiskLevel.LOW,
        documentIds: ['ekyc-1'],
      });
      expect(record.status).toBe(KYCStatus.ENHANCED);
      expect(record.pepScreenPassed).toBe(true);
      expect(record.sanctionsScreenPassed).toBe(true);
      expect(record.amlRiskLevel).toBe(AMLRiskLevel.LOW);
    });

    it('should reject if sanctions screen fails', () => {
      const record = kyc.approveEnhancedKYC('h1', {
        pepScreenPassed: true,
        sanctionsScreenPassed: false,
        amlRiskLevel: AMLRiskLevel.LOW,
      });
      expect(record.status).toBe(KYCStatus.REJECTED);
      expect(record.amlRiskLevel).toBe(AMLRiskLevel.PROHIBITED);
    });

    it('should log SANCTIONS_HIT event when sanctions fail', () => {
      kyc.approveEnhancedKYC('h1', {
        pepScreenPassed: true,
        sanctionsScreenPassed: false,
        amlRiskLevel: AMLRiskLevel.LOW,
      });
      const events = kyc.getEvents();
      expect(events.some(e => e.eventType === ComplianceEventType.SANCTIONS_HIT)).toBe(true);
    });

    it('should reject if AML risk level is PROHIBITED', () => {
      const record = kyc.approveEnhancedKYC('h1', {
        pepScreenPassed: true,
        sanctionsScreenPassed: true,
        amlRiskLevel: AMLRiskLevel.PROHIBITED,
      });
      expect(record.status).toBe(KYCStatus.REJECTED);
    });

    it('should flag AML event when PEP screen fails', () => {
      kyc.approveEnhancedKYC('h1', {
        pepScreenPassed: false,
        sanctionsScreenPassed: true,
        amlRiskLevel: AMLRiskLevel.HIGH,
      });
      const events = kyc.getEvents();
      expect(events.some(e => e.eventType === ComplianceEventType.AML_FLAG)).toBe(true);
    });
  });

  // ── Rejection ─────────────────────────────────────────────────

  describe('rejectKYC', () => {
    it('should reject and log event', () => {
      kyc.registerHolder({ holderId: 'h1', walletAddress: '0xa', jurisdiction: Jurisdiction.US });
      const record = kyc.rejectKYC('h1', 'Fraudulent documents');
      expect(record.status).toBe(KYCStatus.REJECTED);
      const events = kyc.getEvents();
      expect(events.some(e => e.eventType === ComplianceEventType.KYC_REJECTED)).toBe(true);
    });
  });

  // ── Expiry ────────────────────────────────────────────────────

  describe('checkExpiry', () => {
    it('should return true for valid KYC within expiry', () => {
      kyc.registerHolder({ holderId: 'h1', walletAddress: '0xa', jurisdiction: Jurisdiction.US });
      kyc.approveBasicKYC('h1');
      expect(kyc.checkExpiry('h1')).toBe(true);
    });

    it('should return false and mark expired when past expiry date', () => {
      kyc.registerHolder({ holderId: 'h1', walletAddress: '0xa', jurisdiction: Jurisdiction.US });
      kyc.approveBasicKYC('h1');

      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 2);
      expect(kyc.checkExpiry('h1', futureDate)).toBe(false);

      const record = kyc.getRecord('h1')!;
      expect(record.status).toBe(KYCStatus.EXPIRED);
    });

    it('should return false for PENDING holders', () => {
      kyc.registerHolder({ holderId: 'h1', walletAddress: '0xa', jurisdiction: Jurisdiction.US });
      expect(kyc.checkExpiry('h1')).toBe(false);
    });

    it('should return false for REJECTED holders', () => {
      kyc.registerHolder({ holderId: 'h1', walletAddress: '0xa', jurisdiction: Jurisdiction.US });
      kyc.rejectKYC('h1', 'bad');
      expect(kyc.checkExpiry('h1')).toBe(false);
    });

    it('should log KYC_EXPIRED event', () => {
      kyc.registerHolder({ holderId: 'h1', walletAddress: '0xa', jurisdiction: Jurisdiction.US });
      kyc.approveBasicKYC('h1');
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 2);
      kyc.checkExpiry('h1', futureDate);
      expect(kyc.getEvents().some(e => e.eventType === ComplianceEventType.KYC_EXPIRED)).toBe(true);
    });
  });

  // ── Renewal ───────────────────────────────────────────────────

  describe('renewKYC', () => {
    it('should extend expiry for BASIC holder', () => {
      kyc.registerHolder({ holderId: 'h1', walletAddress: '0xa', jurisdiction: Jurisdiction.US });
      kyc.approveBasicKYC('h1');
      const record = kyc.renewKYC('h1');
      expect(record.expiresAt).toBeInstanceOf(Date);
      expect(record.expiresAt!.getTime()).toBeGreaterThan(Date.now());
    });

    it('should throw for rejected holders', () => {
      kyc.registerHolder({ holderId: 'h1', walletAddress: '0xa', jurisdiction: Jurisdiction.US });
      kyc.rejectKYC('h1', 'bad');
      expect(() => kyc.renewKYC('h1')).toThrow('Cannot renew rejected KYC');
    });

    it('should throw for PENDING holders', () => {
      kyc.registerHolder({ holderId: 'h1', walletAddress: '0xa', jurisdiction: Jurisdiction.US });
      expect(() => kyc.renewKYC('h1')).toThrow('Cannot renew KYC that has not been approved');
    });
  });

  // ── Investor Type ─────────────────────────────────────────────

  describe('setInvestorType', () => {
    it('should update investor type', () => {
      kyc.registerHolder({ holderId: 'h1', walletAddress: '0xa', jurisdiction: Jurisdiction.US });
      const record = kyc.setInvestorType('h1', InvestorType.INSTITUTIONAL);
      expect(record.investorType).toBe(InvestorType.INSTITUTIONAL);
    });
  });

  // ── Queries ───────────────────────────────────────────────────

  describe('queries', () => {
    beforeEach(() => {
      kyc.registerHolder({ holderId: 'h1', walletAddress: '0xa', jurisdiction: Jurisdiction.US });
      kyc.registerHolder({ holderId: 'h2', walletAddress: '0xb', jurisdiction: Jurisdiction.EU });
      kyc.registerHolder({ holderId: 'h3', walletAddress: '0xc', jurisdiction: Jurisdiction.US, investorType: InvestorType.ACCREDITED });
      kyc.approveBasicKYC('h1');
      kyc.approveEnhancedKYC('h2', { pepScreenPassed: true, sanctionsScreenPassed: true, amlRiskLevel: AMLRiskLevel.LOW });
    });

    it('should get record by wallet address', () => {
      const record = kyc.getRecordByWallet('0xa');
      expect(record?.holderId).toBe('h1');
    });

    it('should return undefined for unknown wallet', () => {
      expect(kyc.getRecordByWallet('0xunknown')).toBeUndefined();
    });

    it('should get all records', () => {
      expect(kyc.getAllRecords().length).toBe(3);
    });

    it('should filter by status', () => {
      const basic = kyc.getRecordsByStatus(KYCStatus.BASIC);
      expect(basic.length).toBe(1);
      expect(basic[0].holderId).toBe('h1');
    });

    it('should filter by jurisdiction', () => {
      const us = kyc.getRecordsByJurisdiction(Jurisdiction.US);
      expect(us.length).toBe(2);
    });

    it('should filter by investor type', () => {
      const accredited = kyc.getRecordsByInvestorType(InvestorType.ACCREDITED);
      expect(accredited.length).toBe(1);
      expect(accredited[0].holderId).toBe('h3');
    });
  });

  // ── KYC Level Check ───────────────────────────────────────────

  describe('meetsKYCLevel', () => {
    beforeEach(() => {
      kyc.registerHolder({ holderId: 'h1', walletAddress: '0xa', jurisdiction: Jurisdiction.US });
      kyc.registerHolder({ holderId: 'h2', walletAddress: '0xb', jurisdiction: Jurisdiction.US });
      kyc.approveBasicKYC('h1');
      kyc.approveEnhancedKYC('h2', { pepScreenPassed: true, sanctionsScreenPassed: true, amlRiskLevel: AMLRiskLevel.LOW });
    });

    it('should return true when ENHANCED meets BASIC requirement', () => {
      expect(kyc.meetsKYCLevel('h2', KYCStatus.BASIC)).toBe(true);
    });

    it('should return false when BASIC does not meet ENHANCED requirement', () => {
      expect(kyc.meetsKYCLevel('h1', KYCStatus.ENHANCED)).toBe(false);
    });

    it('should return true when level matches exactly', () => {
      expect(kyc.meetsKYCLevel('h1', KYCStatus.BASIC)).toBe(true);
    });

    it('should return false for unknown holder', () => {
      expect(kyc.meetsKYCLevel('unknown', KYCStatus.BASIC)).toBe(false);
    });
  });

  // ── Investor Requirement ──────────────────────────────────────

  describe('meetsInvestorRequirement', () => {
    it('should return true when investor type matches', () => {
      kyc.registerHolder({ holderId: 'h1', walletAddress: '0xa', jurisdiction: Jurisdiction.US, investorType: InvestorType.ACCREDITED });
      expect(kyc.meetsInvestorRequirement('h1', [InvestorType.ACCREDITED, InvestorType.INSTITUTIONAL])).toBe(true);
    });

    it('should return false when investor type does not match', () => {
      kyc.registerHolder({ holderId: 'h1', walletAddress: '0xa', jurisdiction: Jurisdiction.US });
      expect(kyc.meetsInvestorRequirement('h1', [InvestorType.ACCREDITED])).toBe(false);
    });

    it('should return true when empty requirements', () => {
      kyc.registerHolder({ holderId: 'h1', walletAddress: '0xa', jurisdiction: Jurisdiction.US });
      expect(kyc.meetsInvestorRequirement('h1', [])).toBe(true);
    });
  });

  // ── Custom validity period ────────────────────────────────────

  describe('custom validity period', () => {
    it('should use custom validity days', () => {
      const shortKyc = new KYCManager(30);
      shortKyc.registerHolder({ holderId: 'h1', walletAddress: '0xa', jurisdiction: Jurisdiction.US });
      shortKyc.approveBasicKYC('h1');
      const record = shortKyc.getRecord('h1')!;
      const diffMs = record.expiresAt!.getTime() - record.verifiedAt!.getTime();
      const diffDays = diffMs / (24 * 60 * 60 * 1000);
      expect(diffDays).toBeCloseTo(30, 0);
    });
  });
});
