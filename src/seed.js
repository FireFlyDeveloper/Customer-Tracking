require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('./db');

console.log('Seeding database...');

// ── Users ───────────────────────────────────────────────────────────

const adminHash = bcrypt.hashSync('admin123', 10);
const userHash = bcrypt.hashSync('user123', 10);

const insertUser = db.prepare(
  `INSERT OR IGNORE INTO users (username, email, password, role) VALUES (?, ?, ?, ?)`
);

insertUser.run('admin', 'admin@example.com', adminHash, 'admin');
insertUser.run('alice',  'alice@example.com',  userHash, 'user');

console.log('  Users seeded: admin (admin123), alice (user123)');

// ── Customers ───────────────────────────────────────────────────────

const insertCustomer = db.prepare(
  `INSERT INTO customers (name, email, phone, address, notes, created_by) VALUES (?, ?, ?, ?, ?, ?)`
);

insertCustomer.run('Acme Corp',    'contact@acme.com',     '555-0101', '123 Main St, Springfield', 'Enterprise client — priority support', 1);
insertCustomer.run('Globex Inc',   'info@globex.com',      '555-0202', '456 Oak Ave, Shelbyville',  'Mid-market, quarterly reviews',        2);
insertCustomer.run('Initech Ltd',  'hello@initech.com',    '555-0303', '789 Pine Rd, Capital City',  'Startup, high growth potential',        2);

console.log('  Customers seeded: Acme Corp, Globex Inc, Initech Ltd');

// ── Orders ──────────────────────────────────────────────────────────

const insertOrder = db.prepare(
  `INSERT INTO orders (customer_id, status, total_amount, notes, created_by, created_at)
   VALUES (?, ?, ?, ?, ?, ?)`
);

const insertOrderItem = db.prepare(
  `INSERT INTO order_items (order_id, product_name, quantity, unit_price)
   VALUES (?, ?, ?, ?)`
);

const orders = [
  { customer_id: 1, status: 'delivered', total_amount: 299.99, notes: 'Annual software license renewal', created_by: 1, items: [{ product_name: 'Enterprise License', quantity: 1, unit_price: 299.99 }] },
  { customer_id: 1, status: 'processing', total_amount: 849.50, notes: 'Hardware upgrade order', created_by: 1, items: [{ product_name: 'Server Rack', quantity: 1, unit_price: 699.50 }, { product_name: 'Cable Kit', quantity: 2, unit_price: 75.00 }] },
  { customer_id: 2, status: 'shipped', total_amount: 150.00, notes: 'Consulting hours block', created_by: 2, items: [{ product_name: 'Consulting Hours', quantity: 5, unit_price: 30.00 }] },
  { customer_id: 3, status: 'pending', total_amount: 1200.00, notes: 'Custom development sprint', created_by: 2, items: [{ product_name: 'Development Sprint', quantity: 1, unit_price: 1200.00 }] },
];

const orderIds = orders.map((o) => {
  const result = insertOrder.run(o.customer_id, o.status, o.total_amount, o.notes, o.created_by, new Date().toISOString().replace('T', ' ').slice(0, 19));
  for (const item of o.items) {
    insertOrderItem.run(result.lastInsertRowid, item.product_name, item.quantity, item.unit_price);
  }
  return result.lastInsertRowid;
});

console.log(`  Orders seeded: ${orders.length} orders across all customers`);

// ── Payments ────────────────────────────────────────────────────────

const insertPayment = db.prepare(
  `INSERT INTO payments (order_id, amount, method, status, payment_date)
   VALUES (?, ?, ?, ?, ?)`
);

