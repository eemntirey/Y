import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Comment, User } from '../lib/types';
import { del, get, post, qs } from '../lib/api';
import { useSession } from '../lib/session';
import { useToast } from '../lib/toast';
import { compact, timeAgo } from '../lib/format';
import { Sheet } from './Overlay';
import { Avatar } from './Avatar';
import { Icon } from './Icon';

interface CommentsSheetProps {
  videoId: string;
  commentCount: number;
  allowComment: boolean;
  onClose: () => void;
  onCountChange: (videoId: string, count: number) => void;
}

interface RowProps {
  comment: Comment;
  onReply: (comment: Comment) => void;
  onLike: (comment: Comment) => void;
  onDelete: (comment: Comment) => void;
}

function CommentRow({ comment, onReply, onLike, onDelete }: RowProps) {
  const { user } = useSession();
  const mine = user?.id === comment.author?.id;

  return (
    <div className="comment">
      <Avatar user={comment.author} size="sm" />
      <div className="comment__body">
        <Link to={`/@${comment.author?.username ?? ''}`} className="comment__author">
          {comment.author?.username ?? 'inconnu'}
        </Link>
        <p className="comment__text">{comment.text}</p>
        <div className="comment__meta">
          <span>{timeAgo(comment.createdAt)}</span>
          <button onClick={() => onReply(comment)}>Répondre</button>
          {mine ? <button onClick={() => onDelete(comment)}>Supprimer</button> : null}
          {comment.replyCount > 0 ? <span>{comment.replyCount} réponse(s)</span> : null}
        </div>
      </div>
      <button
        className={`comment__like${comment.liked ? ' is-on' : ''}`}
        onClick={() => onLike(comment)}
        aria-pressed={comment.liked}
        aria-label="J’aime le commentaire"
      >
        <Icon name="heart-small" size={14} filled={comment.liked} />
        <span>{comment.likeCount > 0 ? compact(comment.likeCount) : ''}</span>
      </button>
    </div>
  );
}

function ReplyRow({ comment, onDelete }: { comment: Comment; onDelete: (c: Comment) => void }) {
  const { user } = useSession();
  return (
    <div className="comment">
      <Avatar user={comment.author} size="xs" />
      <div className="comment__body">
        <Link to={`/@${comment.author?.username ?? ''}`} className="comment__author">
          {comment.author?.username ?? 'inconnu'}
        </Link>
        <p className="comment__text">{comment.text}</p>
        <div className="comment__meta">
          <span>{timeAgo(comment.createdAt)}</span>
          {user?.id === comment.author?.id ? <button onClick={() => onDelete(comment)}>Supprimer</button> : null}
        </div>
      </div>
    </div>
  );
}

