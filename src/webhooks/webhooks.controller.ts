import {
  Controller,
  Post,
  Headers,
  Req,
  RawBodyRequest,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request } from 'express';
import { createHmac } from 'crypto';
import { PaystackService } from 'src/paystack/paystack.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { WalletService } from 'src/wallet/wallet.service';
import { SavingsService } from 'src/savings/savings.service';

@Controller('webhooks')
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);

  constructor(
    private readonly paystack: PaystackService,
    private readonly prisma: PrismaService,
    private readonly wallet: WalletService,
    private readonly savings: SavingsService,
  ) {}

  // ── Anchor webhook ─────────────────────────────────────────────────────────

  @Post('anchor')
  @HttpCode(HttpStatus.OK)
  async handleAnchor(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-anchor-signature') signature: string,
  ) {
    const rawBody = req.rawBody;
    if (!rawBody) return { received: true };

    // Verify signature using ANCHOR_SECRET_KEY
    const secret = process.env.ANCHOR_SECRET_KEY ?? '';
    if (secret && signature) {
      const expected = createHmac('sha256', secret)
        .update(rawBody)
        .digest('hex');
      if (expected !== signature) {
        this.logger.warn('Invalid Anchor webhook signature');
        return { received: true };
      }
    }

    let event: any;
    try {
      event = JSON.parse(rawBody.toString());
    } catch {
      return { received: true };
    }

    // Anchor puts the human-readable event string in attributes.eventType,
    // while data.type is the JSON:API resource type (e.g. "NipInboundTransfer")
    const eventType: string =
      event?.data?.attributes?.eventType ??
      event?.data?.type ??
      event?.event ??
      event?.type ??
      '';
    this.logger.log(`Anchor event: "${eventType}" | id: ${event?.data?.id ?? event?.id ?? '-'}`);

    const et = eventType.toLowerCase();

    // ── KYC approved ──────────────────────────────────────────────────────────
    if (et.includes('identification.approved') || et.includes('identification_approved')) {
      const customerId: string =
        event?.data?.relationships?.customer?.data?.id ?? '';
      if (customerId) {
        this.wallet.syncKycByAnchorCustomerId(customerId).catch((e) =>
          this.logger.error(`KYC sync error for customer ${customerId}: ${e}`),
        );
      }
      return { received: true };
    }

    // ── KYC rejected / error — mark wallet as FAILED ──────────────────────────
    if (et.includes('identification.rejected') || et.includes('identification.error') ||
        et.includes('identification_rejected') || et.includes('identification_error')) {
      const customerId: string =
        event?.data?.relationships?.customer?.data?.id ?? '';
      if (customerId) {
        await this.prisma.walletAccount.updateMany({
          where: { anchorCustomerId: customerId, kycStatus: { not: 'VERIFIED' } },
          data: { kycStatus: 'FAILED' },
        }).catch(() => {});
      }
      return { received: true };
    }

    // ── Virtual NUBAN assigned ─────────────────────────────────────────────────
    if (et.includes('virtualnuban.created') || et.includes('accountnumber.created') ||
        et.includes('virtual_nuban') || et.includes('account_number.created')) {
      await this.handleVirtualNubanCreated(event).catch((e) =>
        this.logger.error(`NUBAN created handler error: ${e}`),
      );
      return { received: true };
    }

    // ── Inbound NIP / RTP / Pay — money arrived into a virtual account ─────────
    // Live Anchor uses "nip.incomingTransfer.*"; older/sandbox used "nip.inbound_*"
    const INBOUND_EVENTS = [
      'nip.incomingtransfer.received',
      'nip.incomingtransfer.completed',
      'nip.incomingtransfer.settled',
      'nip.inbound_settled',
      'nip.inbound_completed',
      'nip.inbound_received',
      'rtp.incomingtransfer.received',
      'rtp.incomingtransfer.completed',
      'rtp.inbound_settled',
      'rtp.inbound_completed',
      'pay.inbound_received',
      'pay.inbound_completed',
      'transaction.successful',
    ];

    const isInbound =
      INBOUND_EVENTS.includes(et) ||
      ['incomingtransfer', 'inbound', 'deposit'].some((k) => et.includes(k));

    if (isInbound) {
      await this.handleAnchorInbound(event).catch((e) =>
        this.logger.error(`Anchor inbound handler error: ${e}`),
      );
    }

    return { received: true };
  }

  private async handleVirtualNubanCreated(event: any) {
    const data = event?.data ?? event;
    const attrs = data?.attributes ?? {};

    const accountNumber: string = attrs?.accountNumber ?? '';
    const accountName: string = attrs?.accountName ?? attrs?.name ?? '';
    const bankName: string = attrs?.bank?.name ?? '';

    // The account this NUBAN belongs to
    const anchorAccountId: string =
      data?.relationships?.settlementAccount?.data?.id ??
      data?.relationships?.account?.data?.id ??
      attrs?.settlementAccountId ??
      '';

    if (!anchorAccountId || !accountNumber) return;

    // Update wallet if it matches
    await this.prisma.walletAccount.updateMany({
      where: { anchorAccountId, virtualAccountNo: null },
      data: { virtualAccountNo: accountNumber, virtualAccountName: accountName, virtualBankName: bankName },
    }).catch(() => {});

    // Update savings plan if it matches
    await this.prisma.firstKeySavings.updateMany({
      where: { anchorAccountId, nuban: null },
      data: { nuban: accountNumber, bankName, accountName },
    }).catch(() => {});

    this.logger.log(`NUBAN assigned: ${accountNumber} → account ${anchorAccountId}`);
  }

  private async handleAnchorInbound(event: any) {
    // Anchor wraps payload in event.data (JSON:API style)
    const data = event?.data ?? event;
    const attrs = data?.attributes ?? {};
    const relationships = data?.relationships ?? {};
    const included: any[] = event?.included ?? [];

    // For nip.inbound.* events the transfer detail is in the included array, not data.attributes
    const transferObj = included.find((inc: any) =>
      inc.type === 'InboundNIPTransfer' || inc.type === 'NipInboundTransfer' ||
      inc.type === 'InboundTransfer',
    );

    // Amount — Anchor sends kobo; nip.inbound.* events carry amount in included transfer
    const amountKobo: number =
      transferObj?.attributes?.amount ??
      attrs?.amount ??
      attrs?.payment?.amount ??
      data?.amount ??
      0;
    const amountNGN = amountKobo / 100;
    if (amountNGN <= 0) return;

    // Find destination account
    const anchorAccountId: string =
      relationships?.account?.data?.id ??
      relationships?.destinationAccount?.data?.id ??
      attrs?.destinationAccountId ??
      attrs?.payment?.settlementAccount?.accountId ??
      attrs?.accountId ??
      data?.accountId ??
      '';

    if (!anchorAccountId) {
      this.logger.warn(`Anchor inbound: no accountId in payload — full event: ${JSON.stringify(event)}`);
      return;
    }

    // Idempotency — use the transfer's own reference so that the 3 events fired per transfer
    // (nip.inbound.received / completed / settled) all map to the same DB reference and only
    // the first one credits; subsequent ones hit the unique constraint and are ignored.
    const transferRef: string =
      transferObj?.attributes?.reference ??
      transferObj?.id ??
      relationships?.transfer?.data?.id ??
      attrs?.payment?.paymentReference ??
      attrs?.reference ??
      attrs?.sessionId ??
      data?.id ??
      '';
    const reference = `anchor-inbound-${transferRef || Date.now()}`;

    const narration: string =
      transferObj?.attributes?.description ??
      attrs?.narration ?? attrs?.description ?? attrs?.remark ?? 'Bank transfer received';

    // ── Check if this is a savings plan account ────────────────────────────
    const savingsPlan = await this.prisma.firstKeySavings.findFirst({
      where: { anchorAccountId },
    });

    if (savingsPlan) {
      await this.savings.handleAnchorDeposit(anchorAccountId, amountNGN, reference, narration)
        .catch((e) => this.logger.error(`Savings deposit handler error: ${e}`));
      return;
    }

    // ── Otherwise credit the main wallet ──────────────────────────────────
    const wallet = await this.prisma.walletAccount.findUnique({
      where: { anchorAccountId },
    });

    if (!wallet) {
      this.logger.warn(`Anchor inbound: no wallet or savings plan for accountId ${anchorAccountId}`);
      return;
    }

    const existing = await this.prisma.walletTransaction.findUnique({
      where: { reference },
    });
    if (existing) return;

    await this.wallet.creditWallet(
      wallet.userId,
      amountNGN,
      narration,
      {
        type: 'CREDIT',
        reference,
        ledgerEvent: 'BANK_DEPOSIT',
        anchorEventId: data?.id,
      },
    );

    await this.prisma.notification.create({
      data: {
        userId: wallet.userId,
        type: 'GENERAL',
        title: 'Wallet funded',
        body: `₦${amountNGN.toLocaleString()} has been added to your Leadsage wallet.`,
        data: { anchorAccountId, amount: amountNGN },
      },
    });

    this.logger.log(`Wallet credited: ₦${amountNGN} → user ${wallet.userId}`);
  }

  // ── Paystack webhook ───────────────────────────────────────────────────────

  @Post('paystack')
  @HttpCode(HttpStatus.OK)
  async handlePaystack(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-paystack-signature') signature: string,
  ) {
    const rawBody = req.rawBody;
    if (!rawBody) return { received: true };

    const valid = await this.paystack.verifyWebhookSignature(
      rawBody,
      signature,
    );
    if (!valid) {
      this.logger.warn('Invalid Paystack webhook signature');
      return { received: true };
    }

    const event = JSON.parse(rawBody.toString());
    this.logger.log(`Paystack event: ${event.event}`);

    if (event.event === 'charge.success') {
      await this.handleChargeSuccess(event.data);
    }

    if (event.event === 'refund.processed') {
      await this.handleRefundProcessed(event.data);
    }

    return { received: true };
  }

  // ── Handlers ───────────────────────────────────────────────────────────────

  private async handleChargeSuccess(data: any) {
    const reference: string = data.reference;
    const amountKobo: number = data.amount;
    const amountNGN = amountKobo / 100;
    const paidAt: string = data.paid_at;
    const metadata: Record<string, any> = data.metadata ?? {};

    // ── Shortlet booking payment ───────────────────────────────────────────
    const bookingId: string | undefined = metadata.bookingId;
    if (bookingId) {
      const booking = await this.prisma.booking.findUnique({
        where: { id: bookingId },
        include: {
          listing: { select: { title: true, landlordId: true, instantBook: true } },
          user: { select: { email: true, firstName: true } },
        },
      });

      if (!booking || booking.paymentStatus === 'PAID') return;

      const newStatus = booking.listing.instantBook ? 'CONFIRMED' : 'PENDING';

      await this.prisma.booking.update({
        where: { id: bookingId },
        data: {
          paymentStatus: 'PAID',
          paymentRef: reference,
          paidAt: new Date(paidAt),
          status: newStatus,
          ...(booking.listing.instantBook ? { confirmedAt: new Date() } : {}),
        },
      });

      // Create escrow — release 24h after check-in
      const hoursUntilCheckin = Math.max(
        24,
        Math.ceil((new Date(booking.checkIn).getTime() - Date.now()) / 3_600_000) + 24,
      );
      await this.wallet.createEscrowFromCard({
        payerId: booking.userId,
        landlordId: booking.listing.landlordId,
        amountNGN,
        type: 'SHORTLET_BOOKING',
        bookingId,
        paystackRef: reference,
        releaseHoursFromNow: hoursUntilCheckin,
      }).catch((e) => this.logger.error(`Escrow create failed: ${e}`));

      await this.prisma.notification.create({
        data: {
          userId: booking.userId,
          type: 'BOOKING_STATUS',
          title: booking.listing.instantBook ? 'Booking confirmed!' : 'Payment received — awaiting host confirmation',
          body: booking.listing.instantBook
            ? `Your booking for "${booking.listing.title}" is confirmed. Enjoy your stay!`
            : `Payment of ₦${amountNGN.toLocaleString()} received. The host will confirm your booking shortly.`,
          data: { bookingId },
        },
      });

      await this.prisma.notification.create({
        data: {
          userId: booking.listing.landlordId,
          type: 'BOOKING_STATUS',
          title: booking.listing.instantBook ? 'New instant booking confirmed' : 'New booking — payment received',
          body: booking.listing.instantBook
            ? `A booking for "${booking.listing.title}" has been confirmed and paid.`
            : `A guest has paid for "${booking.listing.title}". Please confirm or reject within 24 hours.`,
          data: { bookingId },
        },
      });
      return;
    }

    // ── Rental payment via card ────────────────────────────────────────────
    const rentalPaymentId: string | undefined = metadata.rentalPaymentId;
    if (rentalPaymentId) {
      const payment = await this.prisma.rentalPayment.findUnique({
        where: { id: rentalPaymentId },
        include: { listing: { select: { landlordId: true } } },
      });
      if (!payment || payment.status === 'PAID') return;

      await this.prisma.rentalPayment.update({
        where: { id: rentalPaymentId },
        data: { status: 'PAID', paidAt: new Date(paidAt), paystackRef: reference },
      });

      await this.wallet.createEscrowFromCard({
        payerId: payment.userId,
        landlordId: payment.listing.landlordId,
        amountNGN,
        type: 'RENTAL_PAYMENT',
        rentalPaymentId,
        paystackRef: reference,
        releaseHoursFromNow: 24,
      }).catch((e) => this.logger.error(`Escrow create failed: ${e}`));

      await this.prisma.notification.create({
        data: {
          userId: payment.userId,
          type: 'GENERAL',
          title: 'Rent payment received',
          body: `Your rent payment of ₦${amountNGN.toLocaleString()} has been received and is being processed.`,
          data: { rentalPaymentId },
        },
      });
    }
  }

  private async handleRefundProcessed(data: any) {
    const transactionReference: string = data.transaction?.reference;
    if (!transactionReference) return;

    const booking = await this.prisma.booking.findFirst({
      where: { paymentRef: transactionReference },
    });
    if (!booking) return;

    const refundAmountNGN = (data.amount ?? 0) / 100;
    const isFullRefund =
      Math.abs(refundAmountNGN - booking.totalPrice) < 1;

    await this.prisma.booking.update({
      where: { id: booking.id },
      data: {
        paymentStatus: isFullRefund ? 'REFUNDED' : 'PARTIALLY_REFUNDED',
        refundedAt: new Date(),
        refundAmount: refundAmountNGN,
      },
    });

    await this.prisma.notification.create({
      data: {
        userId: booking.userId,
        type: 'BOOKING_STATUS',
        title: 'Refund processed',
        body: `₦${refundAmountNGN.toLocaleString()} has been refunded to your account.`,
        data: { bookingId: booking.id },
      },
    });
  }
}
