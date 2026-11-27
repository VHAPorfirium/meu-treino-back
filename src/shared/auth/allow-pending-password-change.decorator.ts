import { SetMetadata } from '@nestjs/common';

export const ALLOW_PENDING_PASSWORD_CHANGE_KEY = 'allowPendingPasswordChange';

/**
 * Libera explicitamente um endpoint autenticado para contas com `mustChangePassword = true`
 * (ex.: `/auth/me`, `/auth/change-password`). Todas as demais rotas protegidas são barradas
 * pelo `PasswordChangeRequiredGuard`.
 */
export const AllowPendingPasswordChange = () =>
  SetMetadata(ALLOW_PENDING_PASSWORD_CHANGE_KEY, true);
