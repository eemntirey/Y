import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { Video } from '../lib/types';
import { get } from '../lib/api';
import { compact } from '../lib/format';
import { Layout } from '../components/Layout';
import { VideoCard } from '../components/VideoCard';

interface SoundInfo {
  id: string;
  name: string;
  artist: string;
  videoCount: number;
}

export function SoundPage() {
  const { id = '' } = useParams();
  const [sound, setSound] = useState<SoundInfo | null>(null);
  const [videos, setVideos] = useState<Video[]>([]);

  useEffect(() => {
    get<{ items: SoundInfo[] }>('/discover/sounds')
      .then((d) => setSound(d.items.find((s) => s.id === id) ?? null))
      .catch(() => undefined);
    get<{ items: Video[] }>(`/discover/sounds/${id}/videos`)
      .then((d) => setVideos(d.items))
      .catch(() => undefined);
  }, [id]);

  return (
    <Layout>
      <div className="page">
        <div className="row">
          <span className="hashcard__mark">♪</span>
          <span className="row__main">
            <span className="row__title">{sound?.name ?? 'Son'}</span>
            <span className="row__sub">
              {sound?.artist} · {compact(sound?.videoCount ?? 0)} vidéo(s)
            </span>
          </span>
        </div>
        <div className="divider" />
        {videos.length === 0 ? (
          <div className="empty">
            <p>Aucune vidéo avec ce son</p>
          </div>
        ) : (
          <div className="grid">
            {videos.map((v) => (
              <VideoCard key={v.id} video={v} />
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