export function CommentsSheet({
  videoId,
  commentCount,
  allowComment,
  onClose,
  onCountChange,
}: CommentsSheetProps) {
  const { user } = useSession();
  const { error, toast } = useToast();
  const [items, setItems] = useState<Comment[]>([]);
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [suggestions, setSuggestions] = useState<User[]>([]);

  const load = useCallback(async () => {
    try {
      const data = await get<{ items: Comment[] }>(`/comments/video/${videoId}${qs({ sort: 'top', limit: 30 })}`);
      setItems(data.items);
      onCountChange(videoId, data.items.reduce((sum, c) => sum + 1 + c.replies.length, 0));
    } catch (err) {
      error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [videoId, onCountChange, error]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  useEffect(() => {
    const term = text.match(/@([\p{L}\p{N}._]{1,24})$/u)?.[1];
    if (!term) {
      setSuggestions([]);
      return;
    }
    const id = window.setTimeout(() => {
      get<{ items: User[] }>(`/comments/mention/search${qs({ q: term })}`)
        .then((d) => setSuggestions(d.items))
        .catch(() => setSuggestions([]));
    }, 180);
    return () => window.clearTimeout(id);
  }, [text]);

  const submit = async () => {
    if (!user) {
      error('Connecte-toi pour commenter');
      return;
    }
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    setText('');
    setReplyTo(null);
    try {
      await post(`/comments/video/${videoId}`, { text: body, parentId: replyTo?.id ?? null });
      const mentions = [...body.matchAll(/@([\p{L}\p{N}_.]{1,24})/gu)]
        .map((m) => m[1]?.toLowerCase())
        .filter((m): m is string => !!m);
      if (mentions.length > 0)
        await post(`/comments/video/${videoId}/mentions`, { usernames: mentions }).catch(() => undefined);
      await load();
    } catch (err) {
      setText(body);
      error((err as Error).message);
    } finally {
      setSending(false);
    }
  };

  const like = async (comment: Comment) => {
    const res = await post<{ liked: boolean; likeCount: number }>(`/comments/${comment.id}/like`).catch(() => null);
    if (!res) return;
    const patch = (c: Comment): Comment =>
      c.id === comment.id
        ? { ...c, liked: res.liked, likeCount: res.likeCount }
        : { ...c, replies: c.replies.map(patch) };
    setItems((prev) => prev.map(patch));
  };

  const remove = async (comment: Comment) => {
    if (!window.confirm('Supprimer ce commentaire ?')) return;
    try {
      await del(`/comments/${comment.id}`);
      toast('Commentaire supprimé');
      await load();
    } catch (err) {
      error((err as Error).message);
    }
  };

  return (
    <Sheet
      title={`${compact(commentCount)} commentaire${commentCount > 1 ? 's' : ''}`}
      onClose={onClose}
      footer={
        allowComment ? (
          <div className="composer-wrap">
            {suggestions.length > 0 ? (
              <div className="mention-pop">
                {suggestions.map((s) => (
                  <button
                    key={s.id}
                    className="row"
                    onClick={() => {
                      setText((t) => `${t.slice(0, t.lastIndexOf('@'))}@${s.username} `);
                      setSuggestions([]);
                    }}
                  >
                    <Avatar user={s} size="xs" />
                    <span className="row__main">
                      <span className="row__title">@{s.username}</span>
                      <span className="row__sub">{s.displayName}</span>
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
            <div className="composer">
              <Avatar user={user} size="sm" />
              <div className="composer-wrap">
                {replyTo ? (
                  <div className="composer__reply">
                    <span>Réponse à @{replyTo.author?.username}</span>
                    <button onClick={() => setReplyTo(null)} aria-label="Annuler la réponse">
                      <Icon name="close" size={13} />
                    </button>
                  </div>
                ) : null}
                <textarea
                  className="textarea"
                  rows={1}
                  placeholder={user ? 'Ajouter un commentaire…' : 'Connecte-toi pour commenter'}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      void submit();
                    }
                  }}
                />
              </div>
              <button
                className="btn btn--primary"
                disabled={!text.trim() || sending}
                onClick={() => void submit()}
                aria-label="Publier"
              >
                <Icon name="send" size={16} />
              </button>
            </div>
          </div>
        ) : (
          <p className="link-plain" style={{ textAlign: 'center' }}>
            Les commentaires sont désactivés sur cette vidéo.
          </p>
        )
      }
    >
      {loading ? (
        <div className="list">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skeleton" style={{ height: 54, marginBottom: 10 }} />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="empty">
          <div className="empty__icon">💬</div>
          <p className="empty__title">Aucun commentaire</p>
          <p>Sois la première personne à réagir.</p>
        </div>
      ) : (
        <div className="list">
          {items.map((c) => (
            <div key={c.id}>
              <CommentRow comment={c} onReply={setReplyTo} onLike={like} onDelete={remove} />
              {c.replies.length > 0 ? (
                <div className="comment__replies">
                  {c.replies.map((r) => (
                    <ReplyRow key={r.id} comment={r} onDelete={remove} />
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </Sheet>
  );
}
