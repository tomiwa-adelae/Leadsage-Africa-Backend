import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaService } from 'src/prisma/prisma.service';
import { MailService } from 'src/mail/mail.service';
import { BookingExpiryService } from './booking-expiry.service';

@Module({
  imports: [ScheduleModule.forRoot()],
  providers: [BookingExpiryService, PrismaService, MailService],
})
export class TasksModule {}
