import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Query,
  Req,
  Request,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiBody } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LocalAuthGuard } from './guards/local-auth.guard';
import type { Response, Request as ExpressRequest } from 'express';
import { RegisterUserDto } from './dto/register-user.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { VerifyCodeDto } from './dto/verify-code.dto';
import { SetNewPasswordDto } from './dto/set-new-password.dto';
import { OnboardingDto } from './dto/onboarding.dto';
import { VerifyNinDto } from './dto/verify-nin.dto';
import { UpdateUserProfileDto } from './dto/update-user-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from 'src/decorators/current-user.decorator';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @ApiOperation({ summary: 'Log in with email & password (sets HttpOnly cookies)' })
  @ApiBody({ schema: { type: 'object', required: ['email', 'password'], properties: { email: { type: 'string', example: 'user@example.com' }, password: { type: 'string', example: 'Password123!' }, turnstileToken: { type: 'string', description: 'Cloudflare Turnstile token (optional in dev)' } } } })
  @UseGuards(LocalAuthGuard)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Request() req, @Res() res: Response) {
    await this.authService.verifyTurnstile(req.body?.turnstileToken);

    const { access_token, refresh_token, user } = await this.authService.login(
      req.user,
    );

    const cookieOptions = this.authService.getCookieOptions();
    const sessionMs = this.authService.getSessionMs(); // 30 days

    res.cookie('refreshToken', refresh_token, {
      ...cookieOptions,
      maxAge: sessionMs,
    });

    res.cookie('accessToken', access_token, {
      ...cookieOptions,
      maxAge: sessionMs,
    });

    return res.json({ user, message: `Welcome back, ${user.firstName}` });
  }

  @ApiOperation({ summary: 'Register a new user account' })
  @ApiBody({ type: RegisterUserDto })
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async registerUser(@Body() registerUser: RegisterUserDto) {
    await this.authService.verifyTurnstile(registerUser.turnstileToken);
    return this.authService.register(registerUser);
  }

  @ApiOperation({ summary: 'Verify email with OTP and receive session cookies' })
  @ApiBody({ schema: { type: 'object', required: ['email', 'otp'], properties: { email: { type: 'string', example: 'user@example.com' }, otp: { type: 'string', example: '123456' } } } })
  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  async verifyEmail(
    @Body() body: { email: string; otp: string },
    @Res() res: Response,
  ) {
    const { access_token, refresh_token, user } =
      await this.authService.verifyEmailOTP(body.email, body.otp, res);

    const cookieOptions = this.authService.getCookieOptions();
    const sessionMs = this.authService.getSessionMs();

    res.cookie('refreshToken', refresh_token, {
      ...cookieOptions,
      maxAge: sessionMs,
    });

    res.cookie('accessToken', access_token, {
      ...cookieOptions,
      maxAge: sessionMs,
    });

    return res.json({ user, message: `Welcome to Leadsage, ${user.firstName}` });
  }

  @ApiOperation({ summary: 'Resend email verification OTP' })
  @ApiBody({ schema: { type: 'object', required: ['email'], properties: { email: { type: 'string', example: 'user@example.com' } } } })
  @Post('resend-email-verification')
  @HttpCode(HttpStatus.OK)
  async resendEmailVerification(@Body() body: { email: string }) {
    return this.authService.sendEmailVerificationOTP(body.email);
  }

  @ApiOperation({ summary: 'Log out and clear session cookies' })
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Req() req: ExpressRequest, @Res() res: Response) {
    const refreshToken = req.cookies?.refreshToken;
    if (refreshToken) {
      await this.authService.logout(refreshToken);
    }

    const cookieOptions = this.authService.getCookieOptions();
    res.clearCookie('refreshToken', cookieOptions);
    res.clearCookie('accessToken', cookieOptions);

    return res.json({ message: "You've been logged out successfully" });
  }

  @ApiOperation({ summary: 'Send a password reset OTP' })
  @ApiBody({ type: ForgotPasswordDto })
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  async forgotPassword(@Body() forgotPasswordDto: ForgotPasswordDto) {
    await this.authService.verifyTurnstile(forgotPasswordDto.turnstileToken);
    return this.authService.sendPasswordResetOTP(forgotPasswordDto.email);
  }

  @ApiOperation({ summary: 'Verify a password reset OTP' })
  @ApiBody({ type: VerifyCodeDto })
  @Post('verify-code')
  @HttpCode(HttpStatus.OK)
  async verifyCode(@Body() verifyCodeDto: VerifyCodeDto) {
    return this.authService.verifyCode(verifyCodeDto.otp, verifyCodeDto.email);
  }

  @ApiOperation({ summary: 'Silently refresh access token using refresh token cookie' })
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Req() req: ExpressRequest, @Res() res: Response) {
    const refreshToken = req.cookies?.refreshToken;

    if (!refreshToken) {
      return res
        .status(HttpStatus.UNAUTHORIZED)
        .json({ message: 'No refresh token found' });
    }

    const result = await this.authService.refreshTokens(refreshToken);

    if (!result) {
      const cookieOptions = this.authService.getCookieOptions();
      res.clearCookie('refreshToken', cookieOptions);
      res.clearCookie('accessToken', cookieOptions);
      return res
        .status(HttpStatus.UNAUTHORIZED)
        .json({ message: 'Session expired. Please log in again.' });
    }

    const { accessToken, newRefreshToken, user } = result;
    const cookieOptions = this.authService.getCookieOptions();
    const sessionMs = this.authService.getSessionMs();

    res.cookie('refreshToken', newRefreshToken, {
      ...cookieOptions,
      maxAge: sessionMs,
    });

    res.cookie('accessToken', accessToken, {
      ...cookieOptions,
      maxAge: sessionMs,
    });

    return res.json({ user });
  }

  @ApiOperation({ summary: 'Set a new password after OTP verification' })
  @ApiBody({ type: SetNewPasswordDto })
  @Post('set-new-password')
  @HttpCode(HttpStatus.OK)
  async setNewPassword(@Body() newPasswordDto: SetNewPasswordDto) {
    return this.authService.setNewPassword({
      email: newPasswordDto.email,
      otp: newPasswordDto.otp,
      newPassword: newPasswordDto.newPassword,
      confirmPassword: newPasswordDto.confirmPassword,
    });
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: 'Complete user onboarding' })
  @ApiBody({ type: OnboardingDto })
  @UseGuards(JwtAuthGuard)
  @Patch('onboarding')
  @HttpCode(HttpStatus.OK)
  async completeOnboarding(
    @CurrentUser() user: { id: string },
    @Body() dto: OnboardingDto,
  ) {
    return this.authService.completeOnboarding(user.id, dto);
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: 'Verify NIN (national ID)' })
  @ApiBody({ type: VerifyNinDto })
  @UseGuards(JwtAuthGuard)
  @Post('verify-nin')
  @HttpCode(HttpStatus.OK)
  async verifyNin(@Body() dto: VerifyNinDto) {
    return this.authService.verifyNin(dto.nin);
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get the currently authenticated user' })
  @UseGuards(JwtAuthGuard)
  @Get('me')
  @HttpCode(HttpStatus.OK)
  getMe(@CurrentUser() user: { id: string }) {
    return this.authService.findUserById(user.id);
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update the current user profile' })
  @ApiBody({ type: UpdateUserProfileDto })
  @UseGuards(JwtAuthGuard)
  @Patch('profile')
  @HttpCode(HttpStatus.OK)
  updateProfile(
    @CurrentUser() user: { id: string },
    @Body() dto: UpdateUserProfileDto,
  ) {
    return this.authService.updateProfile(user.id, dto);
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: 'Change password for authenticated user' })
  @ApiBody({ type: ChangePasswordDto })
  @UseGuards(JwtAuthGuard)
  @Patch('change-password')
  @HttpCode(HttpStatus.OK)
  changePassword(
    @CurrentUser() user: { id: string },
    @Body() dto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(
      user.id,
      dto.currentPassword,
      dto.newPassword,
      dto.confirmPassword,
    );
  }

  private get googleRedirectUri(): string {
    const base =
      process.env.BACKEND_URL ?? `http://localhost:${process.env.PORT ?? 8000}`;
    return `${base}/api/auth/google/callback`;
  }

  @ApiOperation({ summary: 'Initiate Google OAuth flow (redirects to Google)' })
  @Get('google')
  googleOAuthInit(
    @Query('callbackURL') callbackURL: string,
    @Res() res: Response,
  ) {
    const state = callbackURL ?? '/';
    const url = this.authService.getGoogleAuthUrl(this.googleRedirectUri, state);
    return res.redirect(url);
  }

  @ApiOperation({ summary: 'Google OAuth callback (internal redirect handler)' })
  @Get('google/callback')
  async googleOAuthCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') oauthError: string,
    @Res() res: Response,
  ) {
    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000';

    if (oauthError || !code) {
      return res.redirect(`${frontendUrl}/login?error=oauth_failed`);
    }

    try {
      const { access_token, refresh_token } =
        await this.authService.googleExchange(code, this.googleRedirectUri);

      const next = state ?? '/';
      const dest = new URL(`${frontendUrl}/api/auth/oauth/callback`);
      dest.searchParams.set('at', access_token);
      dest.searchParams.set('rt', refresh_token);
      dest.searchParams.set('next', next);
      return res.redirect(dest.toString());
    } catch {
      return res.redirect(`${frontendUrl}/login?error=oauth_failed`);
    }
  }

  @ApiOperation({ summary: 'Exchange Google OAuth code for tokens (used by Next.js SSR)' })
  @ApiBody({ schema: { type: 'object', required: ['code', 'redirectUri'], properties: { code: { type: 'string' }, redirectUri: { type: 'string' } } } })
  @Post('google/exchange')
  @HttpCode(HttpStatus.OK)
  async googleExchange(@Body() body: { code: string; redirectUri: string }) {
    if (!body.code || !body.redirectUri) {
      throw new BadRequestException('code and redirectUri are required');
    }

    const { access_token, refresh_token, user } =
      await this.authService.googleExchange(body.code, body.redirectUri);

    return { user, access_token, refresh_token };
  }
}
