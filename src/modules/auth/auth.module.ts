import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { LoginUseCase } from './application/use-cases/login.use-case';
import { ChangePasswordUseCase } from './application/use-cases/change-password.use-case';
import { SwitchProfileUseCase } from './application/use-cases/switch-profile.use-case';
import { JwtStrategy } from '../../shared/auth/jwt.strategy';
import { getJwtSecret } from '../../shared/auth/jwt-secret';

@Module({
  imports: [
    UsersModule,
    PassportModule,
    // registerAsync garante que ConfigModule.forRoot() já carregou o `.env`
    // antes de resolver JWT_SECRET e JWT_EXPIRES_IN (alinha com JwtStrategy).
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: getJwtSecret(),
        signOptions: {
          expiresIn: config.get<string>('JWT_EXPIRES_IN') ?? '30d',
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [LoginUseCase, ChangePasswordUseCase, SwitchProfileUseCase, JwtStrategy],
})
export class AuthModule {}
