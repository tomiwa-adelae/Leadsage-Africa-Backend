import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { PrismaModule } from './prisma/prisma.module';
import { MailModule } from './mail/mail.module';
import { ListingsModule } from './listings/listings.module';
import { AdminModule } from './admin/admin.module';
import { UserModule } from './user/user.module';
import { LandlordModule } from './landlord/landlord.module';
import { PaystackModule } from './paystack/paystack.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { TasksModule } from './tasks/tasks.module';

@Module({
  imports: [
    PrismaModule,
    MailModule,
    PaystackModule,
    AuthModule,
    ListingsModule,
    AdminModule,
    UserModule,
    LandlordModule,
    WebhooksModule,
    TasksModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
