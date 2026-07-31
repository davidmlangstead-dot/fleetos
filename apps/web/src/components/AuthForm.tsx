import React from 'react';

export function AuthForm({ children, onSubmit }: { children?: React.ReactNode; onSubmit?: (e: React.FormEvent) => void }) {
  return (
    <form onSubmit={onSubmit} className="auth-form">
      {children}
    </form>
  );
}
