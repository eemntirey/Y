import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { Gift, LiveRoom } from '../lib/types';
import { get, post } from '../lib/api';
import { useSession } from '../lib/session';
import { useToast } from '../lib/toast';
import { onWs, sendWs } from '../lib/socket';
import { compact, timeAgo } from '../lib/format';
import { Layout } from '../components/Layout';
import { Avatar } from '../components/Avatar';
import { Icon } from '../components/Icon';

export function LivePage() {
  const { user } = useSession();
  const navigate = useNavigate();
  const { toast, error } = useToast();
  const [rooms, setRooms] = useState<LiveRoom[]>([]);
  const [starting, setStarting] = useState(false);

  const load = useCallback(async () => {
    const data = await get<{ items: LiveRoom[] }>('/live/rooms');
    setRooms(data.items);
  }, []);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), 15000);
    return () => window.clearInterval(id);
  }, [load]);

  const start = async () => {
    if (!user) return navigate('/auth');
    setStarting(true);
    try {
      const res = await post<{ room: LiveRoom }>('/live/rooms', { title: `Live de @${user.username}` });
      toast('Ton live est lancé');
      navigate(`/live/${res.room.id}`);
    } catch (err) {
      error((err as Error).message);
    } finally {
      setStarting(false);
    }
  };

  return (
    <Layout>
      <div className="page">
        <div className="page__head">
          <h1 className="page__title">
            <Icon name="live" size={22} /> LIVE
          </h1>
          <span className="topbar__spacer" />
          <button className="btn btn--primary" onClick={() => void start()} disabled={starting}>
            <Icon name="live" size={16} /> Démarrer un live
          </button>
        </div>

        {rooms.length === 0 ? (
          <div className="empty">
            <div className="empty__icon">📡</div>
            <p className="empty__title">Aucun live en cours</p>
            <p>Sois le premier à diffuser ton Live.</p>
            <button className="btn btn--primary" onClick={() => void start()}>
              Démarrer maintenant
            </button>
          </div>
        ) : (
          <div className="grid grid--wide">
            {rooms.map((room) => (
              <Link key={room.id} to={`/live/${room.id}`} className="livecard">
                <div className="livecard__body">
                  <span className="livecard__live">
                    <span className="pulse-dot" /> LIVE
                  </span>
                  <div className="row__title" style={{ color: '#fff' }}>
                    {room.title}
                  </div>
                  <div className="row__sub" style={{ color: 'rgba(255,255,255,.78)' }}>
                    @{room.host?.username ?? '?'} · {compact(room.stats.viewers)} spectateur(s)
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}

export function LiveRoomPage() {
  const { id = '' } = useParams();
  const { user } = useSession();
  const { error, toast } = useToast();
  const navigate = useNavigate();

  const [room, setRoom] = useState<LiveRoom | null>(null);
  const [gifts, setGifts] = useState<Gift[]>([]);
  const [text, setText] = useState('');
  const [giftOpen, setGiftOpen] = useState(false);
  const [joined, setJoined] = useState(false);

  const refresh = useCallback(async () => {
    const data = await get<{ room: LiveRoom }>(`/live/rooms/${id}`);
    setRoom(data.room);
  }, [id]);

  useEffect(() => {
    void refresh();
    get<{ items: Gift[] }>('/live/gifts')
      .then((d) => setGifts(d.items))
      .catch(() => undefined);
  }, [refresh]);

  useEffect(() => {
    sendWs({ type: 'subscribe', roomId: id });
    void post<{ room: LiveRoom }>(`/live/rooms/${id}/join`).then((res) => {
      setJoined(true);
      setRoom(res.room);
    });
    return () => {
      sendWs({ type: 'unsubscribe', roomId: id });
      void post(`/live/rooms/${id}/leave`).catch(() => undefined);
    };
  }, [id]);

  useEffect(
    () =>
      onWs((payload) => {
        if (payload?.type !== 'live:message' || payload.roomId !== id) return;
        setRoom((prev) =>
          prev
            ? { ...prev, messages: [...prev.messages, { ...payload.message, author: undefined }].slice(-100) }
            : prev,
        );
        void refresh();
      }),
    [id, refresh],
  );

  const send = async () => {
    const body = text.trim();
    if (!body) return;
    setText('');
    try {
      await post(`/live/rooms/${id}/comments`, { body });
    } catch (err) {
      setText(body);
      error((err as Error).message);
    }
  };

  const sendGift = async (gift: Gift) => {
    try {
      await post(`/live/rooms/${id}/gifts`, { giftId: gift.id });
      setGiftOpen(false);
      toast(`${gift.emoji} ${gift.name} envoyé`);
    } catch (err) {
      error((err as Error).message);
    }
  };

  const end = async () => {
    await post(`/live/rooms/${id}/end`);
    toast('Live terminé');
    navigate('/live');
  };

  if (!room) {
    return (
      <Layout>
        <div className="page">
          <div className="skeleton" style={{ height: 320, borderRadius: 18 }} />
        </div>
      </Layout>
    );
  }

  const isHost = user?.id === room.host?.id;

  return (
    <Layout>
      <div className="page">
        <div className="livepage">
          <section className="livepage__stage">
            <div className="seedart">
              <div className="seedart__layer seedart__layer--1" style={{ background: 'linear-gradient(135deg,#3a0ca3,#f72585)' }} />
              <div className="seedart__layer seedart__layer--2" style={{ background: 'linear-gradient(225deg,#4361ee,#4facfe)' }} />
              <div className="seedart__pulse" />
              <div className="seedart__grain" />
            </div>
            <div className="livepage__overlay">
              <span className="badge badge--live">
                <span className="pulse-dot" /> LIVE
              </span>
              <h1 className="livepage__title">{room.title}</h1>
              <div className="livepage__host">
                <Avatar user={room.host} size="sm" />
                <span>
                  <b>@{room.host?.username}</b> · {compact(room.stats.viewers)} spectateur(s) ·{' '}
                  {compact(room.stats.giftCoins)} Y Coins
                </span>
              </div>
            </div>
            {isHost ? (
              <button className="btn btn--danger livepage__end" onClick={() => void end()}>
                Terminer
              </button>
            ) : null}
          </section>

          <aside className="livepage__chat">
            <div className="sheet__head">
              <span className="sheet__title">Chat en direct</span>
              <span className="badge">{joined ? 'connecté' : ''}</span>
            </div>
            <div className="sheet__body">
              {room.messages.length === 0 ? (
                <div className="empty">
                  <p>Sois le premier à écrire</p>
                </div>
              ) : (
                <div className="livechat">
                  {room.messages.map((m) => (
                    <div key={m.id} className={`livechat__row${m.kind === 'gift' ? ' is-gift' : ''}`}>
                      <span className="livechat__who">@{m.author?.username ?? 'spectateur'}</span>
                      <span>{m.kind === 'gift' ? `${m.emoji ?? '🎁'} ${m.body}` : m.body}</span>
                      <span className="livechat__time">{timeAgo(m.createdAt)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="sheet__foot">
              <div className="composer">
                <input
                  className="input"
                  placeholder="Écris dans le chat…"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void send();
                    }
                  }}
                />
                <button className="btn btn--primary" onClick={() => void send()} disabled={!text.trim()}>
                  <Icon name="send" size={16} />
                </button>
                <button className="btn btn--ghost" onClick={() => setGiftOpen((v) => !v)} aria-label="Cadeaux">
                  <Icon name="gift" size={17} />
                </button>
              </div>
              {giftOpen ? (
                <div className="giftrow">
                  {gifts.map((g) => (
                    <button key={g.id} className="giftbtn" onClick={() => void sendGift(g)}>
                      <span className="giftbtn__emoji">{g.emoji}</span>
                      <span>{g.name}</span>
                      <span className="giftbtn__coins">{g.coins}</span>
                    </button>
                  ))}
                </div>
              ) : null}
              {user ? (
                <button className="btn btn--ghost btn--block" style={{ marginTop: 8 }} onClick={() => void post('/live/wallet/topup', { amount: 500 }).then(() => toast('+500 Y Coins'))}>
                  <Icon name="coins" size={16} /> Recharger mes Y Coins
                </button>
              ) : null}
            </div>
          </aside>
        </div>
      </div>
    </Layout>
  );
}
