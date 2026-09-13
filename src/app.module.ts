import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';

import { PrismaModule } from './shared/prisma/prisma.module';
import { SecurityModule } from './shared/security/security.module';
import { JwtAuthGuard } from './shared/auth/jwt-auth.guard';
import { RolesGuard } from './shared/auth/roles.guard';

import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { ExercisesModule } from './modules/exercises/exercises.module';
import { MuscleGroupsModule } from './modules/muscle-groups/muscle-groups.module';
import { WorkoutsModule } from './modules/workouts/workouts.module';
import { WorkoutLogsModule } from './modules/workout-logs/workout-logs.module';
import { HealthModule } from './modules/health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Rate limit global: 120 req/min por IP (mitiga abuso/DoS leve)
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    PrismaModule,
    SecurityModule,
    HealthModule,
    AuthModule,
    UsersModule,
    ExercisesModule,
    MuscleGroupsModule,
    WorkoutsModule,
    WorkoutLogsModule,
  ],
  providers: [
    // 1) rate limit  2) autentica  3) checa papel
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
