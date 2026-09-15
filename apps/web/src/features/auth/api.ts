import type { AuthResult, User } from '@roundtable/shared';
import type {
  DeleteAccountInput,
  LoginInput,
  SignupInput,
  UpdateProfileInput,
} from '@roundtable/shared/schemas';

import { api } from '../../lib/api';

export interface SignupResponse {
  token: string;
}

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

export function deleteAccount(input: DeleteAccountInput): Promise<{ ok: true }> {
  return api.delete<{ ok: true }>('/api/users/me', input);
}
