import { requireUser } from '@/lib/auth';
import { subscribeEvents } from '@/lib/events';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function encodeSse(event: string, data: any) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function GET() {
  // Require auth cookie so only your group can listen.
  await requireUser();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const enc = new TextEncoder();
      controller.enqueue(enc.encode(encodeSse('hello', { ok: true })));

      const unsubscribe = subscribeEvents(({ type, data }) => {
        controller.enqueue(enc.encode(encodeSse(type, data)));
      });

      const keepAlive = setInterval(() => {
        controller.enqueue(enc.encode(': keep-alive\n\n'));
      }, 15000);

      // @ts-ignore - underlying signal is present in Node runtime
      const close = () => {
        clearInterval(keepAlive);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // ignore
        }
      };

      // If the client disconnects, the controller will error; treat that as close.
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      controller.error = ((orig) => (err: any) => {
        close();
        // @ts-ignore
        orig?.call(controller, err);
      })(controller.error);
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
