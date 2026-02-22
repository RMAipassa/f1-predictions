'use client';

import { useEffect, useMemo, useState } from 'react';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>; // Chromium
};

function isStandalone() {
  if (typeof window === 'undefined') return false;
  // iOS Safari
  // @ts-expect-error - navigator.standalone exists on iOS Safari
  if (typeof navigator !== 'undefined' && navigator.standalone) return true;
  return window.matchMedia?.('(display-mode: standalone)').matches ?? false;
}

function isIosSafari() {
  if (typeof window === 'undefined') return false;
  const ua = window.navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) ||
    // iPadOS 13+ reports as Mac; detect touch
    (/Macintosh/.test(ua) && (window.navigator as any).maxTouchPoints > 1);
  const isWebKit = /WebKit/.test(ua);
  const isCriOS = /CriOS/.test(ua);
  const isFxiOS = /FxiOS/.test(ua);
  return Boolean(isIOS && isWebKit && !isCriOS && !isFxiOS);
}

export default function InstallApp() {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosHelp, setShowIosHelp] = useState(false);
  const standalone = useMemo(() => isStandalone(), []);
  const ios = useMemo(() => isIosSafari(), []);

  useEffect(() => {
    if (standalone) return;

    const onBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setPromptEvent(e as BeforeInstallPromptEvent);
    };

    const onAppInstalled = () => {
      setPromptEvent(null);
      setShowIosHelp(false);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onAppInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, [standalone]);

  if (standalone) return null;

  const canPrompt = Boolean(promptEvent);
  const show = canPrompt || ios;
  if (!show) return null;

  return (
    <>
      <button
        type="button"
        className="btn btn-primary"
        onClick={async () => {
          if (promptEvent) {
            try {
              await promptEvent.prompt();
              await promptEvent.userChoice;
            } catch {
              // ignore
            }
            setPromptEvent(null);
            return;
          }
          if (ios) setShowIosHelp(true);
        }}
        aria-label="Install app"
        title="Install as an app"
      >
        <span className="mono text-xs">INSTALL</span>
      </button>

      {ios && showIosHelp ? (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            className="absolute inset-0"
            style={{ background: 'rgba(0,0,0,0.35)' }}
            onClick={() => setShowIosHelp(false)}
            aria-label="Close install help"
          />
          <div className="shell" style={{ pointerEvents: 'none' }}>
            <div
              className="card-solid p-5 max-w-md"
              style={{ pointerEvents: 'auto', marginLeft: 'auto', marginRight: 0, marginTop: '12vh' }}
            >
              <div className="text-lg font-semibold">Install on iPhone/iPad</div>
              <div className="mt-2 text-sm muted">
                In Safari, tap <span className="mono">Share</span> then <span className="mono">Add to Home Screen</span>.
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <button type="button" className="btn" onClick={() => setShowIosHelp(false)}>
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
