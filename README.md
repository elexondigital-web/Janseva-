# JanSeva — Constituency Management System

A full-stack web application for managing political constituency operations:
member rolls, ID-card issuance, attendance at events (QR / fingerprint /
manual), bulk messaging (SMS / WhatsApp / Email), analytics, and admin
management.

**Stack:** React + TypeScript + Vite (frontend), NestJS + Prisma + PostgreSQL
(backend), nginx + Docker (production).

---

## 1 · Prerequisites

| Tool             | Minimum version | Notes                                              |
|------------------|-----------------|----------------------------------------------------|
| Docker Engine    | 24+             | Required for both dev and prod                     |
| Docker Compose   | v2 (built into Docker Desktop) | `docker compose` syntax used throughout |
| Node.js          | 18.18+          | Only needed if running outside Docker              |
| npm              | 10+             | Bundled with Node                                  |
| PostgreSQL       | 16              | Provisioned automatically by Docker                |
| Mantra MFS100 RD Service | Latest from mantratecapp.com | Optional — only for fingerprint attendance |

---

## 2 · Development setup

```bash
# 1. Clone
git clone <your-fork> janseva
cd janseva

# 2. Backend env
cp backend/.env.example backend/.env
# (Optional) edit secrets — defaults work for local dev

# 3. Bring everything up
docker compose up -d

# 4. Apply Prisma migrations & seed
docker compose exec backend npx prisma migrate dev
docker compose exec backend npm run prisma:seed

# 5. Open the app
open http://localhost:5173      # Frontend
open http://localhost:3000/api/docs  # Swagger
```

The seed script creates a default super admin (`admin@janseva.in` / `admin123`).
Change this password immediately on first login (Phase 4 forces this when
`mustChangePassword` is true).

---

## 3 · Environment variables

A complete `.env` for production should set every variable below. Defaults
shown are the dev fallbacks; production deployments **must** rotate every
secret.

### Core

| Variable | Description | Required |
|---|---|---|
| `DATABASE_URL`         | Postgres URL (`postgresql://user:pass@host:5432/db`) | yes |
| `JWT_SECRET`           | HMAC key for access tokens                            | yes |
| `JWT_REFRESH_SECRET`   | HMAC key for refresh tokens (must differ from above)  | yes |
| `JWT_EXPIRY`           | Access-token lifetime (default `15m`)                 | no  |
| `JWT_REFRESH_EXPIRY`   | Refresh-token lifetime (default `7d`)                 | no  |
| `PORT`                 | API port (default `3000`)                             | no  |
| `FRONTEND_URL`         | CORS origin and links in welcome emails               | yes |
| `NODE_ENV`             | `production` in prod                                  | yes |

### File storage (S3 — optional, falls back to local disk)

| Variable | Description |
|---|---|
| `AWS_ACCESS_KEY_ID`     | IAM key with `s3:PutObject` + `s3:DeleteObject` |
| `AWS_SECRET_ACCESS_KEY` | Paired secret                                  |
| `AWS_BUCKET_NAME`       | Bucket to upload into                          |
| `AWS_REGION`            | e.g. `ap-south-1`                              |

When all four are present, photos and Aadhaar scans go to S3. When any are
missing, the backend falls back to local disk (`backend/uploads/`).

### Messaging providers

