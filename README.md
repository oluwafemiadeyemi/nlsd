# NLSD

A production-ready CRM-style web application for **Timesheets**, **Expenses**, and **Approvals**, built with Next.js 15, Supabase, and deployed to Netlify.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 15 (App Router, TypeScript) |
| Styling | Tailwind CSS + Radix UI |
| Database | Supabase (PostgreSQL + RLS) |
| Auth | Supabase Auth with Microsoft 365 SSO (Entra ID) |
| Directory Sync | Microsoft Graph API (app-only, Netlify Scheduled Function) |
| Payroll Export | SharePoint Online via Graph API (Netlify Function) |
| Deployment | Netlify |
| Testing | Vitest + React Testing Library |

---

## Architecture

```
NLSD/
├── app/                        # Next.js App Router
│   ├── (auth)/login/           # Microsoft SSO login page
│   ├── (dashboard)/            # Protected routes (sidebar layout)
│   │   ├── dashboard/          # Overview + quick stats
│   │   ├── timesheets/         # Timesheet list + week entry
│   │   ├── expenses/           # Expense list + week entry
│   │   ├── approvals/          # Manager inbox (split-view)
│   │   ├── reports/            # Year-to-date reports
│   │   ├── people/             # People directory (admin)
│   │   └── settings/           # Profile, projects, mileage rate
│   ├── api/export/             # Trigger SharePoint payroll export
│   └── auth/callback/          # OAuth callback
├── domain/
│   ├── timesheets/             # Pure calculations + validation
│   └── expenses/               # Pure calculations + validation
├── components/
│   ├── layout/                 # Sidebar, TopBar
│   ├── timesheets/             # TimesheetGrid, TimesheetWeekClient, PrintView
│   ├── expenses/               # ExpenseGrid, ExpenseWeekClient
│   ├── approvals/              # ApprovalsInbox (split-view + bulk actions)
│   ├── settings/               # Projects, MileageRate, Profile settings
│   └── ui/                     # StatusBadge, AuditTimeline, Drawer, Toaster
├── lib/
│   ├── supabase/               # Client + server + middleware + types
│   └── msGraph/                # Graph client + SharePoint uploader
├── netlify/functions/
│   ├── graph-sync.ts           # Scheduled: sync Entra ID → profiles
│   └── sharepoint-export.ts    # On-demand: export approved data to SharePoint
├── supabase/
│   ├── migrations/             # SQL migrations 001-005
│   └── seed/                   # Billing types + sample projects
└── tests/
    └── domain/                 # Unit + integration tests
```

---

## Calculations Reference

### Timesheets

```
rowWeeklyTotal  = sum(hours[sun..sat])
dailyTotals[d]  = sum(rows[d])
weeklyTotal     = sum(rowWeeklyTotals)
```

**Validation:**
- `hours >= 0` → error
- `dailyTotal > 24` → error
- `weeklyTotal > maximumHours` → error
- `weeklyTotal < contractedHours && weeklyTotal > 0` → warning
- Regular/overtime billing requires a project; leave/sick/holiday does not

### Expenses

```
suggestedMileageCost = mileageKm × ratePerKm           (display only)
dailyTotal           = mileageCostClaimed + lodging
                       + (breakfast + lunch + dinner) + other

totalMileageKm       = Σ mileageKm
totalMileageClaimed  = Σ mileageCostClaimed
mileageCostAtRate    = totalMileageKm × ratePerKm       (display only)
totalLodging         = Σ lodging
totalMeals           = Σ (breakfast + lunch + dinner)
totalOther           = Σ other
weeklyTotal          = totalMileageClaimed + totalLodging
                       + totalMeals + totalOther
```

---

## Setup & Deployment

### Prerequisites

- Node.js 20+
- Supabase project (free tier works)
- Microsoft Entra ID app registration (for SSO + Graph)
- Netlify account
- SharePoint Online site (for payroll export)

---

### 1. Supabase Setup

```bash
# Install Supabase CLI
npm install -g supabase

# Link to your project
supabase link --project-ref YOUR_PROJECT_REF

# Run migrations
supabase db push

# Seed billing types
supabase db execute --file supabase/seed/billing_types.sql
```

**Enable Microsoft SSO in Supabase Dashboard:**
1. Go to **Authentication → Providers → Azure**
2. Enable Azure provider
3. Enter your Entra ID `Application (client) ID` and `Client secret`
4. Set the redirect URL to `https://your-workhub.netlify.app/auth/callback`
5. In your Entra app, add this as a redirect URI under **Authentication**

---

### 2. Entra ID App Registration

Create two app registrations (or one for both purposes):

