import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { Sound, Video } from '../lib/types';
import { get, patch, post } from '../lib/api';
import { useSession } from '../lib/session';
import { useToast } from '../lib/toast';
import { Layout } from '../components/Layout';
import { Icon } from '../components/Icon';
import { Media } from '../components/Media';
import { splitHashtags } from '../lib/format';

const MAX_MB = 200;

export function UploadPage() {
  const { user } = useSession();
  const { toast, error } = useToast();
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const kind = (params.get('kind') ?? 'original') as 'original' | 'duet' | 'stitch';
  const parentId = params.get('parent') ?? undefined;

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [soundId, setSoundId] = useState('');
  const [sounds, setSounds] = useState<Sound[]>([]);
  const [visibility, setVisibility] = useState<'public' | 'private' | 'friends'>('public');
  const [allowComment, setAllowComment] = useState(true);
  const [allowDuet, setAllowDuet] = useState(true);
  const [allowStitch, setAllowStitch] = useState(true);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [parent, setParent] = useState<Video | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    get<{ items: Sound[] }>('/discover/sounds')
      .then((d) => setSounds(d.items))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!parentId) return;
    get<{ video: Video }>(`/videos/${parentId}`)
      .then((d) => setParent(d.video))
      .catch(() => undefined);
  }, [parentId]);

  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const pick = (f: File | null | undefined) => {
    if (!f) return;
    if (!f.type.startsWith('video/')) {
      error('Le fichier doit être une vidéo');
      return;
    }
    if (f.size > MAX_MB * 1024 * 1024) {
      error(`Vidéo trop lourde (max ${MAX_MB} Mo)`);
      return;
    }
    setFile(f);
  };

  const upload = async () => {
    if (!user) return navigate('/auth');
    if (!file) return error('Choisis une vidéo');

    const form = new FormData();
    form.append('video', file);
    form.append('description', description);
    form.append('kind', kind);
    form.append('visibility', visibility);
    form.append('allowComment', String(allowComment));
    form.append('allowDuet', String(allowDuet));
    form.append('allowStitch', String(allowStitch));
    if (soundId) form.append('soundId', soundId);
    if (parentId) form.append('parentId', parentId);

    setUploading(true);
    setProgress(0);
    const timer = window.setInterval(() => setProgress((p) => Math.min(95, p + 4)), 180);

    try {
      const res = await post<{ video: Video }>('/videos', form);
      toast('Vidéo publiée !');
      navigate(`/video/${res.video.id}`);
    } catch (err) {
      error((err as Error).message);
    } finally {
      window.clearInterval(timer);
      setUploading(false);
    }
  };

  if (!user) {
    return (
      <Layout>
        <div className="page">
          <div className="empty">
            <div className="empty__icon">🎬</div>
            <p className="empty__title">Connecte-toi pour publier</p>
            <p>Tes vidéos doivent être rattachées à un compte.</p>
            <button className="btn btn--primary" onClick={() => navigate('/auth')}>
              Se connecter
            </button>
          </div>
        </div>
      </Layout>
    );
  }

  const tags = splitHashtags(description).filter((p) => p.type === 'tag');

  return (
    <Layout>
      <div className="page">
        <div className="page__head">
          <h1 className="page__title">
            {kind === 'duet' ? 'Nouveau duo' : kind === 'stitch' ? 'Nouveau stitch' : 'Nouvelle vidéo'}
          </h1>
        </div>

        {parent ? (
          <div className="row" style={{ marginBottom: 14 }}>
            <div style={{ width: 48, height: 64, borderRadius: 8, overflow: 'hidden', position: 'relative' }}>
              <Media src={parent.src} still letter={parent.author?.displayName?.[0]} />
            </div>
            <span className="row__main">
              <span className="row__title">Source : @{parent.author?.username}</span>
              <span className="row__sub">{parent.description.slice(0, 60)}</span>
            </span>
          </div>
        ) : null}

        <div className="upload-grid">
          {!file ? (
            <div
              className={`dropzone${dragOver ? ' is-over' : ''}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                pick(e.dataTransfer.files[0]);
              }}
              onClick={() => inputRef.current?.click()}
            >
              <Icon name="upload" size={38} />
              <p className="empty__title" style={{ marginTop: 12 }}>
                Glisse ta vidéo ici
              </p>
              <p>ou clique pour parcourir · MP4, MOV, WebM · {MAX_MB} Mo max</p>
              <input
                ref={inputRef}
                type="file"
                accept="video/*"
                hidden
                onChange={(e) => pick(e.target.files?.[0])}
              />
            </div>
          ) : (
            <div className="preview">
              <video src={preview ?? ''} controls playsInline />
              <button
                className="preview__close iconbtn"
                onClick={() => setFile(null)}
                aria-label="Retirer la vidéo"
              >
                <Icon name="close" size={20} />
              </button>
            </div>
          )}

          <div className="field">
            <label className="field__label" htmlFor="caption">
              Description
            </label>
            <textarea
              id="caption"
              className="textarea"
              rows={4}
              maxLength={2200}
              placeholder="Décris ta vidéo… utilise #hashtag et @mention"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
            <span className="field__hint">
              {description.length}/2200
              {tags.length > 0 ? ` · ${tags.length} hashtag(s) détecté(s)` : ''}
            </span>
          </div>

          <div className="field">
            <label className="field__label" htmlFor="sound">
              Son
            </label>
            <select
              id="sound"
              className="select"
              value={soundId}
              onChange={(e) => setSoundId(e.target.value)}
            >
              <option value="">Aucun son</option>
              {sounds.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} — {s.artist}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label className="field__label" htmlFor="visibility">
              Visibilité
            </label>
            <select
              id="visibility"
              className="select"
              value={visibility}
              onChange={(e) => setVisibility(e.target.value as typeof visibility)}
            >
              <option value="public">Publique</option>
              <option value="friends">Amis</option>
              <option value="private">Privée</option>
            </select>
          </div>

          <div>
            <div className="switchrow">
              <div>
                <div className="switchrow__label">Autoriser les commentaires</div>
                <div className="switchrow__hint">Les spectateurs pourront commenter</div>
              </div>
              <button
                className={`switch${allowComment ? ' is-on' : ''}`}
                onClick={() => setAllowComment((v) => !v)}
                aria-pressed={allowComment}
                aria-label="Autoriser les commentaires"
              />
            </div>
            <div className="switchrow">
              <div>
                <div className="switchrow__label">Autoriser les duos</div>
                <div className="switchrow__hint">Others peuvent faire un duo avec cette vidéo</div>
              </div>
              <button
                className={`switch${allowDuet ? ' is-on' : ''}`}
                onClick={() => setAllowDuet((v) => !v)}
                aria-pressed={allowDuet}
                aria-label="Autoriser les duos"
              />
            </div>
            <div className="switchrow">
              <div>
                <div className="switchrow__label">Autoriser les stitches</div>
                <div className="switchrow__hint">Others peuvent utiliser un extrait</div>
              </div>
              <button
                className={`switch${allowStitch ? ' is-on' : ''}`}
                onClick={() => setAllowStitch((v) => !v)}
                aria-pressed={allowStitch}
                aria-label="Autoriser les stitches"
              />
            </div>
          </div>

          {uploading ? (
            <div>
              <div className="progress">
                <div className="progress__fill" style={{ width: `${progress}%` }} />
              </div>
              <p className="field__hint" style={{ marginTop: 6 }}>
                Envoi en cours… {Math.round(progress)} %
              </p>
            </div>
          ) : null}

          <button className="btn btn--primary btn--lg btn--block" onClick={() => void upload()} disabled={!file || uploading}>
            {uploading ? <span className="spinner" /> : <Icon name="upload" size={18} />}
            Publier
          </button>
        </div>
      </div>
    </Layout>
  );
}

export function EditVideoPage() {
  const { user } = useSession();
  const { toast, error } = useToast();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [video, setVideo] = useState<Video | null>(null);
  const [description, setDescription] = useState('');

  useEffect(() => {
    get<{ video: Video }>(`/videos/${id}`)
      .then((d) => {
        setVideo(d.video);
        setDescription(d.video.description);
      })
      .catch((err) => error((err as Error).message));
  }, [id, error]);

  const save = async () => {
    try {
      const res = await patch<{ video: Video }>(`/videos/${id}`, { description });
      setVideo(res.video);
      toast('Description mise à jour');
      navigate(`/video/${id}`);
    } catch (err) {
      error((err as Error).message);
    }
  };

  return (
    <Layout>
      <div className="page">
        <h1 className="page__title">Modifier la vidéo</h1>
        <p className="page__sub">{user ? `@${user.username}` : ''}</p>
        <div className="field" style={{ marginTop: 18 }}>
          <label className="field__label">Description</label>
          <textarea
            className="textarea"
            rows={5}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <button className="btn btn--primary" onClick={() => void save()} disabled={!video}>
          Enregistrer
        </button>
      </div>
    </Layout>
  );
}
