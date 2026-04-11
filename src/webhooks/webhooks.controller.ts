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
import { PaystackService } from 'src/paystack/paystack.service';
import { PrismaService } from 'src/prisma/prisma.service';

@Controller('webhooks')
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);

  constructor(
    private readonly paystack: PaystackService,
    private readonly prisma: PrismaService,
  ) {}

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
    const paidAt: string = data.paid_at;
    const metadata: Record<string, any> = data.metadata ?? {};
    const bookingId: string | undefined = metadata.bookingId;

    if (!bookingId) return;

    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        listing: {
          select: {
            title: true,
            landlordId: true,
            instantBook: true,
          },
        },
        user: { select: { email: true, firstName: true } },
      },
    });

    if (!booking || booking.paymentStatus === 'PAID') return;

    // Determine new booking status
    const newStatus = booking.listing.instantBook ? 'CONFIRMED' : 'PENDING';

    await this.prisma.booking.update({
      where: { id: bookingId },
      data: {
        paymentStatus: 'PAID',
        paymentRef: reference,
        paidAt: new Date(paidAt),
        status: newStatus,
        ...(booking.listing.instantBook
          ? { confirmedAt: new Date() }
          : {}),
      },
    });

    // Notify the guest
    await this.prisma.notification.create({
      data: {
        userId: booking.userId,
        type: 'BOOKING_STATUS',
        title: booking.listing.instantBook
          ? 'Booking confirmed!'
          : 'Payment received — awaiting host confirmation',
        body: booking.listing.instantBook
          ? `Your booking for "${booking.listing.title}" is confirmed. Enjoy your stay!`
          : `Payment of ₦${(amountKobo / 100).toLocaleString()} received. The host will confirm your booking shortly.`,
        data: { bookingId },
      },
    });

    // Notify the landlord
    await this.prisma.notification.create({
      data: {
        userId: booking.listing.landlordId,
        type: 'BOOKING_STATUS',
        title: booking.listing.instantBook
          ? 'New instant booking confirmed'
          : 'New booking — payment received',
        body: booking.listing.instantBook
          ? `A booking for "${booking.listing.title}" has been confirmed and paid. Check your dashboard.`
          : `A guest has paid for "${booking.listing.title}". Please confirm or reject within 24 hours.`,
        data: { bookingId },
      },
    });
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
