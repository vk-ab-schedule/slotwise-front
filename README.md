# SlotWise frontend

React + TypeScript + Vite, Material UI, MobX and React Router. The UI follows the [SlotWise mockups](https://www.figma.com/design/NYF2zUH2ryRp0hMK6K72T7) and [project documentation](https://github.com/vk-ab-schedule/slotwise-doc).

## Local start

Requires Node.js 22 or newer. From this repository:

```sh
npm ci
npm run dev
```

Open the URL printed by Vite (normally `http://localhost:5173`). By default, the frontend uses local mock data so screens can be reviewed without a backend. Demo accounts: `student@example.test`, `teacher@example.test`, `organizer@example.test`, `admin@example.test`; any nonempty password works. The header's role selector is available only in mock mode.

To use the real backend, create `.env.local` with `VITE_MOCK_API=false`, start `slotwise-back` on port 8080 and restart Vite. The Vite proxy sends `/api` to the backend. The login flow first requests `/api/auth/me` to obtain the CSRF cookie, then posts credentials. Axios includes the latest `XSRF-TOKEN` cookie as `X-XSRF-TOKEN` on mutations. Production should serve the app and `/api` under the same origin.

## Checks

```sh
npm run lint
npm run build
```

`src/theme.ts` holds the colors and MUI component defaults from Figma. `src/auth` owns the current user, `src/api` owns HTTP, and screen components are grouped by feature. Static SVGs from Figma are committed in `src/assets`.

Feature branches start from `sprint/2` and target it with PRs; the sprint branch is released to `main` through a separate release PR. See `slotwise-doc/DEVELOPMENT.md`.
