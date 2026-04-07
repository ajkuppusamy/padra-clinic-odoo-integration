import { APP_DOMAIN_NAME } from '@common/constants';
import { ConfigService } from '@nestjs/config';
import { CookieOptions, Request } from 'express';

export function getCookie(
  req: Request,
  configService: ConfigService,
  defaultMaxAge: number = 10 * 365 * 24 * 60 * 60 * 1000, // 10 years
) {
  const secureCookie = configService.get<string>('NODE_ENV') === 'prd';
  const origin = req.headers['origin'] || '';

  // Dynamically determine domain
  const domain = origin.includes(APP_DOMAIN_NAME)
    ? `.${APP_DOMAIN_NAME}`
    : 'localhost';

  const cookieOptions: CookieOptions = {
    httpOnly: true,
    secure: secureCookie, // true in production
    sameSite: secureCookie ? 'none' : 'lax', // 'none' allows cross-site cookies in production
    path: '/', // Cookie valid for all routes
    domain, // dynamic domain
    maxAge: defaultMaxAge,
  };

  return { options: cookieOptions };
}
