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
│   └── auth.js
├── app.js
├── db.js
├── seed.js
└── server.js
data/           # SQLite DB (gitignored)
```
