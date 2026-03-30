# 🚀 DevOps Platform - Frontend

Next.js 15 + TypeScript + Tailwind CSS frontend for the DevOps Platform.

## 🎯 Architecture

The frontend is organized by **Sprints**, each in a separate branch:

```
main (stable production)
  ↓
develop (integration branch)
  ├─ sprint/1-auth (Authentication)
  ├─ sprint/2-dashboard (Dashboard)
  ├─ sprint/3-projects (Projects Management)
  ├─ sprint/4-deployments (Deployments)
  └─ sprint/5-websocket (Real-time Logs)
```

## 📁 Project Structure

```
src/
├── app/              # Next.js App Router
│   ├── (auth)/       # Auth pages (login)
│   └── (app)/        # App pages (protected)
├── components/       # Reusable components
├── hooks/            # Custom React hooks
├── lib/              # Utilities (API client, auth)
├── types/            # TypeScript types
└── styles/           # Global styles (Tailwind)
```

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- npm or yarn

### Installation

```bash
cd frontend
npm install
```

### Environment Variables

Copy `.env.example` to `.env.local`:

```bash
cp .env.example .env.local
```

Update the API URL if needed:

```env
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_WS_URL=http://localhost:3001
```

### Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Build

```bash
npm run build
npm start
```

## 📊 Sprints

### Sprint 1: Authentication & Login
- Login page with email/password form
- JWT storage in localStorage
- Protected routes
- User logout

**Branch:** `sprint/1-auth`

### Sprint 2: Dashboard & Navigation
- Dashboard homepage
- Navigation menu/sidebar
- User profile page
- Stats display

**Branch:** `sprint/2-dashboard`

### Sprint 3: Projects Management
- List projects
- Create/edit/delete projects
- Members management
- GitLab integration

**Branch:** `sprint/3-projects`

### Sprint 4: Deployments
- Servers management (ADMIN)
- Environments configuration
- Config variables (with secrets)
- Deployments list & detail

**Branch:** `sprint/4-deployments`

### Sprint 5: WebSocket & Real-time Logs
- WebSocket connection
- Real-time deployment logs
- Live status updates
- Terminal-like log display

**Branch:** `sprint/5-websocket`

## 🛠️ Tech Stack

- **Framework:** Next.js 15
- **Language:** TypeScript
- **Styling:** Tailwind CSS
- **HTTP Client:** Axios
- **Real-time:** Socket.io
- **State Management:** React Context API

## 🔐 Authentication

The frontend uses JWT authentication:

1. User logs in at `/login`
2. Backend returns JWT token
3. Token stored in localStorage
4. API client automatically includes token in requests
5. Protected routes redirect to `/login` if no token

## 🌐 API Integration

The frontend communicates with the backend API:

```typescript
// Example API call
import apiClient from '@/lib/api';

const response = await apiClient.get('/projects');
const data = response.data;
```

The API client automatically:
- Includes JWT in Authorization header
- Handles 401 errors (expired tokens)
- Sends proper Content-Type headers

## 📝 Contributing

1. Create a branch from `develop`
2. Work on your sprint
3. Push to origin
4. Create a Pull Request to `develop`
5. After review, merge to `develop`
6. Periodically merge `develop` to `main`

## 🐛 Common Issues

### Port 3000 already in use
```bash
npm run dev -- -p 3001
```

### API not responding
Check that backend is running:
```bash
cd ../backend
npm run docker:up
# or
npm run start:dev
```

### Token lost after refresh
Token is automatically restored from localStorage on app load.

## 📚 Resources

- [Next.js Documentation](https://nextjs.org/docs)
- [Tailwind CSS](https://tailwindcss.com)
- [Socket.io Client](https://socket.io/docs/v4/client-api/)
- [Backend API Docs](../backend/README.md)

---

**Last Updated:** March 30, 2026  
**Version:** 1.0.0
