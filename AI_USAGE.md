# AI Usage Disclosure

This project was developed with assistance from ChatGPT (OpenAI). AI assistance was used to help plan the application architecture, draft TypeScript/React components and Express/Mongoose routes, create seed data and test scaffolding, improve UI styling, and draft project documentation.

## How the output was reviewed

- Source files were inspected after generation rather than treating generated code as inherently correct.
- TypeScript source was checked with `tsc --noEmit` in the preparation environment.
- API integration test cases were drafted for authentication/logout, team isolation, role permissions, task validation, query composition, optimistic concurrency/activity consistency, and member removal.
- An end-to-end browser test was added for registering a user, creating a project and creating a visible task.
- MongoDB-backed tests still need to be run against a dedicated transaction-capable test database, and browser automation must be run after Playwright and its browser are installed.
- The app should be manually checked using both owner and member accounts before submission. Actual test results should be recorded here after the candidate runs them locally.

## One choice reviewed / rejected

Drag-and-drop Kanban was not implemented because the assignment explicitly states dropdown status changes are sufficient. The implementation prioritizes backend authorization, server-side query composition, optimistic concurrency, atomic task/activity writes, and automated verification over an optional interaction.

## Candidate verification declaration

Before submitting, replace/update this section with the exact AI tools used, the tests personally run, any generated suggestions rejected or corrected, and the reason for those decisions. Do not include private prompts, API keys, credentials, or other confidential information.
