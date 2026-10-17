import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { Product } from '../lib/types';
import { del, get, post, qs } from '../lib/api';
import { useSession } from '../lib/session';
import { useToast } from '../lib/toast';
import { money } from '../lib/format';
import { Layout } from '../components/Layout';
import { Icon } from '../components/Icon';
import { Avatar } from '../components/Avatar';
import { Modal } from '../components/Overlay';

interface CartItem extends Product {
  quantity: number;
}

export function ShopPage() {
  const { user } = useSession();
  const { toast, error } = useToast();
  const [params, setParams] = useSearchParams();

  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [term, setTerm] = useState('');
  const [cartOpen, setCartOpen] = useState(false);
  const [sellOpen, setSellOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const [draft, setDraft] = useState({ title: '', price: '', stock: '10', description: '' });

  const load = useCallback(async () => {
    setLoading(true);
    const [p, c] = await Promise.all([
      get<{ items: Product[] }>(`/shop/products${qs({ q: term })}`),
      user
        ? get<{ items: CartItem[] }>('/shop/cart')
        : Promise.resolve({ items: [] as CartItem[] }),
    ]);
    setProducts(p.items);
    setCart(c.items);
    setLoading(false);
  }, [term, user]);

  useEffect(() => {
    void load();
  }, [load]);

  const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const count = cart.reduce((sum, item) => sum + item.quantity, 0);

  const addToCart = async (product: Product) => {
    if (!user) {
      toast('Connecte-toi pour acheter');
      return;
    }
    await post('/shop/cart', { productId: product.id, quantity: 1 }).catch((err) => error((err as Error).message));
    setProducts((prev) => prev.map((p) => (p.id === product.id ? { ...p, inCart: p.inCart + 1 } : p)));
    setCart((prev) => {
      const found = prev.find((i) => i.id === product.id);
      return found
        ? prev.map((i) => (i.id === product.id ? { ...i, quantity: i.quantity + 1 } : i))
        : [...prev, { ...product, quantity: 1 }];
    });
    toast(`${product.title} ajouté au panier`);
  };

  const removeFromCart = async (productId: string) => {
    await del(`/shop/cart/${productId}`).catch(() => undefined);
    setCart((prev) => prev.filter((i) => i.id !== productId));
  };

  const checkout = async () => {
    try {
      const res = await post<{ id: string; total: number }>('/shop/orders');
      setCart([]);
      setCartOpen(false);
      toast(`Commande confirmée · ${money(res.total)}`);
    } catch (err) {
      error((err as Error).message);
    }
  };

  const createProduct = async () => {
    try {
      await post('/shop/products', {
        title: draft.title,
        price: Math.round(Number(draft.price) * 100),
        stock: Number(draft.stock),
        description: draft.description,
      });
      setSellOpen(false);
      setDraft({ title: '', price: '', stock: '10', description: '' });
      toast('Produit publié');
      void load();
    } catch (err) {
      error((err as Error).message);
    }
  };

  const selected = products.find((p) => p.id === params.get('product')) ?? null;

  return (
    <Layout>
      <div className="page">
        <div className="page__head">
          <h1 className="page__title">
            <Icon name="bag" size={22} /> Boutique Y
          </h1>
          <span className="topbar__spacer" />
          <button className="btn btn--ghost" onClick={() => setCartOpen(true)}>
            <Icon name="bag" size={16} /> Panier ({count})
          </button>
          <button className="btn btn--primary" onClick={() => setSellOpen(true)}>
            Vendre
          </button>
        </div>

        <form
          className="discover__search"
          style={{ marginBottom: 18 }}
          onSubmit={(e) => e.preventDefault()}
        >
          <Icon name="search" size={20} />
          <input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Rechercher un produit"
            aria-label="Rechercher un produit"
          />
        </form>

        {loading ? (
          <div className="grid grid--wide">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="product skeleton" style={{ height: 210 }} />
            ))}
          </div>
        ) : products.length === 0 ? (
          <div className="empty">
            <div className="empty__icon">🛍️</div>
            <p className="empty__title">Boutique vide</p>
            <p>Publie un premier produit pour commencer.</p>
          </div>
        ) : (
          <div className="grid grid--wide">
            {products.map((p) => (
              <article key={p.id} className="product">
                <div className="product__img">{p.image ? <img src={p.image} alt="" /> : '🛍️'}</div>
                <div className="product__body">
                  <span className="product__title">{p.title}</span>
                  <span className="row__sub">{p.description.slice(0, 70)}</span>
                  <span className="product__price">{money(p.price, p.currency)}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Link to={`/@${p.seller?.username ?? ''}`} style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
                      <Avatar user={p.seller} size="xs" />
                      <span className="row__sub">@{p.seller?.username}</span>
                    </Link>
                    <button className="btn btn--sm btn--primary" onClick={() => void addToCart(p)}>
                      Ajouter
                    </button>
                  </div>
                  <span className="row__sub">
                    {p.stock} en stock · {p.sales} vente(s)
                  </span>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      {count > 0 ? (
        <button className="cartbtn" onClick={() => setCartOpen(true)}>
          <Icon name="bag" size={16} /> {count} article(s) · {money(total)}
        </button>
      ) : null}

      {cartOpen ? (
        <Modal
          title={`Panier (${count})`}
          onClose={() => setCartOpen(false)}
          footer={
            <>
              <button className="btn btn--ghost" onClick={() => setCartOpen(false)}>
                Continuer
              </button>
              <button className="btn btn--primary" onClick={() => void checkout()} disabled={count === 0}>
                Payer {money(total)}
              </button>
            </>
          }
        >
          {cart.length === 0 ? (
            <div className="empty">
              <p>Ton panier est vide</p>
            </div>
          ) : (
            <div className="list">
              {cart.map((item) => (
                <div key={item.id} className="row">
                  <div className="product__img" style={{ width: 48, height: 48, fontSize: 22, borderRadius: 8 }}>
                    {item.image ? <img src={item.image} alt="" /> : '🛍️'}
                  </div>
                  <span className="row__main">
                    <span className="row__title">{item.title}</span>
                    <span className="row__sub">
                      {money(item.price, item.currency)} × {item.quantity}
                    </span>
                  </span>
                  <button className="iconbtn" onClick={() => void removeFromCart(item.id)} aria-label="Retirer">
                    <Icon name="trash" size={18} />
                  </button>
                </div>
              ))}
              <div className="divider" />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800 }}>
                <span>Total</span>
                <span>{money(total)}</span>
              </div>
            </div>
          )}
        </Modal>
      ) : null}

      {sellOpen ? (
        <Modal
          title="Publier un produit"
          onClose={() => setSellOpen(false)}
          footer={
            <>
              <button className="btn btn--ghost" onClick={() => setSellOpen(false)}>
                Annuler
              </button>
              <button className="btn btn--primary" onClick={() => void createProduct()} disabled={!draft.title || !draft.price}>
                Publier
              </button>
            </>
          }
        >
          <div className="field">
            <label className="field__label">Titre</label>
            <input className="input" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
          </div>
          <div className="field">
            <label className="field__label">Prix (€)</label>
            <input
              className="input"
              type="number"
              step="0.01"
              min="0"
              value={draft.price}
              onChange={(e) => setDraft({ ...draft, price: e.target.value })}
            />
          </div>
          <div className="field">
            <label className="field__label">Stock</label>
            <input
              className="input"
              type="number"
              min="0"
              value={draft.stock}
              onChange={(e) => setDraft({ ...draft, stock: e.target.value })}
            />
          </div>
          <div className="field">
            <label className="field__label">Description</label>
            <textarea
              className="textarea"
              rows={3}
              value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            />
          </div>
        </Modal>
      ) : null}

      {selected ? (
        <Modal title={selected.title} onClose={() => setParams({})}>
          <p>{selected.description}</p>
          <div className="divider" />
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Prix</span>
            <b>{money(selected.price, selected.currency)}</b>
          </div>
          <button
            className="btn btn--primary btn--block"
            style={{ marginTop: 14 }}
            onClick={() => {
              void addToCart(selected);
              setParams({});
            }}
          >
            Ajouter au panier
          </button>
        </Modal>
      ) : null}
    </Layout>
  );
}
