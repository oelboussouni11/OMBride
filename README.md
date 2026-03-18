# OMBdrive

Ride-hailing and delivery app for the Morocco market.

## Architecture

```
apps/
├── mobile/          # React Native (Expo) — rider/driver app
├── admin/           # Next.js admin dashboard
└── api/             # FastAPI backend
packages/
└── shared/          # Shared TypeScript types & constants
```

### Tech Stack

- **Mobile**: React Native + Expo (Expo Router)
- **Admin**: Next.js 15 (App Router, TypeScript, Tailwind CSS, shadcn/ui)
- **Backend**: FastAPI (Python), SQLAlchemy 2.0, Alembic
- **Database**: PostgreSQL + PostGIS
- **Cache**: Redis (driver locations, sessions)
- **Real-time**: WebSockets via FastAPI
- **Maps**: Mapbox (mobile + admin)
- **Navigation**: Waze deep link (driver turn-by-turn)
- **Push Notifications**: Firebase Cloud Messaging

## Getting Started

### Prerequisites

- Node.js 20+
- Python 3.12+
- Docker & Docker Compose
- Expo CLI (`npm install -g expo-cli`)

### 1. Start Infrastructure

```bash
docker-compose up -d
```

This starts PostgreSQL (port 5432) and Redis (port 6379).

### 2. Backend (FastAPI)

```bash
cd apps/api
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Copy and configure environment
cp .env.example .env
# Edit .env with your values

# Run migrations
alembic upgrade head

# Start server
uvicorn main:app --reload --port 8000
```

API docs available at http://localhost:8000/docs

### 3. Admin Dashboard (Next.js)

```bash
cd apps/admin
npm install
npm run dev
```

Open http://localhost:3000

### 4. Mobile App (Expo)

```bash
cd apps/mobile
npm install
npx expo start
```

Scan the QR code with Expo Go or run on a simulator.

## Environment Variables

See `apps/api/.env.example` for all required backend environment variables.

## Database

- PostgreSQL with PostGIS extension for geospatial queries
- Alembic for schema migrations
- Redis for real-time driver location tracking

## Key Features

- **Riders**: Request rides, track driver, fare estimates
- **Drivers**: Accept rides, credit system (1 DH per ride), Waze navigation
- **Admin**: Driver verification, fare config, ride monitoring, credit management
- **Real-time**: WebSocket-based location tracking and ride updates
