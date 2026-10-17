# Y — Carte du projet (clone TikTok)

Monorepo npm workspaces : `server` (API) + `client` (SPA).

```
TikTok/
├── dev.cmd                    lance API :4000 + client :4173→5173
├── package.json               scripts: dev, build, start, seed, smoke, typecheck
├── server/                    Express + ws + node:sqlite (TS, ESM)
│   ├── src/index.ts           CORS, /media static, montage des routes, error handler
│   ├── src/config.ts          Y_PORT, Y_SECRET, Y_CORS, Y_MAX_UPLOAD_MB, brand
│   ├── src/realtime.ts        WebSocket : typing, live messages, gifts, rooms
│   ├── src/seed.ts            données de démo · smoke.ts = test 56 routes
│   ├── src/db/schema.ts       28 tables · db/index.ts (DatabaseSync)
│   ├── src/lib/               auth (JWT+refresh), http (ApiError), notify, serialize
│   ├── src/routes/            9 routeurs
│   └── data/                  y.db + uploads/ (videos, thumbs, sounds)
└── client/                    React 18 + Vite + react-router 6 (TS)
    ├── index.html → src/main.tsx
    ├── vite.config.ts         proxy /api, /media, /ws → :4000
    └── src/
        ├── App.tsx            15 routes + SocketBridge
        ├── pages/             14 pages
        ├── components/        Layout, Reel, VideoCard, CommentsSheet, ShareSheet…
        └── lib/               api.ts (fetch + tokens localStorage), session.tsx,
                               socket.ts, toast.tsx, format.ts, types.ts
```

## Flux

```
navigateur (5173) ──/api,/media,/ws──▶ Vite proxy ──▶ Express :4000
   │ react-router + SessionProvider       │ JWT (Authorization) + refresh
   │ Reel/VideoCard (feed vertical)       │ SQLite WAL (node:sqlite)
   └── WebSocket (live, DM typing) ◀──────┘ ws server sur le même HTTP
```

## API (`/api/*`, doublonée sans préfixe)

| Domaine | Routes clés |
|---|---|
| **auth** | POST register/login/refresh/logout · GET/PATCH me · POST me/password |
| **videos** | GET feed/:id/related · POST / · PATCH/DELETE :id · like/save/share/view |
| **comments** | GET/POST video/:id · like · DELETE · mention search/mentions |
| **users** | :username, /videos, follow, followers, following, block, suggestions, analytics, avatar |
| **discover** | search + history · hashtags trending/:name/related · sounds (+ POST, videos) · reports |
| **notifications** | GET /, /unread · POST /seen |
| **messages** | conversations CRUD · messages · /unread |
| **live** | rooms CRUD + join/leave/comments/gifts · gifts · wallet/topup |
| **shop** | products CRUD · cart · orders · sellers/:username/stats |

## WebSocket (`/ws`)

`ready` · `subscribed` (room live) · `typing` (DM) · `live:message` · `ping/pong`

## Données (seed : 24 users, 68 vidéos, 260 comments, 12 products)

```
users ──< sessions
      ──< videos ──< likes / saves / shares / video_views
      │            ──< comments ──< comment_likes   (replies via parent_id)
      │            ──> hashtags (video_hashtags) · sounds (video_sounds)
      │            └─> duet/stitch via parent_id
      ──< follows / blocks / notifications / search_history
      ──< conversation_members >─ conversations ──< messages
      ──< live_rooms ──< live_viewers / live_messages >─ gifts ; coin_balance
      ──< products ──< cart_items / order_items >─ orders
      ──< reports
```

## Front — routes

| URL | Page | URL | Page |
|---|---|---|---|
| `/` | Feed (Reel vertical) | `/notifications` | Notifications |
| `/auth` | Login/Register | `/inbox` | DM |
| `/discover` | Recherche/tendances | `/live`, `/live/:id` | Live |
| `/video/:id` | Vidéo + comments | `/shop` | Marketplace |
| `/@:username` | Profil | `/settings` | Réglages |
| `/tag/:name`, `/sound/:id` | Hashtag/son | `/upload`, `/edit/:id` | Publication |

Auth côté client : access token 7 j + refresh 30 j dans `localStorage` (`y.token`, `y.refresh`), retry auto sur 401 via `api.ts`.
