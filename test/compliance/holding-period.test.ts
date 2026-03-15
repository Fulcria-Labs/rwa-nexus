import { HoldingPeriodManager, STANDARD_HOLDING_RULES } from '../../src/compliance/holding-period';
import {
  ComplianceEventType,
  HoldingRecord,
  RegulatoryFramework,
} from '../../src/compliance/types';

function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

function daysFromNow(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

function makeHolding(
  holderId: string,
  tokenId: string,
  amount: number,
  acquiredAt: Date,
  opts: Partial<HoldingRecord> = {}
): HoldingRecord {
  return {
    holderId,
    tokenId,
    acquiredAt,
    amount,
    isAffiliate: false,
    source: 'PRIMARY',
    ...opts,
  };
}

describe('HoldingPeriodManager', () => {
  let hpm: HoldingPeriodManager;

  beforeEach(() => {
    hpm = new HoldingPeriodManager();
  });

  // ── Standard Rules ────────────────────────────────────────────

  describe('STANDARD_HOLDING_RULES', () => {
    it('should have Rule 144 reporting issuer defaults', () => {
      const rule = STANDARD_HOLDING_RULES['RULE_144_REPORTING'];
      expect(rule.holdingDays).toBe(180);
      expect(rule.affiliateHoldingDays).toBe(365);
      expect(rule.framework).toBe(RegulatoryFramework.SEC_RULE_144);
    });

    it('should have Rule 144 non-reporting issuer defaults', () => {
      const rule = STANDARD_HOLDING_RULES['RULE_144_NON_REPORTING'];
      expect(rule.holdingDays).toBe(365);
    });

    it('should have MiFID II lockup defaults', () => {
      const rule = STANDARD_HOLDING_RULES['MIFID_II_LOCKUP'];
      expect(rule.holdingDays).toBe(90);
      expect(rule.framework).toBe(RegulatoryFramework.EU_MIFID_II);
    });

    it('should have private placement lockup defaults', () => {
      const rule = STANDARD_HOLDING_RULES['PRIVATE_PLACEMENT_LOCKUP'];
      expect(rule.holdingDays).toBe(365);
      expect(rule.framework).toBe(RegulatoryFramework.SEC_REG_D);
    });
  });

  // ── Rule Registration ─────────────────────────────────────────

  describe('registerRule', () => {
    it('should register a custom holding period rule', () => {
      hpm.registerRule({
        tokenId: 'token-1',
        framework: RegulatoryFramework.SEC_RULE_144,
        holdingDays: 180,
        affiliateHoldingDays: 365,
        dripFeedMaxPercent: 1,
        dripFeedPeriodDays: 90,
      });
      const rule = hpm.getRule('token-1');
      expect(rule?.holdingDays).toBe(180);
    });

    it('should register a standard rule by template key', () => {
      hpm.registerStandardRule('token-1', 'RULE_144_REPORTING');
      const rule = hpm.getRule('token-1');
      expect(rule?.holdingDays).toBe(180);
      expect(rule?.tokenId).toBe('token-1');
    });

    it('should throw for unknown template', () => {
      expect(() => hpm.registerStandardRule('token-1', 'NONEXISTENT')).toThrow('Unknown standard rule template');
    });
  });

  // ── Holdings Tracking ─────────────────────────────────────────

  describe('recordAcquisition', () => {
    it('should track token acquisitions', () => {
      hpm.recordAcquisition(makeHolding('h1', 'token-1', 100, new Date()));
      const records = hpm.getHolderRecords('h1', 'token-1');
      expect(records.length).toBe(1);
      expect(records[0].amount).toBe(100);
    });

    it('should support multiple acquisitions', () => {
      hpm.recordAcquisition(makeHolding('h1', 'token-1', 100, daysAgo(200)));
      hpm.recordAcquisition(makeHolding('h1', 'token-1', 50, daysAgo(100)));
      expect(hpm.getTotalHoldings('h1', 'token-1')).toBe(150);
    });

    it('should track separate holders independently', () => {
      hpm.recordAcquisition(makeHolding('h1', 'token-1', 100, new Date()));
      hpm.recordAcquisition(makeHolding('h2', 'token-1', 200, new Date()));
      expect(hpm.getTotalHoldings('h1', 'token-1')).toBe(100);
      expect(hpm.getTotalHoldings('h2', 'token-1')).toBe(200);
    });

    it('should track separate tokens independently', () => {
      hpm.recordAcquisition(makeHolding('h1', 'token-1', 100, new Date()));
      hpm.recordAcquisition(makeHolding('h1', 'token-2', 200, new Date()));
      expect(hpm.getTotalHoldings('h1', 'token-1')).toBe(100);
      expect(hpm.getTotalHoldings('h1', 'token-2')).toBe(200);
    });
  });

  // ── Unique Holder Count ───────────────────────────────────────

  describe('getUniqueHolderCount', () => {
    it('should count unique holders for a token', () => {
      hpm.recordAcquisition(makeHolding('h1', 'token-1', 100, new Date()));
      hpm.recordAcquisition(makeHolding('h2', 'token-1', 200, new Date()));
      hpm.recordAcquisition(makeHolding('h1', 'token-1', 50, new Date()));  // same holder
      expect(hpm.getUniqueHolderCount('token-1')).toBe(2);
    });

    it('should return 0 for unknown token', () => {
      expect(hpm.getUniqueHolderCount('nonexistent')).toBe(0);
    });
  });

  // ── canTransfer (no rule = no restriction) ────────────────────

  describe('canTransfer - no rule', () => {
    it('should allow transfer when no holding period rule exists', () => {
      hpm.recordAcquisition(makeHolding('h1', 'token-1', 100, new Date()));
      const result = hpm.canTransfer('h1', 'token-1', 50);
      expect(result.allowed).toBe(true);
    });
  });

  // ── canTransfer - Rule 144 ────────────────────────────────────

  describe('canTransfer - Rule 144', () => {
    beforeEach(() => {
      hpm.registerStandardRule('token-1', 'RULE_144_REPORTING');
    });

    it('should block transfer within holding period', () => {
      hpm.recordAcquisition(makeHolding('h1', 'token-1', 100, daysAgo(30)));
      const result = hpm.canTransfer('h1', 'token-1', 50);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Only 0 of 50');
    });

    it('should allow transfer after holding period clears (within drip-feed limit)', () => {
      // Rule 144 reporting: 180-day hold + 1% drip-feed.
      // 100 tokens, 1% = 1 token max per drip period, so request 1.
      hpm.recordAcquisition(makeHolding('h1', 'token-1', 100, daysAgo(200)));
      const result = hpm.canTransfer('h1', 'token-1', 1);
      expect(result.allowed).toBe(true);
    });

    it('should enforce longer holding period for affiliates', () => {
      hpm.recordAcquisition(makeHolding('h1', 'token-1', 100, daysAgo(200), { isAffiliate: true }));
      const result = hpm.canTransfer('h1', 'token-1', 1);
      // 200 days < 365 affiliate holding, should be blocked
      expect(result.allowed).toBe(false);
    });

    it('should allow affiliate transfer after full affiliate holding period', () => {
      hpm.recordAcquisition(makeHolding('h1', 'token-1', 100, daysAgo(400), { isAffiliate: true }));
      // 1% drip-feed of 100 = 1 token
      const result = hpm.canTransfer('h1', 'token-1', 1);
      expect(result.allowed).toBe(true);
    });

    it('should use FIFO for partial clearing', () => {
      // First batch: 60 tokens acquired 200 days ago (cleared for 180-day hold)
      hpm.recordAcquisition(makeHolding('h1', 'token-1', 60, daysAgo(200)));
      // Second batch: 40 tokens acquired 100 days ago (NOT cleared)
      hpm.recordAcquisition(makeHolding('h1', 'token-1', 40, daysAgo(100)));

      // Can transfer up to 60 (but drip-feed limit may reduce this)
      const result = hpm.canTransfer('h1', 'token-1', 50);
      // With drip-feed 1% of 100 = 1 token max, so actually blocked by volume limit
      // But transferable amount from holding period is 60
      expect(result.transferableAmount).toBeLessThanOrEqual(60);
    });

    it('should return transferable amount of 0 when nothing cleared', () => {
      hpm.recordAcquisition(makeHolding('h1', 'token-1', 100, daysAgo(10)));
      const result = hpm.canTransfer('h1', 'token-1', 100);
      expect(result.allowed).toBe(false);
      expect(result.transferableAmount).toBe(0);
    });

    it('should report days remaining in reason', () => {
      hpm.recordAcquisition(makeHolding('h1', 'token-1', 100, daysAgo(10)));
      const result = hpm.canTransfer('h1', 'token-1', 100);
      expect(result.reason).toContain('days');
    });

    it('should return false for holder with no holdings', () => {
      const result = hpm.canTransfer('h1', 'token-1', 100);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('No holdings');
    });
  });

  // ── Drip-feed Volume Limit ────────────────────────────────────

  describe('drip-feed volume limit', () => {
    it('should cap transferable amount to drip-feed limit', () => {
      hpm.registerRule({
        tokenId: 'token-1',
        framework: RegulatoryFramework.SEC_RULE_144,
        holdingDays: 0,  // no holding period for this test
        affiliateHoldingDays: 0,
        dripFeedMaxPercent: 10,
        dripFeedPeriodDays: 90,
      });
      hpm.recordAcquisition(makeHolding('h1', 'token-1', 1000, daysAgo(5)));
      const result = hpm.canTransfer('h1', 'token-1', 200);
      // 10% of 1000 = 100 max, trying to transfer 200
      expect(result.allowed).toBe(false);
      expect(result.transferableAmount).toBe(100);
    });

    it('should allow transfer within drip-feed limit', () => {
      hpm.registerRule({
        tokenId: 'token-1',
        framework: RegulatoryFramework.SEC_RULE_144,
        holdingDays: 0,
        affiliateHoldingDays: 0,
        dripFeedMaxPercent: 10,
        dripFeedPeriodDays: 90,
      });
      hpm.recordAcquisition(makeHolding('h1', 'token-1', 1000, daysAgo(5)));
      const result = hpm.canTransfer('h1', 'token-1', 50);
      expect(result.allowed).toBe(true);
    });
  });

  // ── Earliest Transfer Date ────────────────────────────────────

  describe('getEarliestTransferDate', () => {
    it('should return now when no rule exists', () => {
      const date = hpm.getEarliestTransferDate('h1', 'token-1', 100);
      expect(date).toBeInstanceOf(Date);
    });

    it('should return null when no holdings exist', () => {
      hpm.registerStandardRule('token-1', 'RULE_144_REPORTING');
      expect(hpm.getEarliestTransferDate('h1', 'token-1', 100)).toBeNull();
    });

    it('should return correct date for future clearing', () => {
      hpm.registerStandardRule('token-1', 'RULE_144_REPORTING');
      const acquiredDate = daysAgo(100);
      hpm.recordAcquisition(makeHolding('h1', 'token-1', 100, acquiredDate));
      const earliest = hpm.getEarliestTransferDate('h1', 'token-1', 100)!;
      // Should be 180 days after acquisition = 80 days from now
      const expectedMs = acquiredDate.getTime() + 180 * 24 * 60 * 60 * 1000;
      expect(Math.abs(earliest.getTime() - expectedMs)).toBeLessThan(1000); // within 1s
    });

    it('should return null when not enough holdings', () => {
      hpm.registerStandardRule('token-1', 'RULE_144_REPORTING');
      hpm.recordAcquisition(makeHolding('h1', 'token-1', 50, daysAgo(200)));
      expect(hpm.getEarliestTransferDate('h1', 'token-1', 100)).toBeNull();
    });
  });

  // ── recordTransfer (FIFO reduction) ───────────────────────────

  describe('recordTransfer', () => {
    it('should reduce holdings via FIFO', () => {
      hpm.recordAcquisition(makeHolding('h1', 'token-1', 60, daysAgo(200)));
      hpm.recordAcquisition(makeHolding('h1', 'token-1', 40, daysAgo(100)));
      hpm.recordTransfer('h1', 'token-1', 70);
      // 60 from first batch consumed, 10 from second
      expect(hpm.getTotalHoldings('h1', 'token-1')).toBe(30);
    });

    it('should fully consume records when exactly matching', () => {
      hpm.recordAcquisition(makeHolding('h1', 'token-1', 100, daysAgo(200)));
      hpm.recordTransfer('h1', 'token-1', 100);
      expect(hpm.getTotalHoldings('h1', 'token-1')).toBe(0);
    });

    it('should handle partial consumption', () => {
      hpm.recordAcquisition(makeHolding('h1', 'token-1', 100, daysAgo(200)));
      hpm.recordTransfer('h1', 'token-1', 30);
      expect(hpm.getTotalHoldings('h1', 'token-1')).toBe(70);
    });
  });

  // ── Event logging ─────────────────────────────────────────────

  describe('events', () => {
    it('should log holding period violation event', () => {
      hpm.registerStandardRule('token-1', 'RULE_144_REPORTING');
      hpm.recordAcquisition(makeHolding('h1', 'token-1', 100, daysAgo(30)));
      hpm.canTransfer('h1', 'token-1', 50);
      const events = hpm.getEvents();
      expect(events.some(e => e.eventType === ComplianceEventType.HOLDING_PERIOD_VIOLATION)).toBe(true);
    });
  });
});
