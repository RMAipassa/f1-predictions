'use client';

import InstallApp from '@/components/InstallApp';
import ThemeToggle from '@/components/ThemeToggle';

export default function FloatingActions() {
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2">
      <InstallApp />
      <ThemeToggle />
    </div>
  );
}
