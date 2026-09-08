'use client';

import InstallApp from '@/components/InstallApp';
import ThemeToggle from '@/components/ThemeToggle';

export default function FloatingActions() {
  return (
    <div className="fixed bottom-3 right-3 z-50 flex items-center gap-1 border border-[var(--border)] bg-[var(--card-solid)] p-1 sm:bottom-5 sm:right-5">
      <InstallApp />
      <ThemeToggle />
    </div>
  );
}
