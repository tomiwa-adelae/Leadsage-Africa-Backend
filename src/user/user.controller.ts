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
import { ApiTags, ApiBearerAuth, ApiOperation, ApiBody } from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { CurrentUser } from 'src/decorators/current-user.decorator';
import { CreateApplicationDto } from './dto/create-application.dto';
import { CreateBookingDto } from './dto/create-booking.dto';
import { CreateTourRequestDto } from './dto/create-tour-request.dto';
import { SubmitScreeningDto } from './dto/submit-screening.dto';
import { SignAgreementDto } from './dto/sign-agreement.dto';
import { UserService } from './user.service';

@ApiTags('user')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) {}

  // ── Stats ──────────────────────────────────────────────────────────────────

  @ApiOperation({ summary: 'Get activity stats for the current user' })
  @Get('stats')
  getStats(@CurrentUser() user: { id: string }) {
    return this.userService.getStats(user.id);
  }

  // ── Saved Listings ─────────────────────────────────────────────────────────

  @ApiOperation({ summary: 'Get saved listings' })
  @Get('saved')
  getSaved(@CurrentUser() user: { id: string }) {
    return this.userService.getSaved(user.id);
  }

  @ApiOperation({ summary: 'Save a listing' })
  @Post('saved/:listingId')
  @HttpCode(HttpStatus.CREATED)
  saveListing(
    @CurrentUser() user: { id: string },
    @Param('listingId') listingId: string,
  ) {
    return this.userService.saveListing(user.id, listingId);
  }

  @ApiOperation({ summary: 'Remove a saved listing' })
  @Delete('saved/:listingId')
  @HttpCode(HttpStatus.OK)
  unsaveListing(
    @CurrentUser() user: { id: string },
    @Param('listingId') listingId: string,
  ) {
    return this.userService.unsaveListing(user.id, listingId);
  }

  // ── Applications ───────────────────────────────────────────────────────────

  @ApiOperation({ summary: 'Get rental applications submitted by the user' })
  @Get('applications')
  getApplications(@CurrentUser() user: { id: string }) {
    return this.userService.getApplications(user.id);
  }

  @ApiOperation({ summary: 'Submit a rental application' })
  @ApiBody({ type: CreateApplicationDto })
  @Post('applications')
  @HttpCode(HttpStatus.CREATED)
  createApplication(
    @CurrentUser() user: { id: string },
    @Body() dto: CreateApplicationDto,
  ) {
    return this.userService.createApplication(user.id, dto);
  }

  @ApiOperation({ summary: 'Withdraw a rental application' })
  @Delete('applications/:id')
  @HttpCode(HttpStatus.OK)
  withdrawApplication(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
  ) {
    return this.userService.withdrawApplication(user.id, id);
  }

  // ── Bookings ───────────────────────────────────────────────────────────────

  @ApiOperation({ summary: 'Get all bookings for the current user' })
  @Get('bookings')
  getBookings(@CurrentUser() user: { id: string }) {
    return this.userService.getBookings(user.id);
  }

  @ApiOperation({ summary: 'Get a booking by Paystack reference' })
  @Get('bookings/by-reference/:ref')
  getBookingByReference(
    @CurrentUser() user: { id: string },
    @Param('ref') ref: string,
  ) {
    return this.userService.getBookingByReference(user.id, ref);
  }

  @ApiOperation({ summary: 'Initiate Paystack payment for a booking' })
  @Post('bookings/:id/pay')
  @HttpCode(HttpStatus.OK)
  initiateBookingPayment(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
  ) {
    return this.userService.initiateBookingPayment(user.id, id);
  }

  @ApiOperation({ summary: 'Verify a booking payment by reference' })
  @Post('bookings/verify-payment/:ref')
  @HttpCode(HttpStatus.OK)
  verifyBookingPayment(
    @CurrentUser() user: { id: string },
    @Param('ref') ref: string,
  ) {
    return this.userService.verifyBookingPayment(user.id, ref);
  }

  @ApiOperation({ summary: 'Create a shortlet booking' })
  @ApiBody({ type: CreateBookingDto })
  @Post('bookings')
  @HttpCode(HttpStatus.CREATED)
  createBooking(
    @CurrentUser() user: { id: string },
    @Body() dto: CreateBookingDto,
  ) {
    return this.userService.createBooking(user.id, dto);
  }

  @ApiOperation({ summary: 'Get a booking by ID' })
  @Get('bookings/:id')
  getBookingById(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
  ) {
    return this.userService.getBookingById(user.id, id);
  }

  @ApiOperation({ summary: 'Cancel a booking' })
  @Delete('bookings/:id')
  @HttpCode(HttpStatus.OK)
  cancelBooking(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
  ) {
    return this.userService.cancelBooking(user.id, id);
  }

  // ── Notifications ──────────────────────────────────────────────────────────

  @ApiOperation({ summary: 'Get notifications for the current user' })
  @Get('notifications')
  getNotifications(@CurrentUser() user: { id: string }) {
    return this.userService.getNotifications(user.id);
  }

  @ApiOperation({ summary: 'Mark all notifications as read' })
  @Patch('notifications/read-all')
  @HttpCode(HttpStatus.OK)
  markAllRead(@CurrentUser() user: { id: string }) {
    return this.userService.markAllRead(user.id);
  }

  @ApiOperation({ summary: 'Mark a single notification as read' })
  @Patch('notifications/:id/read')
  @HttpCode(HttpStatus.OK)
  markOneRead(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
  ) {
    return this.userService.markOneRead(user.id, id);
  }

  // ── Tour Requests ──────────────────────────────────────────────────────────

  @ApiOperation({ summary: 'Submit a tour request' })
  @ApiBody({ type: CreateTourRequestDto })
  @Post('tours')
  @HttpCode(HttpStatus.CREATED)
  createTourRequest(
    @CurrentUser() user: { id: string },
    @Body() dto: CreateTourRequestDto,
  ) {
    return this.userService.createTourRequest(user.id, dto);
  }

  @ApiOperation({ summary: 'Get all tour requests for the current user' })
  @Get('tours')
  getTourRequests(@CurrentUser() user: { id: string }) {
    return this.userService.getTourRequests(user.id);
  }

  @ApiOperation({ summary: 'Get a tour request by ID' })
  @Get('tours/:id')
  getTourRequestById(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
  ) {
    return this.userService.getTourRequestById(user.id, id);
  }

  @ApiOperation({ summary: 'Cancel a tour request' })
  @Delete('tours/:id')
  @HttpCode(HttpStatus.OK)
  cancelTourRequest(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
  ) {
    return this.userService.cancelTourRequest(user.id, id);
  }

  // ── Screening Applications ─────────────────────────────────────────────────

  @ApiOperation({ summary: 'Submit a tenant screening application' })
  @ApiBody({ type: SubmitScreeningDto })
  @Post('applications/screening')
  @HttpCode(HttpStatus.CREATED)
  submitScreening(
    @CurrentUser() user: { id: string },
    @Body() dto: SubmitScreeningDto,
  ) {
    return this.userService.submitScreening(user.id, dto);
  }

  @ApiOperation({ summary: 'Get an application by ID' })
  @Get('applications/:id')
  getApplicationById(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
  ) {
    return this.userService.getApplicationById(user.id, id);
  }

  // ── Rental Agreements ──────────────────────────────────────────────────────

  @ApiOperation({ summary: 'Get all rental agreements for the current user' })
  @Get('agreements')
  getMyAgreements(@CurrentUser() user: { id: string }) {
    return this.userService.getMyAgreements(user.id);
  }

  @ApiOperation({ summary: 'Get a rental agreement by ID' })
  @Get('agreements/:id')
  getAgreement(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
  ) {
    return this.userService.getAgreement(user.id, id);
  }

  @ApiOperation({ summary: 'Sign a rental agreement as tenant' })
  @ApiBody({ type: SignAgreementDto })
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

  @ApiOperation({ summary: 'Get all rental payments for the current user' })
  @Get('rental-payments')
  getMyRentalPayments(@CurrentUser() user: { id: string }) {
    return this.userService.getMyRentalPayments(user.id);
  }

  @ApiOperation({ summary: 'Initialize a card payment for a rental payment' })
  @Post('rental-payments/:id/pay')
  @HttpCode(HttpStatus.OK)
  initializeRentalPayment(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
  ) {
    return this.userService.initializeRentalPayment(user.id, id);
  }

  @ApiOperation({ summary: 'Verify a rental payment by Paystack reference' })
  @Post('rental-payments/verify/:reference')
  @HttpCode(HttpStatus.OK)
  verifyRentalPayment(
    @CurrentUser() user: { id: string },
    @Param('reference') reference: string,
  ) {
    return this.userService.verifyRentalPayment(user.id, reference);
  }
}
