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
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { CurrentUser } from 'src/decorators/current-user.decorator';
import { WalletService } from './wallet.service';

@UseGuards(JwtAuthGuard)
@Controller('wallet')
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  // ── Wallet info ────────────────────────────────────────────────────────────

  @Get()
  getWallet(@CurrentUser() user: { id: string }) {
    return this.walletService.getWallet(user.id);
  }

  @Get('pending-escrows')
  getPendingEscrows(@CurrentUser() user: { id: string }) {
    return this.walletService.getPendingEscrows(user.id);
  }

  @Get('transactions')
  getTransactions(
    @CurrentUser() user: { id: string },
    @Query('limit') limit?: string,
  ) {
    return this.walletService.getTransactions(user.id, limit ? parseInt(limit) : 30);
  }

  // ── KYC ───────────────────────────────────────────────────────────────────

  @Post('kyc')
  @HttpCode(HttpStatus.OK)
  submitKyc(
    @CurrentUser() user: { id: string },
    @Body() body: { bvn: string; dateOfBirth: string; gender: 'Male' | 'Female' | 'MALE' | 'FEMALE' },
  ) {
    // Normalize to Anchor-expected casing
    const gender = (body.gender === 'MALE' ? 'Male' : body.gender === 'FEMALE' ? 'Female' : body.gender) as 'Male' | 'Female';
    return this.walletService.submitKyc(
      user.id,
      body.bvn,
      body.dateOfBirth,
      gender,
    );
  }

  // ── Transaction PIN ────────────────────────────────────────────────────────

  @Post('set-pin')
  @HttpCode(HttpStatus.OK)
  setPin(
    @CurrentUser() user: { id: string },
    @Body() body: { pin: string; confirmPin: string },
  ) {
    return this.walletService.setTransactionPin(user.id, body.pin, body.confirmPin);
  }

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

  @Post('pay/rent/:rentalPaymentId')
  @HttpCode(HttpStatus.OK)
  payRent(
    @CurrentUser() user: { id: string },
    @Param('rentalPaymentId') rentalPaymentId: string,
    @Body() body: { pin: string },
  ) {
    return this.walletService.payRentFromWallet(user.id, rentalPaymentId, body.pin);
  }

  @Post('pay/booking/:bookingId')
  @HttpCode(HttpStatus.OK)
  payBooking(
    @CurrentUser() user: { id: string },
    @Param('bookingId') bookingId: string,
    @Body() body: { pin: string },
  ) {
    return this.walletService.payBookingFromWallet(user.id, bookingId, body.pin);
  }

  // ── Withdrawal ─────────────────────────────────────────────────────────────

  @Post('verify-bank')
  @HttpCode(HttpStatus.OK)
  verifyBank(@Body() body: { accountNumber: string; bankCode: string }) {
    return this.walletService.verifyBankAccount(body.accountNumber, body.bankCode);
  }

  @Post('withdraw')
  @HttpCode(HttpStatus.OK)
  withdraw(
    @CurrentUser() user: { id: string },
    @Body()
    body: {
      amount: number;
      bankAccountNumber: string;
      bankCode: string;
      bankAccountName: string;
      pin: string;
    },
  ) {
    return this.walletService.requestWithdrawal(
      user.id,
      body.amount,
      body.bankAccountNumber,
      body.bankCode,
      body.bankAccountName,
      body.pin,
    );
  }
}
