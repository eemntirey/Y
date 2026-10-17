import { Router } from 'express';
import { all, get, now, run, tx, uid } from '../db/index.js';
import { bad, notFound, requireAuth, str, wrap, type AuthedRequest } from '../lib/http.js';
import { loadUser, serializeUser } from '../lib/serialize.js';
import { notify } from '../lib/notify.js';
import { broadcastRoom } from '../realtime.js';

export const liveRouter = Router();

interface RoomRow {
  id: string;
  host_id: string;
  title: string;
  thumbnail: string | null;
  status: string;
  started_at: string;
  ended_at: string | null;
  peak_viewers: number;
  total_viewers: number;
  gift_coins: number;
}

const serializeRoom = (row: RoomRow, viewerId?: string) => {
  const host = loadUser(row.host_id);
  const viewers = get<{ c: number }>('SELECT COUNT(*) AS c FROM live_viewers WHERE room_id = ?', [row.id])?.c ?? 0;
  const messages = all<{ id: string; user_id: string; kind: string; body: string; gift_id: string | null; coins: number; created_at: string; username: string; display_name: string; avatar: string | null }>(
    `SELECT lm.id, lm.user_id, lm.kind, lm.body, lm.gift_id, lm.coins, lm.created_at,
            u.username, u.display_name, u.avatar
     FROM live_messages lm JOIN users u ON u.id = lm.user_id
     WHERE lm.room_id = ? ORDER BY lm.created_at DESC LIMIT 50`,
    [row.id],
  );
  return {
    id: row.id,
    title: row.title,
    thumbnail: row.thumbnail,
    status: row.status,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    stats: { viewers, peakViewers: row.peak_viewers, totalViewers: row.total_viewers, giftCoins: row.gift_coins },
    host: host ? serializeUser(host, viewerId) : null,
    messages: messages.reverse().map((m) => ({
      id: m.id,
      kind: m.kind,
      body: m.body,
      coins: m.coins,
      giftId: m.gift_id,
      createdAt: m.created_at,
      author: { username: m.username, displayName: m.display_name || m.username, avatar: m.avatar },
    })),
  };
};

liveRouter.get(
  '/gifts',
  wrap((_req, res) => {
    const rows = all<{ id: string; name: string; emoji: string; coins: number }>('SELECT id, name, emoji, coins FROM gifts ORDER BY coins ASC');
    res.json({ items: rows });
  }),
);

liveRouter.get(
  '/rooms',
  wrap((req: AuthedRequest, res) => {
    const rooms = all<RoomRow>(
      `SELECT * FROM live_rooms WHERE status = 'live' ORDER BY started_at DESC LIMIT 60`,
    );
    res.json({ items: rooms.map((r) => serializeRoom(r, req.userId)) });
  }),
);

liveRouter.post(
  '/rooms',
  requireAuth,
  wrap((req: AuthedRequest, res) => {
    const existing = get<RoomRow>("SELECT * FROM live_rooms WHERE host_id = ? AND status = 'live'", [req.userId]);
    if (existing) throw bad('Vous êtes déjà en live');
    const id = uid();
    const title = str(req.body?.title, 120) || 'Live de Y';
    const thumbnail = str(req.body?.thumbnail, 500) || null;
    run(
      `INSERT INTO live_rooms (id, host_id, title, thumbnail, status, started_at) VALUES (?,?,?,?,'live',?)`,
      [id, req.userId, title, thumbnail, now()],
    );
    res.status(201).json({ room: serializeRoom(get<RoomRow>('SELECT * FROM live_rooms WHERE id = ?', [id])!, req.userId) });
  }),
);

liveRouter.get(
  '/rooms/:id',
  wrap((req: AuthedRequest, res) => {
    const row = get<RoomRow>('SELECT * FROM live_rooms WHERE id = ?', [str(req.params.id, 64)]);
    if (!row) throw notFound('Live introuvable');
    res.json({ room: serializeRoom(row, req.userId) });
  }),
);

liveRouter.post(
  '/rooms/:id/end',
  requireAuth,
  wrap((req: AuthedRequest, res) => {
    const row = get<RoomRow>('SELECT * FROM live_rooms WHERE id = ?', [str(req.params.id, 64)]);
    if (!row) throw notFound('Live introuvable');
    if (row.host_id !== req.userId) throw bad("Seul l'hôte peut terminer le live");
    run("UPDATE live_rooms SET status = 'ended', ended_at = ? WHERE id = ?", [now(), row.id]);
    res.json({ ok: true });
  }),
);

