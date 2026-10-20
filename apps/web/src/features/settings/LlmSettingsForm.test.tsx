import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../assistant/api', () => ({
  fetchLlmConfig: vi.fn(),
  saveLlmConfig: vi.fn(),
  testLlmConfig: vi.fn(),
  deleteLlmConfig: vi.fn(),
}));

const api = await import('../assistant/api');
const { LlmSettingsForm } = await import('./LlmSettingsForm');

beforeEach(() => {
  vi.mocked(api.fetchLlmConfig).mockReset();
  vi.mocked(api.saveLlmConfig).mockReset();
  vi.mocked(api.deleteLlmConfig).mockReset();
});

describe('AI assistant settings', () => {
  it('starts a first setup on OpenAI, filled in, and waits for a key', async () => {
    vi.mocked(api.fetchLlmConfig).mockResolvedValue({ config: null });
    const onConnectedChange = vi.fn();
    render(<LlmSettingsForm onConnectedChange={onConnectedChange} />);

    expect(await screen.findByText('Assistant is off')).toBeInTheDocument();
    await waitFor(() => expect(onConnectedChange).toHaveBeenLastCalledWith(false));
    expect(screen.getByRole('radio', { name: /openai/i })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByLabelText('Base URL')).toHaveValue('https://api.openai.com/v1');
    expect(screen.getByLabelText('Model')).toHaveValue('gpt-4o-mini');
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('fills in another provider when it is picked, and a model when one is', async () => {
    vi.mocked(api.fetchLlmConfig).mockResolvedValue({ config: null });
    const user = userEvent.setup();
    render(<LlmSettingsForm />);

    await user.click(await screen.findByRole('radio', { name: /groq/i }));
    expect(screen.getByLabelText('Base URL')).toHaveValue('https://api.groq.com/openai/v1');

    await user.click(screen.getByRole('button', { name: 'llama-3.3-70b-versatile' }));
    expect(screen.getByLabelText('Model')).toHaveValue('llama-3.3-70b-versatile');

    // Changed by hand, it can be put back.
    await user.type(screen.getByLabelText('Base URL'), 'x');
    await user.click(screen.getByRole('button', { name: 'Reset' }));
    expect(screen.getByLabelText('Base URL')).toHaveValue('https://api.groq.com/openai/v1');
  });

  it('saves with a key and says the assistant is on', async () => {
    vi.mocked(api.fetchLlmConfig).mockResolvedValue({ config: null });
    vi.mocked(api.saveLlmConfig).mockResolvedValue(undefined as never);
    const onConnectedChange = vi.fn();
    const user = userEvent.setup();
    render(<LlmSettingsForm onConnectedChange={onConnectedChange} />);

    await user.type(await screen.findByLabelText('API key'), 'sk-test');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(api.saveLlmConfig).toHaveBeenCalledWith({
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-4o-mini',
        apiKey: 'sk-test',
      }),
    );
    expect(await screen.findByText('Assistant is on')).toBeInTheDocument();
    expect(onConnectedChange).toHaveBeenLastCalledWith(true);
    // Nothing more to save until something changes.
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('opens a saved custom provider as Custom, and can disconnect it', async () => {
    vi.mocked(api.fetchLlmConfig).mockResolvedValue({
      config: { baseUrl: 'https://llm.example.com/v1', model: 'house-model', hasKey: true },
    });
    vi.mocked(api.deleteLlmConfig).mockResolvedValue(undefined as never);
    const user = userEvent.setup();
    render(<LlmSettingsForm />);

    expect(await screen.findByText('Assistant is on')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /custom/i })).toHaveAttribute('aria-checked', 'true');

    await user.click(screen.getByRole('button', { name: 'Disconnect' }));
    expect(await screen.findByText('Assistant is off')).toBeInTheDocument();
  });
});
