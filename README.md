# OMBdrive

Ride-hailing platform for the Morocco market. Full-stack monorepo with a mobile app (rider + driver), admin dashboard, and backend API with real-time WebSocket communication.

## Architecture

```
apps/
  mobile/     React Native (Expo) — rider & driver app
  admin/      Next.js 15 — admin dashboard
  api/        FastAPI (Python) — REST API + WebSockets
packages/
  shared/     Shared TypeScript types
```

### Tech Stack

| Layer | Tech |
|-------|------|
| Mobile | React Native + Expo 52, Expo Router (Drawer nav), TypeScript, Ionicons |
| Admin | Next.js 15, React 19, Tailwind CSS 4, shadcn/ui, Recharts, Lucide |
| Backend | FastAPI, SQLAlchemy 2.0, Alembic, Pydantic |
| Database | PostgreSQL 16 + PostGIS (geospatial queries) |
| Cache | Redis 7 (real-time locations, sessions, refresh tokens) |
| Real-time | WebSockets + polling fallback |
| Navigation | Waze deep links (driver turn-by-turn) |
| Routing | Mapbox Directions API (with Haversine fallback) |
| Testing | pytest + pytest-asyncio + httpx (42 integration tests) |

## Getting Started

### Prerequisites

- Node.js 20+, Python 3.12+
- PostgreSQL with PostGIS, Redis
- Expo CLI

### 1. Infrastructure

```bash
brew services start postgresql@18
brew services start redis
```

### 2. Backend API

