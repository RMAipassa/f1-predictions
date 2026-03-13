'use client';

import type { ReactNode } from 'react';
import { useFormStatus } from 'react-dom';

type Props = {
  className?: string;
  children: ReactNode;
  pendingChildren?: ReactNode;
};

export default function PendingSubmitButton({ className, children, pendingChildren }: Props) {
  const { pending } = useFormStatus();

  return (
    <button className={className} type="submit" disabled={pending} aria-busy={pending}>
      {pending ? pendingChildren ?? children : children}
    </button>
  );
}
