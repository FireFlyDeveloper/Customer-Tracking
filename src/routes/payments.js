const { Router } = require('express');
const db = require('../db');
const auth = require('../middleware/auth');

const router = Router();

// All payment routes require authentication
router.use(auth);

// ── GET /api/payments — list with optional filters ───────────────────
router.get('/', (req, res, next) => {
  try {
    const order_id = req.query.order_id ? parseInt(req.query.order_id, 10) : null;
    const statusFilter = (req.query.status || '').trim();
    const methodFilter = (req.query.method || '').trim();

    const conditions = [];
    const params = [];

    if (order_id) {
      conditions.push('order_id = ?');
      params.push(order_id);
    }

    if (statusFilter) {
      conditions.push('status = ?');
      params.push(statusFilter);
    }

    if (methodFilter) {
      conditions.push('method = ?');
      params.push(methodFilter);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const payments = db.prepare(
      `SELECT * FROM payments ${whereClause} ORDER BY id DESC`
    ).all(...params);

    res.json({ payments });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/payments — create a payment ────────────────────────────
router.post('/', (req, res, next) => {
  try {
    const { order_id, amount, method, status, payment_date } = req.body;

    if (!order_id) {
      return res.status(400).json({ error: 'order_id is required' });
    }

    // Validate order exists
    const order = db.prepare('SELECT id FROM orders WHERE id = ?').get(order_id);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (amount === undefined || amount === null || amount <= 0) {
      return res.status(400).json({ error: 'amount must be greater than 0' });
    }

    const validMethods = ['cash', 'card', 'bank_transfer', 'other'];
    const validStatuses = ['pending', 'completed', 'failed', 'refunded'];

    const validMethod = method || 'cash';
    if (!validMethods.includes(validMethod)) {
      return res.status(400).json({
        error: `Invalid method. Must be one of: ${validMethods.join(', ')}`,
      });
    }

    const validStatus = status || 'pending';
    if (!validStatuses.includes(validStatus)) {
      return res.status(400).json({
        error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
      });
    }

    const result = db.prepare(
      `INSERT INTO payments (order_id, amount, method, status, payment_date)
       VALUES (?, ?, ?, ?, ?)`
    ).run(
      order_id,
      amount,
      validMethod,
      validStatus,
      payment_date || null
    );

    // Record in history
    db.prepare(
      `INSERT INTO history (entity_type, entity_id, action, changes, user_id)
       VALUES (?, ?, ?, ?, ?)`
    ).run(
      'payment',
      result.lastInsertRowid,
      'created',
      JSON.stringify({ order_id, amount, method: validMethod, status: validStatus }),
      req.user.id
    );

    const payment = db.prepare('SELECT * FROM payments WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ payment });
  } catch (err) {
    next(err);
  }
});

// ── DELETE /api/payments/:id — hard delete ──────────────────────────
router.delete('/:id', (req, res, next) => {
  try {
    const existing = db.prepare('SELECT * FROM payments WHERE id = ?').get(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    db.prepare('DELETE FROM payments WHERE id = ?').run(req.params.id);

    // Record in history
    db.prepare(
      `INSERT INTO history (entity_type, entity_id, action, changes, user_id)
       VALUES (?, ?, ?, ?, ?)`
    ).run(
      'payment',
      req.params.id,
      'deleted',
      JSON.stringify({ order_id: existing.order_id, amount: existing.amount }),
      req.user.id
    );

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
