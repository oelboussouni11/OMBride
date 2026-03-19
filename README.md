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
| Mobile | React Native + Expo 52, Expo Router, TypeScript, Ionicons |
| Admin | Next.js 15, React 19, Tailwind CSS 4, shadcn/ui, Recharts, Lucide |
| Backend | FastAPI, SQLAlchemy 2.0, Alembic, Pydantic |
| Database | PostgreSQL 16 + PostGIS (geospatial queries) |
| Cache | Redis 7 (real-time locations, sessions, refresh tokens) |
| Real-time | WebSockets (ride offers, driver tracking, status updates) |
| Navigation | Waze deep links (driver turn-by-turn navigation) |
| Routing | Mapbox Directions API (with Haversine fallback) |
| Testing | pytest + pytest-asyncio + httpx (42 integration tests) |

## Getting Started

### Prerequisites

- Node.js 20+, Python 3.12+
- PostgreSQL with PostGIS extension, Redis
- Expo CLI (`npm install -g expo-cli`)

### 1. Infrastructure

```bash
# Using Docker:
docker compose up -d

# Or using Homebrew (macOS):
brew services start postgresql@18
brew services start redis
```

### 2. Backend API

```bash
cd apps/api
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # configure JWT_SECRET, DATABASE_URL, etc.
alembic upgrade head
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

- API docs: http://localhost:8000/docs
- Health check: http://localhost:8000/healthz

### 3. Admin Dashboard

```bash
cd apps/admin
npm install && npm run dev
```

Open http://localhost:3000

### 4. Mobile App

```bash
cd apps/mobile
npm install
npx expo start
```

- Press `w` for web browser
- Press `i` for iOS simulator
- Scan QR code with Expo Go on your phone

**For phone testing on same WiFi**, update `apps/mobile/constants/api.ts` with your Mac's IP:
```typescript
const localhost = "http://YOUR_IP:8000";
```

## Features

### Rider App

- **Registration** — phone + password, everyone starts as rider
- **Ride booking** — enter pickup (current location or manual) + destination with coordinates, fare estimate before requesting
- **Saved locations** — save Home, Work, etc. with quick access from home screen
- **Real-time tracking** — see driver info (name, vehicle, plate, rating), status updates (matched, arriving, in progress)
- **Driver contact** — call driver directly during ride
- **Ride completion** — fare summary with 5-star driver rating
- **Ride history** — filterable by time (today/week/month) and status (completed/cancelled), with summary stats
- **Profile** — ride count, score, average rating, editable email
- **Cancel logic** — free cancel while searching, confirmation dialog when driver assigned, no cancel during ride
- **State recovery** — ride state persists across page refresh via polling + active ride API

### Driver App

- **Verification** — collapsible form to upload selfie, car photo, matricule, carte grise, driving licence. Name/phone required. All info locked after verification.
- **Go online/offline** — real-time location sharing via WebSocket, explicit go_offline message
- **Ride offers** — 15-second countdown with progress bar, pickup/dropoff coordinates, fare/distance/duration
- **Ride flow** — accept, navigate to pickup (Waze with real coordinates), arrived, start ride, complete ride, rate rider
- **Driver cancel** — available after 4 minutes of waiting, with confirmation dialog and score impact warning
- **Call rider** — direct phone call during navigating and in-ride states
- **Earnings** — credit balance card, transaction history filterable by time and type (earned/commission/top-up)
- **Top-up** — request credit top-up with proof of payment (receipt/reference), admin approval required
- **Settings** — ride count, score, rating with stars, verification status badge, vehicle info (locked when verified), request info change
- **Notifications** — toast overlay for ride requests and cancellations on any tab

### Admin Dashboard

- **Dashboard** — ride stats (today/week/month), revenue, active drivers, recent rides table with colored status badges
- **Fare & Matching** — configure fare parameters + driver matching weights with live formula preview
- **Commission** — toggle between fixed (DH) or percentage (%) with calculation preview
- **Driver management** — list with avatar, status badges, verify/reject, view documents, credit management
- **Rider management** — list with ride counts
- **Ride monitoring** — all rides with status filter tabs, colorful status pills, contextual icons
- **Credit management** — approve/reject top-up requests

### Matching System

- Searches for nearby drivers (50km dev / 5km production) for up to 90 seconds
- Retries every 5 seconds — driver can come online during active search
- Weighted formula: `score = (avg_rating * weight_rating) - (distance_km * weight_distance)`
- Weights configurable by admin in real-time via dashboard
- Cascades offers to multiple drivers — if one declines/times out, offers to next best
- Tracks tried drivers to avoid re-offering in same search session
- Ride offer includes pickup/dropoff coordinates, fare, distance, duration, rider phone

### Commission System

- **Fixed**: flat DH amount per ride (e.g. 1.00 DH)
- **Percentage**: % of ride fare (e.g. 10% of a 50 DH ride = 5 DH)
- Admin configurable, deducted from driver credit balance on ride completion
- Two transactions per ride: "Ride Earned" (positive) + "Commission" (negative)
- Drivers must maintain positive credit balance to accept rides
- Top-up via bank transfer or cash with proof of payment, admin approves

### Score & Rating

- **Rating**: riders rate drivers (1-5 stars) after ride completion, drivers rate riders
- **Score**: 1.0 to 5.0, penalized by cancellation ratio: `score = 5.0 - (cancel_ratio * 4.0)`
- Score and rating visible on profile settings, used in driver matching priority
- Driver rating shown to rider during ride (in driver card)

### Real-time Communication

- `/ws/driver/{id}` — driver sends location updates + go_offline, receives ride offers + cancellations
- `/ws/rider/{id}` — rider receives ride status, driver location, search updates
- `/ws/admin` — admin receives live stats and ride events
- Auto-reconnect every 3 seconds on disconnect
- Ping/pong keep-alive every 30 seconds
- Toast notifications for ride requests and cancellations (visible on all tabs)
- Polling fallback every 3 seconds when WebSocket messages are missed
- Visibility change listener for instant state recovery when returning to app

### State Recovery

- `GET /rides/active` returns current in-progress or recently completed unrated ride
- Both rider and driver fetch active ride on mount — survives page refresh
- Polling every 3s during active ride ensures no status change is missed
- Completed unrated rides shown for 10 minutes for rating

## Database Schema

| Table | Purpose |
|-------|---------|
| `users` | Phone, name, email, role (rider/driver/admin), password hash, active flag |
| `riders` | user_id FK, saved_locations JSON |
| `drivers` | user_id FK, vehicle model, plate, verification status, credits, PostGIS location |
| `rides` | rider/driver FKs, pickup/dropoff (PostGIS), fare, status, rating, rider_rating |
| `ride_events` | Event log per ride (requested, assigned, arriving, started, completed, cancelled) |
| `credit_transactions` | Driver credit ledger (top-ups, ride earned, commission deductions) |
| `fare_config` | Pricing, commission (fixed/%), matching weights (rating/distance), active flag |
| `driver_documents` | Document uploads for verification (selfie, licence, carte grise, etc.) |

## API Endpoints

### Auth
- `POST /auth/register` — register (rider by default, driver with vehicle info)
- `POST /auth/login` — get access + refresh tokens
- `POST /auth/refresh` — refresh access token
- `GET /auth/me` — current user profile with driver info
- `GET /auth/me/stats` — ride counts, cancelled count, average rating, score

### Rides
- `POST /rides/estimate` — fare estimate (distance, duration, fare)
- `POST /rides/request` — request a ride (triggers background matching)
- `GET /rides/active` — get current active or recently completed ride (state recovery)
- `GET /rides/history` — ride history for current user (rider or driver)
- `POST /rides/{id}/accept` — verified driver accepts ride
- `POST /rides/{id}/arriving` — driver signals arrival at pickup
- `POST /rides/{id}/start` — driver starts the ride
- `POST /rides/{id}/complete` — driver completes ride (deducts commission, creates transactions)
- `POST /rides/{id}/cancel` — rider or driver cancels ride
- `POST /rides/{id}/rate` — rate completed ride (1-5, rider rates driver or driver rates rider)

### Credits
- `GET /credits/` — transaction history for current driver
- `POST /credits/topup` — request top-up with amount, payment method, proof of payment

### Riders
- `GET /riders/saved-locations` — list saved places
- `POST /riders/saved-locations` — add/update saved place (replaces by label)
- `DELETE /riders/saved-locations/{label}` — remove saved place

### Admin
- `GET /admin/dashboard` — stats + recent rides
- `GET /admin/fare-config` — current fare configuration
- `PUT /admin/fare-config` — update fare parameters + matching weights + commission type
- `GET /admin/drivers` — list drivers with optional status filter
- `GET /admin/drivers/{id}` — driver detail with documents, transactions, rides
- `PUT /admin/drivers/{id}/verify` — verify or reject driver
- `POST /admin/drivers/{id}/credit` — approve credit top-up

## Testing

42 integration tests covering all API endpoints and business scenarios:

```bash
cd apps/api
source venv/bin/activate
python -m pytest tests/ -v
```

### Test Coverage

| File | Tests | Covers |
|------|-------|--------|
| test_auth.py | 9 | Register, duplicate phone, admin forbidden, login, wrong password, me, stats, unauthorized |
| test_rides.py | 12 | Estimate, request, accept, full ride flow, cancel, cancel completed, rate, invalid rating, history, active ride, state transitions |
| test_credits.py | 5 | List, topup, topup without ref, commission on complete, rider forbidden |
| test_saved_locations.py | 5 | Get empty, add, add multiple, update by label, delete |
| test_scenarios.py | 11 | Multiple rides same rider, cancel then new ride, driver cancel, score decrease, commission percentage, double accept, skip arriving, active completed unrated, history order, driver needs vehicle, unverified cannot accept |

## Environment Variables

```
DATABASE_URL=postgresql+asyncpg://user@localhost:5432/rideapp
REDIS_URL=redis://localhost:6379/0
JWT_SECRET=your-secret-key
JWT_ALGORITHM=HS256
MAPBOX_ACCESS_TOKEN=optional-for-routing
CORS_ORIGINS=http://localhost:3000,http://localhost:8081
```

## Test Accounts

Password for all: `pass1234`

| Role | Phone | Name | Status |
|------|-------|------|--------|
| Admin | 0600000000 | Admin OMB | — |
| Rider | 0611111111 | Sara Benali | — |
| Driver | 0633333333 | Karim Alami | Verified, 100 DH |
| Driver | 0644444444 | Hassan Radi | Pending |

## Phone Testing

Both phones must be on the same WiFi as the development machine.

1. Update `apps/mobile/constants/api.ts` with your IP (`ipconfig getifaddr en0`)
2. Start the API with `--host 0.0.0.0`
3. Start Expo with `npx expo start --web`
4. Open `http://YOUR_IP:8081` in Safari on both phones
5. Login as rider on one phone, driver on the other

**Note**: GPS requires HTTPS. On HTTP, both phones use fallback coordinates. For production, deploy with SSL.
