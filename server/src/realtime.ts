import type { Server } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { verifyAccessToken } from './lib/auth.js';
import { setSender } from './lib/notify.js';
import { all, get, now, run, uid } from './db/index.js';

interface Client {
  socket: WebSocket;
  userId: string;
  rooms: Set<string>;
}

const clients = new Set<Client>();

export function attachRealtime(server: Server): void {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (socket, req) => {
    const url = new URL(req.url ?? '/ws', 'http://localhost');
    const token = url.searchParams.get('token');
    const payload = token ? verifyAccessToken(token) : null;
    if (!payload) {
      socket.close(4401, 'unauthorized');
      return;
    }

    const client: Client = { socket, userId: payload.sub, rooms: new Set() };
    clients.add(client);

    const send = (data: unknown) => {
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(data));
    };
    send({ type: 'ready', userId: client.userId });

    socket.on('message', (raw) => {
      let msg: { type?: string; roomId?: string };
      try {
        msg = JSON.parse(String(raw)) as typeof msg;
      } catch {
        return;
      }
      if (msg.type === 'subscribe' && msg.roomId) {
        client.rooms.add(msg.roomId);
        send({ type: 'subscribed', roomId: msg.roomId });
      }
      if (msg.type === 'unsubscribe' && msg.roomId) client.rooms.delete(msg.roomId);
      if (msg.type === 'ping') send({ type: 'pong' });
      if (msg.type === 'typing' && msg.roomId) {
        broadcastRoom(msg.roomId, {
          type: 'typing',
          roomId: msg.roomId,
          userId: client.userId,
        });
      }
    });

    socket.on('close', () => {
      clients.delete(client);
    });
    socket.on('error', () => {
      clients.delete(client);
    });
  });

  setSender((userId, payload) => {
    for (const c of clients) if (c.userId === userId) sendTo(c, payload);
  });

  function sendTo(client: Client, payload: unknown): void {
    if (client.socket.readyState === WebSocket.OPEN)
      client.socket.send(JSON.stringify(payload));
  }

  function broadcastRoom(roomId: string, payload: unknown): void {
    for (const c of clients) if (c.rooms.has(roomId)) sendTo(c, payload);
  }

  // exposé au module messages/live via global
  (globalThis as { __yBroadcastRoom?: (id: string, p: unknown) => void }).__yBroadcastRoom = broadcastRoom;
}

export function broadcastRoom(roomId: string, payload: unknown): void {
  (globalThis as { __yBroadcastRoom?: (id: string, p: unknown) => void }).__yBroadcastRoom?.(roomId, payload);
}

/** Diffuse un message live persisté à tous les abonnés du salon. */
export function publishLiveMessage(roomId: string, userId: string, body: string): void {
  const id = uid();
  run(
    `INSERT INTO live_messages (id, room_id, user_id, kind, body, created_at) VALUES (?,?,?,'comment',?,?)`,
    [id, roomId, userId, body, now()],
  );
  broadcastRoom(roomId, {
    type: 'live:message',
    roomId,
    message: { id, kind: 'comment', body, coins: 0, createdAt: now() },
  });
}

export const onlineUsers = (): string[] => [...new Set([...clients].map((c) => c.userId))];

export const giftSeed = [
  { id: 'rose', name: 'Rose', emoji: '🌹', coins: 1 },
  { id: 'coeur', name: 'Cœur', emoji: '💖', coins: 5 },
  { id: 'etoile', name: 'Étoile', emoji: '⭐', coins: 20 },
  { id: 'trophee', name: 'Trophée', emoji: '🏆', coins: 100 },
  { id: 'y_rocket', name: 'Y Rocket', emoji: '🚀', coins: 500 },
  { id: 'y_legend', name: 'Légende Y', emoji: '👑', coins: 1000 },
];

export const seedGifts = (): void => {
  for (const g of giftSeed)
    run('INSERT OR IGNORE INTO gifts (id, name, emoji, coins) VALUES (?,?,?,?)', [g.id, g.name, g.emoji, g.coins]);
};

export const liveRoomExists = (roomId: string): boolean =>
  !!get("SELECT 1 FROM live_rooms WHERE id = ? AND status = 'live'", [roomId]);

export const liveRooms = all<{ id: string }>("SELECT id FROM live_rooms WHERE status = 'live'");
