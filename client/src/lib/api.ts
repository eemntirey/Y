const BASE = '/api';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

let token: string | null = localStorage.getItem('y.token');
let refreshToken: string | null = localStorage.getItem('y.refresh');
let onUnauthorised: (() => void) | null = null;

export const auth = {
  get token() {
    return token;
  },
  get refresh() {
    return refreshToken;
  },
  set(next: { token?: string; refresh?: string } | null) {
    if (next?.token) {
      token = next.token;
      localStorage.setItem('y.token', next.token);
    }
    if (next?.refresh) {
      refreshToken = next.refresh;
      localStorage.setItem('y.refresh', next.refresh);
    }
    if (next === null) {
      token = null;
      refreshToken = null;
      localStorage.removeItem('y.token');
      localStorage.removeItem('y.refresh');
    }
  },
  onUnauthorised(fn: () => void) {
    onUnauthorised = fn;
  },
};

let refreshing: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  if (!refreshToken) return false;
  refreshing ??= (async () => {
    try {
      const res = await fetch(`${BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh: refreshToken }),
      });
      if (!res.ok) {
        auth.set(null);
        return false;
      }
      const data = (await res.json()) as { token: string; refresh: string };
      auth.set(data);
      return true;
    } catch {
      return false;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  raw?: BodyInit;
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { ...(options.headers as Record<string, string>) };
  if (token) headers.Authorization = `Bearer ${token}`;

  let body: BodyInit | undefined;
  if (options.raw !== undefined) body = options.raw;
  else if (options.body instanceof FormData) body = options.body;
  else if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.body);
  }

  let res = await fetch(`${BASE}${path}`, { ...options, headers, body });

  if (res.status === 401 && (await tryRefresh())) {
    headers.Authorization = `Bearer ${token}`;
    res = await fetch(`${BASE}${path}`, { ...options, headers, body });
  }

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (!res.ok) {
    if (res.status === 401) onUnauthorised?.();
    throw new ApiError(res.status, data?.error ?? `Erreur ${res.status}`);
  }
  return data as T;
}

/** Les chemins "seed:*" sont des visuels générés, le reste est servi par /media. */
export const mediaUrl = (src: string): string => {
  if (src.startsWith('seed:') || /^https?:\/\//.test(src)) return src;
  return `/media/${src.replace(/^\/+/, '')}`;
};


export const get = <T>(path: string) => request<T>(path);
export const post = <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body });
export const patch = <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body });
export const del = <T>(path: string) => request<T>(path, { method: 'DELETE' });

export const qs = (params: Record<string, string | number | undefined | null>): string => {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') sp.set(k, String(v));
  const s = sp.toString();
  return s ? `?${s}` : '';
};
