-- Fase 2 (v2.0.0) — Parte 1: adiciona novos valores ao enum Role em transação própria
-- (PostgreSQL exige que novos valores de ENUM sejam commitados antes de serem usados em DML/índices).

ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'RECEPTION';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'PERSONAL';
