import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { differenceInCalendarDays } from 'date-fns';
import { PrismaService } from 'src/prisma/prisma.service';
import { PaystackService } from 'src/paystack/paystack.service';
import { WalletService } from 'src/wallet/wallet.service';
import { CreateApplicationDto } from './dto/create-application.dto';
import { CreateBookingDto } from './dto/create-booking.dto';
import { CreateTourRequestDto } from './dto/create-tour-request.dto';
import { SubmitScreeningDto } from './dto/submit-screening.dto';
import { SignAgreementDto } from './dto/sign-agreement.dto';

@Injectable()
export class UserService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paystack: PaystackService,
    private readonly wallet: WalletService,
  ) {}

  // ── Dashboard Stats ────────────────────────────────────────────────────────

  async getStats(userId: string) {
    const [saved, applications, bookings, unreadNotifications, savingsPlans, wallet] =
      await Promise.all([
        this.prisma.savedListing.count({ where: { userId } }),
        this.prisma.application.count({ where: { userId } }),
        this.prisma.booking.count({ where: { userId } }),
        this.prisma.notification.count({ where: { userId, isRead: false } }),
        this.prisma.firstKeySavings.findMany({
          where: { userId, status: { in: ['ACTIVE', 'PAUSED', 'MATURED'] } },
          select: { id: true, planName: true, totalDeposited: true, interestEarned: true, status: true },
        }),
        this.prisma.walletAccount.findUnique({ where: { userId }, select: { availableBalance: true } }),
      ]);

    const recentApplications = await this.prisma.application.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 5,
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
            pricePerNight: true,
            listingType: true,
          },
        },
      },
    });

    const recentBookings = await this.prisma.booking.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: {
        listing: {
          select: {
            id: true,
            slug: true,
            title: true,
            area: true,
            state: true,
            photos: true,
            pricePerNight: true,
          },
        },
      },
    });

    const savingsTotalBalance = savingsPlans.reduce(
      (sum, p) => sum + p.totalDeposited + p.interestEarned, 0,
    );
    const savingsTotalInterest = savingsPlans.reduce(
      (sum, p) => sum + p.interestEarned, 0,
    );

    return {
      saved,
      applications,
      bookings,
      unreadNotifications,
      walletBalance: wallet?.availableBalance ?? 0,
      savings: {
        activePlans: savingsPlans.length,
        totalBalance: savingsTotalBalance,
        totalInterest: savingsTotalInterest,
        plans: savingsPlans,
      },
      recentApplications,
      recentBookings,
    };
  }

  // ── Saved Listings ─────────────────────────────────────────────────────────

  async getSaved(userId: string) {
    return this.prisma.savedListing.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        listing: {
          select: {
            id: true,
            slug: true,
            title: true,
            listingType: true,
            propertyCategory: true,
            state: true,
            lga: true,
            area: true,
            bedrooms: true,
            bathrooms: true,
            pricePerYear: true,
            pricePerNight: true,
            photos: true,
            status: true,
            availableFrom: true,
          },
        },
      },
    });
  }

  async saveListing(userId: string, listingId: string) {
    const listing = await this.prisma.listing.findFirst({
      where: { id: listingId, isDeleted: false, status: 'PUBLISHED' },
    });
    if (!listing) throw new NotFoundException('Listing not found');

    const existing = await this.prisma.savedListing.findUnique({
      where: { userId_listingId: { userId, listingId } },
    });
    if (existing) throw new ConflictException('Listing already saved');

    return this.prisma.savedListing.create({ data: { userId, listingId } });
  }

  async unsaveListing(userId: string, listingId: string) {
    const record = await this.prisma.savedListing.findUnique({
      where: { userId_listingId: { userId, listingId } },
    });
    if (!record) throw new NotFoundException('Saved listing not found');

    await this.prisma.savedListing.delete({
      where: { userId_listingId: { userId, listingId } },
    });
    return { message: 'Listing removed from saved' };
  }

  // ── Applications ───────────────────────────────────────────────────────────

  async getApplications(userId: string) {
    return this.prisma.application.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        listing: {
          select: {
            id: true,
            slug: true,
            title: true,
            listingType: true,
            state: true,
            area: true,
            photos: true,
            pricePerYear: true,
            landlord: {
              select: {
                firstName: true,
                lastName: true,
                image: true,
                phoneNumber: true,
              },
            },
          },
        },
      },
    });
  }

  async createApplication(userId: string, dto: CreateApplicationDto) {
    const listing = await this.prisma.listing.findFirst({
      where: {
        id: dto.listingId,
        isDeleted: false,
        status: 'PUBLISHED',
        listingType: { in: ['LONG_TERM', 'OFFICE_SPACE'] },
      },
    });
    if (!listing)
      throw new NotFoundException(
        'Listing not found or not accepting applications',
      );

    if (listing.landlordId === userId)
      throw new BadRequestException('You cannot apply to your own listing');

    const existing = await this.prisma.application.findUnique({
      where: { userId_listingId: { userId, listingId: dto.listingId } },
    });
    if (existing)
      throw new ConflictException(
        'You have already applied to this listing',
      );

    const application = await this.prisma.application.create({
      data: {
        userId,
        listingId: dto.listingId,
        message: dto.message,
        moveInDate: dto.moveInDate ? new Date(dto.moveInDate) : null,
      },
    });

    // Notify landlord (create notification for landlord)
    await this.prisma.notification.create({
      data: {
        userId: listing.landlordId,
        type: 'APPLICATION_STATUS',
        title: 'New rental application',
        body: `Someone has applied for "${listing.title}". Review the application in your dashboard.`,
        data: { applicationId: application.id, listingId: listing.id },
      },
    });

    return application;
  }

  async withdrawApplication(userId: string, applicationId: string) {
    const application = await this.prisma.application.findFirst({
      where: { id: applicationId, userId },
    });
    if (!application) throw new NotFoundException('Application not found');

    if (!['PENDING', 'UNDER_REVIEW'].includes(application.status))
      throw new BadRequestException(
        'Only pending or under-review applications can be withdrawn',
      );

    return this.prisma.application.update({
      where: { id: applicationId },
      data: { status: 'WITHDRAWN' },
    });
  }

  // ── Bookings ───────────────────────────────────────────────────────────────

  async getBookings(userId: string) {
    return this.prisma.booking.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        listing: {
          select: {
            id: true,
            slug: true,
            title: true,
            state: true,
            area: true,
            photos: true,
            pricePerNight: true,
            landlord: {
              select: {
                firstName: true,
                lastName: true,
                image: true,
                phoneNumber: true,
              },
            },
          },
        },
      },
    });
  }

  async getBookingById(userId: string, bookingId: string) {
    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, userId },
      include: {
        listing: {
          select: {
            id: true,
            slug: true,
            title: true,
            state: true,
            lga: true,
            area: true,
            address: true,
            photos: true,
            pricePerNight: true,
            listingType: true,
            landlord: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                image: true,
                phoneNumber: true,
                email: true,
              },
            },
          },
        },
      },
    });

    if (!booking) throw new NotFoundException('Booking not found');
    return booking;
  }

  async createBooking(userId: string, dto: CreateBookingDto) {
    const listing = await this.prisma.listing.findFirst({
      where: {
        id: dto.listingId,
        isDeleted: false,
        status: 'PUBLISHED',
        listingType: { in: ['SHORTLET', 'HOTEL_ROOM'] },
      },
    });
    if (!listing)
      throw new NotFoundException(
        'Listing not found or not available for booking',
      );

    if (listing.landlordId === userId)
      throw new BadRequestException('You cannot book your own listing');

    if (!listing.pricePerNight)
      throw new BadRequestException('This listing has no nightly price set');

    const checkIn = new Date(dto.checkIn);
    const checkOut = new Date(dto.checkOut);

    if (checkOut <= checkIn)
      throw new BadRequestException('Check-out must be after check-in');

    const nights = differenceInCalendarDays(checkOut, checkIn);

    if (listing.minimumNights && nights < listing.minimumNights)
      throw new BadRequestException(
        `Minimum stay is ${listing.minimumNights} night(s)`,
      );

    // ── Date conflict check ────────────────────────────────────────────────
    // Block if any PENDING or CONFIRMED booking overlaps with requested dates
    const conflict = await this.prisma.booking.findFirst({
      where: {
        listingId: dto.listingId,
        status: { in: ['PENDING', 'CONFIRMED'] },
        checkIn: { lt: checkOut },
        checkOut: { gt: checkIn },
      },
    });
    if (conflict)
      throw new ConflictException(
        'These dates are not available. Please choose different dates.',
      );

    const totalPrice = listing.pricePerNight * nights;

    // ── Create the booking (UNPAID, PENDING) ──────────────────────────────
    const booking = await this.prisma.booking.create({
      data: {
        userId,
        listingId: dto.listingId,
        checkIn,
        checkOut,
        nights,
        totalPrice,
        guestCount: dto.guestCount,
        specialRequests: dto.specialRequests,
        paymentStatus: 'UNPAID',
        status: 'PENDING',
      },
    });

    // ── Initialize Paystack payment ────────────────────────────────────────
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, firstName: true, lastName: true },
    });

    const frontendUrl =
      process.env.FRONTEND_URL?.split(',')[0]?.trim() ?? 'http://localhost:3000';
    const callbackUrl = `${frontendUrl}/bookings/payment/callback`;

    const { authorizationUrl, reference } =
      await this.paystack.initializeTransaction(
        user!.email,
        totalPrice,
        {
          bookingId: booking.id,
          listingId: listing.id,
          listingTitle: listing.title,
          userId,
          nights,
          checkIn: checkIn.toISOString(),
          checkOut: checkOut.toISOString(),
        },
        callbackUrl,
      );

    // Store reference immediately so webhook can match it
    await this.prisma.booking.update({
      where: { id: booking.id },
      data: { paymentRef: reference },
    });

    return {
      booking: { ...booking, paymentRef: reference },
      paymentUrl: authorizationUrl,
    };
  }

  /** Re-initialize Paystack for an existing UNPAID booking */
  async initiateBookingPayment(userId: string, bookingId: string) {
    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, userId },
      include: { listing: { select: { title: true, id: true } } },
    });
    if (!booking) throw new NotFoundException('Booking not found');
    if (booking.paymentStatus === 'PAID')
      throw new BadRequestException('Already paid');

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });

    const frontendUrl =
      process.env.FRONTEND_URL?.split(',')[0]?.trim() ?? 'http://localhost:3000';
    const callbackUrl = `${frontendUrl}/bookings/payment/callback`;

    const { authorizationUrl, reference } =
      await this.paystack.initializeTransaction(
        user!.email,
        booking.totalPrice,
        { bookingId: booking.id, userId },
        callbackUrl,
      );

    await this.prisma.booking.update({
      where: { id: bookingId },
      data: { paymentRef: reference },
    });

    return { paymentUrl: authorizationUrl, reference };
  }

  async getBookingByReference(userId: string, paymentRef: string) {
    const booking = await this.prisma.booking.findFirst({
      where: { userId, paymentRef },
      include: {
        listing: {
          select: {
            title: true,
            area: true,
            state: true,
            instantBook: true,
          },
        },
      },
    });
    if (!booking) throw new NotFoundException('Booking not found');
    return booking;
  }

  /**
   * Called by the frontend callback page to verify payment directly with
   * Paystack and update the booking — handles the case where the webhook
   * hasn't fired yet (e.g. localhost development).
   */
  async verifyBookingPayment(userId: string, paymentRef: string) {
    const booking = await this.prisma.booking.findFirst({
      where: { userId, paymentRef },
      include: {
        listing: {
          select: {
            title: true,
            area: true,
            state: true,
            instantBook: true,
            landlordId: true,
          },
        },
      },
    });
    if (!booking) throw new NotFoundException('Booking not found');

    // Already processed — return as-is
    if (booking.paymentStatus === 'PAID') return booking;

    // Ask Paystack directly
    const tx = await this.paystack.verifyTransaction(paymentRef);

    if (tx.status !== 'success') {
      return booking; // still unpaid / abandoned
    }

    const newStatus = booking.listing.instantBook ? 'CONFIRMED' : 'PENDING';

    const updated = await this.prisma.booking.update({
      where: { id: booking.id },
      data: {
        paymentStatus: 'PAID',
        paidAt: tx.paidAt ? new Date(tx.paidAt) : new Date(),
        status: newStatus,
        ...(booking.listing.instantBook ? { confirmedAt: new Date() } : {}),
      },
      include: {
        listing: {
          select: {
            title: true,
            area: true,
            state: true,
            instantBook: true,
          },
        },
      },
    });

    // Notify guest
    await this.prisma.notification.create({
      data: {
        userId: booking.userId,
        type: 'BOOKING_STATUS',
        title: booking.listing.instantBook
          ? 'Booking confirmed!'
          : 'Payment received — awaiting host confirmation',
        body: booking.listing.instantBook
          ? `Your booking for "${booking.listing.title}" is confirmed. Enjoy your stay!`
          : `Payment received. The host will confirm your booking shortly.`,
        data: { bookingId: booking.id },
      },
    });

    // Notify landlord
    await this.prisma.notification.create({
      data: {
        userId: booking.listing.landlordId,
        type: 'BOOKING_STATUS',
        title: booking.listing.instantBook
          ? 'New instant booking confirmed'
          : 'New booking — payment received',
        body: booking.listing.instantBook
          ? `A booking for "${booking.listing.title}" has been confirmed and paid.`
          : `A guest has paid for "${booking.listing.title}". Please confirm or reject.`,
        data: { bookingId: booking.id },
      },
    });

    return updated;
  }

  async cancelBooking(userId: string, bookingId: string) {
    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, userId },
      include: {
        listing: { select: { landlordId: true, title: true } },
      },
    });
    if (!booking) throw new NotFoundException('Booking not found');

    if (!['PENDING', 'CONFIRMED'].includes(booking.status))
      throw new BadRequestException('This booking cannot be cancelled');

    // ── Moderate cancellation policy ──────────────────────────────────────
    // Free cancellation  : 5+ days before check-in → full refund
    // Partial cancellation: 1-5 days before         → 50% refund
    // No refund           : <24 h before check-in
    let refundAmount: number | undefined;

    if (booking.paymentStatus === 'PAID') {
      const now = new Date();
      const daysUntilCheckIn = differenceInCalendarDays(booking.checkIn, now);

      if (daysUntilCheckIn >= 5) {
        refundAmount = booking.totalPrice; // full refund
      } else if (daysUntilCheckIn >= 1) {
        refundAmount = booking.totalPrice * 0.5; // 50%
      }
      // daysUntilCheckIn < 1 → no refund

      if (refundAmount !== undefined && booking.paymentRef) {
        // Fetch Paystack transaction to get numeric ID for refund
        try {
          const tx = await this.paystack.verifyTransaction(booking.paymentRef);
          await this.paystack.refundTransaction(tx.id, refundAmount);
        } catch {
          // Refund attempt failed — still cancel, admin can handle manually
        }
      }
    }

    const updated = await this.prisma.booking.update({
      where: { id: bookingId },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancelReason: 'Cancelled by guest',
      },
    });

    // Notify landlord
    await this.prisma.notification.create({
      data: {
        userId: booking.listing.landlordId,
        type: 'BOOKING_STATUS',
        title: 'Booking cancelled by guest',
        body: `A guest cancelled their booking for "${booking.listing.title}".`,
        data: { bookingId },
      },
    });

    return {
      booking: updated,
      refundAmount: refundAmount ?? 0,
      refundInitiated: refundAmount !== undefined && refundAmount > 0,
    };
  }

  // ── Notifications ──────────────────────────────────────────────────────────

  async getNotifications(userId: string) {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async markAllRead(userId: string) {
    await this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
    return { message: 'All notifications marked as read' };
  }

  async markOneRead(userId: string, notificationId: string) {
    const notification = await this.prisma.notification.findFirst({
      where: { id: notificationId, userId },
    });
    if (!notification) throw new NotFoundException('Notification not found');

    return this.prisma.notification.update({
      where: { id: notificationId },
      data: { isRead: true },
    });
  }

  // ── Tour Requests ──────────────────────────────────────────────────────────

  async createTourRequest(userId: string, dto: CreateTourRequestDto) {
    const listing = await this.prisma.listing.findFirst({
      where: {
        id: dto.listingId,
        isDeleted: false,
        status: 'PUBLISHED',
        listingType: 'LONG_TERM',
      },
    });
    if (!listing)
      throw new NotFoundException('Listing not found or not a long-term rental');

    if (listing.landlordId === userId)
      throw new BadRequestException('You cannot request a tour for your own listing');

    // One active tour per listing per user
    const existingTour = await this.prisma.tourRequest.findFirst({
      where: {
        listingId: dto.listingId,
        userId,
        status: { notIn: ['CANCELLED'] },
      },
    });
    if (existingTour)
      throw new ConflictException('You already have an active tour request for this listing');

    const tour = await this.prisma.tourRequest.create({
      data: {
        listingId: dto.listingId,
        userId,
        preferredDate: dto.preferredDate ? new Date(dto.preferredDate) : null,
        notes: dto.notes,
      },
    });

    // Notify admin
    await this.prisma.notification.create({
      data: {
        userId,
        type: 'GENERAL',
        title: 'Tour request submitted',
        body: `Your tour request for "${listing.title}" has been received. We'll schedule it shortly.`,
        data: { tourRequestId: tour.id },
      },
    });

    return tour;
  }

  async getTourRequests(userId: string) {
    return this.prisma.tourRequest.findMany({
      where: { userId },
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
            address: true,
          },
        },
        agent: {
          select: { firstName: true, lastName: true, phoneNumber: true, image: true },
        },
      },
    });
  }

  async getTourRequestById(userId: string, tourId: string) {
    const tour = await this.prisma.tourRequest.findFirst({
      where: { id: tourId, userId },
      include: {
        listing: {
          select: {
            id: true,
            slug: true,
            title: true,
            area: true,
            state: true,
            address: true,
            photos: true,
            pricePerYear: true,
            paymentFrequency: true,
            bedrooms: true,
            bathrooms: true,
            landlord: {
              select: { firstName: true, lastName: true, image: true, phoneNumber: true },
            },
          },
        },
        agent: {
          select: { firstName: true, lastName: true, phoneNumber: true, image: true },
        },
        application: {
          select: { id: true, status: true, screeningSubmittedAt: true },
        },
      },
    });
    if (!tour) throw new NotFoundException('Tour request not found');
    return tour;
  }

  async cancelTourRequest(userId: string, tourId: string) {
    const tour = await this.prisma.tourRequest.findFirst({
      where: { id: tourId, userId },
    });
    if (!tour) throw new NotFoundException('Tour request not found');
    if (!['PENDING', 'SCHEDULED'].includes(tour.status))
      throw new BadRequestException('This tour cannot be cancelled');

    return this.prisma.tourRequest.update({
      where: { id: tourId },
      data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: 'Cancelled by renter' },
    });
  }

  // ── Full Screening Application ─────────────────────────────────────────────

  async submitScreening(userId: string, dto: SubmitScreeningDto) {
    const listing = await this.prisma.listing.findFirst({
      where: {
        id: dto.listingId,
        isDeleted: false,
        status: 'PUBLISHED',
        listingType: 'LONG_TERM',
      },
      select: { id: true, title: true, landlordId: true },
    });
    if (!listing)
      throw new NotFoundException('Listing not found or not available');

    if (listing.landlordId === userId)
      throw new BadRequestException('You cannot apply to your own listing');

    // Upsert: create if no application, update if existing draft
    const existing = await this.prisma.application.findUnique({
      where: { userId_listingId: { userId, listingId: dto.listingId } },
    });

    if (existing && ['APPROVED', 'REJECTED'].includes(existing.status))
      throw new BadRequestException('This application has already been processed');

    // If tourRequestId given, verify it belongs to this user + listing
    if (dto.tourRequestId) {
      const tour = await this.prisma.tourRequest.findFirst({
        where: { id: dto.tourRequestId, userId, listingId: dto.listingId },
      });
      if (!tour) throw new BadRequestException('Invalid tour request reference');
    }

    const data = {
      message: dto.message,
      moveInDate: dto.moveInDate ? new Date(dto.moveInDate) : undefined,
      tenancyMonths: dto.tenancyMonths,
      reasonForMoving: dto.reasonForMoving,
      nin: dto.nin,
      employmentStatus: dto.employmentStatus,
      employer: dto.employer,
      jobTitle: dto.jobTitle,
      monthlyIncome: dto.monthlyIncome,
      employmentDocUrl: dto.employmentDocUrl,
      ref1Name: dto.ref1Name,
      ref1Phone: dto.ref1Phone,
      ref1Relation: dto.ref1Relation,
      ref2Name: dto.ref2Name,
      ref2Phone: dto.ref2Phone,
      ref2Relation: dto.ref2Relation,
      tourRequestId: dto.tourRequestId ?? undefined,
      status: 'PENDING' as const,
      screeningSubmittedAt: new Date(),
    };

    let application;
    if (existing) {
      application = await this.prisma.application.update({
        where: { id: existing.id },
        data,
      });
    } else {
      application = await this.prisma.application.create({
        data: { userId, listingId: dto.listingId, ...data },
      });
    }

    // Notify landlord
    await this.prisma.notification.create({
      data: {
        userId: listing.landlordId,
        type: 'APPLICATION_STATUS',
        title: 'New rental application received',
        body: `A full screening application has been submitted for "${listing.title}".`,
        data: { applicationId: application.id },
      },
    });

    return application;
  }

  async getApplicationById(userId: string, applicationId: string) {
    const app = await this.prisma.application.findFirst({
      where: { id: applicationId, userId },
      include: {
        listing: {
          select: {
            id: true,
            slug: true,
            title: true,
            area: true,
            state: true,
            address: true,
            photos: true,
            pricePerYear: true,
            paymentFrequency: true,
            cautionFee: true,
            landlord: {
              select: { firstName: true, lastName: true, image: true, phoneNumber: true },
            },
          },
        },
        tourRequest: { select: { id: true, status: true, scheduledAt: true } },
        agreement: {
          select: {
            id: true,
            status: true,
            startDate: true,
            endDate: true,
            monthlyRent: true,
            cautionFee: true,
            tenantSignedAt: true,
            landlordSignedAt: true,
          },
        },
        payments: {
          orderBy: { installmentNo: 'asc' },
          select: {
            id: true,
            amount: true,
            dueDate: true,
            installmentNo: true,
            totalInstallments: true,
            status: true,
            paidAt: true,
          },
        },
      },
    });
    if (!app) throw new NotFoundException('Application not found');
    return app;
  }

  // ── Agreement Signing ──────────────────────────────────────────────────────

  async getAgreement(userId: string, agreementId: string) {
    const agreement = await this.prisma.rentalAgreement.findFirst({
      where: { id: agreementId, tenantId: userId },
      include: {
        listing: {
          select: {
            title: true,
            area: true,
            state: true,
            address: true,
            photos: true,
          },
        },
        application: {
          select: { id: true, status: true },
        },
        payments: {
          orderBy: { installmentNo: 'asc' },
        },
      },
    });
    if (!agreement) throw new NotFoundException('Agreement not found');
    return agreement;
  }

  async getMyAgreements(userId: string) {
    return this.prisma.rentalAgreement.findMany({
      where: { tenantId: userId },
      orderBy: { createdAt: 'desc' },
      include: {
        listing: {
          select: { id: true, slug: true, title: true, area: true, state: true, photos: true },
        },
        payments: {
          select: { id: true, amount: true, dueDate: true, status: true, installmentNo: true },
          orderBy: { installmentNo: 'asc' },
        },
      },
    });
  }

  async signAgreementAsTenant(
    userId: string,
    agreementId: string,
    dto: SignAgreementDto,
    ipAddress?: string,
  ) {
    const agreement = await this.prisma.rentalAgreement.findFirst({
      where: { id: agreementId, tenantId: userId },
      include: {
        listing: { select: { title: true, landlordId: true } },
        application: { select: { id: true } },
      },
    });
    if (!agreement) throw new NotFoundException('Agreement not found');
    if (agreement.status !== 'PENDING_TENANT')
      throw new BadRequestException('Agreement is not awaiting your signature');

    const updated = await this.prisma.rentalAgreement.update({
      where: { id: agreementId },
      data: {
        tenantSignedAt: new Date(),
        tenantSignature: dto.signature,
        tenantIpAddress: ipAddress,
        status: 'PENDING_LANDLORD',
      },
    });

    // Notify landlord to sign
    await this.prisma.notification.create({
      data: {
        userId: agreement.listing.landlordId,
        type: 'GENERAL',
        title: 'Tenant signed the rental agreement',
        body: `The tenant has signed the agreement for "${agreement.listing.title}". Please review and sign.`,
        data: { agreementId },
      },
    });

    return updated;
  }

  // ── Rental Payments ────────────────────────────────────────────────────────

  async getMyRentalPayments(userId: string) {
    return this.prisma.rentalPayment.findMany({
      where: { userId },
      orderBy: [{ applicationId: 'asc' }, { installmentNo: 'asc' }],
      include: {
        listing: {
          select: { id: true, title: true, area: true, state: true, photos: true },
        },
        agreement: {
          select: { id: true, startDate: true, endDate: true },
        },
      },
    });
  }

  async initializeRentalPayment(userId: string, paymentId: string) {
    const payment = await this.prisma.rentalPayment.findFirst({
      where: { id: paymentId, userId },
      include: {
        listing: { select: { title: true } },
      },
    });
    if (!payment) throw new NotFoundException('Payment not found');
    if (payment.status === 'PAID')
      throw new BadRequestException('This payment has already been made');
    if (payment.status === 'WAIVED')
      throw new BadRequestException('This payment has been waived');

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, firstName: true, lastName: true },
    });

    const frontendUrl =
      process.env.FRONTEND_URL?.split(',')[0]?.trim() ?? 'http://localhost:3000';
    const callbackUrl = `${frontendUrl}/rental-payments/payment/callback`;

    const { authorizationUrl, reference } =
      await this.paystack.initializeTransaction(
        user!.email,
        payment.amount,
        {
          rentalPaymentId: payment.id,
          listingId: payment.listingId,
          listingTitle: payment.listing.title,
          userId,
          installmentNo: payment.installmentNo,
          totalInstallments: payment.totalInstallments,
        },
        callbackUrl,
      );

    await this.prisma.rentalPayment.update({
      where: { id: paymentId },
      data: { paystackRef: reference },
    });

    return { paymentUrl: authorizationUrl, reference };
  }

  async verifyRentalPayment(userId: string, reference: string) {
    const payment = await this.prisma.rentalPayment.findFirst({
      where: { userId, paystackRef: reference },
      include: {
        listing: { select: { title: true, area: true, state: true, landlordId: true } },
      },
    });
    if (!payment) throw new NotFoundException('Payment record not found');

    const tx = await this.paystack.verifyTransaction(reference);
    if (tx.status !== 'success')
      throw new BadRequestException('Payment was not completed');

    const updated = await this.prisma.rentalPayment.update({
      where: { id: payment.id },
      data: { status: 'PAID', paidAt: new Date(tx.paidAt ?? Date.now()) },
      include: {
        listing: { select: { title: true, area: true, state: true } },
      },
    });

    // Create escrow if the Paystack webhook hasn't already done so.
    // We catch P2002 (unique constraint) because the webhook may race us to it — that's fine.
    await this.wallet.createEscrowFromCard({
      payerId: userId,
      landlordId: payment.listing.landlordId,
      amountNGN: payment.amount,
      type: 'RENTAL_PAYMENT',
      rentalPaymentId: payment.id,
      paystackRef: reference,
      releaseHoursFromNow: 24,
    }).catch((err) => {
      if (err?.code !== 'P2002') throw err;
      // P2002 = webhook already created the escrow — nothing to do
    });

    return updated;
  }
}
