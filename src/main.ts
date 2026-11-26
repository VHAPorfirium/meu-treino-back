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
   * de X-Forwarded-For). Local direto = 0; Nginx/Caddy na VPS = 1;
   * produção via proxy do Next na Vercel + Nginx = 2.
   * Sem isso, um X-Forwarded-For forjado pelo cliente burlava o lockout por IP.
   */
  const rawTrustProxy = process.env.TRUST_PROXY_HOPS?.trim();
  const parsedHops = rawTrustProxy ? Number.parseInt(rawTrustProxy, 10) : 1;
  const trustProxyHops =
    Number.isInteger(parsedHops) && parsedHops >= 0 ? parsedHops : 1;
  app.set('trust proxy', trustProxyHops);

  // request-id em toda requisição (correlação erro ↔ evento de segurança)
  app.use(requestIdMiddleware);

  // headers de segurança (OWASP Secure Headers)
  app.use(helmet());
  app.use(cookieParser());

  // CORS com credenciais (necessário p/ cookie httpOnly). Origem explícita.
  const corsOrigins = (process.env.CORS_ORIGIN ?? 'http://localhost:3001')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  app.enableCors({
    origin: corsOrigins.length > 0 ? corsOrigins : 'http://localhost:3001',
    credentials: true,
    exposedHeaders: ['x-request-id', 'x-total-count'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  // Registra handlers de SIGTERM/SIGINT (essencial quando `exec node` roda como
  // PID 1 no Docker) para drenar requisições e executar PrismaService.onModuleDestroy.
  app.enableShutdownHooks();

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port, '0.0.0.0');
  // eslint-disable-next-line no-console
  console.log(`API rodando em http://localhost:${port}/api`);
}
bootstrap();
