import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from 'src/prisma/prisma.service';
import * as bcrypt from 'bcryptjs';

export interface TokenPayload {
  sub: string;
  email: string;
  role: string;
  adminPosition?: string; // SUPER_ADMIN | ADMIN | MODERATOR — only set for ADMIN role users
}

export interface TokenResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

@Injectable()
export class TokenService {
  private readonly ACCESS_TOKEN_EXPIRY = '15m';
  private readonly REFRESH_TOKEN_EXPIRY = '7d';
  private readonly ACCESS_TOKEN_EXPIRY_MS = 15 * 60 * 1000; // 15 minutes

  constructor(
    private jwtService: JwtService,
    private prisma: PrismaService,
  ) {}

  async generateTokens(user: {
    id: string;
    email: string;
    role: string;
  }): Promise<TokenResponse> {
    // Look up admin position if this is an admin user
    let adminPosition: string | undefined;
    if (user.role === 'ADMIN') {
      const adminRecord = await this.prisma.admin.findFirst({
        where: { userId: user.id },
        select: { position: true },
      });
      adminPosition = adminRecord?.position ?? undefined;
    }

    const payload: TokenPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      ...(adminPosition ? { adminPosition } : {}),
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: process.env.JWT_ACCESS_SECRET,
        expiresIn: this.ACCESS_TOKEN_EXPIRY,
      }),
      this.jwtService.signAsync(payload, {
        secret: process.env.JWT_REFRESH_SECRET,
        expiresIn: this.REFRESH_TOKEN_EXPIRY,
      }),
    ]);

    // Hash and store refresh token in database
    const hashedRefreshToken = await bcrypt.hash(refreshToken, 10);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { refreshToken: hashedRefreshToken },
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: this.ACCESS_TOKEN_EXPIRY_MS,
    };
  }

  async refreshTokens(refreshToken: string): Promise<TokenResponse> {
    try {
      const payload = await this.jwtService.verifyAsync<TokenPayload>(
        refreshToken,
        { secret: process.env.JWT_REFRESH_SECRET },
      );

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
      });

      if (!user || !user.refreshToken) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      // Verify the refresh token matches stored hash
      const isValid = await bcrypt.compare(refreshToken, user.refreshToken);
      if (!isValid) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      // Generate new tokens (token rotation for security)
      return this.generateTokens({
        id: user.id,
        email: user.email,
        role: user.role,
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  async revokeRefreshToken(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshToken: null },
    });
  }

  async validateAccessToken(token: string): Promise<TokenPayload> {
    try {
      return await this.jwtService.verifyAsync<TokenPayload>(token, {
        secret: process.env.JWT_ACCESS_SECRET,
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }
  }
}
