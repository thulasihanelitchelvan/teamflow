# Architecture and integrity notes

## Request path

1. Next.js client UI submits a request to the separate Express REST API using `credentials: include`.
2. Helmet, CORS, JSON parsing and session middleware are applied.
3. Protected routes require a valid MongoDB-backed server session. Project lookups independently verify current membership.
4. Zod validates request payloads; route logic checks owner/member rules and assignment membership.
5. Mongoose reads/writes MongoDB documents. Success/error JSON is returned to the frontend.

## Authentication

Passwords are hashed with bcryptjs (12 rounds in this implementation). Registration validates the request and relies on a unique email index for race-safe duplicate protection. Login is rate limited. Successful login regenerates the session ID to reduce session fixation risk, and the session is stored in MongoDB. The cookie is HTTP-only, SameSite Lax, and Secure in production. Logout destroys the server-side session before clearing the browser cookie. Do not commit environment secrets.

## Authorization

Projects grant access to the owner and current members only. The owner is treated as a member for assigning tasks but isn't duplicated in the `members` array. Owner-only rules are checked server-side. Members can change any status but may edit/delete only tasks they created. Comment authors may delete their own comments; owners can delete any project comment. A removed member loses access and is unassigned from project tasks, but immutable author-name snapshots and activity records preserve history.

## Indexes

- Unique index on user email.
- Project indexes on owner and members.
- Task indexes on project/status/creation date, project/priority/due date, project/priority-rank/creation date, project/status/due date, project/assignee/status, and title text.
- Comment index on task/creation date.
- Activity index on project/creation date.

These support membership lookups, project feeds and common task query patterns. Query plans should be checked against production-like data before increasing scale.

## Concurrency and activity consistency

Each task has a numeric `version`. The UI includes that version in every update. The backend performs an atomic update filtered by `_id`, project, and expected version, then increments the version. If a different request has already updated it, the filter returns no document and the API sends `409 EDIT_CONFLICT`. The UI tells the user to reload instead of silently overwriting.

Task updates and corresponding status/assignment activity rows are stored within a MongoDB transaction. Task creation and task-created activity also share a transaction. Member removal, assignment clearing and removal activity run in one transaction. This requires a replica-set/transaction-capable MongoDB deployment, such as Atlas. The server only returns success after the transaction succeeds.

## Frontend state

Search, filters, sort, direction and page are serialized in URL query parameters. Task reads use server-side query options. Dashboard counts are separate database queries and do not derive from the currently paginated task list. UI mutations refetch project data after successful changes. Reduced-motion preferences are respected by CSS.
