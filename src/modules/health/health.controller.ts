import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../../shared/auth/public.decorator';

@Controller('health')
export class HealthController {
  // GET /api/health — usado pelo healthcheck do Railway e por monitoração.
  @Public()
  @SkipThrottle()
  @Get()
  check() {
    return { status: 'ok', ts: new Date().toISOString() };
  }
}
