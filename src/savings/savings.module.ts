import { Module } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { AnchorService } from 'src/anchor/anchor.service';
import { PaystackService } from 'src/paystack/paystack.service';
import { WalletModule } from 'src/wallet/wallet.module';
import { LedgerModule } from 'src/ledger/ledger.module';
import { SavingsService } from './savings.service';
import { SavingsController } from './savings.controller';

@Module({
  imports: [WalletModule, LedgerModule],
  controllers: [SavingsController],
  providers: [SavingsService, PrismaService, AnchorService, PaystackService],
  exports: [SavingsService],
})
export class SavingsModule {}
