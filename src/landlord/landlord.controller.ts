import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiBody } from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { CurrentUser } from 'src/decorators/current-user.decorator';
import { LandlordService } from './landlord.service';
import { RespondBookingDto } from './dto/respond-booking.dto';
import { RespondApplicationDto } from './dto/respond-application.dto';
import { UpdateCheckInInstructionsDto } from './dto/update-check-in-instructions.dto';

@ApiTags('landlord')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('landlord')
export class LandlordController {
  constructor(private readonly landlordService: LandlordService) {}

  // ── Bookings ───────────────────────────────────────────────────────────────

  @ApiOperation({ summary: 'Get landlord bookings' })
  @Get('bookings')
  getBookings(
    @CurrentUser() user: { id: string },
    @Query('status') status?: string,
  ) {
    return this.landlordService.getBookings(user.id, status);
  }

  @ApiOperation({ summary: 'Get a booking by ID' })
  @Get('bookings/:id')
  getBooking(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
  ) {
    return this.landlordService.getBookingById(user.id, id);
  }

  @ApiOperation({ summary: 'Confirm a booking' })
  @ApiBody({ type: RespondBookingDto })
  @Patch('bookings/:id/confirm')
  @HttpCode(HttpStatus.OK)
  confirmBooking(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Body() dto: RespondBookingDto,
  ) {
    return this.landlordService.confirmBooking(user.id, id, dto);
  }

  @ApiOperation({ summary: 'Reject a booking' })
  @ApiBody({ type: RespondBookingDto })
  @Patch('bookings/:id/reject')
  @HttpCode(HttpStatus.OK)
  rejectBooking(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Body() dto: RespondBookingDto,
  ) {
    return this.landlordService.rejectBooking(user.id, id, dto);
  }

  @ApiOperation({ summary: 'Mark a booking as completed' })
  @Patch('bookings/:id/complete')
  @HttpCode(HttpStatus.OK)
  completeBooking(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
  ) {
    return this.landlordService.completeBooking(user.id, id);
  }

  @ApiOperation({ summary: 'Update check-in instructions for a booking' })
  @ApiBody({ type: UpdateCheckInInstructionsDto })
  @Patch('bookings/:id/instructions')
  @HttpCode(HttpStatus.OK)
  updateCheckInInstructions(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Body() dto: UpdateCheckInInstructionsDto,
  ) {
    return this.landlordService.updateCheckInInstructions(user.id, id, dto);
  }

  @ApiOperation({ summary: 'Resend check-in instructions to guest' })
  @Post('bookings/:id/instructions/resend')
  @HttpCode(HttpStatus.OK)
  resendCheckInInstructions(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
  ) {
    return this.landlordService.resendCheckInInstructions(user.id, id);
  }

  // ── Applications ───────────────────────────────────────────────────────────

  @ApiOperation({ summary: 'Get rental applications for this landlord' })
  @Get('applications')
  getApplications(
    @CurrentUser() user: { id: string },
    @Query('status') status?: string,
  ) {
    return this.landlordService.getApplications(user.id, status);
  }

  @ApiOperation({ summary: 'Approve a rental application' })
  @ApiBody({ type: RespondApplicationDto })
  @Patch('applications/:id/approve')
  @HttpCode(HttpStatus.OK)
  approveApplication(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Body() dto: RespondApplicationDto,
  ) {
    return this.landlordService.approveApplication(user.id, id, dto);
  }

  @ApiOperation({ summary: 'Reject a rental application' })
  @ApiBody({ type: RespondApplicationDto })
  @Patch('applications/:id/reject')
  @HttpCode(HttpStatus.OK)
  rejectApplication(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Body() dto: RespondApplicationDto,
  ) {
    return this.landlordService.rejectApplication(user.id, id, dto);
  }

  @ApiOperation({ summary: 'Mark an application as under review' })
  @Patch('applications/:id/review')
  @HttpCode(HttpStatus.OK)
  markUnderReview(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
  ) {
    return this.landlordService.markUnderReview(user.id, id);
  }

  // ── Earnings ───────────────────────────────────────────────────────────────

  @ApiOperation({ summary: 'Get landlord earnings summary' })
  @Get('earnings')
  getEarnings(@CurrentUser() user: { id: string }) {
    return this.landlordService.getEarnings(user.id);
  }

  // ── Listing detail ────────────────────────────────────────────────────────

  @ApiOperation({ summary: 'Get a single listing owned by this landlord' })
  @Get('listings/:id')
  getListing(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
  ) {
    return this.landlordService.getListing(user.id, id);
  }

  // ── Instant Book toggle ────────────────────────────────────────────────────

  @ApiOperation({ summary: 'Toggle instant book on a listing' })
  @Patch('listings/:id/instant-book')
  @HttpCode(HttpStatus.OK)
  toggleInstantBook(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
  ) {
    return this.landlordService.toggleInstantBook(user.id, id);
  }

  // ── Tours ──────────────────────────────────────────────────────────────────

  @ApiOperation({ summary: 'Get tour requests for this landlord' })
  @Get('tours')
  getTours(
    @CurrentUser() user: { id: string },
    @Query('status') status?: string,
  ) {
    return this.landlordService.getTours(user.id, status);
  }

  // ── Agreements ─────────────────────────────────────────────────────────────

  @ApiOperation({ summary: 'Get rental agreements for this landlord' })
  @Get('agreements')
  getLandlordAgreements(@CurrentUser() user: { id: string }) {
    return this.landlordService.getLandlordAgreements(user.id);
  }

  @ApiOperation({ summary: 'Get a rental agreement by ID' })
  @Get('agreements/:id')
  getLandlordAgreementById(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
  ) {
    return this.landlordService.getLandlordAgreementById(user.id, id);
  }

  @ApiOperation({ summary: 'Sign a rental agreement as landlord' })
  @ApiBody({ schema: { type: 'object', required: ['signature'], properties: { signature: { type: 'string', description: 'Base64 signature image or full name' } } } })
  @Post('agreements/:id/sign')
  @HttpCode(HttpStatus.OK)
  signAgreementAsLandlord(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Body('signature') signature: string,
    @Req() req: Request,
  ) {
    const ip = req.ip ?? req.headers['x-forwarded-for']?.toString();
    return this.landlordService.signAgreementAsLandlord(user.id, id, signature, ip);
  }

  // ── Listing availability ────────────────────────────────────────────────────

  @ApiOperation({ summary: 'Mark a listing as available again' })
  @Patch('listings/:id/mark-available')
  @HttpCode(HttpStatus.OK)
  markListingAvailable(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
  ) {
    return this.landlordService.markListingAvailable(user.id, id);
  }

  // ── Dashboard ──────────────────────────────────────────────────────────────

  @ApiOperation({ summary: 'Get landlord dashboard summary' })
  @Get('dashboard')
  getDashboard(@CurrentUser() user: { id: string }) {
    return this.landlordService.getDashboard(user.id);
  }
}
