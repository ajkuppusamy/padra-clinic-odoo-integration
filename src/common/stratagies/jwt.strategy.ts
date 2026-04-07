import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Request } from 'express';
import { Strategy, ExtractJwt } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

import { COOKIE_NAME } from 'src/common/constants';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: Request) => {
          const cookieName = COOKIE_NAME;
          return req?.cookies?.[cookieName] ?? '';
        },
      ]),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET', 'supersecret'),
    });
  }

  validate(payload: Record<string, any>) {
    if (!payload) throw new UnauthorizedException();
    return { id: payload?.id, email: payload?.email };
  }
}
