import type { AuthResult, User } from '@roundtable/shared';
import type {
  LoginInput,
  ResendVerificationInput,
  SignupInput,
  UpdateProfileInput,
} from '@roundtable/shared/schemas';

import { api } from '../../lib/api';

export interface SignupResponse {
  ok: true;
}

// No token in the response — an account exists but has no working session
// until the emailed link is clicked.
export function signup(input: SignupInput): Promise<SignupResponse> {
  return api.post<SignupResponse>('/api/auth/signup', input);
}

export function login(input: LoginInput): Promise<AuthResult> {
  return api.post<AuthResult>('/api/auth/login', input);
}

export function logout(): Promise<void> {
  return api.post<void>('/api/auth/logout', {});
}

export function getMe(): Promise<{ user: User }> {
  return api.get<{ user: User }>('/api/auth/me');
}

export function updateProfile(input: UpdateProfileInput): Promise<User> {
  return api.patch<User>('/api/users/me', input);
}

// Success logs the user in — same AuthResult shape as login.
export function verifyEmail(token: string): Promise<AuthResult> {
  return api.get<AuthResult>(`/api/auth/verify-email?token=${encodeURIComponent(token)}`);
}

export function resendVerification(input: ResendVerificationInput): Promise<{ ok: true }> {
  return api.post<{ ok: true }>('/api/auth/resend-verification', input);
}