liveRouter.post(
  '/rooms/:id/join',
  wrap((req: AuthedRequest, res) => {
    const row = get<RoomRow>('SELECT * FROM live_rooms WHERE id = ?', [str(req.params.id, 64)]);
    if (!row) throw notFound('Live introuvable');
    if (req.userId) {
      const fresh = !get('SELECT 1 FROM live_viewers WHERE room_id = ? AND user_id = ?', [row.id, req.userId]);
      if (fresh) {
        tx(() => {
          run('INSERT OR IGNORE INTO live_viewers (room_id, user_id, joined_at) VALUES (?,?,?)', [
            row.id,
            req.userId,
            now(),
          ]);
          run('UPDATE live_rooms SET total_viewers = total_viewers + 1 WHERE id = ?', [row.id]);
          run(
            `UPDATE live_rooms SET peak_viewers = MAX(peak_viewers, (SELECT COUNT(*) FROM live_viewers WHERE room_id = ?)) WHERE id = ?`,
            [row.id, row.id],
          );
        });
        broadcastRoom(row.id, { type: 'live:viewer', roomId: row.id, delta: 1 });
        if (row.host_id !== req.userId)
          notify({ userId: row.host_id, actorId: req.userId, type: 'live', text: 'rejoint votre live' });
      }
    }
    res.json({ ok: true, room: serializeRoom(get<RoomRow>('SELECT * FROM live_rooms WHERE id = ?', [row.id])!, req.userId) });
  }),
);

liveRouter.post(
  '/rooms/:id/leave',
  wrap((req: AuthedRequest, res) => {
    const row = get<RoomRow>('SELECT * FROM live_rooms WHERE id = ?', [str(req.params.id, 64)]);
    if (!row) throw notFound('Live introuvable');
    if (req.userId && get('SELECT 1 FROM live_viewers WHERE room_id = ? AND user_id = ?', [row.id, req.userId])) {
      run('DELETE FROM live_viewers WHERE room_id = ? AND user_id = ?', [row.id, req.userId]);
      broadcastRoom(row.id, { type: 'live:viewer', roomId: row.id, delta: -1 });
    }
    res.json({ ok: true });
  }),
);

liveRouter.post(
  '/rooms/:id/comments',
  requireAuth,
  wrap((req: AuthedRequest, res) => {
    const row = get<RoomRow>('SELECT * FROM live_rooms WHERE id = ?', [str(req.params.id, 64)]);
    if (!row) throw notFound('Live introuvable');
    const body = str(req.body?.body, 300);
    if (!body) throw bad('Message vide');
    const id = uid();
    run(
      `INSERT INTO live_messages (id, room_id, user_id, kind, body, created_at) VALUES (?,?,?,'comment',?,?)`,
      [id, row.id, req.userId, body, now()],
    );
    const payload = { type: 'live:message', roomId: row.id, message: { id, kind: 'comment', body, coins: 0, createdAt: now() } };
    broadcastRoom(row.id, payload);
    res.status(201).json(payload.message);
  }),
);

liveRouter.post(
  '/rooms/:id/gifts',
  requireAuth,
  wrap((req: AuthedRequest, res) => {
    const row = get<RoomRow>('SELECT * FROM live_rooms WHERE id = ?', [str(req.params.id, 64)]);
    if (!row) throw notFound('Live introuvable');
    const gift = get<{ id: string; name: string; emoji: string; coins: number }>(
      'SELECT id, name, emoji, coins FROM gifts WHERE id = ?',
      [str(req.body?.giftId, 64)],
    );
    if (!gift) throw notFound('Cadeau introuvable');

    const balance = get<{ coin_balance: number }>('SELECT coin_balance FROM users WHERE id = ?', [req.userId])?.coin_balance ?? 0;
    if (balance < gift.coins) throw bad('Solde de Y Coins insuffisant');

    const id = uid();
    tx(() => {
      run('UPDATE users SET coin_balance = coin_balance - ? WHERE id = ?', [gift.coins, req.userId]);
      run('INSERT INTO live_messages (id, room_id, user_id, kind, body, gift_id, coins, created_at) VALUES (?,?,?,?,?,?,?,?)', [
        id,
        row.id,
        req.userId,
        'gift',
        gift.name,
        gift.id,
        gift.coins,
        now(),
      ]);
      run('UPDATE live_rooms SET gift_coins = gift_coins + ? WHERE id = ?', [gift.coins, row.id]);
    });

    const payload = {
      type: 'live:message',
      roomId: row.id,
      message: { id, kind: 'gift', body: gift.name, giftId: gift.id, emoji: gift.emoji, coins: gift.coins, createdAt: now() },
    };
    broadcastRoom(row.id, payload);
    if (row.host_id !== req.userId) notify({ userId: row.host_id, actorId: req.userId, type: 'live', text: `a envoyé ${gift.name}` });
    const coins = get<{ coin_balance: number }>('SELECT coin_balance FROM users WHERE id = ?', [req.userId])!.coin_balance;
    res.status(201).json({ ...payload.message, coins });
  }),
);

liveRouter.post(
  '/wallet/topup',
  requireAuth,
  wrap((req: AuthedRequest, res) => {
    const amount = Math.floor(Math.min(Math.max(Number(req.body?.amount ?? 0), 0), 100000));
    if (!Number.isFinite(amount) || amount <= 0) throw bad('Montant invalide');
    const coins = get<{ coin_balance: number }>('SELECT coin_balance FROM users WHERE id = ?', [req.userId])!.coin_balance;
    run('UPDATE users SET coin_balance = coin_balance + ? WHERE id = ?', [amount, req.userId]);
    res.json({ coins: coins + amount });
  }),
);
