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

---

## What Was Done

### Rider App
- Registration (phone + password, everyone starts as rider)
- Ride booking with pickup (current location or manual coordinates) + destination
- Fare estimate before requesting (distance, duration, fare)
- Saved locations (Home, Work, etc.) with quick access
- Real-time ride tracking via WebSocket + polling fallback
- Driver info display during ride (name, vehicle, plate, rating)
- Call driver button during ride
- 5-star driver rating after ride completion
- Ride history with time filters (Today/Week/Month) and status filters (Completed/Cancelled)
- Summary stats (rides, cancelled, total spent)
- Profile with ride count, score, rating, editable email
- Cancel logic: free while searching, confirmation when driver assigned, blocked during ride
- State recovery on page refresh (active ride API + visibility change listener)

### Driver App
- Verification flow: collapsible form with selfie, car photo, matricule, carte grise, driving licence upload
- Verified info locked (name, phone, vehicle) — changes require admin request
- Go online/offline with real-time location sharing
- Ride offers with 15-second countdown, pickup/dropoff coordinates, fare/distance/duration
- Ride flow: accept, navigate (Waze with real coordinates), arrived, start, complete, rate rider
- Call rider button during navigating and in-ride
- Driver cancel after 4-minute wait with confirmation and score warning
- Earnings screen with credit balance, filterable transaction history (time + type)
- Credit top-up with amount, payment method, receipt photo upload, reference text
- Toast notifications for ride requests and cancellations on any tab
- Settings: ride count, score, rating with stars, verification status badge
- State recovery on refresh

### Admin Dashboard
- Dashboard with ride stats (today/week/month), revenue, active drivers, recent rides
- Fare & Matching configuration with live formula preview
- Commission: toggle between fixed (DH) or percentage (%) with calculation preview
- Driver management: list with avatars, status badges, verify/reject, documents, credits
- Rider management: list with ride counts
- Ride monitoring: all rides with status filter tabs, colorful status pills
- Credit management: approve/reject top-up requests
- Colored stat cards, icons, alternating table rows, loading/empty states

### Matching System
- Searches nearby drivers (50km dev / 5km production) for up to 90 seconds
- Retries every 5 seconds — driver can come online during search
- Weighted formula: `score = (avg_rating * weight_rating) - (distance_km * weight_distance)`
- Admin-configurable weights in real-time
- Cascades offers to multiple drivers, tracks tried drivers
- Includes pickup/dropoff coordinates, fare, distance, duration, rider phone in offer

### Commission System
- Fixed (DH) or Percentage (%) of ride fare
- Two transactions per ride: "Ride Earned" (positive) + "Commission" (negative)
- Drivers must maintain positive credit balance
- Top-up with receipt photo upload, admin approval required

### Score & Rating
- Riders rate drivers (1-5 stars), drivers rate riders
- Score: `5.0 - (cancel_ratio * 4.0)` — penalizes cancellations
- Driver rating shown during ride, used in matching priority

### Real-time Communication
- WebSocket for drivers (location, ride offers, cancellations)
- WebSocket for riders (ride status, driver location, search updates)
- WebSocket for admin (live stats)
- Auto-reconnect, ping/pong keep-alive
- Toast notifications on all tabs
- Polling fallback every 3 seconds
- Visibility change listener for instant recovery

### Testing
- 42 integration tests covering all endpoints and business scenarios
- Auth, rides, credits, saved locations, complex workflows
- Run: `cd apps/api && python -m pytest tests/ -v`

---

## What's Missing (Roadmap)

### P0 — Required for Production

| Feature | Status | Description |
|---------|--------|-------------|
| HTTPS / SSL | Not done | GPS requires HTTPS. Deploy behind nginx + Let's Encrypt or use cloud with SSL |
| Map integration | Not done | Google Places / Mapbox autocomplete for address search, map view with pins |
| Push notifications | Not done | Firebase Cloud Messaging for ride offers, status updates when app is closed |
| Payment gateway | Not done | Stripe / CMI (Morocco) for online payment, in-app wallet |
| Receipt image upload to cloud | Not done | Currently stored as local URI. Need S3 / Cloudinary for receipt photos |
| Native build | Not done | Expo dev build for real GPS, push notifications, background location |
| Phone/OTP verification | Not done | Verify phone number with SMS OTP on registration |
| Database migrations | Partial | Schema changes done via raw SQL. Need proper Alembic migrations |

