# SlotWise frontend

React + TypeScript + Vite, Material UI, MobX and React Router. The UI follows the [SlotWise mockups](https://www.figma.com/design/NYF2zUH2ryRp0hMK6K72T7) and [project documentation](https://github.com/vk-ab-schedule/slotwise-doc).

## Local start

Requires Node.js 22 or newer. From this repository:

```sh
npm ci
npm run dev
```

Open the URL printed by Vite (normally `http://localhost:5173`). By default, the frontend uses local mock data so screens can be reviewed without a backend. Demo accounts: `student@example.test`, `teacher@example.test`, `organizer@example.test`, `admin@example.test`; any nonempty password works. The header's role selector is available only in mock mode.

The **42 экрана** link opens a catalog of all Figma states. These screens use illustrative data and route-to-route transitions. **Моя занятость** is interactive: week/day navigation, personal intervals with three priorities, editing and deleting, read-only university timetable, saving, and submitting even an empty answer. Mock data persists in browser local storage. Use the browser's local-storage inspector to reset `slotwise-demo-calendar-v1` to the initial example.

To use the real backend, create `.env.local` with `VITE_MOCK_API=false`, start `slotwise-back` on port 8080 and restart Vite. The Vite proxy sends `/api` to the backend. The login flow first requests `/api/auth/me` to obtain the CSRF cookie, then posts credentials. Axios includes the latest `XSRF-TOKEN` cookie as `X-XSRF-TOKEN` on mutations. Production should serve the app and `/api` under the same origin.

The availability API uses `GET` and `PUT /api/sessions/{id}/busy-intervals/me` and `POST .../me/submit`. Set `VITE_SESSION_ID` in `.env.local` for the backend session to display (default `1`). The UI sends the latest opaque `revision` as `expectedRevision`; a stale revision requires reloading. The backend owns normalization and validation in real mode. Session discovery and production date range are pending the session API integration from F4; the demo calendar shows the 15–26 June 2026 period from the mockups.

## API types

With the backend running on port 8080, run `npm run api:generate` to regenerate the
OpenAPI snapshot and TypeScript types from `/v3/api-docs`. The generator also accepts
a JSON file produced by `./gradlew :app:exportOpenApi` in the backend:

```sh
npm run api:generate -- ../slotwise-back/app/build/openapi/slotwise.json
npm run api:check -- openapi/slotwise.json
```

Commit the regenerated snapshot and declarations together. Auth and availability
use these declarations in their API calls.

## Checks

```sh
npm run lint
npm test
npm run build
```

`src/theme.ts` holds the colors and MUI component defaults from Figma. `src/auth` owns the current user, `src/api` owns HTTP, and screen components are grouped by feature. Static SVGs from Figma are committed in `src/assets`.

Feature branches start from `sprint/2` and target it with PRs; the sprint branch is released to `main` through a separate release PR. See `slotwise-doc/DEVELOPMENT.md`.
