// F33 — "bring your own LLM" settings.
//
// The key is write-only by design: once saved it never comes back from the server, so the
// field shows a placeholder rather than a value, and leaving it blank on a re-save is
// treated as "keep the key I already have".
//
// `variant="panel"` is the same form, painted for the assistant rail, so a session never
// has to send someone to /settings (and the profile tab that can delete an account).
import { useEffect, useMemo, useState } from 'react';
import { Check, Sparkles } from 'lucide-react';
import {
  llmConfigUpsertSchema,
  LLM_PROVIDER_PRESETS,
  type LlmConfigTestResult,
} from '@roundtable/shared';

import { PasswordInput } from '../../components/ui/PasswordInput';
import { deleteLlmConfig, fetchLlmConfig, saveLlmConfig, testLlmConfig } from '../assistant/api';
import {
  FIELD,
  FIELD_HINT,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  SETTINGS_CARD,
  SETTINGS_CARD_TITLE,
  TEXT_INPUT,
} from './settingsStyles';

type Status =
  { kind: 'idle' } | { kind: 'saving' } | { kind: 'saved' } | { kind: 'error'; message: string };

type Preset = (typeof LLM_PROVIDER_PRESETS)[number];

/**
 * How each preset reads as a choice on the page, and a few model names to pick
 * from. The names are only shortcuts into the field: whatever the provider
 * calls a model can always be typed.
 */
const PROVIDER_CHOICES: Record<
  Preset['label'],
  { name: string; where: string; local: boolean; models: readonly string[] }
> = {
  OpenAI: {
    name: 'OpenAI',
    where: 'Cloud',
    local: false,
    models: ['gpt-4o-mini', 'gpt-4o', 'o3-mini'],
  },
  Groq: {
    name: 'Groq',
    where: 'Cloud · fast',
    local: false,
    models: ['openai/gpt-oss-120b', 'llama-3.3-70b-versatile'],
  },
  OpenRouter: {
    name: 'OpenRouter',
    where: 'Cloud · many models',
    local: false,
    models: ['openai/gpt-4o-mini', 'meta-llama/llama-3.3-70b-instruct'],
  },
  'Ollama (local)': {
    name: 'Ollama',
    where: 'On your computer',
    local: true,
    models: ['llama3.1', 'qwen2.5', 'mistral'],
  },
  'LM Studio (local)': {
    name: 'LM Studio',
    where: 'On your computer',
    local: true,
    models: ['local-model'],
  },
};

const CUSTOM = 'custom';
type ProviderChoice = Preset['label'] | typeof CUSTOM;

/** Which choice a saved address belongs to: the preset it matches, or a custom one. */
function providerFor(baseUrl: string): ProviderChoice {
  return LLM_PROVIDER_PRESETS.find((preset) => preset.baseUrl === baseUrl.trim())?.label ?? CUSTOM;
}

const MONO = 'font-mono text-[13.5px]';

export interface LlmSettingsFormProps {
  variant?: 'page' | 'panel';
  onSaved?: (config: { model: string }) => void;
  onCancel?: () => void;
  /** Told whether a provider is saved, once loaded and whenever that changes. */
  onConnectedChange?: (connected: boolean) => void;
}

