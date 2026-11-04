"use client";

import { ChangeEvent } from "react";

/**
 * A <select> that submits its parent form on change.
 *
 * Client component by necessity: event handlers cannot be serialised from a
 * server component. Used by the admin filter bars.
 */
export default function AutoSubmitSelect({
  name,
  defaultValue,
  options,
  className = "input",
  ariaLabel,
}: {
  name: string;
  defaultValue: string;
  options: { value: string; label: string }[];
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <select
      name={name}
      aria-label={ariaLabel ?? name}
      className={className}
      defaultValue={defaultValue}
      onChange={(e: ChangeEvent<HTMLSelectElement>) => {
        e.currentTarget.form?.requestSubmit();
      }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
