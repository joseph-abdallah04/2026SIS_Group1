import { type ThemePreference, useThemePreference } from '../../lib/theme';

const OPTIONS: { value: ThemePreference; label: string; hint: string }[] = [
  {
    value: 'system',
    label: 'Match my device',
    hint: 'Light or dark, whichever your device is set to.',
  },
  { value: 'light', label: 'Light', hint: 'Always light.' },
  { value: 'dark', label: 'Dark', hint: 'Always dark.' },
];

/**
 * The Appearance tab of Settings: light, dark, or follow the device. The choice is kept on this
 * device only, and takes effect at once.
 */
export function AppearanceSettings() {
  const [preference, setPreference] = useThemePreference();

  return (
    <section aria-labelledby="appearance-heading">
      <h2 id="appearance-heading" className="text-sm font-semibold text-rt-ink">
        Theme
      </h2>
      <p className="mt-1 max-w-xl text-sm text-rt-ink-muted">
        Choose how RoundTable looks on this device. Cards, drawings and diagrams on the board stay
        light in the dark theme, like paper on a dark desk.
      </p>
      <div
        role="radiogroup"
        aria-labelledby="appearance-heading"
        className="mt-6 flex max-w-xl flex-col gap-3"
      >
        {OPTIONS.map(({ value, label, hint }) => (
          <label
            key={value}
            className="flex cursor-pointer items-start gap-3 rounded-xl border border-rt-tertiary bg-rt-surface p-4 has-[:checked]:border-rt-secondary has-[:checked]:bg-rt-secondary-wash has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-rt-primary-deep"
          >
            <input
              type="radio"
              name="theme"
              value={value}
              checked={preference === value}
              onChange={() => setPreference(value)}
              className="mt-1 accent-rt-secondary"
            />
            <span className="flex flex-col">
              <span className="text-sm font-semibold text-rt-ink">{label}</span>
              <span className="text-sm text-rt-ink-muted">{hint}</span>
            </span>
          </label>
        ))}
      </div>
    </section>
  );
}
