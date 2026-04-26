import { Module } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { AnchorService } from 'src/anchor/anchor.service';
import { PaystackService } from 'src/paystack/paystack.service';
import { WalletService } from './wallet.service';
import { WalletController } from './wallet.controller';

@Module({
  controllers: [WalletController],
  providers: [WalletService, PrismaService, AnchorService, PaystackService],
  exports: [WalletService],
})
export class WalletModule {}
