export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: string };

export const NOT_AVAILABLE = 'Not available yet.';

/** Small JSON fetch with the session bearer. 404 and network errors become a quiet "not available yet". */
export async function callApi<T>(
  url: string,
  sessionToken: string | null,
  method: 'GET' | 'POST' | 'DELETE' = 'GET',
  body?: unknown,
): Promise<ApiResult<T>> {
  const headers: Record<string, string> = {};
  if (sessionToken) headers.Authorization = `Bearer ${sessionToken}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  try {
    const res = await fetch(url, {
      method,
      headers,
      credentials: 'include',
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (res.status === 404) return { ok: false, status: 404, error: NOT_AVAILABLE };
    const json = (await res.json().catch(() => ({}))) as T & { error?: string };
    if (!res.ok) return { ok: false, status: res.status, error: json.error ?? `Request failed (${res.status}).` };
    return { ok: true, data: json };
  } catch {
    return { ok: false, status: 0, error: NOT_AVAILABLE };
  }
}

export const inputClass =
  'bg-[var(--ink)] border border-[var(--hairline)] px-2.5 py-1.5 text-[11px] text-[var(--bright)] min-w-0 max-w-full';
export const smallBtnClass =
  'retro-btn-glass px-2.5 py-1.5 text-[11px] font-semibold text-[var(--bright)] hover:text-[var(--lime)] cursor-pointer disabled:opacity-50 shrink-0';
export const labelClass = 'font-pixel text-[10px] uppercase tracking-[0.16em] text-[var(--g2-phosphor)]';
