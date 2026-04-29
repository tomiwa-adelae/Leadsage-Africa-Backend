import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiBody } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { CurrentUser } from 'src/decorators/current-user.decorator';
import { WalletService } from './wallet.service';

@ApiTags('wallet')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('wallet')
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  // ── Wallet info ────────────────────────────────────────────────────────────

  @ApiOperation({ summary: 'Get wallet balance and details' })
  @Get()
  getWallet(@CurrentUser() user: { id: string }) {
    return this.walletService.getWallet(user.id);
  }

  @ApiOperation({ summary: 'Get pending escrow holds' })
  @Get('pending-escrows')
  getPendingEscrows(@CurrentUser() user: { id: string }) {
    return this.walletService.getPendingEscrows(user.id);
  }

  @ApiOperation({ summary: 'Get paginated wallet transactions' })
  @Get('transactions')
  getTransactions(
    @CurrentUser() user: { id: string },
    @Query('limit') limit?: string,
    @Query('page') page?: string,
  ) {
    return this.walletService.getTransactions(
      user.id,
      limit ? parseInt(limit) : 30,
      page ? parseInt(page) : 1,
    );
  }

  // ── KYC ───────────────────────────────────────────────────────────────────

  @ApiOperation({ summary: 'Submit BVN for KYC verification' })
  @ApiBody({ schema: { type: 'object', required: ['bvn', 'dateOfBirth', 'gender'], properties: { bvn: { type: 'string', example: '22222222222' }, dateOfBirth: { type: 'string', example: '1990-01-01' }, gender: { type: 'string', enum: ['Male', 'Female'] } } } })
  @Post('kyc')
  @HttpCode(HttpStatus.OK)
  submitKyc(
    @CurrentUser() user: { id: string },
    @Body() body: { bvn: string; dateOfBirth: string; gender: 'Male' | 'Female' | 'MALE' | 'FEMALE' },
  ) {
    const gender = (body.gender === 'MALE' ? 'Male' : body.gender === 'FEMALE' ? 'Female' : body.gender) as 'Male' | 'Female';
    return this.walletService.submitKyc(
      user.id,
      body.bvn,
      body.dateOfBirth,
      gender,
    );
  }

  @ApiOperation({ summary: 'Sync KYC status from Anchor' })
  @Post('kyc/sync')
  @HttpCode(HttpStatus.OK)
  syncKyc(@CurrentUser() user: { id: string }) {
    return this.walletService.syncKyc(user.id);
  }

  @ApiOperation({ summary: 'Sync wallet balance from Anchor' })
  @Post('sync')
  @HttpCode(HttpStatus.OK)
  syncFromAnchor(@CurrentUser() user: { id: string }) {
    return this.walletService.syncFromAnchor(user.id);
  }

  @ApiOperation({ summary: 'Initialize a card top-up via Paystack' })
  @ApiBody({ schema: { type: 'object', required: ['amount'], properties: { amount: { type: 'number', example: 5000 } } } })
  @Post('topup/card')
  @HttpCode(HttpStatus.OK)
  initCardTopup(
    @CurrentUser() user: { id: string },
    @Body('amount') amount: number,
  ) {
    return this.walletService.initializeCardTopup(user.id, amount);
  }

  @ApiOperation({ summary: 'Verify a card top-up by Paystack reference' })
  @ApiBody({ schema: { type: 'object', required: ['reference'], properties: { reference: { type: 'string', example: 'trx_abc123' } } } })
  @Post('topup/card/verify')
  @HttpCode(HttpStatus.OK)
  verifyCardTopup(
    @CurrentUser() user: { id: string },
    @Body('reference') reference: string,
  ) {
    return this.walletService.verifyCardTopup(user.id, reference);
  }

  // ── Transaction PIN ────────────────────────────────────────────────────────

  @ApiOperation({ summary: 'Set a transaction PIN' })
  @ApiBody({ schema: { type: 'object', required: ['pin', 'confirmPin'], properties: { pin: { type: 'string', example: '1234' }, confirmPin: { type: 'string', example: '1234' } } } })
  @Post('set-pin')
  @HttpCode(HttpStatus.OK)
  setPin(
    @CurrentUser() user: { id: string },
    @Body() body: { pin: string; confirmPin: string },
  ) {
    return this.walletService.setTransactionPin(user.id, body.pin, body.confirmPin);
  }

  @ApiOperation({ summary: 'Change the transaction PIN' })
  @ApiBody({ schema: { type: 'object', required: ['currentPin', 'newPin', 'confirmPin'], properties: { currentPin: { type: 'string', example: '1234' }, newPin: { type: 'string', example: '5678' }, confirmPin: { type: 'string', example: '5678' } } } })
  @Post('change-pin')
  @HttpCode(HttpStatus.OK)
  changePin(
    @CurrentUser() user: { id: string },
    @Body() body: { currentPin: string; newPin: string; confirmPin: string },
  ) {
    return this.walletService.changeTransactionPin(
      user.id,
      body.currentPin,
      body.newPin,
      body.confirmPin,
    );
  }

  // ── Payments from wallet ───────────────────────────────────────────────────

  @ApiOperation({ summary: 'Pay rent from wallet balance' })
  @ApiBody({ schema: { type: 'object', required: ['pin'], properties: { pin: { type: 'string', example: '1234' } } } })
  @Post('pay/rent/:rentalPaymentId')
  @HttpCode(HttpStatus.OK)
  payRent(
    @CurrentUser() user: { id: string },
    @Param('rentalPaymentId') rentalPaymentId: string,
    @Body() body: { pin: string },
  ) {
    return this.walletService.payRentFromWallet(user.id, rentalPaymentId, body.pin);
  }

  @ApiOperation({ summary: 'Pay a booking from wallet balance' })
  @ApiBody({ schema: { type: 'object', required: ['pin'], properties: { pin: { type: 'string', example: '1234' } } } })
  @Post('pay/booking/:bookingId')
  @HttpCode(HttpStatus.OK)
  payBooking(
    @CurrentUser() user: { id: string },
    @Param('bookingId') bookingId: string,
    @Body() body: { pin: string },
  ) {
    return this.walletService.payBookingFromWallet(user.id, bookingId, body.pin);
  }

  // ── Bank account ──────────────────────────────────────────────────────────

  @ApiOperation({ summary: 'Get the saved bank account for withdrawals' })
  @Get('bank-account')
  getBankAccount(@CurrentUser() user: { id: string }) {
    return this.walletService.getBankAccount(user.id);
  }

  @ApiOperation({ summary: 'Verify a bank account number via Paystack' })
  @ApiBody({ schema: { type: 'object', required: ['accountNumber', 'bankCode'], properties: { accountNumber: { type: 'string', example: '0123456789' }, bankCode: { type: 'string', example: '058' } } } })
  @Post('verify-bank')
  @HttpCode(HttpStatus.OK)
  verifyBank(@Body() body: { accountNumber: string; bankCode: string }) {
    return this.walletService.verifyBankAccount(body.accountNumber, body.bankCode);
  }

  @ApiOperation({ summary: 'Save a bank account for withdrawals' })
  @ApiBody({ schema: { type: 'object', required: ['accountNumber', 'bankCode', 'bankName', 'pin'], properties: { accountNumber: { type: 'string', example: '0123456789' }, bankCode: { type: 'string', example: '058' }, bankName: { type: 'string', example: 'GTBank' }, pin: { type: 'string', example: '1234' } } } })
  @Post('bank-account')
  @HttpCode(HttpStatus.OK)
  saveBankAccount(
    @CurrentUser() user: { id: string },
    @Body() body: { accountNumber: string; bankCode: string; bankName: string; pin: string },
  ) {
    return this.walletService.saveBankAccount(
      user.id,
      body.accountNumber,
      body.bankCode,
      body.bankName,
      body.pin,
    );
  }

  // ── Withdrawal requests ────────────────────────────────────────────────────

  @ApiOperation({ summary: 'Get withdrawal requests for the current user' })
  @Get('withdraw/requests')
  getWithdrawalRequests(@CurrentUser() user: { id: string }) {
    return this.walletService.getWithdrawalRequests(user.id);
  }

  @ApiOperation({ summary: 'Request a withdrawal to the saved bank account' })
  @ApiBody({ schema: { type: 'object', required: ['amount', 'pin'], properties: { amount: { type: 'number', example: 10000 }, pin: { type: 'string', example: '1234' } } } })
  @Post('withdraw/request')
  @HttpCode(HttpStatus.OK)
  requestWithdrawal(
    @CurrentUser() user: { id: string },
    @Body() body: { amount: number; pin: string },
  ) {
    return this.walletService.requestWithdrawal(user.id, body.amount, body.pin);
  }

  @ApiOperation({ summary: 'Cancel a pending withdrawal request' })
  @Post('withdraw/:id/cancel')
  @HttpCode(HttpStatus.OK)
  cancelWithdrawal(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
  ) {
    return this.walletService.cancelWithdrawal(user.id, id);
  }
}
