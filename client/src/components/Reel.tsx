import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { Video } from '../lib/types';
import { compact, duration as fmtDuration, initials, splitHashtags } from '../lib/format';
import { post } from '../lib/api';
import { useSession } from '../lib/session';
import { useToast } from '../lib/toast';
import { Icon } from './Icon';
import { Avatar } from './Avatar';
import { Media, SeedArt } from './Media';

interface ReelProps {
  video: Video;
  active: boolean;
  onOpenComments: (video: Video) => void;
  onOpenShare: (video: Video) => void;
  onChanged: (video: Video) => void;
  onOpenMenu: (video: Video) => void;
  onToggleFollow: (username: string, following: boolean) => void;
}

export function Reel({
  video,
  active,
  onOpenComments,
  onOpenShare,
  onChanged,
  onOpenMenu,
  onToggleFollow,
}: ReelProps) {
  const { user } = useSession();
  const { toast, error } = useToast();
  const navigate = useNavigate();

  const videoRef = useRef<HTMLVideoElement>(null);
  const tapTimer = useRef(0);

  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [burst, setBurst] = useState(0);
  const [likedLocal, setLikedLocal] = useState(video.liked);
  const [savedLocal, setSavedLocal] = useState(video.saved);
  const [likeCount, setLikeCount] = useState(video.stats.likes);
  const [following, setFollowing] = useState(video.author?.isFollowing ?? false);

  const isSeed = video.src.startsWith('seed:');
  const total = video.duration || 8;

  useEffect(() => {
    setLikedLocal(video.liked);
    setSavedLocal(video.saved);
    setLikeCount(video.stats.likes);
    setFollowing(video.author?.isFollowing ?? false);
    setProgress(0);
    setPaused(false);
    setExpanded(false);
  }, [video.id, video.liked, video.saved, video.stats.likes, video.author?.isFollowing]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (active && !paused) void el.play().catch(() => undefined);
    else el.pause();
  }, [active, paused]);

  // Progression simulée pour les visuels générés (aucun fichier à décoder).
  useEffect(() => {
    if (!active || paused || !isSeed) return;
    let raf = 0;
    let last = performance.now();
    let value = 0;
    const tick = (t: number) => {
      value += (t - last) / 1000 / total;
      last = t;
      if (value >= 1) value = 0;
      setProgress(value);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, paused, isSeed, total]);

  useEffect(() => {
    if (!active) return;
    void post(`/videos/${video.id}/view`).catch(() => undefined);
  }, [active, video.id]);

  const like = useCallback(async () => {
    if (!user) {
      navigate('/auth');
      return;
    }
    const optimistic = !likedLocal;
    setLikedLocal(optimistic);
    setLikeCount((c) => Math.max(0, c + (optimistic ? 1 : -1)));
    try {
      const res = await post<{ liked: boolean; likeCount: number }>(`/videos/${video.id}/like`);
      setLikedLocal(res.liked);
      setLikeCount(res.likeCount);
      onChanged({ ...video, liked: res.liked, stats: { ...video.stats, likes: res.likeCount } });
    } catch (err) {
      setLikedLocal(!optimistic);
      setLikeCount((c) => Math.max(0, c + (optimistic ? -1 : 1)));
      error((err as Error).message);
    }
  }, [user, likedLocal, video, onChanged, navigate, error]);

  const save = useCallback(async () => {
    if (!user) {
      navigate('/auth');
      return;
    }
    const optimistic = !savedLocal;
    setSavedLocal(optimistic);
    try {
      const res = await post<{ saved: boolean }>(`/videos/${video.id}/save`);
      setSavedLocal(res.saved);
      onChanged({ ...video, saved: res.saved });
      if (res.saved) toast('Enregistré dans tes favoris');
    } catch (err) {
      setSavedLocal(!optimistic);
      error((err as Error).message);
    }
  }, [user, savedLocal, video, onChanged, navigate, toast, error]);

  const share = useCallback(async () => {
    await post(`/videos/${video.id}/share`, { channel: 'link' }).catch(() => undefined);
    onOpenShare(video);
  }, [video, onOpenShare]);

  const follow = useCallback(async () => {
    if (!video.author) return;
    if (!user) {
      navigate('/auth');
      return;
    }
    const optimistic = !following;
    setFollowing(optimistic);
    onToggleFollow(video.author.username, optimistic);
    try {
      await post(`/users/${video.author.username}/follow`);
      if (optimistic) toast(`Tu suis @${video.author.username}`);
    } catch (err) {
      setFollowing(!optimistic);
      onToggleFollow(video.author.username, !optimistic);
      error((err as Error).message);
    }
  }, [video.author, user, following, onToggleFollow, navigate, toast, error]);

  const onTap = useCallback(() => {
    window.clearTimeout(tapTimer.current);
    tapTimer.current = window.setTimeout(() => setPaused((p) => !p), 210);
  }, []);

  const onDoubleTap = useCallback(() => {
    window.clearTimeout(tapTimer.current);
    if (!likedLocal) void like();
    setBurst((b) => b + 1);
  }, [likedLocal, like]);

  const letter = video.author ? (initials(video.author.displayName || video.author.username)[0] ?? 'Y') : 'Y';

  return (
    <article
      className="reel"
      aria-label={video.description || 'Vidéo'}
      onClick={onTap}
      onDoubleClick={onDoubleTap}
    >
      {video.parent ? (
        <div className="reel__stitch">
          <Media src={video.parent.src} still letter={initials(video.parent.author?.displayName ?? 'Y')[0]} />
          <span className="reel__stitch-label">@{video.parent.author?.username ?? '?'}</span>
        </div>
      ) : null}

      {isSeed ? (
        <SeedArt src={video.src} progress={progress} letter={letter} paused={!active || paused} className="reel__media" />
      ) : (
        <video
          ref={videoRef}
          className="reel__media"
          src={/^https?:\/\//.test(video.src) ? video.src : `/media/${video.src.replace(/^\/+/, '')}`}
          poster={video.thumbnail ?? undefined}
          loop
          playsInline
          onTimeUpdate={(e) => {
            const el = e.currentTarget;
            if (el.duration) setProgress(el.currentTime / el.duration);
          }}
        />
      )}

      <div className="reel__scrim" />

      {paused ? (
        <span className="reel__pause">
          <Icon name="play" size={62} filled />
        </span>
      ) : null}

      {burst > 0 ? (
        <span key={burst} className="y-burst" aria-hidden="true">
          <Icon name="heart" size={108} filled />
        </span>
      ) : null}

      <div className="reel__content">
        <div className="reel__author">
          <Link to={`/@${video.author?.username ?? ''}`} onClick={(e) => e.stopPropagation()}>
            @{video.author?.username ?? 'inconnu'}
          </Link>
          {video.author?.verified ? <Icon name="verified" size={15} className="verified" filled /> : null}
          {video.author && !following ? (
            <button
              className="reel__follow"
              onClick={(e) => {
                e.stopPropagation();
                void follow();
              }}
            >
              Suivre
            </button>
          ) : null}
        </div>

        <div className={`reel__caption${expanded ? ' is-open' : ''}`} onClick={(e) => e.stopPropagation()}>
          <span onClick={() => setExpanded((v) => !v)}>
            {splitHashtags(video.description).map((part, i) =>
              part.type === 'text' ? (
                <span key={i}>{part.value}</span>
              ) : part.type === 'tag' ? (
                <Link key={i} to={`/tag/${part.value}`} style={{ fontWeight: 700 }}>
                  #{part.value}{' '}
                </Link>
              ) : (
                <Link key={i} to={`/@${part.value}`} style={{ fontWeight: 700 }}>
                  @{part.value}{' '}
                </Link>
              ),
            )}
            {!expanded && video.description.length > 90 ? <span className="reel__more">plus</span> : null}
          </span>
        </div>

        {video.sound ? (
          <Link to={`/sound/${video.sound.id}`} className="reel__sound" onClick={(e) => e.stopPropagation()}>
            <span className="reel__spin" />
            <span>
              {video.sound.name} · {video.sound.artist}
            </span>
          </Link>
        ) : null}
      </div>

      <div className="reel__rail">
        <Avatar user={video.author} size="md" className="railstack__item" />

        <button
          className={`railbtn${likedLocal ? ' is-on' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            void like();
          }}
          aria-pressed={likedLocal}
          aria-label="J’aime"
        >
          <span className="railbtn__icon">
            <Icon name="heart" size={27} filled={likedLocal} />
          </span>
          <span className="railbtn__label">{compact(likeCount)}</span>
        </button>

        <button
          className="railbtn"
          onClick={(e) => {
            e.stopPropagation();
            onOpenComments(video);
          }}
          aria-label="Commentaires"
          style={{ opacity: video.allowComment ? 1 : 0.45 }}
        >
          <span className="railbtn__icon">
            <Icon name="comment" size={27} />
          </span>
          <span className="railbtn__label">{compact(video.stats.comments)}</span>
        </button>

        <button
          className={`railbtn${savedLocal ? ' is-on' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            void save();
          }}
          aria-pressed={savedLocal}
          aria-label="Enregistrer"
        >
          <span className="railbtn__icon">
            <Icon name="bookmark" size={26} filled={savedLocal} />
          </span>
          <span className="railbtn__label">Enregistrer</span>
        </button>

        <button
          className="railbtn"
          onClick={(e) => {
            e.stopPropagation();
            void share();
          }}
          aria-label="Partager"
        >
          <span className="railbtn__icon">
            <Icon name="share" size={26} />
          </span>
          <span className="railbtn__label">{compact(video.stats.shares)}</span>
        </button>

        <button
          className="railbtn"
          onClick={(e) => {
            e.stopPropagation();
            onOpenMenu(video);
          }}
          aria-label="Plus d’options"
        >
          <span className="railbtn__icon">
            <Icon name="more" size={22} />
          </span>
        </button>

        <div className="reel__disc" aria-hidden="true">
          {isSeed ? (
            <SeedArt src={video.src} paused letter={letter} />
          ) : (
            <video
              src={/^https?:\/\//.test(video.src) ? video.src : `/media/${video.src.replace(/^\/+/, '')}`}
              muted
              loop
              playsInline
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          )}
          <span className="reel__disc-note">
            <Icon name="music" size={11} filled />
          </span>
        </div>
        <span className="railbtn__label">{fmtDuration(total)}</span>
      </div>

      {isSeed ? (
        <div className="reel__seek" onClick={(e) => e.stopPropagation()}>
          <div className="reel__seek-fill" style={{ width: `${progress * 100}%` }} />
        </div>
      ) : null}
    </article>
  );
}
