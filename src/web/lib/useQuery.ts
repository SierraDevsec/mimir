import { useEffect, useState, useRef, useCallback } from "react";
import { useSharedWebSocket } from "./WebSocketContext";

interface UseQueryOptions<T> {
  fetcher: () => Promise<T>;
  deps?: unknown[];
  /**
   * Controls when a WebSocket event triggers a data reload.
   *
   * - `true` (default): reload on any event
   * - `false`: never reload on events
   * - `string[]`: reload only when the event type matches one of the given strings
   * - `(event) => boolean`: custom predicate
   */
  reloadOnEvents?: boolean | string[] | ((event: { event: string; data?: unknown }) => boolean);
}

interface UseQueryResult<T> {
  data: T | undefined;
  loading: boolean;
  error: Error | null;
  reload: () => void;
}

export function useQuery<T>({
  fetcher,
  deps = [],
  reloadOnEvents = true,
}: UseQueryOptions<T>): UseQueryResult<T> {
  const [data, setData] = useState<T | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const { events, reconnectCount } = useSharedWebSocket();
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const reload = useCallback(() => {
    setLoading(true);
    setError(null);
    fetcherRef.current()
      .then((result) => {
        setData(result);
        setLoading(false);
      })
      .catch((err) => {
        setError(err instanceof Error ? err : new Error(String(err)));
        setLoading(false);
      });
  }, []);

  const depsKey = JSON.stringify(deps);

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reload, reconnectCount, depsKey]);

  const latestEventId = events[0]?.timestamp ?? 0;

  useEffect(() => {
    if (reloadOnEvents === false || events.length === 0) return;

    const latestEvent = events[0];
    let shouldReload: boolean;

    if (typeof reloadOnEvents === "function") {
      shouldReload = reloadOnEvents(latestEvent);
    } else if (Array.isArray(reloadOnEvents)) {
      shouldReload = reloadOnEvents.includes(latestEvent.event);
    } else {
      // boolean true
      shouldReload = true;
    }

    if (shouldReload) {
      clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(reload, 500);
    }

    return () => clearTimeout(debounceRef.current);
  }, [latestEventId, reload, reloadOnEvents]);

  return { data, loading, error, reload };
}