export function LlmSettingsForm({
  variant = 'page',
  onSaved,
  onCancel,
  onConnectedChange,
}: LlmSettingsFormProps) {
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('');
  const [provider, setProvider] = useState<ProviderChoice>(CUSTOM);
  // What the server holds, so Save waits for a change.
  const [saved, setSaved] = useState<{ baseUrl: string; model: string } | null>(null);
  const [hasStoredKey, setHasStoredKey] = useState(false);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<LlmConfigTestResult | null>(null);
  const panel = variant === 'panel';

  useEffect(() => {
    let cancelled = false;
    fetchLlmConfig()
      .then(({ config }) => {
        if (cancelled) return;
        if (config) {
          setBaseUrl(config.baseUrl);
          setModel(config.model);
          setProvider(providerFor(config.baseUrl));
          setSaved({ baseUrl: config.baseUrl, model: config.model });
          setHasStoredKey(config.hasKey);
          return;
        }
        // Nothing set up yet: the page starts on the first provider, filled in,
        // so only the key is left to find. The rail starts blank, as before.
        const first = LLM_PROVIDER_PRESETS[0];
        if (variant === 'page' && first) {
          setBaseUrl(first.baseUrl);
          setModel(first.model);
          setProvider(first.label);
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled) setStatus({ kind: 'error', message: describe(cause) });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [variant]);

  useEffect(() => {
    if (!loading) onConnectedChange?.(hasStoredKey);
  }, [loading, hasStoredKey, onConnectedChange]);

  // The key field is left out of the payload when it is blank, which the server reads as
  // "keep the stored one". That matters because the browser can never read a saved key
  // back, and providers retire model ids often enough that editing just the model is a
  // routine thing to do — it should not cost the user a trip to find their secret again.
  const draft = useMemo(() => {
    const parsed = llmConfigUpsertSchema.safeParse({
      baseUrl,
      model,
      ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
    });
    return parsed.success ? parsed.data : null;
  }, [baseUrl, apiKey, model]);

  /**
   * The saved key only works for the provider it was saved for: the server will not send
   * it to another host (`LLM_KEY_REQUIRED_FOR_NEW_HOST`), so switching provider, with one
   * click on its card, asks for that provider's key rather than failing on Save.
   */
  const keyHost = (url: string) => {
    try {
      return new URL(url).origin;
    } catch {
      return null;
    }
  };
  const savedKeyFits =
    hasStoredKey && saved !== null && keyHost(saved.baseUrl) === keyHost(baseUrl);
  /** First-time setup, or a new provider, has no key on file to fall back on. */
  const needsKey = !savedKeyFits && apiKey.trim() === '';
  const canSubmit = Boolean(draft) && !needsKey;
  const changed =
    apiKey.trim() !== '' || saved === null || saved.baseUrl !== baseUrl || saved.model !== model;

  const handleSave = async () => {
    if (!draft) return;
    setStatus({ kind: 'saving' });
    setTestResult(null);
    try {
      await saveLlmConfig(draft);
      setApiKey('');
      setHasStoredKey(true);
      setSaved({ baseUrl: draft.baseUrl, model: draft.model });
      setStatus({ kind: 'saved' });
      onSaved?.({ model: draft.model });
    } catch (cause) {
      setStatus({ kind: 'error', message: describe(cause) });
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      setTestResult(await testLlmConfig(draft ?? undefined));
    } catch (cause) {
      setTestResult({ ok: false, error: describe(cause) });
    } finally {
      setTesting(false);
    }
  };

  const handleRemove = async () => {
    setStatus({ kind: 'saving' });
    try {
      await deleteLlmConfig();
      setBaseUrl('');
      setApiKey('');
      setModel('');
      setProvider(CUSTOM);
      setSaved(null);
      setHasStoredKey(false);
      setTestResult(null);
      setStatus({ kind: 'idle' });
    } catch (cause) {
      setStatus({ kind: 'error', message: describe(cause) });
    }
  };

  const applyPreset = (preset: Preset) => {
    setBaseUrl(preset.baseUrl);
    setModel(preset.model);
    setProvider(preset.label);
  };

  if (loading) {
    return (
      <p className={panel ? 'rt-assistant-setup-status' : 'text-sm text-rt-ink-muted'}>
        Loading your AI settings…
      </p>
    );
  }

  if (panel) {
    return (
      <form
        className="rt-assistant-setup-form"
        onSubmit={(event) => {
          event.preventDefault();
          void handleSave();
        }}
      >
        <header className="rt-assistant-setup-form-header">
          <h3 id="assistant-provider-setup-title" className="rt-assistant-setup-form-title">
            Set up your provider
          </h3>
          <p className="rt-assistant-setup-form-copy">
            The assistant runs on your LLM account. RoundTable never pays for or sees your
            inference.
          </p>
        </header>

        <div className="rt-assistant-setup-presets">
          {LLM_PROVIDER_PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => applyPreset(preset)}
              className="rt-assistant-chip"
            >
              {preset.label}
            </button>
          ))}
        </div>

        <label className="rt-assistant-setup-field">
          Base URL
          <input
            className="rt-assistant-input"
            value={baseUrl}
            onChange={(event) => setBaseUrl(event.target.value)}
            placeholder="https://api.openai.com/v1"
            autoComplete="off"
            spellCheck={false}
            autoFocus
          />
        </label>
        <label className="rt-assistant-setup-field">
          API key
          <input
            className="rt-assistant-input"
            type="password"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder={savedKeyFits ? '•••••••••••••• (saved)' : 'sk-…'}
            autoComplete="off"
          />
        </label>
        <label className="rt-assistant-setup-field">
          Model
          <input
            className="rt-assistant-input"
            value={model}
            onChange={(event) => setModel(event.target.value)}
            placeholder="gpt-4o-mini"
            autoComplete="off"
            spellCheck={false}
          />
        </label>

        <div className="rt-assistant-setup-actions">
          <button
            type="submit"
            disabled={!canSubmit || status.kind === 'saving'}
            className="rt-assistant-send"
          >
            {status.kind === 'saving' ? 'Saving…' : 'Save'}
          </button>
          <button
            type="button"
            onClick={() => void handleTest()}
            disabled={testing || needsKey}
            className="rt-assistant-setup-secondary"
          >
            {testing ? 'Testing…' : 'Test'}
          </button>
          {onCancel && (
            <button type="button" onClick={onCancel} className="rt-assistant-icon-btn">
              Cancel
            </button>
          )}
        </div>

        {status.kind === 'error' && <p className="rt-assistant-setup-error">{status.message}</p>}
        {testResult && (
          <p className={testResult.ok ? 'rt-assistant-setup-status' : 'rt-assistant-setup-error'}>
            {testResult.ok
              ? `Connected${testResult.latencyMs ? ` in ${testResult.latencyMs} ms` : ''}${
                  testResult.model ? ` · ${testResult.model}` : ''
                }.`
              : (testResult.error ?? 'Connection failed.')}
            {!testResult.ok && testResult.code && (
              <>
                {' '}
                <code className="rt-assistant-error-code">{testResult.code}</code>
              </>
            )}
          </p>
        )}
        {testResult && !testResult.ok && testResult.detail && (
          <p className="rt-assistant-setup-detail">{testResult.detail}</p>
        )}
      </form>
    );
  }

  const preset = LLM_PROVIDER_PRESETS.find((each) => each.label === provider);
  const choice = preset ? PROVIDER_CHOICES[preset.label] : null;
  const savedLabel = saved ? providerFor(saved.baseUrl) : CUSTOM;
  const savedChoice = savedLabel === CUSTOM ? null : PROVIDER_CHOICES[savedLabel];

  return (
    <div className="flex flex-col gap-6">
      {/* Whether the assistant can be used in a session, before anything else. */}
      <div
        className={`flex items-center gap-4 rounded-3xl border px-5 py-4 ${
          hasStoredKey
            ? 'border-rt-secondary/30 bg-rt-secondary-wash'
            : 'border-rt-tertiary/70 bg-rt-surface-alt'
        }`}
      >
        <span
          aria-hidden
          className={`flex size-10 shrink-0 items-center justify-center rounded-full ${
            hasStoredKey ? 'bg-rt-secondary text-rt-ink' : 'bg-rt-surface text-rt-ink-muted'
          }`}
        >
          <Sparkles size={17} />
        </span>
        <div className="min-w-0">
          <p className="text-[15px] font-semibold text-rt-ink">
            {hasStoredKey ? 'Assistant is on' : 'Assistant is off'}
          </p>
          <p className="text-[13.5px] text-rt-ink-muted">
            {hasStoredKey && saved
              ? `Using ${saved.model}${savedChoice ? ` through ${savedChoice.name}` : ''}. Open it from the side panel in a session.`
              : 'Connect your own AI provider to draft and research proposals in a session.'}
          </p>
        </div>
      </div>

      <form
        aria-labelledby="assistant-provider-title"
        className={SETTINGS_CARD}
        onSubmit={(event) => {
          event.preventDefault();
          void handleSave();
        }}
      >
        <h2 id="assistant-provider-title" className={SETTINGS_CARD_TITLE}>
          Provider
        </h2>
        <p className="mt-1.5 text-[13.5px] text-rt-ink-muted">
          Pick where your assistant runs. Any OpenAI-compatible service works. RoundTable never pays
          for or reads what it does.
        </p>

        <div
          role="radiogroup"
          aria-label="Provider"
          className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
        >
          {[...LLM_PROVIDER_PRESETS.map((each) => each.label), CUSTOM].map((label) => {
            const selected = provider === label;
            const option =
              label === CUSTOM
                ? { name: 'Custom', where: 'Any compatible URL' }
                : PROVIDER_CHOICES[label as Preset['label']];
            return (
              <button
                key={label}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => {
                  const picked = LLM_PROVIDER_PRESETS.find((each) => each.label === label);
                  if (picked) {
                    applyPreset(picked);
                    return;
                  }
                  // Custom: an address of the person's own, so a preset's is cleared.
                  setProvider(CUSTOM);
                  if (providerFor(baseUrl) !== CUSTOM) setBaseUrl('');
                }}
                className={`relative cursor-pointer rounded-2xl border px-4 py-3 text-left transition-colors focus-visible:ring-2 focus-visible:ring-rt-secondary focus-visible:outline-none ${
                  selected
                    ? 'border-rt-secondary bg-rt-secondary-wash'
                    : 'border-rt-tertiary/80 hover:border-rt-ink-faint hover:bg-rt-surface-alt'
                }`}
              >
                <span className="block text-[14px] font-semibold text-rt-ink">{option.name}</span>
                <span
                  className={`block text-[12.5px] ${selected ? 'text-rt-secondary-deep' : 'text-rt-ink-muted'}`}
                >
                  {option.where}
                </span>
                {selected ? (
                  <span
                    aria-hidden
                    className="absolute top-3 right-3 flex size-5 items-center justify-center rounded-full bg-rt-secondary text-rt-ink"
                  >
                    <Check size={12} strokeWidth={3} />
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        <div className="mt-6 flex flex-col gap-6 border-t border-rt-tertiary/70 pt-6">
          <div>
            <div className="flex items-baseline justify-between">
              <label htmlFor="assistant-base-url" className={FIELD}>
                Base URL
              </label>
              {preset && baseUrl !== preset.baseUrl ? (
                <button
                  type="button"
                  onClick={() => setBaseUrl(preset.baseUrl)}
                  className="cursor-pointer text-[13px] font-medium text-rt-ink-muted hover:text-rt-ink hover:underline"
                >
                  Reset
                </button>
              ) : null}
            </div>
            <input
              id="assistant-base-url"
              className={`${TEXT_INPUT} ${MONO} mt-2`}
              value={baseUrl}
              onChange={(event) => setBaseUrl(event.target.value)}
              placeholder="https://api.example.com/v1"
              autoComplete="off"
              spellCheck={false}
            />
            <p className={FIELD_HINT}>
              {preset
                ? 'Filled in for you. Only change it for a custom endpoint.'
                : 'Usually ends in /v1. The assistant adds /chat/completions.'}
            </p>
          </div>

          <div>
            <PasswordInput
              label="API key"
              revealNoun="key"
              className={FIELD}
              inputClassName={`${TEXT_INPUT} ${MONO}`}
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder={savedKeyFits ? '•••••••••••••• (saved)' : 'sk-…'}
              autoComplete="off"
            />
            <p className={FIELD_HINT}>
              {savedKeyFits
                ? 'A key is saved. Leave this blank to keep it, or type a new one to replace it.'
                : hasStoredKey
                  ? 'Your saved key is only ever sent to the provider it was saved for. Enter the key for this one.'
                  : choice?.local
                    ? 'Local servers ignore the key, so any text works, such as “local”.'
                    : 'Find it in your provider’s dashboard under API keys. It is stored encrypted and never shown again.'}
            </p>
          </div>

          <div>
            <label className={FIELD}>
              Model
              <input
                className={`${TEXT_INPUT} ${MONO}`}
                value={model}
                onChange={(event) => setModel(event.target.value)}
                placeholder="gpt-4o-mini"
                autoComplete="off"
                spellCheck={false}
              />
            </label>
            <p className={FIELD_HINT}>
              Type it exactly as your provider names it{choice ? ', or pick one:' : '.'}
            </p>
            {choice ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {choice.models.map((name) => (
                  <button
                    key={name}
                    type="button"
                    aria-pressed={model === name}
                    onClick={() => setModel(name)}
                    className={`cursor-pointer rounded-full px-3 py-1 font-mono text-[12.5px] transition-colors focus-visible:ring-2 focus-visible:ring-rt-secondary focus-visible:outline-none ${
                      model === name
                        ? 'bg-rt-ink text-white'
                        : 'bg-rt-surface-alt text-rt-ink-muted hover:bg-rt-tertiary/50 hover:text-rt-ink'
                    }`}
                  >
                    {name}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-rt-tertiary/70 pt-6">
          {hasStoredKey ? (
            <button
              type="button"
              onClick={() => void handleRemove()}
              disabled={status.kind === 'saving'}
              className="mr-auto cursor-pointer rounded-full px-3 py-2 text-[13px] font-semibold text-rt-ink-muted hover:bg-rt-surface-alt hover:text-red-700"
            >
              Disconnect
            </button>
          ) : (
            <span className="mr-auto" />
          )}
          <button
            type="button"
            onClick={() => void handleTest()}
            disabled={testing || needsKey}
            className={SECONDARY_BUTTON}
          >
            {testing ? 'Testing…' : 'Test connection'}
          </button>
          <button
            type="submit"
            disabled={!canSubmit || !changed || status.kind === 'saving'}
            className={PRIMARY_BUTTON}
          >
            {status.kind === 'saving' ? 'Saving…' : 'Save'}
          </button>
        </div>

        <div aria-live="polite" className="empty:hidden mt-4 flex flex-col gap-1">
          {status.kind === 'saved' && (
            <p className="text-sm text-rt-secondary-deep">
              Saved. The assistant is ready to use in a session.
            </p>
          )}
          {status.kind === 'error' && <p className="text-sm text-red-600">{status.message}</p>}
          {testResult && (
            <p className={`text-sm ${testResult.ok ? 'text-emerald-700' : 'text-red-600'}`}>
              {testResult.ok
                ? `Connected${testResult.latencyMs ? ` in ${testResult.latencyMs} ms` : ''}${
                    testResult.model ? ` · ${testResult.model}` : ''
                  }.`
                : (testResult.error ?? 'Connection failed.')}
              {!testResult.ok && testResult.code && (
                <>
                  {' '}
                  <code className="rounded bg-red-50 px-1 font-mono text-xs">
                    {testResult.code}
                  </code>
                </>
              )}
            </p>
          )}
          {testResult && !testResult.ok && testResult.detail && (
            <p className="font-mono text-xs wrap-break-word text-red-600/80">{testResult.detail}</p>
          )}
        </div>
      </form>
    </div>
  );
}

function describe(cause: unknown): string {
  return cause instanceof Error && cause.message ? cause.message : 'Something went wrong.';
}
