import 'reflect-metadata';
import './config';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { cfg } from './config';
import { AppError } from './common/errors';

// BigInt (file sizes) is serialised as a JSON number — exact up to 9 PB
(BigInt.prototype as unknown as { toJSON: () => number }).toJSON = function (this: bigint) {
  return Number(this);
};

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: false });
  // Behind the web app's rewrite and a load balancer: the client IP comes from X-Forwarded-For
  app.set('trust proxy', cfg.trustProxy);
  app.disable('x-powered-by');
  app.use(
    helmet({
      hsts: cfg.isProduction ? { maxAge: 31536000, includeSubDomains: true } : false,
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'same-site' },
    }),
  );
  app.use(cookieParser());
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: (errors) => {
        const flat = errors.flatMap((e) => [e, ...(e.children ?? []).flatMap((c) => [c, ...(c.children ?? [])])]);
        const first = flat.find((e) => e.constraints);
        const messages = Object.values(first?.constraints ?? {});
        // Prefer our machine-readable codes (INVALID_EMAIL…) over class-validator's English sentences
        const message = messages.find((m) => /^[A-Z_]+$/.test(m)) ?? messages[0] ?? 'Invalid data';
        const code = /^[A-Z_]+$/.test(message) ? message : 'VALIDATION_FAILED';
        return new AppError(400, code, code === message ? 'Invalid data' : message, {
          fields: errors.map((e) => e.property),
        });
      },
    }),
  );

  app.enableShutdownHooks();
  await app.listen(cfg.port);
  new Logger('Bootstrap').log(`API: http://localhost:${cfg.port}/api`);
}

bootstrap();
