# TeamFlow — Team Project Management Platform

TeamFlow is a full-stack project and task management platform built for the Qtechy Full Stack Developer Intern assignment. The frontend is Next.js App Router + TypeScript. The frontend communicates with a separate Express + TypeScript REST API. MongoDB and Mongoose store application data.

## Features

- Registration, login, logout, current-user profile, bcrypt password hashing, server-side validation, MongoDB-backed sessions, HTTP-only cookies, session expiry, and login rate limiting.
- Projects with an owner and registered members; owner-only project settings and membership management.
- Task create/read/update/delete, Kanban and table views, title search, combined filters, server-side pagination, sorting by creation date/due date/priority, optional assignee and due date, and URL-persisted task query state.
- Server-enforced owner/member permissions and project access checks.
- Comments with author/timestamp snapshots and comment deletion authorization.
- Server-generated activity feed for task creation/deletion, status/assignment changes, and member additions/removals.
- Dashboard task totals, status counts, overdue count, tasks assigned to the current user, and the ten latest activity records.
- Optimistic task versioning; stale edits return HTTP 409 instead of silently overwriting newer changes.
- Transactions keep related task/activity and member-removal/unassignment writes consistent. Use a MongoDB replica set/Atlas deployment for transaction support.
- Responsive UI, animated transitions, reduced-motion support, loading states, confirmations, and inline feedback.

## Requirements

- Node.js 20+ recommended (Node.js 22 LTS works)
- npm
- MongoDB Atlas or a local MongoDB replica set (transactions are required for the integrity guarantees)
- Git
- Optional: Postman, MongoDB Compass, Playwright browsers for E2E testing

## Repository layout

```text
teamflow/
├── backend/
│   ├── src/
│   │   ├── config/           # MongoDB connection
│   │   ├── middleware/       # Authentication, authorization helpers, error handling
│   │   ├── models/           # User, Project, Task, Comment, Activity
│   │   ├── routes/           # REST API routes
│   │   ├── scripts/          # Development seed data
│   │   ├── types/            # Express session typing
│   │   ├── utils/            # Activity write helper
│   │   ├── app.ts
│   │   └── server.ts
│   ├── tests/                # API integration tests
│   └── vitest.config.ts
└── frontend/
    ├── app/                  # Next.js App Router UI
    ├── tests/e2e/             # Playwright flow test
    └── playwright.config.ts
```

## 1. Configure environment variables

### Backend

```bash
cd backend
cp .env.example .env
```

On Windows PowerShell, use `Copy-Item .env.example .env` instead of `cp` if desired.

Edit `backend/.env`:

```dotenv
PORT=5000
NODE_ENV=development
CLIENT_URL=http://localhost:3000
MONGODB_URI=<your-teamflow-development-mongodb-uri>
SESSION_SECRET=<a-random-secret-at-least-32-characters>
SESSION_COOKIE_NAME=teamflow.sid
```

Generate a secret locally with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Never commit `.env`. Never use your production database URI as `MONGODB_TEST_URI`. The seed script creates demo accounts and is meant for a development database only.

### Frontend

```bash
cd frontend
cp .env.example .env.local
```

`frontend/.env.local` should contain:

```dotenv
NEXT_PUBLIC_API_URL=http://localhost:5000/api
```

## 2. Install dependencies

From the repository root:

```bash
cd backend
npm install
cd ../frontend
npm install
```

Run `npm install` (rather than `npm ci`) if npm needs to synchronize a lockfile after dependency changes.

## 3. Seed the demo data

Start in `backend/` with the development `.env` configured:

```bash
npm run seed
```

The idempotent seed script provisions four demo users, two projects with different membership sets, and at least 30 tasks distributed across all statuses and priorities. It leaves a project's existing task set intact on repeat runs.

Demo accounts (same password for all four seeded accounts):

| Name | Email | Password |
|---|---|---|
| Morgan Lee | `morgan@teamflow.demo` | `TeamFlowDemo123!` |
| Avery Chen | `avery@teamflow.demo` | `TeamFlowDemo123!` |
| Jordan Kim | `jordan@teamflow.demo` | `TeamFlowDemo123!` |
| Riley Patel | `riley@teamflow.demo` | `TeamFlowDemo123!` |

These are development demo credentials, not production credentials. Change/remove them before exposing a deployed instance.

## 4. Run the app locally

Open two terminals.

**Terminal 1 — backend:**

```bash
cd backend
npm run dev
```

Expected log lines include `MongoDB connected successfully` and `TeamFlow API running at http://localhost:5000`.

Health check: <http://localhost:5000/api/health>

**Terminal 2 — frontend:**

```bash
cd frontend
npm run dev
```

Open <http://localhost:3000>.

## 5. Build and lint

