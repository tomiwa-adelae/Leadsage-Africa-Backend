import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaService } from 'src/prisma/prisma.service';
import { MailService } from 'src/mail/mail.service';
import { AnchorService } from 'src/anchor/anchor.service';
import { PaystackService } from 'src/paystack/paystack.service';
import { WalletService } from 'src/wallet/wallet.service';
import { SavingsService } from 'src/savings/savings.service';
import { BookingExpiryService } from './booking-expiry.service';
import { EscrowReleaseService } from './escrow-release.service';
import { SavingsCronService } from './savings-cron.service';

@Module({
  imports: [ScheduleModule.forRoot()],
  providers: [
    BookingExpiryService,
    EscrowReleaseService,
    SavingsCronService,
    PrismaService,
    MailService,
    AnchorService,
    PaystackService,
    WalletService,
    SavingsService,
  ],
})
export class TasksModule {}
