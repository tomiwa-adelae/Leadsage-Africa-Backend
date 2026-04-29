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
import { ApiTags, ApiBearerAuth, ApiOperation, ApiBody } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { CurrentUser } from 'src/decorators/current-user.decorator';
import { CreateSavingsDto } from './dto/create-savings.dto';
import { UpdateSavingsDto } from './dto/update-savings.dto';
import { SavingsService } from './savings.service';

@ApiTags('savings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('savings')
export class SavingsController {
  constructor(private readonly savingsService: SavingsService) {}

  // ── Plans ──────────────────────────────────────────────────────────────────

  @ApiOperation({ summary: 'Get all savings plans for the current user' })
  @Get()
  getMyPlans(@CurrentUser() user: { id: string }) {
    return this.savingsService.getMyPlans(user.id);
  }

  @ApiOperation({ summary: 'Create a new savings plan' })
  @ApiBody({ type: CreateSavingsDto })
  @Post()
  @HttpCode(HttpStatus.CREATED)
  createPlan(
    @CurrentUser() user: { id: string },
    @Body() dto: CreateSavingsDto,
  ) {
    return this.savingsService.createPlan(user.id, dto);
  }

  @ApiOperation({ summary: 'Get a savings plan by ID' })
  @Get(':id')
  getPlanById(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
  ) {
    return this.savingsService.getPlanById(user.id, id);
  }

  @ApiOperation({ summary: 'Get transactions for a savings plan' })
  @Get(':id/transactions')
  getTransactions(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.savingsService.getTransactions(user.id, id, +page, +limit);
  }

  @ApiOperation({ summary: 'Update savings plan settings' })
  @ApiBody({ type: UpdateSavingsDto })
  @Patch(':id')
  updateSettings(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Body() dto: UpdateSavingsDto,
  ) {
    return this.savingsService.updateSettings(user.id, id, dto);
  }

  // ── Actions ────────────────────────────────────────────────────────────────

  @ApiOperation({ summary: 'Deposit into a savings plan from wallet balance' })
  @ApiBody({ schema: { type: 'object', required: ['amount'], properties: { amount: { type: 'number', example: 5000 } } } })
  @Post(':id/deposit')
  @HttpCode(HttpStatus.OK)
  deposit(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Body('amount') amount: number,
  ) {
    return this.savingsService.depositFromWallet(user.id, id, amount);
  }

  @ApiOperation({ summary: 'Initialize a card deposit into a savings plan' })
  @ApiBody({ schema: { type: 'object', required: ['amount'], properties: { amount: { type: 'number', example: 5000 } } } })
  @Post(':id/deposit/card')
  @HttpCode(HttpStatus.OK)
  initializeCardDeposit(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Body('amount') amount: number,
  ) {
    return this.savingsService.initializeCardDeposit(user.id, id, amount);
  }

  @ApiOperation({ summary: 'Verify a card deposit into a savings plan' })
  @ApiBody({ schema: { type: 'object', required: ['reference'], properties: { reference: { type: 'string', example: 'trx_abc123' } } } })
  @Post(':id/deposit/card/verify')
  @HttpCode(HttpStatus.OK)
  verifyCardDeposit(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Body('reference') reference: string,
  ) {
    return this.savingsService.verifyCardDeposit(user.id, id, reference);
  }

  @ApiOperation({ summary: 'Withdraw from a matured savings plan to wallet' })
  @Post(':id/withdraw')
  @HttpCode(HttpStatus.OK)
  withdraw(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
  ) {
    return this.savingsService.withdraw(user.id, id);
  }

  @ApiOperation({ summary: 'Sync savings plan balance from Anchor' })
  @Post(':id/sync')
  @HttpCode(HttpStatus.OK)
  syncFromAnchor(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
  ) {
    return this.savingsService.syncFromAnchor(user.id, id);
  }

  @ApiOperation({ summary: 'Provision a virtual account for a savings plan' })
  @Post(':id/provision-account')
  @HttpCode(HttpStatus.OK)
  provisionAccount(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
  ) {
    return this.savingsService.provisionAccount(user.id, id);
  }

  @ApiOperation({ summary: 'Pause a savings plan' })
  @Post(':id/pause')
  @HttpCode(HttpStatus.OK)
  pause(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
  ) {
    return this.savingsService.pause(user.id, id);
  }

  @ApiOperation({ summary: 'Resume a paused savings plan' })
  @Post(':id/resume')
  @HttpCode(HttpStatus.OK)
  resume(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
  ) {
    return this.savingsService.resume(user.id, id);
  }
}
