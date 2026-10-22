# Singtel Mobile — Shop ERP (MobiCore)

A Laravel 12 application for a mobile phone shop. It covers the POS and billing, IMEI-level inventory, purchases, repairs, product and repair warranties (including warranty unit replacement), claims, reports and role-based staff access.

The approved UI and the API are one project and are served from the same site.

## Project layout

```
app/                   Laravel application
  Services/            Business rules: sales, purchases, repairs, warranties, stock (all permission-checked, transactional)
  Http/Controllers/Api API endpoints (thin: validate → service → JSON)
  Http/Middleware/     Server-side permission check (perm:module,action) and deactivated-account guard
  Support/             Permission matrix, IMEI validation
database/migrations/   33 tables (MySQL compatible)
database/seeders/      Base data: settings, roles, categories, one admin account
routes/api.php         All API routes with their required permissions
routes/web.php         Serves the UI (public/app.html) at "/"
public/app.html        The approved single-page UI
public/assets/         UI stylesheets, scripts and illustrations
tests/Feature/         Workflow tests (sales, refunds, repairs, claims, replacements, IMEI duplicates…)
```

## Running locally

```bash
composer install
cp .env.example .env && php artisan key:generate   # first time only
php artisan storage:link                            # product photos
php artisan migrate --seed                          # real installation: prints the admin password once
php artisan serve                                   # open http://127.0.0.1:8000
php artisan test                                    # run the test suite
```

Local development uses SQLite by default. For MySQL, set `DB_CONNECTION=mysql` and the `DB_*` values in `.env`.

### Demo installation (client presentations)

Set `SHOP_DEMO=true` in `.env`, then run:

```bash
php artisan migrate:fresh --seed --seeder="Database\Seeders\DemoSeeder"
```

This creates about 14 months of realistic data and shows one-click demo logins on the sign-in page:

| Login | Role |
|---|---|
| `admin` / `admin123` | Administrator |
| `manager` / `manager123` | Store Manager |
| `sales` / `sales123` | Sales Executive |
| `tech` / `tech123` | Technician |
| `store` / `store123` | Store Keeper |
| `tom` / `tom123` | Deactivated account |

An administrator can reset the demo from **Settings → Data & security**.

**Never set `SHOP_DEMO=true` in production.**

## How the UI talks to the server

- **Sign-in:** the browser receives a login token.
- **Loading data:** `GET /api/sync` loads everything this user's role may see into memory. The screens render from this copy, so they stay fast.
- **Saving changes:** every change is an API call. The server validates it, checks permissions, saves it in a database transaction and writes the activity log. The browser then fetches only the records that changed.
- **Other staff's changes:** they appear within about 45 seconds. Pages with an open form are not redrawn.
- **Role filtering:**
  - A Sales Executive receives only their own invoices.
  - Technicians receive only their own repair jobs.
  - Roles without finance access never receive cost prices.
- **Photos and signatures:** served through signed links that expire after 12 hours.

## Reports and documents

- **Reports** (`GET /api/reports/{sales|inventory|repairs|warranty|financial}?from=&to=`)
  - Calculated on the server from all records, for any period up to 3 years.
  - Profit & loss needs Reports "Manage". Cost and margin figures are hidden from roles without financial access.
- **PDFs** (`GET /api/documents/...`):
  - tax invoice, quotation, warranty certificate (including replacement units), repair receipt, estimate, invoice and delivery receipt, customer statement, and GRN / purchase order.
  - The same visibility rules as the screens apply.
- **Time zone:** documents use the shop's local time zone (`APP_TIMEZONE`, default `Asia/Colombo`).
- **Signatures on PDFs:** the signature image needs PHP's GD extension (installed on the VPS). Without GD, the receipt states that the customer signed.

## Current status

- **Done:**
  - Phases 1–4: database, login and permissions, all business rules on the server, UI connected, and server-side reports and PDF documents.
  - 44 automated tests, plus browser tests of every page, workflow, report and PDF.
- **Next:** Phase 5, VPS deployment (Nginx, HTTPS, MySQL, PHP GD, nightly backups).
