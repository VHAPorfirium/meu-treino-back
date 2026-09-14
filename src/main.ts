import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { requestIdMiddleware } from './shared/http/request-id.middleware';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.setGlobalPrefix('api');

  /**
   * Proxies confiáveis à frente da API (define como `req.ip` é resolvido a partir
   * de X-Forwarded-For). Local/direto no Render = 1 (o balanceador do Render).
   * Produção via proxy do Next na Vercel = 2 (Vercel + Render).
   * Sem isso, um X-Forwarded-For forjado pelo cliente burlava o lockout por IP.
   */
  app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS ?? 1));

  // request-id em toda requisição (correlação erro ↔ evento de segurança)
  app.use(requestIdMiddleware);

  // headers de segurança (OWASP Secure Headers)
  app.use(helmet());
  app.use(cookieParser());

  // CORS com credenciais (necessário p/ cookie httpOnly). Origem explícita.
  app.enableCors({
    origin: process.env.CORS_ORIGIN?.split(',') ?? 'http://localhost:3001',
    credentials: true,
    exposedHeaders: ['x-request-id'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port, '0.0.0.0');
  // eslint-disable-next-line no-console
  console.log(`API rodando em http://localhost:${port}/api`);
}
bootstrap();