```bash
cd apps/api
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
alembic upgrade head
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### 3. Admin Dashboard

```bash
cd apps/admin && npm install && npm run dev
```

### 4. Mobile App

```bash
cd apps/mobile && npm install && npx expo start
```

For phone testing: update `apps/mobile/constants/api.ts` with your IP.

---

## What Was Done

### Navigation
- Hamburger drawer menu (slides from left) replaces bottom tabs
- Floating menu button on home screens
- Swipe-right gesture to open drawer

### Rider App
- Registration (phone + password, everyone starts as rider)
- Ride booking: pickup (current location or manual) + destination with coordinates
- Fare estimate before requesting
- Saved locations (Home, Work, etc.)
- Real-time ride tracking via WebSocket + 3s polling fallback
- Driver info during ride (name, vehicle, plate, rating, phone)
- Call driver button
- 5-star driver rating after completion
- Ride history with time/status filters and summary stats
- Profile with ride count, score, rating
- Cancel logic: free while searching, confirmation when matched, blocked during ride
- State recovery on refresh
- Delete account option

### Driver App
- **3-step verification form**:
  - Step 1: Personal info (name, phone, age, city)
  - Step 2: Driving licence (number, dates, front/back photos, selfie)
  - Step 3: Vehicle (brand from list, model, color, year, plate, car photo, carte grise)
- Verification lifecycle: pending → submitted → admin review → verified/rejected
- Rejected drivers see rejection note, can re-submit
- Verified drivers: info locked, must re-verify to change
- Go online/offline with location sharing
- Ride offers: 15s countdown, coordinates, fare, distance, rider phone
- Ride flow: accept → Waze navigation → arrived → start → complete → rate rider
- 4-minute cancel timer with confirmation
- Call rider during ride
- Earnings: credit balance, filterable transactions (time + type)
- Credit top-up with receipt photo upload
- Toast notifications on all screens
- Cannot go online if not verified

### Dual Role System
- All users are riders by default (rider record created on registration)
- Switch to driver mode creates driver record if first time
- Role = active mode (UI shown), not permanent type
- Both rider and driver records coexist

### Account Management
- Users can delete their account (soft delete)
- Admin can ban, hold, or reactivate any user
- Banned users see reason on login attempt
- Account status: active, on_hold, banned, deleted
- Admin sees account status in driver/rider lists

### Admin Dashboard
- Dashboard: stats, revenue, recent rides
- Fare & Matching: pricing + weighted matching formula with live preview
- Commission: fixed (DH) or percentage (%) with preview
- Driver management: search by name/phone/plate, verify/reject with notes
- Rider management: list with ride counts
- Ride monitoring: status filters, colorful badges
- Credit management: approve top-ups
- User status management: ban/hold/activate

### Matching System
- Searches nearby drivers for 90 seconds, retries every 5s
- Weighted formula: `(avg_rating * weight_rating) - (distance_km * weight_distance)`
- Admin-configurable weights
- Cascades offers, tracks tried drivers

### Commission
- Fixed DH or % of fare (admin toggle)
- Two transactions per ride: earned + commission
- Top-up with receipt photo, admin approval

### Score & Rating
- Riders rate drivers, drivers rate riders (1-5 stars)
- Score penalized by cancellations
- Used in matching priority

### Real-time
- WebSocket for drivers, riders, admin
- Polling fallback every 3s
- Visibility change recovery
- Toast notifications (non-blocking)

### Testing
- 42 integration tests covering auth, rides, credits, locations, scenarios
- `cd apps/api && python -m pytest tests/ -v`

---

## What's Missing (Roadmap)

### P0 — Required for Production

| Feature | Description |
|---------|-------------|
| HTTPS / SSL | GPS requires HTTPS — deploy with SSL |
| Map integration | Google Places / Mapbox for address search + map pins |
| Push notifications | FCM for ride offers when app is closed |
| Payment gateway | Stripe / CMI for online payment |
| Cloud image storage | S3 / Cloudinary for receipt + verification photos |
| Native build | Expo dev build for real GPS + push |
| Phone OTP verification | SMS verification on registration |
| Proper DB migrations | Alembic autogenerate for all schema changes |

### P1 — Important

| Feature | Description |
|---------|-------------|
| Address geocoding | Convert addresses to coordinates |
| Ride receipt (email/SMS) | After completion |
| Admin notification to driver | When verified/rejected |
| Rate limiting | API abuse prevention |
| Password reset | Forgot password flow |
| Error monitoring | Sentry integration |

### P2 — Nice to Have

| Feature | Description |
|---------|-------------|
| Dark mode | Theme toggle |
| Multi-language | Arabic / French / English |
| Ride scheduling | Book for later |
| Promo codes | Discounts |
| Analytics charts | Earnings + admin dashboards |
| CI/CD | GitHub Actions |
| Docker production | Containerized deployment |

### P3 — Future

| Feature | Description |
|---------|-------------|
| Surge pricing | Dynamic fare |
| Vehicle types | Economy, comfort, premium |
| Ride sharing | Carpool |
| Driver incentives | Peak hour bonuses |
| Referral system | Invite friends |
| In-app chat | Driver-rider messaging |
| Admin roles | Super admin, support, finance |

---

## API Endpoints

### Auth
- `POST /auth/register` — register (rider by default)
- `POST /auth/login` — tokens
- `POST /auth/refresh` — refresh token
- `POST /auth/me/switch-role` — toggle rider/driver mode
- `DELETE /auth/me` — delete account
- `GET /auth/me` — profile
- `GET /auth/me/stats` — ride counts, rating, score

### Rides
- `POST /rides/estimate` — fare estimate
- `POST /rides/request` — request ride
- `GET /rides/active` — current ride (state recovery)
- `GET /rides/history` — past rides
- `POST /rides/{id}/accept` — driver accepts
- `POST /rides/{id}/arriving` — driver arriving
- `POST /rides/{id}/start` — start ride
- `POST /rides/{id}/complete` — complete + commission
- `POST /rides/{id}/cancel` — cancel
- `POST /rides/{id}/rate` — rate (1-5)

### Drivers
- `POST /drivers/submit-verification` — 3-step verification data
- `POST /drivers/request-reverification` — reset to pending
- `GET /drivers/?search=name` — admin search

### Credits
- `GET /credits/` — transaction history
- `POST /credits/topup` — request top-up

### Riders
- `GET /riders/saved-locations` — list
- `POST /riders/saved-locations` — add/update
- `DELETE /riders/saved-locations/{label}` — remove

### Admin
- `GET /admin/dashboard` — stats
- `GET/PUT /admin/fare-config` — pricing + matching
- `GET /admin/drivers` — list (search + filter)
- `PUT /admin/drivers/{id}/verify` — verify/reject with note
- `POST /admin/drivers/{id}/credit` — approve top-up
- `PUT /admin/users/{id}/status` — ban/hold/activate
- `GET /admin/rides` — all rides with filters

## Test Accounts

Admin only (clean DB): `0600000000` / `admin123`

Register new accounts on your phones to test the full flow.

## Testing

```bash
cd apps/api && source venv/bin/activate
python -m pytest tests/ -v
# 42 passed
```
