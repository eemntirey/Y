import { auth } from './api';

type Handler = (payload: any) => void;

const handlers = new Set<Handler>();
let socket: WebSocket | null = null;
let retries = 0;
let closed = false;

function connect(): void {
  if (closed || socket?.readyState === WebSocket.OPEN) return;
  const token = auth.token;
  if (!token) return;

  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${proto}://${location.host}/ws?token=${encodeURIComponent(token)}`);
  socket = ws;

  ws.onopen = () => {
    retries = 0;
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

  ws.onclose = () => {
    socket = null;
    if (closed) return;
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
