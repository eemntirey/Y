import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useSession } from '../lib/session';
import { get } from '../lib/api';
import { onWs } from '../lib/socket';
import { Icon, type IconName } from './Icon';
import { Avatar } from './Avatar';

interface NavEntry {
  to: string;
  label: string;
  icon: IconName;
  badge?: number;
  auth?: boolean;
}

export function Logo({ small }: { small?: boolean }) {
  return (
    <Link to="/" className={`logo${small ? ' logo--sm' : ''}`} aria-label="Y, accueil">
      <span className="logo__mark">Y</span>
      <span className="logo__word">Y</span>
    </Link>
  );
}

function useCounters(authed: boolean) {
  const [notifications, setNotifications] = useState(0);
  const [messages, setMessages] = useState(0);

  useEffect(() => {
    if (!authed) {
      setNotifications(0);
      setMessages(0);
      return;
    }
    let alive = true;
    const loadNotifications = () => {
      get<{ unread: number }>('/notifications/unread')
        .then((d) => alive && setNotifications(d.unread))
        .catch(() => undefined);
    };
    const loadMessages = () => {
      get<{ unread: number }>('/messages/unread')
        .then((d) => alive && setMessages(d.unread))
        .catch(() => undefined);
    };
    loadNotifications();
    loadMessages();
    const id = window.setInterval(() => {
      loadNotifications();
      loadMessages();
    }, 30000);
    const off = onWs((payload) => {
      if (payload?.type === 'notification') loadNotifications();
      else if (payload?.type === 'message') loadMessages();
    });
    return () => {
      alive = false;
      window.clearInterval(id);
      off();
    };
  }, [authed]);

  return { notifications, messages };
}

interface LayoutProps {
  children: ReactNode;
  /** Masque la barre latérale et la nav basse (mode immersif du feed). */
  immersive?: boolean;
}

export function Layout({ children, immersive }: LayoutProps) {
  const { user } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const { notifications, messages } = useCounters(!!user);
  const [query, setQuery] = useState('');

  useEffect(() => {
    const term = params.get('q');
    if (term !== null) setQuery(term);
  }, [params]);

  const entries: NavEntry[] = [
    { to: '/', label: 'Accueil', icon: 'home' },
    { to: '/discover', label: 'Découvrir', icon: 'compass' },
    { to: '/live', label: 'LIVE', icon: 'live' },
    { to: '/inbox', label: 'Messages', icon: 'inbox', badge: messages, auth: true },
    { to: '/notifications', label: 'Notifications', icon: 'comment', badge: notifications, auth: true },
    { to: '/shop', label: 'Boutique Y', icon: 'bag' },
    { to: user ? `/@${user.username}` : '/auth', label: 'Profil', icon: 'user' },
    { to: '/settings', label: 'Paramètres', icon: 'settings', auth: true },
  ];

  const isFeed = location.pathname === '/' || location.pathname.startsWith('/video/');

  const go = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    navigate(`/discover${query.trim() ? `?q=${encodeURIComponent(query.trim())}` : ''}`);
  };

  const nav = (
    <nav className="nav">
      {entries
        .filter((e) => !e.auth || user)
        .map((e) => (
          <NavLink key={e.to} to={e.to} end={e.to === '/'} className="nav__item">
            <Icon name={e.icon} size={22} className="nav__icon" />
            <span>{e.label}</span>
            {e.badge ? <span className="nav__badge">{e.badge > 99 ? '99+' : e.badge}</span> : null}
          </NavLink>
        ))}
      {user ? (
        <button className="btn btn--primary nav__cta" onClick={() => navigate('/upload')}>
          <Icon name="plus" size={18} />
          Publier
        </button>
      ) : (
        <button className="btn btn--primary nav__cta" onClick={() => navigate('/auth')}>
          Se connecter
        </button>
      )}
    </nav>
  );

  return (
    <div className={`app${isFeed ? ' app--feed' : ''}`}>
      {!immersive && (
        <aside className="sidebar">
          <Logo />
          {nav}
          <div className="sidebar__foot">
            <p>Y · clone de démonstration</p>
            <p style={{ marginTop: 6 }}>
              <Link to="/discover">Découvrir</Link> · <Link to="/live">Live</Link> ·{' '}
              <Link to="/shop">Boutique</Link>
            </p>
          </div>
        </aside>
      )}

      <div className="main">
        {!immersive && (
          <header className="topbar">
            <Logo small />
            <form className="topbar__search" onSubmit={go}>
              <Icon name="search" size={18} />
              <input
                placeholder="Rechercher sur Y"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Rechercher"
              />
              {query ? (
                <button type="button" onClick={() => setQuery('')} aria-label="Effacer">
                  <Icon name="close" size={15} />
                </button>
              ) : null}
            </form>
            <span className="topbar__spacer" />
            {user ? (
              <Link to={`/@${user.username}`} aria-label="Ton profil">
                <Avatar user={user} size="sm" />
              </Link>
            ) : (
              <button className="btn btn--sm btn--primary" onClick={() => navigate('/auth')}>
                Connexion
              </button>
            )}
          </header>
        )}
        {children}
      </div>

      <nav className="bottom-nav">
        <NavLink to="/" end className="bottom-nav__item">
          <Icon name="home" size={23} filled={isFeed && location.pathname === '/'} />
          <span>Accueil</span>
        </NavLink>
        <NavLink to="/discover" className="bottom-nav__item">
          <Icon name="compass" size={23} />
          <span>Découvrir</span>
        </NavLink>
        <NavLink to="/upload" className="bottom-nav__item bottom-nav__create" aria-label="Publier">
          <span />
        </NavLink>
        <NavLink to="/inbox" className="bottom-nav__item">
          <Icon name="inbox" size={23} />
          <span>Messages</span>
          {messages > 0 ? <span className="dot" /> : null}
        </NavLink>
        <NavLink to={user ? `/@${user.username}` : '/auth'} className="bottom-nav__item">
          <Icon name="user" size={23} />
          <span>Profil</span>
          {notifications > 0 ? <span className="dot" /> : null}
        </NavLink>
      </nav>
    </div>
  );
}
