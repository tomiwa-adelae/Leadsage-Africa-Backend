import { Module } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { AnchorService } from 'src/anchor/anchor.service';
import { PaystackService } from 'src/paystack/paystack.service';
import { LedgerModule } from 'src/ledger/ledger.module';
import { WalletService } from './wallet.service';
import { WalletController } from './wallet.controller';

@Module({
  imports: [LedgerModule],
  controllers: [WalletController],
  providers: [WalletService, PrismaService, AnchorService, PaystackService],
  exports: [WalletService],
})
export class WalletModule {}
