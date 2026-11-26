import { Global, Module } from '@nestjs/common';
import { SecurityLogger } from './security-logger';
import { LoginThrottleService } from './login-throttle.service';
import { CryptoService } from './crypto.service';

@Global()
@Module({
  providers: [SecurityLogger, LoginThrottleService, CryptoService],
  exports: [SecurityLogger, LoginThrottleService, CryptoService],
})
export class SecurityModule {}
