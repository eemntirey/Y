import { Router } from 'express';
import { all, get, now, run, tx, uid } from '../db/index.js';
import { bad, forbidden, int, notFound, requireAuth, str, wrap, type AuthedRequest } from '../lib/http.js';
import { loadUser, serializeUser } from '../lib/serialize.js';

export const shopRouter = Router();

interface ProductRow {
  id: string;
  seller_id: string;
  title: string;
  description: string;
  price: number;
  currency: string;
  image: string | null;
  stock: number;
  status: string;
  sales: number;
  created_at: string;
}

const serializeProduct = (row: ProductRow, viewerId?: string) => {
  const seller = loadUser(row.seller_id);
  const quantity = viewerId
    ? get<{ quantity: number }>('SELECT quantity FROM cart_items WHERE user_id = ? AND product_id = ?', [viewerId, row.id])?.quantity ?? 0
    : 0;
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    price: row.price,
    currency: row.currency,
    image: row.image,
    stock: row.stock,
    sales: row.sales,
    status: row.status,
    createdAt: row.created_at,
    inCart: quantity,
    seller: seller ? serializeUser(seller, viewerId) : null,
  };
};

shopRouter.get(
  '/products',
  wrap((req: AuthedRequest, res) => {
    const seller = str(req.query.seller, 24).toLowerCase();
    const term = str(req.query.q, 60).toLowerCase();
    const params: string[] = [];
    if (seller) params.push(seller);
    if (term) params.push(`%${term}%`);
    const rows = all<ProductRow>(
      `SELECT * FROM products
       WHERE status = 'active'
         ${seller ? 'AND seller_id = (SELECT id FROM users WHERE lower(username) = ?)' : ''}
         ${term ? 'AND lower(title) LIKE ?' : ''}
       ORDER BY sales DESC, created_at DESC LIMIT 60`,
      params,
    );
    res.json({ items: rows.map((r) => serializeProduct(r, req.userId)) });
  }),
);

shopRouter.get(
  '/products/:id',
  wrap((req: AuthedRequest, res) => {
    const row = get<ProductRow>('SELECT * FROM products WHERE id = ?', [str(req.params.id, 64)]);
    if (!row) throw notFound('Produit introuvable');
    res.json({ product: serializeProduct(row, req.userId) });
  }),
);

