import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { AnchorService } from 'src/anchor/anchor.service';
import { WalletService } from 'src/wallet/wallet.service';
import { PaystackService } from 'src/paystack/paystack.service';
import { MailService } from 'src/mail/mail.service';
import { CreateSavingsDto } from './dto/create-savings.dto';
import { UpdateSavingsDto } from './dto/update-savings.dto';
import { Prisma } from '@prisma/client';
type FirstKeySavings = Prisma.FirstKeySavingsGetPayload<object>;
type SavingsStatus = 'ACTIVE' | 'PAUSED' | 'MATURED' | 'WITHDRAWN' | 'BROKEN';
type SavingsTxType = 'DEPOSIT' | 'INTEREST' | 'WITHDRAWAL' | 'PENALTY' | 'REFUND';
import { addDays, addMonths, addYears, differenceInDays } from 'date-fns';
import { randomUUID } from 'crypto';

// 12% p.a. compounded daily
const ANNUAL_INTEREST_RATE = 0.12;
const DAILY_INTEREST_RATE = ANNUAL_INTEREST_RATE / 365;

@Injectable()
export class SavingsService {
  private readonly logger = new Logger(SavingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly anchor: AnchorService,
    private readonly wallet: WalletService,
    private readonly paystack: PaystackService,
    private readonly mail: MailService,
  ) {}

  // ── Create Plan ─────────────────────────────────────────────────────────────