const paymentsData = [
  { order_id: orderIds[0], amount: 299.99, method: 'card',        status: 'completed',  payment_date: '2025-01-15' },
  { order_id: orderIds[0], amount: 299.99, method: 'bank_transfer', status: 'completed',  payment_date: '2025-01-10' },
  { order_id: orderIds[1], amount: 500.00,  method: 'card',        status: 'completed',  payment_date: '2025-02-01' },
  { order_id: orderIds[1], amount: 349.50,  method: 'bank_transfer', status: 'pending',    payment_date: null },
  { order_id: orderIds[2], amount: 150.00,  method: 'cash',        status: 'completed',  payment_date: '2025-03-05' },
  { order_id: orderIds[3], amount: 600.00,  method: 'card',        status: 'pending',    payment_date: null },
  { order_id: orderIds[3], amount: 600.00,  method: 'bank_transfer', status: 'pending',    payment_date: null },
  { order_id: orderIds[1], amount: 50.00,   method: 'other',       status: 'failed',     payment_date: '2025-02-10' },
  { order_id: orderIds[2], amount: 100.00,  method: 'card',        status: 'refunded',   payment_date: '2025-03-20' },
  { order_id: orderIds[0], amount: 200.00,  method: 'cash',        status: 'completed',  payment_date: '2025-01-05' },
];

let paymentCount = 0;
for (const p of paymentsData) {
  insertPayment.run(p.order_id, p.amount, p.method, p.status, p.payment_date);
  paymentCount++;
}

console.log(`  Payments seeded: ${paymentCount} payments across orders`);

// ── History ─────────────────────────────────────────────────────────

const insertHistory = db.prepare(
  `INSERT INTO history (entity_type, entity_id, action, changes, user_id)
   VALUES (?, ?, ?, ?, ?)`
);

const historyData = [
  // Customer history (5 entries)
  { entity_type: 'customer', entity_id: 1, action: 'created', changes: { name: 'Acme Corp', email: 'contact@acme.com' }, user_id: 1 },
  { entity_type: 'customer', entity_id: 2, action: 'created', changes: { name: 'Globex Inc', email: 'info@globex.com' }, user_id: 2 },
  { entity_type: 'customer', entity_id: 3, action: 'created', changes: { name: 'Initech Ltd', email: 'hello@initech.com' }, user_id: 2 },
  { entity_type: 'customer', entity_id: 1, action: 'updated', changes: { notes: 'Enterprise client — priority support' }, user_id: 1 },
  { entity_type: 'customer', entity_id: 2, action: 'updated', changes: { phone: '555-0202' }, user_id: 2 },

  // Order history (5 entries)
  { entity_type: 'order', entity_id: orderIds[0], action: 'created', changes: { customer_id: 1, status: 'delivered', total_amount: 299.99, items_count: 1 }, user_id: 1 },
  { entity_type: 'order', entity_id: orderIds[1], action: 'created', changes: { customer_id: 1, status: 'processing', total_amount: 849.50, items_count: 2 }, user_id: 1 },
  { entity_type: 'order', entity_id: orderIds[2], action: 'created', changes: { customer_id: 2, status: 'shipped', total_amount: 150.00, items_count: 1 }, user_id: 2 },
  { entity_type: 'order', entity_id: orderIds[3], action: 'created', changes: { customer_id: 3, status: 'pending', total_amount: 1200.00, items_count: 1 }, user_id: 2 },
  { entity_type: 'order', entity_id: orderIds[1], action: 'updated', changes: { status: 'processing' }, user_id: 1 },

  // Payment history (5 entries)
  { entity_type: 'payment', entity_id: paymentCount - 9, action: 'created', changes: { order_id: orderIds[0], amount: 299.99, method: 'card', status: 'completed' }, user_id: 1 },
  { entity_type: 'payment', entity_id: paymentCount - 8, action: 'created', changes: { order_id: orderIds[0], amount: 299.99, method: 'bank_transfer', status: 'completed' }, user_id: 1 },
  { entity_type: 'payment', entity_id: paymentCount - 6, action: 'created', changes: { order_id: orderIds[2], amount: 150.00, method: 'cash', status: 'completed' }, user_id: 2 },
  { entity_type: 'payment', entity_id: paymentCount - 2, action: 'created', changes: { order_id: orderIds[2], amount: 100.00, method: 'card', status: 'refunded' }, user_id: 2 },
  { entity_type: 'payment', entity_id: paymentCount - 1, action: 'created', changes: { order_id: orderIds[0], amount: 200.00, method: 'cash', status: 'completed' }, user_id: 1 },
];

for (const h of historyData) {
  insertHistory.run(h.entity_type, h.entity_id, h.action, JSON.stringify(h.changes), h.user_id);
}

console.log(`  History seeded: ${historyData.length} entries`);

console.log('Done.');
