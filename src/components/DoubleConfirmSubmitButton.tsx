'use client';

import type { ReactNode } from 'react';

type Props = {
  className?: string;
  firstMessage: string;
  secondMessage: string;
  children: ReactNode;
};

export default function DoubleConfirmSubmitButton({ className, firstMessage, secondMessage, children }: Props) {
  return (
    <button
      className={className}
      type="submit"
      onClick={(e) => {
        if (!window.confirm(firstMessage)) {
          e.preventDefault();
          return;
        }
        if (!window.confirm(secondMessage)) {
          e.preventDefault();
        }
      }}
    >
      {children}
    </button>
  );
}
