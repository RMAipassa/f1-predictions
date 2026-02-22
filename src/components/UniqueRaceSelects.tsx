'use client';

import { useMemo, useState } from 'react';

type Driver = {
  driver_id: string;
  given_name: string;
  family_name: string;
  code?: string | null;
};

type Field = { name: string; label: string };

export default function UniqueRaceSelects({
  fields,
  drivers,
  initial,
  disabled,
  disabledFields,
  uniqueGroup,
}: {
  fields: Field[];
  drivers: Driver[];
  initial?: Record<string, string>;
  disabled: boolean;
  disabledFields?: Record<string, boolean>;
  // Fields with the same group value must be unique with each other.
  // Fields with different groups may share the same driver.
  uniqueGroup?: Record<string, string>;
}) {
  const options = useMemo(() => {
    return drivers.map((d) => ({
      value: d.driver_id,
      label: `${d.family_name}, ${d.given_name}${d.code ? ` (${d.code})` : ''}`,
    }));
  }, [drivers]);

  const init = useMemo(() => {
    const m: Record<string, string> = {};
    for (const f of fields) m[f.name] = initial?.[f.name] ?? '';
    return m;
  }, [fields, initial]);

  const [values, setValues] = useState<Record<string, string>>(init);

  return (
    <div className="grid gap-3">
      {fields.map((f) => {
        const current = values[f.name] ?? '';
        const isDisabled = disabled || Boolean(disabledFields?.[f.name]);
        const group = uniqueGroup?.[f.name] ?? 'all';
        const taken = new Set(
          Object.entries(values)
            .filter(([k, v]) => k !== f.name && v && (uniqueGroup?.[k] ?? 'all') === group)
            .map(([, v]) => v)
        );
        const filtered = options.filter((o) => !taken.has(o.value) || o.value === current);

        return (
          <label key={f.name} className="block">
            <div className="text-sm font-semibold">{f.label}</div>
            <select
              className="mt-1 w-full field"
              name={f.name}
              value={current}
              disabled={isDisabled}
              onChange={(e) => {
                const next = e.target.value;
                setValues((prev) => ({ ...prev, [f.name]: next }));
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
  );
}
