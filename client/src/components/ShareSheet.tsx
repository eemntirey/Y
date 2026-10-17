import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { User, Video } from '../lib/types';
import { get, post, qs } from '../lib/api';
import { useSession } from '../lib/session';
import { useToast } from '../lib/toast';
import { Modal } from './Overlay';
import { Avatar } from './Avatar';
import { Icon } from './Icon';

interface ShareSheetProps {
  video: Video;
  onClose: () => void;
}

const TARGETS = [
  { id: 'copy', label: 'Copier le lien', icon: 'link' as const },
  { id: 'dm', label: 'Envoyer en message', icon: 'inbox' as const },
  { id: 'duet', label: 'Faire un duo', icon: 'duet' as const },
  { id: 'stitch', label: 'Stitch', icon: 'stitch' as const },
  { id: 'report', label: 'Signaler', icon: 'flag' as const },
];

export function ShareSheet({ video, onClose }: ShareSheetProps) {
  const { user } = useSession();
  const { toast, error } = useToast();
  const navigate = useNavigate();
  const [term, setTerm] = useState('');
  const [results, setResults] = useState<User[]>([]);

  const url = `${location.origin}/video/${video.id}`;

  useEffect(() => {
    if (term.trim().length < 1) {
      setResults([]);
      return;
    }
    const id = window.setTimeout(() => {
      get<{ items: User[] }>(`/users/search${qs({ q: term })}`)
        .then((d) => setResults(d.items))
        .catch(() => setResults([]));
    }, 180);
    return () => window.clearInterval(id);
  }, [term]);

  const action = async (id: string) => {
    if (id === 'copy') {
      try {
        await navigator.clipboard.writeText(url);
        toast('Lien copié');
      } catch {
        error('Copie impossible sur ce navigateur');
      }
      return;
    }
    if (id === 'duet' || id === 'stitch') {
      if (!video.allowDuet && id === 'duet') return error('Les duos sont désactivés par le créateur');
      if (!video.allowStitch && id === 'stitch') return error('Les stitches sont désactivés');
      navigate(`/upload?kind=${id}&parent=${video.id}`);
      return;
    }
    if (id === 'report') {
      if (!user) return navigate('/auth');
      const reason = window.prompt('Motif du signalement', 'Contenu inapproprié');
      if (!reason) return;
      await post('/discover/reports', { targetType: 'video', targetId: video.id, reason }).catch(() => undefined);
      toast('Signalement envoyé');
      return;
    }
    if (!user) return navigate('/auth');
    navigate(`/inbox?to=${video.author?.username ?? ''}`);
  };

  const send = async (target: User) => {
    await post('/messages/conversations', { username: target.username }).catch(() => undefined);
    navigate(`/inbox?to=${target.username}`);
  };

  return (
    <Modal title="Partager" onClose={onClose}>
      <div className="field">
        <input
          className="input"
          placeholder="Chercher un ami…"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
        />
      </div>

      {results.length > 0 ? (
        <div className="list" style={{ marginBottom: 14 }}>
          {results.slice(0, 5).map((u) => (
            <div key={u.id} className="row">
              <Avatar user={u} size="sm" />
              <span className="row__main">
                <span className="row__title">@{u.username}</span>
                <span className="row__sub">{u.displayName}</span>
              </span>
              <button className="btn btn--sm btn--primary" onClick={() => void send(u)}>
                Envoyer
              </button>
            </div>
          ))}
        </div>
      ) : null}

      <div className="sharegrid">
        {TARGETS.map((t) => (
          <button key={t.id} className="sharetile" onClick={() => void action(t.id)}>
            <span className="sharetile__icon">
              <Icon name={t.icon} size={22} />
            </span>
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      <div className="sharelink">
        <input className="input" readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
      </div>
    </Modal>
  );
}
