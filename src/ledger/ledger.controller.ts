import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { LedgerService, LedgerAccountType } from './ledger.service';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';

@Controller('ledger')
@UseGuards(JwtAuthGuard)
export class LedgerController {
  constructor(private readonly ledger: LedgerService) {}

  @Get('entries')
  async getEntries(
    @Req() req: any,
    @Query('accountType') accountType?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const userId: string = req.user.id;
    const entries = await this.ledger.getEntries(userId, {
      accountType: accountType as LedgerAccountType | undefined,
      limit: limit ? parseInt(limit, 10) : 50,
      offset: offset ? parseInt(offset, 10) : 0,
    });
    const total = await this.ledger.getEntryCount(userId, accountType as LedgerAccountType | undefined);
    return { entries, total };
  }

  @Get('balance')
  async getBalance(
    @Req() req: any,
    @Query('accountType') accountType: string = 'WALLET',
  ) {
    const userId: string = req.user.id;
    const balance = await this.ledger.computeBalance(userId, accountType as LedgerAccountType);
    return { userId, accountType, ledgerBalance: balance };
  }
}
