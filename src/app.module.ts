import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';

import { PrismaModule } from './shared/prisma/prisma.module';
import { SecurityModule } from './shared/security/security.module';
import { StorageModule } from './shared/storage/storage.module';
import { AllExceptionsFilter } from './shared/http/all-exceptions.filter';
import { JwtAuthGuard } from './shared/auth/jwt-auth.guard';
import { RolesGuard } from './shared/auth/roles.guard';

import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { ExercisesModule } from './modules/exercises/exercises.module';
import { MuscleGroupsModule } from './modules/muscle-groups/muscle-groups.module';
import { WorkoutsModule } from './modules/workouts/workouts.module';
import { WorkoutLogsModule } from './modules/workout-logs/workout-logs.module';
import { HealthModule } from './modules/health/health.module';
import { NotesModule } from './modules/notes/notes.module';
import { ProgressPhotosModule } from './modules/progress-photos/progress-photos.module';
import { PushModule } from './modules/push/push.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Rate limit global: 120 req/min por IP (mitiga abuso/DoS leve)
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    PrismaModule,
    SecurityModule,
    StorageModule,
    HealthModule,
    AuthModule,
    UsersModule,
    ExercisesModule,
    MuscleGroupsModule,
    WorkoutsModule,
    WorkoutLogsModule,
    PushModule,
    NotesModule,
    ProgressPhotosModule,
  ],
  providers: [
    // 1) rate limit  2) autentica  3) checa papel
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    // loga a causa real de todo 5xx (+ requestId na resposta) e o 429 como
    // evento de segurança. Substitui o antigo ThrottlerLogFilter.
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
