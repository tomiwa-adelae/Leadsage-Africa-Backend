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
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { CurrentUser } from 'src/decorators/current-user.decorator';
import { CreateApplicationDto } from './dto/create-application.dto';
import { CreateBookingDto } from './dto/create-booking.dto';
import { CreateTourRequestDto } from './dto/create-tour-request.dto';
import { SubmitScreeningDto } from './dto/submit-screening.dto';
import { SignAgreementDto } from './dto/sign-agreement.dto';
import { UserService } from './user.service';

@UseGuards(JwtAuthGuard)
@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) {}

  // ── Stats ──────────────────────────────────────────────────────────────────

  @Get('stats')
  getStats(@CurrentUser() user: { id: string }) {
    return this.userService.getStats(user.id);
  }

  // ── Saved Listings ─────────────────────────────────────────────────────────

  @Get('saved')
  getSaved(@CurrentUser() user: { id: string }) {
    return this.userService.getSaved(user.id);
  }

  @Post('saved/:listingId')
  @HttpCode(HttpStatus.CREATED)
  saveListing(
    @CurrentUser() user: { id: string },
    @Param('listingId') listingId: string,
  ) {
    return this.userService.saveListing(user.id, listingId);
  }

  @Delete('saved/:listingId')
  @HttpCode(HttpStatus.OK)
  unsaveListing(
    @CurrentUser() user: { id: string },
    @Param('listingId') listingId: string,
  ) {
    return this.userService.unsaveListing(user.id, listingId);
  }

  // ── Applications ───────────────────────────────────────────────────────────

  @Get('applications')
  getApplications(@CurrentUser() user: { id: string }) {
    return this.userService.getApplications(user.id);
  }

  @Post('applications')
  @HttpCode(HttpStatus.CREATED)
  createApplication(
    @CurrentUser() user: { id: string },
    @Body() dto: CreateApplicationDto,
  ) {
    return this.userService.createApplication(user.id, dto);
  }

  @Delete('applications/:id')
  @HttpCode(HttpStatus.OK)
  withdrawApplication(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
  ) {
    return this.userService.withdrawApplication(user.id, id);
  }

  // ── Bookings ───────────────────────────────────────────────────────────────

  @Get('bookings')
  getBookings(@CurrentUser() user: { id: string }) {
    return this.userService.getBookings(user.id);
  }

  @Get('bookings/by-reference/:ref')
  getBookingByReference(
    @CurrentUser() user: { id: string },
    @Param('ref') ref: string,
  ) {
    return this.userService.getBookingByReference(user.id, ref);
  }

  @Post('bookings/:id/pay')
  @HttpCode(HttpStatus.OK)
  initiateBookingPayment(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
  ) {
    return this.userService.initiateBookingPayment(user.id, id);
  }

  @Post('bookings/verify-payment/:ref')
  @HttpCode(HttpStatus.OK)
  verifyBookingPayment(
    @CurrentUser() user: { id: string },
    @Param('ref') ref: string,
  ) {
    return this.userService.verifyBookingPayment(user.id, ref);
  }

  @Post('bookings')
  @HttpCode(HttpStatus.CREATED)
  createBooking(
    @CurrentUser() user: { id: string },
    @Body() dto: CreateBookingDto,
  ) {
    return this.userService.createBooking(user.id, dto);
  }

  @Get('bookings/:id')
  getBookingById(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
  ) {
    return this.userService.getBookingById(user.id, id);
  }

  @Delete('bookings/:id')
  @HttpCode(HttpStatus.OK)
  cancelBooking(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
  ) {
    return this.userService.cancelBooking(user.id, id);
  }

  // ── Notifications ──────────────────────────────────────────────────────────

  @Get('notifications')
  getNotifications(@CurrentUser() user: { id: string }) {
    return this.userService.getNotifications(user.id);
  }

  @Patch('notifications/read-all')
  @HttpCode(HttpStatus.OK)
  markAllRead(@CurrentUser() user: { id: string }) {
    return this.userService.markAllRead(user.id);
  }

  @Patch('notifications/:id/read')
  @HttpCode(HttpStatus.OK)
  markOneRead(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
  ) {
    return this.userService.markOneRead(user.id, id);
  }

  // ── Tour Requests ──────────────────────────────────────────────────────────

  @Post('tours')
  @HttpCode(HttpStatus.CREATED)
  createTourRequest(
    @CurrentUser() user: { id: string },
    @Body() dto: CreateTourRequestDto,
  ) {
    return this.userService.createTourRequest(user.id, dto);
  }

  @Get('tours')
  getTourRequests(@CurrentUser() user: { id: string }) {
    return this.userService.getTourRequests(user.id);
  }

  @Get('tours/:id')
  getTourRequestById(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
  ) {
    return this.userService.getTourRequestById(user.id, id);
  }

  @Delete('tours/:id')
  @HttpCode(HttpStatus.OK)
  cancelTourRequest(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
  ) {
    return this.userService.cancelTourRequest(user.id, id);
  }

  // ── Screening Applications ─────────────────────────────────────────────────

  @Post('applications/screening')
  @HttpCode(HttpStatus.CREATED)
  submitScreening(
    @CurrentUser() user: { id: string },
    @Body() dto: SubmitScreeningDto,
  ) {
    return this.userService.submitScreening(user.id, dto);
  }

  @Get('applications/:id')
  getApplicationById(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
  ) {
    return this.userService.getApplicationById(user.id, id);
  }

  // ── Rental Agreements ──────────────────────────────────────────────────────

  @Get('agreements')
  getMyAgreements(@CurrentUser() user: { id: string }) {
    return this.userService.getMyAgreements(user.id);
  }

  @Get('agreements/:id')
  getAgreement(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
  ) {
    return this.userService.getAgreement(user.id, id);
  }

  @Post('agreements/:id/sign')
  @HttpCode(HttpStatus.OK)
  signAgreement(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Body() dto: SignAgreementDto,
    @Req() req: Request,
  ) {
    const ip = req.ip ?? req.headers['x-forwarded-for']?.toString();
    return this.userService.signAgreementAsTenant(user.id, id, dto, ip);
  }

  // ── Rental Payments ────────────────────────────────────────────────────────

  @Get('rental-payments')
  getMyRentalPayments(@CurrentUser() user: { id: string }) {
    return this.userService.getMyRentalPayments(user.id);
  }

  @Post('rental-payments/:id/pay')
  @HttpCode(HttpStatus.OK)
  initializeRentalPayment(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
  ) {
    return this.userService.initializeRentalPayment(user.id, id);
  }

  @Post('rental-payments/verify/:reference')
  @HttpCode(HttpStatus.OK)
  verifyRentalPayment(
    @CurrentUser() user: { id: string },
    @Param('reference') reference: string,
  ) {
    return this.userService.verifyRentalPayment(user.id, reference);
  }
}
