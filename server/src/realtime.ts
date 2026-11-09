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
  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 64 * 1024, perMessageDeflate: false });

  wss.on('connection', (socket) => {
    let client: Client | null = null;
    let eventWindowStarted = Date.now();
    let eventCount = 0;
    const authTimeout = setTimeout(() => {
      if (!client) socket.close(4401, 'authentication required');
    }, 5000);

    const send = (data: unknown) => {
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(data));
    };

    socket.on('message', (raw) => {
      let msg: { type?: string; roomId?: string; token?: string };
      try {
        msg = JSON.parse(String(raw)) as typeof msg;
      } catch {
        send({ type: 'error', code: 'INVALID_MESSAGE' });
        return;
      }

      // Browser WebSocket APIs cannot set Authorization headers. Authenticate
      // with the first frame instead of putting bearer credentials in the URL.
      if (!client) {
        if (msg.type !== 'auth' || typeof msg.token !== 'string') {
          socket.close(4401, 'authentication required');
          return;
        }
        const payload = verifyAccessToken(msg.token);
        if (!payload) {
          socket.close(4401, 'unauthorized');
          return;
        }
        clearTimeout(authTimeout);
        client = { socket, userId: payload.sub, rooms: new Set() };
        clients.add(client);
        send({ type: 'ready', userId: client.userId });
        return;
      }

      const nowMs = Date.now();
      if (nowMs - eventWindowStarted >= 10_000) {
        eventWindowStarted = nowMs;
        eventCount = 0;
      }
      eventCount += 1;
      if (eventCount > 100) {
        socket.close(4429, 'event rate limit exceeded');
        return;
      }

      const roomId = typeof msg.roomId === 'string' ? msg.roomId.slice(0, 64) : '';
      if (msg.type === 'subscribe' && roomId) {
        const isLiveRoom = !!get(
          "SELECT 1 FROM live_rooms WHERE id = ? AND status = 'live'",
          [roomId],
        );
        const isConversationMember = !!get(
          'SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?',
          [roomId, client.userId],
        );
        if (!isLiveRoom && !isConversationMember) {
          send({ type: 'error', code: 'ROOM_ACCESS_DENIED', roomId });
          return;
        }
        client.rooms.add(roomId);
        send({ type: 'subscribed', roomId });
      }
      if (msg.type === 'unsubscribe' && roomId) client.rooms.delete(roomId);
      if (msg.type === 'ping') send({ type: 'pong' });
      if (msg.type === 'typing' && roomId && client.rooms.has(roomId)) {
        const isConversationMember = !!get(
          'SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?',
          [roomId, client.userId],
        );
        if (isConversationMember) {
          broadcastRoom(roomId, {
            type: 'typing',
            roomId,
            userId: client.userId,
          });
        }
      }
    });

    socket.on('close', () => {
      clearTimeout(authTimeout);
      if (client) clients.delete(client);
    });
    socket.on('error', () => {
      clearTimeout(authTimeout);
      if (client) clients.delete(client);
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
