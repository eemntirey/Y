import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { Video } from '../lib/types';
import { get } from '../lib/api';
import { useSession } from '../lib/session';
import { Layout } from '../components/Layout';
import { Reel } from '../components/Reel';
import { CommentsSheet } from '../components/CommentsSheet';
import { ShareSheet } from '../components/ShareSheet';
import { VideoMenu } from '../components/VideoMenu';

export function VideoPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { user } = useSession();

  const [video, setVideo] = useState<Video | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await get<{ video: Video }>(`/videos/${id}`);
      setVideo(data.video);
      setErrorMsg('');
    } catch (err) {
      setErrorMsg((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  const patchCount = useCallback((videoId: string, count: number) => {
    setVideo((v) => (v && v.id === videoId ? { ...v, stats: { ...v.stats, comments: count } } : v));
  }, []);

  return (
    <Layout immersive>
      {loading ? (
        <div className="reel">
          <div className="empty">
            <div className="spinner" style={{ margin: '0 auto' }} />
          </div>
        </div>
      ) : !video ? (
        <div className="reel">
          <div className="empty">
            <div className="empty__icon">🚫</div>
            <p className="empty__title">Vidéo indisponible</p>
            <p>{errorMsg || 'Cette vidéo n’existe plus.'}</p>
            <button className="btn btn--ghost" onClick={() => navigate(-1)}>
              Retour
            </button>
          </div>
        </div>
      ) : (
        <>
          <Reel
            video={video}
            active={!commentsOpen && !shareOpen && !menuOpen}
            onOpenComments={() => setCommentsOpen(true)}
            onOpenShare={() => setShareOpen(true)}
            onOpenMenu={() => setMenuOpen(true)}
            onChanged={setVideo}
            onToggleFollow={(username, following) =>
              setVideo((v) =>
                v && v.author?.username === username
                  ? { ...v, author: { ...v.author, isFollowing: following } }
                  : v,
              )
            }
          />

          {commentsOpen ? (
            <CommentsSheet
              videoId={video.id}
              commentCount={video.stats.comments}
              allowComment={video.allowComment}
              onClose={() => setCommentsOpen(false)}
              onCountChange={patchCount}
            />
          ) : null}

          {shareOpen ? <ShareSheet video={video} onClose={() => setShareOpen(false)} /> : null}

          {menuOpen ? (
            <VideoMenu
              video={video}
              onClose={() => setMenuOpen(false)}
              onDeleted={() => navigate('/')}
              onUpdated={setVideo}
            />
          ) : null}

          {!user ? (
            <button className="cartbtn" onClick={() => navigate('/auth')}>
              Connecte-toi pour aimer et commenter
            </button>
          ) : null}
        </>
      )}
    </Layout>
  );
}
