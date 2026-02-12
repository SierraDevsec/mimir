import { useEffect, useState, useRef, useCallback } from "react";
import { useWebSocket } from "./useWebSocket";

interface UseQueryOptions<T> {
  fetcher: () => Promise<T>;
  deps?: unknown[];
  reloadOnEvents?: boolean | ((event: { event: string; data?: unknown }) => boolean);
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
  const { events, reconnectCount } = useWebSocket();
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
    if (reloadOnEvents && events.length > 0) {
      const shouldReload = typeof reloadOnEvents === "function" ? reloadOnEvents(events[0]) : true;
      if (shouldReload) {
        clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(reload, 500);
      }
    }
    return () => clearTimeout(debounceRef.current);
  }, [latestEventId, reload, reloadOnEvents]);

  return { data, loading, error, reload };
}
