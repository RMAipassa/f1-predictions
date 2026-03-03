'use client';

import type { ReactNode } from 'react';

type Props = {
  className?: string;
  message: string;
  children: ReactNode;
};

export default function ConfirmSubmitButton({ className, message, children }: Props) {
  return (
    <button
      className={className}
      type="submit"
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
