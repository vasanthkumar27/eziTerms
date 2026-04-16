# Test credentials (EziTerms, preview backend on :8001)

Dev account created for testing this session:

| Field    | Value                |
|----------|----------------------|
| Email    | test@example.com     |
| Password | test12345            |

Seeded via `POST /api/signup`. Use `POST /api/login` to obtain JWT access + refresh tokens.

The same account can be re-seeded locally after rebuilding the SQLite DB:
```
curl -s -X POST http://localhost:8000/api/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test12345"}'
```