| Variable | Description |
|---|---|
| `MSG91_AUTH_KEY`             | Required for SMS — get from msg91.com           |
| `MSG91_FLOW_ID`              | DLT-approved flow ID                            |
| `MSG91_SENDER_ID`            | 6-char DLT header (e.g. `JNSEVA`)               |
| `WHATSAPP_TOKEN`             | Meta Cloud API permanent token                  |
| `WHATSAPP_PHONE_NUMBER_ID`   | Phone number ID from Meta Business              |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM_NAME` | Standard SMTP for transactional + bulk email |

If any provider is unconfigured the backend logs a warning and counts
recipients as failed for that channel — it never blocks.

### Reports cache

| Variable | Description |
|---|---|
| `REPORTS_CACHE_TTL_MS` | In-memory TTL for aggregate report queries (default `300000`, 5 min) |

---

## 4 · Production deployment

### One-time setup

1. Provision a Linux host (2 CPU / 4 GB RAM is plenty for a single-block
   constituency at ~50 k members).
2. Install Docker + Compose.
3. Copy the repo to `/opt/janseva` (or wherever you prefer).
4. Create `/opt/janseva/.env` from `backend/.env.example` with **production
   secrets** — rotate every password + JWT secret.
5. Place TLS certs in `/opt/janseva/ssl/` as `fullchain.pem` and `privkey.pem`
   (use Let's Encrypt's cert-bot, or your provider's bundle).
6. Replace the `server_name _;` lines in `nginx.conf` with your real
   domain so HSTS works correctly.
7. Make the deploy and backup scripts executable:
   ```bash
   chmod +x deploy.sh backup.sh
   ```

### Deploy / redeploy

```bash
cd /opt/janseva
./deploy.sh                # pulls main, builds, migrates, starts
```

Flags: `--skip-migrate` (don't run migrations), `--no-pull` (use checked-out code).

### Schedule the nightly backup

```bash
crontab -e
# Add:
0 2 * * *  cd /opt/janseva && ./backup.sh >> /var/log/janseva-backup.log 2>&1
```

Backups land in `/opt/janseva/backups/` and are pruned to the most recent 30 dumps.

### Monitoring

The backend exposes Swagger at `/api/docs` (production should restrict this
to your office IP via nginx). The recommended uptime check is a simple
`HEAD /api/dashboard/health` from any external monitor (UptimeRobot,
Better Stack, etc.).

---

## 5 · First-time super-admin setup

The Phase 1 seed creates the first super admin. If you're starting from a
clean database without seeding:

```bash
docker compose exec backend node -e "
  const bcrypt = require('bcrypt');
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  (async () => {
    const passwordHash = await bcrypt.hash('changeme123', 12);
    await prisma.admin.create({
      data: {
        name: 'Root Admin',
        email: 'admin@janseva.in',
        passwordHash,
        role: 'SUPER_ADMIN',
        mustChangePassword: true,
      },
    });
    console.log('Created super admin: admin@janseva.in / changeme123');
  })();
"
```

After login, the user will be forced to change their password before doing
anything else.

---

## 6 · Hardware setup

### Mantra MFS100 fingerprint scanner

1. Plug the USB device into the workstation.
2. Install the latest **Mantra RD Service** driver bundle from
   <https://mantratecapp.com/MFS100Device.html>.
3. Verify the local service is up: `curl http://localhost:11100/rd/info`
   should return a JSON `device` field.
4. Open JanSeva → Attendance → Fingerprint tab — the connection pill
   turns green when the service responds.

The frontend probes ports `11100..11104` because the SDK doesn't always bind
the default port. CSP is configured to allow `connect-src http://localhost:11100`.

### QR scanner / camera

Any standard webcam works. The browser must be on **HTTPS or localhost** —
modern browsers block camera access on plain HTTP.

---

## 7 · Third-party API setup

### MSG91 (SMS)

1. Sign up at <https://msg91.com>, complete KYC, register a DLT entity.
2. Buy an SMS route, register a DLT-approved template, capture its `flow_id`.
3. The 6-char Sender ID must also be DLT-approved (e.g. `JNSEVA`).
4. Paste `MSG91_AUTH_KEY`, `MSG91_FLOW_ID`, and `MSG91_SENDER_ID` into `.env`.

### WhatsApp Cloud API (Meta Business)

1. Set up a Meta Business account.
2. Add the WhatsApp product to a Meta app, attach a phone number, generate a
   permanent system-user access token.
3. Note the phone-number ID from the WhatsApp dashboard.
4. Paste `WHATSAPP_TOKEN` and `WHATSAPP_PHONE_NUMBER_ID` into `.env`.

Phase 3 sends only plain-text bodies, which Meta accepts inside an open 24h
session. Outside that window you must use pre-approved templates — that's
on the Phase 5 roadmap.

### SMTP (Email)

Any SMTP provider works. Common picks:

- **Gmail** — generate a 16-char "App password" in your Google account,
  use `smtp.gmail.com` port `587`.
- **Amazon SES** — `email-smtp.<region>.amazonaws.com` port `587` with the
  SMTP-specific username/password from the SES console.
- **SendGrid / Mailgun / Zoho** — all standard SMTP, paste host + creds.

---

## 8 · Backup and restore

### Automated daily backup

