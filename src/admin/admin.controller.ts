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
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery, ApiBody } from '@nestjs/swagger';
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

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  // ── Dashboard ──────────────────────────────────────────────────────────────

  @ApiOperation({ summary: 'Get dashboard stats' })
  @Get('stats')
  getStats() {
    return this.adminService.getStats();
  }

  // ── Listings ───────────────────────────────────────────────────────────────

  @ApiOperation({ summary: 'Get all listings (paginated, filterable)' })
  @Get('listings')
  getAllListings(@Query() query: GetListingsQueryDto) {
    return this.adminService.getAllListings(query);
  }

  @ApiOperation({ summary: 'Get a listing by slug' })
  @Get('listings/:slug')
  findListing(@Param('slug') slug: string) {
    return this.adminService.findListingBySlug(slug);
  }

  @ApiOperation({ summary: 'Approve a listing' })
  @Patch('listings/:id/approve')
  @HttpCode(HttpStatus.OK)
  approveListing(@Param('id') id: string) {
    return this.adminService.approveListing(id);
  }

  @ApiOperation({ summary: 'Reject a listing with a reason' })
  @ApiBody({ type: RejectListingDto })
  @Patch('listings/:id/reject')
  @HttpCode(HttpStatus.OK)
  rejectListing(@Param('id') id: string, @Body() dto: RejectListingDto) {
    return this.adminService.rejectListing(id, dto);
  }

  // ── Users ──────────────────────────────────────────────────────────────────

  @ApiOperation({ summary: 'Get all users (paginated, filterable)' })
  @Get('users')
  getAllUsers(@Query() query: GetUsersQueryDto) {
    return this.adminService.getAllUsers(query);
  }

  @ApiOperation({ summary: 'Update a user account status' })
  @ApiBody({ type: UpdateUserStatusDto })
  @Patch('users/:id/status')
  @HttpCode(HttpStatus.OK)
  updateUserStatus(
    @Param('id') id: string,
    @Body() dto: UpdateUserStatusDto,
  ) {
    return this.adminService.updateUserStatus(id, dto);
  }

  // ── Admin Team ─────────────────────────────────────────────────────────────

  @ApiOperation({ summary: 'Get all admin team members' })
  @Get('team')
  getAdminTeam() {
    return this.adminService.getAdminTeam();
  }

  @ApiOperation({ summary: 'Create a new admin account (super admin only)' })
  @ApiBody({ type: CreateAdminDto })
  @Post('team')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(PositionGuard)
  @RequirePosition('SUPER_ADMIN')
  createAdminAccount(@Body() dto: CreateAdminDto) {
    return this.adminService.createAdminAccount(dto);
  }

  @ApiOperation({ summary: 'Update an admin account (super admin only)' })
  @ApiBody({ type: UpdateAdminDto })
  @Patch('team/:id')
  @UseGuards(PositionGuard)
  @RequirePosition('SUPER_ADMIN')
  updateAdmin(@Param('id') id: string, @Body() dto: UpdateAdminDto) {
    return this.adminService.updateAdmin(id, dto);
  }

  @ApiOperation({ summary: 'Remove an admin account (super admin only)' })
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

  @ApiOperation({ summary: 'Get booking aggregate stats' })
  @Get('bookings/stats')
  getBookingStats() {
    return this.adminService.getBookingStats();
  }

  @ApiOperation({ summary: 'Get all bookings (filterable)' })
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

  @ApiOperation({ summary: 'Get a booking by ID' })
  @Get('bookings/:id')
  getBookingById(@Param('id') id: string) {
    return this.adminService.getBookingById(id);
  }

  @ApiOperation({ summary: 'Cancel a booking' })
  @ApiBody({ schema: { type: 'object', required: ['reason'], properties: { reason: { type: 'string' } } } })
  @Patch('bookings/:id/cancel')
  @HttpCode(HttpStatus.OK)
  cancelBooking(
    @Param('id') id: string,
    @Body('reason') reason: string,
  ) {
    return this.adminService.adminCancelBooking(id, reason);
  }

  @ApiOperation({ summary: 'Mark a booking as completed' })
  @Patch('bookings/:id/complete')
  @HttpCode(HttpStatus.OK)
  completeBooking(@Param('id') id: string) {
    return this.adminService.adminCompleteBooking(id);
  }

  @ApiOperation({ summary: 'Initiate a refund for a booking' })
  @ApiBody({ schema: { type: 'object', properties: { amount: { type: 'number', description: 'Partial amount; omit for full refund' } } } })
  @Post('bookings/:id/refund')
  @HttpCode(HttpStatus.OK)
  refundBooking(
    @Param('id') id: string,
    @Body('amount') amount?: number,
  ) {
    return this.adminService.adminInitiateRefund(id, amount);
  }

  @ApiOperation({ summary: 'Add an internal admin note to a booking' })
  @ApiBody({ schema: { type: 'object', required: ['note'], properties: { note: { type: 'string' } } } })
  @Patch('bookings/:id/note')
  @HttpCode(HttpStatus.OK)
  addAdminNote(
    @Param('id') id: string,
    @Body('note') note: string,
  ) {
    return this.adminService.addAdminNote(id, note);
  }

  // ── Tour Requests ──────────────────────────────────────────────────────────

  @ApiOperation({ summary: 'Get all tour requests' })
  @ApiQuery({ name: 'status', required: false })
  @Get('tours')
  getTourRequests(@Query('status') status?: string) {
    return this.adminService.getTourRequests(status);
  }

  @ApiOperation({ summary: 'Get a tour request by ID' })
  @Get('tours/:id')
  getTourRequestById(@Param('id') id: string) {
    return this.adminService.getTourRequestById(id);
  }

  @ApiOperation({ summary: 'Schedule a tour' })
  @ApiBody({ type: ScheduleTourDto })
  @Patch('tours/:id/schedule')
  @HttpCode(HttpStatus.OK)
  scheduleTour(@Param('id') id: string, @Body() dto: ScheduleTourDto) {
    return this.adminService.scheduleTour(id, dto);
  }

  @ApiOperation({ summary: 'Mark a tour as completed' })
  @Patch('tours/:id/complete')
  @HttpCode(HttpStatus.OK)
  completeTour(@Param('id') id: string) {
    return this.adminService.completeTour(id);
  }

  @ApiOperation({ summary: 'Cancel a tour' })
  @ApiBody({ schema: { type: 'object', properties: { reason: { type: 'string' } } } })
  @Patch('tours/:id/cancel')
  @HttpCode(HttpStatus.OK)
  cancelTour(@Param('id') id: string, @Body('reason') reason?: string) {
    return this.adminService.cancelTour(id, reason);
  }

  // ── Screening Applications ─────────────────────────────────────────────────

  @ApiOperation({ summary: 'Get all screening applications' })
  @ApiQuery({ name: 'status', required: false })
  @Get('screening-applications')
  getScreeningApplications(@Query('status') status?: string) {
    return this.adminService.getScreeningApplications(status);
  }

  @ApiOperation({ summary: 'Get a screening application by ID' })
  @Get('screening-applications/:id')
  getScreeningApplicationById(@Param('id') id: string) {
    return this.adminService.getScreeningApplicationById(id);
  }

  @ApiOperation({ summary: 'Approve or reject a screening application' })
  @ApiBody({ schema: { type: 'object', required: ['status'], properties: { status: { type: 'string', enum: ['APPROVED', 'REJECTED'] }, note: { type: 'string' } } } })
  @Patch('screening-applications/:id/review')
  @HttpCode(HttpStatus.OK)
  reviewApplication(
    @Param('id') id: string,
    @Body('status') status: 'APPROVED' | 'REJECTED',
    @Body('note') note?: string,
  ) {
    return this.adminService.adminReviewApplication(id, status, note);
  }

  @ApiOperation({ summary: 'Verify applicant NIN' })
  @Post('screening-applications/:id/verify-nin')
  @HttpCode(HttpStatus.OK)
  verifyApplicantNin(@Param('id') id: string) {
    return this.adminService.verifyApplicantNin(id);
  }

  // ── Rental Agreements ──────────────────────────────────────────────────────

  @ApiOperation({ summary: 'Generate a rental agreement' })
  @ApiBody({ type: GenerateAgreementDto })
  @Post('agreements')
  @HttpCode(HttpStatus.CREATED)
  generateAgreement(@Body() dto: GenerateAgreementDto) {
    return this.adminService.generateAgreement(dto);
  }

  @ApiOperation({ summary: 'Get all rental agreements' })
  @ApiQuery({ name: 'status', required: false })
  @Get('agreements')
  getAgreements(@Query('status') status?: string) {
    return this.adminService.getAgreements(status);
  }

  @ApiOperation({ summary: 'Get a rental agreement by ID' })
  @Get('agreements/:id')
  getAgreementById(@Param('id') id: string) {
    return this.adminService.getAgreementById(id);
  }

  // ── Rental Payments ────────────────────────────────────────────────────────

  @ApiOperation({ summary: 'Create rental payment schedule' })
  @ApiBody({ type: CreateRentalPaymentDto })
  @Post('rental-payments')
  @HttpCode(HttpStatus.CREATED)
  createRentalPayments(@Body() dto: CreateRentalPaymentDto) {
    return this.adminService.createRentalPayments(dto);
  }

  @ApiOperation({ summary: 'Mark a rental payment as paid' })
  @Patch('rental-payments/:id/paid')
  @HttpCode(HttpStatus.OK)
  markRentalPaymentPaid(@Param('id') id: string) {
    return this.adminService.markRentalPaymentPaid(id);
  }

  @ApiOperation({ summary: 'Mark a rental payment as overdue' })
  @Patch('rental-payments/:id/overdue')
  @HttpCode(HttpStatus.OK)
  markRentalPaymentOverdue(@Param('id') id: string) {
    return this.adminService.markRentalPaymentOverdue(id);
  }

  // ── Savings ────────────────────────────────────────────────────────────────

  @ApiOperation({ summary: 'Get all savings plans' })
  @Get('savings')
  getAllSavingsPlans(
    @Query('status') status?: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Query('search') search?: string,
  ) {
    return this.adminService.getAllSavingsPlans({ status, page: +page, limit: +limit, search });
  }

  @ApiOperation({ summary: 'Get savings aggregate stats' })
  @Get('savings/stats')
  getSavingsStats() {
    return this.adminService.getSavingsStats();
  }

  @ApiOperation({ summary: 'Get a savings plan by ID' })
  @Get('savings/:id')
  getSavingsPlanById(@Param('id') id: string) {
    return this.adminService.getSavingsPlanById(id);
  }

  // ── Escrow utilities ────────────────────────────────────────────────────────

  @ApiOperation({ summary: 'Release all overdue escrows' })
  @Post('escrows/release-overdue')
  @HttpCode(HttpStatus.OK)
  releaseOverdueEscrows() {
    return this.adminService.releaseOverdueEscrows();
  }

  // ── Ledger ─────────────────────────────────────────────────────────────────

  @ApiOperation({ summary: 'Get paginated ledger entries' })
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

  @ApiOperation({ summary: 'Get ledger aggregate stats' })
  @Get('ledger/stats')
  getLedgerStats() {
    return this.adminService.getLedgerStats();
  }

  // ── Withdrawal requests ─────────────────────────────────────────────────────

  @ApiOperation({ summary: 'Get all withdrawal requests' })
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

  @ApiOperation({ summary: 'Get withdrawal aggregate stats' })
  @Get('withdrawals/stats')
  getWithdrawalStats() {
    return this.adminService.getWithdrawalStats();
  }

  @ApiOperation({ summary: 'Process a withdrawal via Anchor' })
  @Post('withdrawals/:id/process')
  @HttpCode(HttpStatus.OK)
  processWithdrawal(
    @Param('id') id: string,
    @CurrentUser() admin: { id: string },
  ) {
    return this.adminService.processWithdrawalViaAnchor(id, admin.id);
  }

  @ApiOperation({ summary: 'Mark a withdrawal as done (manual)' })
  @Post('withdrawals/:id/mark-done')
  @HttpCode(HttpStatus.OK)
  markWithdrawalDone(
    @Param('id') id: string,
    @CurrentUser() admin: { id: string },
  ) {
    return this.adminService.markWithdrawalDone(id, admin.id);
  }

  @ApiOperation({ summary: 'Reject a withdrawal request' })
  @ApiBody({ schema: { type: 'object', required: ['reason'], properties: { reason: { type: 'string' } } } })
  @Post('withdrawals/:id/reject')
  @HttpCode(HttpStatus.OK)
  rejectWithdrawal(
    @Param('id') id: string,
    @CurrentUser() admin: { id: string },
    @Body('reason') reason: string,
  ) {
    return this.adminService.rejectWithdrawal(id, admin.id, reason);
  }

  @ApiOperation({ summary: "Override a user's saved bank account" })
  @ApiBody({ schema: { type: 'object', required: ['accountNumber', 'bankCode', 'bankName'], properties: { accountNumber: { type: 'string', example: '0123456789' }, bankCode: { type: 'string', example: '058' }, bankName: { type: 'string', example: 'GTBank' } } } })
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

  @ApiOperation({ summary: 'Export ledger entries as CSV' })
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
