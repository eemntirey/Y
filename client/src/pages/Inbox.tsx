import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import type { ChatMessage, Conversation, User } from '../lib/types';
import { get, post, qs } from '../lib/api';
import { useSession } from '../lib/session';
import { useToast } from '../lib/toast';
import { onWs } from '../lib/socket';
import { clock, compact, timeAgo } from '../lib/format';
import { Layout } from '../components/Layout';
import { Avatar } from '../components/Avatar';
import { Icon } from '../components/Icon';

export function InboxPage() {
  const { user } = useSession();
  const { error, toast } = useToast();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const to = params.get('to') ?? '';

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [active, setActive] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [term, setTerm] = useState('');

  const loadConversations = useCallback(async () => {
    const data = await get<{ items: Conversation[] }>('/messages/conversations');
    setConversations(data.items);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  const open = useCallback(
    async (id: string) => {
      const [thread, list] = await Promise.all([
        get<{ id: string; items: ChatMessage[] }>(`/messages/conversations/${id}`),
        get<{ items: Conversation[] }>('/messages/conversations'),
      ]);
      setMessages(thread.items);
      setConversations(list.items);
      setActive(list.items.find((c) => c.id === id) ?? null);
    },
    [],
  );

  useEffect(() => {
    if (!to) return;
    void post<{ id: string }>('/messages/conversations', { username: to })
      .then((d) => open(d.id))
      .catch((err) => error((err as Error).message));
  }, [to, open, error]);

  useEffect(
    () =>
      onWs((payload) => {
        if (payload?.type !== 'message') return;
        if (payload.conversationId !== active?.id) {
          void loadConversations();
          return;
        }
        const incoming: ChatMessage = {
          id: payload.message.id,
          mine: false,
          kind: payload.message.kind,
          body: payload.message.body,
          attachment: payload.message.attachment ?? null,
          seen: false,
          createdAt: payload.message.createdAt,
          author: { username: '', displayName: '', avatar: null },
        };
        setMessages((prev) => (prev.some((m) => m.id === incoming.id) ? prev : [...prev, incoming]));
      }),
    [active?.id, loadConversations],
  );

  const startWith = useCallback(
    async (username: string) => {
      const res = await post<{ id: string }>('/messages/conversations', { username });
      await open(res.id);
      setTerm('');
    },
    [open],
  );

  const searchUsers = useCallback(async (q: string) => {
    const data = await get<{ items: User[] }>(`/users/search${qs({ q })}`);
    if (data.items.length > 0) await startWith(data.items[0]!.username);
    else toast('Aucun compte trouvé');
  }, [startWith, toast]);

  const send = async () => {
    if (!active || !text.trim()) return;
    const body = text.trim();
    setText('');
    try {
      await post(`/messages/conversations/${active.id}/messages`, { body });
      const thread = await get<{ items: ChatMessage[] }>(`/messages/conversations/${active.id}`);
      setMessages(thread.items);
      void loadConversations();
    } catch (err) {
      setText(body);
      error((err as Error).message);
    }
  };

  if (!user) {
    return (
      <Layout>
        <div className="page">
          <div className="empty">
            <div className="empty__icon">💬</div>
            <p className="empty__title">Messages privés</p>
            <p>Connecte-toi pour discuter avec la communauté.</p>
            <button className="btn btn--primary" onClick={() => navigate('/auth')}>
              Se connecter
            </button>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className={`inbox${active ? ' is-open' : ''}`}>
        <aside className="inbox__list">
          <h1 className="page__title" style={{ marginBottom: 12 }}>
            Messages
          </h1>
          <form
            className="inbox__search"
            onSubmit={(e) => {
              e.preventDefault();
              void searchUsers(term);
            }}
          >
            <Icon name="search" size={16} />
            <input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Nouvelle conversation" />
          </form>

          {loading ? (
            <div className="list">
              {[0, 1, 2].map((i) => (
                <div key={i} className="skeleton" style={{ height: 58, marginBottom: 8 }} />
              ))}
            </div>
          ) : conversations.length === 0 ? (
            <div className="empty">
              <div className="empty__icon">✉️</div>
              <p className="empty__title">Aucune conversation</p>
              <p>Cherche un compte ci-dessus pour commencer.</p>
            </div>
          ) : (
            <div className="list">
              {conversations.map((c) => (
                <button key={c.id} className="row" onClick={() => void open(c.id)}>
                  <Avatar user={c.user} size="md" />
                  <span className="row__main">
                    <span className="row__title">{c.user.displayName}</span>
                    <span className="row__sub">
                      {c.lastMessage?.body ?? 'Aucun message'}
                      {c.lastMessage ? ` · ${timeAgo(c.lastMessage.createdAt)}` : ''}
                    </span>
                  </span>
                  {c.unread > 0 ? <span className="nav__badge">{c.unread}</span> : null}
                </button>
              ))}
            </div>
          )}
        </aside>

        <section className="inbox__thread">
          {active ? (
            <>
              <header className="inbox__head">
                <button className="iconbtn" onClick={() => setActive(null)} aria-label="Retour aux conversations">
                  <Icon name="back" size={20} />
                </button>
                <Link to={`/@${active.user.username}`}>
                  <Avatar user={active.user} size="sm" />
                </Link>
                <span className="row__main">
                  <Link to={`/@${active.user.username}`} className="row__title">
                    {active.user.displayName}
                  </Link>
                  <span className="row__sub">
                    @{active.user.username} · {compact(active.user.stats.followers)} abonné(s)
                  </span>
                </span>
              </header>

              <div className="inbox__body">
                <div className="chat">
                  {messages.map((m) => (
                    <div key={m.id} className={`bubble ${m.mine ? 'bubble--mine' : 'bubble--theirs'}`}>
                      {m.body}
                      <div style={{ fontSize: 10, opacity: 0.7, marginTop: 3, textAlign: 'right' }}>
                        {clock(m.createdAt)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <footer className="inbox__foot">
                <div className="composer">
                  <input
                    className="input"
                    placeholder="Écris un message…"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        void send();
                      }
                    }}
                  />
                  <button className="btn btn--primary" onClick={() => void send()} disabled={!text.trim()}>
                    <Icon name="send" size={16} />
                  </button>
                </div>
              </footer>
            </>
          ) : (
            <div className="empty">
              <div className="empty__icon">💬</div>
              <p className="empty__title">Sélectionne une conversation</p>
              <p>Ou cherche un compte pour en commencer une.</p>
            </div>
          )}
        </section>
      </div>
    </Layout>
  );
}
