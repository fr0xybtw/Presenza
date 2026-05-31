# Presenza — QR Attendance System

> Fraud-proof attendance tracking for classrooms, workplaces, and events. Organizers display a rotating QR code; attendees scan it from their registered device, inside the geo-fenced zone — or they don't get in.

---

<img width="1256" height="918" alt="image" src="https://github.com/user-attachments/assets/78d5d4c9-eb61-4136-b44c-cf6a902c5f31" />

## How it works

```
Organizer creates a session  →  Sets geo-fence on a map  →  Displays rotating QR code
                                                                        ↓
Attendee opens the app  →  Scans QR  →  GPS + device fingerprint verified server-side
                                                                        ↓
                                         ✓ Inside zone + registered device  →  Checked in
                                         ✗ Outside zone or wrong device     →  Blocked
```

---

## Anti-fraud guarantees

| Threat | Defence |
|---|---|
| Screenshot of QR shared remotely | Token rotates every **30 seconds** — old codes instantly rejected |
| Scanning from a different location | **Haversine geo-fence** check server-side; GPS accuracy must be ≤ 100 m |
| One device checking in for multiple people | **Device fingerprint** locked to account on first use |
| Client-side bypass | All validation in **server functions** — the browser never decides |
| Replay attacks | Token expiry checked against `token_expires_at` in the database |
| Proxy attendance | Same fingerprint for two attendees in one session → both **flagged** |

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TanStack Router, TanStack Query |
| Styling | Tailwind CSS v4, shadcn/ui, Radix UI |
| Backend | TanStack Start (SSR + server functions) |
| Database | Supabase (Postgres + Row Level Security) |
| Auth | Supabase Auth |
| Maps | Leaflet + OpenStreetMap |
| QR generation | `qrcode` library |
| QR scanning | `html5-qrcode` |
| Device fingerprinting | FingerprintJS v5 |
| Runtime | Bun |

---

## Project structure

```
src/
├── components/
│   ├── MapPicker.tsx          # Interactive geo-fence map (Leaflet)
│   ├── QRDisplay.tsx          # QR canvas + animated countdown ring
│   └── QRScanner.tsx          # Camera-based QR scanner
├── integrations/supabase/
│   ├── client.ts              # Browser Supabase client (anon key)
│   ├── client.server.ts       # Server Supabase client (service role)
│   ├── auth-middleware.ts     # Server function auth guard
│   └── types.ts               # Auto-generated database types
├── lib/
│   ├── checkin.functions.ts   # All server-side check-in logic
│   ├── fingerprint.ts         # FingerprintJS wrapper (cached)
│   ├── haversine.ts           # Distance calculation
│   └── use-auth.ts            # Auth + role state hook
└── routes/
    ├── login.tsx
    ├── _authenticated.tsx               # Auth layout + nav
    ├── _authenticated.organizer.tsx     # Session dashboard
    ├── _authenticated.organizer.new.tsx # Create session form
    ├── _authenticated.organizer.$sessionId.tsx  # Session detail + QR display
    └── _authenticated.attendee.scan.tsx # Attendee check-in flow

supabase/
└── migrations/               # Full schema + RLS policies
```

---

## Database schema

```
profiles              — user info + registered_device_fingerprint
user_roles            — organizer | attendee per user
sessions              — geo-fence, token, timing, status
session_attendees     — enrollment (many-to-many)
attendance_records    — check-in log with coords, fingerprint, flags
```

All tables have Row Level Security enabled. Organizers see only their own sessions; attendees see only their own records. All fraud-sensitive writes go through the service-role server client — never the anon client.

---

## Getting started

### Prerequisites

- [Bun](https://bun.sh) — `curl -fsSL https://bun.sh/install | bash`
- A [Supabase](https://supabase.com) project

### 1. Clone and install

```bash
git clone https://github.com/your-username/Presenza.git
cd Presenza
bun install
```

### 2. Set up Supabase

1. Create a new project at [supabase.com](https://supabase.com)
2. Go to **SQL Editor** and run the two migration files in order:
   - `supabase/migrations/20260530180922_…sql`
   - `supabase/migrations/20260530180936_…sql`
3. Go to **Project Settings → API** and copy your keys

### 3. Configure environment variables

Create a `.env` file in the project root:

```env
# Server-side (never exposed to browser)
SUPABASE_URL="https://your-project-ref.supabase.co"
SUPABASE_PUBLISHABLE_KEY="eyJ...anon-key..."
SUPABASE_SERVICE_ROLE_KEY="eyJ...service-role-key..."

# Client-side (VITE_ prefix = safe to expose)
VITE_SUPABASE_URL="https://your-project-ref.supabase.co"
VITE_SUPABASE_PUBLISHABLE_KEY="eyJ...anon-key..."
VITE_SUPABASE_PROJECT_ID="your-project-ref"
```

> ⚠️ Never commit `.env`. The `SUPABASE_SERVICE_ROLE_KEY` bypasses all database security — keep it server-only.

### 4. Run locally

```bash
bun run dev
```

Open [http://localhost:8080](http://localhost:8080). Sign up as an **Organizer**, create a session, then open a second browser window as an **Attendee** to test the check-in flow.

---

## Deployment

### Lovable (one click)

Connect your Supabase project via the Lovable sidebar integration panel, then click **Publish**. Done.

### Vercel

```bash
# Push to GitHub first, then:
vercel deploy
```

Add all six environment variables in your Vercel project dashboard under **Settings → Environment Variables**. Then update your Supabase **Authentication → URL Configuration**:

```
Site URL:       https://your-app.vercel.app
Redirect URLs:  https://your-app.vercel.app/**
```

---

## Roles

<img width="643" height="666" alt="image" src="https://github.com/user-attachments/assets/9130b2a3-1a10-48f0-b141-93566d418f3b" />

### Organizer
- Create and manage sessions with a map-based geo-fence
- Display a full-screen rotating QR code (refreshes every 30 s)
- View real-time attendance list with check-in times, coordinates, device fingerprints
- Flag suspicious records, reset an attendee's registered device
- Export attendance to CSV

<img width="514" height="765" alt="image" src="https://github.com/user-attachments/assets/d09526a6-fb3e-4ae8-8c1c-75c3b5b3eff6" />  <img width="627" height="478" alt="image" src="https://github.com/user-attachments/assets/42ad056e-cceb-4c84-bff7-6a69ed5bfc02" />

### Attendee
- Scan a QR code or enter a 6-character short code
- GPS location is captured at scan time — must be within the session radius
- First scan registers the device; all future scans must come from the same device
- View personal attendance history

---

## Check-in validation sequence

```
1. Token valid and not expired?          → reject if stale
2. Session status is "active"?           → reject if scheduled or closed
3. Attendee enrolled in this session?    → reject if not on the list
4. GPS within geo-fence radius?          → reject if outside boundary
5. GPS accuracy ≤ 100 m?                → reject if signal too weak
6. Device fingerprint matches?           → reject if different device
7. Already checked in?                   → reject duplicate
8. Same device for another attendee?     → allow but flag both records
```

---

## Development scripts

```bash
bun run dev        # Start dev server with HMR
bun run build      # Production build
bun run preview    # Preview production build locally
bun run lint       # ESLint
bun run format     # Prettier
```

---

## License

MIT
