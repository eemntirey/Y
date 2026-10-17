import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { FeedMode, Video } from '../lib/types';
import { get } from '../lib/api';
import { useSession } from '../lib/session';
import { Layout } from '../components/Layout';
import { Reel } from '../components/Reel';
import { CommentsSheet } from '../components/CommentsSheet';
import { ShareSheet } from '../components/ShareSheet';
import { VideoMenu } from '../components/VideoMenu';

const TABS: Array<{ mode: FeedMode; label: string; auth?: boolean }> = [
  { mode: 'following', label: 'Abonnements', auth: true },
  { mode: 'friends', label: 'Amis', auth: true },
  { mode: 'foryou', label: 'Pour toi' },
];

export function FeedPage() {
  const { user } = useSession();
  const navigate = useNavigate();

  const [mode, setMode] = useState<FeedMode>('foryou');
  const [items, setItems] = useState<Video[]>([]);
  const [nextOffset, setNextOffset] = useState<number | null>(0);
  const [loading, setLoading] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);

  const [commentsFor, setCommentsFor] = useState<Video | null>(null);
  const [shareFor, setShareFor] = useState<Video | null>(null);
  const [menuFor, setMenuFor] = useState<Video | null>(null);

  const scrollerRef = useRef<HTMLDivElement>(null);
  const loadingRef = useRef(false);

  const load = useCallback(
    async (nextMode: FeedMode, offset: number) => {
      if (loadingRef.current) return;
      loadingRef.current = true;
      setLoading(true);
      try {
        const data = await get<{ items: Video[]; nextOffset: number | null }>(
          `/videos/feed?mode=${nextMode}&offset=${offset}&limit=6`,
        );
        setItems((prev) => (offset === 0 ? data.items : dedupe([...prev, ...data.items])));
        setNextOffset(data.nextOffset);
      } catch {
        setNextOffset(null);
      } finally {
        loadingRef.current = false;
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    setItems([]);
    setActiveIndex(0);
    scrollerRef.current?.scrollTo({ top: 0 });
    void load(mode, 0);
  }, [mode, load]);

  // index actif via IntersectionObserver sur chaque reel
  useEffect(() => {
    const root = scrollerRef.current;
    if (!root) return;
    const nodes = Array.from(root.querySelectorAll<HTMLElement>('.reel'));
    if (nodes.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (!visible) return;
        const idx = nodes.indexOf(visible.target as HTMLElement);
        if (idx >= 0) setActiveIndex(idx);
        if (idx >= items.length - 3 && nextOffset !== null) void load(mode, nextOffset);
      },
      { root, threshold: [0.6] },
    );

    nodes.forEach((n) => observer.observe(n));
    return () => observer.disconnect();
  }, [items.length, nextOffset, mode, load]);

  const patchVideo = useCallback((updated: Video) => {
    setItems((prev) => prev.map((v) => (v.id === updated.id ? { ...v, ...updated } : v)));
  }, []);

  const patchCount = useCallback((videoId: string, count: number) => {
    setItems((prev) => prev.map((v) => (v.id === videoId ? { ...v, stats: { ...v.stats, comments: count } } : v)));
  }, []);

  const toggleFollow = useCallback((username: string, following: boolean) => {
    setItems((prev) =>
      prev.map((v) =>
        v.author?.username === username
          ? { ...v, author: { ...v.author, isFollowing: following, stats: { ...v.author.stats, followers: v.author.stats.followers + (following ? 1 : -1) } } }
          : v,
      ),
    );
  }, []);

  const deleteVideo = useCallback((videoId: string) => {
    setItems((prev) => prev.filter((v) => v.id !== videoId));
  }, []);

  const visibleTabs = useMemo(() => TABS.filter((t) => !t.auth || user), [user]);

  return (
    <Layout immersive>
      <div className="feed">
        <div className="feed__tabs">
          {visibleTabs.map((tab) => (
            <span key={tab.mode} style={{ display: 'flex', alignItems: 'center' }}>
              <button
                className={`feed__tab${mode === tab.mode ? ' is-active' : ''}`}
                onClick={() => setMode(tab.mode)}
              >
                {tab.label}
              </button>
              {tab.mode !== 'foryou' ? <span className="feed__tab-sep">|</span> : null}
            </span>
          ))}
        </div>

        <div className="scroller" ref={scrollerRef}>
          {items.map((video, index) => (
            <Reel
              key={video.id}
              video={video}
              active={index === activeIndex && !commentsFor && !shareFor && !menuFor}
              onOpenComments={setCommentsFor}
              onOpenShare={setShareFor}
              onOpenMenu={setMenuFor}
              onChanged={patchVideo}
              onToggleFollow={toggleFollow}
            />
          ))}

          {loading && items.length === 0 ? (
            <div className="reel">
              <div className="empty">
                <div className="spinner" style={{ margin: '0 auto 14px' }} />
                <p>Chargement du fil…</p>
              </div>
            </div>
          ) : null}

          {items.length === 0 && !loading ? (
            <div className="reel">
              <div className="empty">
                <div className="empty__icon">{mode === 'foryou' ? '🎬' : '👥'}</div>
                <p className="empty__title">
                  {mode === 'foryou' ? 'Aucune vidéo pour le moment' : 'Ton fil est vide'}
                </p>
                <p>
                  {mode === 'foryou'
                    ? 'Suis des créateurs ou publie ta première vidéo.'
                    : 'Abonne-toi à des créateurs pour remplir ton fil.'}
                </p>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                  <button className="btn btn--primary" onClick={() => navigate('/discover')}>
                    Découvrir
                  </button>
                  <button className="btn btn--ghost" onClick={() => navigate('/upload')}>
                    Publier
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {commentsFor ? (
        <CommentsSheet
          videoId={commentsFor.id}
          commentCount={commentsFor.stats.comments}
          allowComment={commentsFor.allowComment}
          onClose={() => setCommentsFor(null)}
          onCountChange={patchCount}
        />
      ) : null}

      {shareFor ? <ShareSheet video={shareFor} onClose={() => setShareFor(null)} /> : null}

      {menuFor ? (
        <VideoMenu
          video={menuFor}
          onClose={() => setMenuFor(null)}
          onDeleted={deleteVideo}
          onUpdated={patchVideo}
        />
      ) : null}
    </Layout>
  );
}

const dedupe = (list: Video[]): Video[] => {
  const seen = new Set<string>();
  return list.filter((v) => {
    if (seen.has(v.id)) return false;
    seen.add(v.id);
    return true;
  });
};
