import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { TokenService } from './token.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { LocalStrategy } from './strategies/local.strategies';
import { JwtStrategy } from './strategies/jwt.strategy';
import { WalletModule } from 'src/wallet/wallet.module';

@Module({
  imports: [JwtModule.register({}), WalletModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    TokenService,
    JwtAuthGuard,
    LocalStrategy,
    JwtStrategy,
  ],
  exports: [TokenService, JwtAuthGuard],
})
export class AuthModule {}
