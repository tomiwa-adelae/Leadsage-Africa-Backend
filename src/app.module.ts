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
import { AnchorModule } from './anchor/anchor.module';
import { WalletModule } from './wallet/wallet.module';
import { SavingsModule } from './savings/savings.module';
import { UploadModule } from './upload/upload.module';
import { EncryptionModule } from './encryption/encryption.module';
import { BlogModule } from './blog/blog.module';
import { LedgerModule } from './ledger/ledger.module';

@Module({
  imports: [
    EncryptionModule,
    PrismaModule,
    MailModule,
    PaystackModule,
    AnchorModule,
    WalletModule,
    SavingsModule,
    AuthModule,
    ListingsModule,
    AdminModule,
    UserModule,
    LandlordModule,
    WebhooksModule,
    TasksModule,
    UploadModule,
    BlogModule,
    LedgerModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
