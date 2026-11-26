import { Global, Module } from '@nestjs/common';
import { SecurityLogger } from './security-logger';
import { LoginThrottleService } from './login-throttle.service';
import { CryptoService } from './crypto.service';
import { AccessLogService } from './access-log.service';
import { UserStatusCacheService } from '../auth/user-status-cache.service';

@Global()
@Module({
  providers: [
    SecurityLogger,
    LoginThrottleService,
    CryptoService,
    AccessLogService,
    UserStatusCacheService,
  ],
  exports: [
    SecurityLogger,
    LoginThrottleService,
    CryptoService,
    AccessLogService,
    UserStatusCacheService,
  ],
})
export class SecurityModule {}
