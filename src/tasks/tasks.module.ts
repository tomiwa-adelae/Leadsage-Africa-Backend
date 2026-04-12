import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaService } from 'src/prisma/prisma.service';
import { MailService } from 'src/mail/mail.service';
import { AnchorService } from 'src/anchor/anchor.service';
import { WalletService } from 'src/wallet/wallet.service';
import { BookingExpiryService } from './booking-expiry.service';
import { EscrowReleaseService } from './escrow-release.service';

@Module({
  imports: [ScheduleModule.forRoot()],
  providers: [
    BookingExpiryService,
    EscrowReleaseService,
    PrismaService,
    MailService,
    AnchorService,
    WalletService,
  ],
})
export class TasksModule {}
