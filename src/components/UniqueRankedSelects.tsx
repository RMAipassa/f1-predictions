'use client';

import { useMemo, useState } from 'react';

type Option = { value: string; label: string };

function keyFor(prefix: string, idx: number) {
  return `${prefix}${idx}`;
}

export default function UniqueRankedSelects({
  prefix,
  slots,
  options,
  initial,
  disabled,
  className,
}: {
  prefix: string;
  slots: number;
  options: Option[];
  initial?: Record<string, string>;
  disabled: boolean;
  className?: string;
}) {
  const initArr = useMemo(() => {
    const a: string[] = Array.from({ length: slots }).map((_, i) => {
      const k = keyFor(prefix, i + 1);
      return initial?.[k] ?? '';
    });
    return a;
  }, [initial, prefix, slots]);

  const [values, setValues] = useState<string[]>(initArr);

  const duplicates = useMemo(() => {
    const seen = new Map<string, number>();
    const dup = new Set<number>();
    for (let i = 0; i < values.length; i++) {
      const v = values[i];
      if (!v) continue;
      const prev = seen.get(v);
      if (typeof prev === 'number') {
        dup.add(prev);
        dup.add(i);
      } else {
        seen.set(v, i);
      }
    }
    return dup;
  }, [values]);

  return (
    <div className={className}>
      {duplicates.size ? (
        <div className="mb-3 text-sm text-red-700">
          Duplicate picks detected. Each slot must be unique.
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {Array.from({ length: slots }).map((_, idx) => {
          const p = idx + 1;
          const name = keyFor(prefix, p);
          const current = values[idx] ?? '';

          const taken = new Set(values.filter((v, i) => i !== idx && v));
          const filtered = options.filter((o) => !taken.has(o.value) || o.value === current);

          return (
            <label key={name} className="block">
              <div className="text-sm font-semibold">P{p}</div>
              <select
                className={`mt-1 w-full field ${duplicates.has(idx) ? 'ring-2 ring-red-400/60' : ''}`}
                name={name}
                value={current}
                disabled={disabled}
                onChange={(e) => {
                  const next = e.target.value;
                  setValues((prev) => {
                    const copy = prev.slice();
                    copy[idx] = next;
                    return copy;
                  });
                }}
              >
                <option value="">—</option>
                {filtered.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          );
        })}
      </div>
    </div>
  );
}
