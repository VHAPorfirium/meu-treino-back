import { Global, Module } from '@nestjs/common';
import { SecurityLogger } from './security-logger';
import { LoginThrottleService } from './login-throttle.service';

@Global()
@Module({
  providers: [SecurityLogger, LoginThrottleService],
  exports: [SecurityLogger, LoginThrottleService],
})
export class SecurityModule {}
