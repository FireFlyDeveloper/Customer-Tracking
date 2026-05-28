const { Router } = require('express');
const db = require('../db');
const auth = require('../middleware/auth');

const router = Router();

// All order routes require authentication
router.use(auth);

// ── POST /api/orders — create order + items, auto-calculate total ────
router.post('/', (req, res, next) => {
  try {
    const { customer_id, status, order_date, items, notes } = req.body;

    if (!customer_id) {
      return res.status(400).json({ error: 'customer_id is required' });
    }

    // Validate customer exists
    const customer = db.prepare('SELECT id FROM customers WHERE id = ?').get(customer_id);
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'items array is required and must not be empty' });
    }

    // Validate each item
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item.product_name || !item.product_name.trim()) {
        return res.status(400).json({ error: `items[${i}].product_name is required` });
      }
      if (item.quantity === undefined || item.quantity === null || item.quantity < 1) {
        return res.status(400).json({ error: `items[${i}].quantity must be >= 1` });
      }
      if (item.unit_price === undefined || item.unit_price === null || item.unit_price < 0) {
        return res.status(400).json({ error: `items[${i}].unit_price must be >= 0` });
      }
    }

    // Calculate total_amount from item subtotals
    const total_amount = items.reduce((sum, item) => {
      return sum + (item.quantity * item.unit_price);
    }, 0);

    const validStatus = status || 'pending';
    const validStatuses = ['pending', 'processing', 'shipped', 'delivered', 'cancelled'];
    if (!validStatuses.includes(validStatus)) {
      return res.status(400).json({
        error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
      });
    }

    // Use transaction for order + items
    const insertOrder = db.prepare(
      `INSERT INTO orders (customer_id, status, total_amount, notes, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    );
    const insertItem = db.prepare(
      `INSERT INTO order_items (order_id, product_name, quantity, unit_price)
       VALUES (?, ?, ?, ?)`
    );

    const createdAt = order_date || new Date().toISOString().replace('T', ' ').slice(0, 19);

    const result = db.transaction(() => {
      const orderResult = insertOrder.run(
        customer_id,
        validStatus,
        total_amount,
        notes || null,
        req.user.id,
        createdAt
      );
      const orderId = orderResult.lastInsertRowid;

      for (const item of items) {
        insertItem.run(
          orderId,
          item.product_name.trim(),
          item.quantity,
          item.unit_price
        );
      }

      return orderId;
    })();

    // Record in history
    db.prepare(
      `INSERT INTO history (entity_type, entity_id, action, changes, user_id)
       VALUES (?, ?, ?, ?, ?)`
    ).run(
      'order',
      result,
      'created',
      JSON.stringify({ customer_id, status: validStatus, total_amount, items_count: items.length }),
      req.user.id
    );

    // Return the full order with items
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(result);
    const orderItems = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(result);

    res.status(201).json({ order: { ...order, items: orderItems, payments: [] } });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/orders — list with optional filters ─────────────────────
router.get('/', (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const offset = (page - 1) * limit;
    const customer_id = req.query.customer_id ? parseInt(req.query.customer_id, 10) : null;
    const statusFilter = (req.query.status || '').trim();

    const conditions = [];
    const params = [];

    if (customer_id) {
      conditions.push('o.customer_id = ?');
      params.push(customer_id);
    }

    if (statusFilter) {
      conditions.push('o.status = ?');
      params.push(statusFilter);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRow = db.prepare(
      `SELECT COUNT(*) as total FROM orders o ${whereClause}`
    ).get(...params);

    const total = countRow.total;
    const totalPages = Math.ceil(total / limit);

    const orders = db.prepare(
      `SELECT o.* FROM orders o ${whereClause} ORDER BY o.id DESC LIMIT ? OFFSET ?`
    ).all(...params, limit, offset);

    res.json({
      orders,
      pagination: { page, limit, total, totalPages },
    });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/orders/:id — single order with items + payments ─────────
router.get('/:id', (req, res, next) => {
  try {
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const items = db.prepare(
      'SELECT * FROM order_items WHERE order_id = ? ORDER BY id ASC'
    ).all(req.params.id);

    const payments = db.prepare(
      'SELECT * FROM payments WHERE order_id = ? ORDER BY id ASC'
    ).all(req.params.id);

    res.json({ order: { ...order, items, payments } });
  } catch (err) {
    next(err);
  }
});

// ── PUT /api/orders/:id — update status, notes, optionally replace items ──
router.put('/:id', (req, res, next) => {
  try {
    const existing = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const { status, notes, items } = req.body;

    // Validate status if provided
    const validStatuses = ['pending', 'processing', 'shipped', 'delivered', 'cancelled'];
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({
        error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
      });
    }

    // Build dynamic SET clause
    const updates = [];
    const params = [];
    const changed = {};

    if (status !== undefined) {
      updates.push('status = ?');
      params.push(status);
      changed.status = status;
    }

    let total_amount = existing.total_amount;

    if (notes !== undefined) {
      updates.push('notes = ?');
      params.push(notes || null);
      changed.notes = notes;
    }

    if (items !== undefined) {
      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'items must be a non-empty array' });
      }

      // Validate each item
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (!item.product_name || !item.product_name.trim()) {
          return res.status(400).json({ error: `items[${i}].product_name is required` });
        }
        if (item.quantity === undefined || item.quantity === null || item.quantity < 1) {
          return res.status(400).json({ error: `items[${i}].quantity must be >= 1` });
        }
        if (item.unit_price === undefined || item.unit_price === null || item.unit_price < 0) {
          return res.status(400).json({ error: `items[${i}].unit_price must be >= 0` });
        }
      }

      // Recalculate total_amount from new items
      total_amount = items.reduce((sum, item) => {
        return sum + (item.quantity * item.unit_price);
      }, 0);

      updates.push('total_amount = ?');
      params.push(total_amount);
      changed.total_amount = total_amount;
      changed.items_count = items.length;
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updates.push("updated_at = datetime('now')");
    params.push(req.params.id);

    db.transaction(() => {
      db.prepare(
        `UPDATE orders SET ${updates.join(', ')} WHERE id = ?`
      ).run(...params);

      // If items were provided, replace all order_items
      if (items !== undefined) {
        db.prepare('DELETE FROM order_items WHERE order_id = ?').run(req.params.id);

        const insertItem = db.prepare(
          `INSERT INTO order_items (order_id, product_name, quantity, unit_price)
           VALUES (?, ?, ?, ?)`
        );

        for (const item of items) {
          insertItem.run(req.params.id, item.product_name.trim(), item.quantity, item.unit_price);
        }
      }
    })();

    // Record in history
    db.prepare(
      `INSERT INTO history (entity_type, entity_id, action, changes, user_id)
       VALUES (?, ?, ?, ?, ?)`
    ).run('order', req.params.id, 'updated', JSON.stringify(changed), req.user.id);

    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
    const orderItems = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(req.params.id);
    const payments = db.prepare('SELECT * FROM payments WHERE order_id = ?').all(req.params.id);

    res.json({ order: { ...order, items: orderItems, payments } });
  } catch (err) {
    next(err);
  }
});

// ── DELETE /api/orders/:id — hard delete ─────────────────────────────
router.delete('/:id', (req, res, next) => {
  try {
    const existing = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Delete history entries (no FK cascade on history)
    db.prepare(
      "DELETE FROM history WHERE entity_type = 'order' AND entity_id = ?"
    ).run(req.params.id);

    // Delete the order — FK CASCADE handles order_items + payments
    db.prepare('DELETE FROM orders WHERE id = ?').run(req.params.id);

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
