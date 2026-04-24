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

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

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

    // The refresh token cookie lives for the full 30-day session.
    // The access token cookie also gets a 30-day maxAge so the browser never
    // drops it early — but the JWT inside expires in 15 min, triggering a
    // silent refresh via the axios interceptor.
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

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async registerUser(@Body() registerUser: RegisterUserDto) {
    await this.authService.verifyTurnstile(registerUser.turnstileToken);
    return this.authService.register(registerUser);
  }

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

  @Post('resend-email-verification')
  @HttpCode(HttpStatus.OK)
  async resendEmailVerification(@Body() body: { email: string }) {
    return this.authService.sendEmailVerificationOTP(body.email);
  }

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

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  async forgotPassword(@Body() forgotPasswordDto: ForgotPasswordDto) {
    await this.authService.verifyTurnstile(forgotPasswordDto.turnstileToken);
    return this.authService.sendPasswordResetOTP(forgotPasswordDto.email);
  }

  @Post('verify-code')
  @HttpCode(HttpStatus.OK)
  async verifyCode(@Body() verifyCodeDto: VerifyCodeDto) {
    return this.authService.verifyCode(verifyCodeDto.otp, verifyCodeDto.email);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Req() req: ExpressRequest, @Res() res: Response) {
    // Only read the dedicated refresh token cookie — never fall back to the
    // access token cookie (they serve completely different purposes).
    const refreshToken = req.cookies?.refreshToken;

    if (!refreshToken) {
      return res
        .status(HttpStatus.UNAUTHORIZED)
        .json({ message: 'No refresh token found' });
    }

    const result = await this.authService.refreshTokens(refreshToken);

    if (!result) {
      // Refresh token expired, revoked, or detected as reused — force login
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

    // Rotate both cookies — the new refresh token resets the 30-day window
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

  @UseGuards(JwtAuthGuard)
  @Patch('onboarding')
  @HttpCode(HttpStatus.OK)
  async completeOnboarding(
    @CurrentUser() user: { id: string },
    @Body() dto: OnboardingDto,
  ) {
    return this.authService.completeOnboarding(user.id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('verify-nin')
  @HttpCode(HttpStatus.OK)
  async verifyNin(@Body() dto: VerifyNinDto) {
    return this.authService.verifyNin(dto.nin);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  @HttpCode(HttpStatus.OK)
  getMe(@CurrentUser() user: { id: string }) {
    return this.authService.findUserById(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('profile')
  @HttpCode(HttpStatus.OK)
  updateProfile(
    @CurrentUser() user: { id: string },
    @Body() dto: UpdateUserProfileDto,
  ) {
    return this.authService.updateProfile(user.id, dto);
  }

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

  @Get('google')
  googleOAuthInit(
    @Query('callbackURL') callbackURL: string,
    @Res() res: Response,
  ) {
    const state = callbackURL ?? '/';
    const url = this.authService.getGoogleAuthUrl(this.googleRedirectUri, state);
    return res.redirect(url);
  }

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

  @Post('google/exchange')
  @HttpCode(HttpStatus.OK)
  async googleExchange(@Body() body: { code: string; redirectUri: string }) {
    if (!body.code || !body.redirectUri) {
      throw new BadRequestException('code and redirectUri are required');
    }

    const { access_token, refresh_token, user } =
      await this.authService.googleExchange(body.code, body.redirectUri);

    // Return tokens in the body — the Next.js callback route sets the cookies
    // directly on the browser response using response.cookies.set(), which is
    // more reliable than forwarding Set-Cookie headers across a server fetch.
    return { user, access_token, refresh_token };
  }
}
