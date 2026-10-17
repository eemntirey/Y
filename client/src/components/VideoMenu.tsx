import { useNavigate } from 'react-router-dom';
import type { Video } from '../lib/types';
import { del, patch, post } from '../lib/api';
import { useSession } from '../lib/session';
import { useToast } from '../lib/toast';
import { Modal } from './Overlay';
import { Icon } from './Icon';

interface VideoMenuProps {
  video: Video;
  onClose: () => void;
  onDeleted: (videoId: string) => void;
  onUpdated: (video: Video) => void;
}

export function VideoMenu({ video, onClose, onDeleted, onUpdated }: VideoMenuProps) {
  const { user } = useSession();
  const { toast, error } = useToast();
  const navigate = useNavigate();
  const mine = user?.id === video.author?.id;

  const run = async (fn: () => Promise<void>) => {
    try {
      await fn();
      onClose();
    } catch (err) {
      error((err as Error).message);
    }
  };

  return (
    <Modal title="Options" onClose={onClose}>
      <div className="list">
        {mine ? (
          <>
            <button
              className="row"
              onClick={() =>
                void run(async () => {
                  const res = await patch<{ video: Video }>(`/videos/${video.id}`, { pinned: !video.pinned });
                  onUpdated(res.video);
                  toast(res.video.pinned ? 'Vidéo épinglée' : 'Épinglage retiré');
                })
              }
            >
              <span className="row__main">📌 {video.pinned ? 'Désépingler' : 'Épingler en profil'}</span>
            </button>
            <button
              className="row"
              onClick={() =>
                void run(async () => {
                  const res = await patch<{ video: Video }>(`/videos/${video.id}`, {
                    allowComment: !video.allowComment,
                  });
                  onUpdated(res.video);
                  toast(res.video.allowComment ? 'Commentaires activés' : 'Commentaires désactivés');
                })
              }
            >
              <span className="row__main">💬 {video.allowComment ? 'Désactiver les commentaires' : 'Activer les commentaires'}</span>
            </button>
            <button
              className="row"
              onClick={() =>
                void run(async () => {
                  const res = await patch<{ video: Video }>(`/videos/${video.id}`, { allowDuet: !video.allowDuet });
                  onUpdated(res.video);
                })
              }
            >
              <span className="row__main">🎭 {video.allowDuet ? 'Désactiver les duos' : 'Autoriser les duos'}</span>
            </button>
            <button
              className="row"
              onClick={() =>
                void run(async () => {
                  const res = await patch<{ video: Video }>(`/videos/${video.id}`, {
                    allowStitch: !video.allowStitch,
                  });
                  onUpdated(res.video);
                })
              }
            >
              <span className="row__main">🧵 {video.allowStitch ? 'Désactiver les stitches' : 'Autoriser les stitches'}</span>
            </button>
            <button className="row" onClick={() => navigate(`/edit/${video.id}`)}>
              <span className="row__main">✏️ Modifier la description</span>
            </button>
            <button
              className="row"
              onClick={() =>
                void run(async () => {
                  if (!window.confirm('Supprimer définitivement cette vidéo ?')) return;
                  await del(`/videos/${video.id}`);
                  onDeleted(video.id);
                  toast('Vidéo supprimée');
                  navigate('/');
                })
              }
            >
              <span className="row__main" style={{ color: '#ff5c72' }}>
                🗑 Supprimer
              </span>
            </button>
          </>
        ) : (
          <>
            <button
              className="row"
              onClick={() => navigate(`/upload?kind=duet&parent=${video.id}`)}
            >
              <span className="row__main">
                <Icon name="duet" size={18} /> Faire un duo
              </span>
            </button>
            <button
              className="row"
              onClick={() => navigate(`/upload?kind=stitch&parent=${video.id}`)}
            >
              <span className="row__main">
                <Icon name="stitch" size={18} /> Utiliser dans un stitch
              </span>
            </button>
            <button
              className="row"
              onClick={() => navigate(`/inbox?to=${video.author?.username ?? ''}`)}
            >
              <span className="row__main">
                <Icon name="inbox" size={18} /> Envoyer en message
              </span>
            </button>
            <button className="row" onClick={() => navigate(`/tag/${video.hashtags[0] ?? ''}`)}>
              <span className="row__main">🔗 Ouvrir le premier hashtag</span>
            </button>
            <button
              className="row"
              onClick={() =>
                void run(async () => {
                  const reason = window.prompt('Motif du signalement', 'Contenu inapproprié');
                  if (!reason) return;
                  await post('/discover/reports', { targetType: 'video', targetId: video.id, reason });
                  toast('Signalement envoyé');
                })
              }
            >
              <span className="row__main">
                <Icon name="flag" size={18} /> Signaler la vidéo
              </span>
            </button>
          </>
        )}
      </div>
    </Modal>
  );
}
