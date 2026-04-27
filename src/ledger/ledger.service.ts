import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { randomUUID } from 'crypto';

export type LedgerAccountType = 'WALLET' | 'FIRSTKEY_SAVINGS' | 'ESCROW' | 'EXTERNAL';
export type LedgerEventType =
  | 'BANK_DEPOSIT'
  | 'CARD_TOPUP'
  | 'WALLET_TO_SAVINGS'
  | 'SCHEDULED_CONTRIBUTION_WALLET'
  | 'SCHEDULED_CONTRIBUTION_CARD'
  | 'INTEREST'
  | 'WITHDRAWAL'
  | 'EARLY_WITHDRAWAL'
  | 'ESCROW_HOLD'
  | 'ESCROW_RELEASE'
  | 'ESCROW_REFUND'
  | 'ANCHOR_SYNC_CORRECTION'
  | 'REVERSAL';

export interface LedgerEntryInput {
  userId: string;
  accountType: LedgerAccountType;
  entryType: 'DEBIT' | 'CREDIT';
  amount: number;
  balanceAfter: number;
  eventType: LedgerEventType;
  reference: string;
  description: string;
  groupRef?: string;
  anchorEventId?: string;
  anchorTransferId?: string;
  paystackRef?: string;
  metadata?: Record<string, any>;
}

@Injectable()
export class LedgerService {
  private readonly logger = new Logger(LedgerService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Record a single ledger entry. Non-throwing — P2002 (duplicate) is silently
   * ignored; all other errors are logged but not re-thrown so the primary
   * business operation is never blocked by ledger failures.
   */
  async record(entry: LedgerEntryInput): Promise<void> {
    try {
      await this.prisma.ledgerEntry.create({
        data: {
          userId: entry.userId,
          accountType: entry.accountType,
          entryType: entry.entryType,
          amount: entry.amount,
          balanceAfter: entry.balanceAfter,
          eventType: entry.eventType,
          reference: entry.reference,
          description: entry.description,
          groupRef: entry.groupRef,
          anchorEventId: entry.anchorEventId,
          anchorTransferId: entry.anchorTransferId,
          paystackRef: entry.paystackRef,
          metadata: entry.metadata,
        },
      });
    } catch (e: any) {
      if (e?.code === 'P2002') return; // already recorded — idempotent
      this.logger.error(`Ledger record failed for ref ${entry.reference}: ${e?.message}`);
    }
  }

  /**
   * Record a double-entry pair atomically (debit + credit).
   * Shares a groupRef so both legs are linked.
   * For EXTERNAL accounts, balanceAfter should be 0 (we don't track external balances).
   */
  async recordPair(
    debit: Omit<LedgerEntryInput, 'entryType'>,
    credit: Omit<LedgerEntryInput, 'entryType'>,
  ): Promise<void> {
    const groupRef = debit.groupRef ?? credit.groupRef ?? randomUUID();
    try {
      await this.prisma.$transaction([
        this.prisma.ledgerEntry.create({
          data: {
            userId: debit.userId,
            accountType: debit.accountType,
            entryType: 'DEBIT',
            amount: debit.amount,
            balanceAfter: debit.balanceAfter,
            eventType: debit.eventType,
            reference: debit.reference,
            description: debit.description,
            groupRef,
            anchorEventId: debit.anchorEventId,
            anchorTransferId: debit.anchorTransferId,
            paystackRef: debit.paystackRef,
            metadata: debit.metadata,
          },
        }),
        this.prisma.ledgerEntry.create({
          data: {
            userId: credit.userId,
            accountType: credit.accountType,
            entryType: 'CREDIT',
            amount: credit.amount,
            balanceAfter: credit.balanceAfter,
            eventType: credit.eventType,
            reference: credit.reference,
            description: credit.description,
            groupRef,
            anchorEventId: credit.anchorEventId,
            anchorTransferId: credit.anchorTransferId,
            paystackRef: credit.paystackRef,
            metadata: credit.metadata,
          },
        }),
      ]);
    } catch (e: any) {
      if (e?.code === 'P2002') return;
      this.logger.error(`Ledger recordPair failed (groupRef=${groupRef}): ${e?.message}`);
    }
  }

  // ── Query ────────────────────────────────────────────────────────────────────

  async getEntries(
    userId: string,
    opts: {
      accountType?: LedgerAccountType;
      limit?: number;
      offset?: number;
    } = {},
  ) {
    return this.prisma.ledgerEntry.findMany({
      where: {
        userId,
        ...(opts.accountType ? { accountType: opts.accountType } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: opts.limit ?? 50,
      skip: opts.offset ?? 0,
    });
  }

  async getEntryCount(userId: string, accountType?: LedgerAccountType) {
    return this.prisma.ledgerEntry.count({
      where: { userId, ...(accountType ? { accountType } : {}) },
    });
  }

  /**
   * Compute the current balance for a user's account from ledger entries.
   * SUM(credits) - SUM(debits) — should match the DB balance field.
   */
  async computeBalance(userId: string, accountType: LedgerAccountType): Promise<number> {
    const rows = await this.prisma.ledgerEntry.groupBy({
      by: ['entryType'],
      where: { userId, accountType },
      _sum: { amount: true },
    });

    let credits = 0;
    let debits = 0;
    for (const row of rows) {
      const sum = Number(row._sum.amount ?? 0);
      if (row.entryType === 'CREDIT') credits = sum;
      else debits = sum;
    }
    return +(credits - debits).toFixed(2);
  }

  /**
   * Compare the ledger balance against an external source (Anchor).
   * Returns the discrepancy — should be 0 for a healthy system.
   */
  async reconcile(
    userId: string,
    accountType: LedgerAccountType,
    externalBalance: number,
  ) {
    const ledgerBalance = await this.computeBalance(userId, accountType);
    const discrepancy = +(externalBalance - ledgerBalance).toFixed(2);

    return {
      userId,
      accountType,
      ledgerBalance,
      externalBalance,
      discrepancy,
      isBalanced: Math.abs(discrepancy) < 0.01,
      checkedAt: new Date().toISOString(),
    };
  }
}
