import { requireUser } from '@/lib/auth';
import { subscribeEvents } from '@/lib/events';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function encodeSse(event: string, data: any) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function GET(request: Request) {
  // Require auth cookie so only your group can listen.
  await requireUser();

  const enc = new TextEncoder();
  let cleanup: (() => void) | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      let unsubscribe = () => {};
      let keepAlive: ReturnType<typeof setInterval> | null = null;

      const close = () => {
        if (closed) return;
        closed = true;

        if (keepAlive) {
          try {
            clearInterval(keepAlive);
          } catch {
            // ignore
          }
        }

        try {
          unsubscribe();
        } catch {
          // ignore
        }

        try {
          controller.close();
        } catch {
          // ignore
        }
      };

      cleanup = () => {
        if (closed) return;
        closed = true;

        if (keepAlive) {
          try {
            clearInterval(keepAlive);
          } catch {
            // ignore
          }
        }

        try {
          unsubscribe();
        } catch {
          // ignore
        }
      };

      const send = (payload: string) => {
        if (closed) return;
        try {
          controller.enqueue(enc.encode(payload));
        } catch {
          // Client likely disconnected; stop timers and listeners.
          close();
        }
      };

      send(encodeSse('hello', { ok: true }));

      unsubscribe = subscribeEvents(({ type, data }) => {
        send(encodeSse(type, data));
      });

      keepAlive = setInterval(() => {
        send(': keep-alive\n\n');
      }, 15000);

      // Abort fires when the client disconnects.
      request.signal.addEventListener('abort', close, { once: true });
    },
    cancel() {
      try {
        cleanup?.();
      } catch {
        // ignore
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
