'use client';

type Props = {
  label: string;
  value: string | number | null;
  onChange: (value: string | number | null) => void;
  numeric?: boolean;
  full?: boolean;
  step?: string;
  min?: number;
  max?: number;
};

export default function PropertyInput({ label, value, onChange, numeric, full, step = '1', min, max }: Props) {
  return (
    <label className={`ds-field${full ? ' full' : ''}`}>
      {label}
      <input
        className="ds-input"
        type={numeric ? 'number' : 'text'}
        step={numeric ? step : undefined}
        min={min}
        max={max}
        value={value ?? ''}
        onChange={(event) => onChange(numeric ? (event.target.value === '' ? null : Number(event.target.value)) : event.target.value)}
        onBlur={(event) => {
          if (!numeric || event.target.value === '') return;
          const entered = Number(event.target.value);
          const bounded = Math.max(min ?? -Infinity, Math.min(max ?? Infinity, entered));
          if (bounded !== entered) onChange(bounded);
        }}
      />
    </label>
  );
}
