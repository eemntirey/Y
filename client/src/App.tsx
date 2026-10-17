import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useEffect } from 'react';
import { SessionProvider, useSession } from './lib/session';
import { ToastProvider } from './lib/toast';
import { closeSocket, openSocket } from './lib/socket';
import { FeedPage } from './pages/Feed';
import { AuthPage } from './pages/Auth';
import { DiscoverPage } from './pages/Discover';
import { HashtagPage } from './pages/Hashtag';
import { SoundPage } from './pages/Sound';
import { ProfilePage } from './pages/Profile';
import { UploadPage, EditVideoPage } from './pages/Upload';
import { VideoPage } from './pages/VideoPage';
import { NotificationsPage } from './pages/Notifications';
import { InboxPage } from './pages/Inbox';
import { LivePage, LiveRoomPage } from './pages/Live';
import { ShopPage } from './pages/Shop';
import { SettingsPage } from './pages/Settings';
import { Layout } from './components/Layout';

function SocketBridge() {
  const { user, ready } = useSession();
  useEffect(() => {
    if (!ready) return;
    if (user) openSocket();
    else closeSocket();
  }, [user, ready]);
  return null;
}

function NotFound() {
  return (
    <Layout>
      <div className="page">
        <div className="empty">
          <div className="empty__icon">🧭</div>
          <p className="empty__title">Page introuvable</p>
          <p>Ce lien ne mène nulle part.</p>
          <a className="btn btn--primary" href="/">
            Retour à l’accueil
          </a>
        </div>
      </div>
    </Layout>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <SessionProvider>
          <SocketBridge />
          <Routes>
            <Route path="/" element={<FeedPage />} />
            <Route path="/auth" element={<AuthPage />} />
            <Route path="/discover" element={<DiscoverPage />} />
            <Route path="/tag/:name" element={<HashtagPage />} />
            <Route path="/sound/:id" element={<SoundPage />} />
            <Route path="/video/:id" element={<VideoPage />} />
            <Route path="/@:username" element={<ProfilePage />} />
            <Route path="/upload" element={<UploadPage />} />
            <Route path="/edit/:id" element={<EditVideoPage />} />
            <Route path="/notifications" element={<NotificationsPage />} />
            <Route path="/inbox" element={<InboxPage />} />
            <Route path="/live" element={<LivePage />} />
            <Route path="/live/:id" element={<LiveRoomPage />} />
            <Route path="/shop" element={<ShopPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/favorites" element={<Navigate to="/@me" replace />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </SessionProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
