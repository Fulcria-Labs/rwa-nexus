import { ListManager } from '../../src/compliance/list-manager';
import { ComplianceEventType } from '../../src/compliance/types';

function daysFromNow(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

describe('ListManager', () => {
  let lm: ListManager;

  beforeEach(() => {
    lm = new ListManager();
  });

  // ── Blacklist ─────────────────────────────────────────────────

  describe('blacklist', () => {
    it('should add a wallet to the blacklist', () => {
      const entry = lm.addToBlacklist('0xBad', 'admin-1', 'Sanctions match');
      expect(entry.walletAddress).toBe('0xbad'); // normalized to lowercase
      expect(entry.reason).toBe('Sanctions match');
    });

    it('should detect blacklisted wallet', () => {
      lm.addToBlacklist('0xBad', 'admin-1', 'Suspicious');
      expect(lm.isBlacklisted('0xbad')).toBe(true);
      expect(lm.isBlacklisted('0xBAD')).toBe(true); // case insensitive
    });

    it('should return false for non-blacklisted wallet', () => {
      expect(lm.isBlacklisted('0xgood')).toBe(false);
    });

    it('should remove a wallet from the blacklist', () => {
      lm.addToBlacklist('0xBad', 'admin-1', 'Suspicious');
      const removed = lm.removeFromBlacklist('0xbad', 'admin-2', 'Cleared');
      expect(removed).toBe(true);
      expect(lm.isBlacklisted('0xbad')).toBe(false);
    });

    it('should return false when removing non-blacklisted wallet', () => {
      expect(lm.removeFromBlacklist('0xNotHere', 'admin', 'n/a')).toBe(false);
    });

    it('should handle blacklist expiry', () => {
      lm.addToBlacklist('0xTemp', 'admin-1', 'Temporary block', daysFromNow(-1));
      // Expired yesterday
      expect(lm.isBlacklisted('0xtemp')).toBe(false);
    });

    it('should keep non-expired blacklist entries active', () => {
      lm.addToBlacklist('0xTemp', 'admin-1', 'Temporary block', daysFromNow(30));
      expect(lm.isBlacklisted('0xtemp')).toBe(true);
    });

    it('should return full blacklist', () => {
      lm.addToBlacklist('0xa', 'admin', 'r1');
      lm.addToBlacklist('0xb', 'admin', 'r2');
      expect(lm.getBlacklist().length).toBe(2);
    });

    it('should count blacklisted entries', () => {
      lm.addToBlacklist('0xa', 'admin', 'r1');
      lm.addToBlacklist('0xb', 'admin', 'r2');
      expect(lm.getBlacklistCount()).toBe(2);
    });

    it('should log BLACKLIST_ADD event', () => {
      lm.addToBlacklist('0xa', 'admin', 'suspicious');
      const events = lm.getEvents();
      expect(events.some(e => e.eventType === ComplianceEventType.BLACKLIST_ADD)).toBe(true);
    });

    it('should log BLACKLIST_REMOVE event', () => {
      lm.addToBlacklist('0xa', 'admin', 'suspicious');
      lm.removeFromBlacklist('0xa', 'admin', 'cleared');
      const events = lm.getEvents();
      expect(events.some(e => e.eventType === ComplianceEventType.BLACKLIST_REMOVE)).toBe(true);
    });

    it('should handle permanent blacklist (null expiry)', () => {
      lm.addToBlacklist('0xa', 'admin', 'permanent');
      expect(lm.isBlacklisted('0xa')).toBe(true);
      // Check far future
      const future = new Date();
      future.setFullYear(future.getFullYear() + 100);
      expect(lm.isBlacklisted('0xa', future)).toBe(true);
    });
  });

  // ── Whitelist ─────────────────────────────────────────────────

  describe('whitelist', () => {
    it('should add a wallet to a token whitelist', () => {
      const entry = lm.addToWhitelist('token-1', '0xGood', 'admin-1', 'Approved investor');
      expect(entry.walletAddress).toBe('0xgood');
    });

    it('should detect whitelisted wallet for specific token', () => {
      lm.addToWhitelist('token-1', '0xGood', 'admin-1', 'Approved');
      expect(lm.isWhitelisted('0xgood', 'token-1')).toBe(true);
    });

    it('should return false for different token', () => {
      lm.addToWhitelist('token-1', '0xGood', 'admin-1', 'Approved');
      expect(lm.isWhitelisted('0xgood', 'token-2')).toBe(false);
    });

    it('should handle whitelist expiry', () => {
      lm.addToWhitelist('token-1', '0xGood', 'admin-1', 'Temp', daysFromNow(-1));
      expect(lm.isWhitelisted('0xgood', 'token-1')).toBe(false);
    });

    it('should keep non-expired whitelist entries active', () => {
      lm.addToWhitelist('token-1', '0xGood', 'admin-1', 'Temp', daysFromNow(30));
      expect(lm.isWhitelisted('0xgood', 'token-1')).toBe(true);
    });

    it('should remove wallet from whitelist', () => {
      lm.addToWhitelist('token-1', '0xGood', 'admin-1', 'Approved');
      const removed = lm.removeFromWhitelist('token-1', '0xgood', 'admin-2', 'No longer approved');
      expect(removed).toBe(true);
      expect(lm.isWhitelisted('0xgood', 'token-1')).toBe(false);
    });

    it('should return false when removing from non-existent whitelist', () => {
      expect(lm.removeFromWhitelist('token-1', '0xGood', 'admin', 'n/a')).toBe(false);
    });

    it('should get full whitelist for a token', () => {
      lm.addToWhitelist('token-1', '0xa', 'admin', 'r1');
      lm.addToWhitelist('token-1', '0xb', 'admin', 'r2');
      expect(lm.getWhitelist('token-1').length).toBe(2);
    });

    it('should return empty array for unknown token whitelist', () => {
      expect(lm.getWhitelist('nonexistent')).toEqual([]);
    });

    it('should count whitelisted entries', () => {
      lm.addToWhitelist('token-1', '0xa', 'admin', 'r1');
      lm.addToWhitelist('token-1', '0xb', 'admin', 'r2');
      expect(lm.getWhitelistCount('token-1')).toBe(2);
    });

    it('should return 0 for unknown token whitelist count', () => {
      expect(lm.getWhitelistCount('nonexistent')).toBe(0);
    });

    it('should clear entire whitelist for a token', () => {
      lm.addToWhitelist('token-1', '0xa', 'admin', 'r1');
      lm.addToWhitelist('token-1', '0xb', 'admin', 'r2');
      const count = lm.clearWhitelist('token-1', 'admin', 'Reset');
      expect(count).toBe(2);
      expect(lm.getWhitelistCount('token-1')).toBe(0);
    });

    it('should return 0 when clearing empty whitelist', () => {
      expect(lm.clearWhitelist('token-1', 'admin', 'Reset')).toBe(0);
    });

    it('should log WHITELIST_ADD event', () => {
      lm.addToWhitelist('token-1', '0xa', 'admin', 'approved');
      const events = lm.getEvents();
      expect(events.some(e => e.eventType === ComplianceEventType.WHITELIST_ADD)).toBe(true);
    });

    it('should log WHITELIST_REMOVE event', () => {
      lm.addToWhitelist('token-1', '0xa', 'admin', 'approved');
      lm.removeFromWhitelist('token-1', '0xa', 'admin', 'removed');
      const events = lm.getEvents();
      expect(events.some(e => e.eventType === ComplianceEventType.WHITELIST_REMOVE)).toBe(true);
    });
  });

  // ── Cross-token Queries ───────────────────────────────────────

  describe('getWhitelistedTokens', () => {
    it('should return all tokens a wallet is whitelisted for', () => {
      lm.addToWhitelist('token-1', '0xa', 'admin', 'r1');
      lm.addToWhitelist('token-2', '0xa', 'admin', 'r2');
      lm.addToWhitelist('token-3', '0xb', 'admin', 'r3'); // different wallet
      const tokens = lm.getWhitelistedTokens('0xa');
      expect(tokens).toContain('token-1');
      expect(tokens).toContain('token-2');
      expect(tokens).not.toContain('token-3');
    });

    it('should exclude expired whitelist entries', () => {
      lm.addToWhitelist('token-1', '0xa', 'admin', 'r1', daysFromNow(-1));
      lm.addToWhitelist('token-2', '0xa', 'admin', 'r2', daysFromNow(30));
      const tokens = lm.getWhitelistedTokens('0xa');
      expect(tokens).not.toContain('token-1');
      expect(tokens).toContain('token-2');
    });
  });
});
