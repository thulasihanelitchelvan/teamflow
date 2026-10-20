# TeamFlow REST API

Base URL in development: `http://localhost:5000/api`. The API returns JSON. Protected routes require the session cookie created by login; in Postman, keep cookies enabled. All authorization checks are performed on the backend.

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/health` | Public | API health check |
| POST | `/auth/register` | Public | Register; requires name, email and password (12–128 characters) |
| POST | `/auth/login` | Public, rate-limited | Start authenticated session |
| GET | `/auth/me` | Authenticated | Current user profile |
| POST | `/auth/logout` | Authenticated | Destroy session and clear cookie |
| GET | `/projects` | Authenticated | Projects owned by or shared with current user |
| POST | `/projects` | Authenticated | Create project (creator becomes owner) |
| GET | `/projects/:projectId` | Project member | Read project and member list |
| PATCH | `/projects/:projectId` | Owner | Update name/description |
| POST | `/projects/:projectId/members` | Owner | Add existing user by email |
| DELETE | `/projects/:projectId/members/:userId` | Owner | Remove member, unassign tasks and revoke access |
| GET | `/projects/:projectId/dashboard` | Project member | Whole-project counts plus ten recent activity entries |
| GET | `/projects/:projectId/activity?limit=50` | Project member | Newest-first project activity (max 100) |
| GET | `/projects/:projectId/tasks` | Project member | Search/filter/sort/paginate tasks |
| POST | `/projects/:projectId/tasks` | Project member | Create task |
| GET | `/tasks/:taskId` | Project member | Task detail and comments |
| PATCH | `/tasks/:taskId` | Project member, rule-based | Update task or status; must send `version` |
| DELETE | `/tasks/:taskId` | Owner or creator | Delete task and record readable activity |
| GET | `/tasks/:taskId/comments` | Project member | Read task comments |
| POST | `/tasks/:taskId/comments` | Project member | Create a comment (`body`, 1–3000 chars) |
| DELETE | `/comments/:commentId` | Author or project owner | Delete comment |

## Task list query parameters

`GET /projects/:projectId/tasks?search=login&status=In%20Progress&priority=High&assignee=me&overdue=true&page=1&limit=10&sortBy=dueDate&order=asc`

Supported `status`: `Backlog`, `To Do`, `In Progress`, `Done`. Supported `priority`: `Low`, `Medium`, `High`, `Critical`. `assignee` may be `all`, `me`, `unassigned`, or a current member's ID. `sortBy` may be `createdAt`, `dueDate`, or `priority`. `order` may be `asc` or `desc`. Pagination limit is capped at 100.

## Task update contract

Every `PATCH /tasks/:taskId` must contain the task `version` last returned by the API. Example:

```json
{
  "version": 3,
  "status": "In Progress"
}
```

A stale version receives `409 Conflict` and `code: "EDIT_CONFLICT"`; reload the task and ask the user to retry. Members can change any task status, but may edit/delete only tasks they created. Only project owners can assign/reassign or edit/delete other users' tasks.

## Common error status codes

- `400`: malformed input, invalid ID, unsupported enum or invalid assignment.
- `401`: no valid authenticated session.
- `403`: authenticated but not permitted.
- `404`: resource not found or project is not accessible to the requester.
- `409`: duplicate email/membership or stale task edit.
- `429`: login rate limit reached.
- `500`: unexpected server error; details are logged server-side only.
