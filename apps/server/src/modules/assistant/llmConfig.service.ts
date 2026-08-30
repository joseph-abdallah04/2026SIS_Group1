// F33 — per-user LLM provider configuration.
//
// On paper this is the Auth owner's ticket (docs/06 §1), but the assistant is dead without
// it and the two owners were told to lock the format together. It lives inside the
// assistant module so the Auth owner can move it wholesale later; the only piece that
// belongs to neither is `lib/crypto.ts`, which is shared infrastructure.
//
// Rule that drives the whole design: the API key goes in and never comes back out.
// It is AES-256-GCM encrypted at rest (docs/05 §8) and decrypted into a local variable for
// the lifetime of one LLM call — never logged, never returned, never cached.
import type { LlmConfigPublic, LlmConfigTestResult, LlmConfigUpsert } from '@roundtable/shared';

import { prisma } from '../../db.js';
import { env } from '../../env.js';
import { decryptSecret, encryptSecret, SecretCryptoError } from '../../lib/crypto.js';
import { ApiError } from '../../middleware/error.js';
import { probeChatCompletion, type LlmCredentials } from './llm.js';

function encryptionSecret(): string {
  if (!env.LLM_KEY_ENCRYPTION_SECRET) {
    throw new ApiError(
      500,
      'LLM_KEY_ENCRYPTION_SECRET is not set — the server cannot store API keys safely',
      'LLM_ENCRYPTION_UNCONFIGURED',
    );
  }
  return env.LLM_KEY_ENCRYPTION_SECRET;
}

export async function getLlmConfigPublic(userId: string): Promise<LlmConfigPublic | null> {
  const row = await prisma.userLLMConfig.findUnique({
    where: { userId },
    select: { baseUrl: true, model: true, apiKeyEncrypted: true },
  });
  if (!row) return null;
  return { baseUrl: row.baseUrl, model: row.model, hasKey: row.apiKeyEncrypted.length > 0 };
}

/**
 * Creates or updates the caller's provider config.
 *
 * Omitting `apiKey` keeps the stored one, so changing only the model — the common case when
 * a provider retires a model id — does not force the user to find and re-paste their secret.
 */
export async function saveLlmConfig(
  userId: string,
  input: LlmConfigUpsert,
): Promise<LlmConfigPublic> {
  const apiKeyEncrypted = input.apiKey
    ? encryptSecret(input.apiKey, encryptionSecret())
    : await existingApiKeyEncrypted(userId);
  const data = { baseUrl: input.baseUrl, model: input.model, apiKeyEncrypted };

  try {
    await prisma.userLLMConfig.upsert({
      where: { userId },
      update: data,
      create: { userId, ...data },
    });
  } catch (cause) {
    // The only realistic failure is the FK: no such user. Worth naming, because with the
    // dev auth shim a stale DEV_USER_ID produces exactly this.
    console.error('assistant: failed to save LLM config', cause);
    throw new ApiError(
      400,
      `Could not save LLM config for user ${userId} — does that user exist?`,
      'LLM_CONFIG_SAVE_FAILED',
    );
  }

  return { baseUrl: input.baseUrl, model: input.model, hasKey: true };
}

/** The stored ciphertext, for a save that did not supply a new key. */
async function existingApiKeyEncrypted(userId: string): Promise<string> {
  const row = await prisma.userLLMConfig.findUnique({
    where: { userId },
    select: { apiKeyEncrypted: true },
  });
  if (!row) {
    throw new ApiError(
      400,
      'An API key is required the first time you save a provider.',
      'LLM_KEY_REQUIRED',
    );
  }
  return row.apiKeyEncrypted;
}

export async function deleteLlmConfig(userId: string): Promise<void> {
  await prisma.userLLMConfig.deleteMany({ where: { userId } });
}

/**
 * Decrypts the stored key for a single call. The returned object is intentionally not
 * cached anywhere — callers hold it for the duration of one request and drop it.
 */
export async function getLlmCredentials(userId: string): Promise<LlmCredentials> {
  const row = await prisma.userLLMConfig.findUnique({
    where: { userId },
    select: { baseUrl: true, model: true, apiKeyEncrypted: true },
  });

  if (!row) {
    throw new ApiError(
      400,
      'No LLM provider configured. Add one in Settings to use the assistant.',
      'LLM_NOT_CONFIGURED',
    );
  }

  try {
    return {
      baseUrl: row.baseUrl,
      model: row.model,
      apiKey: decryptSecret(row.apiKeyEncrypted, encryptionSecret()),
    };
  } catch (cause) {
    if (cause instanceof SecretCryptoError) {
      // Almost always LLM_KEY_ENCRYPTION_SECRET changing under existing rows.
      throw new ApiError(
        400,
        'Your stored API key could not be decrypted. Re-enter it in Settings.',
        'LLM_KEY_UNDECRYPTABLE',
      );
    }
    throw cause;
  }
}

/**
 * "Test connection" (F33). Probes the credentials the user just typed when `override` is
 * given — so they can verify before saving — and the stored ones otherwise.
 *
 * Never throws for a bad provider: a failed test is a normal result, not a server error.
 */
export async function testLlmConfig(
  userId: string,
  override?: LlmConfigUpsert,
): Promise<LlmConfigTestResult> {
  let credentials: LlmCredentials;
  try {
    if (!override) {
      credentials = await getLlmCredentials(userId);
    } else if (override.apiKey) {
      credentials = { baseUrl: override.baseUrl, model: override.model, apiKey: override.apiKey };
    } else {
      // Testing a new base URL or model against the key already on file — the browser has
      // no way to send a key it was never given back.
      const stored = await getLlmCredentials(userId);
      credentials = { baseUrl: override.baseUrl, model: override.model, apiKey: stored.apiKey };
    }
  } catch (cause) {
    return {
      ok: false,
      error: cause instanceof ApiError ? cause.message : 'No usable configuration',
    };
  }

  try {
    const probe = await probeChatCompletion(credentials);
    return { ok: true, latencyMs: probe.latencyMs, ...(probe.model ? { model: probe.model } : {}) };
  } catch (cause) {
    return {
      ok: false,
      error: cause instanceof Error ? cause.message : 'Could not reach the provider',
    };
  }
}
