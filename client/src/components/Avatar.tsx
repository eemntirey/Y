import { initials, toneFor } from '../lib/format';

interface AvatarProps {
  user: { username: string; displayName: string; avatar: string | null } | null | undefined;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

export function Avatar({ user, size = 'md', className }: AvatarProps) {
  const label = user ? user.displayName || user.username : '?';
  const px = { xs: 24, sm: 32, md: 40, lg: 56, xl: 96 }[size];

  if (user?.avatar) {
    return <img className={`avatar avatar--${size} ${className ?? ''}`} src={user.avatar} alt={label} loading="lazy" />;
  }
  return (
    <div
      className={`avatar avatar--${size} ${className ?? ''}`}
      style={{ background: `linear-gradient(135deg, ${toneFor(user?.username ?? '?')}, #1a1a1e)` }}
      aria-label={label}
      title={label}
    >
      <span style={{ fontSize: px * 0.38 }}>{initials(label)}</span>
    </div>
  );
}