  async createPlan(userId: string, dto: CreateSavingsDto): Promise<FirstKeySavings> {
    const startDate = new Date();
    const endDate = this.computeEndDate(dto.duration, dto.expectedGradYear, startDate, dto.expectedGradMonth);
    const nextContributionAt = this.computeNextContribution(dto.frequency, dto.preferredDay, startDate);

    // Provision a dedicated Anchor virtual account for this savings plan
    let anchorAccountId: string | undefined;
    let nuban: string | undefined;
    let bankName: string | undefined;
    let accountName: string | undefined;

    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          firstName: true, lastName: true,
          email: true, phoneNumber: true,
          wallet: { select: { anchorCustomerId: true } },
        },
      });

      // Anchor requires a BVN-verified customer to create SAVINGS accounts.
      // Only use the wallet's anchorCustomerId (set after wallet KYC).
      const customerId = user?.wallet?.anchorCustomerId ?? null;

      if (customerId) {
        const acct = await this.anchor.createDepositAccount(customerId);
        if (acct?.id) {
          anchorAccountId = acct.id;
          // Anchor assigns NUBANs asynchronously — poll to get it
          const nubanData = await this.anchor.pollVirtualNubans(acct.id);
          nuban = nubanData?.accountNumber ?? acct.accountNumber ?? undefined;
          bankName = nubanData?.bankName ?? acct.bankName ?? undefined;
          accountName = nubanData?.accountName ?? acct.accountName ?? undefined;
        }
      }
    } catch (e) {
      // Non-blocking — plan is still created, NUBAN can be provisioned later
      this.logger.warn(`Could not provision Anchor account for savings: ${e}`);
    }

    const plan = await this.prisma.firstKeySavings.create({
      data: {
        userId,
        schoolName: dto.schoolName,
        academicLevel: dto.academicLevel,
        expectedGradYear: dto.expectedGradYear,
        expectedGradMonth: dto.expectedGradMonth,
        duration: dto.duration,
        contributionAmount: dto.contributionAmount,
        frequency: dto.frequency,
        preferredDay: dto.preferredDay,
        preferredTime: dto.preferredTime ?? '09:00',
        savingsTarget: dto.savingsTarget,
        rentalLocation: dto.rentalLocation,
        paymentMethod: dto.paymentMethod,
        planName: dto.planName,
        dreamHousePhoto: dto.dreamHousePhoto,
        startDate,
        endDate,
        nextContributionAt,
        anchorAccountId,
        nuban,
        bankName,
        accountName,
      },
    });

    this.sendSavingsEmail(
      userId,
      `Your FirstKey savings plan is live 🎉`,
      `<p>Hi there,</p>
       <p>Your <strong>${plan.planName ?? 'FirstKey'}</strong> savings plan has been created successfully.</p>
       <p>It earns <strong>12% interest per annum</strong>, compounded daily. Make your first deposit to start earning.</p>
       <p>Plan ends: <strong>${endDate.toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' })}</strong></p>
       <p>— Leadsage Africa</p>`,
    );

    return plan;
  }

  // ── List Plans ──────────────────────────────────────────────────────────────

  async getMyPlans(userId: string) {
    const plans = await this.prisma.firstKeySavings.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    return plans.map((p) => this.enrichPlan(p));
  }

  // ── Plan Detail ─────────────────────────────────────────────────────────────

  async getPlanById(userId: string, id: string) {
    const plan = await this.prisma.firstKeySavings.findFirst({
      where: { id, userId },
      include: {
        transactions: {
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
      },
    });

    if (!plan) throw new NotFoundException('Savings plan not found');
    return { ...this.enrichPlan(plan), transactions: plan.transactions };
  }

  async getTransactions(userId: string, planId: string, page: number, limit: number) {
    const plan = await this.getPlanOrThrow(userId, planId);
    const skip = (page - 1) * limit;

    const [transactions, total] = await Promise.all([
      this.prisma.savingsTransaction.findMany({
        where: { savingsId: plan.id },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.savingsTransaction.count({ where: { savingsId: plan.id } }),
    ]);

    return {
      transactions,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  // ── Manual Deposit ──────────────────────────────────────────────────────────

  async depositFromWallet(userId: string, planId: string, amount: number) {
    const plan = await this.getPlanOrThrow(userId, planId);
    if (plan.status !== 'ACTIVE' && plan.status !== 'PAUSED') {
      throw new BadRequestException('Cannot deposit to a closed or matured plan');
    }

    // Debit wallet (DB ledger)
    const reference = `fks-dep-${randomUUID()}`;
    await this.wallet.debitWallet(
      userId,
      amount,
      `FirstKey deposit — ${plan.planName ?? 'Savings Plan'}`,
      { type: 'DEBIT', reference },
    );

    // Record deposit in savings ledger
    await this.recordDeposit(plan, amount, reference, 'Wallet deposit');

    // Mirror the move on Anchor so balances stay in sync and auto-sync
    // doesn't re-credit the wallet on next page load
    this.moveOnAnchor(userId, plan, amount, reference).catch((e) =>
      this.logger.warn(`Anchor book transfer failed (non-blocking): ${e}`),
    );

    this.sendSavingsEmail(
      userId,
      `FirstKey deposit confirmed — ₦${amount.toLocaleString()}`,
      `<p>Hi there,</p>
       <p>₦${amount.toLocaleString()} has been deposited into your <strong>${plan.planName ?? 'FirstKey'}</strong> savings plan from your wallet.</p>
       <p>Your savings are earning <strong>12% interest per annum</strong>, compounded daily.</p>
       <p>— Leadsage Africa</p>`,
    );

    return { success: true };
  }

  /**
   * Mirror a wallet-to-savings deposit on Anchor so Anchor balances stay in
   * sync with our DB ledger. Provisions the savings Anchor account first if
   * it doesn't exist yet. Non-blocking — called fire-and-forget.
   */
  private async moveOnAnchor(
    userId: string,
    plan: FirstKeySavings,
    amountNGN: number,
    reference: string,
  ) {
    // Get wallet's Anchor account
    const walletAccount = await this.prisma.walletAccount.findUnique({
      where: { userId },
      select: { anchorAccountId: true },
    });

    if (!walletAccount?.anchorAccountId) {
      this.logger.warn(`No wallet Anchor account for user ${userId} — skipping book transfer`);
      return;
    }

    // Ensure savings plan has an Anchor account
    let savingsAnchorAccountId = plan.anchorAccountId ?? undefined;

    if (!savingsAnchorAccountId) {
      // Try to provision one on-the-fly
      try {
        const updated = await this.provisionAccount(userId, plan.id);
        savingsAnchorAccountId = (updated as any)?.anchorAccountId ?? undefined;
      } catch (e) {
        this.logger.warn(`Could not provision savings Anchor account for plan ${plan.id}: ${e}`);
      }
    }

    if (!savingsAnchorAccountId) {
      this.logger.warn(`Savings plan ${plan.id} has no Anchor account — book transfer skipped`);
      return;
    }

    await this.anchor.internalTransfer({
      fromAccountId: walletAccount.anchorAccountId,
      toAccountId: savingsAnchorAccountId,
      amountNaira: amountNGN,
      reference: `anchor-${reference}`,
      reason: `FirstKey deposit — ${plan.planName ?? 'Savings Plan'}`,
    });

    this.logger.log(`Anchor book transfer ₦${amountNGN} → savings plan ${plan.id}`);
  }

  // ── Sync balance from Anchor ────────────────────────────────────────────────

  async syncFromAnchor(userId: string, planId: string) {
    const plan = await this.getPlanOrThrow(userId, planId);

    if (!plan.anchorAccountId) {
      return { synced: false, message: 'No Anchor account linked to this plan yet.' };
    }

    const anchorBalance = await this.anchor.getAccountBalance(plan.anchorAccountId);
    const localBalance = plan.totalDeposited + plan.interestEarned;
    const diff = +(anchorBalance - localBalance).toFixed(2);

    if (diff <= 0) {
      return { synced: false, message: 'Balance already up to date.', anchorBalance, localBalance };
    }

    // Record the untracked amount as a bank transfer deposit
    const reference = `anchor-sync-${plan.id}-${Date.now()}`;
    await this.recordDeposit(plan, diff, reference, 'Bank transfer (synced from Anchor)');

    await this.prisma.notification.create({
      data: {
        userId,
        type: 'GENERAL',
        title: 'FirstKey deposit synced',
        body: `₦${diff.toLocaleString()} bank transfer has been credited to your ${plan.planName ?? 'FirstKey'} savings plan.`,
        data: { savingsId: planId, amount: diff },
      },
    });

    this.logger.log(`Synced ₦${diff} for savings plan ${planId} from Anchor`);
    return { synced: true, credited: diff, anchorBalance, localBalance };
  }

  // ── Provision Account (retry NUBAN for existing plans) ─────────────────────

  async provisionAccount(userId: string, planId: string) {
    const plan = await this.getPlanOrThrow(userId, planId);

    // If already has a NUBAN, just poll to refresh it
    if (plan.anchorAccountId) {
      const nubanData = await this.anchor.pollVirtualNubans(plan.anchorAccountId);
      if (nubanData?.accountNumber) {
        return this.prisma.firstKeySavings.update({
          where: { id: planId },
          data: {
            nuban: nubanData.accountNumber,
            bankName: nubanData.bankName,
            accountName: nubanData.accountName,
          },
        });
      }
      return plan; // still not ready
    }

    // No Anchor account yet — need a BVN-verified wallet customer to create a SAVINGS account
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { wallet: { select: { anchorCustomerId: true, kycStatus: true } } },
    });

    const customerId = user?.wallet?.anchorCustomerId ?? null;

    if (!customerId) {
      throw new BadRequestException(
        'Please complete wallet KYC (BVN verification) before generating a savings account number.',
      );
    }

    const acct = await this.anchor.createDepositAccount(customerId);
    if (!acct?.id) throw new BadRequestException('Anchor account creation failed');

    const nubanData = await this.anchor.pollVirtualNubans(acct.id);

    return this.prisma.firstKeySavings.update({
      where: { id: planId },
      data: {
        anchorAccountId: acct.id,
        nuban: nubanData?.accountNumber ?? null,
        bankName: nubanData?.bankName ?? null,
        accountName: nubanData?.accountName ?? null,
      },
    });
  }

  // ── Card Deposit (Paystack) ─────────────────────────────────────────────────

  async initializeCardDeposit(userId: string, planId: string, amount: number) {
    const plan = await this.getPlanOrThrow(userId, planId);
    if (plan.status !== 'ACTIVE' && plan.status !== 'PAUSED') {
      throw new BadRequestException('Cannot deposit to a closed plan');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    if (!user) throw new NotFoundException('User not found');

    const reference = `fks-card-${randomUUID()}`;

    const result = await this.paystack.initializeTransaction(
      user.email,
      amount,
      { savingsPlanId: planId, userId, type: 'savings_deposit' },
      `${process.env.FRONTEND_URL}/firstkey/${planId}?verify=${reference}`,
      reference,
    );

    return { paymentUrl: result.authorizationUrl, reference };
  }

  async verifyCardDeposit(userId: string, planId: string, reference: string) {
    const plan = await this.getPlanOrThrow(userId, planId);

    const result = await this.paystack.verifyTransaction(reference);
    if (result.status !== 'success') {
      throw new BadRequestException('Payment not successful');
    }

    const amount = result.amount / 100;

    // recordDeposit catches P2002 (duplicate reference) — safe to call twice
    const alreadyRecorded = await this.prisma.savingsTransaction.findUnique({
      where: { reference },
      select: { id: true },
    });
    if (alreadyRecorded) return { success: true, alreadyVerified: true };

    // Save authorization_code for future recurring card charges
    if (result.authorizationCode && !plan.cardAuthCode) {
      await this.prisma.firstKeySavings.update({
        where: { id: planId },
        data: { cardAuthCode: result.authorizationCode },
      });
    }

    await this.recordDeposit(plan, amount, reference, 'Card deposit');

    await this.prisma.notification.create({
      data: {
        userId,
        type: 'GENERAL',
        title: 'FirstKey deposit received',
        body: `₦${amount.toLocaleString()} has been added to your ${plan.planName ?? 'FirstKey savings'} via card.`,
        data: { savingsId: planId, amount },
      },
    });

    this.sendSavingsEmail(
      userId,
      `FirstKey card deposit confirmed — ₦${amount.toLocaleString()}`,
      `<p>Hi there,</p>
       <p>Your card payment of <strong>₦${amount.toLocaleString()}</strong> has been credited to your <strong>${plan.planName ?? 'FirstKey'}</strong> savings plan.</p>
       <p>Your savings are earning <strong>12% interest per annum</strong>, compounded daily.</p>
       <p>— Leadsage Africa</p>`,
    );

    return { success: true, amount };
  }

  // ── Anchor Inbound (bank transfer to savings NUBAN) ─────────────────────────

  async handleAnchorDeposit(
    anchorAccountId: string,
    amountNGN: number,
    reference: string,
    narration: string,
  ) {
    const plan = await this.prisma.firstKeySavings.findFirst({
      where: { anchorAccountId },
    });

    if (!plan) {
      this.logger.warn(`No savings plan for anchorAccountId ${anchorAccountId}`);
      return;
    }

    // Idempotency
    const existing = await this.prisma.savingsTransaction.findUnique({
      where: { reference },
    });
    if (existing) return;

    if (plan.status !== 'ACTIVE' && plan.status !== 'PAUSED') return;

    await this.recordDeposit(plan, amountNGN, reference, narration || 'Bank transfer deposit');

    // Notify user
    await this.prisma.notification.create({
      data: {
        userId: plan.userId,
        type: 'GENERAL',
        title: 'FirstKey deposit received',
        body: `₦${amountNGN.toLocaleString()} has been added to your ${plan.planName ?? 'FirstKey savings'} plan.`,
        data: { savingsId: plan.id, amount: amountNGN },
      },
    });

    this.sendSavingsEmail(
      plan.userId,
      `FirstKey bank transfer received — ₦${amountNGN.toLocaleString()}`,
      `<p>Hi there,</p>
       <p>A bank transfer of <strong>₦${amountNGN.toLocaleString()}</strong> has been credited to your <strong>${plan.planName ?? 'FirstKey'}</strong> savings plan.</p>
       <p>Your savings are earning <strong>12% interest per annum</strong>, compounded daily.</p>
       <p>— Leadsage Africa</p>`,
    );

    this.logger.log(`FirstKey plan ${plan.id} credited ₦${amountNGN}`);
  }

  // ── Withdraw ────────────────────────────────────────────────────────────────

  async withdraw(userId: string, planId: string) {
    const plan = await this.getPlanOrThrow(userId, planId);

    if (plan.status === 'WITHDRAWN' || plan.status === 'BROKEN') {
      throw new BadRequestException('Plan already withdrawn');
    }

    const balance = plan.totalDeposited + plan.interestEarned;
    if (balance <= 0) throw new BadRequestException('Nothing to withdraw');

    const isMatured = new Date() >= new Date(plan.endDate) || plan.status === 'MATURED';
    const daysActive = differenceInDays(new Date(), new Date(plan.startDate));

    let penalty = 0;
    let penaltyNote = '';

    if (!isMatured) {
      // Early withdrawal penalty
      if (daysActive < 30) {
        penalty = plan.interestEarned; // lose all interest
        penaltyNote = 'Early withdrawal — all interest forfeited (< 30 days)';
      } else if (daysActive < 90) {
        penalty = plan.interestEarned * 0.5;
        penaltyNote = 'Early withdrawal — 50% interest forfeited (30-90 days)';
      } else {
        penalty = plan.interestEarned * 0.25 + plan.totalDeposited * 0.02;
        penaltyNote = 'Early withdrawal — 25% interest + 2% principal fee (> 90 days)';
      }
    }

    const payout = balance - penalty;
    const reference = `fks-wdraw-${planId}-${Date.now()}`;

    await this.prisma.$transaction(async (tx) => {
      // Credit user wallet
      await this.wallet.creditWallet(
        userId,
        payout,
        `FirstKey ${isMatured ? 'maturity' : 'early'} withdrawal — ${plan.planName ?? 'Savings Plan'}`,
        { type: 'CREDIT', reference },
      );

      // Log penalty if any
      if (penalty > 0) {
        await tx.savingsTransaction.create({
          data: {
            savingsId: planId,
            userId,
            type: 'PENALTY',
            amount: -penalty,
            balance: balance - penalty,
            reference: `${reference}-penalty`,
            note: penaltyNote,
            penaltyAmount: penalty,
          },
        });
      }

      // Log withdrawal
      await tx.savingsTransaction.create({
        data: {
          savingsId: planId,
          userId,
          type: 'WITHDRAWAL',
          amount: -payout,
          balance: 0,
          reference,
          note: isMatured ? 'Maturity withdrawal' : 'Early withdrawal',
        },
      });

      // Mark plan
      await tx.firstKeySavings.update({
        where: { id: planId },
        data: {
          status: isMatured ? 'WITHDRAWN' : 'BROKEN',
          totalDeposited: 0,
          interestEarned: 0,
          withdrawnAt: new Date(),
        },
      });
    });

    await this.prisma.notification.create({
      data: {
        userId,
        type: 'GENERAL',
        title: isMatured ? 'Savings maturity withdrawal' : 'Early withdrawal processed',
        body: isMatured
          ? `₦${payout.toLocaleString()} has been credited to your wallet from your FirstKey savings.`
          : `₦${payout.toLocaleString()} has been credited to your wallet. A penalty of ₦${penalty.toLocaleString()} was applied.`,
        data: { savingsId: planId },
      },
    });

    this.sendSavingsEmail(
      userId,
      isMatured ? `FirstKey savings withdrawn — ₦${payout.toLocaleString()}` : `FirstKey early withdrawal processed`,
      isMatured
        ? `<p>Hi there,</p>
           <p>Your <strong>${plan.planName ?? 'FirstKey'}</strong> savings plan has matured and <strong>₦${payout.toLocaleString()}</strong> has been credited to your wallet. Congratulations!</p>
           <p>— Leadsage Africa</p>`
        : `<p>Hi there,</p>
           <p>Your early withdrawal from <strong>${plan.planName ?? 'FirstKey'}</strong> has been processed.</p>
           <p>Amount credited to wallet: <strong>₦${payout.toLocaleString()}</strong></p>
           ${penalty > 0 ? `<p>Early withdrawal penalty applied: <strong>₦${penalty.toLocaleString()}</strong> — ${penaltyNote}</p>` : ''}
           <p>— Leadsage Africa</p>`,
    );

    return { payout, penalty, isMatured };
  }

  // ── Update Settings ─────────────────────────────────────────────────────────

  async updateSettings(userId: string, planId: string, dto: UpdateSavingsDto) {
    const plan = await this.getPlanOrThrow(userId, planId);

    if (plan.status === 'WITHDRAWN' || plan.status === 'BROKEN' || plan.status === 'MATURED') {
      throw new BadRequestException('Cannot update a closed plan');
    }

    let nextContributionAt = plan.nextContributionAt;
    if (dto.frequency || dto.preferredDay) {
      nextContributionAt = this.computeNextContribution(
        dto.frequency ?? plan.frequency,
        dto.preferredDay ?? plan.preferredDay ?? undefined,
        new Date(),
      );
    }

    return this.prisma.firstKeySavings.update({
      where: { id: planId },
      data: {
        ...dto,
        nextContributionAt,
      },
    });
  }

  // ── Pause / Resume ──────────────────────────────────────────────────────────

  async pause(userId: string, planId: string) {
    const plan = await this.getPlanOrThrow(userId, planId);
    if (plan.status !== 'ACTIVE') throw new BadRequestException('Plan is not active');
    return this.prisma.firstKeySavings.update({
      where: { id: planId },
      data: { status: 'PAUSED' },
    });
  }

  async resume(userId: string, planId: string) {
    const plan = await this.getPlanOrThrow(userId, planId);
    if (plan.status !== 'PAUSED') throw new BadRequestException('Plan is not paused');
    return this.prisma.firstKeySavings.update({
      where: { id: planId },
      data: { status: 'ACTIVE' },
    });
  }

  // ── Cron: Daily Interest ────────────────────────────────────────────────────

  async applyDailyInterest() {
    const plans = await this.prisma.firstKeySavings.findMany({
      where: { status: 'ACTIVE' },
    });

    let count = 0;
    for (const plan of plans) {
      const principal = plan.totalDeposited + plan.interestEarned;
      if (principal <= 0) continue;

      const interest = +(principal * DAILY_INTEREST_RATE).toFixed(2);
      if (interest <= 0) continue;

      const reference = `fks-int-${plan.id}-${new Date().toISOString().slice(0, 10)}`;

      // Skip if already applied today
      const exists = await this.prisma.savingsTransaction.findUnique({
        where: { reference },
      });
      if (exists) continue;

      await this.prisma.$transaction([
        this.prisma.savingsTransaction.create({
          data: {
            savingsId: plan.id,
            userId: plan.userId,
            type: 'INTEREST',
            amount: interest,
            balance: plan.totalDeposited + plan.interestEarned + interest,
            reference,
            note: `Daily interest (${(ANNUAL_INTEREST_RATE * 100).toFixed(0)}% p.a.)`,
          },
        }),
        this.prisma.firstKeySavings.update({
          where: { id: plan.id },
          data: {
            interestEarned: { increment: interest },
            lastInterestAt: new Date(),
          },
        }),
      ]);

      count++;
    }

    this.logger.log(`Daily interest applied to ${count} savings plans`);
  }

  // ── Cron: Auto-contributions ────────────────────────────────────────────────

  async processScheduledContributions() {
    const now = new Date();
    const plans = await this.prisma.firstKeySavings.findMany({
      where: {
        status: 'ACTIVE',
        paymentMethod: { in: ['WALLET', 'CARD'] },
        nextContributionAt: { lte: now },
      },
    });

    for (const plan of plans) {
      try {
        if (plan.paymentMethod === 'CARD') {
          await this.processCardContribution(plan, now);
        } else {
          await this.processWalletContribution(plan, now);
        }
      } catch (e) {
        this.logger.error(`Auto-contribution failed for plan ${plan.id}: ${e}`);
      }
    }

    this.logger.log(`Processed ${plans.length} scheduled contributions`);
  }

  private async processWalletContribution(plan: FirstKeySavings, now: Date) {
    const walletAccount = await this.prisma.walletAccount.findUnique({
      where: { userId: plan.userId },
    });

    if (!walletAccount || walletAccount.availableBalance < plan.contributionAmount) {
      await this.prisma.notification.create({
        data: {
          userId: plan.userId,
          type: 'GENERAL',
          title: 'FirstKey auto-save failed',
          body: `Insufficient wallet balance for your FirstKey contribution of ₦${plan.contributionAmount.toLocaleString()}. Please fund your wallet.`,
          data: { savingsId: plan.id },
        },
      });
      return;
    }

    const reference = `fks-auto-${plan.id}-${now.getTime()}`;
    await this.wallet.debitWallet(
      plan.userId,
      plan.contributionAmount,
      `FirstKey auto-save — ${plan.planName ?? 'Savings Plan'}`,
      { type: 'DEBIT', reference },
    );

    await this.recordDeposit(plan, plan.contributionAmount, reference, 'Auto-save contribution');

    this.moveOnAnchor(plan.userId, plan, plan.contributionAmount, reference).catch((e) =>
      this.logger.warn(`Anchor book transfer failed for auto-save ${plan.id}: ${e}`),
    );

    this.sendSavingsEmail(
      plan.userId,
      `FirstKey auto-save — ₦${plan.contributionAmount.toLocaleString()} saved`,
      `<p>Hi there,</p>
       <p>Your scheduled auto-save of <strong>₦${plan.contributionAmount.toLocaleString()}</strong> has been added to your <strong>${plan.planName ?? 'FirstKey'}</strong> savings plan.</p>
       <p>Your savings continue to earn <strong>12% interest per annum</strong>, compounded daily.</p>
       <p>— Leadsage Africa</p>`,
    );
  }

  private async processCardContribution(plan: FirstKeySavings, now: Date) {
    if (!plan.cardAuthCode) {
      // No saved card — notify user to make a manual card payment to register their card
      await this.prisma.notification.create({
        data: {
          userId: plan.userId,
          type: 'GENERAL',
          title: 'FirstKey auto-save: card not set up',
          body: `Your FirstKey plan uses card auto-save but no card is registered. Please make a manual card deposit to activate auto-save.`,
          data: { savingsId: plan.id },
        },
      });
      return;
    }

    const user = await this.prisma.user.findUnique({
      where: { id: plan.userId },
      select: { email: true },
    });
    if (!user) return;

    const reference = `fks-card-auto-${plan.id}-${now.getTime()}`;

    const result = await this.paystack.chargeAuthorization(
      plan.cardAuthCode,
      user.email,
      plan.contributionAmount,
      { savingsPlanId: plan.id, userId: plan.userId, type: 'savings_auto_debit' },
      reference,
    );

    if (result.status !== 'success') {
      await this.prisma.notification.create({
        data: {
          userId: plan.userId,
          type: 'GENERAL',
          title: 'FirstKey card auto-save failed',
          body: `We could not charge your card ₦${plan.contributionAmount.toLocaleString()} for your FirstKey plan. Please check your card or switch to wallet auto-save.`,
          data: { savingsId: plan.id },
        },
      });
      return;
    }

    const amount = result.amount / 100;
    await this.recordDeposit(plan, amount, reference, 'Card auto-save');

    this.sendSavingsEmail(
      plan.userId,
      `FirstKey card auto-save — ₦${amount.toLocaleString()} saved`,
      `<p>Hi there,</p>
       <p>Your scheduled card charge of <strong>₦${amount.toLocaleString()}</strong> has been added to your <strong>${plan.planName ?? 'FirstKey'}</strong> savings plan.</p>
       <p>Your savings continue to earn <strong>12% interest per annum</strong>, compounded daily.</p>
       <p>— Leadsage Africa</p>`,
    );
  }

  // ── Cron: Mature Plans ──────────────────────────────────────────────────────

  async maturePlans() {
    const now = new Date();
    const plans = await this.prisma.firstKeySavings.findMany({
      where: { status: 'ACTIVE', endDate: { lte: now } },
    });

    for (const plan of plans) {
      await this.prisma.firstKeySavings.update({
        where: { id: plan.id },
        data: { status: 'MATURED', maturedAt: now },
      });

      const balance = plan.totalDeposited + plan.interestEarned;

      await this.prisma.notification.create({
        data: {
          userId: plan.userId,
          type: 'GENERAL',
          title: 'Your FirstKey savings have matured!',
          body: `Congratulations! Your ${plan.planName ?? 'FirstKey savings'} (₦${balance.toLocaleString()}) are ready for withdrawal.`,
          data: { savingsId: plan.id },
        },
      });

      this.sendSavingsEmail(
        plan.userId,
        `🎉 Your FirstKey savings have matured — ₦${balance.toLocaleString()} ready`,
        `<p>Hi there,</p>
         <p>Congratulations! Your <strong>${plan.planName ?? 'FirstKey'}</strong> savings plan has reached its maturity date.</p>
         <p>Your total balance of <strong>₦${balance.toLocaleString()}</strong> (including ₦${plan.interestEarned.toLocaleString()} in interest) is ready for withdrawal.</p>
         <p>Log in to your Leadsage account to withdraw to your wallet.</p>
         <p>— Leadsage Africa</p>`,
      );
    }

    if (plans.length) this.logger.log(`Matured ${plans.length} savings plans`);
  }

  // ── Private Helpers ─────────────────────────────────────────────────────────

  /** Fire-and-forget email helper — never throws so it can't break the main flow */
  private async sendSavingsEmail(
    userId: string,
    subject: string,
    html: string,
  ) {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { email: true, firstName: true, lastName: true },
      });
      if (!user) return;
      await this.mail.sendMail({
        toEmail: user.email,
        toName: `${user.firstName} ${user.lastName}`.trim(),
        subject,
        html,
      });
    } catch (e) {
      this.logger.warn(`Savings email failed for user ${userId}: ${e}`);
    }
  }

  private async getPlanOrThrow(userId: string, planId: string): Promise<FirstKeySavings> {
    const plan = await this.prisma.firstKeySavings.findFirst({
      where: { id: planId, userId },
    });
    if (!plan) throw new NotFoundException('Savings plan not found');
    return plan;
  }

  private async recordDeposit(
    plan: FirstKeySavings,
    amount: number,
    reference: string,
    note: string,
  ) {
    const newBalance = plan.totalDeposited + amount;
    const nextContributionAt = plan.paymentMethod === 'WALLET'
      ? this.computeNextContribution(plan.frequency, plan.preferredDay ?? undefined, new Date())
      : plan.nextContributionAt;

    try {
      await this.prisma.$transaction([
        this.prisma.savingsTransaction.create({
          data: {
            savingsId: plan.id,
            userId: plan.userId,
            type: 'DEPOSIT',
            amount,
            balance: newBalance,
            reference,
            note,
          },
        }),
        this.prisma.firstKeySavings.update({
          where: { id: plan.id },
          data: {
            totalDeposited: { increment: amount },
            lastContributionAt: new Date(),
            nextContributionAt,
            status: plan.status === 'PAUSED' ? 'PAUSED' : 'ACTIVE',
          },
        }),
      ]);
    } catch (e: any) {
      if (e?.code === 'P2002') return; // duplicate reference — already recorded
      throw e;
    }
  }

  private computeEndDate(
    duration: string,
    expectedGradYear: number,
    from: Date,
    expectedGradMonth?: number,
  ): Date {
    if (duration === 'SIX_MONTHS') return addMonths(from, 6);
    if (duration === 'ONE_YEAR') return addYears(from, 1);
    if (duration === 'TWO_YEARS') return addYears(from, 2);
    // UNTIL_GRADUATION — last day of the chosen grad month (default: July)
    const month = expectedGradMonth ?? 7; // 1-indexed
    return new Date(expectedGradYear, month, 0); // day 0 = last day of previous month
  }

  private computeNextContribution(
    frequency: string,
    preferredDay: number | undefined,
    from: Date,
  ): Date {
    const next = new Date(from);
    if (frequency === 'DAILY') {
      return addDays(next, 1);
    }
    if (frequency === 'WEEKLY') {
      // preferredDay: 1=Mon ... 7=Sun (ISO)
      const targetDay = preferredDay ?? 1;
      const current = next.getDay() || 7; // convert 0=Sun to 7
      const daysUntil = ((targetDay - current + 7) % 7) || 7;
      return addDays(next, daysUntil);
    }
    if (frequency === 'MONTHLY') {
      const nextMonth = addMonths(next, 1);
      nextMonth.setDate(Math.min(preferredDay ?? 1, 28));
      return nextMonth;
    }
    // CUSTOM — default to monthly
    return addMonths(next, 1);
  }

  private enrichPlan(plan: FirstKeySavings) {
    const balance = plan.totalDeposited + plan.interestEarned;
    const progressPct = plan.savingsTarget
      ? Math.min(100, (balance / plan.savingsTarget) * 100)
      : null;
    const isMatured = new Date() >= new Date(plan.endDate);
    const daysRemaining = Math.max(0, differenceInDays(new Date(plan.endDate), new Date()));

    return {
      ...plan,
      balance,
      progressPct,
      isMatured,
      daysRemaining,
    };
  }
}
