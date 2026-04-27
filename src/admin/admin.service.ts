import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import slugify from 'slugify';
import { AdminPosition, ListingStatus } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { MailService } from 'src/mail/mail.service';
import { PaystackService } from 'src/paystack/paystack.service';
import { WalletService } from 'src/wallet/wallet.service';
import { EncryptionService } from 'src/encryption/encryption.service';
import { ListingApprovedEmail } from 'emails/listing-approved-email';
import { ListingRejectedEmail } from 'emails/listing-rejected-email';
import { RejectListingDto } from './dto/reject-listing.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { CreateAdminDto } from './dto/create-admin.dto';
import { UpdateAdminDto } from './dto/update-admin.dto';
import { GetListingsQueryDto } from './dto/get-listings-query.dto';
import { GetUsersQueryDto } from './dto/get-users-query.dto';
import { ScheduleTourDto } from './dto/schedule-tour.dto';
import { GenerateAgreementDto } from './dto/generate-agreement.dto';
import { CreateRentalPaymentDto } from './dto/create-rental-payment.dto';

function groupByMonth(records: { createdAt: Date }[]) {
  const counts = new Map<string, number>();
  for (const rec of records) {
    const key = new Date(rec.createdAt).toLocaleDateString('en-US', {
      month: 'short',
      year: 'numeric',
    });
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Array.from(counts.entries()).map(([month, count]) => ({
    month,
    count,
  }));
}

@Injectable()
export class AdminService {
  constructor(
    private prisma: PrismaService,
    private mail: MailService,
    private paystack: PaystackService,
    private wallet: WalletService,
    private encryption: EncryptionService,
  ) {}

  // ── Dashboard Stats ────────────────────────────────────────────────────────

  async getStats() {
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [
      totalListings,
      pendingListings,
      publishedListings,
      rejectedListings,
      archivedListings,
      totalUsers,
      totalLandlords,
      totalClients,
      newListingsToday,
      newUsersToday,
      listingStatusGroups,
      listingTypeGroups,
      recentListings,
      recentUsers,
    ] = await Promise.all([
      this.prisma.listing.count({ where: { isDeleted: false } }),
      this.prisma.listing.count({
        where: { status: ListingStatus.PENDING_REVIEW, isDeleted: false },
      }),
      this.prisma.listing.count({
        where: { status: ListingStatus.PUBLISHED, isDeleted: false },
      }),
      this.prisma.listing.count({
        where: { status: ListingStatus.REJECTED, isDeleted: false },
      }),
      this.prisma.listing.count({
        where: { status: ListingStatus.ARCHIVED, isDeleted: false },
      }),
      this.prisma.user.count({ where: { isDeleted: false, role: { not: 'ADMIN' } } }),
      this.prisma.user.count({ where: { isDeleted: false, role: 'LANDLORD' } }),
      this.prisma.user.count({ where: { isDeleted: false, role: 'CLIENT' } }),
      this.prisma.listing.count({
        where: { isDeleted: false, createdAt: { gte: today } },
      }),
      this.prisma.user.count({
        where: { isDeleted: false, role: { not: 'ADMIN' }, createdAt: { gte: today } },
      }),
      this.prisma.listing.groupBy({
        by: ['status'],
        where: { isDeleted: false },
        _count: { id: true },
      }),
      this.prisma.listing.groupBy({
        by: ['listingType'],
        where: { isDeleted: false },
        _count: { id: true },
      }),
      this.prisma.listing.findMany({
        where: { isDeleted: false, createdAt: { gte: sixMonthsAgo } },
        select: { createdAt: true },
      }),
      this.prisma.user.findMany({
        where: { isDeleted: false, role: { not: 'ADMIN' }, createdAt: { gte: sixMonthsAgo } },
        select: { createdAt: true },
      }),
    ]);

    return {
      overview: {
        totalListings,
        pendingListings,
        publishedListings,
        rejectedListings,
        archivedListings,
        totalUsers,
        totalLandlords,
        totalClients,
        newListingsToday,
        newUsersToday,
      },
      listingsByMonth: groupByMonth(recentListings),
      usersByMonth: groupByMonth(recentUsers),
      listingsByStatus: listingStatusGroups.map((g) => ({
        status: g.status,
        count: g._count.id,
      })),
      listingsByType: listingTypeGroups.map((g) => ({
        type: g.listingType,
        count: g._count.id,
      })),
    };
  }

  // ── Listings ───────────────────────────────────────────────────────────────

  async getAllListings(query: GetListingsQueryDto) {
    const page = parseInt(query.page ?? '1', 10);
    const limit = parseInt(query.limit ?? '20', 10);

    const where: any = {
      isDeleted: false,
      ...(query.status && { status: query.status }),
      ...(query.listingType && { listingType: query.listingType }),
      ...(query.state && { state: query.state }),
      ...(query.search && {
        OR: [
          { title: { contains: query.search, mode: 'insensitive' } },
          { area: { contains: query.search, mode: 'insensitive' } },
          { address: { contains: query.search, mode: 'insensitive' } },
          { lga: { contains: query.search, mode: 'insensitive' } },
        ],
      }),
    };

    const [listings, total] = await Promise.all([
      this.prisma.listing.findMany({
        where,
        include: {
          landlord: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              image: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.listing.count({ where }),
    ]);

    return {
      listings,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    };
  }

  async findListingBySlug(slug: string) {
    const listing = await this.prisma.listing.findFirst({
      where: {
        OR: [{ slug }, { id: slug }],
        isDeleted: false,
      },
      include: {
        landlord: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            image: true,
            phoneNumber: true,
            createdAt: true,
            _count: { select: { listings: true } },
          },
        },
      },
    });
    if (!listing) throw new NotFoundException('Listing not found');
    return listing;
  }

  async approveListing(id: string) {
    const listing = await this.prisma.listing.findUnique({
      where: { id },
      include: { landlord: true },
    });

    if (!listing) throw new NotFoundException('Listing not found');
    if (listing.status !== ListingStatus.PENDING_REVIEW) {
      throw new BadRequestException('Only pending listings can be approved');
    }

    const updated = await this.prisma.listing.update({
      where: { id },
      data: { status: ListingStatus.PUBLISHED, rejectionReason: null },
    });

    await this.mail.sendMail({
      toEmail: listing.landlord.email,
      toName: listing.landlord.firstName ?? '',
      subject: `Your listing "${listing.title}" is now live!`,
      html: ListingApprovedEmail({
        firstName: listing.landlord.firstName ?? '',
        listingTitle: listing.title,
        listingUrl: `${process.env.FRONTEND_URL}/listings/${listing.id}`,
      }),
    });

    return updated;
  }

  async rejectListing(id: string, dto: RejectListingDto) {
    const listing = await this.prisma.listing.findUnique({
      where: { id },
      include: { landlord: true },
    });

    if (!listing) throw new NotFoundException('Listing not found');

    const updated = await this.prisma.listing.update({
      where: { id },
      data: {
        status: ListingStatus.REJECTED,
        rejectionReason: dto.reason,
      },
    });

    await this.mail.sendMail({
      toEmail: listing.landlord.email,
      toName: listing.landlord.firstName ?? '',
      subject: `Action required: Your listing "${listing.title}" needs updates`,
      html: ListingRejectedEmail({
        firstName: listing.landlord.firstName ?? '',
        listingTitle: listing.title,
        reason: dto.reason,
        editUrl: `${process.env.FRONTEND_URL}/landlord/listings/${listing.id}/edit`,
      }),
    });

    return updated;
  }

  // ── Users ──────────────────────────────────────────────────────────────────

  async getAllUsers(query: GetUsersQueryDto) {
    const page = parseInt(query.page ?? '1', 10);
    const limit = parseInt(query.limit ?? '20', 10);

    const where: any = {
      isDeleted: false,
      role: { not: 'ADMIN' },
      ...(query.role && { role: query.role }),
      ...(query.accountStatus && { accountStatus: query.accountStatus }),
      ...(query.search && {
        OR: [
          { firstName: { contains: query.search, mode: 'insensitive' } },
          { lastName: { contains: query.search, mode: 'insensitive' } },
          { email: { contains: query.search, mode: 'insensitive' } },
          { username: { contains: query.search, mode: 'insensitive' } },
        ],
      }),
    };

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          username: true,
          image: true,
          role: true,
          accountStatus: true,
          accountStatusReason: true,
          accountStatusUpdatedAt: true,
          emailVerified: true,
          onboardingCompleted: true,
          createdAt: true,
          _count: { select: { listings: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      users,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    };
  }

  async updateUserStatus(id: string, dto: UpdateUserStatusDto) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    if (user.role === 'ADMIN') {
      throw new ForbiddenException('Cannot modify the status of admin accounts');
    }

    return this.prisma.user.update({
      where: { id },
      data: {
        accountStatus: dto.status as any,
        accountStatusReason: dto.reason ?? null,
        accountStatusUpdatedAt: new Date(),
      },
      select: {
        id: true,
        accountStatus: true,
        accountStatusReason: true,
        accountStatusUpdatedAt: true,
      },
    });
  }

  // ── Admin Team ─────────────────────────────────────────────────────────────

  async getAdminTeam() {
    return this.prisma.admin.findMany({
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            image: true,
            createdAt: true,
            accountStatus: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async createAdminAccount(dto: CreateAdminDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) throw new ConflictException('An account with this email already exists');

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    let base = slugify(`${dto.firstName} ${dto.lastName}`, { lower: true, strict: true });
    let username = base;
    let counter = 1;
    while (await this.prisma.user.findUnique({ where: { username } })) {
      username = `${base}-${counter++}`;
    }

    const user = await this.prisma.user.create({
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        email: dto.email,
        password: hashedPassword,
        username,
        role: 'ADMIN',
        emailVerified: true,
        onboardingCompleted: true,
      },
    });

    const admin = await this.prisma.admin.create({
      data: {
        userId: user.id,
        position: dto.position as AdminPosition,
        modules: dto.modules ?? [],
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            createdAt: true,
          },
        },
      },
    });

    return admin;
  }

  async updateAdmin(id: string, dto: UpdateAdminDto) {
    const admin = await this.prisma.admin.findUnique({ where: { id } });
    if (!admin) throw new NotFoundException('Admin not found');

    return this.prisma.admin.update({
      where: { id },
      data: {
        ...(dto.position && { position: dto.position as AdminPosition }),
        ...(dto.modules !== undefined && { modules: dto.modules }),
      },
      include: {
        user: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });
  }

  async removeAdmin(id: string, requesterId: string) {
    const admin = await this.prisma.admin.findUnique({
      where: { id },
      include: { user: true },
    });
    if (!admin) throw new NotFoundException('Admin not found');
    if (admin.user.id === requesterId) {
      throw new BadRequestException('You cannot remove yourself');
    }
    if (admin.position === 'SUPER_ADMIN') {
      throw new ForbiddenException('Super admin accounts cannot be removed');
    }

    await this.prisma.admin.delete({ where: { id } });
    await this.prisma.user.update({
      where: { id: admin.userId },
      data: { role: 'CLIENT' },
    });

    return { message: 'Admin removed successfully' };
  }

  // ── Bookings (Admin) ───────────────────────────────────────────────────────

  async getBookingStats() {
    const [
      total,
      pending,
      confirmed,
      completed,
      cancelled,
      rejected,
      paidBookings,
    ] = await Promise.all([
      this.prisma.booking.count(),
      this.prisma.booking.count({ where: { status: 'PENDING' } }),
      this.prisma.booking.count({ where: { status: 'CONFIRMED' } }),
      this.prisma.booking.count({ where: { status: 'COMPLETED' } }),
      this.prisma.booking.count({ where: { status: 'CANCELLED' } }),
      this.prisma.booking.count({ where: { status: 'REJECTED' } }),
      this.prisma.booking.findMany({
        where: { paymentStatus: 'PAID' },
        select: { totalPrice: true },
      }),
    ]);

    const grossRevenue = paidBookings.reduce((sum, b) => sum + b.totalPrice, 0);

    return { total, pending, confirmed, completed, cancelled, rejected, grossRevenue };
  }

  async getAllBookings(query: {
    status?: string;
    paymentStatus?: string;
    search?: string;
    page?: number | string;
    limit?: number | string;
  }) {
    const page = Math.max(1, parseInt(String(query.page ?? '1'), 10));
    const limit = Math.min(50, parseInt(String(query.limit ?? '20'), 10));
    const skip = (page - 1) * limit;

    const where: any = {};
    if (query.status) where.status = query.status;
    if (query.paymentStatus) where.paymentStatus = query.paymentStatus;
    if (query.search) {
      where.OR = [
        { user: { firstName: { contains: query.search, mode: 'insensitive' } } },
        { user: { lastName:  { contains: query.search, mode: 'insensitive' } } },
        { user: { email:     { contains: query.search, mode: 'insensitive' } } },
        { listing: { title:  { contains: query.search, mode: 'insensitive' } } },
      ];
    }

    const include = {
      listing: {
        select: {
          id: true,
          slug: true,
          title: true,
          area: true,
          state: true,
          photos: true,
          landlordId: true,
          landlord: {
            select: { firstName: true, lastName: true, email: true, phoneNumber: true },
          },
        },
      },
      user: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          image: true,
          phoneNumber: true,
        },
      },
    };

    const [bookings, total] = await Promise.all([
      this.prisma.booking.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include,
      }),
      this.prisma.booking.count({ where }),
    ]);

    return { bookings, total, page, pages: Math.ceil(total / limit) };
  }

  async getBookingById(bookingId: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
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
            listingType: true,
            pricePerNight: true,
            instantBook: true,
            landlordId: true,
            landlord: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                phoneNumber: true,
                image: true,
              },
            },
          },
        },
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            image: true,
            phoneNumber: true,
            createdAt: true,
          },
        },
      },
    });
    if (!booking) throw new NotFoundException('Booking not found');
    return booking;
  }

  async addAdminNote(bookingId: string, note: string) {
    const booking = await this.prisma.booking.findUnique({ where: { id: bookingId } });
    if (!booking) throw new NotFoundException('Booking not found');

    return this.prisma.booking.update({
      where: { id: bookingId },
      data: { adminNote: note },
    });
  }

  async adminCancelBooking(bookingId: string, reason: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        listing: { select: { landlordId: true, title: true } },
      },
    });
    if (!booking) throw new NotFoundException('Booking not found');
    if (['CANCELLED', 'COMPLETED'].includes(booking.status))
      throw new BadRequestException('Booking is already closed');

    // Refund if paid
    if (booking.paymentStatus === 'PAID' && booking.paymentRef) {
      try {
        const tx = await this.paystack.verifyTransaction(booking.paymentRef);
        await this.paystack.refundTransaction(tx.id);
      } catch {
        // Refund failed — log and continue
      }
    }

    const updated = await this.prisma.booking.update({
      where: { id: bookingId },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancelReason: reason ?? 'Cancelled by admin',
      },
    });

    // Notify guest
    await this.prisma.notification.create({
      data: {
        userId: booking.userId,
        type: 'BOOKING_STATUS',
        title: 'Booking cancelled by admin',
        body: `Your booking for "${booking.listing.title}" has been cancelled by the platform team. A full refund will be processed.`,
        data: { bookingId },
      },
    });

    return updated;
  }

  async adminCompleteBooking(bookingId: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
    });
    if (!booking) throw new NotFoundException('Booking not found');
    if (booking.status !== 'CONFIRMED')
      throw new BadRequestException('Only confirmed bookings can be completed');

    return this.prisma.booking.update({
      where: { id: bookingId },
      data: { status: 'COMPLETED' },
    });
  }

  async adminInitiateRefund(bookingId: string, amountNGN?: number) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
    });
    if (!booking) throw new NotFoundException('Booking not found');
    if (booking.paymentStatus !== 'PAID')
      throw new BadRequestException('Booking is not in a paid state');
    if (!booking.paymentRef)
      throw new BadRequestException('No payment reference found');

    const tx = await this.paystack.verifyTransaction(booking.paymentRef);
    await this.paystack.refundTransaction(tx.id, amountNGN);

    return { message: 'Refund initiated', bookingId, amount: amountNGN ?? booking.totalPrice };
  }

  // ── Tour Requests ──────────────────────────────────────────────────────────

  private readonly TOUR_LISTING_SELECT = {
    id: true, slug: true, title: true, area: true, state: true,
    address: true, photos: true, pricePerYear: true, landlordId: true,
  };

  private readonly TOUR_USER_SELECT = {
    id: true, firstName: true, lastName: true, email: true,
    image: true, phoneNumber: true,
  };

  async getTourRequests(status?: string) {
    return this.prisma.tourRequest.findMany({
      where: status ? { status: status as any } : {},
      orderBy: { createdAt: 'desc' },
      include: {
        listing: { select: this.TOUR_LISTING_SELECT },
        user: { select: this.TOUR_USER_SELECT },
        agent: { select: this.TOUR_USER_SELECT },
      },
    });
  }

  async getTourRequestById(id: string) {
    const tour = await this.prisma.tourRequest.findUnique({
      where: { id },
      include: {
        listing: { select: { ...this.TOUR_LISTING_SELECT, landlord: { select: this.TOUR_USER_SELECT } } },
        user: { select: this.TOUR_USER_SELECT },
        agent: { select: this.TOUR_USER_SELECT },
        application: {
          select: { id: true, status: true, screeningSubmittedAt: true, nin: true, ninVerified: true },
        },
      },
    });
    if (!tour) throw new NotFoundException('Tour request not found');
    return tour;
  }

  async scheduleTour(id: string, dto: ScheduleTourDto) {
    const tour = await this.prisma.tourRequest.findUnique({ where: { id } });
    if (!tour) throw new NotFoundException('Tour request not found');
    if (!['PENDING', 'SCHEDULED'].includes(tour.status))
      throw new BadRequestException('Tour cannot be scheduled in its current state');

    const updated = await this.prisma.tourRequest.update({
      where: { id },
      data: {
        status: 'SCHEDULED',
        scheduledAt: new Date(dto.scheduledAt),
        agentId: dto.agentId ?? undefined,
        adminNotes: dto.adminNotes ?? undefined,
      },
    });

    // Notify renter
    await this.prisma.notification.create({
      data: {
        userId: tour.userId,
        type: 'GENERAL',
        title: 'Tour scheduled!',
        body: `Your property tour has been scheduled for ${new Date(dto.scheduledAt).toLocaleDateString('en-NG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}.`,
        data: { tourRequestId: id },
      },
    });

    return updated;
  }

  async completeTour(id: string) {
    const tour = await this.prisma.tourRequest.findUnique({ where: { id } });
    if (!tour) throw new NotFoundException('Tour request not found');
    if (tour.status !== 'SCHEDULED')
      throw new BadRequestException('Only scheduled tours can be marked as completed');

    const updated = await this.prisma.tourRequest.update({
      where: { id },
      data: { status: 'COMPLETED', completedAt: new Date() },
    });

    // Notify renter
    await this.prisma.notification.create({
      data: {
        userId: tour.userId,
        type: 'GENERAL',
        title: 'Tour completed',
        body: 'Your property tour has been marked as completed. You can now proceed with a full application if interested.',
        data: { tourRequestId: id },
      },
    });

    return updated;
  }

  async cancelTour(id: string, reason?: string) {
    const tour = await this.prisma.tourRequest.findUnique({ where: { id } });
    if (!tour) throw new NotFoundException('Tour request not found');
    if (tour.status === 'CANCELLED')
      throw new BadRequestException('Tour is already cancelled');

    const updated = await this.prisma.tourRequest.update({
      where: { id },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancelReason: reason ?? 'Cancelled by admin',
      },
    });

    await this.prisma.notification.create({
      data: {
        userId: tour.userId,
        type: 'GENERAL',
        title: 'Tour cancelled',
        body: `Your property tour has been cancelled.${reason ? ` Reason: ${reason}` : ''} Please contact us if you need to reschedule.`,
        data: { tourRequestId: id },
      },
    });

    return updated;
  }

  // ── Screening Applications ─────────────────────────────────────────────────

  async getScreeningApplications(status?: string) {
    return this.prisma.application.findMany({
      where: {
        screeningSubmittedAt: { not: null },
        ...(status ? { status: status as any } : {}),
      },
      orderBy: { screeningSubmittedAt: 'desc' },
      include: {
        listing: {
          select: {
            id: true, title: true, area: true, state: true,
            photos: true, pricePerYear: true, landlordId: true,
          },
        },
        user: { select: this.TOUR_USER_SELECT },
        tourRequest: { select: { id: true, status: true, completedAt: true } },
      },
    });
  }

  async getScreeningApplicationById(id: string) {
    const app = await this.prisma.application.findUnique({
      where: { id },
      include: {
        listing: {
          select: {
            id: true, slug: true, title: true, area: true, state: true, address: true,
            photos: true, pricePerYear: true, paymentFrequency: true,
            cautionFee: true, serviceCharge: true, landlordId: true,
            landlord: { select: { firstName: true, lastName: true, email: true, phoneNumber: true } },
          },
        },
        user: { select: { ...this.TOUR_USER_SELECT, nin: true, ninVerified: true } },
        tourRequest: { select: { id: true, status: true, scheduledAt: true, completedAt: true } },
        agreement: true,
        payments: { orderBy: { installmentNo: 'asc' } },
      },
    });
    if (!app) throw new NotFoundException('Application not found');
    return app;
  }

  async adminReviewApplication(
    id: string,
    status: 'APPROVED' | 'REJECTED',
    note?: string,
  ) {
    const app = await this.prisma.application.findUnique({
      where: { id },
      include: { listing: { select: { title: true } } },
    });
    if (!app) throw new NotFoundException('Application not found');

    const updated = await this.prisma.application.update({
      where: { id },
      data: {
        adminStatus: status,
        adminNote: note ?? undefined,
        adminReviewedAt: new Date(),
        // If admin approves and landlord also approved, set overall status to APPROVED
        ...(status === 'APPROVED' && app.status === 'APPROVED'
          ? {}
          : status === 'APPROVED'
            ? { status: 'UNDER_REVIEW' }
            : { status: 'REJECTED' }),
      },
    });

    // Notify applicant if rejected
    if (status === 'REJECTED') {
      await this.prisma.notification.create({
        data: {
          userId: app.userId,
          type: 'APPLICATION_STATUS',
          title: 'Application update',
          body: `Your application for "${app.listing.title}" was not successful.${note ? ` Note: ${note}` : ''}`,
          data: { applicationId: id },
        },
      });
    }

    return updated;
  }

  async verifyApplicantNin(applicationId: string) {
    const app = await this.prisma.application.findUnique({
      where: { id: applicationId },
      select: { id: true, nin: true, userId: true },
    });
    if (!app) throw new NotFoundException('Application not found');
    if (!app.nin) throw new BadRequestException('No NIN provided in this application');

    const plainNin = this.encryption.isEncrypted(app.nin)
      ? this.encryption.decrypt(app.nin)
      : app.nin;

    const apiKey = process.env.PREMBLY_API_KEY;
    if (!apiKey) throw new InternalServerErrorException('NIN verification not configured');

    let res: Response;
    try {
      res = await fetch('https://api.prembly.com/identitypass/verification/nin', {
        method: 'POST',
        headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ number_nin: plainNin }),
      });
    } catch {
      throw new InternalServerErrorException('Could not reach NIN verification service');
    }

    const data = (await res.json()) as {
      status: boolean; response_code?: string; detail?: string; error?: string; message?: string;
    };

    const verified = data.status === true && data.response_code === '00';

    if (verified) {
      await this.prisma.application.update({
        where: { id: applicationId },
        data: { ninVerified: true, ninVerifiedAt: new Date() },
      });
    }

    return {
      verified,
      message: verified
        ? 'NIN verified successfully'
        : (data.detail ?? data.error ?? data.message ?? 'NIN could not be verified'),
    };
  }

  // ── Rental Agreements ──────────────────────────────────────────────────────

  async generateAgreement(dto: GenerateAgreementDto) {
    const app = await this.prisma.application.findUnique({
      where: { id: dto.applicationId },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true, phoneNumber: true, address: true } },
        listing: {
          select: {
            id: true, title: true, address: true, area: true, state: true,
            landlordId: true,
            landlord: { select: { firstName: true, lastName: true, email: true, phoneNumber: true } },
          },
        },
      },
    });
    if (!app) throw new NotFoundException('Application not found');
    if (app.status === 'REJECTED') throw new BadRequestException('Cannot generate agreement for a rejected application');

    const existing = await this.prisma.rentalAgreement.findUnique({
      where: { applicationId: dto.applicationId },
    });
    if (existing) throw new ConflictException('Agreement already exists for this application');

    const startDate = new Date(dto.startDate);
    const endDate = new Date(dto.endDate);
    const tenant = app.user;
    const listing = app.listing;
    const landlord = listing.landlord;

    const fmt = (n: number) =>
      new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(n);

    const content = `
      <div style="font-family:Georgia,serif;max-width:700px;margin:0 auto;color:#111;line-height:1.8">
        <h1 style="text-align:center;font-size:22px;margin-bottom:4px">RESIDENTIAL TENANCY AGREEMENT</h1>
        <p style="text-align:center;color:#666;margin-top:0">Facilitated by Leadsage Africa</p>
        <hr/>
        <h2 style="font-size:16px">PARTIES</h2>
        <p><strong>Landlord:</strong> ${landlord.firstName} ${landlord.lastName}<br/>
        Email: ${landlord.email} &nbsp;|&nbsp; Phone: ${landlord.phoneNumber ?? 'N/A'}</p>
        <p><strong>Tenant:</strong> ${tenant.firstName} ${tenant.lastName}<br/>
        Email: ${tenant.email} &nbsp;|&nbsp; Phone: ${tenant.phoneNumber ?? 'N/A'}</p>
        <hr/>
        <h2 style="font-size:16px">PROPERTY</h2>
        <p>${listing.title}<br/>${listing.address}, ${listing.area}, ${listing.state}</p>
        <hr/>
        <h2 style="font-size:16px">TERMS</h2>
        <table style="width:100%;border-collapse:collapse">
          <tr><td style="padding:6px 0;color:#555;width:220px">Tenancy start date</td><td style="padding:6px 0;font-weight:600">${startDate.toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' })}</td></tr>
          <tr><td style="padding:6px 0;color:#555">Tenancy end date</td><td style="padding:6px 0;font-weight:600">${endDate.toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' })}</td></tr>
          <tr><td style="padding:6px 0;color:#555">Monthly rent</td><td style="padding:6px 0;font-weight:600">${fmt(dto.monthlyRent)}</td></tr>
          ${dto.cautionFee ? `<tr><td style="padding:6px 0;color:#555">Caution / security deposit</td><td style="padding:6px 0;font-weight:600">${fmt(dto.cautionFee)}</td></tr>` : ''}
          ${dto.serviceCharge ? `<tr><td style="padding:6px 0;color:#555">Annual service charge</td><td style="padding:6px 0;font-weight:600">${fmt(dto.serviceCharge)}</td></tr>` : ''}
        </table>
        <hr/>
        <h2 style="font-size:16px">OBLIGATIONS</h2>
        <p><strong>Tenant agrees to:</strong></p>
        <ol>
          <li>Pay rent on the agreed dates without demand.</li>
          <li>Keep the property in good and clean condition.</li>
          <li>Not sublet or assign the property without written landlord consent.</li>
          <li>Not make structural alterations without written consent.</li>
          <li>Allow the landlord reasonable access for inspection with 24-hour notice.</li>
          <li>Vacate the property at the end of the tenancy period unless renewed.</li>
        </ol>
        <p><strong>Landlord agrees to:</strong></p>
        <ol>
          <li>Provide the property in a habitable condition.</li>
          <li>Carry out major repairs within a reasonable time.</li>
          <li>Return the caution deposit within 30 days of tenancy end, less any deductions for damage.</li>
        </ol>
        <hr/>
        <h2 style="font-size:16px">SIGNATURES</h2>
        <p>By signing below, both parties agree to the terms of this agreement.</p>
        <table style="width:100%">
          <tr>
            <td style="width:50%;padding:12px 0;border-top:1px solid #ccc">
              <strong>Tenant signature</strong><br/>
              ${tenant.firstName} ${tenant.lastName}
            </td>
            <td style="width:50%;padding:12px 0;border-top:1px solid #ccc">
              <strong>Landlord signature</strong><br/>
              ${landlord.firstName} ${landlord.lastName}
            </td>
          </tr>
        </table>
        <p style="font-size:12px;color:#888;margin-top:24px">
          This agreement was facilitated by Leadsage Africa and is legally binding upon signature by both parties.
          Date generated: ${new Date().toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' })}.
        </p>
      </div>
    `;

    const agreement = await this.prisma.rentalAgreement.create({
      data: {
        applicationId: dto.applicationId,
        listingId: listing.id,
        tenantId: tenant.id,
        landlordId: listing.landlordId,
        content,
        startDate,
        endDate,
        monthlyRent: dto.monthlyRent,
        cautionFee: dto.cautionFee ?? null,
        serviceCharge: dto.serviceCharge ?? null,
        status: 'PENDING_TENANT',
      },
    });

    // Mark application as APPROVED (both admin & landlord review done — admin generates agreement)
    await this.prisma.application.update({
      where: { id: dto.applicationId },
      data: { status: 'APPROVED', adminStatus: 'APPROVED', adminReviewedAt: new Date() },
    });

    // Notify tenant
    await this.prisma.notification.create({
      data: {
        userId: tenant.id,
        type: 'APPLICATION_STATUS',
        title: 'Your rental agreement is ready to sign!',
        body: `Your application for "${listing.title}" has been approved. Please review and sign your tenancy agreement.`,
        data: { agreementId: agreement.id, applicationId: dto.applicationId },
      },
    });

    return agreement;
  }

  async getAgreements(status?: string) {
    return this.prisma.rentalAgreement.findMany({
      where: status ? { status: status as any } : {},
      orderBy: { createdAt: 'desc' },
      include: {
        listing: { select: { id: true, title: true, area: true, state: true, photos: true } },
        application: {
          select: {
            id: true,
            user: { select: { firstName: true, lastName: true, email: true } },
          },
        },
        payments: { select: { id: true, amount: true, status: true, dueDate: true } },
      },
    });
  }

  async getAgreementById(id: string) {
    const agreement = await this.prisma.rentalAgreement.findUnique({
      where: { id },
      include: {
        listing: {
          select: {
            id: true, title: true, area: true, state: true, address: true, photos: true,
            landlord: { select: { firstName: true, lastName: true, email: true } },
          },
        },
        application: {
          select: {
            id: true, status: true,
            user: { select: { firstName: true, lastName: true, email: true, phoneNumber: true } },
          },
        },
        payments: { orderBy: { installmentNo: 'asc' } },
      },
    });
    if (!agreement) throw new NotFoundException('Agreement not found');
    return agreement;
  }

  // ── Rental Payments ────────────────────────────────────────────────────────

  async createRentalPayments(dto: CreateRentalPaymentDto) {
    const app = await this.prisma.application.findUnique({
      where: { id: dto.applicationId },
      select: { id: true, userId: true, listingId: true },
    });
    if (!app) throw new NotFoundException('Application not found');

    const existing = await this.prisma.rentalPayment.findFirst({
      where: { applicationId: dto.applicationId },
    });
    if (existing) throw new ConflictException('Payment schedule already exists for this application');

    if (dto.installments && dto.installments.length > 0) {
      const total = dto.installments.length;
      const payments = await this.prisma.$transaction(
        dto.installments.map((inst, i) =>
          this.prisma.rentalPayment.create({
            data: {
              applicationId: dto.applicationId,
              agreementId: dto.agreementId ?? null,
              userId: app.userId,
              listingId: app.listingId,
              amount: inst.amount,
              dueDate: new Date(inst.dueDate),
              installmentNo: i + 1,
              totalInstallments: total,
            },
          }),
        ),
      );

      await this.prisma.notification.create({
        data: {
          userId: app.userId,
          type: 'GENERAL',
          title: 'Payment schedule created',
          body: `A ${total}-installment payment schedule has been set up for your rental. Check your payments page.`,
          data: { applicationId: dto.applicationId },
        },
      });

      return payments;
    }

    if (!dto.amount || !dto.dueDate)
      throw new BadRequestException('Provide either installments[] or amount + dueDate');

    const payment = await this.prisma.rentalPayment.create({
      data: {
        applicationId: dto.applicationId,
        agreementId: dto.agreementId ?? null,
        userId: app.userId,
        listingId: app.listingId,
        amount: dto.amount,
        dueDate: new Date(dto.dueDate),
      },
    });

    await this.prisma.notification.create({
      data: {
        userId: app.userId,
        type: 'GENERAL',
        title: 'Payment created',
        body: `A payment of ${new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(dto.amount)} is due on ${new Date(dto.dueDate).toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' })}.`,
        data: { applicationId: dto.applicationId },
      },
    });

    return [payment];
  }

  async markRentalPaymentPaid(paymentId: string) {
    const payment = await this.prisma.rentalPayment.findUnique({ where: { id: paymentId } });
    if (!payment) throw new NotFoundException('Payment not found');
    if (payment.status === 'PAID') throw new BadRequestException('Payment is already marked as paid');

    const updated = await this.prisma.rentalPayment.update({
      where: { id: paymentId },
      data: { status: 'PAID', paidAt: new Date() },
    });

    await this.prisma.notification.create({
      data: {
        userId: payment.userId,
        type: 'GENERAL',
        title: 'Payment confirmed',
        body: `Your payment of ${new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(payment.amount)} has been confirmed.`,
        data: { paymentId },
      },
    });

    return updated;
  }

  async markRentalPaymentOverdue(paymentId: string) {
    const payment = await this.prisma.rentalPayment.findUnique({ where: { id: paymentId } });
    if (!payment) throw new NotFoundException('Payment not found');

    return this.prisma.rentalPayment.update({
      where: { id: paymentId },
      data: { status: 'OVERDUE' },
    });
  }

  // ── Savings ────────────────────────────────────────────────────────────────

  async getSavingsStats() {
    const [total, active, matured, broken, totals] = await Promise.all([
      this.prisma.firstKeySavings.count(),
      this.prisma.firstKeySavings.count({ where: { status: 'ACTIVE' } }),
      this.prisma.firstKeySavings.count({ where: { status: 'MATURED' } }),
      this.prisma.firstKeySavings.count({ where: { status: { in: ['BROKEN', 'WITHDRAWN'] } } }),
      this.prisma.firstKeySavings.aggregate({
        _sum: { totalDeposited: true, interestEarned: true },
      }),
    ]);

    return {
      totalPlans: total,
      activePlans: active,
      maturedPlans: matured,
      closedPlans: broken,
      totalDeposited: totals._sum.totalDeposited ?? 0,
      totalInterest: totals._sum.interestEarned ?? 0,
    };
  }

  async getAllSavingsPlans(query: {
    status?: string;
    page: number;
    limit: number;
    search?: string;
  }) {
    const { status, page, limit, search } = query;
    const skip = (page - 1) * limit;

    const where: any = {
      ...(status ? { status } : {}),
      ...(search
        ? {
            OR: [
              { planName: { contains: search, mode: 'insensitive' } },
              { user: { firstName: { contains: search, mode: 'insensitive' } } },
              { user: { lastName: { contains: search, mode: 'insensitive' } } },
              { user: { email: { contains: search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const [plans, total] = await Promise.all([
      this.prisma.firstKeySavings.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          user: {
            select: { id: true, firstName: true, lastName: true, email: true, image: true },
          },
        },
      }),
      this.prisma.firstKeySavings.count({ where }),
    ]);

    return {
      plans: plans.map((p) => ({
        ...p,
        balance: p.totalDeposited + p.interestEarned,
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getSavingsPlanById(id: string) {
    const plan = await this.prisma.firstKeySavings.findUnique({
      where: { id },
      include: {
        user: {
          select: { id: true, firstName: true, lastName: true, email: true, image: true, phoneNumber: true },
        },
        transactions: {
          orderBy: { createdAt: 'desc' },
          take: 50,
        },
      },
    });

    if (!plan) throw new NotFoundException('Savings plan not found');

    return {
      ...plan,
      balance: plan.totalDeposited + plan.interestEarned,
    };
  }

  // ── Escrow utilities ────────────────────────────────────────────────────────

  async releaseOverdueEscrows() {
    const COMMISSION_RATE = 0.05;
    const RENTAL_HOLD_HOURS = 24;
    const SHORTLET_HOLD_HOURS = 24;

    let backfilled = 0;

    // 1a. Backfill real escrow records for PAID rentals without an escrow
    const rentalsWithoutEscrow = await this.prisma.rentalPayment.findMany({
      where: { status: 'PAID', escrow: null },
      include: { listing: { select: { landlordId: true } } },
    });

    for (const p of rentalsWithoutEscrow) {
      const commission = Math.round(p.amount * COMMISSION_RATE * 100) / 100;
      const paidAt = p.paidAt ?? p.createdAt;
      const releaseAt = new Date(paidAt.getTime() + RENTAL_HOLD_HOURS * 3_600_000);
      await this.prisma.paymentEscrow.create({
        data: {
          payerId: p.userId,
          landlordId: p.listing.landlordId,
          amount: p.amount,
          commission,
          netAmount: p.amount - commission,
          type: 'RENTAL_PAYMENT',
          rentalPaymentId: p.id,
          paystackRef: p.paystackRef ?? undefined,
          releaseAt,
          fundedByCard: true,
          status: 'HOLDING',
        },
      });
      backfilled++;
    }

    // 1b. Backfill real escrow records for PAID shortlet bookings without an escrow
    const bookingsWithoutEscrow = await this.prisma.booking.findMany({
      where: { paymentStatus: 'PAID', escrow: null },
      include: { listing: { select: { landlordId: true } } },
    });

    for (const b of bookingsWithoutEscrow) {
      const commission = Math.round(b.totalPrice * COMMISSION_RATE * 100) / 100;
      const paidAt = b.paidAt ?? b.createdAt;
      // Mirror the same release formula used in getPendingEscrows
      const hoursUntilCheckin = Math.ceil(
        (new Date(b.checkIn).getTime() - Date.now()) / 3_600_000,
      );
      const holdHours = Math.max(SHORTLET_HOLD_HOURS, hoursUntilCheckin + SHORTLET_HOLD_HOURS);
      const releaseAt = new Date(paidAt.getTime() + holdHours * 3_600_000);
      await this.prisma.paymentEscrow.create({
        data: {
          payerId: b.userId,
          landlordId: b.listing.landlordId,
          amount: b.totalPrice,
          commission,
          netAmount: b.totalPrice - commission,
          type: 'SHORTLET_BOOKING',
          bookingId: b.id,
          paystackRef: b.paymentRef ?? undefined,
          releaseAt,
          fundedByCard: true,
          status: 'HOLDING',
        },
      });
      backfilled++;
    }

    // 2. Release all overdue HOLDING escrows (includes the ones just backfilled)
    const due = await this.prisma.paymentEscrow.findMany({
      where: { status: 'HOLDING', releaseAt: { lte: new Date() } },
      select: { id: true, landlordId: true, netAmount: true },
    });

    let released = 0;
    for (const escrow of due) {
      await this.wallet.releaseEscrow(escrow.id);
      await this.prisma.notification.create({
        data: {
          userId: escrow.landlordId,
          type: 'GENERAL',
          title: 'Payment credited to your wallet',
          body: `₦${escrow.netAmount.toLocaleString()} has been released to your Leadsage wallet.`,
          data: { escrowId: escrow.id },
        },
      });
      released++;
    }

    return { backfilled, released };
  }

  // ── Ledger ─────────────────────────────────────────────────────────────────

  async getLedgerEntries(query: {
    userId?: string;
    search?: string;
    accountType?: string;
    eventType?: string;
    entryType?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: number;
    limit?: number;
  }) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 50, 100);
    const skip = (page - 1) * limit;

    // Build user filter when searching by name/email
    let userIds: string[] | undefined;
    if (query.search && !query.userId) {
      const matchedUsers = await this.prisma.user.findMany({
        where: {
          OR: [
            { firstName: { contains: query.search, mode: 'insensitive' } },
            { lastName: { contains: query.search, mode: 'insensitive' } },
            { email: { contains: query.search, mode: 'insensitive' } },
          ],
        },
        select: { id: true },
      });
      userIds = matchedUsers.map((u) => u.id);
      if (userIds.length === 0) return { entries: [], total: 0, page, limit, stats: null };
    }

    const where: any = {
      ...(query.userId ? { userId: query.userId } : {}),
      ...(userIds ? { userId: { in: userIds } } : {}),
      ...(query.accountType ? { accountType: query.accountType } : {}),
      ...(query.eventType ? { eventType: query.eventType } : {}),
      ...(query.entryType ? { entryType: query.entryType } : {}),
      ...(query.dateFrom || query.dateTo
        ? {
            createdAt: {
              ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
              // Extend dateTo to end-of-day so the full selected day is included
              ...(query.dateTo
                ? { lte: new Date(new Date(query.dateTo).setHours(23, 59, 59, 999)) }
                : {}),
            },
          }
        : {}),
    };

    const [entries, total] = await Promise.all([
      this.prisma.ledgerEntry.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip,
        include: {
          user: { select: { id: true, firstName: true, lastName: true, email: true, image: true } },
        },
      }),
      this.prisma.ledgerEntry.count({ where }),
    ]);

    return { entries, total, page, limit };
  }

  async getLedgerStats() {
    const [totalEntries, unreconciledCount, accountSummary] = await Promise.all([
      this.prisma.ledgerEntry.count(),
      this.prisma.ledgerEntry.count({ where: { reconciled: false } }),
      this.prisma.ledgerEntry.groupBy({
        by: ['accountType', 'entryType'],
        _sum: { amount: true },
        _count: { id: true },
      }),
    ]);

    // Shape into { WALLET: { credits, debits }, FIRSTKEY_SAVINGS: {...}, ... }
    const summary: Record<string, { credits: number; debits: number; count: number }> = {};
    for (const row of accountSummary) {
      if (!summary[row.accountType]) summary[row.accountType] = { credits: 0, debits: 0, count: 0 };
      const amount = Number(row._sum.amount ?? 0);
      summary[row.accountType].count += row._count.id;
      if (row.entryType === 'CREDIT') summary[row.accountType].credits += amount;
      else summary[row.accountType].debits += amount;
    }

    return { totalEntries, unreconciledCount, summary };
  }

  async exportLedgerCsv(query: {
    userId?: string;
    accountType?: string;
    eventType?: string;
    entryType?: string;
    dateFrom?: string;
    dateTo?: string;
  }): Promise<string> {
    const where: any = {
      ...(query.userId ? { userId: query.userId } : {}),
      ...(query.accountType ? { accountType: query.accountType } : {}),
      ...(query.eventType ? { eventType: query.eventType } : {}),
      ...(query.entryType ? { entryType: query.entryType } : {}),
      ...(query.dateFrom || query.dateTo
        ? {
            createdAt: {
              ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
              ...(query.dateTo
                ? { lte: new Date(new Date(query.dateTo).setHours(23, 59, 59, 999)) }
                : {}),
            },
          }
        : {}),
    };

    const entries = await this.prisma.ledgerEntry.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 10000,
      include: {
        user: { select: { firstName: true, lastName: true, email: true } },
      },
    });

    const headers = [
      'Date', 'User', 'Email', 'Account', 'Entry Type', 'Event',
      'Description', 'Amount (NGN)', 'Balance After (NGN)', 'Reference', 'Group Ref',
      'Paystack Ref', 'Anchor Event ID',
    ];

    const rows = entries.map((e) => [
      new Date(e.createdAt).toISOString(),
      `${e.user?.firstName ?? ''} ${e.user?.lastName ?? ''}`.trim(),
      e.user?.email ?? '',
      e.accountType,
      e.entryType,
      e.eventType,
      `"${(e.description ?? '').replace(/"/g, '""')}"`,
      Number(e.amount).toFixed(2),
      Number(e.balanceAfter).toFixed(2),
      e.reference,
      e.groupRef ?? '',
      e.paystackRef ?? '',
      e.anchorEventId ?? '',
    ]);

    return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  }
}
