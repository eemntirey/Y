import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { Hashtag, Sound, User, Video } from '../lib/types';
import { del, get, post, qs } from '../lib/api';
import { useSession } from '../lib/session';
import { Layout } from '../components/Layout';
import { Avatar } from '../components/Avatar';
import { Icon } from '../components/Icon';
import { VideoCard } from '../components/VideoCard';
import { compact } from '../lib/format';

type Tab = 'top' | 'users' | 'tags' | 'sounds' | 'videos';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'top', label: 'Tendances' },
  { id: 'users', label: 'Comptes' },
  { id: 'tags', label: 'Hashtags' },
  { id: 'sounds', label: 'Sons' },
  { id: 'videos', label: 'Vidéos' },
];

interface SearchResults {
  users: User[];
  hashtags: Hashtag[];
  sounds: Sound[];
  videos: Video[];
}

export function DiscoverPage() {
  const { user } = useSession();
  const [params, setParams] = useSearchParams();
  const term = params.get('q') ?? '';
  const [tab, setTab] = useState<Tab>(term ? 'top' : 'top');
  const [input, setInput] = useState(term);

  const [suggestions, setSuggestions] = useState<User[]>([]);
  const [trending, setTrending] = useState<Hashtag[]>([]);
  const [sounds, setSounds] = useState<Sound[]>([]);
  const [liveRooms, setLiveRooms] = useState<{ id: string; title: string; viewers: number; host: User | null }[]>([]);
  const [history, setHistory] = useState<string[]>([]);
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setInput(term);
  }, [term]);

  const loadFeed = useCallback(async () => {
    const [sug, tags, snd, live, hist] = await Promise.all([
      get<{ items: User[] }>('/users/suggestions?limit=10'),
      get<{ items: Hashtag[] }>('/discover/hashtags/trending'),
      get<{ items: Sound[] }>('/discover/sounds'),
      get<{ items: { id: string; title: string; stats: { viewers: number }; host: User | null }[] }>('/live/rooms'),
      user ? get<{ items: string[] }>('/discover/search/history') : Promise.resolve({ items: [] as string[] }),
    ]);
    setSuggestions(sug.items);
    setTrending(tags.items);
    setSounds(snd.items);
    setLiveRooms(
      live.items.map((r) => ({ id: r.id, title: r.title, viewers: r.stats.viewers, host: r.host })),
    );
    setHistory(hist.items);
  }, [user]);

  useEffect(() => {
    void loadFeed();
  }, [loadFeed]);

  const runSearch = useCallback(
    async (q: string) => {
      setLoading(true);
      try {
        const data = await get<SearchResults>(`/discover/search${qs({ q })}`);
        setResults(data);
        if (user) {
          const hist = await get<{ items: string[] }>('/discover/search/history');
          setHistory(hist.items);
        }
      } finally {
        setLoading(false);
      }
    },
    [user],
  );

  useEffect(() => {
    if (term) void runSearch(term);
    else setResults(null);
  }, [term, runSearch]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = input.trim();
    setParams(q ? { q } : {});
  };

  const clearHistory = async () => {
    await del('/discover/search/history').catch(() => undefined);
    setHistory([]);
  };

  return (
    <Layout>
      <div className="page">
        <form className="discover__search" onSubmit={submit}>
          <Icon name="search" size={20} />
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Rechercher comptes, hashtags, sons, vidéos"
            aria-label="Rechercher"
          />
          {input ? (
            <button type="button" onClick={() => { setInput(''); setParams({}); }} aria-label="Effacer">
              <Icon name="close" size={16} />
            </button>
          ) : null}
        </form>

        {term ? (
          <>
            <div className="chiprow" style={{ marginBottom: 18 }}>
              {TABS.map((t) => (
                <button
                  key={t.id}
                  className={`chip${tab === t.id ? ' is-active' : ''}`}
                  onClick={() => setTab(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {loading && !results ? (
              <div className="grid grid--wide">
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="vcard skeleton" />
                ))}
              </div>
            ) : results ? (
              <>
                {tab === 'top' ? (
                  <>
                    {results.users.length > 0 ? (
                      <section className="section">
                        <h2 className="section__title">Comptes</h2>
                        <div className="list">
                          {results.users.slice(0, 6).map((u) => (
                            <UserRow key={u.id} user={u} />
                          ))}
                        </div>
                      </section>
                    ) : null}
                    {results.hashtags.length > 0 ? (
                      <section className="section">
                        <h2 className="section__title">Hashtags</h2>
                        <div className="grid grid--wide">
                          {results.hashtags.map((h) => (
                            <Link key={h.id} to={`/tag/${h.name}`} className="hashcard">
                              <span className="hashcard__mark">#</span>
                              <span className="row__main">
                                <span className="row__title">#{h.name}</span>
                                <span className="row__sub">{compact(h.videoCount)} vidéo(s)</span>
                              </span>
                            </Link>
                          ))}
                        </div>
                      </section>
                    ) : null}
                    {results.sounds.length > 0 ? (
                      <section className="section">
                        <h2 className="section__title">Sons</h2>
                        <div className="list">
                          {results.sounds.map((s) => (
                            <Link key={s.id} to={`/sound/${s.id}`} className="row">
                              <span className="hashcard__mark" style={{ fontSize: 15 }}>
                                ♪
                              </span>
                              <span className="row__main">
                                <span className="row__title">{s.name}</span>
                                <span className="row__sub">
                                  {s.artist} · {compact(s.videoCount)} vidéo(s)
                                </span>
                              </span>
                            </Link>
                          ))}
                        </div>
                      </section>
                    ) : null}
                    {results.videos.length > 0 ? (
                      <section className="section">
                        <h2 className="section__title">Vidéos</h2>
                        <div className="grid">
                          {results.videos.slice(0, 18).map((v) => (
                            <VideoCard key={v.id} video={v} />
                          ))}
                        </div>
                      </section>
                    ) : null}
                    {results.users.length + results.hashtags.length + results.sounds.length + results.videos.length ===
                    0 ? (
                      <div className="empty">
                        <div className="empty__icon">🔍</div>
                        <p className="empty__title">Aucun résultat pour « {term} »</p>
                        <p>Essaie un autre mot-clé.</p>
                      </div>
                    ) : null}
                  </>
                ) : null}

                {tab === 'users' ? (
                  results.users.length ? (
                    <div className="list">
                      {results.users.map((u) => (
                        <UserRow key={u.id} user={u} />
                      ))}
                    </div>
                  ) : (
                    <Empty text="Aucun compte trouvé" />
                  )
                ) : null}

                {tab === 'tags' ? (
                  results.hashtags.length ? (
                    <div className="grid grid--wide">
                      {results.hashtags.map((h) => (
                        <Link key={h.id} to={`/tag/${h.name}`} className="hashcard">
                          <span className="hashcard__mark">#</span>
                          <span className="row__main">
                            <span className="row__title">#{h.name}</span>
                            <span className="row__sub">{compact(h.videoCount)} vidéo(s)</span>
                          </span>
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <Empty text="Aucun hashtag trouvé" />
                  )
                ) : null}

                {tab === 'sounds' ? (
                  results.sounds.length ? (
                    <div className="list">
                      {results.sounds.map((s) => (
                        <Link key={s.id} to={`/sound/${s.id}`} className="row">
                          <span className="hashcard__mark" style={{ fontSize: 15 }}>
                            ♪
                          </span>
                          <span className="row__main">
                            <span className="row__title">{s.name}</span>
                            <span className="row__sub">
                              {s.artist} · {compact(s.videoCount)} vidéo(s)
                            </span>
                          </span>
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <Empty text="Aucun son trouvé" />
                  )
                ) : null}

                {tab === 'videos' ? (
                  results.videos.length ? (
                    <div className="grid">
                      {results.videos.map((v) => (
                        <VideoCard key={v.id} video={v} />
                      ))}
                    </div>
                  ) : (
                    <Empty text="Aucune vidéo trouvée" />
                  )
                ) : null}
              </>
            ) : null}
          </>
        ) : (
          <>
            {history.length > 0 ? (
              <section className="section">
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <h2 className="section__title" style={{ flex: 1, marginBottom: 12 }}>
                    Recherches récentes
                  </h2>
                  <button className="link-plain" onClick={() => void clearHistory()}>
                    Effacer
                  </button>
                </div>
                <div className="chiprow">
                  {history.map((h) => (
                    <button key={h} className="chip" onClick={() => setParams({ q: h })}>
                      {h}
                    </button>
                  ))}
                </div>
              </section>
            ) : null}

            {liveRooms.length > 0 ? (
              <section className="section">
                <h2 className="section__title">
                  <Icon name="live" size={18} /> En direct
                </h2>
                <div className="grid grid--wide">
                  {liveRooms.slice(0, 6).map((room) => (
                    <Link key={room.id} to={`/live/${room.id}`} className="livecard">
                      <div className="livecard__body">
                        <span className="livecard__live">
                          <span className="pulse-dot" /> LIVE
                        </span>
                        <div className="row__title" style={{ color: '#fff' }}>
                          {room.title}
                        </div>
                        <div className="row__sub" style={{ color: 'rgba(255,255,255,.75)' }}>
                          @{room.host?.username ?? '?'} · {compact(room.viewers)} spectateur(s)
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            ) : null}

            <section className="section">
              <h2 className="section__title">Hashtags tendance</h2>
              {trending.length === 0 ? (
                <Empty text="Pas encore de tendances" />
              ) : (
                <div className="grid grid--wide">
                  {trending.slice(0, 12).map((h, i) => (
                    <Link key={h.id} to={`/tag/${h.name}`} className="hashcard">
                      <span className="hashcard__mark">#</span>
                      <span className="row__main">
                        <span className="row__title">#{h.name}</span>
                        <span className="row__sub">
                          {compact(h.videoCount)} vidéo(s) · {compact(h.viewCount)} vues
                        </span>
                      </span>
                      <span className="badge">{i < 3 ? 'Top' : compact(h.viewCount)}</span>
                    </Link>
                  ))}
                </div>
              )}
            </section>

            {user ? (
              <section className="section">
                <h2 className="section__title">Comptes suggérés</h2>
                <div className="list">
                  {suggestions.map((u) => (
                    <UserRow key={u.id} user={u} />
                  ))}
                </div>
              </section>
            ) : null}

            <section className="section">
              <h2 className="section__title">Sons populaires</h2>
              <div className="list">
                {sounds.slice(0, 8).map((s) => (
                  <Link key={s.id} to={`/sound/${s.id}`} className="row">
                    <span className="hashcard__mark" style={{ fontSize: 15 }}>
                      ♪
                    </span>
                    <span className="row__main">
                      <span className="row__title">{s.name}</span>
                      <span className="row__sub">
                        {s.artist} · {compact(s.videoCount)} vidéo(s)
                      </span>
                    </span>
                    <Icon name="music" size={18} />
                  </Link>
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </Layout>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="empty">
      <div className="empty__icon">✨</div>
      <p>{text}</p>
    </div>
  );
}

export function UserRow({ user }: { user: User }) {
  const { user: me } = useSession();
  const [following, setFollowing] = useState(user.isFollowing);

  const toggle = async () => {
    if (!me) return;
    const next = !following;
    setFollowing(next);
    try {
      await post(`/users/${user.username}/follow`);
    } catch {
      setFollowing(!next);
    }
  };

  return (
    <div className="row">
      <Link to={`/@${user.username}`}>
        <Avatar user={user} size="md" />
      </Link>
      <span className="row__main">
        <Link to={`/@${user.username}`} className="row__title">
          {user.displayName}
          {user.verified ? <Icon name="verified" size={14} className="verified" filled /> : null}
        </Link>
        <span className="row__sub">
          @{user.username} · {compact(user.stats.followers)} abonné(s) · {compact(user.stats.likes)} j’aime
        </span>
      </span>
      {me && me.id !== user.id ? (
        <button
          className={`btn btn--sm ${following ? 'btn--ghost' : 'btn--primary'}`}
          onClick={() => void toggle()}
        >
          {following ? 'Abonné' : 'Suivre'}
        </button>
      ) : null}
    </div>
  );
}
