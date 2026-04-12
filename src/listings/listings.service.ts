import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import {
  FurnishedStatus,
  ListingStatus,
  ListingType,
  PaymentFrequency,
  PropertyCategory,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import slugify from 'slugify';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateListingDto } from './dto/create-listing.dto';

/** Convert kebab-case frontend enum value → SCREAMING_SNAKE_CASE Prisma enum */
function toEnum<T extends string>(value: string): T {
  return value.toUpperCase().replace(/-/g, '_') as T;
}

/** Generate a URL-friendly slug from a listing title with a short random suffix */
function generateSlug(title: string): string {
  const base = slugify(title, { lower: true, strict: true });
  const suffix = randomUUID().slice(0, 6);
  return `${base}-${suffix}`;
}

@Injectable()
export class ListingsService {
  private s3: S3Client;
  private bucket = process.env.CLOUDFLARE_BUCKET_NAME;
  private publicUrl = process.env.CLOUDFLARE_PUBLIC_URL;

  constructor(private prisma: PrismaService) {
    this.s3 = new S3Client({
      region: 'auto',
      endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.CLOUDFLARE_ACCESS_KEY_ID!,
        secretAccessKey: process.env.CLOUDFLARE_SECRET_ACCESS_KEY!,
      },
    });
  }

  private async uploadPhotos(
    landlordId: string,
    files: Express.Multer.File[],
  ): Promise<string[]> {
    const uploads = files.map(async (file) => {
      const key = `listings/${landlordId}/${randomUUID()}-${file.originalname}`;
      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: file.buffer,
          ContentType: file.mimetype,
        }),
      );
      return `${this.publicUrl}/${key}`;
    });
    return Promise.all(uploads);
  }

  async create(
    landlordId: string,
    dto: CreateListingDto,
    photoFiles: Express.Multer.File[],
  ) {
    try {
      const photoUrls =
        photoFiles.length > 0
          ? await this.uploadPhotos(landlordId, photoFiles)
          : [];

      return await this.prisma.listing.create({
        data: {
          landlordId,
          slug: generateSlug(dto.title),
          listingType: toEnum<ListingType>(dto.listingType),
          title: dto.title,
          summary: dto.summary ?? null,
          description: dto.description,
          state: dto.state,
          lga: dto.lga,
          area: dto.area,
          address: dto.address,
          propertyCategory: toEnum<PropertyCategory>(dto.propertyCategory),
          bedrooms: dto.bedrooms,
          bathrooms: dto.bathrooms,
          toilets: dto.toilets,
          sizeInSqm: dto.sizeInSqm ?? null,
          furnished: toEnum<FurnishedStatus>(dto.furnished),
          pricePerYear: dto.pricePerYear ?? null,
          paymentFrequency: dto.paymentFrequency
            ? toEnum<PaymentFrequency>(dto.paymentFrequency)
            : null,
          cautionFee: dto.cautionFee ?? null,
          serviceCharge: dto.serviceCharge ?? null,
          pricePerNight: dto.pricePerNight ?? null,
          minimumNights: dto.minimumNights ?? null,
          amenities: dto.amenities,
          petFriendly: dto.petFriendly,
          smokingAllowed: dto.smokingAllowed,
          availableFrom: new Date(dto.availableFrom),
          photos: photoUrls,
          instantBook: dto.instantBook ?? false,
          status: ListingStatus.PENDING_REVIEW,
        },
      });
    } catch (err) {
      console.error('Create listing failed:', err);
      throw new InternalServerErrorException('Failed to create listing');
    }
  }

  // ── Public browsing ────────────────────────────────────────────────────────

  async findPublished(query: {
    page?: string
    limit?: string
    search?: string
    listingType?: string
    state?: string
    area?: string
    minPrice?: string
    maxPrice?: string
    bedrooms?: string
    furnished?: string
  }) {
    const page = Math.max(1, parseInt(query.page ?? '1', 10));
    const limit = Math.min(24, parseInt(query.limit ?? '12', 10));

    const where: any = {
      status: 'PUBLISHED',
      isDeleted: false,
      ...(query.listingType && { listingType: query.listingType }),
      ...(query.state && { state: query.state }),
      ...(query.area && { area: { contains: query.area, mode: 'insensitive' } }),
      ...(query.bedrooms && { bedrooms: { gte: parseInt(query.bedrooms, 10) } }),
      ...(query.furnished && { furnished: query.furnished }),
      ...(query.search && {
        OR: [
          { title: { contains: query.search, mode: 'insensitive' } },
          { area: { contains: query.search, mode: 'insensitive' } },
          { lga: { contains: query.search, mode: 'insensitive' } },
          { state: { contains: query.search, mode: 'insensitive' } },
          { address: { contains: query.search, mode: 'insensitive' } },
        ],
      }),
    };

    // Price filter — applies to whichever price field is non-null
    if (query.minPrice || query.maxPrice) {
      const minP = query.minPrice ? parseFloat(query.minPrice) : undefined;
      const maxP = query.maxPrice ? parseFloat(query.maxPrice) : undefined;
      const priceFilter: any = {};
      if (minP !== undefined) priceFilter.gte = minP;
      if (maxP !== undefined) priceFilter.lte = maxP;

      where.OR = [
        ...(where.OR ?? []),
        { pricePerYear: priceFilter },
        { pricePerNight: priceFilter },
      ];
    }

    const [listings, total] = await Promise.all([
      this.prisma.listing.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
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
          furnished: true,
          pricePerYear: true,
          pricePerNight: true,
          photos: true,
          instantBook: true,
          availableFrom: true,
          createdAt: true,
        },
      }),
      this.prisma.listing.count({ where }),
    ]);

    return { listings, total, page, pages: Math.ceil(total / limit) };
  }

  async findPublishedBySlug(slug: string) {
    const listing = await this.prisma.listing.findFirst({
      where: {
        OR: [{ slug }, { id: slug }],
        status: { in: ['PUBLISHED', 'OCCUPIED'] },
        isDeleted: false,
      },
      include: {
        landlord: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            image: true,
            createdAt: true,
            _count: { select: { listings: { where: { status: 'PUBLISHED', isDeleted: false } } } },
          },
        },
      },
    });
    if (!listing) throw new NotFoundException('Listing not found');

    // Increment views
    await this.prisma.listing.update({
      where: { id: listing.id },
      data: { views: { increment: 1 } },
    });

    return listing;
  }

  /** Returns booked date ranges for a listing (PENDING + CONFIRMED only) */
  async getBookedDates(listingId: string) {
    const bookings = await this.prisma.booking.findMany({
      where: {
        listingId,
        status: { in: ['PENDING', 'CONFIRMED'] },
      },
      select: { checkIn: true, checkOut: true },
    });
    return bookings.map((b) => ({
      from: b.checkIn.toISOString().split('T')[0],
      to: b.checkOut.toISOString().split('T')[0],
    }));
  }

  async findSimilar(listingId: string, listingType: string, state: string) {
    return this.prisma.listing.findMany({
      where: {
        status: 'PUBLISHED',
        isDeleted: false,
        listingType: listingType as any,
        state,
        id: { not: listingId },
      },
      orderBy: { createdAt: 'desc' },
      take: 4,
      select: {
        id: true,
        slug: true,
        title: true,
        listingType: true,
        state: true,
        area: true,
        bedrooms: true,
        bathrooms: true,
        pricePerYear: true,
        pricePerNight: true,
        photos: true,
      },
    });
  }

  async findAllByLandlord(landlordId: string) {
    return this.prisma.listing.findMany({
      where: { landlordId, isDeleted: false },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, landlordId: string) {
    const listing = await this.prisma.listing.findFirst({
      where: { id, landlordId, isDeleted: false },
    });
    if (!listing) throw new NotFoundException('Listing not found');
    return listing;
  }

  async softDelete(id: string, landlordId: string) {
    const listing = await this.prisma.listing.findFirst({
      where: { id, landlordId, isDeleted: false },
    });
    if (!listing) throw new NotFoundException('Listing not found');

    return this.prisma.listing.update({
      where: { id },
      data: { isDeleted: true },
    });
  }
}
