import { Role } from '@prisma/client';

export interface JwtPayload {
  sub: string; // userId
  role: Role;
  name: string;
}

export interface AuthUser {
  userId: string;
  role: Role;
  name: string;
}
