import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { JwtAuthGuard, JwtRefreshGuard } from './jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser, JwtPayload } from './types';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  // Tighter bucket: 5 login attempts / minute / IP. Slows brute-force
  // without throttling normal usage (humans rarely log in 5x/min).
  @Throttle({ auth: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Login with email and password' })
  async login(@Body() dto: LoginDto, @Req() req: Request) {
    const data = await this.auth.login(dto, getClientIp(req));
    return {
      success: true,
      data,
      message: 'Login successful',
    };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtRefreshGuard)
  @ApiOperation({ summary: 'Exchange a refresh token for a new access token' })
  async refresh(@Body() _dto: RefreshDto, @Req() req: Request) {
    const payload = req.user as JwtPayload & { refreshToken: string };
    const data = await this.auth.refresh(payload.sub, payload.refreshToken);
    return {
      success: true,
      data,
      message: 'Token refreshed',
    };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Log out — invalidates refresh token(s)' })
  async logout(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { refreshToken?: string },
    @Req() req: Request,
  ) {
    const data = await this.auth.logout(
      user.id,
      body?.refreshToken,
      getClientIp(req),
    );
    return {
      success: true,
      data,
      message: data.message,
    };
  }
}

/**
 * Extract the best-guess client IP. Behind nginx/Cloudflare we trust the
 * usual X-Forwarded-For header (first hop); otherwise fall back to the
 * socket address. Returns undefined rather than the literal "::1" so audit
 * rows don't get cluttered with the loopback address.
 */
function getClientIp(req: Request): string | undefined {
  const fwd = req.headers['x-forwarded-for'];
  const raw = Array.isArray(fwd) ? fwd[0] : fwd?.split(',')[0]?.trim();
  const ip = raw || req.ip || req.socket?.remoteAddress;
  if (!ip || ip === '::1' || ip === '127.0.0.1') return undefined;
  return ip.replace(/^::ffff:/, '');
}
