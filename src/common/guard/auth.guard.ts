import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request, Response } from 'express';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { IS_PUBLIC_KEY } from '@common/constants';
import { COOKIE_NAME, ERROR_MESSAGES } from '@common/constants';
import { getCookie } from '@common/utils';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const req: Request = context.switchToHttp().getRequest();
    const res: Response = context.switchToHttp().getResponse();
    const cookieName = COOKIE_NAME;
    const token = req.cookies?.[cookieName] as string;

    if (!token) {
      const cookie = getCookie(req, this.configService);
      res.clearCookie(COOKIE_NAME, cookie.options);
      throw new UnauthorizedException(ERROR_MESSAGES.UNAUTHORIZED);
    }

    try {
      const payload = this.jwtService.verify(token, {
        secret: this.configService.get<string>('JWT_SECRET'),
      });
      req['user'] = payload;
      return true;
    } catch {
      const cookie = getCookie(req, this.configService);
      res.clearCookie(cookieName, cookie.options);
      throw new UnauthorizedException(ERROR_MESSAGES.UNAUTHORIZED);
    }
  }
}
