import React from 'react';

export function PasswordInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      type="password"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Password"
      className="password-input"
    />
  );
}