`backup.sh` is a small wrapper around `pg_dump` that runs inside the database
container. See the cron snippet in §4.

### Manual backup

```bash
docker compose -f docker-compose.prod.yml exec -T db \
  pg_dump -U janseva -d janseva --no-owner --no-acl \
  > backup_$(date +%Y%m%d_%H%M%S).sql
```

### Restore

```bash
# 1. Stop the backend so no writes are in flight
docker compose -f docker-compose.prod.yml stop backend

# 2. Drop & recreate the database
docker compose -f docker-compose.prod.yml exec -T db psql -U janseva -d postgres \
  -c "DROP DATABASE janseva;" -c "CREATE DATABASE janseva OWNER janseva;"

# 3. Restore
docker compose -f docker-compose.prod.yml exec -T db psql -U janseva -d janseva \
  < backups/backup_<timestamp>.sql

# 4. Re-apply migrations (in case schema is newer than the dump)
docker compose -f docker-compose.prod.yml run --rm backend npx prisma migrate deploy

# 5. Restart
docker compose -f docker-compose.prod.yml up -d backend
```

---

## 9 · Troubleshooting

| Symptom                                     | Fix |
|---------------------------------------------|-----|
| `prisma migrate dev` fails on first run     | Make sure Docker's Postgres is healthy: `docker compose ps`. The first `up` can take ~30 s. |
| Login returns 429 (Too Many Requests)       | The auth bucket is 5 attempts / minute / IP. Wait one minute or restart the backend. |
| QR scanner shows black square               | Browsers block camera on HTTP. Use HTTPS or `http://localhost`. |
| Fingerprint tab says "Scanner disconnected" | Mantra RD Service isn't running. Reinstall the driver, then check `curl http://localhost:11100/rd/info`. |
| WhatsApp messages not arriving              | Recipient must have messaged your business number within the last 24 h, OR use a pre-approved template. Plain text outside the session window is dropped silently by Meta. |
| Reports show stale numbers                  | Aggregates are cached for 5 min by default. Either wait, or set `REPORTS_CACHE_TTL_MS=0` for always-fresh queries. |
| `Cannot deactivate your own account` error  | Expected — you can't lock yourself out. Have another super admin do it. |
| Welcome email not sent                      | SMTP isn't configured, OR the provider rejected the message. The temp password is shown once in the create-admin response — copy it from the modal. |
| ID card text looks squished in the PDF      | Verify the card preview is exactly 342×216 CSS px. Older Phase 2 builds had a 340 px preview that distorted on export. |

---

## 10 · Project layout

```
janseva/
├── backend/                  NestJS + Prisma API
│   ├── src/
│   │   ├── auth/             Login, JWT, role guard, audit
│   │   ├── people/           Member CRUD, search, fingerprint enroll
│   │   ├── idcards/          Single + bulk PDF issue
│   │   ├── events/           Event CRUD
│   │   ├── attendance/       QR / fingerprint / manual marking, stats
│   │   ├── messaging/        SMS / WhatsApp / Email broadcast
│   │   ├── reports/          Analytics aggregates + PDF export
│   │   ├── admins/           Admin management (Phase 4)
│   │   ├── audit/            Audit-log model + service (Phase 4)
│   │   ├── uploads/          S3 / local storage with magic-byte sniffing
│   │   └── ...
│   ├── prisma/               Schema + migrations
│   └── Dockerfile.prod       Multi-stage prod build
├── frontend/                 React 18 + Vite + Tailwind
│   ├── src/
│   │   ├── pages/            One file per route
│   │   ├── components/       Layout, ID card, modals, etc.
│   │   ├── api/              Typed axios wrappers
│   │   ├── lib/mantra.ts     Local RD Service client
│   │   └── ...
│   └── Dockerfile.prod       Static SPA served by nginx
├── docker-compose.yml        Dev compose
├── docker-compose.prod.yml   Prod compose (this README)
├── nginx.conf                Outer reverse proxy + HTTPS
├── deploy.sh                 One-command production deploy
├── backup.sh                 Nightly backup (cron-friendly)
└── README.md                 You are here
```

---

## 11 · Versions

- **v1.0.0** — Phase 1 + 2 + 3 + 4 complete.

For the full feature set see `backend/docs/janseva_user_manual.md`.
