// F33 — "bring your own LLM" settings.
//
// The key is write-only by design: once saved it never comes back from the server, so the
// field shows a placeholder rather than a value, and leaving it blank on a re-save is
// treated as "keep the key I already have".
import { useEffect, useMemo, useState } from 'react';
import {
  llmConfigUpsertSchema,
  LLM_PROVIDER_PRESETS,
  type LlmConfigTestResult,
} from '@roundtable/shared';

import { Button } from '../../components/ui/Button';
import { Field, Input } from '../../components/ui/Input';
import { deleteLlmConfig, fetchLlmConfig, saveLlmConfig, testLlmConfig } from '../assistant/api';

type Status =
  { kind: 'idle' } | { kind: 'saving' } | { kind: 'saved' } | { kind: 'error'; message: string };

export function LlmSettingsForm() {
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('');
  const [hasStoredKey, setHasStoredKey] = useState(false);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<LlmConfigTestResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchLlmConfig()
      .then(({ config }) => {
        if (cancelled || !config) return;
        setBaseUrl(config.baseUrl);
        setModel(config.model);
        setHasStoredKey(config.hasKey);
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
  }, []);

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

  /** First-time setup has nothing stored to fall back on. */
  const needsKey = !hasStoredKey && apiKey.trim() === '';
  const canSubmit = Boolean(draft) && !needsKey;

  const handleSave = async () => {
    if (!draft) return;
    setStatus({ kind: 'saving' });
    setTestResult(null);
    try {
      await saveLlmConfig(draft);
      setApiKey('');
      setHasStoredKey(true);
      setStatus({ kind: 'saved' });
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
      setHasStoredKey(false);
      setTestResult(null);
      setStatus({ kind: 'idle' });
    } catch (cause) {
      setStatus({ kind: 'error', message: describe(cause) });
    }
  };

  if (loading) {
    return <p className="text-sm text-rt-ink-muted">Loading your AI settings…</p>;
  }

  return (
    <section className="max-w-xl space-y-5">
      <header className="space-y-1">
        <h2 className="text-lg font-semibold text-rt-ink">AI assistant provider</h2>
        <p className="text-sm leading-relaxed text-rt-ink-muted">
          The assistant runs on <em>your</em> LLM account, so RoundTable never pays for or reads
          your inference. Any OpenAI-compatible endpoint works. Your key is encrypted before it is
          stored and is never sent back to the browser.
        </p>
      </header>

      <div className="flex flex-wrap gap-1.5">
        {LLM_PROVIDER_PRESETS.map((preset) => (
          <button
            key={preset.label}
            type="button"
            onClick={() => {
              setBaseUrl(preset.baseUrl);
              setModel(preset.model);
            }}
            className="rounded-full bg-rt-primary-tint px-3 py-1 text-xs font-medium text-rt-ink-muted transition hover:bg-rt-tertiary"
          >
            {preset.label}
          </button>
        ))}
      </div>

      <Field label="Base URL" hint="Usually ends in /v1 — the assistant appends /chat/completions.">
        {({ id, invalid }) => (
          <Input
            id={id}
            invalid={invalid}
            value={baseUrl}
            onChange={(event) => setBaseUrl(event.target.value)}
            placeholder="https://api.openai.com/v1"
            autoComplete="off"
            spellCheck={false}
          />
        )}
      </Field>

      <Field
        label="API key"
        hint={
          hasStoredKey
            ? 'A key is saved — leave this blank to keep it. Type a new one to replace it.'
            : 'Stored encrypted (AES-256-GCM). Never returned by the API.'
        }
      >
        {({ id, invalid }) => (
          <Input
            id={id}
            invalid={invalid}
            type="password"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder={hasStoredKey ? '•••••••••••••• (saved)' : 'sk-…'}
            autoComplete="off"
          />
        )}
      </Field>

      <Field label="Model" hint="Exactly as your provider names it.">
        {({ id, invalid }) => (
          <Input
            id={id}
            invalid={invalid}
            value={model}
            onChange={(event) => setModel(event.target.value)}
            placeholder="gpt-4o-mini"
            autoComplete="off"
            spellCheck={false}
          />
        )}
      </Field>

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={handleSave} disabled={!canSubmit || status.kind === 'saving'}>
          {status.kind === 'saving' ? 'Saving…' : 'Save'}
        </Button>
        <Button variant="secondary" onClick={handleTest} disabled={testing || (!draft && needsKey)}>
          {testing ? 'Testing…' : 'Test connection'}
        </Button>
        {hasStoredKey && (
          <Button variant="quiet" onClick={handleRemove}>
            Remove
          </Button>
        )}
      </div>

      {status.kind === 'saved' && (
        <p className="text-sm text-rt-primary-deep">
          Saved. The assistant is ready to use in a session.
        </p>
      )}
      {status.kind === 'error' && <p className="text-sm text-red-600">{status.message}</p>}

      {testResult && (
        <p className={`text-sm ${testResult.ok ? 'text-rt-primary-deep' : 'text-red-600'}`}>
          {testResult.ok
            ? `Connected${testResult.latencyMs ? ` in ${testResult.latencyMs} ms` : ''}${
                testResult.model ? ` · ${testResult.model}` : ''
              }.`
            : (testResult.error ?? 'Connection failed.')}
        </p>
      )}
    </section>
  );
}

function describe(cause: unknown): string {
  return cause instanceof Error && cause.message ? cause.message : 'Something went wrong.';
}