```bash
cd backend
npm run build
cd ../frontend
npm run lint
npm run build
```

## 6. Automated tests

### Backend integration tests

Tests require a **dedicated test database** on a MongoDB replica set. For example, configure the environment before invoking Vitest:

PowerShell:

```powershell
$env:MONGODB_TEST_URI="mongodb+srv://<test-user>:<password>@<test-cluster>/teamflow_test?retryWrites=true&w=majority"
cd backend
npm test
```

Bash:

```bash
export MONGODB_TEST_URI='mongodb+srv://<test-user>:<password>@<test-cluster>/teamflow_test?retryWrites=true&w=majority'
cd backend
npm test
```

The setup intentionally fails if `MONGODB_TEST_URI` is missing, reducing the risk of running destructive test cleanup against the development database. The tests clear collections in that database. Use a test-only database and user.

Integration tests cover authentication/logout, cross-team access, owner/member permission differences, task validation and assignment restrictions, combined server-side search/filter/sort/pagination, concurrent stale task edits and activity consistency, plus member removal, assignment clearing and comment/history retention.

### Frontend end-to-end test

Start a test backend connected to a test-only database and start the frontend. Install Playwright and its browser once:

```bash
cd frontend
npx playwright install chromium
npm run test:e2e
```

The end-to-end flow registers a test user, creates a project, creates a task, and asserts that the task appears in the board. Run this against a non-production backend.

## Authentication and cookie notes

The API uses a MongoDB-backed Express session. The session ID is issued in an HTTP-only cookie; logout destroys the server-side session and clears the cookie. Cookies are `secure` in production, and same-site settings plus a request-origin check reduce cross-origin form abuse. Deploy behind HTTPS and configure the frontend `CLIENT_URL` exactly. If deploying across different sites, review cookie `SameSite`/CSRF strategy before making changes.

## Permissions at a glance

- Only project owners and current members can access project data.
- Both roles can create tasks/comments and update any task's status.
- Members may edit/delete tasks they created; owners may edit/delete any task in their project.
- Only owners can assign/reassign tasks and manage members/project settings.
- Assignments are restricted to current project members.
- The owner cannot be removed. Removing another member clears their task assignments and access but preserves comments/activity history.
- Comment authors may delete their own comments; project owners may delete any comment in their project.

## Query, dates, and conflicts

Task listing is performed server-side. Supported query parameters are `search`, `status`, `priority`, `assignee` (`me`, `unassigned`, a member ID, or `all`), `overdue=true`, `page`, `limit`, `sortBy` (`createdAt`, `dueDate`, `priority`), and `order` (`asc`, `desc`). The UI reflects these in URL query parameters.

Due dates are treated as calendar dates ending at `23:59:59.999 UTC` for comparison and are rendered using UTC calendar dates to avoid a browser timezone shifting the displayed day. A task is overdue when its due date is before the current timestamp and its status is not `Done`.

Each task includes a monotonically increasing `version`. A patch must submit the version the user last read. An atomic `findOneAndUpdate` filter checks that version and increments it on success; if it no longer matches, the API responds with HTTP 409 (`EDIT_CONFLICT`). Task update and activity writes use a MongoDB transaction so a failed update cannot create a successful status/assignment activity. Member removal, assignment clearing and member-removal activity are also transactional.

## Indexes

- Unique `users.email` index prevents duplicate accounts.
- `projects.owner` and `projects.members` indexes support accessible project lists.
- Task indexes support project/status/creation date, project/priority/due date, project/priority-rank/creation date, project/status/due date, project/assignee/status, and title text search. Exact `$regex` search is still used for predictable case-insensitive prefix/substring search; the text index is retained for future full-text use.
- Comment indexes support task-thread retrieval.
- Activity indexes support newest-first per-project feeds.

## Known limitations and trade-offs

- No email invitation, email verification, password recovery, social login, or real-time transport; these are outside the mandatory brief or optional enhancements.
- The UI uses status dropdowns rather than drag-and-drop, which the brief explicitly permits.
- Sessions are shared through MongoDB; production deployments should tune session TTL, security headers, monitoring, backups and rate limiting based on deployment scale.
- Automated integration tests require a MongoDB replica set and have not been run against your private Atlas URI in this build environment.
- Record actual hours spent and any additional limitations discovered during your own review before submitting.

## Assignment submission extras

- `docs/API.md`: REST API reference.
- `docs/ARCHITECTURE.md`: architecture, authorization, indexes, consistency and conflict handling.
- `postman/TeamFlow.postman_collection.json`: importable request templates.
- `AI_USAGE.md`: AI usage and verification notes.
- Record your actual time and any remaining limitations in `TIME_AND_LIMITATIONS.md`.
- Record a 5–8 minute walkthrough video showing the flows, tests, conflicts and limitations before submission.
