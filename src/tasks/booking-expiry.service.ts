import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from 'src/prisma/prisma.service';
import { MailService } from 'src/mail/mail.service';

@Injectable()
export class BookingExpiryService {
  private readonly logger = new Logger(BookingExpiryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  /** Run every 5 minutes — expire UNPAID bookings older than 30 minutes */
  @Cron('*/5 * * * *')
  async expireUnpaidBookings() {
    const cutoff = new Date(Date.now() - 30 * 60 * 1000); // 30 min ago

    const expired = await this.prisma.booking.findMany({
      where: {
        paymentStatus: 'UNPAID',
        status: 'PENDING',
        createdAt: { lt: cutoff },
      },
      include: {
        user: { select: { firstName: true, lastName: true, email: true } },
        listing: { select: { title: true, slug: true, id: true } },
      },
    });

    if (expired.length === 0) return;

    this.logger.log(`Expiring ${expired.length} unpaid booking(s)`);

    await Promise.all(
      expired.map(async (booking) => {
        // Cancel the booking
        await this.prisma.booking.update({
          where: { id: booking.id },
          data: {
            status: 'CANCELLED',
            cancelledAt: new Date(),
            cancelReason: 'Payment not received within 30 minutes',
          },
        });

        // In-app notification
        await this.prisma.notification.create({
          data: {
            userId: booking.userId,
            type: 'BOOKING_STATUS',
            title: 'Booking expired',
            body: `Your booking for "${booking.listing.title}" was cancelled because payment was not completed within 30 minutes. You can book again anytime.`,
            data: { listingId: booking.listingId },
          },
        });

        // Email the guest
        const listingPath = booking.listing.slug ?? booking.listing.id;
        const listingUrl = `${process.env.FRONTEND_URL ?? 'https://leadsageafrica.com'}/listings/${listingPath}`;

        await this.mail.sendMail({
          toEmail: booking.user.email,
          toName: `${booking.user.firstName} ${booking.user.lastName}`,
          subject: `Your booking for "${booking.listing.title}" has expired`,
          html: `
            <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#111827">
              <h2 style="margin-bottom:4px">Booking expired</h2>
              <p style="color:#6b7280;margin-top:0">
                Hi ${booking.user.firstName}, your reservation for
                <strong>${booking.listing.title}</strong> was automatically
                cancelled because payment was not completed within 30 minutes.
              </p>
              <p style="color:#6b7280">
                The dates are now available again. If you'd still like to stay,
                you can book again below.
              </p>
              <a href="${listingUrl}"
                 style="display:inline-block;margin-top:8px;padding:10px 20px;background:#111827;color:#fff;border-radius:6px;text-decoration:none;font-weight:500">
                Book again
              </a>
              <p style="margin-top:24px;font-size:13px;color:#9ca3af">
                If you believe this is a mistake, please contact our support team.
              </p>
            </div>`,
        });
      }),
    );

    this.logger.log(`Expired ${expired.length} booking(s) and notified guests`);
  }
}
