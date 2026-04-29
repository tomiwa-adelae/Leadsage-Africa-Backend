import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from 'src/prisma/prisma.service';
import { AnchorService } from 'src/anchor/anchor.service';
import { PaystackService } from 'src/paystack/paystack.service';
import { EncryptionService } from 'src/encryption/encryption.service';
import { LedgerService, LedgerEventType } from 'src/ledger/ledger.service';
import { randomUUID } from 'crypto';

const COMMISSION_RATE = 0.05; // 5%
const SHORTLET_HOLD_HOURS = 24; // release 24h after check-in
const RENTAL_HOLD_HOURS = 24; // release 24h after payment

@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly anchor: AnchorService,
    private readonly paystack: PaystackService,
    private readonly encryption: EncryptionService,
    private readonly ledger: LedgerService,
  ) {}

  // ── Wallet provisioning ────────────────────────────────────────────────────

  /**
   * Called on user signup. Creates a locked wallet record (no Anchor account yet).
   * Anchor account is created only after KYC (BVN submission).
   */
  async provisionWallet(userId: string): Promise<void> {
    const existing = await this.prisma.walletAccount.findUnique({
      where: { userId },
    });
    if (existing) return;
    await this.prisma.walletAccount.create({ data: { userId } });
  }

  /**
   * Submit BVN KYC. Creates the Anchor customer + deposit account + fetches NUBAN.
   * Activates the wallet on success.
   */
  async submitKyc(
    userId: string,
    bvn: string,
    dateOfBirth: string,
    gender: 'Male' | 'Female',
  ) {
    let wallet = await this.prisma.walletAccount.findUnique({
      where: { userId },
    });
    if (!wallet)
      wallet = await this.prisma.walletAccount.create({ data: { userId } });
    if (wallet.kycStatus === 'VERIFIED')
      throw new BadRequestException('KYC already verified');

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        firstName: true,
        lastName: true,
        middleName: true,
        email: true,
        phoneNumber: true,
      },
    });
    if (!user) throw new NotFoundException('User not found');

    // Mark as submitted immediately — store BVN encrypted
    await this.prisma.walletAccount.update({
      where: { userId },
      data: {
        bvn: this.encryption.encrypt(bvn),
        dateOfBirth,
        gender,
        kycStatus: 'SUBMITTED',
      },
    });

    try {
      // 1. Create (or fetch existing) Anchor customer
      const anchorCustomerId = await this.anchor.createOrFetchCustomer({
        firstName: user.firstName ?? '',
        lastName: user.lastName ?? '',
        middleName: user.middleName ?? '',
        email: user.email,
        phoneNumber: user.phoneNumber ?? '08000000000',
      });

      // 2. Check if Anchor already has this customer at TIER_2 (e.g. prior attempt succeeded)
      const { verified: alreadyVerified } =
        await this.anchor.getCustomerTier(anchorCustomerId);

      if (!alreadyVerified) {
        // Submit BVN — Anchor processes this asynchronously in live
        await this.anchor.verifyBvn(anchorCustomerId, {
          bvn,
          dateOfBirth,
          gender,
        });

        // Save customerId immediately so webhook / sync can pick up from here
        await this.prisma.walletAccount.update({
          where: { userId },
          data: { anchorCustomerId, kycStatus: 'SUBMITTED' },
        });

        // Poll briefly in case Anchor confirms fast (sandbox / lucky timing)
        const kycConfirmed =
          await this.anchor.pollCustomerKycVerified(anchorCustomerId);
        if (!kycConfirmed) {
          // BVN accepted — Anchor fires customer.identification.approved webhook
          // which auto-activates the wallet. Frontend auto-sync handles the rest.
          return {
            kycStatus: 'SUBMITTED',
            message:
              'BVN verification submitted. Your wallet will activate automatically.',
          };
        }
      }

      // 3. Create deposit account
      const account = await this.anchor.createDepositAccount(anchorCustomerId);

      // 4. Poll for virtual NUBAN (assigned async by Anchor — usually a few seconds)
      const nuban = account.accountNumber
        ? account
        : await this.anchor.pollVirtualNubans(account.id);

      await this.prisma.walletAccount.update({
        where: { userId },
        data: {
          anchorCustomerId,
          anchorAccountId: account.id,
          virtualAccountNo: nuban?.accountNumber ?? null,
          virtualAccountName: nuban?.accountName ?? null,
          virtualBankName: nuban?.bankName ?? null,
          kycStatus: 'VERIFIED',
          isActive: true,
        },
      });

      return this.prisma.walletAccount.findUnique({ where: { userId } });
    } catch (err: any) {
      await this.prisma.walletAccount.update({
        where: { userId },
        data: { kycStatus: 'FAILED' },
      });
      throw err;
    }
  }

  /**
   * For users stuck in FAILED/SUBMITTED: re-checks Anchor for their current KYC
   * tier and, if verified, creates the deposit account and activates the wallet.
   * Safe to call repeatedly — idempotent.
   */
  async syncKyc(userId: string) {
    const wallet = await this.prisma.walletAccount.findUnique({
      where: { userId },
    });
    if (!wallet) throw new NotFoundException('Wallet not found');
    if (wallet.kycStatus === 'VERIFIED')
      return { status: 'VERIFIED', message: 'Wallet already active' };

    // If we never got an Anchor customer ID yet, user must start fresh via /kyc
    if (!wallet.anchorCustomerId) {
      return {
        status: wallet.kycStatus,
        message: 'No Anchor customer on record — please submit BVN to start.',
      };
    }

    console.log('syncing the bvn');

    const { tier, verified } = await this.anchor.getCustomerTier(
      wallet.anchorCustomerId,
    );

    console.log(tier, verified);

    if (!verified) {
      return {
        status: 'PENDING',
        tier,
        message:
          'BVN verification not yet confirmed by Anchor. Please try again in a few minutes.',
      };
    }

    // Tier is good — check if a deposit account already exists for this customer
    let anchorAccountId = wallet.anchorAccountId ?? undefined;
    let nuban = wallet.virtualAccountNo
      ? {
          accountNumber: wallet.virtualAccountNo,
          accountName: wallet.virtualAccountName,
          bankName: wallet.virtualBankName,
        }
      : null;

    if (!anchorAccountId) {
      const account = await this.anchor.createDepositAccount(
        wallet.anchorCustomerId,
      );
      anchorAccountId = account.id;
    }

    if (!nuban?.accountNumber) {
      nuban = await this.anchor.pollVirtualNubans(anchorAccountId);
    }

    await this.prisma.walletAccount.update({
      where: { userId },
      data: {
        anchorAccountId,
        virtualAccountNo: nuban?.accountNumber ?? null,
        virtualAccountName: nuban?.accountName ?? null,
        virtualBankName: nuban?.bankName ?? null,
        kycStatus: 'VERIFIED',
        isActive: true,
      },
    });

    return {
      status: 'VERIFIED',
      message: 'Wallet activated successfully',
      tier,
    };
  }

  /**
   * Called from the Anchor webhook when customer.identification.approved fires.
   * Looks up the wallet by anchorCustomerId and activates it.
   */
  async syncKycByAnchorCustomerId(anchorCustomerId: string): Promise<void> {
    const wallet = await this.prisma.walletAccount.findFirst({
      where: { anchorCustomerId },
    });
    if (!wallet || wallet.kycStatus === 'VERIFIED') return;
    await this.syncKyc(wallet.userId);
  }

  // ── Card top-up (Paystack) ─────────────────────────────────────────────────

  async initializeCardTopup(userId: string, amountNGN: number) {
    const wallet = await this.prisma.walletAccount.findUnique({
      where: { userId },
    });
    if (!wallet?.isActive)
      throw new BadRequestException('Complete wallet KYC before topping up');

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    if (!user) throw new NotFoundException('User not found');

    const reference = `wallet-topup-${randomUUID()}`;
    const result = await this.paystack.initializeTransaction(
      user.email,
      amountNGN,
      { userId, type: 'wallet_topup' },
      `${process.env.FRONTEND_URL}/wallet?verify=${reference}`,
      reference,
    );

    return { paymentUrl: result.authorizationUrl, reference };
  }

  async verifyCardTopup(userId: string, reference: string) {
    const result = await this.paystack.verifyTransaction(reference);
    if (result.status !== 'success') {
      throw new BadRequestException('Payment not successful');
    }

    // Idempotency — don't double-credit
    const existing = await this.prisma.walletTransaction.findUnique({
      where: { reference },
    });
    if (existing) return { success: true, alreadyVerified: true };

    const amountNGN = result.amount / 100;
    try {
      await this.creditWallet(userId, amountNGN, 'Card top-up', {
        type: 'CREDIT',
        reference,
        ledgerEvent: 'CARD_TOPUP',
        paystackRef: reference,
      });
    } catch (e: any) {
      if (e?.code === 'P2002') return { success: true, alreadyVerified: true };
      throw e;
    }

    await this.prisma.notification.create({
      data: {
        userId,
        type: 'GENERAL',
        title: 'Wallet funded',
        body: `₦${amountNGN.toLocaleString()} has been added to your Sage Nest wallet via card.`,
        data: { amount: amountNGN },
      },
    });

    return { success: true, amount: amountNGN };
  }

  // ── Sync balance from Anchor ────────────────────────────────────────────────

  async syncFromAnchor(userId: string) {
    const wallet = await this.prisma.walletAccount.findUnique({
      where: { userId },
    });
    if (!wallet) throw new NotFoundException('Wallet not found');
    if (!wallet.anchorAccountId) {
      return { synced: false, message: 'Wallet not yet activated.' };
    }

    let anchorBalance: number;
    try {
      anchorBalance = await this.anchor.getAccountBalance(
        wallet.anchorAccountId,
      );
    } catch (e: any) {
      // Network or DNS failure reaching Anchor — return gracefully so the frontend
      // polling loop doesn't get a 500 and can retry on its next attempt.
      const isNetworkError =
        e?.cause?.code === 'EAI_AGAIN' ||
        e?.code === 'EAI_AGAIN' ||
        e?.message?.includes('fetch failed') ||
        e?.message?.includes('ECONNREFUSED');
      if (isNetworkError) {
        this.logger.warn(
          `Anchor unreachable during wallet sync for user ${userId}: ${e?.cause?.code ?? e?.message}`,
        );
        return {
          synced: false,
          message: 'Could not reach Anchor — please try again shortly.',
        };
      }
      throw e;
    }
    const localBalance = wallet.availableBalance;
    const diff = +(anchorBalance - localBalance).toFixed(2);

    if (diff <= 0) {
      return {
        synced: false,
        message: 'Balance already up to date.',
        anchorBalance,
        localBalance,
      };
    }

    // Deterministic reference so concurrent sync calls are de-duped by unique constraint
    const reference = `anchor-sync-wallet-${userId}-bal${Math.round(anchorBalance * 100)}`;
    try {
      await this.creditWallet(
        userId,
        diff,
        'Bank transfer (synced from Anchor)',
        {
          type: 'CREDIT',
          reference,
          ledgerEvent: 'ANCHOR_SYNC_CORRECTION',
        },
      );
    } catch (e: any) {
      if (e?.code === 'P2002')
        return { synced: false, message: 'Balance already up to date.' };
      throw e;
    }

    this.logger.log(`Synced ₦${diff} for wallet userId=${userId} from Anchor`);
    return { synced: true, credited: diff, anchorBalance, localBalance };
  }

  // ── Balances & transactions ────────────────────────────────────────────────

  async getWallet(userId: string) {
    const wallet = await this.prisma.walletAccount.findUnique({
      where: { userId },
    });
    const record =
      wallet ?? (await this.prisma.walletAccount.create({ data: { userId } }));
    const { transactionPin: _, ...safe } = record;
    return safe;
  }

  // ── Transaction PIN ────────────────────────────────────────────────────────

  private async checkPin(userId: string, pin: string) {
    const wallet = await this.prisma.walletAccount.findUnique({
      where: { userId },
    });
    if (!wallet) throw new NotFoundException('Wallet not found');
    if (!wallet.transactionPinSet || !wallet.transactionPin)
      throw new BadRequestException('Transaction PIN not set');
    const valid = await bcrypt.compare(pin, wallet.transactionPin);
    if (!valid) throw new UnauthorizedException('Incorrect transaction PIN');
  }

  async setTransactionPin(userId: string, pin: string, confirmPin: string) {
    if (pin !== confirmPin) throw new BadRequestException('PINs do not match');
    if (!/^\d{4}$/.test(pin))
      throw new BadRequestException('PIN must be exactly 4 digits');

    const wallet = await this.prisma.walletAccount.findUnique({
      where: { userId },
    });
    if (!wallet) throw new NotFoundException('Wallet not found');
    if (wallet.transactionPinSet)
      throw new BadRequestException(
        'Transaction PIN already set. Use change-pin to update it.',
      );

    const hashed = await bcrypt.hash(pin, 10);
    await this.prisma.walletAccount.update({
      where: { userId },
      data: { transactionPin: hashed, transactionPinSet: true },
    });
    return { message: 'Transaction PIN set successfully' };
  }

  async changeTransactionPin(
    userId: string,
    currentPin: string,
    newPin: string,
    confirmPin: string,
  ) {
    if (newPin !== confirmPin)
      throw new BadRequestException('New PINs do not match');
    if (!/^\d{4}$/.test(newPin))
      throw new BadRequestException('PIN must be exactly 4 digits');

    await this.checkPin(userId, currentPin);

    const hashed = await bcrypt.hash(newPin, 10);
    await this.prisma.walletAccount.update({
      where: { userId },
      data: { transactionPin: hashed },
    });
    return { message: 'Transaction PIN updated successfully' };
  }

  async getPendingEscrows(landlordId: string) {
    // 1. Proper escrow records (created by webhook or wallet-pay)
    const escrows = await this.prisma.paymentEscrow.findMany({
      where: { landlordId, status: 'HOLDING' },
      orderBy: { releaseAt: 'asc' },
      select: {
        id: true,
        amount: true,
        netAmount: true,
        commission: true,
        type: true,
        releaseAt: true,
        bookingId: true,
        rentalPaymentId: true,
        createdAt: true,
      },
    });

    // 2. Paid bookings that have no escrow record yet (e.g. webhook didn't fire locally)
    const bookingsWithoutEscrow = await this.prisma.booking.findMany({
      where: {
        listing: { landlordId },
        paymentStatus: 'PAID',
        escrow: null,
      },
      select: {
        id: true,
        totalPrice: true,
        checkIn: true,
        paidAt: true,
        createdAt: true,
      },
    });

    // 3. Paid rental payments that have no escrow record yet
    const rentalsWithoutEscrow = await this.prisma.rentalPayment.findMany({
      where: {
        listing: { landlordId },
        status: 'PAID',
        escrow: null,
      },
      select: {
        id: true,
        amount: true,
        paidAt: true,
        createdAt: true,
      },
    });

    // Synthesise missing escrows so the frontend gets a uniform shape
    const syntheticFromBookings = bookingsWithoutEscrow.map((b) => {
      const commission = Math.round(b.totalPrice * COMMISSION_RATE * 100) / 100;
      const releaseAt = new Date(
        (b.paidAt ?? b.createdAt).getTime() +
          Math.max(
            SHORTLET_HOLD_HOURS,
            Math.ceil(
              (new Date(b.checkIn).getTime() - Date.now()) / 3_600_000,
            ) + SHORTLET_HOLD_HOURS,
          ) *
            3_600_000,
      );
      return {
        id: `booking-${b.id}`,
        amount: b.totalPrice,
        netAmount: b.totalPrice - commission,
        commission,
        type: 'SHORTLET_BOOKING' as const,
        releaseAt,
        bookingId: b.id,
        rentalPaymentId: null,
        createdAt: b.createdAt,
      };
    });

    const syntheticFromRentals = rentalsWithoutEscrow.map((r) => {
      const commission = Math.round(r.amount * COMMISSION_RATE * 100) / 100;
      const releaseAt = new Date(
        (r.paidAt ?? r.createdAt).getTime() + RENTAL_HOLD_HOURS * 3_600_000,
      );
      return {
        id: `rental-${r.id}`,
        amount: r.amount,
        netAmount: r.amount - commission,
        commission,
        type: 'RENTAL_PAYMENT' as const,
        releaseAt,
        bookingId: null,
        rentalPaymentId: r.id,
        createdAt: r.createdAt,
      };
    });

    return [...escrows, ...syntheticFromBookings, ...syntheticFromRentals].sort(
      (a, b) =>
        new Date(a.releaseAt).getTime() - new Date(b.releaseAt).getTime(),
    );
  }

  async getTransactions(userId: string, limit = 30, page = 1) {
    const skip = (page - 1) * limit;
    const [transactions, total] = await Promise.all([
      this.prisma.walletTransaction.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip,
      }),
      this.prisma.walletTransaction.count({ where: { userId } }),
    ]);
    return { transactions, total, page, limit };
  }

  // ── Internal ledger helpers ────────────────────────────────────────────────

  async creditWallet(
    userId: string,
    amountNGN: number,
    description: string,
    opts?: {
      type?: 'CREDIT' | 'ESCROW_RELEASE' | 'REFUND';
      bookingId?: string;
      rentalPaymentId?: string;
      escrowId?: string;
      reference?: string;
      // Ledger
      ledgerEvent?: LedgerEventType;
      ledgerGroupRef?: string;
      paystackRef?: string;
      anchorEventId?: string;
    },
  ) {
    const wallet = await this.prisma.walletAccount.findUnique({
      where: { userId },
    });
    if (!wallet) throw new NotFoundException('Wallet not found');

    const newBalance = wallet.availableBalance + amountNGN;
    const ref = opts?.reference ?? randomUUID();

    await this.prisma.$transaction([
      this.prisma.walletAccount.update({
        where: { userId },
        data: { availableBalance: newBalance },
      }),
      this.prisma.walletTransaction.create({
        data: {
          userId,
          walletAccountId: wallet.id,
          type: opts?.type ?? 'CREDIT',
          amount: amountNGN,
          balanceAfter: newBalance,
          description,
          reference: ref,
          bookingId: opts?.bookingId,
          rentalPaymentId: opts?.rentalPaymentId,
          escrowId: opts?.escrowId,
        },
      }),
    ]);

    // Dual-write to immutable ledger — non-blocking
    const eventType = opts?.ledgerEvent ?? 'BANK_DEPOSIT';
    const debitAccount =
      eventType === 'ESCROW_RELEASE' || eventType === 'ESCROW_REFUND'
        ? 'ESCROW'
        : eventType === 'WITHDRAWAL'
          ? 'FIRSTKEY_SAVINGS'
          : 'EXTERNAL';
    this.ledger
      .recordPair(
        {
          userId,
          accountType: debitAccount,
          amount: amountNGN,
          balanceAfter: 0, // we don't track EXTERNAL/ESCROW balance here
          eventType,
          reference: `${ref}-dbt`,
          description,
          groupRef: opts?.ledgerGroupRef,
          paystackRef: opts?.paystackRef,
          anchorEventId: opts?.anchorEventId,
        },
        {
          userId,
          accountType: 'WALLET',
          amount: amountNGN,
          balanceAfter: newBalance,
          eventType,
          reference: `${ref}-crd`,
          description,
          groupRef: opts?.ledgerGroupRef,
          paystackRef: opts?.paystackRef,
          anchorEventId: opts?.anchorEventId,
        },
      )
      .catch(() => {});
  }

  async debitWallet(
    userId: string,
    amountNGN: number,
    description: string,
    opts?: {
      type?: 'DEBIT' | 'ESCROW_HOLD' | 'WITHDRAWAL' | 'COMMISSION';
      bookingId?: string;
      rentalPaymentId?: string;
      escrowId?: string;
      reference?: string;
      // Ledger
      ledgerEvent?: LedgerEventType;
      ledgerGroupRef?: string;
    },
  ) {
    const wallet = await this.prisma.walletAccount.findUnique({
      where: { userId },
    });
    if (!wallet) throw new NotFoundException('Wallet not found');
    if (wallet.availableBalance < amountNGN)
      throw new BadRequestException('Insufficient wallet balance');

    const newBalance = wallet.availableBalance - amountNGN;
    const ref = opts?.reference ?? randomUUID();

    await this.prisma.$transaction([
      this.prisma.walletAccount.update({
        where: { userId },
        data: { availableBalance: newBalance },
      }),
      this.prisma.walletTransaction.create({
        data: {
          userId,
          walletAccountId: wallet.id,
          type: opts?.type ?? 'DEBIT',
          amount: amountNGN,
          balanceAfter: newBalance,
          description,
          reference: ref,
          bookingId: opts?.bookingId,
          rentalPaymentId: opts?.rentalPaymentId,
          escrowId: opts?.escrowId,
        },
      }),
    ]);

    // Dual-write to immutable ledger — non-blocking
    const eventType = opts?.ledgerEvent ?? 'WITHDRAWAL';
    const creditAccount =
      eventType === 'ESCROW_HOLD'
        ? 'ESCROW'
        : eventType === 'WALLET_TO_SAVINGS' ||
            eventType === 'SCHEDULED_CONTRIBUTION_WALLET'
          ? 'FIRSTKEY_SAVINGS'
          : 'EXTERNAL';
    this.ledger
      .recordPair(
        {
          userId,
          accountType: 'WALLET',
          amount: amountNGN,
          balanceAfter: newBalance,
          eventType,
          reference: `${ref}-dbt`,
          description,
          groupRef: opts?.ledgerGroupRef,
        },
        {
          userId,
          accountType: creditAccount,
          amount: amountNGN,
          balanceAfter: 0,
          eventType,
          reference: `${ref}-crd`,
          description,
          groupRef: opts?.ledgerGroupRef,
        },
      )
      .catch(() => {});
  }

  // ── Escrow ────────────────────────────────────────────────────────────────

  /**
   * Create an escrow hold after card payment (Paystack).
   * Debits tenant's pending balance (no actual debit — money is in Leadsage master Anchor).
   * Schedules automatic release to landlord after hold period.
   */
  async createEscrowFromCard(params: {
    payerId: string;
    landlordId: string;
    amountNGN: number;
    type: 'SHORTLET_BOOKING' | 'RENTAL_PAYMENT';
    bookingId?: string;
    rentalPaymentId?: string;
    paystackRef?: string;
    releaseHoursFromNow?: number;
  }): Promise<string> {
    const commission =
      Math.round(params.amountNGN * COMMISSION_RATE * 100) / 100;
    const netAmount = params.amountNGN - commission;
    const releaseAt = new Date(
      Date.now() +
        (params.releaseHoursFromNow ?? RENTAL_HOLD_HOURS) * 60 * 60 * 1000,
    );

    const escrow = await this.prisma.paymentEscrow.create({
      data: {
        payerId: params.payerId,
        landlordId: params.landlordId,
        amount: params.amountNGN,
        commission,
        netAmount,
        type: params.type,
        bookingId: params.bookingId,
        rentalPaymentId: params.rentalPaymentId,
        releaseAt,
        fundedByCard: true,
        paystackRef: params.paystackRef,
        status: 'HOLDING',
      },
    });

    return escrow.id;
  }

  /**
   * Create an escrow hold when tenant pays from their wallet.
   * Actually debits the tenant's wallet balance immediately.
   */
  async createEscrowFromWallet(params: {
    payerId: string;
    landlordId: string;
    amountNGN: number;
    type: 'SHORTLET_BOOKING' | 'RENTAL_PAYMENT';
    bookingId?: string;
    rentalPaymentId?: string;
    releaseHoursFromNow?: number;
  }): Promise<string> {
    const commission =
      Math.round(params.amountNGN * COMMISSION_RATE * 100) / 100;
    const netAmount = params.amountNGN - commission;
    const releaseAt = new Date(
      Date.now() +
        (params.releaseHoursFromNow ?? RENTAL_HOLD_HOURS) * 60 * 60 * 1000,
    );

    // Debit tenant's wallet
    await this.debitWallet(
      params.payerId,
      params.amountNGN,
      `Payment held in escrow${params.bookingId ? ` for booking` : ' for rent'}`,
      {
        type: 'ESCROW_HOLD',
        bookingId: params.bookingId,
        rentalPaymentId: params.rentalPaymentId,
        ledgerEvent: 'ESCROW_HOLD',
      },
    );

    const escrow = await this.prisma.paymentEscrow.create({
      data: {
        payerId: params.payerId,
        landlordId: params.landlordId,
        amount: params.amountNGN,
        commission,
        netAmount,
        type: params.type,
        bookingId: params.bookingId,
        rentalPaymentId: params.rentalPaymentId,
        releaseAt,
        fundedByWallet: true,
        status: 'HOLDING',
      },
    });

    return escrow.id;
  }

  /**
   * Release an escrow — credits landlord wallet (net amount) and records commission.
   * Called by the cron job.
   */
  async releaseEscrow(escrowId: string): Promise<void> {
    const escrow = await this.prisma.paymentEscrow.findUnique({
      where: { id: escrowId },
    });
    if (!escrow || escrow.status !== 'HOLDING') return;

    await this.prisma.paymentEscrow.update({
      where: { id: escrowId },
      data: { status: 'RELEASED', releasedAt: new Date() },
    });

    await this.creditWallet(
      escrow.landlordId,
      escrow.netAmount,
      `Payment released from escrow`,
      { type: 'ESCROW_RELEASE', escrowId, ledgerEvent: 'ESCROW_RELEASE' },
    );

    this.logger.log(
      `Escrow ${escrowId} released — ₦${escrow.netAmount} to landlord ${escrow.landlordId}`,
    );
  }

  /**
   * Refund an escrow back to the payer (e.g. cancelled booking).
   */
  async refundEscrow(escrowId: string): Promise<void> {
    const escrow = await this.prisma.paymentEscrow.findUnique({
      where: { id: escrowId },
    });
    if (!escrow || escrow.status !== 'HOLDING') return;

    await this.prisma.paymentEscrow.update({
      where: { id: escrowId },
      data: { status: 'REFUNDED' },
    });

    if (escrow.fundedByWallet) {
      // Refund straight back to tenant wallet
      await this.creditWallet(
        escrow.payerId,
        escrow.amount,
        'Refund from cancelled booking',
        { type: 'REFUND', escrowId, ledgerEvent: 'ESCROW_REFUND' },
      );
    }
    // If funded by card — Paystack refund is handled separately via PaystackService
  }

  // ── Wallet-pay for rent ────────────────────────────────────────────────────

  async payRentFromWallet(
    userId: string,
    rentalPaymentId: string,
    pin: string,
  ) {
    await this.checkPin(userId, pin);
    const payment = await this.prisma.rentalPayment.findFirst({
      where: { id: rentalPaymentId, userId },
      include: {
        listing: { select: { title: true, landlordId: true } },
      },
    });
    if (!payment) throw new NotFoundException('Payment not found');
    if (payment.status === 'PAID')
      throw new BadRequestException('Already paid');

    const escrowId = await this.createEscrowFromWallet({
      payerId: userId,
      landlordId: payment.listing.landlordId,
      amountNGN: payment.amount,
      type: 'RENTAL_PAYMENT',
      rentalPaymentId,
      releaseHoursFromNow: RENTAL_HOLD_HOURS,
    });

    await this.prisma.rentalPayment.update({
      where: { id: rentalPaymentId },
      data: { status: 'PAID', paidAt: new Date() },
    });

    return {
      escrowId,
      message: 'Payment held — will be released to landlord within 24 hours',
    };
  }

  // ── Wallet-pay for shortlet booking ───────────────────────────────────────

  async payBookingFromWallet(userId: string, bookingId: string, pin: string) {
    await this.checkPin(userId, pin);
    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, userId },
      include: {
        listing: {
          select: { title: true, landlordId: true, instantBook: true },
        },
      },
    });
    if (!booking) throw new NotFoundException('Booking not found');
    if (booking.paymentStatus === 'PAID')
      throw new BadRequestException('Already paid');

    const escrowId = await this.createEscrowFromWallet({
      payerId: userId,
      landlordId: booking.listing.landlordId,
      amountNGN: booking.totalPrice,
      type: 'SHORTLET_BOOKING',
      bookingId,
      // Release 24h after check-in, not immediately
      releaseHoursFromNow: Math.max(
        SHORTLET_HOLD_HOURS,
        Math.ceil(
          (new Date(booking.checkIn).getTime() - Date.now()) / 3_600_000,
        ) + SHORTLET_HOLD_HOURS,
      ),
    });

    const newStatus = booking.listing.instantBook ? 'CONFIRMED' : 'PENDING';
    await this.prisma.booking.update({
      where: { id: bookingId },
      data: {
        paymentStatus: 'PAID',
        paidAt: new Date(),
        status: newStatus,
        ...(booking.listing.instantBook ? { confirmedAt: new Date() } : {}),
      },
    });

    return { escrowId, status: newStatus };
  }

  // ── Withdrawal bank account management ───────────────────────────────────

  private readonly WITHDRAWAL_MIN = 1000;
  private readonly WITHDRAWAL_FEE = 50;
  private readonly BANK_CHANGE_COOLDOWN_DAYS = 30;

  async getBankAccount(userId: string) {
    const wallet = await this.prisma.walletAccount.findUnique({
      where: { userId },
      select: {
        withdrawalAccountNumber: true,
        withdrawalBankCode: true,
        withdrawalBankName: true,
        withdrawalAccountName: true,
        withdrawalAccountVerifiedAt: true,
        withdrawalAccountChangedAt: true,
      },
    });
    if (!wallet) throw new NotFoundException('Wallet not found');

    const cooldownDaysLeft = wallet.withdrawalAccountChangedAt
      ? Math.max(
          0,
          this.BANK_CHANGE_COOLDOWN_DAYS -
            Math.floor(
              (Date.now() -
                new Date(wallet.withdrawalAccountChangedAt).getTime()) /
                86_400_000,
            ),
        )
      : 0;

    return { ...wallet, cooldownDaysLeft };
  }

  async saveBankAccount(
    userId: string,
    accountNumber: string,
    bankCode: string,
    bankName: string,
    pin: string,
  ) {
    await this.checkPin(userId, pin);

    const wallet = await this.prisma.walletAccount.findUnique({
      where: { userId },
    });
    if (!wallet) throw new NotFoundException('Wallet not found');
    if (!wallet.isActive)
      throw new BadRequestException(
        'Complete KYC before adding a withdrawal account',
      );

    // 30-day cooldown check (skip if first time setting account)
    if (wallet.withdrawalAccountChangedAt) {
      const daysSinceChange = Math.floor(
        (Date.now() - new Date(wallet.withdrawalAccountChangedAt).getTime()) /
          86_400_000,
      );
      if (daysSinceChange < this.BANK_CHANGE_COOLDOWN_DAYS) {
        throw new BadRequestException(
          `You can only change your withdrawal account once every ${this.BANK_CHANGE_COOLDOWN_DAYS} days. ` +
            `Please try again in ${this.BANK_CHANGE_COOLDOWN_DAYS - daysSinceChange} day(s).`,
        );
      }
    }

    // Verify account and get name from bank
    const verifiedName = await this.verifyBankAccount(accountNumber, bankCode);
    const returnedName = verifiedName.accountName.toUpperCase();

    // Fuzzy name match — at least 2 of first/middle/last must appear in the bank account name
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { firstName: true, lastName: true, middleName: true },
    });

    const nameParts = [user?.firstName, user?.middleName, user?.lastName]
      .filter(Boolean)
      .map((n) => n!.toUpperCase());

    const matchCount = nameParts.filter((part) =>
      returnedName.includes(part),
    ).length;

    if (matchCount < 2) {
      throw new BadRequestException(
        `The account name "${verifiedName.accountName}" does not match your registered name. ` +
          'You can only withdraw to your own bank account.',
      );
    }

    await this.prisma.walletAccount.update({
      where: { userId },
      data: {
        withdrawalAccountNumber: accountNumber,
        withdrawalBankCode: bankCode,
        withdrawalBankName: bankName,
        withdrawalAccountName: verifiedName.accountName,
        withdrawalAccountVerifiedAt: new Date(),
        withdrawalAccountChangedAt: new Date(),
      },
    });

    return {
      message: 'Withdrawal account saved successfully',
      accountName: verifiedName.accountName,
    };
  }

  // ── Withdrawal request ─────────────────────────────────────────────────────

  async requestWithdrawal(userId: string, amount: number, pin: string) {
    await this.checkPin(userId, pin);

    if (amount < this.WITHDRAWAL_MIN) {
      throw new BadRequestException(
        `Minimum withdrawal amount is ₦${this.WITHDRAWAL_MIN.toLocaleString()}`,
      );
    }

    const wallet = await this.prisma.walletAccount.findUnique({
      where: { userId },
    });
    if (!wallet) throw new NotFoundException('Wallet not found');
    if (!wallet.isActive)
      throw new BadRequestException('Complete KYC before withdrawing');

    if (!wallet.withdrawalAccountNumber) {
      throw new BadRequestException(
        'Please set a verified withdrawal account before requesting a withdrawal',
      );
    }

    if (wallet.availableBalance < amount) {
      throw new BadRequestException('Insufficient wallet balance');
    }

    // Only one pending request at a time
    const existingPending = await this.prisma.withdrawalRequest.findFirst({
      where: { userId, status: 'PENDING' },
    });
    if (existingPending) {
      throw new BadRequestException(
        'You already have a pending withdrawal request. Please wait for it to be processed.',
      );
    }

    const fee = this.WITHDRAWAL_FEE;
    const netAmount = amount - fee;

    const request = await this.prisma.withdrawalRequest.create({
      data: {
        userId,
        amount,
        fee,
        netAmount,
        bankAccountNumber: wallet.withdrawalAccountNumber,
        bankCode: wallet.withdrawalBankCode!,
        bankName: wallet.withdrawalBankName!,
        accountName: wallet.withdrawalAccountName!,
      },
    });

    return {
      id: request.id,
      message: `Withdrawal request submitted. You will receive ₦${netAmount.toLocaleString()} within 24 hours.`,
      amount,
      fee,
      netAmount,
    };
  }

  async cancelWithdrawal(userId: string, requestId: string) {
    const request = await this.prisma.withdrawalRequest.findFirst({
      where: { id: requestId, userId },
    });
    if (!request) throw new NotFoundException('Withdrawal request not found');
    if (request.status !== 'PENDING') {
      throw new BadRequestException('Only pending requests can be cancelled');
    }

    await this.prisma.withdrawalRequest.update({
      where: { id: requestId },
      data: { status: 'CANCELLED' },
    });

    return { message: 'Withdrawal request cancelled' };
  }

  async getWithdrawalRequests(userId: string) {
    return this.prisma.withdrawalRequest.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
  }

  // ── Bank account verification (public — for name lookup) ──────────────────

  async verifyBankAccount(accountNumber: string, bankCode: string) {
    try {
      // Use Paystack's resolve-account API — it accepts standard CBN bank codes
      // (the same codes we display in the frontend BANKS list) and is free to call.
      const result = await this.paystack.resolveAccount(
        accountNumber,
        bankCode,
      );
      return { accountName: result.accountName };
    } catch {
      throw new BadRequestException(
        'Could not verify account — check the account number and bank',
      );
    }
  }

  // ── Used by admin service to execute a withdrawal ─────────────────────────

  async executeWithdrawalTransfer(
    userId: string,
    amount: number,
    netAmount: number,
    accountNumber: string,
    bankCode: string,
    accountName: string,
    reference: string,
  ) {
    // Debit wallet for the full requested amount (fee already reflected in netAmount shown to user)
    await this.debitWallet(userId, amount, `Withdrawal to ${accountName}`, {
      type: 'WITHDRAWAL',
      ledgerEvent: 'WITHDRAWAL',
      reference,
    });

    // Use Paystack's transfer API — accepts standard CBN bank codes,
    // debits the Leadsage Paystack business balance.
    const recipientCode = await this.paystack.createTransferRecipient(
      accountName,
      accountNumber,
      bankCode,
    );

    await this.paystack.initiatePaystackTransfer(
      recipientCode,
      netAmount,
      `Leadsage withdrawal`,
      reference,
    );
  }
}
