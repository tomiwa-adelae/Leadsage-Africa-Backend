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
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { PositionGuard } from 'src/auth/guards/position.guard';
import { CurrentUser } from 'src/decorators/current-user.decorator';
import { RequirePosition } from 'src/decorators/require-position.decorator';
import { AdminGuard } from './guards/admin.guard';
import { AdminService } from './admin.service';
import { RejectListingDto } from './dto/reject-listing.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { CreateAdminDto } from './dto/create-admin.dto';
import { UpdateAdminDto } from './dto/update-admin.dto';
import { GetListingsQueryDto } from './dto/get-listings-query.dto';
import { GetUsersQueryDto } from './dto/get-users-query.dto';
import { ScheduleTourDto } from './dto/schedule-tour.dto';
import { GenerateAgreementDto } from './dto/generate-agreement.dto';
import { CreateRentalPaymentDto } from './dto/create-rental-payment.dto';

@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  // ── Dashboard ──────────────────────────────────────────────────────────────

  @Get('stats')
  getStats() {
    return this.adminService.getStats();
  }

  // ── Listings ───────────────────────────────────────────────────────────────

  @Get('listings')
  getAllListings(@Query() query: GetListingsQueryDto) {
    return this.adminService.getAllListings(query);
  }

  @Get('listings/:slug')
  findListing(@Param('slug') slug: string) {
    return this.adminService.findListingBySlug(slug);
  }

  @Patch('listings/:id/approve')
  @HttpCode(HttpStatus.OK)
  approveListing(@Param('id') id: string) {
    return this.adminService.approveListing(id);
  }

  @Patch('listings/:id/reject')
  @HttpCode(HttpStatus.OK)
  rejectListing(@Param('id') id: string, @Body() dto: RejectListingDto) {
    return this.adminService.rejectListing(id, dto);
  }

  // ── Users ──────────────────────────────────────────────────────────────────

  @Get('users')
  getAllUsers(@Query() query: GetUsersQueryDto) {
    return this.adminService.getAllUsers(query);
  }

  @Patch('users/:id/status')
  @HttpCode(HttpStatus.OK)
  updateUserStatus(
    @Param('id') id: string,
    @Body() dto: UpdateUserStatusDto,
  ) {
    return this.adminService.updateUserStatus(id, dto);
  }

  // ── Admin Team ─────────────────────────────────────────────────────────────

  @Get('team')
  getAdminTeam() {
    return this.adminService.getAdminTeam();
  }

  @Post('team')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(PositionGuard)
  @RequirePosition('SUPER_ADMIN')
  createAdminAccount(@Body() dto: CreateAdminDto) {
    return this.adminService.createAdminAccount(dto);
  }

  @Patch('team/:id')
  @UseGuards(PositionGuard)
  @RequirePosition('SUPER_ADMIN')
  updateAdmin(@Param('id') id: string, @Body() dto: UpdateAdminDto) {
    return this.adminService.updateAdmin(id, dto);
  }

  @Delete('team/:id')
  @HttpCode(HttpStatus.OK)
  @UseGuards(PositionGuard)
  @RequirePosition('SUPER_ADMIN')
  removeAdmin(
    @Param('id') id: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.adminService.removeAdmin(id, user.id);
  }

  // ── Bookings ───────────────────────────────────────────────────────────────

  @Get('bookings/stats')
  getBookingStats() {
    return this.adminService.getBookingStats();
  }

  @Get('bookings')
  getAllBookings(
    @Query() query: {
      status?: string;
      paymentStatus?: string;
      search?: string;
      page?: number;
      limit?: number;
    },
  ) {
    return this.adminService.getAllBookings(query);
  }

  @Get('bookings/:id')
  getBookingById(@Param('id') id: string) {
    return this.adminService.getBookingById(id);
  }

  @Patch('bookings/:id/cancel')
  @HttpCode(HttpStatus.OK)
  cancelBooking(
    @Param('id') id: string,
    @Body('reason') reason: string,
  ) {
    return this.adminService.adminCancelBooking(id, reason);
  }

  @Patch('bookings/:id/complete')
  @HttpCode(HttpStatus.OK)
  completeBooking(@Param('id') id: string) {
    return this.adminService.adminCompleteBooking(id);
  }

  @Post('bookings/:id/refund')
  @HttpCode(HttpStatus.OK)
  refundBooking(
    @Param('id') id: string,
    @Body('amount') amount?: number,
  ) {
    return this.adminService.adminInitiateRefund(id, amount);
  }

  @Patch('bookings/:id/note')
  @HttpCode(HttpStatus.OK)
  addAdminNote(
    @Param('id') id: string,
    @Body('note') note: string,
  ) {
    return this.adminService.addAdminNote(id, note);
  }

  // ── Tour Requests ──────────────────────────────────────────────────────────

  @Get('tours')
  getTourRequests(@Query('status') status?: string) {
    return this.adminService.getTourRequests(status);
  }

  @Get('tours/:id')
  getTourRequestById(@Param('id') id: string) {
    return this.adminService.getTourRequestById(id);
  }

  @Patch('tours/:id/schedule')
  @HttpCode(HttpStatus.OK)
  scheduleTour(@Param('id') id: string, @Body() dto: ScheduleTourDto) {
    return this.adminService.scheduleTour(id, dto);
  }

  @Patch('tours/:id/complete')
  @HttpCode(HttpStatus.OK)
  completeTour(@Param('id') id: string) {
    return this.adminService.completeTour(id);
  }

  @Patch('tours/:id/cancel')
  @HttpCode(HttpStatus.OK)
  cancelTour(@Param('id') id: string, @Body('reason') reason?: string) {
    return this.adminService.cancelTour(id, reason);
  }

  // ── Screening Applications ─────────────────────────────────────────────────

  @Get('screening-applications')
  getScreeningApplications(@Query('status') status?: string) {
    return this.adminService.getScreeningApplications(status);
  }

  @Get('screening-applications/:id')
  getScreeningApplicationById(@Param('id') id: string) {
    return this.adminService.getScreeningApplicationById(id);
  }

  @Patch('screening-applications/:id/review')
  @HttpCode(HttpStatus.OK)
  reviewApplication(
    @Param('id') id: string,
    @Body('status') status: 'APPROVED' | 'REJECTED',
    @Body('note') note?: string,
  ) {
    return this.adminService.adminReviewApplication(id, status, note);
  }

  @Post('screening-applications/:id/verify-nin')
  @HttpCode(HttpStatus.OK)
  verifyApplicantNin(@Param('id') id: string) {
    return this.adminService.verifyApplicantNin(id);
  }

  // ── Rental Agreements ──────────────────────────────────────────────────────

  @Post('agreements')
  @HttpCode(HttpStatus.CREATED)
  generateAgreement(@Body() dto: GenerateAgreementDto) {
    return this.adminService.generateAgreement(dto);
  }

  @Get('agreements')
  getAgreements(@Query('status') status?: string) {
    return this.adminService.getAgreements(status);
  }

  @Get('agreements/:id')
  getAgreementById(@Param('id') id: string) {
    return this.adminService.getAgreementById(id);
  }

  // ── Rental Payments ────────────────────────────────────────────────────────

  @Post('rental-payments')
  @HttpCode(HttpStatus.CREATED)
  createRentalPayments(@Body() dto: CreateRentalPaymentDto) {
    return this.adminService.createRentalPayments(dto);
  }

  @Patch('rental-payments/:id/paid')
  @HttpCode(HttpStatus.OK)
  markRentalPaymentPaid(@Param('id') id: string) {
    return this.adminService.markRentalPaymentPaid(id);
  }

  @Patch('rental-payments/:id/overdue')
  @HttpCode(HttpStatus.OK)
  markRentalPaymentOverdue(@Param('id') id: string) {
    return this.adminService.markRentalPaymentOverdue(id);
  }

  // ── Savings ────────────────────────────────────────────────────────────────

  @Get('savings')
  getAllSavingsPlans(
    @Query('status') status?: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Query('search') search?: string,
  ) {
    return this.adminService.getAllSavingsPlans({ status, page: +page, limit: +limit, search });
  }

  @Get('savings/stats')
  getSavingsStats() {
    return this.adminService.getSavingsStats();
  }

  @Get('savings/:id')
  getSavingsPlanById(@Param('id') id: string) {
    return this.adminService.getSavingsPlanById(id);
  }

  // ── Escrow utilities ────────────────────────────────────────────────────────

  @Post('escrows/release-overdue')
  @HttpCode(HttpStatus.OK)
  releaseOverdueEscrows() {
    return this.adminService.releaseOverdueEscrows();
  }

  // ── Ledger ─────────────────────────────────────────────────────────────────

  @Get('ledger/entries')
  getLedgerEntries(
    @Query('userId') userId?: string,
    @Query('search') search?: string,
    @Query('accountType') accountType?: string,
    @Query('eventType') eventType?: string,
    @Query('entryType') entryType?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.adminService.getLedgerEntries({
      userId,
      search,
      accountType,
      eventType,
      entryType,
      dateFrom,
      dateTo,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 50,
    });
  }

  @Get('ledger/stats')
  getLedgerStats() {
    return this.adminService.getLedgerStats();
  }

  // ── Withdrawal requests ─────────────────────────────────────────────────────

  @Get('withdrawals')
  getWithdrawalRequests(
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.adminService.getWithdrawalRequests({
      status,
      search,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 30,
    });
  }

  @Get('withdrawals/stats')
  getWithdrawalStats() {
    return this.adminService.getWithdrawalStats();
  }

  @Post('withdrawals/:id/process')
  @HttpCode(HttpStatus.OK)
  processWithdrawal(
    @Param('id') id: string,
    @CurrentUser() admin: { id: string },
  ) {
    return this.adminService.processWithdrawalViaAnchor(id, admin.id);
  }

  @Post('withdrawals/:id/mark-done')
  @HttpCode(HttpStatus.OK)
  markWithdrawalDone(
    @Param('id') id: string,
    @CurrentUser() admin: { id: string },
  ) {
    return this.adminService.markWithdrawalDone(id, admin.id);
  }

  @Post('withdrawals/:id/reject')
  @HttpCode(HttpStatus.OK)
  rejectWithdrawal(
    @Param('id') id: string,
    @CurrentUser() admin: { id: string },
    @Body('reason') reason: string,
  ) {
    return this.adminService.rejectWithdrawal(id, admin.id, reason);
  }

  @Post('users/:userId/bank-account/override')
  @HttpCode(HttpStatus.OK)
  overrideBankAccount(
    @Param('userId') userId: string,
    @Body() body: { accountNumber: string; bankCode: string; bankName: string },
  ) {
    return this.adminService.adminOverrideBankAccount(
      userId,
      body.accountNumber,
      body.bankCode,
      body.bankName,
    );
  }

  @Get('ledger/export')
  async exportLedger(
    @Res() res: Response,
    @Query('userId') userId?: string,
    @Query('accountType') accountType?: string,
    @Query('eventType') eventType?: string,
    @Query('entryType') entryType?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    const csv = await this.adminService.exportLedgerCsv({
      userId, accountType, eventType, entryType, dateFrom, dateTo,
    });
    const filename = `leadsage-ledger-${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  }
}
