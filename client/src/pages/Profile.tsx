import { useCallback, useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import type { User, Video } from '../lib/types';
import { get, post, qs } from '../lib/api';
import { useSession } from '../lib/session';
import { useToast } from '../lib/toast';
import { compact, timeAgo } from '../lib/format';
import { Layout } from '../components/Layout';
import { Avatar } from '../components/Avatar';
import { Icon } from '../components/Icon';
import { VideoCard } from '../components/VideoCard';
import { Modal } from '../components/Overlay';
import { UserRow } from './Discover';

type Tab = 'videos' | 'liked' | 'saved' | 'products';

const TABS: Array<{ id: Tab; label: string; icon: 'grid' | 'heart' | 'bookmark' | 'bag'; private?: boolean }> = [
  { id: 'videos', label: 'Vidéos', icon: 'grid' },
  { id: 'liked', label: 'Aimées', icon: 'heart' },
  { id: 'saved', label: 'Enregistrées', icon: 'bookmark', private: true },
  { id: 'products', label: 'Boutique', icon: 'bag' },
];

interface ProfileData {
  user: User;
  locked: boolean;
  videos: Video[];
}

interface Stats {
  totals: { views: number; likes: number; comments: number; shares: number };
  videos: Array<{ id: string; view_count: number; like_count: number }>;
  timeline: Array<{ day: string; views: number }>;
}

export function ProfilePage() {
  const { username = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const { user: me } = useSession();
  const { toast, error } = useToast();

  const [data, setData] = useState<ProfileData | null>(null);
  const [tab, setTab] = useState<Tab>((params.get('tab') as Tab) ?? 'videos');
  const [videos, setVideos] = useState<Video[]>([]);
  const [nextOffset, setNextOffset] = useState<number | null>(0);
  const [loading, setLoading] = useState(true);
  const [following, setFollowing] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [followersOpen, setFollowersOpen] = useState<'followers' | 'following' | null>(null);
  const [followList, setFollowList] = useState<User[]>([]);
  const [products, setProducts] = useState<{ id: string; title: string; price: number; sales: number }[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ displayName: '', bio: '', link: '' });

  const isMe = me?.username === username;

  const loadProfile = useCallback(async () => {
    setLoading(true);
    try {
      const res = await get<ProfileData>(`/users/${username}`);
      setData(res);
      setFollowing(res.user.isFollowing);
      setBlocked(res.user.isBlocked);
      setDraft({ displayName: res.user.displayName, bio: res.user.bio, link: res.user.link });
      if (res.videos.length > 0) setVideos(res.videos);
    } catch (err) {
      error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [username, error]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const loadTab = useCallback(async () => {
    if (!data) return;
    if (tab === 'videos' && data.videos.length > 0) {
      setVideos(data.videos);
      return;
    }
    setVideos([]);
    if (tab === 'videos' || tab === 'liked') {
      const res = await get<{ items: Video[]; nextOffset: number | null }>(
        `/users/${username}/videos${qs({ tab, limit: 18 })}`,
      );
      setVideos(res.items);
      setNextOffset(res.nextOffset);
      return;
    }
    if (tab === 'saved') {
      const res = await get<{ items: Video[]; nextOffset: number | null }>(
        `/users/${username}/videos${qs({ tab: 'saved', limit: 18 })}`,
      );
      setVideos(res.items);
      setNextOffset(res.nextOffset);
      return;
    }
    if (tab === 'products') {
      const res = await get<{ items: { id: string; title: string; price: number; sales: number }[] }>(
        `/shop/products${qs({ seller: username })}`,
      );
      setProducts(res.items);
    }
  }, [data, tab, username]);

  useEffect(() => {
    void loadTab();
  }, [loadTab]);

  useEffect(() => {
    setParams(tab === 'videos' ? {} : { tab }, { replace: true });
  }, [tab, setParams]);

  useEffect(() => {
    if (!isMe || !me) return;
    get<Stats>(`/users/${me.username}/videos/analytics`)
      .then(setStats)
      .catch(() => undefined);
  }, [isMe, me]);

  const toggleFollow = async () => {
    if (!me) return;
    const next = !following;
    setFollowing(next);
    try {
      const res = await post<{ following: boolean; user: User }>(`/users/${username}/follow`);
      setFollowing(res.following);
      setData((d) => (d ? { ...d, user: res.user } : d));
    } catch (err) {
      setFollowing(!next);
      error((err as Error).message);
    }
  };

  const toggleBlock = async () => {
    if (!me) return;
    const res = await post<{ blocked: boolean }>(`/users/${username}/block`);
    setBlocked(res.blocked);
    setMenuOpen(false);
    toast(res.blocked ? `@${username} est bloqué` : `@${username} est débloqué`);
  };

  const openFollowList = async (kind: 'followers' | 'following') => {
    setFollowersOpen(kind);
    const res = await get<{ items: User[] }>(`/users/${username}/${kind}`);
    setFollowList(res.items);
  };

  const copyProfileLink = async () => {
    try {
      await navigator.clipboard.writeText(`${location.origin}/@${username}`);
      toast('Lien du profil copié');
    } catch {
      error('Copie impossible sur ce navigateur');
    }
  };

  const saveProfile = async () => {
    if (!me) return;
    try {
      const res = await post<{ user: User }>('/auth/me', draft);
      setData((d) => (d ? { ...d, user: res.user } : d));
      setEditing(false);
      toast('Profil mis à jour');
    } catch (err) {
      error((err as Error).message);
    }
  };

  const loadMore = async () => {
    if (nextOffset === null) return;
    const res = await get<{ items: Video[]; nextOffset: number | null }>(
      `/users/${username}/videos${qs({ tab, limit: 18, offset: nextOffset })}`,
    );
    setVideos((v) => [...v, ...res.items]);
    setNextOffset(res.nextOffset);
  };

  if (loading && !data) {
    return (
      <Layout>
        <div className="page">
          <div className="skeleton" style={{ height: 190, borderRadius: 18, marginBottom: 18 }} />
          <div className="grid">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="vcard skeleton" />
            ))}
          </div>
        </div>
      </Layout>
    );
  }

  if (!data) {
    return (
      <Layout>
        <div className="page">
          <div className="empty">
            <div className="empty__icon">🙈</div>
            <p className="empty__title">Compte introuvable</p>
            <Link className="btn btn--ghost" to="/discover">
              Explorer
            </Link>
          </div>
        </div>
      </Layout>
    );
  }

  const profile = data.user;

  return (
    <Layout>
      <div className="page">
        <div className="profile">
          <Avatar user={profile} size="xl" />
          <div className="profile__name">
            {profile.displayName}
            {profile.verified ? <Icon name="verified" size={16} className="verified" filled /> : null}
          </div>
          <p className="link-plain">@{profile.username}</p>

          <div className="profile__row">
            <button className="profile__stat" onClick={() => void openFollowList('following')}>
              <b>{compact(profile.stats.following)}</b>
              <span>Abonnements</span>
            </button>
            <button className="profile__stat" onClick={() => void openFollowList('followers')}>
              <b>{compact(profile.stats.followers)}</b>
              <span>Abonnés</span>
            </button>
            <div className="profile__stat">
              <b>{compact(profile.stats.likes)}</b>
              <span>J’aime</span>
            </div>
          </div>

          {profile.bio ? <p className="profile__bio">{profile.bio}</p> : null}
          {profile.link ? (
            <a className="profile__link" href={`https://${profile.link.replace(/^https?:\/\//, '')}`} target="_blank" rel="noreferrer">
              {profile.link}
            </a>
          ) : null}
          <p className="link-plain">Rejoint le {timeAgo(profile.createdAt)}</p>

          <div className="profile__actions">
            {isMe ? (
              <>
                <button className="btn btn--light" onClick={() => setEditing(true)}>
                  Modifier le profil
                </button>
                <Link className="btn btn--ghost" to="/upload">
                  <Icon name="upload" size={17} /> Publier
                </Link>
              </>
            ) : me ? (
              <>
                <button
                  className={`btn ${following ? 'btn--ghost' : 'btn--primary'}`}
                  onClick={() => void toggleFollow()}
                >
                  {following ? 'Abonné' : 'Suivre'}
                </button>
                <button className="btn btn--ghost" onClick={() => void copyProfileLink()}>
                  <Icon name="share" size={17} /> Partager
                </button>
                <button className="iconbtn" onClick={() => setMenuOpen(true)} aria-label="Options">
                  <Icon name="more" size={22} />
                </button>
              </>
            ) : (
              <Link className="btn btn--primary" to="/auth">
                Suivre
              </Link>
            )}
          </div>

          {profile.isPrivate && data.locked ? (
            <div className="empty">
              <div className="empty__icon">🔒</div>
              <p className="empty__title">Ce compte est privé</p>
              <p>Abonne-toi pour voir ses vidéos.</p>
            </div>
          ) : null}
        </div>

        {isMe && stats ? (
          <section className="section">
            <h2 className="section__title">
              <Icon name="chart" size={18} /> Tes statistiques
            </h2>
            <div className="grid grid--3">
              <div className="statcard">
                <b>{compact(stats.totals.views)}</b>
                <span>Vues totales</span>
              </div>
              <div className="statcard">
                <b>{compact(stats.totals.likes)}</b>
                <span>J’aime</span>
              </div>
              <div className="statcard">
                <b>{compact(stats.totals.comments)}</b>
                <span>Commentaires</span>
              </div>
            </div>
            {stats.timeline.length > 0 ? (
              <div style={{ marginTop: 14 }}>
                <div className="bars">
                  {stats.timeline.slice(-21).map((d) => {
                    const max = Math.max(...stats.timeline.map((x) => x.views), 1);
                    return (
                      <div
                        key={d.day}
                        className="bars__bar"
                        style={{ height: `${Math.max(4, (d.views / max) * 100)}%` }}
                        title={`${d.day} : ${d.views} vues`}
                      />
                    );
                  })}
                </div>
                <p className="link-plain" style={{ marginTop: 6 }}>
                  Vues des {stats.timeline.length} derniers jours
                </p>
              </div>
            ) : null}
          </section>
        ) : null}

        <div className="tabs">
          {TABS.filter((t) => !t.private || isMe).map((t) => (
            <button
              key={t.id}
              className={`tabs__item${tab === t.id ? ' is-active' : ''}`}
              onClick={() => setTab(t.id)}
              aria-label={t.label}
            >
              <Icon name={t.icon} size={21} filled={tab === t.id} />
            </button>
          ))}
        </div>

        {tab === 'products' ? (
          products.length === 0 ? (
            <div className="empty">
              <div className="empty__icon">🛍️</div>
              <p className="empty__title">Aucune vente</p>
              <p>Les produits de ce compte apparaîtront ici.</p>
            </div>
          ) : (
            <div className="grid grid--wide">
              {products.map((p) => (
                <Link key={p.id} to={`/shop?product=${p.id}`} className="product">
                  <div className="product__img">🛍️</div>
                  <div className="product__body">
                    <span className="product__title">{p.title}</span>
                    <span className="product__price">{(p.price / 100).toFixed(2)} €</span>
                    <span className="row__sub">{p.sales} vente(s)</span>
                  </div>
                </Link>
              ))}
            </div>
          )
        ) : videos.length === 0 ? (
          <div className="empty">
            <div className="empty__icon">
              {tab === 'liked' ? '💜' : tab === 'saved' ? '🔖' : '🎬'}
            </div>
            <p className="empty__title">
              {tab === 'liked' ? 'Aucune vidéo aimée' : tab === 'saved' ? 'Rien d’enregistré' : 'Aucune vidéo'}
            </p>
            <p>
              {isMe
                ? 'Publie ta première vidéo pour remplir cette section.'
                : 'Cette section est vide pour le moment.'}
            </p>
            {isMe && tab === 'videos' ? (
              <Link className="btn btn--primary" to="/upload">
                Publier une vidéo
              </Link>
            ) : null}
          </div>
        ) : (
          <>
            <div className="grid">
              {videos.map((v) => (
                <VideoCard key={v.id} video={v} />
              ))}
            </div>
            {nextOffset !== null ? (
              <div style={{ display: 'grid', placeItems: 'center', marginTop: 16 }}>
                <button className="btn btn--ghost" onClick={() => void loadMore()}>
                  Charger plus
                </button>
              </div>
            ) : null}
          </>
        )}
      </div>

      {editing ? (
        <Modal
          title="Modifier le profil"
          onClose={() => setEditing(false)}
          footer={
            <>
              <button className="btn btn--ghost" onClick={() => setEditing(false)}>
                Annuler
              </button>
              <button className="btn btn--primary" onClick={() => void saveProfile()}>
                Enregistrer
              </button>
            </>
          }
        >
          <div className="field">
            <label className="field__label">Nom affiché</label>
            <input
              className="input"
              value={draft.displayName}
              onChange={(e) => setDraft({ ...draft, displayName: e.target.value })}
            />
          </div>
          <div className="field">
            <label className="field__label">Bio</label>
            <textarea
              className="textarea"
              rows={3}
              value={draft.bio}
              onChange={(e) => setDraft({ ...draft, bio: e.target.value })}
            />
          </div>
          <div className="field">
            <label className="field__label">Lien</label>
            <input
              className="input"
              placeholder="y.app/lea"
              value={draft.link}
              onChange={(e) => setDraft({ ...draft, link: e.target.value })}
            />
          </div>
          <div className="switchrow">
            <div>
              <div className="switchrow__label">Compte privé</div>
              <div className="switchrow__hint">Seuls tes abonnés verront tes vidéos</div>
            </div>
            <button
              className={`switch${profile.isPrivate ? ' is-on' : ''}`}
              onClick={() =>
                void post('/auth/me', { isPrivate: !profile.isPrivate }).then(() => void loadProfile())
              }
              aria-pressed={profile.isPrivate}
              aria-label="Compte privé"
            />
          </div>
        </Modal>
      ) : null}

      {menuOpen ? (
        <Modal title={`@${username}`} onClose={() => setMenuOpen(false)}>
          <div className="list">
            <button className="row" onClick={() => void toggleBlock()}>
              <span className="row__main">{blocked ? '🔓 Débloquer' : '🚫 Bloquer ce compte'}</span>
            </button>
            <button
              className="row"
              onClick={() => {
                setMenuOpen(false);
                void copyProfileLink();
              }}
            >
              <span className="row__main">🔗 Copier le lien du profil</span>
            </button>
          </div>
        </Modal>
      ) : null}

      {followersOpen ? (
        <Modal title={followersOpen === 'followers' ? 'Abonnés' : 'Abonnements'} onClose={() => setFollowersOpen(null)}>
          {followList.length === 0 ? (
            <div className="empty">
              <p>Aucun compte</p>
            </div>
          ) : (
            <div className="list">
              {followList.map((u) => (
                <UserRow key={u.id} user={u} />
              ))}
            </div>
          )}
        </Modal>
      ) : null}
    </Layout>
  );
}