shopRouter.post(
  '/products',
  requireAuth,
  wrap((req: AuthedRequest, res) => {
    const title = str(req.body?.title, 120);
    const price = int(req.body?.price, -1);
    if (!title) throw bad('Titre manquant');
    if (price < 0) throw bad('Prix invalide');
    const id = uid();
    run(
      `INSERT INTO products (id, seller_id, title, description, price, currency, image, stock, created_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [
        id,
        req.userId,
        title,
        str(req.body?.description, 2000),
        price,
        str(req.body?.currency, 8) || 'EUR',
        str(req.body?.image, 500) || null,
        Math.max(0, int(req.body?.stock, 10)),
        now(),
      ],
    );
    res.status(201).json({ product: serializeProduct(get<ProductRow>('SELECT * FROM products WHERE id = ?', [id])!, req.userId) });
  }),
);

shopRouter.patch(
  '/products/:id',
  requireAuth,
  wrap((req: AuthedRequest, res) => {
    const row = get<ProductRow>('SELECT * FROM products WHERE id = ?', [str(req.params.id, 64)]);
    if (!row) throw notFound('Produit introuvable');
    if (row.seller_id !== req.userId) throw forbidden();
    run(
      `UPDATE products SET title = COALESCE(?, title), description = COALESCE(?, description),
        price = COALESCE(?, price), stock = COALESCE(?, stock), status = COALESCE(?, status) WHERE id = ?`,
      [
        str(req.body?.title, 120) || null,
        str(req.body?.description, 2000) || null,
        req.body?.price !== undefined ? int(req.body.price, row.price) : null,
        req.body?.stock !== undefined ? int(req.body.stock, row.stock) : null,
        str(req.body?.status, 12) || null,
        row.id,
      ],
    );
    res.json({ product: serializeProduct(get<ProductRow>('SELECT * FROM products WHERE id = ?', [row.id])!, req.userId) });
  }),
);

shopRouter.delete(
  '/products/:id',
  requireAuth,
  wrap((req: AuthedRequest, res) => {
    const row = get<ProductRow>('SELECT * FROM products WHERE id = ?', [str(req.params.id, 64)]);
    if (!row) throw notFound('Produit introuvable');
    if (row.seller_id !== req.userId) throw forbidden();
    run('UPDATE products SET status = ? WHERE id = ?', ['archived', row.id]);
    res.json({ ok: true });
  }),
);

shopRouter.get(
  '/cart',
  requireAuth,
  wrap((req: AuthedRequest, res) => {
    const rows = all<ProductRow & { quantity: number }>(
      `SELECT p.*, c.quantity FROM cart_items c JOIN products p ON p.id = c.product_id
       WHERE c.user_id = ? ORDER BY p.created_at DESC`,
      [req.userId],
    );
    res.json({
      items: rows.map((r) => ({ ...serializeProduct(r, req.userId), quantity: r.quantity })),
      total: rows.reduce((sum, r) => sum + r.price * r.quantity, 0),
    });
  }),
);

shopRouter.post(
  '/cart',
  requireAuth,
  wrap((req: AuthedRequest, res) => {
    const productId = str(req.body?.productId, 64);
    const product = get<ProductRow>('SELECT * FROM products WHERE id = ?', [productId]);
    if (!product) throw notFound('Produit introuvable');
    const quantity = Math.min(Math.max(int(req.body?.quantity, 1), 1), 99);
    const existing = get<{ quantity: number }>('SELECT quantity FROM cart_items WHERE user_id = ? AND product_id = ?', [
      req.userId,
      productId,
    ]);
    run(
      `INSERT INTO cart_items (user_id, product_id, quantity) VALUES (?,?,?)
       ON CONFLICT(user_id, product_id) DO UPDATE SET quantity = ?`,
      [req.userId, productId, existing ? existing.quantity + quantity : quantity, existing ? existing.quantity + quantity : quantity],
    );
    res.json({ ok: true, quantity: existing ? existing.quantity + quantity : quantity });
  }),
);

shopRouter.delete(
  '/cart/:productId',
  requireAuth,
  wrap((req: AuthedRequest, res) => {
    run('DELETE FROM cart_items WHERE user_id = ? AND product_id = ?', [req.userId, str(req.params.productId, 64)]);
    res.json({ ok: true });
  }),
);

shopRouter.post(
  '/orders',
  requireAuth,
  wrap((req: AuthedRequest, res) => {
    const items = all<ProductRow & { quantity: number }>(
      `SELECT p.*, c.quantity FROM cart_items c JOIN products p ON p.id = c.product_id WHERE c.user_id = ?`,
      [req.userId],
    );
    if (items.length === 0) throw bad('Panier vide');
    const total = items.reduce((sum, r) => sum + r.price * r.quantity, 0);
    const orderId = uid();

    tx(() => {
      run('INSERT INTO orders (id, buyer_id, total, status, created_at) VALUES (?,?,?,?,?)', [
        orderId,
        req.userId,
        total,
        'paid',
        now(),
      ]);
      for (const item of items) {
        run('INSERT INTO order_items (order_id, product_id, title, price, quantity) VALUES (?,?,?,?,?)', [
          orderId,
          item.id,
          item.title,
          item.price,
          item.quantity,
        ]);
        const sold = run(
          'UPDATE products SET stock = stock - ?, sales = sales + ? WHERE id = ? AND stock >= ?',
          [item.quantity, item.quantity, item.id, item.quantity],
        );
        if (Number(sold.changes) === 0)
          throw bad(`Stock insuffisant pour « ${item.title} »`);
      }
      run('DELETE FROM cart_items WHERE user_id = ?', [req.userId]);
    });

    res.status(201).json({ id: orderId, total });
  }),
);

shopRouter.get(
  '/orders',
  requireAuth,
  wrap((req: AuthedRequest, res) => {
    const rows = all<{ id: string; total: number; status: string; created_at: string }>(
      'SELECT id, total, status, created_at FROM orders WHERE buyer_id = ? ORDER BY created_at DESC LIMIT 50',
      [req.userId],
    );
    res.json({
      items: rows.map((r) => ({ id: r.id, total: r.total, status: r.status, createdAt: r.created_at })),
    });
  }),
);

shopRouter.get(
  '/sellers/:username/stats',
  wrap((req, res) => {
    const seller = get<{ id: string }>('SELECT id FROM users WHERE lower(username) = ?', [
      str(req.params.username, 24).toLowerCase(),
    ]);
    if (!seller) throw notFound('Vendeur introuvable');
    const stats = get<{ revenue: number; items: number; orders: number }>(
      `SELECT COALESCE(SUM(oi.price * oi.quantity),0) AS revenue, COUNT(DISTINCT oi.product_id) AS items,
              COUNT(DISTINCT o.id) AS orders
       FROM orders o JOIN order_items oi ON oi.order_id = o.id WHERE oi.product_id IN (SELECT id FROM products WHERE seller_id = ?)`,
      [seller.id],
    );
    res.json(stats ?? { revenue: 0, items: 0, orders: 0 });
  }),
);
