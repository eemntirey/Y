import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { post } from '../lib/api';
import { useSession } from '../lib/session';
import { useToast } from '../lib/toast';
import { Layout } from '../components/Layout';
import { Icon } from '../components/Icon';
import { Avatar } from '../components/Avatar';

export function SettingsPage() {
  const { user, setUser, logout } = useSession();
  const { toast, error } = useToast();
  const navigate = useNavigate();

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);

  if (!user) {
    return (
      <Layout>
        <div className="page">
          <div className="empty">
            <div className="empty__icon">⚙️</div>
            <p className="empty__title">Paramètres</p>
            <p>Connecte-toi pour gérer ton compte.</p>
            <button className="btn btn--primary" onClick={() => navigate('/auth')}>
              Se connecter
            </button>
          </div>
        </div>
      </Layout>
    );
  }

  const changePassword = async () => {
    if (next !== confirm) return error('Les mots de passe ne correspondent pas');
    setBusy(true);
    try {
      await post('/auth/me/password', { current, next });
      setCurrent('');
      setNext('');
      setConfirm('');
      toast('Mot de passe mis à jour');
    } catch (err) {
      error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const topUp = async (amount: number) => {
    try {
      const res = await post<{ coins: number }>('/live/wallet/topup', { amount });
      setUser({ ...user, coins: res.coins });
      toast(`+${amount} Y Coins`);
    } catch (err) {
      error((err as Error).message);
    }
  };

  return (
    <Layout>
      <div className="page">
        <h1 className="page__title">Paramètres</h1>

        <section className="section">
          <div className="row">
            <Avatar user={user} size="lg" />
            <span className="row__main">
              <span className="row__title">{user.displayName}</span>
              <span className="row__sub">@{user.username}</span>
            </span>
          </div>
        </section>

        <section className="section">
          <h2 className="section__title">
            <Icon name="coins" size={18} /> Mon portefeuille
          </h2>
          <div className="statcard">
            <b>{user.coins ?? 0}</b>
            <span>Y Coins disponibles</span>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            {[100, 500, 1000].map((amount) => (
              <button key={amount} className="btn btn--ghost" onClick={() => void topUp(amount)}>
                +{amount}
              </button>
            ))}
          </div>
        </section>

        <section className="section">
          <h2 className="section__title">Sécurité</h2>
          <div className="field">
            <label className="field__label">Mot de passe actuel</label>
            <input
              className="input"
              type="password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              autoComplete="current-password"
            />
          </div>
          <div className="field">
            <label className="field__label">Nouveau mot de passe</label>
            <input
              className="input"
              type="password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          <div className="field">
            <label className="field__label">Confirmer</label>
            <input
              className="input"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          <button className="btn btn--primary" onClick={() => void changePassword()} disabled={busy || !current || !next}>
            Changer le mot de passe
          </button>
          <p className="field__hint" style={{ marginTop: 8 }}>
            Tous tes appareils seront déconnectés après le changement.
          </p>
        </section>

        <section className="section">
          <h2 className="section__title">Compte</h2>
          <div className="list">
            <button className="row" onClick={() => navigate(`/@${user.username}`)}>
              <span className="row__main">👤 Voir mon profil</span>
            </button>
            <button className="row" onClick={() => navigate('/settings#privacy')}>
              <span className="row__main">🔒 Confidentialité et blocage</span>
            </button>
            <button
              className="row"
              onClick={() => {
                void logout().then(() => navigate('/'));
              }}
            >
              <span className="row__main" style={{ color: '#ff5c72' }}>
                <Icon name="logout" size={18} /> Se déconnecter
              </span>
            </button>
          </div>
        </section>

        <p className="link-plain" style={{ marginTop: 24, textAlign: 'center' }}>
          Y — clone de démonstration · API locale
        </p>
      </div>
    </Layout>
  );
}
