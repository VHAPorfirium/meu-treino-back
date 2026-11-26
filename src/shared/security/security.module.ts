import { Global, Module } from '@nestjs/common';
import { SecurityLogger } from './security-logger';
import { LoginThrottleService } from './login-throttle.service';
import { CryptoService } from './crypto.service';
import { AccessLogService } from './access-log.service';

@Global()
@Module({
  providers: [SecurityLogger, LoginThrottleService, CryptoService, AccessLogService],
  exports: [SecurityLogger, LoginThrottleService, CryptoService, AccessLogService],
})
export class SecurityModule {}
