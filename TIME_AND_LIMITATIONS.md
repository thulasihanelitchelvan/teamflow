# Time spent and known limitations

> Candidate: replace this template with your actual time spent and findings before submission. Do not claim hours or tests you did not personally complete.

## Time spent

- Setup and database configuration: `[enter actual time]`
- Backend/API implementation and debugging: `[enter actual time]`
- Frontend and responsive UI: `[enter actual time]`
- Automated/manual testing: `[enter actual time]`
- Documentation/demo: `[enter actual time]`
- **Total:** `[enter actual total]`

## Known limitations to review

- Backend integration tests require a dedicated replica-set MongoDB test database (`MONGODB_TEST_URI`); the tests clear collections in that database.
- Playwright E2E verification requires installing the browser and running against a non-production backend.
- No drag-and-drop Kanban, email invitations, password recovery, or real-time WebSocket updates are included; dropdown status transitions satisfy the brief.
- Deployment, logging/observability, and production rate-limit tuning remain environment-specific.
- Record any issues you discover and how you resolved them before submission.
