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

console.log('Done.');
