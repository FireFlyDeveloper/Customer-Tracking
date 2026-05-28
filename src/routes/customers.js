const { Router } = require('express');
const db = require('../db');
const auth = require('../middleware/auth');

const router = Router();

// All customer routes require authentication
router.use(auth);

// ── GET /api/customers — paginated list with optional name search ───
router.get('/', (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const offset = (page - 1) * limit;
    const q = (req.query.q || '').trim();

    let whereClause = '';
    const params = [];

    if (q) {
      whereClause = 'WHERE name LIKE ?';
      params.push(`%${q}%`);
    }

    const countRow = db.prepare(
      `SELECT COUNT(*) as total FROM customers ${whereClause}`
    ).get(...params);

    const total = countRow.total;
    const totalPages = Math.ceil(total / limit);

    const customers = db.prepare(
      `SELECT * FROM customers ${whereClause} ORDER BY id DESC LIMIT ? OFFSET ?`
    ).all(...params, limit, offset);

    res.json({
      customers,
      pagination: { page, limit, total, totalPages },
    });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/customers/:id — single customer with orders + history ──
router.get('/:id', (req, res, next) => {
  try {
    const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const orders = db.prepare(
      `SELECT o.*,
        (SELECT json_group_array(json_object(
          'id', oi.id,
          'product_name', oi.product_name,
          'quantity', oi.quantity,
          'unit_price', oi.unit_price,
          'created_at', oi.created_at
        )) FROM order_items oi WHERE oi.order_id = o.id) AS items,
        (SELECT json_group_array(json_object(
          'id', p.id,
          'amount', p.amount,
          'method', p.method,
          'status', p.status,
          'payment_date', p.payment_date,
          'created_at', p.created_at
        )) FROM payments p WHERE p.order_id = o.id) AS payments
      FROM orders o
      WHERE o.customer_id = ?
      ORDER BY o.id DESC`
    ).all(req.params.id);

    // Parse JSON strings from SQLite into real arrays
    const ordersParsed = orders.map((o) => ({
      ...o,
      items: JSON.parse(o.items),
      payments: JSON.parse(o.payments),
    }));

    const history = db.prepare(
      `SELECT id, entity_type, entity_id, action, changes, user_id, created_at
       FROM history
       WHERE entity_type = 'customer' AND entity_id = ?
       ORDER BY id DESC`
    ).all(req.params.id);

    // Parse changes JSON for each history entry
    const historyParsed = history.map((h) => ({
      ...h,
      changes: h.changes ? JSON.parse(h.changes) : null,
    }));

    res.json({ customer: { ...customer, orders: ordersParsed, history: historyParsed } });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/customers — create a new customer ─────────────────────
router.post('/', (req, res, next) => {
  try {
    const { name, email, phone, address, notes } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'name is required' });
    }

    // Check unique email if provided
    if (email) {
      const existing = db.prepare('SELECT id FROM customers WHERE email = ?').get(email);
      if (existing) {
        return res.status(409).json({ error: 'A customer with this email already exists' });
      }
    }

    const result = db.prepare(
      `INSERT INTO customers (name, email, phone, address, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(name.trim(), email || null, phone || null, address || null, notes || null, req.user.id);

    // Record in history
    db.prepare(
      `INSERT INTO history (entity_type, entity_id, action, changes, user_id)
       VALUES (?, ?, ?, ?, ?)`
    ).run('customer', result.lastInsertRowid, 'created', JSON.stringify({ name: name.trim(), email }), req.user.id);

    const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ customer });
  } catch (err) {
    next(err);
  }
});

// ── PUT /api/customers/:id — partial update ─────────────────────────
router.put('/:id', (req, res, next) => {
  try {
    const existing = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const { name, email, phone, address, notes } = req.body;

    // Check unique email if being changed
    if (email && email !== existing.email) {
      const dup = db.prepare('SELECT id FROM customers WHERE email = ? AND id != ?').get(email, req.params.id);
      if (dup) {
        return res.status(409).json({ error: 'A customer with this email already exists' });
      }
    }

    // Build dynamic SET clause for partial update
    const updates = [];
    const params = [];
    const changed = {};

    if (name !== undefined) {
      if (!name || !name.trim()) {
        return res.status(400).json({ error: 'name cannot be empty' });
      }
      updates.push('name = ?');
      params.push(name.trim());
      changed.name = name.trim();
    }
    if (email !== undefined) {
      updates.push('email = ?');
      params.push(email || null);
      changed.email = email;
    }
    if (phone !== undefined) {
      updates.push('phone = ?');
      params.push(phone || null);
      changed.phone = phone;
    }
    if (address !== undefined) {
      updates.push('address = ?');
      params.push(address || null);
      changed.address = address;
    }
    if (notes !== undefined) {
      updates.push('notes = ?');
      params.push(notes || null);
      changed.notes = notes;
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updates.push("updated_at = datetime('now')");
    params.push(req.params.id);

    db.prepare(
      `UPDATE customers SET ${updates.join(', ')} WHERE id = ?`
    ).run(...params);

    // Record in history
    db.prepare(
      `INSERT INTO history (entity_type, entity_id, action, changes, user_id)
       VALUES (?, ?, ?, ?, ?)`
    ).run('customer', req.params.id, 'updated', JSON.stringify(changed), req.user.id);

    const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
    res.json({ customer });
  } catch (err) {
    next(err);
  }
});

// ── DELETE /api/customers/:id — hard cascade delete ─────────────────
router.delete('/:id', (req, res, next) => {
  try {
    const existing = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    // Delete history entries (no FK cascade on history)
    db.prepare(
      "DELETE FROM history WHERE entity_type = 'customer' AND entity_id = ?"
    ).run(req.params.id);

    // Also delete history for orders that belong to this customer
    db.prepare(
      `DELETE FROM history WHERE entity_type = 'order'
       AND entity_id IN (SELECT id FROM orders WHERE customer_id = ?)`
    ).run(req.params.id);

    // Delete the customer — FK CASCADE handles orders → order_items + payments
    db.prepare('DELETE FROM customers WHERE id = ?').run(req.params.id);

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
