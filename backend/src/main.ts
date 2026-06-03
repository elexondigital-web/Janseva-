import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import { join } from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  /**
   * Phase 4 security headers.
   *
   * `helmet()` sets sensible defaults (X-Content-Type-Options, X-Frame-Options
   * DENY, Strict-Transport-Security in prod, etc).
   *
   * The CSP allows:
   *   - 'self' for default
   *   - data: + the S3 bucket for img-src (member photos & Aadhaar scans)
   *   - localhost:11100 for connect-src (Mantra fingerprint RD service)
   *   - unsafe-inline for style-src in dev only — Tailwind already produces
   *     classed CSS so this is just a fallback for inline style="..." that
   *     a few component libraries emit. Tighten in prod once verified.
   *
   * We disable cross-origin embedder policy so the frontend in dev (Vite on
   * a different port) can still load images from the API.
   */
  const s3Bucket = process.env.AWS_BUCKET_NAME ?? 'janseva-uploads';
  const region = process.env.AWS_REGION ?? 'ap-south-1';
  const s3Origin = `https://${s3Bucket}.s3.${region}.amazonaws.com`;
  const s3OriginAlt = `https://${s3Bucket}.s3.amazonaws.com`;

  app.use(helmet());
  app.use(
    helmet.contentSecurityPolicy({
      directives: {
        defaultSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', s3Origin, s3OriginAlt],
        connectSrc: ["'self'", 'http://localhost:11100'],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        fontSrc: ["'self'", 'data:'],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        frameAncestors: ["'none'"],
      },
    }),
  );
  app.use(helmet.crossOriginEmbedderPolicy({ policy: 'unsafe-none' }));

  // Trust the first proxy (nginx) so req.ip reflects the real client IP
  // and the throttler's per-IP keying works correctly behind a load
  // balancer.
  app.set('trust proxy', 1);

  // CORS — allow local dev, explicit FRONTEND_URL, and any *.vercel.app
  const origin: (string | RegExp)[] = [
    'http://localhost:5173',
    'http://localhost:3000',
    process.env.FRONTEND_URL,
    /\.vercel\.app$/,
  ].filter((value): value is string | RegExp => Boolean(value));

  app.enableCors({
    origin,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    credentials: true,
  });

  // Serve uploaded files in local storage mode
  app.useStaticAssets(join(process.cwd(), 'uploads'), {
    prefix: '/uploads/',
  });

  // Global prefix
  app.setGlobalPrefix('api');

  // Validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Swagger
  const config = new DocumentBuilder()
    .setTitle('JanSeva API')
    .setDescription('Constituency Management System API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`JanSeva API running on http://localhost:${port}`);
  console.log(`Swagger docs: http://localhost:${port}/api/docs`);
}
bootstrap();
