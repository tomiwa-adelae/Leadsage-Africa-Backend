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
import { Request } from 'express';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { CurrentUser } from 'src/decorators/current-user.decorator';
import { LandlordService } from './landlord.service';
import { RespondBookingDto } from './dto/respond-booking.dto';
import { RespondApplicationDto } from './dto/respond-application.dto';
import { UpdateCheckInInstructionsDto } from './dto/update-check-in-instructions.dto';

@UseGuards(JwtAuthGuard)
@Controller('landlord')
export class LandlordController {
  constructor(private readonly landlordService: LandlordService) {}

  // ── Bookings ───────────────────────────────────────────────────────────────

  @Get('bookings')
  getBookings(
    @CurrentUser() user: { id: string },
    @Query('status') status?: string,
  ) {
    return this.landlordService.getBookings(user.id, status);
  }

  @Get('bookings/:id')
  getBooking(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
  ) {
    return this.landlordService.getBookingById(user.id, id);
  }

  @Patch('bookings/:id/confirm')
  @HttpCode(HttpStatus.OK)
  confirmBooking(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Body() dto: RespondBookingDto,
  ) {
    return this.landlordService.confirmBooking(user.id, id, dto);
  }

  @Patch('bookings/:id/reject')
  @HttpCode(HttpStatus.OK)
  rejectBooking(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Body() dto: RespondBookingDto,
  ) {
    return this.landlordService.rejectBooking(user.id, id, dto);
  }

  @Patch('bookings/:id/complete')
  @HttpCode(HttpStatus.OK)
  completeBooking(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
  ) {
    return this.landlordService.completeBooking(user.id, id);
  }

  @Patch('bookings/:id/instructions')
  @HttpCode(HttpStatus.OK)
  updateCheckInInstructions(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Body() dto: UpdateCheckInInstructionsDto,
  ) {
    return this.landlordService.updateCheckInInstructions(user.id, id, dto);
  }

  @Post('bookings/:id/instructions/resend')
  @HttpCode(HttpStatus.OK)
  resendCheckInInstructions(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
  ) {
    return this.landlordService.resendCheckInInstructions(user.id, id);
  }

  // ── Applications ───────────────────────────────────────────────────────────

  @Get('applications')
  getApplications(
    @CurrentUser() user: { id: string },
    @Query('status') status?: string,
  ) {
    return this.landlordService.getApplications(user.id, status);
  }

  @Patch('applications/:id/approve')
  @HttpCode(HttpStatus.OK)
  approveApplication(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Body() dto: RespondApplicationDto,
  ) {
    return this.landlordService.approveApplication(user.id, id, dto);
  }

  @Patch('applications/:id/reject')
  @HttpCode(HttpStatus.OK)
  rejectApplication(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Body() dto: RespondApplicationDto,
  ) {
    return this.landlordService.rejectApplication(user.id, id, dto);
  }

  @Patch('applications/:id/review')
  @HttpCode(HttpStatus.OK)
  markUnderReview(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
  ) {
    return this.landlordService.markUnderReview(user.id, id);
  }

  // ── Earnings ───────────────────────────────────────────────────────────────

  @Get('earnings')
  getEarnings(@CurrentUser() user: { id: string }) {
    return this.landlordService.getEarnings(user.id);
  }

  // ── Instant Book toggle ────────────────────────────────────────────────────

  @Patch('listings/:id/instant-book')
  @HttpCode(HttpStatus.OK)
  toggleInstantBook(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
  ) {
    return this.landlordService.toggleInstantBook(user.id, id);
  }

  // ── Tours ──────────────────────────────────────────────────────────────────

  @Get('tours')
  getTours(
    @CurrentUser() user: { id: string },
    @Query('status') status?: string,
  ) {
    return this.landlordService.getTours(user.id, status);
  }

  // ── Agreements ─────────────────────────────────────────────────────────────

  @Get('agreements')
  getLandlordAgreements(@CurrentUser() user: { id: string }) {
    return this.landlordService.getLandlordAgreements(user.id);
  }

  @Get('agreements/:id')
  getLandlordAgreementById(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
  ) {
    return this.landlordService.getLandlordAgreementById(user.id, id);
  }

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
}
