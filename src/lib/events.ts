type Listener = (event: { type: string; data: any }) => void;

declare global {
  // eslint-disable-next-line no-var
  var __F1P_LISTENERS__: Set<Listener> | undefined;
}

function listeners() {
  if (!globalThis.__F1P_LISTENERS__) globalThis.__F1P_LISTENERS__ = new Set();
  return globalThis.__F1P_LISTENERS__;
}

export function publishEvent(type: string, data: any) {
  for (const l of listeners()) {
    try {
      l({ type, data });
    } catch {
      // ignore
    }
  }
}

export function subscribeEvents(listener: Listener) {
  listeners().add(listener);
  return () => {
    listeners().delete(listener);
  };
}
