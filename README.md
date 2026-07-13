# SRMMS — Smart Repair & Maintenance Management System

SECEL's repair intake, tracking, and inventory management system. React + TanStack
Start frontend, Supabase (Postgres + Auth) backend. See `AGENTS.md` for the
Lovable sync note and `src/routes/README.md` for routing conventions.

## Email notifications (Resend)

Every repair status change writes a client-facing notification row (`notifications`
table, `channel` = `'email'` or `'sms'`). Email rows are actually sent through the
`send-notification-email` Supabase Edge Function using [Resend](https://resend.com).
SMS has no gateway integration — those rows are created with `delivery_status =
'simulated'` and nothing is actually sent.

### How it fires

The edge function is invoked **server-side**, via `pg_net`, straight from a
database trigger — not the browser. `tg_notify_repair` inserts the notification
row as before; a separate `trg_send_email_notification` trigger (`AFTER INSERT
ON notifications WHEN channel = 'email' AND delivery_status IS NULL`) fires
`net.http_post` to the function's URL, passing the notification's id, recipient,
title and body straight in the request body. This means delivery no longer
depends on the browser tab staying open after a status change, and it can't
double-send: only one path (the trigger) ever calls the function for a given
row now, since there is no client-side invoke left (an earlier version called
it from `useUpdateRepair`/`useConfirmDelivery` too, which raced with the DB
trigger and could send the same email twice — removed in favor of this
single server-side path).

`net.http_post` is itself async/non-blocking, and the trigger also wraps the
call in its own exception handler — a dispatch failure (missing secrets,
network error) can never block or roll back the `notifications` insert, which
in turn can never block or roll back the repair status change that caused it.

### Setup

1. Enable the `pg_net` extension and create the dispatch trigger — this is a
   migration (`20260712100000_notifications_pg_net_dispatch.sql`), applied via
   the normal `supabase db push`.
2. **Store the function URL and service role key in Vault** — triggers can't
   read function secrets directly, so the recommended Supabase pattern is used:
   store them as named secrets in `supabase_vault` (built into every Supabase
   Postgres instance) and read them back via the `vault.decrypted_secrets` view.
   Run this **once**, directly against the linked project (SQL Editor or
   `supabase db query --linked`) — deliberately **not** part of any migration,
   since it contains a live secret that must never be committed:
   ```sql
   select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
   select vault.create_secret('<service-role-key>', 'service_role_key');
   ```
   Until both secrets exist, `trg_send_email_notification` no-ops with a
   `RAISE WARNING` (visible in the Postgres logs) instead of failing the insert.
   If `vault.create_secret` isn't found, enable the **Vault** extension via
   Dashboard → Database → Extensions first.
3. Deploy the function:
   ```
   supabase functions deploy send-notification-email
   ```
4. Get an API key from https://resend.com/api-keys, then set it as a function secret:
   ```
   supabase secrets set RESEND_API_KEY=re_your_key_here
   ```
5. **Resend free-tier constraints** — until the `secel` domain is verified in
   Resend, the sender **must** stay `onboarding@resend.dev` (Resend's shared
   test sender; any other "from" address is rejected on the free tier without
   a verified domain), and delivery **only actually reaches the Resend account
   owner's own email address** — sending to any other address will appear to
   succeed (`delivery_status = 'sent'`) but the email itself won't be delivered.
   Production use requires verifying the `secel` domain in Resend and then
   setting a real "from" address:
   ```
   supabase secrets set RESEND_FROM_EMAIL="SRMMS <notifications@yourdomain.com>"
   ```
6. `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided automatically to
   every edge function by Supabase — no need to set those yourself.

### Failure behavior

If `RESEND_API_KEY` is missing, or the Resend API call fails or throws, the
function marks that notification's `delivery_status` as `'failed'` and logs a
warning (`console.warn`/`console.error`, visible in `supabase functions logs
send-notification-email`) — it never throws in a way that surfaces to the user.

### Retrying / backfilling a stuck row

The function can be invoked manually with just a notification id — useful for
retrying rows stuck at `delivery_status = null` (e.g. from before this pg_net
setup existed), or for testing:
```
curl -X POST "https://<project-ref>.supabase.co/functions/v1/send-notification-email" \
  -H "Authorization: Bearer <service-role-key>" \
  -H "Content-Type: application/json" \
  -d '{"notificationId": "<uuid>"}'
```
It looks up the recipient/title/body itself in this case, and skips rows that
already have a non-null `delivery_status` (won't re-send something already
processed) or aren't an `'email'` channel row.

## AI diagnostic assistant (Gemini)

The repair detail page has an "Assistant Diagnostic" chat panel (Technician/Admin
only) backed by the `diagnostic-assistant` Supabase Edge Function, which calls the
[Gemini API](https://ai.google.dev/) (free tier) directly via `fetch` — no SDK
dependency, same reasoning as the Resend integration: the API key must never reach
the browser, so the edge function (service role) does the call, and the client only
ever talks to that function. It tries `gemini-3.1-flash-lite` first, falling back
to `gemini-flash-latest` on a 429 (rate limit) or 404 (model not found/renamed)
from the primary — any other failure is reported as-is with no fallback attempt.
Which model actually served a given response is logged (`console.log`, visible
in the Dashboard: Edge Functions → `diagnostic-assistant` → Logs). Conversations
persist per repair in `diagnostic_chats` (append-only, Technician/Admin only).

### Setup

1. Deploy the function:
   ```
   supabase functions deploy diagnostic-assistant
   ```
2. Get a free API key from https://aistudio.google.com/apikey, then set it as a
   function secret:
   ```
   supabase secrets set GEMINI_API_KEY=your_key_here
   ```
3. (Optional) Override the default models — useful if Google renames/deprecates
   one, or you want to point at a different tier:
   ```
   supabase secrets set GEMINI_MODEL_PRIMARY=gemini-3.1-flash-lite
   supabase secrets set GEMINI_MODEL_FALLBACK=gemini-flash-latest
   ```

### Failure behavior

A Gemini `429` (free-tier rate limit) returns a friendly "The assistant is
temporarily overloaded, please try again in a minute" message instead of a raw error.
Any other failure (after trying both models) logs the details server-side and
returns a generic "temporarily unavailable" message — the Gemini API key and
raw provider errors never reach the browser.

## Seed data

`supabase/seed.sql` fills the database with realistic sample data: ~10 clients,
14 machines, 12 parts, 20 repairs spanning every status, repair logs, parts
consumption, storage-location custody chains, deliveries and notifications.
It's meant for dev/demo/staging use — **it truncates business data** (see
"Resetting" below), so don't point it at a database with real production
history you care about.

### 1. Create the 7 seed auth users first

The script can't create `auth.users` rows itself (that requires the Admin API
or the Dashboard, not plain SQL) — it only looks existing ones up by email. Create
exactly these 7 before running it, with any password you like:

| Email | Role | Technician level |
|---|---|---|
| `admin@srmms.test` | Admin | — |
| `reception1@srmms.test` | Receptionist | — |
| `reception2@srmms.test` | Receptionist | — |
| `tech.l1.a@srmms.test` | Technician | Level 1 |
| `tech.l1.b@srmms.test` | Technician | Level 1 |
| `tech.l2.a@srmms.test` | Technician | Level 2 |
| `tech.l2.b@srmms.test` | Technician | Level 2 |

**Dashboard**: Authentication → Users → Add user, for each of the 7 (check
"Auto Confirm User" so they can sign in immediately).

**Or via the Admin API** (replace `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`,
and `ChangeMe123!` with a real password), once per user:

```bash
curl -X POST "$SUPABASE_URL/auth/v1/admin/users" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@srmms.test","password":"ChangeMe123!","email_confirm":true}'
```

Creating each user fires `handle_new_user()`, which auto-creates their
`profiles` row — the seed script only ever `UPDATE`s those profiles
(`technician_level`) and inserts `user_roles`; it never inserts into
`profiles`/`auth.users` directly.

### 2. Run the script

Local dev stack (`supabase start`): `supabase db reset` runs every migration
and then `supabase/seed.sql` automatically.

Against the linked hosted project (this project's actual setup — no local
stack): run it explicitly, with `ON_ERROR_STOP` so a failure stops the script
instead of cascading into unrelated errors:

```bash
supabase db query --linked -f supabase/seed.sql
# or, with a direct connection string:
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/seed.sql
```

Pasting the file into the Dashboard's SQL Editor also works.

### Resetting

Safe to re-run. The script truncates `deliveries`, `repair_location_history`,
`part_location_history`, `repair_parts`, `repair_logs`, `notifications`,
`repairs`, `machines`, `clients`, `parts` and `audit_log`, then reseeds from
scratch — `auth.users`, `profiles`, `user_roles` and `locations` (the BOX-01..
BOX-10 rows) are left alone, so you never need to recreate the 7 accounts.

### What's real vs. hand-authored

The script disables a handful of `AFTER` triggers for the duration of the
seed and re-enables them at the end:

- `notify_repair`, `trg_repairs_custody_history`, `trg_parts_custody_history`,
  and every `audit_*` trigger. These all read `auth.uid()` for a `NOT NULL`
  column (or, for `notify_repair`, only fire on a status-changing `UPDATE`,
  which a one-shot seed `INSERT` never triggers) — neither works in a plain
  SQL session with no JWT. Instead, the script inserts equivalent
  `notifications` and `*_location_history` rows by hand, matching the shape
  and French wording the real triggers produce.
- **`audit_log` is intentionally left empty by this script.** It only ever
  contains real trigger output — the script does not fabricate rows there. It
  starts filling in as soon as real users touch the seeded data.
- `tg_repair_parts_stock` (parts stock decrement) is **left enabled** — it has
  no `auth.uid()` dependency, so `repair_parts` inserts genuinely decrement
  `parts.quantity_on_hand` through the real trigger, not a hand-computed number.

The script ends with a consistency check (`RAISE EXCEPTION` on failure) that
verifies no negative stock, no location/holder either-or violations, and every
`delivered` repair has a matching `deliveries` row, then reports a summary via
`RAISE NOTICE`.
