# OMBdrive

Ride-hailing platform for the Morocco market. Full-stack monorepo with mobile app, admin dashboard, and backend API.

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
| Mobile | React Native + Expo 52, Expo Router, TypeScript |
| Admin | Next.js 15, React 19, Tailwind CSS 4, shadcn/ui, Recharts |
| Backend | FastAPI, SQLAlchemy 2.0, Alembic, Pydantic |
| Database | PostgreSQL 16 + PostGIS (geospatial) |
| Cache | Redis 7 (real-time locations, sessions) |
| Real-time | WebSockets (ride offers, driver tracking, status updates) |
| Navigation | Waze deep links (driver turn-by-turn) |
| Maps | Mapbox Directions API (with Haversine fallback) |

## Getting Started

### Prerequisites

- Node.js 20+, Python 3.12+
- PostgreSQL with PostGIS, Redis
- Expo CLI (`npm install -g expo-cli`)

### 1. Infrastructure

```bash
# Using Docker:
docker compose up -d

# Or using Homebrew (macOS):
brew services start postgresql@18
brew services start redis
```

### 2. Backend

```bash
cd apps/api
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # configure JWT_SECRET, DATABASE_URL, etc.
alembic upgrade head
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

API docs: http://localhost:8000/docs

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

Press `w` for web, `i` for iOS simulator, or scan QR with Expo Go.

## Features

### Rider App
- **Registration** — phone + password, everyone starts as rider
- **Ride request** — enter destination (manual coordinates or saved locations), fare estimate, request ride
- **Saved locations** — save Home, Work, etc. for quick access
- **Real-time tracking** — see driver location, status updates (matched, arriving, in progress)
- **Ride completion** — fare summary, 5-star driver rating
- **Ride history** — all past rides with status, fare, route
- **Profile** — ride count, score (based on cancellations), average rating
- **Cancel logic** — free cancel while searching, confirmation when driver is assigned, no cancel during ride

### Driver App
- **Verification** — collapsible form to upload selfie, car photo, matricule, carte grise, driving licence + name/phone. All info locked after verification.
- **Go online/offline** — location sharing via WebSocket when online
- **Ride offers** — 15-second countdown, route preview, fare/distance/duration details
- **Ride flow** — accept, navigate to pickup (Waze), arrived, start ride, complete ride, rate rider
- **Earnings** — credit balance, transaction history (commission + top-ups), top-up request with proof of payment
- **Profile** — ride count, score, rating, verification status with visual badge
- **Info change** — verified drivers must request changes through admin

### Admin Dashboard
- **Dashboard** — ride stats, revenue, active drivers
- **Fare & Matching** — configure fare parameters + driver matching weights
- **Commission** — fixed (DH) or percentage (%) of ride fare
- **Driver matching formula** — `score = (rating * weight_rating) - (distance_km * weight_distance)` with live preview
- **Driver management** — verify/reject drivers, view documents, credit management
- **Rider management** — view riders, ride counts
- **Ride monitoring** — all rides with status filters
- **Credit management** — approve/reject top-up requests

### Matching System
- Searches for nearby drivers (5km radius) for up to 90 seconds
- Retries every 10 seconds — driver can come online during search
- Prioritizes by weighted formula: `(avg_rating * weight_rating) - (distance_km * weight_distance)`
- Weights configurable by admin in real-time
- Cascades offers: if one driver declines, offers to next best
- Tracks tried drivers to avoid re-offering

### Commission System
- **Fixed**: flat DH amount per ride (e.g. 1.00 DH)
- **Percentage**: % of ride fare (e.g. 10% of a 50 DH ride = 5 DH)
- Configurable by admin, deducted from driver credit balance on ride completion
- Drivers must maintain positive credit balance to accept rides
- Top-up via bank transfer or cash with proof of payment, admin approves

### Score & Rating
- **Rating**: riders rate drivers (1-5 stars) after ride, drivers rate riders
- **Score**: 1.0 to 5.0, penalized by cancellation ratio: `score = 5.0 - (cancel_ratio * 4.0)`
- Score and rating visible on profile, used in driver matching priority

### Real-time (WebSocket)
- `/ws/driver/{id}` — driver sends location updates, receives ride offers
- `/ws/rider/{id}` — rider receives ride status, driver location, search updates
- `/ws/admin` — admin receives live stats
- Auto-reconnect every 3 seconds, ping/pong keep-alive

## Database Schema

| Table | Purpose |
|-------|---------|
| `users` | Phone, name, email, role (rider/driver/admin), password hash |
| `riders` | user_id FK, saved_locations JSON |
| `drivers` | user_id FK, vehicle, plate, status, credits, PostGIS location |
| `rides` | rider/driver FKs, pickup/dropoff (PostGIS), fare, status, rating |
| `ride_events` | Event log per ride (requested, assigned, arriving, started, completed, cancelled) |
| `credit_transactions` | Driver credit ledger (top-ups, commission deductions) |
| `fare_config` | Pricing, commission (fixed/%), matching weights, active flag |
| `driver_documents` | Document uploads for verification |

## API Endpoints

### Auth
- `POST /auth/register` — register (rider by default)
- `POST /auth/login` — get access + refresh tokens
- `POST /auth/refresh` — refresh access token
- `GET /auth/me` — current user profile
- `GET /auth/me/stats` — ride counts, ratings, score

### Rides
- `POST /rides/estimate` — fare estimate
- `POST /rides/request` — request a ride (triggers matching)
- `GET /rides/history` — ride history for current user
- `POST /rides/{id}/accept` — driver accepts
- `POST /rides/{id}/arriving` — driver arriving
- `POST /rides/{id}/start` — start ride
- `POST /rides/{id}/complete` — complete ride (deducts commission)
- `POST /rides/{id}/cancel` — cancel ride
- `POST /rides/{id}/rate` — rate completed ride (1-5)

### Credits
- `GET /credits/` — transaction history
- `POST /credits/topup` — request top-up with proof of payment

### Riders
- `GET /riders/saved-locations` — list saved places
- `POST /riders/saved-locations` — add/update saved place
- `DELETE /riders/saved-locations/{label}` — remove saved place

### Admin
- `GET /admin/dashboard` — stats + recent rides
- `GET/PUT /admin/fare-config` — fare parameters + matching weights
- `GET /admin/drivers` — list drivers
- `GET /admin/drivers/{id}` — driver detail
- `PUT /admin/drivers/{id}/verify` — verify/reject driver
- `POST /admin/drivers/{id}/credit` — approve credit top-up

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

| Role | Phone | Name |
|------|-------|------|
| Admin | 0600000000 | Admin OMB |
| Rider | 0611111111 | Sara Benali |
| Rider | 0612222222 | Amine Tazi |
| Driver (verified) | 0633333333 | Karim Alami |
| Driver (pending) | 0644444444 | Hassan Radi |
