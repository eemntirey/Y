// Smoke test API : démarre le serveur, exerce les routes, l'arrête.
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = process.env.SMOKE_PORT ?? '4123';
const BASE = `http://127.0.0.1:${PORT}/api`;
const dataDir = mkdtempSync(join(tmpdir(), 'y-smoke-'));

const server = spawn(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'src/index.ts'], {
  cwd: process.cwd(),
  env: { ...process.env, Y_PORT: PORT, Y_DATA_DIR: dataDir, Y_SECRET: 'smoke-secret' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverLog = '';
server.stdout.on('data', (d) => (serverLog += d));
server.stderr.on('data', (d) => (serverLog += d));

let failures = 0;
const check = (label: string, condition: boolean, extra = '') => {
  console.log(`${condition ? '  OK  ' : ' FAIL '} ${label}${extra ? ` — ${extra}` : ''}`);
  if (!condition) failures++;
};

const api = async (path: string, init: RequestInit & { token?: string } = {}) => {
  const headers: Record<string, string> = { ...(init.headers as Record<string, string>) };
  if (init.body && !(init.headers as Record<string, string>)?.['Content-Type'])
    headers['Content-Type'] = 'application/json';
  if (init.token) headers.Authorization = `Bearer ${init.token}`;
  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  return { status: res.status, body: json };
};

const waitForServer = async () => {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`${BASE}/health`);
      if (res.ok) return true;
    } catch {
      /* pas encore prêt */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
};

const main = async () => {
  console.log('Seed de la base de test...');
  const seed = spawnSync(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'src/seed.ts'], {
    cwd: process.cwd(),
    env: { ...process.env, Y_DATA_DIR: dataDir, Y_FORCE: '1', Y_SECRET: 'smoke-secret' },
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
  });
  if (seed.status !== 0) {
    console.error('seed en echec\n', seed.stdout, seed.stderr);
    process.exit(1);
  }

  const up = await waitForServer();
  if (!up) {
    console.error('serveur injoignable\n', serverLog);
    failures++;
  } else {
    console.log(`\nAPI Y sur le port ${PORT}\n`);

    const health = await api('/health');
    check('GET /health', health.body?.ok === true && health.body?.brand === 'Y');

    const bad = await api('/auth/register', { method: 'POST', body: JSON.stringify({ username: 'A', email: 'x', password: '1' }) });
    check('validation inscription (400)', bad.status === 400, bad.body?.error);

    const email = `smoke${Date.now()}@y.app`;
    const reg = await api('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username: `smoke${Date.now() % 100000}`, email, password: 'yolove2026', displayName: 'Test' }),
    });
    check('POST /auth/register (201)', reg.status === 201 && !!reg.body.token, reg.body?.error);
    const token = reg.body.token;
    const refresh = reg.body.refresh;
    const me = reg.body.user;

    const dup = await api('/auth/register', { method: 'POST', body: JSON.stringify({ username: me.username, email, password: 'yolove2026' }) });
    check('doublon username/email rejeté', dup.status === 400);

    const login = await api('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier: email, password: 'yolove2026' }),
    });
    check('POST /auth/login (200)', login.status === 200 && !!login.body?.token, login.body?.error);

    let rateLimited = false;
    for (let i = 0; i < 12 && !rateLimited; i++) {
      const res = await api('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ identifier: email, password: 'mauvais-mdp' }),
      });
      if (res.status === 429) rateLimited = true;
    }
    check('rate-limit /auth/login (429 après abus)', rateLimited);

    const noauth = await api('/videos/00000000-0000-0000-0000-000000000000/like', { method: 'POST' });
    check('route protégée sans token (401)', noauth.status === 401, `status=${noauth.status}`);

    const refreshed = await api('/auth/refresh', { method: 'POST', body: JSON.stringify({ refresh }) });
    check('POST /auth/refresh', refreshed.status === 200 && !!refreshed.body.token);

    const profile = await api(`/auth/me`, { token });
    check('GET /auth/me', profile.body?.user?.id === me.id);

    const patch = await api('/auth/me', { method: 'PATCH', token, body: JSON.stringify({ displayName: 'Nom modifie', bio: 'Bio test' }) });
    check('PATCH /auth/me', patch.body?.user?.displayName === 'Nom modifie');

    const feed = await api('/videos/feed?mode=foryou&limit=5', { token });
    check('GET /videos/feed (page publique)', Array.isArray(feed.body?.items), `${feed.body?.items?.length} items`);
    const feedItems = feed.body.items as any[];
    check('feed renvoie des vidéos', feedItems.length > 0);
    check('feed conforme (author + stats)', feedItems.length === 0 || (!!feedItems[0].author?.username && typeof feedItems[0].stats.likes === 'number'));
    if (feedItems.length === 0) throw new Error('aucune video dans le feed');

    const liked = await api(`/videos/${feedItems[0].id}/like`, { method: 'POST', token });
    check('POST /videos/:id/like', typeof liked.body?.liked === 'boolean');
    const unlike = await api(`/videos/${feedItems[0].id}/like`, { method: 'POST', token });
    check('unlike toggle', unlike.body?.liked === false);

    const saved = await api(`/videos/${feedItems[0].id}/save`, { method: 'POST', token });
    check('POST /videos/:id/save', typeof saved.body?.saved === 'boolean');

    const shared = await api(`/videos/${feedItems[0].id}/share`, { method: 'POST', token, body: JSON.stringify({ channel: 'link' }) });
    check('POST /videos/:id/share', typeof shared.body?.shareCount === 'number');

    const viewed = await api(`/videos/${feedItems[0].id}/view`, { method: 'POST', token });
    check('POST /videos/:id/view', typeof viewed.body?.viewCount === 'number');

    const comment = await api(`/comments/video/${feedItems[0].id}`, {
      method: 'POST',
      token,
      body: JSON.stringify({ text: 'Premier commentaire' }),
    });
    check('POST commentaire (201)', comment.status === 201, comment.body?.error);
    const commentId = comment.body?.comment?.id;
    const reply = await api(`/comments/video/${feedItems[0].id}`, {
      method: 'POST',
      token,
      body: JSON.stringify({ text: 'Une reponse', parentId: commentId }),
    });
    check('POST reponse imbriquee', reply.status === 201 && reply.body.comment.parentId === commentId);
    const commentLike = await api(`/comments/${commentId}/like`, { method: 'POST', token });
    check('POST commentaire like', commentLike.body?.liked === true);
    const list = await api(`/comments/video/${feedItems[0].id}?sort=old`, { token });
    const mine = list.body?.items?.find((c: any) => c.id === commentId);
    check('GET commentaires + replies', !!mine && mine.replies.length === 1, `replies=${mine?.replies?.length}`);
    const del = await api(`/comments/${commentId}`, { method: 'DELETE', token });
    check('DELETE commentaire (cascade)', del.status === 200);

    const target = feedItems[0].author.username;
    const follow = await api(`/users/${target}/follow`, { method: 'POST', token });
    check('POST follow toggle', typeof follow.body?.following === 'boolean');
    const followers = await api(`/users/${target}/followers`, { token });
    check('GET followers', Array.isArray(followers.body?.items));
    const userProfile = await api(`/users/${target}`, { token });
    check('GET profil + videos', !!userProfile.body?.user?.username && Array.isArray(userProfile.body?.videos));
    const userVideos = await api(`/users/${target}/videos?tab=videos`, { token });
    check('GET profil /videos', Array.isArray(userVideos.body?.items));

    const notif = await api('/notifications', { token });
    check('GET notifications', Array.isArray(notif.body?.items) && typeof notif.body?.unread === 'number');
    const seen = await api('/notifications/seen', { method: 'POST', token, body: JSON.stringify({}) });
    check('POST notifications/seen', seen.body?.unread === 0);

    const search = await api('/discover/search?q=a', { token });
    check('GET /discover/search', Array.isArray(search.body?.users) && Array.isArray(search.body?.hashtags));
    const trending = await api('/discover/hashtags/trending', { token });
    check('GET hashtags/trending', Array.isArray(trending.body?.items));
    const firstTag = trending.body?.items?.[0]?.name;
    if (firstTag) {
      const tag = await api(`/discover/hashtags/${firstTag}`, { token });
      check('GET hashtag detail', !!tag.body?.hashtag?.name);
      const related = await api(`/discover/hashtags/${firstTag}/related`, { token });
      check('GET hashtags/related', Array.isArray(related.body?.items));
    } else check('GET hashtags/trending (donnees)', false, 'aucun hashtag');
    const sounds = await api('/discover/sounds', { token });
    check('GET /discover/sounds', Array.isArray(sounds.body?.items));

    const sugg = await api('/users/suggestions', { token });
    check('GET /users/suggestions', Array.isArray(sugg.body?.items));

    const convo = await api('/messages/conversations', { method: 'POST', token, body: JSON.stringify({ username: target }) });
    check('POST conversation', convo.status === 201 && !!convo.body?.id);
    const msg = await api(`/messages/conversations/${convo.body.id}/messages`, {
      method: 'POST',
      token,
      body: JSON.stringify({ body: 'Bonjour depuis le smoke test' }),
    });
    check('POST message', msg.status === 201);
    const convos = await api('/messages/conversations', { token });
    check('GET conversations', convos.body?.items?.[0]?.lastMessage?.body === 'Bonjour depuis le smoke test');
    const thread = await api(`/messages/conversations/${convo.body.id}`, { token });
    check('GET thread messages', thread.body?.items?.length === 1);
    const unread = await api('/messages/unread', { token });
    check('GET messages/unread', typeof unread.body?.unread === 'number');

    const room = await api('/live/rooms', { method: 'POST', token, body: JSON.stringify({ title: 'Smoke live' }) });
    check('POST /live/rooms (201)', room.status === 201, room.body?.error);
    const roomId = room.body?.room?.id;
    const gifts = await api('/live/gifts', { token });
    check('GET /live/gifts', Array.isArray(gifts.body?.items) && gifts.body.items.length > 0);
    const joined = await api(`/live/rooms/${roomId}/join`, { method: 'POST', token });
    check('POST live join (spectateur)', joined.body?.room?.stats?.viewers >= 1);
    const liveMsg = await api(`/live/rooms/${roomId}/comments`, { method: 'POST', token, body: JSON.stringify({ body: 'Salut le live' }) });
    check('POST live comment', liveMsg.status === 201);
    const topup = await api('/live/wallet/topup', { method: 'POST', token, body: JSON.stringify({ amount: 500 }) });
    check('POST wallet topup', topup.body?.coins > 0);
    const gift = await api(`/live/rooms/${roomId}/gifts`, {
      method: 'POST',
      token,
      body: JSON.stringify({ giftId: gifts.body.items[0].id }),
    });
    check('POST live gift', gift.status === 201, gift.body?.error);
    const ended = await api(`/live/rooms/${roomId}/end`, { method: 'POST', token });
    check('POST live end', ended.status === 200);

    const product = await api('/shop/products', { method: 'POST', token, body: JSON.stringify({ title: 'Produit test', price: 1200, stock: 5 }) });
    check('POST /shop/products (201)', product.status === 201, product.body?.error);
    const products = await api('/shop/products', { token });
    check('GET /shop/products', products.body?.items?.length >= 1);
    const add = await api('/shop/cart', { method: 'POST', token, body: JSON.stringify({ productId: product.body.product.id, quantity: 2 }) });
    check('POST /shop/cart', add.status === 200);
    const cart = await api('/shop/cart', { token });
    check('GET /shop/cart + total', cart.body?.total === 2400, `total=${cart.body?.total}`);
    const order = await api('/shop/orders', { method: 'POST', token });
    check('POST /shop/orders', order.status === 201 && order.body?.total === 2400, order.body?.error);
    const orders = await api('/shop/orders', { token });
    check('GET /shop/orders', orders.body?.items?.length === 1);

    // stock restant : 5 - 2 = 3, on tente d'en acheter 5
    await api('/shop/cart', { method: 'POST', token, body: JSON.stringify({ productId: product.body.product.id, quantity: 5 }) });
    const oversell = await api('/shop/orders', { method: 'POST', token });
    check('POST /shop/orders refuse le stock insuffisant (400)', oversell.status === 400, `status=${oversell.status} ${oversell.body?.error ?? ''}`);
    const ordersAfter = await api('/shop/orders', { token });
    check('commande surstock non persistée', ordersAfter.body?.items?.length === 1);

    const report = await api('/discover/reports', {
      method: 'POST',
      token,
      body: JSON.stringify({ targetType: 'video', targetId: feedItems[0].id, reason: 'spam' }),
    });
    check('POST /discover/reports', report.status === 201);

    const badUpload = await api('/videos', { method: 'POST', token, body: JSON.stringify({ description: 'sans fichier' }) });
    check('upload sans fichier refuse (400)', badUpload.status === 400);

    const notFound = await api('/route/inexistante');
    check('404 JSON', notFound.status === 404 && notFound.body?.error === 'Route inconnue');
  }

  console.log(`\n${failures === 0 ? 'TOUT PASSE' : `${failures} ECHEC(S)`}`);
  if (failures > 0 && serverLog) console.log('\n--- log serveur ---\n' + serverLog);
  server.kill();
  await new Promise((r) => setTimeout(r, 400));
  try {
    rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    console.log(`(dossier temporaire non supprimé : ${dataDir})`);
  }
  process.exit(failures === 0 ? 0 : 1);
};

main();
