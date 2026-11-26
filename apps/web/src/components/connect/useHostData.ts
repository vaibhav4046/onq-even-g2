import { useCallback, useEffect, useRef, useState } from 'react';
import { callApi } from './api';
import {
  normalizeDevices,
  normalizeOutbox,
  normalizeProfile,
  normalizeSources,
  type DeviceRow,
  type HostView,
  type OutboxRow,
  type SourceRow,
} from './hostModel';

/** `null` data with `available: false` means the endpoint answered 404 or the server is unreachable. */
export interface Loaded<T> {
  data: T;
  available: boolean;
  loading: boolean;
  error: string;
}

const POLL_MS = 15_000;
const init = <T,>(data: T): Loaded<T> => ({ data, available: false, loading: true, error: '' });

/**
 * One place that loads host profile, sources, outbox and paired devices. It refetches on the SSE `host` and `outbox`
 * events and polls sources / outbox every 15 s while the tab is visible (sync age and breaker change without an event).
 */
export function useHostData(sessionToken: string | null) {
  const [profile, setProfile] = useState<Loaded<HostView | null>>(init<HostView | null>(null));
  const [sources, setSources] = useState<Loaded<SourceRow[]>>(init<SourceRow[]>([]));
  const [outbox, setOutbox] = useState<Loaded<OutboxRow[]>>(init<OutboxRow[]>([]));
  const [devices, setDevices] = useState<Loaded<DeviceRow[]>>(init<DeviceRow[]>([]));
  const tokenRef = useRef(sessionToken);
  tokenRef.current = sessionToken;

  const loadProfile = useCallback(async () => {
    const out = await callApi<unknown>('/api/host/profile', tokenRef.current);
    setProfile((prev) => {
      if (!out.ok) return { data: prev.data, available: false, loading: false, error: out.error };
      const view = normalizeProfile(out.data);
      return view ? { data: view, available: true, loading: false, error: '' } : { ...prev, loading: false };
    });
  }, []);

  const loadSources = useCallback(async () => {
    const out = await callApi<unknown>('/api/sources', tokenRef.current);
    setSources((prev) =>
      out.ok
        ? { data: normalizeSources(out.data), available: true, loading: false, error: '' }
        : { data: out.status === 404 ? [] : prev.data, available: out.status === 404 ? false : prev.available, loading: false, error: out.error },
    );
  }, []);

  const loadOutbox = useCallback(async () => {
    const out = await callApi<unknown>('/api/outbox', tokenRef.current);
    setOutbox((prev) =>
      out.ok
        ? { data: normalizeOutbox(out.data), available: true, loading: false, error: '' }
        : { data: out.status === 404 ? [] : prev.data, available: out.status === 404 ? false : prev.available, loading: false, error: out.error },
    );
  }, []);

  const loadDevices = useCallback(async () => {
    const out = await callApi<unknown>('/api/pair/devices', tokenRef.current);
    setDevices((prev) =>
      out.ok
        ? { data: normalizeDevices(out.data), available: true, loading: false, error: '' }
        : { data: prev.data, available: false, loading: false, error: out.error },
    );
  }, []);

  useEffect(() => {
    if (!sessionToken) return;
    void loadProfile();
    void loadSources();
    void loadOutbox();
    void loadDevices();
    const tick = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      void loadSources();
      void loadOutbox();
    }, POLL_MS);
    let es: EventSource | null = null;
    if (typeof EventSource !== 'undefined') {
      es = new EventSource(`/api/stream?token=${encodeURIComponent(sessionToken)}`);
      es.addEventListener('host', () => {
        void loadProfile();
        void loadSources();
        void loadDevices();
      });
      es.addEventListener('outbox', () => void loadOutbox());
    }
    return () => {
      window.clearInterval(tick);
      es?.close();
    };
  }, [sessionToken, loadProfile, loadSources, loadOutbox, loadDevices]);

  return { profile, sources, outbox, devices, loadProfile, loadSources, loadOutbox, loadDevices };
}
