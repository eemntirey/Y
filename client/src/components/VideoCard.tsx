import type { Video } from '../lib/types';
import { compact } from '../lib/format';
import { Link } from 'react-router-dom';
import { Media } from './Media';
import { Icon } from './Icon';

interface VideoCardProps {
  video: Video;
  to?: string;
}

export function VideoCard({ video, to = `/video/${video.id}` }: VideoCardProps) {
  return (
    <Link to={to} className="vcard" aria-label={video.description || 'Vidéo'}>
      <div className="vcard__media">
        <Media src={video.src} poster={video.thumbnail} still letter={video.author?.displayName?.[0]} />
      </div>
      {video.pinned ? <span className="vcard__pin">Épinglé</span> : null}
      <div className="vcard__stats">
        <span>
          <Icon name="play" size={12} filled /> {compact(video.stats.views)}
        </span>
        <span>
          <Icon name="heart" size={12} filled /> {compact(video.stats.likes)}
        </span>
      </div>
      <div className="vcard__overlay">{video.description || 'Sans description'}</div>
    </Link>
  );
}

export function VideoCardSkeleton() {
  return <div className="vcard skeleton" />;
}
