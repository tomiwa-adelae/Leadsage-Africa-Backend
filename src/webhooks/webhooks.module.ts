import { Module } from '@nestjs/common';
import { WebhooksController } from './webhooks.controller';
import { PrismaService } from 'src/prisma/prisma.service';
import { PaystackService } from 'src/paystack/paystack.service';
import { WalletModule } from 'src/wallet/wallet.module';
import { SavingsModule } from 'src/savings/savings.module';

@Module({
  imports: [WalletModule, SavingsModule],
  controllers: [WebhooksController],
  providers: [PrismaService, PaystackService],
})
export class WebhooksModule {}
