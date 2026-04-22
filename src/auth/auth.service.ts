import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { JwtService } from '@nestjs/jwt';
import { plainToClass } from 'class-transformer';
import slugify from 'slugify';
import { OAuth2Client } from 'google-auth-library';
import { UserResponseDto } from './dto/user-response.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { WalletService } from 'src/wallet/wallet.service';
import { EncryptionService } from 'src/encryption/encryption.service';
import { notDeleted } from 'src/utils/prismaFilters';
import { RegisterUserDto } from './dto/register-user.dto';
import { WelcomeEmail } from 'emails/welcome-email';
import { ForgotPasswordEmail } from 'emails/forgot-password-email';
import { VerifyEmailEmail } from 'emails/verify-email';
import { MailService } from 'src/mail/mail.service';
import { OnboardingDto } from './dto/onboarding.dto';

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  user: UserResponseDto;
  requiresTwoFactor?: boolean;
  tempToken?: string;
}

export interface JwtPayload {
  sub: string;
  email: string;
  isTwoFactorAuthenticated?: boolean;
}

// 30-day sessions: users stay logged in for 30 days of inactivity.
// Every refresh rotates the token, so active users never expire.
const SESSION_DURATION = '30d';
const SESSION_MS = 30 * 24 * 60 * 60 * 1000;

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private mail: MailService,
    private wallet: WalletService,
    private encryption: EncryptionService,
  ) {}

  getAcronym(name?: string) {
    if (!name) return 'EMS';
    const words = name.trim().split(/\s+/);
    return words
      .slice(0, 3)
      .map((word) => word[0]?.toUpperCase())
      .join('');
  }

  generatePrefix(length = 4): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  getCookieOptions() {
    const isProd = process.env.NODE_ENV === 'production';
    return {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? ('none' as const) : ('lax' as const),
      path: '/',
    };
  }

  // Access tokens are short-lived (15 min) — the axios interceptor refreshes
  // them silently so the user never notices.
  generateAccessToken(payload: JwtPayload): string {
    return this.jwtService.sign(payload, {
      secret: process.env.JWT_SECRET, // validated by JwtStrategy
      expiresIn: '15m',
    });
  }

  // Refresh tokens are long-lived (30 days) and rotated on every use.
  generateRefreshToken(payload: JwtPayload): string {
    return this.jwtService.sign(payload, {
      secret: process.env.JWT_REFRESH_SECRET,
      expiresIn: SESSION_DURATION,
    });
  }

  async hashRefreshToken(refreshToken: string): Promise<string> {
    return bcrypt.hash(refreshToken, 10);
  }

  async validateUser(email: string, password: string): Promise<any> {
    const user = await this.prisma.user.findUnique({
      where: { email, ...notDeleted() },
    });

    if (!user) return null;
    if (!user.password)
      throw new UnauthorizedException(
        'This account uses google sign-in. Please use "Continue with Google" button',
      );

    if (!(await bcrypt.compare(password, user.password))) return null;

    if (user.accountStatus === 'BANNED') {
      throw new UnauthorizedException(
        'Your account has been permanently banned. Please contact support.',
      );
    }
    if (user.accountStatus === 'SUSPENDED') {
      throw new UnauthorizedException(
        'Your account has been temporarily suspended. Please contact support.',
      );
    }

    const { password: _pw, refreshToken: _rt, ...result } = user;
    return result;
  }

  async login(user: any) {
    const payload: JwtPayload = {
      email: user.email,
      sub: user.id,
      isTwoFactorAuthenticated: false,
    };

    const accessToken = this.generateAccessToken(payload);
    const refreshToken = this.generateRefreshToken(payload);

    // Store plain-text refresh token — refreshTokens() does a direct string
    // comparison (consistent with existing records in the DB).
    const updatedUser = await this.prisma.user.update({
      where: { id: user.id },
      data: { refreshToken },
    });

    const adminRecord =
      user.role === 'ADMIN'
        ? await this.prisma.admin.findFirst({
            where: { userId: user.id },
            select: { position: true },
          })
        : null;

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      user: plainToClass(
        UserResponseDto,
        { ...updatedUser, adminPosition: adminRecord?.position ?? null },
        { excludeExtraneousValues: true },
      ),
    };
  }

  async register(registerUserDto: RegisterUserDto) {
    if (registerUserDto.password !== registerUserDto.confirmPassword)
      throw new ConflictException('Password do not match');

    const existingUser = await this.prisma.user.findUnique({
      where: { email: registerUserDto.email },
    });

    if (existingUser) throw new ConflictException('User already exists');

    const hashedPassword = await bcrypt.hash(registerUserDto.password, 10);

    let baseUsername = slugify(
      `${registerUserDto.firstName} ${registerUserDto.lastName}`,
    );
    let username = baseUsername;
    let counter = 1;

    while (await this.prisma.user.findUnique({ where: { username } })) {
      username = `${baseUsername}-${counter}`;
      counter++;
    }

    const role = registerUserDto.role === 'landlord' ? 'LANDLORD' : 'CLIENT';

    const user = await this.prisma.user.create({
      data: {
        firstName: registerUserDto.firstName,
        lastName: registerUserDto.lastName,
        email: registerUserDto.email,
        phoneNumber: registerUserDto.phoneNumber,
        password: hashedPassword,
        username,
        role,
      },
    });

    // Provision wallet (locked until KYC)
    await this.wallet.provisionWallet(user.id).catch(() => {});

    // Send email verification OTP
    await this.sendEmailVerificationOTP(user.email, user.firstName ?? '');

    return { email: user.email, message: `Account created! Check your email for a verification code.` };
  }

  async sendEmailVerificationOTP(email: string, firstName?: string) {
    const user = await this.prisma.user.findUnique({
      where: { email, ...notDeleted() },
    });

    if (!user) throw new NotFoundException('No account with that email');
    if (user.emailVerified)
      throw new BadRequestException('Email is already verified');

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiry = new Date(Date.now() + 10 * 60 * 1000);
    const hashedOTP = await bcrypt.hash(otp, 10);

    await this.prisma.user.update({
      where: { email },
      data: {
        emailVerificationOTP: hashedOTP,
        emailVerificationOTPExpiry: expiry,
      },
    });

    await this.mail.sendMail({
      toEmail: email,
      toName: firstName ?? user.firstName ?? '',
      subject: `Your Leadsage verification code`,
      html: VerifyEmailEmail({
        firstName: firstName ?? user.firstName ?? '',
        otp,
      }),
    });

    return { message: 'Verification code sent to your email' };
  }

  async verifyEmailOTP(email: string, otp: string, res: any) {
    const user = await this.prisma.user.findUnique({
      where: { email, ...notDeleted() },
    });

    if (!user) throw new NotFoundException('No account with that email');
    if (user.emailVerified)
      throw new BadRequestException('Email is already verified');
    if (!user.emailVerificationOTP)
      throw new UnauthorizedException('Invalid or expired code');
    if (user.emailVerificationOTPExpiry! < new Date())
      throw new UnauthorizedException('Verification code has expired');

    const isValid = await bcrypt.compare(otp, user.emailVerificationOTP);
    if (!isValid) throw new UnauthorizedException('Invalid verification code');

    const updatedUser = await this.prisma.user.update({
      where: { email },
      data: {
        emailVerified: true,
        emailVerificationOTP: null,
        emailVerificationOTPExpiry: null,
      },
    });

    // Send welcome email now that email is confirmed
    await this.mail.sendMail({
      toEmail: updatedUser.email,
      toName: updatedUser.firstName ?? '',
      subject: `Welcome to Leadsage, ${updatedUser.firstName}!`,
      html: WelcomeEmail({ firstName: updatedUser.firstName ?? '' }),
    });

    const { password, refreshToken, ...safeUser } = updatedUser;
    return this.login(safeUser);
  }

  async registerAdmin(registerUserDto: RegisterUserDto) {
    if (registerUserDto.password !== registerUserDto.confirmPassword)
      throw new ConflictException('Password do not match');

    const existingUser = await this.prisma.user.findUnique({
      where: { email: registerUserDto.email },
    });

    if (existingUser) throw new ConflictException('User already exists');

    const hashedPassword = await bcrypt.hash(registerUserDto.password, 10);

    let baseUsername = slugify(
      `${registerUserDto.firstName} ${registerUserDto.lastName}`,
    );
    let username = baseUsername;
    let counter = 1;

    while (await this.prisma.user.findUnique({ where: { username } })) {
      username = `${baseUsername}-${counter}`;
      counter++;
    }

    const user = await this.prisma.user.create({
      data: {
        firstName: registerUserDto.firstName,
        lastName: registerUserDto.lastName,
        email: registerUserDto.email,
        phoneNumber: registerUserDto.phoneNumber,
        password: hashedPassword,
        username,
        // role: 'CLIENT',
        role: 'ADMIN',
      },
    });

    // Welcome email → new user
    // await this.mail.sendMail({
    //   toEmail: user.email,
    //   toName: user.firstName,
    //   subject: `Welcome to Staxis, ${user.firstName}!`,
    //   html: WelcomeEmail({ firstName: user.firstName }),
    // });

    // // Admin notification → new registration
    // await this.mail.sendAdminMail({
    //   subject: `New Staxis Registration — ${user.firstName} ${user.lastName}`,
    //   html: AdminNewSubscriberEmail({
    //     userFirstName: user.firstName,
    //     userLastName: user.lastName,
    //     userEmail: user.email,
    //     registeredAt: new Date(),
    //   }),
    // });

    const { password, refreshToken, ...result } = user;
    return this.login(result);
  }

  async findUserById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id, ...notDeleted() },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        username: true,
        image: true,
        phoneNumber: true,
        createdAt: true,
        updatedAt: true,
        role: true,
        onboardingCompleted: true,
        admin: { select: { position: true } },
      },
    });

    if (!user) throw new ConflictException('Oops! User not found');

    const { admin, ...rest } = user;
    return { ...rest, adminPosition: admin?.position ?? null };
  }

  async verifyCode(otp: string, email: string) {
    const user = await this.prisma.user.findUnique({
      where: { email, ...notDeleted() },
    });

    if (!user) throw new NotFoundException('No account with that email');
    if (!user.resetOTP)
      throw new UnauthorizedException('Invalid or expired OTP');
    if (user.resetOTPExpiry! < new Date())
      throw new UnauthorizedException('OTP has expired');

    const isValid = await bcrypt.compare(otp, user.resetOTP);
    if (!isValid) throw new UnauthorizedException('Invalid OTP');

    return { message: 'OTP verification successful' };
  }

  async setNewPassword({
    email,
    otp,
    newPassword,
    confirmPassword,
  }: {
    email: string;
    otp: string;
    newPassword: string;
    confirmPassword: string;
  }) {
    if (newPassword !== confirmPassword)
      throw new BadRequestException('Passwords do not match');

    const user = await this.prisma.user.findUnique({
      where: { email, ...notDeleted() },
    });

    if (!user) throw new NotFoundException('No account with that email');
    if (!user.resetOTP)
      throw new UnauthorizedException('Invalid or expired OTP');
    if (user.resetOTPExpiry! < new Date())
      throw new UnauthorizedException('OTP has expired');

    const isValid = await bcrypt.compare(otp, user.resetOTP);
    if (!isValid) throw new UnauthorizedException('Invalid OTP');

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await this.prisma.user.update({
      where: { email },
      data: { password: hashedPassword, resetOTP: null, resetOTPExpiry: null },
    });

    return { message: 'Password reset successfully.' };
  }

  async sendPasswordResetOTP(email: string) {
    const user = await this.prisma.user.findUnique({
      where: { email, ...notDeleted() },
    });

    if (!user) throw new NotFoundException('No account with that email');

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiry = new Date(Date.now() + 10 * 60 * 1000);
    const hashedOTP = await bcrypt.hash(otp, 10);

    await this.prisma.user.update({
      where: { email },
      data: { resetOTP: hashedOTP, resetOTPExpiry: expiry },
    });

    await this.mail.sendMail({
      toEmail: email,
      toName: user.firstName ?? '',
      subject: `Your Leadsage Password Reset Code`,
      html: ForgotPasswordEmail({ firstName: user.firstName ?? '', otp }),
    });

    return { message: 'Password reset OTP sent to your email' };
  }

  // ── Logout ───────────────────────────────────────────────────────────────
  // Verify the JWT to get the user ID directly (O(1), no full-table scan).
  // We allow expired tokens so logout still works after long inactivity.
  async logout(refreshToken: string) {
    try {
      const payload = this.jwtService.verify<JwtPayload>(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET,
        ignoreExpiration: true,
      });

      await this.prisma.user.update({
        where: { id: payload.sub },
        data: { refreshToken: null },
      });
    } catch {
      // Malformed / tampered token — ignore, cookies are cleared by controller
    }

    return { message: 'User logged out' };
  }

  // ── Token refresh ─────────────────────────────────────────────────────────
  // 1. Verify the refresh token JWT (checks signature + expiry)
  // 2. Fetch the user by the ID in the payload — O(1) lookup
  // 3. Confirm the stored DB token matches the incoming one (detects reuse after rotation)
  // 4. Rotate: issue a fresh access token (JWT_SECRET) + refresh token (JWT_REFRESH_SECRET)
  async refreshTokens(refreshToken: string) {
    // Step 1 — validate the JWT itself
    let payload: JwtPayload;
    try {
      payload = this.jwtService.verify<JwtPayload>(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET,
      });
    } catch {
      return null; // expired or tampered
    }

    // Step 2 — load the user by ID embedded in the token
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        onboardingCompleted: true,
        refreshToken: true,
        admin: { select: { position: true } },
      },
    });

    if (!user || !user.refreshToken) {
      return null; // deleted user or already logged out
    }

    // Step 3 — confirm the token matches what we stored (plain-text)
    if (user.refreshToken !== refreshToken) {
      // Possible refresh-token-reuse attack: revoke all tokens for this user
      await this.prisma.user.update({
        where: { id: user.id },
        data: { refreshToken: null },
      });
      return null;
    }

    // Step 4 — rotate tokens
    const newPayload: JwtPayload = { sub: user.id, email: user.email };
    const accessToken = this.generateAccessToken(newPayload); // JWT_SECRET
    const newRefreshToken = this.generateRefreshToken(newPayload); // JWT_REFRESH_SECRET

    await this.prisma.user.update({
      where: { id: user.id },
      data: { refreshToken: newRefreshToken },
    });

    const { refreshToken: _omit, admin, ...safeUser } = user;
    return {
      accessToken,
      newRefreshToken,
      user: { ...safeUser, adminPosition: admin?.position ?? null },
    };
  }

  // Expose session duration in ms so the controller can set consistent cookie maxAge
  getSessionMs(): number {
    return SESSION_MS;
  }

  // ── Onboarding ────────────────────────────────────────────────────────────
  async completeOnboarding(userId: string, dto: OnboardingDto) {
    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: {
        // Personal info
        ...(dto.gender !== undefined && { gender: dto.gender }),
        ...(dto.dob !== undefined && { dob: dto.dob }),
        // Location
        ...(dto.country !== undefined && { country: dto.country }),
        ...(dto.state !== undefined && { state: dto.state }),
        ...(dto.city !== undefined && { city: dto.city }),
        ...(dto.address !== undefined && { address: dto.address }),
        // CLIENT preferences
        ...(dto.preferredPropertyTypes !== undefined && {
          preferredPropertyTypes: dto.preferredPropertyTypes,
        }),
        ...(dto.budgetMin !== undefined && { budgetMin: dto.budgetMin }),
        ...(dto.budgetMax !== undefined && { budgetMax: dto.budgetMax }),
        ...(dto.preferredAreas !== undefined && {
          preferredAreas: dto.preferredAreas,
        }),
        ...(dto.moveInTimeline !== undefined && {
          moveInTimeline: dto.moveInTimeline,
        }),
        // LANDLORD details
        ...(dto.hasExistingProperty !== undefined && {
          hasExistingProperty: dto.hasExistingProperty,
        }),
        ...(dto.propertyCount !== undefined && {
          propertyCount: dto.propertyCount,
        }),
        ...(dto.managedPropertyTypes !== undefined && {
          managedPropertyTypes: dto.managedPropertyTypes,
        }),
        ...(dto.operatingAreas !== undefined && {
          operatingAreas: dto.operatingAreas,
        }),
        ...(dto.nin !== undefined && { nin: this.encryption.encrypt(dto.nin) }),
        ...(dto.ninVerified !== undefined && { ninVerified: dto.ninVerified }),
        onboardingCompleted: true,
      },
    });

    return plainToClass(UserResponseDto, updatedUser, {
      excludeExtraneousValues: true,
    });
  }

  // ── NIN Verification via Prembly ──────────────────────────────────────────
  async verifyNin(
    nin: string,
  ): Promise<{ verified: boolean; message: string }> {
    const apiKey = process.env.PREMBLY_API_KEY;

    if (!apiKey) {
      throw new InternalServerErrorException(
        'NIN verification service is not configured',
      );
    }

    const isSandbox = apiKey.startsWith('test_');
    const baseUrl = isSandbox
      ? 'https://api.prembly.com/identitypass/verification/nin' // sandbox uses same host
      : 'https://api.prembly.com/identitypass/verification/nin';

    let res: Response;
    try {
      res = await fetch(baseUrl, {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ number_nin: nin }),
      });
    } catch {
      throw new InternalServerErrorException(
        'Could not reach NIN verification service',
      );
    }

    const data = (await res.json()) as {
      status: boolean;
      response_code?: string;
      detail?: string;
      error?: string;
      message?: string;
    };

    // Log the full Prembly response for debugging
    console.log('[Prembly NIN]', res.status, JSON.stringify(data));

    const verified = data.status === true && data.response_code === '00';
    return {
      verified,
      message: verified
        ? 'NIN verified successfully'
        : (data.detail ??
          data.error ??
          data.message ??
          'NIN could not be verified'),
    };
  }

  // ── Profile update ───────────────────────────────────────────────────────
  async updateProfile(userId: string, dto: {
    firstName?: string;
    lastName?: string;
    phoneNumber?: string;
    dob?: string;
    gender?: string;
    address?: string;
    city?: string;
    state?: string;
    country?: string;
    bio?: string;
  }) {
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.firstName !== undefined && { firstName: dto.firstName }),
        ...(dto.lastName !== undefined && { lastName: dto.lastName }),
        ...(dto.phoneNumber !== undefined && { phoneNumber: dto.phoneNumber }),
        ...(dto.dob !== undefined && { dob: dto.dob }),
        ...(dto.gender !== undefined && { gender: dto.gender }),
        ...(dto.address !== undefined && { address: dto.address }),
        ...(dto.city !== undefined && { city: dto.city }),
        ...(dto.state !== undefined && { state: dto.state }),
        ...(dto.country !== undefined && { country: dto.country }),
        ...(dto.bio !== undefined && { bio: dto.bio }),
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phoneNumber: true,
        image: true,
        dob: true,
        gender: true,
        address: true,
        city: true,
        state: true,
        country: true,
        bio: true,
        role: true,
        username: true,
        onboardingCompleted: true,
      },
    });
    return updated;
  }

  // ── Change password ───────────────────────────────────────────────────────
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
    confirmPassword: string,
  ) {
    if (newPassword !== confirmPassword)
      throw new BadRequestException('Passwords do not match');

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    if (!user.password)
      throw new BadRequestException(
        'This account uses Google sign-in and does not have a password.',
      );

    const valid = await bcrypt.compare(currentPassword, user.password);
    if (!valid) throw new BadRequestException('Current password is incorrect');

    const hashed = await bcrypt.hash(newPassword, 10);
    await this.prisma.user.update({
      where: { id: userId },
      data: { password: hashed },
    });

    return { message: 'Password changed successfully' };
  }

  // ── Cloudflare Turnstile ──────────────────────────────────────────────────
  // Verifies a Turnstile challenge token with Cloudflare's siteverify API.
  // Throws UnauthorizedException if the token is missing, invalid, or expired.
  async verifyTurnstile(token: string | undefined) {
    // Skip verification in development when no secret is configured
    if (!process.env.TURNSTILE_SECRET_KEY) return;
    if (!token) throw new UnauthorizedException('CAPTCHA token is required');

    const res = await fetch(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          secret: process.env.TURNSTILE_SECRET_KEY,
          response: token,
        }),
      },
    );

    const data = (await res.json()) as { success: boolean };
    if (!data.success) {
      throw new UnauthorizedException('CAPTCHA verification failed');
    }
  }

  // ── Google OAuth ──────────────────────────────────────────────────────────
  // Exchanges an authorization code for a Google user profile, then upserts
  // the user: link by email if an account already exists, otherwise create new.
  async googleExchange(code: string, redirectUri: string) {
    const oauthClient = new OAuth2Client(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      redirectUri,
    );

    const { tokens } = await oauthClient.getToken(code);
    oauthClient.setCredentials(tokens);

    const ticket = await oauthClient.verifyIdToken({
      idToken: tokens.id_token!,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    if (!payload || !payload.email) {
      throw new UnauthorizedException('Google did not return a valid profile');
    }

    const { sub: googleId, email, given_name, family_name, picture } = payload;

    // Find existing user by googleId or email (account linking)
    let user = await this.prisma.user.findFirst({
      where: {
        OR: [{ googleId }, { email }],
        ...notDeleted(),
      },
    });

    if (user) {
      // Link the Google account if this was a password-only user
      if (!user.googleId) {
        user = await this.prisma.user.update({
          where: { id: user.id },
          data: { googleId, provider: 'google', image: user.image ?? picture },
        });
      }
    } else {
      // New user — generate a unique username and create the account
      const firstName = given_name ?? email.split('@')[0];
      const lastName = family_name ?? '';
      let baseUsername = slugify(`${firstName} ${lastName}`.trim(), {
        lower: true,
        strict: true,
      });
      if (!baseUsername) baseUsername = email.split('@')[0];
      let username = baseUsername;
      let counter = 1;
      while (await this.prisma.user.findUnique({ where: { username } })) {
        username = `${baseUsername}-${counter}`;
        counter++;
      }

      user = await this.prisma.user.create({
        data: {
          firstName,
          lastName,
          email,
          googleId,
          provider: 'google',
          image: picture,
          username,
          role: 'CLIENT',
          emailVerified: true,
        },
      });

      // Welcome email for new Google-registered users
      await this.mail.sendMail({
        toEmail: user.email,
        toName: user.firstName ?? '',
        subject: `Welcome to Leadsage, ${user.firstName}!`,
        html: WelcomeEmail({ firstName: user.firstName ?? '' }),
      });
    }

    const { password: _pw, refreshToken: _rt, ...safeUser } = user as any;
    return this.login(safeUser);
  }
}
