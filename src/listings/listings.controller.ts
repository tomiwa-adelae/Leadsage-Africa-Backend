import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { CurrentUser } from 'src/decorators/current-user.decorator';
import { Public } from 'src/decorators/public.decorator';
import { CreateListingDto } from './dto/create-listing.dto';
import { ListingsService } from './listings.service';

@UseGuards(JwtAuthGuard)
@Controller('listings')
export class ListingsController {
  constructor(private readonly listingsService: ListingsService) {}

  // ── Public ─────────────────────────────────────────────────────────────────

  @Public()
  @Get('public')
  findPublished(@Query() query: Record<string, string>) {
    return this.listingsService.findPublished(query);
  }

  @Public()
  @Get('public/:slug')
  findPublishedBySlug(@Param('slug') slug: string) {
    return this.listingsService.findPublishedBySlug(slug);
  }

  @Public()
  @Get('public/:id/booked-dates')
  getBookedDates(@Param('id') id: string) {
    return this.listingsService.getBookedDates(id);
  }

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

  @Get()
  findAll(@CurrentUser() user: { id: string }) {
    return this.listingsService.findAllByLandlord(user.id);
  }

  @Get(':id')
  findOne(
    @Param('id') id: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.listingsService.findOne(id, user.id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  remove(
    @Param('id') id: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.listingsService.softDelete(id, user.id);
  }
}
