# TeamFlow 5–8 minute demo recording guide

Record this only after running the project against your configured demo/test database. Do not claim a test passes unless you run it during preparation.

1. **0:00–0:40 — Intro and architecture.** State the stack: Next.js App Router + TypeScript, separate Express REST API, Mongoose and MongoDB. Trace one browser request through API validation and database.
2. **0:40–1:25 — Authentication.** Register/log in, refresh the page, show the session persists, log out, and demonstrate `/api/auth/me` returns 401 after logout.
3. **1:25–2:25 — Projects and permissions.** Show the two seeded projects with different memberships. Log in as an owner to add/remove a user; explain that removal revokes access and clears assignments. Try the same action as a member and show it is denied.
4. **2:25–3:45 — Task workflow.** Create/edit a task, change status, switch Kanban/list view, search, combine filters, change sort order, navigate pages and show a due date.
5. **3:45–4:35 — Collaboration/dashboard.** Add a comment, show activity history, and explain total/status/overdue/assigned-to-current-user dashboard metrics.
6. **4:35–5:35 — Data integrity.** Demonstrate a stale version update receiving HTTP 409. Explain transactions keep task changes and activity records consistent.
7. **5:35–6:35 — Tests.** Run the backend integration suite against the isolated test database and run the Playwright task creation test. Briefly name the eight required test areas.
8. **6:35–7:15 — Wrap-up.** Explain indexes, known trade-offs, what you personally verified, and the next improvement. Keep within 5–8 minutes.

Use the actual final runtime and test results. Replace this outline with your own narrated recording; the recording itself is not included in this source archive.
