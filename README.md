# Team Task Manager (Full-Stack)

Full-stack task manager with role-based access control (Admin/Member), project management, task tracking, and dashboard stats.

## Stack

- Frontend: React + Vite + Tailwind CSS
- Backend: Express.js
- Database: JSON NoSQL via LowDB
- Auth: JWT + bcrypt password hashing

## Features

- Signup/Login with roles (admin/member)
- Project creation and listing
- Task creation, assignment, and status updates
- Dashboard counters (total, completed, in-progress, overdue)
- Team members with role badges
- RBAC enforcement on backend routes

## Demo Credentials

- Admin: `admin@taskflow.com` / `admin123`
- Member: `member@taskflow.com` / `member123`

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create env file:

```bash
cp .env.example .env
```

3. Run frontend + backend together:

```bash
npm run dev
```

4. Build frontend:

```bash
npm run build
```

## API

- Base URL: `http://localhost:4000`
- Health: `GET /api/health`
- Auth: `POST /api/auth/signup`, `POST /api/auth/login`
- Data: `/api/dashboard`, `/api/users`, `/api/projects`, `/api/tasks`
