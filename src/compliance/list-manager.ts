/**
 * Whitelist/blacklist manager for RWA token transfers.
 *
 * Supports:
 *  - Global blacklist (wallet blocked from all tokens)
 *  - Per-token whitelists (only approved wallets can receive specific tokens)
 *  - Time-based expiry for list entries
 *  - Admin audit trail (who added/removed entries and why)
 */

import {
  ComplianceEvent,
  ComplianceEventType,
  ListEntry,
} from './types';

export class ListManager {
  /** Global blacklist: any wallet here cannot send or receive any token. */
  private blacklist: Map<string, ListEntry> = new Map();

  /** Per-token whitelists: tokenId -> (walletAddress -> ListEntry) */
  private whitelists: Map<string, Map<string, ListEntry>> = new Map();

  private eventLog: ComplianceEvent[] = [];

  // ── Blacklist Operations ──────────────────────────────────────

  /**
   * Add a wallet to the global blacklist.
   */
  addToBlacklist(
    walletAddress: string,
    addedBy: string,
    reason: string,
    expiresAt: Date | null = null
  ): ListEntry {
    const normalized = walletAddress.toLowerCase();
    const entry: ListEntry = {
      walletAddress: normalized,
      addedAt: new Date(),
      addedBy,
      reason,
      expiresAt,
    };
    this.blacklist.set(normalized, entry);

    this.logEvent(ComplianceEventType.BLACKLIST_ADD, '', normalized, {
      addedBy,
      reason,
      expiresAt: expiresAt?.toISOString() ?? null,
    });

    return { ...entry };
  }

  /**
   * Remove a wallet from the global blacklist.
   */
  removeFromBlacklist(walletAddress: string, removedBy: string, reason: string): boolean {
    const normalized = walletAddress.toLowerCase();
    const existed = this.blacklist.delete(normalized);

    if (existed) {
      this.logEvent(ComplianceEventType.BLACKLIST_REMOVE, '', normalized, {
        removedBy,
        reason,
      });
    }

    return existed;
  }

  /**
   * Check if a wallet is blacklisted (considering expiry).
   */
  isBlacklisted(walletAddress: string, asOf: Date = new Date()): boolean {
    const normalized = walletAddress.toLowerCase();
    const entry = this.blacklist.get(normalized);
    if (!entry) return false;

    // Check if expired
    if (entry.expiresAt && asOf > entry.expiresAt) {
      this.blacklist.delete(normalized);
      return false;
    }

    return true;
  }

  /**
   * Get the full blacklist.
   */
  getBlacklist(): ListEntry[] {
    return Array.from(this.blacklist.values()).map(e => ({ ...e }));
  }

  getBlacklistCount(): number {
    return this.blacklist.size;
  }

  // ── Whitelist Operations ──────────────────────────────────────

  /**
   * Add a wallet to a token's whitelist.
   */
  addToWhitelist(
    tokenId: string,
    walletAddress: string,
    addedBy: string,
    reason: string,
    expiresAt: Date | null = null
  ): ListEntry {
    const normalized = walletAddress.toLowerCase();

    if (!this.whitelists.has(tokenId)) {
      this.whitelists.set(tokenId, new Map());
    }

    const entry: ListEntry = {
      walletAddress: normalized,
      addedAt: new Date(),
      addedBy,
      reason,
      expiresAt,
    };

    this.whitelists.get(tokenId)!.set(normalized, entry);

    this.logEvent(ComplianceEventType.WHITELIST_ADD, tokenId, normalized, {
      addedBy,
      reason,
      expiresAt: expiresAt?.toISOString() ?? null,
    });

    return { ...entry };
  }

  /**
   * Remove a wallet from a token's whitelist.
   */
  removeFromWhitelist(
    tokenId: string,
    walletAddress: string,
    removedBy: string,
    reason: string
  ): boolean {
    const normalized = walletAddress.toLowerCase();
    const tokenWhitelist = this.whitelists.get(tokenId);
    if (!tokenWhitelist) return false;

    const existed = tokenWhitelist.delete(normalized);

    if (existed) {
      this.logEvent(ComplianceEventType.WHITELIST_REMOVE, tokenId, normalized, {
        removedBy,
        reason,
      });
    }

    return existed;
  }

  /**
   * Check if a wallet is whitelisted for a specific token (considering expiry).
   */
  isWhitelisted(walletAddress: string, tokenId: string, asOf: Date = new Date()): boolean {
    const normalized = walletAddress.toLowerCase();
    const tokenWhitelist = this.whitelists.get(tokenId);
    if (!tokenWhitelist) return false;

    const entry = tokenWhitelist.get(normalized);
    if (!entry) return false;

    if (entry.expiresAt && asOf > entry.expiresAt) {
      tokenWhitelist.delete(normalized);
      return false;
    }

    return true;
  }

  /**
   * Get all whitelisted wallets for a token.
   */
  getWhitelist(tokenId: string): ListEntry[] {
    const tokenWhitelist = this.whitelists.get(tokenId);
    if (!tokenWhitelist) return [];
    return Array.from(tokenWhitelist.values()).map(e => ({ ...e }));
  }

  getWhitelistCount(tokenId: string): number {
    return this.whitelists.get(tokenId)?.size ?? 0;
  }

  /**
   * Clear the entire whitelist for a token.
   */
  clearWhitelist(tokenId: string, clearedBy: string, reason: string): number {
    const tokenWhitelist = this.whitelists.get(tokenId);
    if (!tokenWhitelist) return 0;

    const count = tokenWhitelist.size;
    tokenWhitelist.clear();

    this.logEvent(ComplianceEventType.WHITELIST_REMOVE, tokenId, '', {
      clearedBy,
      reason,
      walletCount: count,
    });

    return count;
  }

  // ── Queries ───────────────────────────────────────────────────

  /**
   * Get all tokens that a wallet is whitelisted for.
   */
  getWhitelistedTokens(walletAddress: string, asOf: Date = new Date()): string[] {
    const normalized = walletAddress.toLowerCase();
    const tokens: string[] = [];

    for (const [tokenId, whitelist] of this.whitelists) {
      const entry = whitelist.get(normalized);
      if (!entry) continue;
      if (entry.expiresAt && asOf > entry.expiresAt) continue;
      tokens.push(tokenId);
    }

    return tokens;
  }

  // ── Events ────────────────────────────────────────────────────

  getEvents(): ComplianceEvent[] {
    return [...this.eventLog];
  }

  private logEvent(
    eventType: ComplianceEventType,
    tokenId: string,
    walletAddress: string,
    details: Record<string, unknown>
  ): void {
    this.eventLog.push({
      id: `lm-${this.eventLog.length + 1}`,
      eventType,
      timestamp: new Date(),
      tokenId,
      walletAddress,
      details,
    });
  }
}
