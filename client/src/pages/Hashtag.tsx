import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { Hashtag, Video } from '../lib/types';
import { get, qs } from '../lib/api';
import { compact } from '../lib/format';
import { Layout } from '../components/Layout';
import { Icon } from '../components/Icon';
import { VideoCard } from '../components/VideoCard';

export function HashtagPage() {
  const { name = '' } = useParams();
  const navigate = useNavigate();
  const [tag, setTag] = useState<Hashtag | null>(null);
  const [related, setRelated] = useState<{ name: string; sharedCount: number }[]>([]);
  const [videos, setVideos] = useState<Video[]>([]);

  useEffect(() => {
    setVideos([]);
    get<{ hashtag: Hashtag; items: Video[] }>(`/discover/hashtags/${name}`)
      .then((d) => {
        setTag(d.hashtag);
        setVideos(d.items);
      })
      .catch(() => navigate('/discover'));
    get<{ items: { name: string; sharedCount: number }[] }>(`/discover/hashtags/${name}/related`)
      .then((d) => setRelated(d.items))
      .catch(() => undefined);
  }, [name, navigate]);

  const loadMore = async () => {
    const res = await get<{ items: Video[] }>(`/discover/hashtags/${name}${qs({ offset: videos.length, limit: 18 })}`);
    setVideos((v) => [...v, ...res.items]);
  };

  return (
    <Layout>
      <div className="page">
        <div className="row">
          <span className="hashcard__mark">#</span>
          <span className="row__main">
            <span className="row__title" style={{ fontSize: 18 }}>
              #{tag?.name ?? name}
            </span>
            <span className="row__sub">
              {compact(tag?.videoCount ?? 0)} vidéo(s) · {compact(tag?.viewCount ?? 0)} vues
            </span>
          </span>
        </div>

        {related.length > 0 ? (
          <section className="section">
            <h2 className="section__title">Hashtags proches</h2>
            <div className="chiprow">
              {related.map((r) => (
                <Link key={r.name} to={`/tag/${r.name}`} className="chip">
                  #{r.name}
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        {videos.length === 0 ? (
          <div className="empty">
            <div className="empty__icon">#</div>
            <p className="empty__title">Aucune vidéo pour ce hashtag</p>
            <p>Sois le premier à le publier.</p>
            <Link className="btn btn--primary" to="/upload">
              Publier
            </Link>
          </div>
        ) : (
          <>
            <div className="grid">
              {videos.map((v) => (
                <VideoCard key={v.id} video={v} />
              ))}
            </div>
            {videos.length >= 18 ? (
              <div style={{ display: 'grid', placeItems: 'center', marginTop: 16 }}>
                <button className="btn btn--ghost" onClick={() => void loadMore()}>
                  <Icon name="plus" size={16} /> Charger plus
                </button>
              </div>
            ) : null}
          </>
        )}
      </div>
    </Layout>
  );
}
