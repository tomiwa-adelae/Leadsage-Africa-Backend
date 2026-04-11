import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { PaystackService } from 'src/paystack/paystack.service';
import { MailService } from 'src/mail/mail.service';
import { RespondBookingDto } from './dto/respond-booking.dto';
import { RespondApplicationDto } from './dto/respond-application.dto';
import { UpdateCheckInInstructionsDto } from './dto/update-check-in-instructions.dto';

const BOOKING_LISTING_SELECT = {
  id: true,
  slug: true,
  title: true,
  area: true,
  state: true,
  photos: true,
  pricePerNight: true,
  instantBook: true,
  landlordId: true,
};

const USER_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  image: true,
  phoneNumber: true,
};

@Injectable()
export class LandlordService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paystack: PaystackService,
    private readonly mail: MailService,
  ) {}

  // ── Bookings ───────────────────────────────────────────────────────────────

  /** All bookings for listings owned by this landlord */
  async getBookings(landlordId: string, status?: string) {
    return this.prisma.booking.findMany({
      where: {
        listing: { landlordId },
        ...(status ? { status: status as any } : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        listing: { select: BOOKING_LISTING_SELECT },
        user: { select: USER_SELECT },
      },
    });
  }

  /** Single booking — must belong to landlord's listing */
  async getBookingById(landlordId: string, bookingId: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        listing: { select: { ...BOOKING_LISTING_SELECT, landlordId: true } },
        user: { select: USER_SELECT },
      },
    });

    if (!booking) throw new NotFoundException('Booking not found');
    if (booking.listing.landlordId !== landlordId)
      throw new ForbiddenException('Access denied');

    return booking;
  }

  /** Confirm a PENDING, PAID booking (for non-instant-book listings) */
  async confirmBooking(landlordId: string, bookingId: string, dto: RespondBookingDto) {
    const booking = await this.getBookingById(landlordId, bookingId);

    if (booking.status !== 'PENDING')
      throw new BadRequestException(
        'Only pending bookings can be confirmed',
      );

    if (booking.paymentStatus !== 'PAID')
      throw new BadRequestException(
        'Cannot confirm an unpaid booking. Awaiting payment.',
      );

    const updated = await this.prisma.booking.update({
      where: { id: bookingId },
      data: {
        status: 'CONFIRMED',
        confirmedAt: new Date(),
        landlordNote: dto.note,
      },
    });

    // Notify guest
    await this.prisma.notification.create({
      data: {
        userId: booking.userId,
        type: 'BOOKING_STATUS',
        title: 'Booking confirmed!',
        body: `Your booking for "${booking.listing.title}" has been confirmed by the host. Enjoy your stay!`,
        data: { bookingId },
      },
    });

    return updated;
  }

  /** Reject a PENDING booking and refund if paid */
  async rejectBooking(landlordId: string, bookingId: string, dto: RespondBookingDto) {
    const booking = await this.getBookingById(landlordId, bookingId);

    if (booking.status !== 'PENDING')
      throw new BadRequestException('Only pending bookings can be rejected');

    // Full refund if guest already paid
    if (booking.paymentStatus === 'PAID' && booking.paymentRef) {
      try {
        const tx = await this.paystack.verifyTransaction(booking.paymentRef);
        await this.paystack.refundTransaction(tx.id); // full refund
      } catch {
        // Refund failed — still reject, admin can process manually
      }
    }

    const updated = await this.prisma.booking.update({
      where: { id: bookingId },
      data: {
        status: 'REJECTED',
        landlordNote: dto.note,
        cancelledAt: new Date(),
        cancelReason: 'Rejected by host',
      },
    });

    // Notify guest
    await this.prisma.notification.create({
      data: {
        userId: booking.userId,
        type: 'BOOKING_STATUS',
        title: 'Booking not confirmed',
        body: `Unfortunately, the host couldn't confirm your booking for "${booking.listing.title}".${dto.note ? ` Reason: ${dto.note}` : ''} A full refund has been initiated.`,
        data: { bookingId },
      },
    });

    return updated;
  }

  /** Save / update check-in instructions and notify guest */
  async updateCheckInInstructions(
    landlordId: string,
    bookingId: string,
    dto: UpdateCheckInInstructionsDto,
  ) {
    const booking = await this.getBookingById(landlordId, bookingId);

    if (!['CONFIRMED', 'COMPLETED'].includes(booking.status))
      throw new BadRequestException(
        'Check-in instructions can only be added to confirmed bookings',
      );

    const isFirstPublish = !booking.instructionsPublishedAt;

    const updated = await this.prisma.booking.update({
      where: { id: bookingId },
      data: {
        ...dto,
        instructionsPublishedAt: new Date(),
      },
      include: {
        user: { select: { firstName: true, lastName: true, email: true } },
        listing: { select: { title: true, area: true, state: true } },
      },
    });

    // Notify guest in-app
    await this.prisma.notification.create({
      data: {
        userId: booking.userId,
        type: 'BOOKING_STATUS',
        title: isFirstPublish
          ? 'Check-in instructions are ready!'
          : 'Check-in instructions updated',
        body: `Your host has ${isFirstPublish ? 'shared' : 'updated'} check-in details for "${booking.listing.title}". Check your booking for access info.`,
        data: { bookingId },
      },
    });

    // Send email to guest
    await this._sendCheckInEmail(updated);

    return updated;
  }

  /** Resend the check-in instructions email to the guest */
  async resendCheckInInstructions(landlordId: string, bookingId: string) {
    const booking = await this.getBookingById(landlordId, bookingId);

    if (!booking.instructionsPublishedAt)
      throw new BadRequestException('No instructions have been published yet');

    const full = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        user: { select: { firstName: true, lastName: true, email: true } },
        listing: { select: { title: true, area: true, state: true } },
      },
    });

    await this._sendCheckInEmail(full!);
    return { ok: true };
  }

  private async _sendCheckInEmail(booking: any) {
    const guest = booking.user;
    const listing = booking.listing;

    const rows = [
      booking.keyHandover && `<tr><td style="padding:6px 0;color:#6b7280;width:160px">Key handover</td><td style="padding:6px 0;font-weight:500">${booking.keyHandover}</td></tr>`,
      booking.accessCode && `<tr><td style="padding:6px 0;color:#6b7280">Access code</td><td style="padding:6px 0;font-weight:500">${booking.accessCode}</td></tr>`,
      booking.checkInWindow && `<tr><td style="padding:6px 0;color:#6b7280">Check-in</td><td style="padding:6px 0;font-weight:500">${booking.checkInWindow}</td></tr>`,
      booking.checkOutTime && `<tr><td style="padding:6px 0;color:#6b7280">Check-out</td><td style="padding:6px 0;font-weight:500">${booking.checkOutTime}</td></tr>`,
      booking.wifiName && `<tr><td style="padding:6px 0;color:#6b7280">WiFi name</td><td style="padding:6px 0;font-weight:500">${booking.wifiName}</td></tr>`,
      booking.wifiPassword && `<tr><td style="padding:6px 0;color:#6b7280">WiFi password</td><td style="padding:6px 0;font-weight:500">${booking.wifiPassword}</td></tr>`,
      booking.emergencyContact && `<tr><td style="padding:6px 0;color:#6b7280">Emergency contact</td><td style="padding:6px 0;font-weight:500">${booking.emergencyContact}</td></tr>`,
      booking.generatorInfo && `<tr><td style="padding:6px 0;color:#6b7280">Generator</td><td style="padding:6px 0;font-weight:500">${booking.generatorInfo}</td></tr>`,
      booking.waterInfo && `<tr><td style="padding:6px 0;color:#6b7280">Water supply</td><td style="padding:6px 0;font-weight:500">${booking.waterInfo}</td></tr>`,
      booking.securityInfo && `<tr><td style="padding:6px 0;color:#6b7280">Security / entry</td><td style="padding:6px 0;font-weight:500">${booking.securityInfo}</td></tr>`,
    ]
      .filter(Boolean)
      .join('');

    const directionsBlock = booking.directions
      ? `<div style="margin-top:16px"><p style="color:#6b7280;margin:0 0 4px">Directions</p><p style="margin:0;white-space:pre-line">${booking.directions}</p>${booking.mapLink ? `<a href="${booking.mapLink}" style="color:#2563eb;font-size:14px">Open in Google Maps →</a>` : ''}</div>`
      : '';

    const houseRulesBlock = booking.houseRules
      ? `<div style="margin-top:16px"><p style="color:#6b7280;margin:0 0 4px">House rules</p><p style="margin:0;white-space:pre-line">${booking.houseRules}</p></div>`
      : '';

    const html = `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#111827">
        <h2 style="margin-bottom:4px">Your check-in instructions are ready</h2>
        <p style="color:#6b7280;margin-top:0">Hi ${guest.firstName}, here are your check-in details for <strong>${listing.title}</strong> (${listing.area}, ${listing.state}).</p>
        <table style="width:100%;border-collapse:collapse;margin-top:16px">${rows}</table>
        ${directionsBlock}
        ${houseRulesBlock}
        <p style="margin-top:24px;font-size:13px;color:#9ca3af">You can also view these details anytime in your <a href="${process.env.FRONTEND_URL ?? 'https://leadsageafrica.com'}/bookings/${booking.id}" style="color:#2563eb">booking page</a>.</p>
      </div>`;

    await this.mail.sendMail({
      toEmail: guest.email,
      toName: `${guest.firstName} ${guest.lastName}`,
      subject: `Check-in instructions – ${listing.title}`,
      html,
    });
  }

  /** Mark a CONFIRMED booking as completed (after check-out) */
  async completeBooking(landlordId: string, bookingId: string) {
    const booking = await this.getBookingById(landlordId, bookingId);

    if (booking.status !== 'CONFIRMED')
      throw new BadRequestException('Only confirmed bookings can be completed');

    return this.prisma.booking.update({
      where: { id: bookingId },
      data: { status: 'COMPLETED' },
    });
  }

  // ── Applications ───────────────────────────────────────────────────────────

  /** All applications for listings owned by this landlord */
  async getApplications(landlordId: string, status?: string) {
    return this.prisma.application.findMany({
      where: {
        listing: { landlordId },
        ...(status ? { status: status as any } : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        listing: {
          select: {
            id: true,
            slug: true,
            title: true,
            area: true,
            state: true,
            photos: true,
            pricePerYear: true,
            landlordId: true,
          },
        },
        user: { select: USER_SELECT },
      },
    });
  }

  /** Approve a PENDING or UNDER_REVIEW application */
  async approveApplication(
    landlordId: string,
    applicationId: string,
    dto: RespondApplicationDto,
  ) {
    const application = await this.prisma.application.findUnique({
      where: { id: applicationId },
      include: {
        listing: { select: { landlordId: true, title: true } },
      },
    });

    if (!application) throw new NotFoundException('Application not found');
    if (application.listing.landlordId !== landlordId)
      throw new ForbiddenException('Access denied');
    if (!['PENDING', 'UNDER_REVIEW'].includes(application.status))
      throw new BadRequestException(
        'Only pending or under-review applications can be approved',
      );

    const updated = await this.prisma.application.update({
      where: { id: applicationId },
      data: {
        status: 'APPROVED',
        landlordNote: dto.note,
        reviewedAt: new Date(),
      },
    });

    await this.prisma.notification.create({
      data: {
        userId: application.userId,
        type: 'APPLICATION_STATUS',
        title: 'Application approved!',
        body: `Your application for "${application.listing.title}" has been approved. The landlord will reach out to you shortly.`,
        data: { applicationId },
      },
    });

    return updated;
  }

  /** Reject an application */
  async rejectApplication(
    landlordId: string,
    applicationId: string,
    dto: RespondApplicationDto,
  ) {
    const application = await this.prisma.application.findUnique({
      where: { id: applicationId },
      include: {
        listing: { select: { landlordId: true, title: true } },
      },
    });

    if (!application) throw new NotFoundException('Application not found');
    if (application.listing.landlordId !== landlordId)
      throw new ForbiddenException('Access denied');
    if (!['PENDING', 'UNDER_REVIEW'].includes(application.status))
      throw new BadRequestException('Cannot reject this application');

    const updated = await this.prisma.application.update({
      where: { id: applicationId },
      data: {
        status: 'REJECTED',
        landlordNote: dto.note,
        reviewedAt: new Date(),
      },
    });

    await this.prisma.notification.create({
      data: {
        userId: application.userId,
        type: 'APPLICATION_STATUS',
        title: 'Application update',
        body: `Your application for "${application.listing.title}" was not successful this time.${dto.note ? ` Note: ${dto.note}` : ''}`,
        data: { applicationId },
      },
    });

    return updated;
  }

  /** Mark an application as UNDER_REVIEW */
  async markUnderReview(landlordId: string, applicationId: string) {
    const application = await this.prisma.application.findUnique({
      where: { id: applicationId },
      include: { listing: { select: { landlordId: true } } },
    });

    if (!application) throw new NotFoundException('Application not found');
    if (application.listing.landlordId !== landlordId)
      throw new ForbiddenException('Access denied');
    if (application.status !== 'PENDING')
      throw new BadRequestException('Only pending applications can be moved to review');

    return this.prisma.application.update({
      where: { id: applicationId },
      data: { status: 'UNDER_REVIEW', reviewedAt: new Date() },
    });
  }

  // ── Earnings ───────────────────────────────────────────────────────────────

  async getEarnings(landlordId: string) {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const twelveMonthsAgo = new Date(now.getFullYear() - 1, now.getMonth(), 1);

    // All CONFIRMED + COMPLETED bookings (= money received)
    const allBookings = await this.prisma.booking.findMany({
      where: {
        listing: { landlordId },
        status: { in: ['CONFIRMED', 'COMPLETED'] },
        paymentStatus: { in: ['PAID', 'PARTIALLY_REFUNDED'] },
      },
      orderBy: { createdAt: 'desc' },
      include: {
        listing: {
          select: { id: true, slug: true, title: true, photos: true },
        },
        user: {
          select: { firstName: true, lastName: true, image: true },
        },
      },
    });

    // COMPLETED = earned (stay happened)
    const earned = allBookings.filter((b) => b.status === 'COMPLETED');
    // CONFIRMED = pending payout (paid but stay hasn't happened yet)
    const pending = allBookings.filter((b) => b.status === 'CONFIRMED');

    const totalEarned = earned.reduce((s, b) => s + b.totalPrice - (b.refundAmount ?? 0), 0);
    const totalPending = pending.reduce((s, b) => s + b.totalPrice, 0);
    const thisMonthEarned = earned
      .filter((b) => new Date(b.createdAt) >= startOfMonth)
      .reduce((s, b) => s + b.totalPrice - (b.refundAmount ?? 0), 0);

    // Monthly breakdown — last 12 months (earned only)
    const monthlyMap = new Map<string, number>();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      monthlyMap.set(key, 0);
    }
    for (const b of earned) {
      const d = new Date(b.createdAt);
      if (d < twelveMonthsAgo) continue;
      const key = d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      if (monthlyMap.has(key)) {
        monthlyMap.set(key, monthlyMap.get(key)! + b.totalPrice - (b.refundAmount ?? 0));
      }
    }
    const monthly = Array.from(monthlyMap.entries()).map(([month, amount]) => ({ month, amount }));

    return {
      totalEarned,
      totalPending,
      thisMonthEarned,
      completedCount: earned.length,
      pendingCount: pending.length,
      monthly,
      transactions: allBookings,
    };
  }

  // ── Tours (for landlord's listings) ───────────────────────────────────────

  async getTours(landlordId: string, status?: string) {
    return this.prisma.tourRequest.findMany({
      where: {
        listing: { landlordId },
        ...(status ? { status: status as any } : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        listing: { select: { id: true, slug: true, title: true, area: true, state: true, photos: true } },
        user: { select: USER_SELECT },
        agent: { select: { firstName: true, lastName: true, phoneNumber: true, image: true } },
      },
    });
  }

  // ── Agreements (landlord signs) ────────────────────────────────────────────

  async getLandlordAgreements(landlordId: string) {
    return this.prisma.rentalAgreement.findMany({
      where: { landlordId },
      orderBy: { createdAt: 'desc' },
      include: {
        listing: { select: { id: true, slug: true, title: true, area: true, state: true, photos: true } },
        application: {
          select: {
            id: true, status: true,
            user: { select: { firstName: true, lastName: true, email: true, image: true } },
          },
        },
        payments: { select: { id: true, amount: true, dueDate: true, status: true } },
      },
    });
  }

  async getLandlordAgreementById(landlordId: string, agreementId: string) {
    const agreement = await this.prisma.rentalAgreement.findFirst({
      where: { id: agreementId, landlordId },
      include: {
        listing: { select: { id: true, title: true, area: true, state: true, address: true } },
        application: {
          select: {
            id: true, status: true,
            user: { select: { firstName: true, lastName: true, email: true, phoneNumber: true, image: true } },
          },
        },
        payments: { orderBy: { installmentNo: 'asc' } },
      },
    });
    if (!agreement) throw new NotFoundException('Agreement not found');
    return agreement;
  }

  async signAgreementAsLandlord(
    landlordId: string,
    agreementId: string,
    signature: string,
    ipAddress?: string,
  ) {
    const agreement = await this.prisma.rentalAgreement.findFirst({
      where: { id: agreementId, landlordId },
      include: {
        listing: { select: { title: true } },
        application: { select: { userId: true } },
      },
    });
    if (!agreement) throw new NotFoundException('Agreement not found');
    if (agreement.status !== 'PENDING_LANDLORD')
      throw new BadRequestException('Agreement is not awaiting your signature');

    const updated = await this.prisma.rentalAgreement.update({
      where: { id: agreementId },
      data: {
        landlordSignedAt: new Date(),
        landlordSignature: signature,
        landlordIpAddress: ipAddress,
        status: 'FULLY_SIGNED',
      },
    });

    // Notify tenant
    await this.prisma.notification.create({
      data: {
        userId: agreement.application.userId,
        type: 'GENERAL',
        title: 'Agreement fully signed!',
        body: `Your rental agreement for "${agreement.listing.title}" has been signed by both parties. Your tenancy is confirmed.`,
        data: { agreementId },
      },
    });

    return updated;
  }

  // ── Listing instant-book toggle ────────────────────────────────────────────

  async toggleInstantBook(landlordId: string, listingId: string) {
    const listing = await this.prisma.listing.findFirst({
      where: { id: listingId, landlordId, isDeleted: false },
    });

    if (!listing) throw new NotFoundException('Listing not found');
    if (!['SHORTLET', 'HOTEL_ROOM'].includes(listing.listingType))
      throw new BadRequestException(
        'Instant Book is only available for shortlets and hotel rooms',
      );

    return this.prisma.listing.update({
      where: { id: listingId },
      data: { instantBook: !listing.instantBook },
      select: { id: true, instantBook: true },
    });
  }
}