**For SSO (delegated permissions):**
- Platform: Web
- Redirect URI: `https://your-workhub.netlify.app/auth/callback`
- Scopes: `openid`, `profile`, `email`

**For Graph API (application permissions — no user needed):**
- Add application permissions: `User.Read.All`, `Group.Read.All`, `Directory.Read.All`, `Sites.ReadWrite.All`, `Files.ReadWrite.All`
- Grant admin consent
- Create a client secret

**Create Entra security groups:**
- `NLSD-Admins` (object ID → `AZURE_GROUP_ADMINS`)
- `NLSD-Managers` (object ID → `AZURE_GROUP_MANAGERS`)
- `NLSD-Employees` (object ID → `AZURE_GROUP_EMPLOYEES`)

---

### 3. Local Development

```bash
# Clone and install
npm install

# Copy env file
cp .env.example .env.local
# Edit .env.local with your values

# Run dev server
npm run dev

# Run tests
npm test

# Type check
npm run typecheck
```

---

### 4. Netlify Deployment

**Connect to Netlify:**
```bash
netlify init
# OR connect via Netlify Dashboard → New site from Git
```

**Set environment variables in Netlify UI** (Site Settings → Environment Variables):

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY

AZURE_TENANT_ID
AZURE_CLIENT_ID
AZURE_CLIENT_SECRET
AZURE_GROUP_ADMINS
AZURE_GROUP_MANAGERS
AZURE_GROUP_EMPLOYEES

SHAREPOINT_SITE_ID
SHAREPOINT_DRIVE_ID
SHAREPOINT_PAYROLL_FOLDER

NEXT_PUBLIC_APP_URL
NEXT_PUBLIC_APP_NAME
GRAPH_SYNC_SECRET
DEFAULT_MILEAGE_RATE_PER_KM
```

Important:
- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` must come from the same Supabase project.
- Do not wrap keys in quotes in Netlify.
- After changing any `NEXT_PUBLIC_*` value, trigger a fresh redeploy (these are baked at build time).

**Deploy:**
```bash
git push origin main
# Netlify auto-deploys from main branch
```

---

### 5. Post-Deployment

1. **First admin user:** After deploying, sign in with your Microsoft account. Then in Supabase dashboard, update your profile's `role` to `admin`:
   ```sql
   UPDATE profiles SET role = 'admin' WHERE email = 'your@email.com';
   ```

2. **Test Graph sync:** Trigger manually via Netlify Functions dashboard, or wait for the daily 2am UTC run.

3. **Configure settings:** Go to Settings → Projects to add your projects, and Settings → Mileage Rate to set the current rate.

---

## Environment Variables Reference

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Supabase anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Supabase service role key (server-only) |
| `AZURE_TENANT_ID` | ✅ | Entra ID tenant ID |
| `AZURE_CLIENT_ID` | ✅ | App registration client ID |
| `AZURE_CLIENT_SECRET` | ✅ | App registration client secret |
| `AZURE_GROUP_ADMINS` | ✅ | Entra group object ID for admins |
| `AZURE_GROUP_MANAGERS` | ✅ | Entra group object ID for managers |
| `AZURE_GROUP_EMPLOYEES` | ⬜ | Entra group object ID for employees |
| `SHAREPOINT_SITE_ID` | ⬜ | SharePoint site ID (for payroll export) |
| `SHAREPOINT_DRIVE_ID` | ⬜ | SharePoint document library drive ID |
| `SHAREPOINT_PAYROLL_FOLDER` | ⬜ | Folder path in library (default: Payroll/Exports) |
| `NEXT_PUBLIC_APP_URL` | ✅ | Full URL of deployed app |
| `GRAPH_SYNC_SECRET` | ✅ | 32+ char secret for securing Netlify functions |
| `DEFAULT_MILEAGE_RATE_PER_KM` | ⬜ | Default rate (default: 0.61) |

---

## Security

- **Row-Level Security (RLS)** enforced at the database layer — employees can only see their own data
- **Manager routing** via Entra org chart (`manager_id` FK on profiles)
- **Single-tenant restriction** on SSO — only your Entra directory can authenticate
- **Service role key** never exposed to the browser
- **Idempotency keys** prevent duplicate SharePoint exports
- **Audit log** on every status transition

---

## Running Tests

```bash
# Run all tests
npm run test:run

# Watch mode
npm test

# With coverage
npm run test:coverage
```

Tests cover:
- `domain/timesheets/calculations` — row totals, daily totals, weekly totals, hour parsing
- `domain/timesheets/validation` — all error and warning conditions
- `domain/expenses/calculations` — day totals, weekly totals, display-only fields
- `domain/expenses/validation` — negative values, mileage warnings
- Integration scenarios with realistic data
