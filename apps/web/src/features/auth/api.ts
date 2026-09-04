import type { AuthResult } from '@roundtable/shared';
import type { LoginInput, SignupInput } from '@roundtable/shared/schemas';

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
