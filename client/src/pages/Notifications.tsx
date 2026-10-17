import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Notification } from '../lib/types';
import { get, post } from '../lib/api';
import { onWs } from '../lib/socket';
import { timeAgo } from '../lib/format';
import { Layout } from '../components/Layout';
import { Avatar } from '../components/Avatar';
import { Icon } from '../components/Icon';

const label = (n: Notification): string => {
  const who = n.actor ? `@${n.actor.username}` : 'Quelqu’un';
  switch (n.type) {
    case 'like':
      return `${who} a aimé ta vidéo`;
    case 'comment':
      return `${who} a commenté : « ${n.text} »`;
    case 'follow':
      return `${who} commence à te suivre`;
    case 'mention':
      return `${who} t’a mentionné`;
    case 'video':
      return `${who} ${n.text || 'a fait un duo/stitch avec ta vidéo'}`;
    case 'message':
      return `${who} t’a envoyé un message`;
    case 'live':
      return `${who} ${n.text || 'est en direct'}`;
    default:
      return `${who} — ${n.text}`;
  }
};

const iconFor = (n: Notification) => {
  switch (n.type) {
    case 'like':
      return <Icon name="heart" size={15} filled />;
    case 'comment':
      return <Icon name="comment" size={15} />;
    case 'follow':
      return <Icon name="user" size={15} />;
    case 'message':
      return <Icon name="inbox" size={15} />;
    case 'live':
      return <Icon name="live" size={15} />;
    default:
      return <Icon name="globe" size={15} />;
  }
};

export function NotificationsPage() {
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const data = await get<{ items: Notification[] }>('/notifications');
    setItems(data.items);
    setLoading(false);
    void post('/notifications/seen', {});
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(
    () =>
      onWs((payload) => {
        if (payload?.type === 'notification') void load();
      }),
    [load],
  );

  return (
    <Layout>
      <div className="page">
        <h1 className="page__title">Notifications</h1>
        {loading ? (
          <div className="list" style={{ marginTop: 18 }}>
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="skeleton" style={{ height: 58, marginBottom: 8 }} />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="empty">
            <div className="empty__icon">🔔</div>
            <p className="empty__title">Rien de neuf</p>
            <p>Tu seras prévenu ici de chaque activité.</p>
          </div>
        ) : (
          <div className="list" style={{ marginTop: 12 }}>
            {items.map((n) => (
              <div key={n.id} className="row">
                <Link to={n.actor ? `/@${n.actor.username}` : '/notifications'}>
                  <Avatar user={n.actor} size="md" />
                </Link>
                <span className="row__main">
                  <span className="row__title" style={{ fontWeight: n.seen ? 600 : 800 }}>
                    {label(n)}
                  </span>
                  <span className="row__sub">{timeAgo(n.createdAt)}</span>
                </span>
                <span className="notif__icon">{iconFor(n)}</span>
                {n.videoId ? (
                  <Link to={`/video/${n.videoId}`} className="notif__thumb" aria-label="Voir la vidéo">
                    <Icon name="play" size={13} filled />
                  </Link>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