### P1 — Important

| Feature | Status | Description |
|---------|--------|-------------|
| Address geocoding | Not done | Convert text addresses to coordinates (Google/Mapbox Geocoding API) |
| Profile photo storage | Not done | Upload selfie/documents to cloud storage |
| Ride receipt | Not done | Email/SMS receipt after ride completion |
| Admin notifications | Not done | Notify driver when verified/rejected |
| Rate limiting | Not done | API rate limiting to prevent abuse |
| Password reset | Not done | Forgot password flow via SMS/email |
| Input validation | Partial | Coordinate validation on frontend, need more robust server-side |
| Error monitoring | Not done | Sentry or similar for crash/error tracking |

### P2 — Nice to Have

| Feature | Status | Description |
|---------|--------|-------------|
| Dark mode | Not done | Theme toggle in app settings |
| Multi-language | Not done | Arabic / French / English support |
| Ride scheduling | Not done | Book a ride for a future time |
| Promo codes | Not done | Discount / coupon system |
| Driver earnings analytics | Not done | Charts and graphs in earnings tab |
| Admin analytics | Not done | Recharts dashboards for trends |
| CI/CD pipeline | Not done | GitHub Actions for automated tests + deployment |
| Docker production | Not done | Dockerfiles for API + admin + nginx |
| Ride ETA updates | Not done | Real-time ETA recalculation during ride |
| In-app chat | Not done | Driver-rider messaging |

### P3 — Future

| Feature | Description |
|---------|-------------|
| Surge pricing | Dynamic fare based on demand |
| Multiple vehicle types | Economy, comfort, premium |
| Ride sharing / carpool | Share rides with other passengers |
| Driver incentives | Bonuses for peak hours, high ratings |
| Referral system | Invite friends, earn credits |
| Admin roles | Super admin, support agent, finance |
| Audit log | Track all admin actions |
| Data export | CSV/PDF reports for finance |

---

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
- `GET /rides/active` — get current active or recently completed ride
- `GET /rides/history` — ride history for current user
- `POST /rides/{id}/accept` — verified driver accepts ride
- `POST /rides/{id}/arriving` — driver signals arrival at pickup
- `POST /rides/{id}/start` — driver starts the ride
- `POST /rides/{id}/complete` — complete ride (commission deducted, transactions created)
- `POST /rides/{id}/cancel` — rider or driver cancels ride
- `POST /rides/{id}/rate` — rate completed ride (1-5)

### Credits
- `GET /credits/` — transaction history for current driver
- `POST /credits/topup` — request top-up with amount, payment method, receipt

### Riders
- `GET /riders/saved-locations` — list saved places
- `POST /riders/saved-locations` — add/update saved place
- `DELETE /riders/saved-locations/{label}` — remove saved place

### Admin
- `GET /admin/dashboard` — stats + recent rides
- `GET/PUT /admin/fare-config` — fare parameters + matching weights + commission
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

| Role | Phone | Name | Status |
|------|-------|------|--------|
| Admin | 0600000000 | Admin OMB | — |
| Rider | 0611111111 | Sara Benali | — |
| Driver | 0633333333 | Karim Alami | Verified, 100 DH |
| Driver | 0644444444 | Hassan Radi | Pending |

## Testing

```bash
cd apps/api && source venv/bin/activate
python -m pytest tests/ -v
# 42 passed in ~25s
```

## Phone Testing

1. Both phones on same WiFi as dev machine
2. Update `apps/mobile/constants/api.ts` with your IP
3. Start API with `--host 0.0.0.0`
4. Start Expo with `npx expo start --web`
5. Open `http://YOUR_IP:8081` in Safari on both phones
6. Rider on phone 1, driver on phone 2

**Note**: GPS requires HTTPS. On HTTP, fallback coordinates are used. Deploy with SSL for production.
