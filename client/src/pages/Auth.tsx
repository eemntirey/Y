import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSession } from '../lib/session';
import { useToast } from '../lib/toast';
import { Icon } from '../components/Icon';

const DEMO = { identifier: 'lea.mood', password: 'yolove2026' };

export function AuthPage() {
  const { login, register } = useSession();
  const { error } = useToast();
  const navigate = useNavigate();

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === 'login') {
        await login(identifier, password);
      } else {
        await register({ username, email, password, displayName: displayName || undefined });
      }
      navigate('/');
    } catch (err) {
      error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const useDemo = async () => {
    setBusy(true);
    try {
      await login(DEMO.identifier, DEMO.password);
      navigate('/');
    } catch (err) {
      error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="authpage">
      <div className="authpage__card">
        <Link to="/" className="authpage__logo" aria-label="Y">
          Y
        </Link>
        <h1 className="authpage__title">{mode === 'login' ? 'Se connecter' : 'Créer un compte'}</h1>
        <p className="authpage__sub">
          {mode === 'login'
            ? 'Reprends là où tu t’es arrêté.'
            : 'Rejoins Y et publie ta première vidéo.'}
        </p>

        <form onSubmit={submit}>
          {mode === 'register' ? (
            <>
              <div className="field">
                <label className="field__label" htmlFor="username">
                  Nom d’utilisateur
                </label>
                <input
                  id="username"
                  className="input"
                  value={username}
                  onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9._]/g, ''))}
                  placeholder="lea.mood"
                  autoComplete="username"
                  required
                />
                <span className="field__hint">3 à 24 caractères : lettres minuscules, chiffres, . et _</span>
              </div>
              <div className="field">
                <label className="field__label" htmlFor="email">
                  Adresse e-mail
                </label>
                <input
                  id="email"
                  className="input"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="toi@exemple.com"
                  autoComplete="email"
                  required
                />
              </div>
              <div className="field">
                <label className="field__label" htmlFor="displayName">
                  Nom affiché
                </label>
                <input
                  id="displayName"
                  className="input"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Léa"
                />
              </div>
            </>
          ) : (
            <div className="field">
              <label className="field__label" htmlFor="identifier">
                Utilisateur ou e-mail
              </label>
              <input
                id="identifier"
                className="input"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="lea.mood"
                autoComplete="username"
                required
              />
            </div>
          )}

          <div className="field">
            <label className="field__label" htmlFor="password">
              Mot de passe
            </label>
            <input
              id="password"
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              required
            />
            {mode === 'register' ? <span className="field__hint">8 caractères minimum, avec un chiffre</span> : null}
          </div>

          <button className="btn btn--primary btn--lg btn--block" disabled={busy}>
            {busy ? <span className="spinner" /> : mode === 'login' ? 'Se connecter' : 'Créer mon compte'}
          </button>
        </form>

        <div className="divider" />

        <button className="btn btn--ghost btn--block" onClick={useDemo} disabled={busy}>
          <Icon name="play" size={15} filled />
          Entrer avec le compte démo
        </button>
        <p className="authpage__demo">lea.mood · yolove2026</p>

        <p className="authpage__switch">
          {mode === 'login' ? 'Pas encore de compte ?' : 'Déjà inscrit ?'}{' '}
          <button
            onClick={() => {
              setMode(mode === 'login' ? 'register' : 'login');
              setPassword('');
            }}
          >
            {mode === 'login' ? 'Créer un compte' : 'Se connecter'}
          </button>
        </p>
      </div>
    </div>
  );
}
