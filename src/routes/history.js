const { Router } = require('express');
const db = require('../db');
const auth = require('../middleware/auth');

const router = Router();

// All history routes require authentication
router.use(auth);

// ── GET /api/history — list with optional filters ────────────────────
router.get('/', (req, res, next) => {
  try {
    const entityType = (req.query.entity_type || '').trim();
    const entityId = req.query.entity_id ? parseInt(req.query.entity_id, 10) : null;

    const conditions = [];
    const params = [];

    if (entityType) {
      conditions.push('entity_type = ?');
      params.push(entityType);
    }

    if (entityId) {
      conditions.push('entity_id = ?');
      params.push(entityId);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const rows = db.prepare(
      `SELECT id, entity_type, entity_id, action, changes, user_id, created_at
       FROM history ${whereClause}
       ORDER BY id DESC`
    ).all(...params);

    // Parse changes JSON for each entry
    const history = rows.map((h) => ({
      ...h,
      changes: h.changes ? JSON.parse(h.changes) : null,
    }));

    res.json({ history });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/history — log a history entry ──────────────────────────
router.post('/', (req, res, next) => {
  try {
    const { entity_type, entity_id, action, changes } = req.body;

    if (!entity_type || !entity_type.trim()) {
      return res.status(400).json({ error: 'entity_type is required' });
    }

    if (entity_id === undefined || entity_id === null) {
      return res.status(400).json({ error: 'entity_id is required' });
    }

    if (!action || !action.trim()) {
      return res.status(400).json({ error: 'action is required' });
    }

    const changesJson = changes ? JSON.stringify(changes) : null;

    const result = db.prepare(
      `INSERT INTO history (entity_type, entity_id, action, changes, user_id)
       VALUES (?, ?, ?, ?, ?)`
    ).run(entity_type.trim(), entity_id, action.trim(), changesJson, req.user.id);

    const entry = db.prepare(
      'SELECT id, entity_type, entity_id, action, changes, user_id, created_at FROM history WHERE id = ?'
    ).get(result.lastInsertRowid);

    // Parse changes JSON
    if (entry.changes) {
      entry.changes = JSON.parse(entry.changes);
    }

    res.status(201).json({ history: entry });
  } catch (err) {
    next(err);
  }
});

// ── DELETE /api/history/:id — delete a history entry ─────────────────
router.delete('/:id', (req, res, next) => {
  try {
    const existing = db.prepare('SELECT * FROM history WHERE id = ?').get(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'History entry not found' });
    }

    db.prepare('DELETE FROM history WHERE id = ?').run(req.params.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
