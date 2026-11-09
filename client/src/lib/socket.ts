import { auth, get } from './api';

type Handler = (payload: any) => void;

const handlers = new Set<Handler>();
let socket: WebSocket | null = null;
let retries = 0;
let closed = false;
let refreshingSocketAuth = false;

function connect(): void {
  if (closed || socket?.readyState === WebSocket.OPEN || socket?.readyState === WebSocket.CONNECTING) return;
  const token = auth.token;
  if (!token) return;

  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${proto}://${location.host}/ws`);
  socket = ws;

  ws.onopen = () => {
    retries = 0;
    ws.send(JSON.stringify({ type: 'auth', token }));
  };

  ws.onmessage = (event) => {
    let payload: any;
    try {
      payload = JSON.parse(event.data);
    } catch {
      return;
    }
    for (const handler of handlers) handler(payload);
  };

  ws.onclose = (event) => {
    socket = null;
    if (closed) return;

    // A rejected/expired access token may be refreshed through the existing
    // HTTP refresh flow before the WebSocket reconnects.
    if (event.code === 4401 && !refreshingSocketAuth) {
      refreshingSocketAuth = true;
      void get('/auth/me')
        .then(() => {
          retries = 0;
          refreshingSocketAuth = false;
          connect();
        })
        .catch(() => {
          refreshingSocketAuth = false;
        });
      return;
    }

    retries += 1;
    const delay = Math.min(1000 * 2 ** retries, 15000);
    setTimeout(connect, delay);
  };

  ws.onerror = () => ws.close();
}

export function openSocket(): void {
  closed = false;
  connect();
}

export function closeSocket(): void {
  closed = true;
  socket?.close();
  socket = null;
}

export function sendWs(payload: unknown): void {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload));
}

export function onWs(handler: Handler): () => void {
  handlers.add(handler);
  return () => handlers.delete(handler);
}
