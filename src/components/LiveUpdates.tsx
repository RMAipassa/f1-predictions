'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function LiveUpdates() {
  const router = useRouter();

  useEffect(() => {
    let es: EventSource | null = null;
    let closed = false;

    const connect = () => {
      if (closed) return;
      es = new EventSource('/api/events');

      const refresh = () => router.refresh();
      es.addEventListener('race_results_updated', refresh);
      es.addEventListener('season_data_updated', refresh);
      es.addEventListener('random_reviews_updated', refresh);
      es.addEventListener('join_requests_updated', refresh);
      es.addEventListener('leagues_updated', refresh);

      es.addEventListener('error', () => {
        try {
          es?.close();
        } catch {}
        es = null;
        // retry
        setTimeout(connect, 2000);
      });
    };

    connect();
    return () => {
      closed = true;
      try {
        es?.close();
      } catch {}
    };
  }, [router]);

  return null;
}
