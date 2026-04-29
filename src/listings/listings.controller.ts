import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { FilesInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { CurrentUser } from 'src/decorators/current-user.decorator';
import { Public } from 'src/decorators/public.decorator';
import { CreateListingDto } from './dto/create-listing.dto';
import { UpdateListingDto } from './dto/update-listing.dto';
import { ListingsService } from './listings.service';

@ApiTags('listings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('listings')
export class ListingsController {
  constructor(private readonly listingsService: ListingsService) {}

  // ── Public ─────────────────────────────────────────────────────────────────

  @ApiOperation({ summary: 'Get published listings (public)' })
  @Public()
  @Get('public')
  findPublished(@Query() query: Record<string, string>) {
    return this.listingsService.findPublished(query);
  }

  @ApiOperation({ summary: 'Get a published listing by slug (public)' })
  @Public()
  @Get('public/:slug')
  findPublishedBySlug(@Param('slug') slug: string) {
    return this.listingsService.findPublishedBySlug(slug);
  }

  @ApiOperation({ summary: 'Get booked dates for a listing (public)' })
  @Public()
  @Get('public/:id/booked-dates')
  getBookedDates(@Param('id') id: string) {
    return this.listingsService.getBookedDates(id);
  }

  @ApiOperation({ summary: 'Get similar listings (public)' })
  @Public()
  @Get('public/:id/similar')
  findSimilar(
    @Param('id') id: string,
    @Query('listingType') listingType: string,
    @Query('state') state: string,
  ) {
    return this.listingsService.findSimilar(id, listingType, state);
  }

  // ── Landlord (authenticated) ───────────────────────────────────────────────

  @ApiOperation({ summary: 'Create a new listing with photo uploads' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: CreateListingDto })
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FilesInterceptor('photos', 10))
  create(
    @CurrentUser() user: { id: string },
    @Body() dto: CreateListingDto,
    @UploadedFiles() photos: Express.Multer.File[],
  ) {
    return this.listingsService.create(user.id, dto, photos ?? []);
  }

  @ApiOperation({ summary: 'Get all listings for the authenticated landlord' })
  @Get()
  findAll(@CurrentUser() user: { id: string }) {
    return this.listingsService.findAllByLandlord(user.id);
  }

  @ApiOperation({ summary: 'Get a single listing by ID (landlord only)' })
  @Get(':id')
  findOne(
    @Param('id') id: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.listingsService.findOne(id, user.id);
  }

  @ApiOperation({ summary: 'Update a listing with optional new photos' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: UpdateListingDto })
  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FilesInterceptor('photos', 10))
  update(
    @Param('id') id: string,
    @CurrentUser() user: { id: string },
    @Body() dto: UpdateListingDto,
    @UploadedFiles() photos: Express.Multer.File[],
  ) {
    return this.listingsService.update(id, user.id, dto, photos ?? []);
  }

  @ApiOperation({ summary: 'Archive a listing' })
  @Patch(':id/archive')
  @HttpCode(HttpStatus.OK)
  archive(
    @Param('id') id: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.listingsService.archiveListing(id, user.id);
  }

  @ApiOperation({ summary: 'Soft-delete a listing' })
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  remove(
    @Param('id') id: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.listingsService.softDelete(id, user.id);
  }
}
