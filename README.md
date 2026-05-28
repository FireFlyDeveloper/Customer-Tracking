# Customer Tracking API

Express + SQLite + JWT authentication backend for managing customers, orders, and payments.

## Quick Start

```bash
cp .env.example .env          # edit JWT_SECRET
npm install
npm run seed                  # populate with sample data
npm start                     # http://localhost:3030
```

## API Endpoints

### Auth

| Method | Path              | Auth | Description       |
|--------|-------------------|------|-------------------|
| POST   | /api/auth/register| no   | Create account    |
| POST   | /api/auth/login   | no   | Get JWT token     |
| GET    | /api/auth/me      | yes  | Current user info |

### Health

| Method | Path     | Auth | Description       |
|--------|----------|------|-------------------|
| GET    | /health  | no   | Health check      |

### Customers

| Method | Path               | Auth | Description                                          |
|--------|--------------------|------|------------------------------------------------------|
| GET    | /api/customers     | yes  | Paginated list with `?q=` search and `?page=&limit=` |
| GET    | /api/customers/:id | yes  | Single customer with nested `orders[]` + `history[]`  |
| POST   | /api/customers     | yes  | Create (name required, email unique → 409)           |
| PUT    | /api/customers/:id | yes  | Partial update (dynamic SET)                          |
| DELETE | /api/customers/:id | yes  | Hard cascade (removes orders, items, payments, history) |

### Orders

| Method | Path            | Auth | Description                                                     |
|--------|-----------------|------|-----------------------------------------------------------------|
| POST   | /api/orders     | yes  | Create with `items[]`, auto-calculates `total_amount`           |
| GET    | /api/orders     | yes  | Paginated list with `?customer_id=` and `?status=` filters     |
| GET    | /api/orders/:id | yes  | Single order with `items[]` + `payments[]`                     |
| PUT    | /api/orders/:id | yes  | Update status/notes, optionally replace items (recalc total)    |
| DELETE | /api/orders/:id | yes  | Hard delete with history cleanup                                |

### Payments

| Method | Path               | Auth | Description                                       |
|--------|--------------------|------|---------------------------------------------------|
| GET    | /api/payments      | yes  | List with `?order_id=`, `?status=`, `?method=`   |
| POST   | /api/payments      | yes  | Create (order_id, amount, method, status, payment_date) |
| DELETE | /api/payments/:id  | yes  | Hard delete                                       |

### History

| Method | Path              | Auth | Description                                       |
|--------|-------------------|------|---------------------------------------------------|
| GET    | /api/history      | yes  | List with `?entity_type=` and `?entity_id=`       |
| POST   | /api/history      | yes  | Log an entry (entity_type, entity_id, action, changes) |
| DELETE | /api/history/:id  | yes  | Delete an entry                                   |

### Seed Users

| Username | Password  | Role  |
|----------|-----------|-------|
| admin    | admin123  | admin |
| alice    | user123   | user  |

## Tech Stack

- **Runtime:** Node.js
- **Framework:** Express 5
- **Database:** SQLite via better-sqlite3 (WAL mode, FK CASCADE)
- **Auth:** JWT + bcrypt

## Project Structure

```
src/
├── middleware/
│   ├── auth.js
│   └── errorHandler.js
├── routes/
│   ├── auth.js
│   ├── customers.js
│   ├── orders.js
│   ├── payments.js
│   └── history.js
├── app.js
├── db.js
├── seed.js
└── server.js
data/           # SQLite DB (gitignored)
```
