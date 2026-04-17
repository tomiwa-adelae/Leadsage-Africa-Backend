import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { CurrentUser } from 'src/decorators/current-user.decorator';
import { CreateSavingsDto } from './dto/create-savings.dto';
import { UpdateSavingsDto } from './dto/update-savings.dto';
import { SavingsService } from './savings.service';

@UseGuards(JwtAuthGuard)
@Controller('savings')
export class SavingsController {
  constructor(private readonly savingsService: SavingsService) {}

  // ── Plans ──────────────────────────────────────────────────────────────────

  @Get()
  getMyPlans(@CurrentUser() user: { id: string }) {
    return this.savingsService.getMyPlans(user.id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  createPlan(
    @CurrentUser() user: { id: string },
    @Body() dto: CreateSavingsDto,
  ) {
    return this.savingsService.createPlan(user.id, dto);
  }

  @Get(':id')
  getPlanById(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
  ) {
    return this.savingsService.getPlanById(user.id, id);
  }

  @Get(':id/transactions')
  getTransactions(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.savingsService.getTransactions(user.id, id, +page, +limit);
  }

  @Patch(':id')
  updateSettings(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Body() dto: UpdateSavingsDto,
  ) {
    return this.savingsService.updateSettings(user.id, id, dto);
  }

  // ── Actions ────────────────────────────────────────────────────────────────

  @Post(':id/deposit')
  @HttpCode(HttpStatus.OK)
  deposit(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Body('amount') amount: number,
  ) {
    return this.savingsService.depositFromWallet(user.id, id, amount);
  }

  @Post(':id/deposit/card')
  @HttpCode(HttpStatus.OK)
  initializeCardDeposit(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Body('amount') amount: number,
  ) {
    return this.savingsService.initializeCardDeposit(user.id, id, amount);
  }

  @Post(':id/deposit/card/verify')
  @HttpCode(HttpStatus.OK)
  verifyCardDeposit(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Body('reference') reference: string,
  ) {
    return this.savingsService.verifyCardDeposit(user.id, id, reference);
  }

  @Post(':id/withdraw')
  @HttpCode(HttpStatus.OK)
  withdraw(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
  ) {
    return this.savingsService.withdraw(user.id, id);
  }

  @Post(':id/provision-account')
  @HttpCode(HttpStatus.OK)
  provisionAccount(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
  ) {
    return this.savingsService.provisionAccount(user.id, id);
  }

  @Post(':id/pause')
  @HttpCode(HttpStatus.OK)
  pause(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
  ) {
    return this.savingsService.pause(user.id, id);
  }

  @Post(':id/resume')
  @HttpCode(HttpStatus.OK)
  resume(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
  ) {
    return this.savingsService.resume(user.id, id);
  }
}
