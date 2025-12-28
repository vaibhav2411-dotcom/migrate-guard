# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Tooling and Commands

### Install dependencies

This project is a Vite + React + TypeScript SPA managed with npm (both `package-lock.json` and `bun.lockb` are present).

```sh
npm install
# or, with Bun
bun install
```

### Run the development server

Vite is configured to run on port `8080` and bind to all interfaces (host `::`).

```sh
npm run dev
# or
bun run dev
```

The app will be available at `http://localhost:8080`.

### Build and preview

Production build:

```sh
npm run build
```

Development-mode build (uses Vite's `--mode development`):

```sh
npm run build:dev
```

Static preview of the latest build:

```sh
npm run preview
```

### Linting

ESLint is configured via `eslint.config.js` (flat config) with TypeScript support and React hooks/refresh rules:

```sh
npm run lint
```

### Testing

There is currently no test script configured in `package.json`. If you add a test runner (for example Vitest, Jest, or Playwright), prefer to wire it through npm scripts (e.g. `test`, `test:unit`, `test:e2e`) so tools can run the full suite or a single test by passing the appropriate pattern/CLI flags to those scripts.

### Lovable integration and deployment

This repo is linked to a Lovable project (see `README.md`). You can:

- Edit the app directly in Lovable at `https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID`; changes will be committed back to this repo.
- Develop locally in your IDE and push to the remote; Lovable will ingest those changes.
- Deploy via the Lovable UI using **Share → Publish** instead of a CLI-based deploy from this repo.

## Architecture Overview

### Tech stack and configuration

- **Frontend:** React 18 + TypeScript, single-page application.
- **Routing:** `react-router-dom` with nested routes under a shared layout.
- **State management:** `zustand` via a single global store (`useAppStore`).
- **Styling/UI:** Tailwind CSS + shadcn-style UI primitives in `src/components/ui`, with additional dashboard components in `src/components/dashboard`.
- **Async data:** `@tanstack/react-query` is wired up but the current data is in-memory only (no backend).
- **Build tooling:** Vite (`vite.config.ts`) with `@vitejs/plugin-react-swc`, alias `@` → `src`, and the `lovable-tagger` plugin in development.

Tailwind (`tailwind.config.ts`) scans `./src/**/*.{ts,tsx}` and defines a token-based design system (semantic `primary`, `secondary`, `warning`, `success`, `chart`, `sidebar` color groups) with `darkMode: ['class']`.

### Entry point and routing

- `src/main.tsx` is the browser entry point. It mounts the React app into `index.html`'s `#root` element and applies global styles from `src/index.css`.
- `src/App.tsx` sets up cross-cutting providers and the router:
  - Wraps the app in a `QueryClientProvider` from `@tanstack/react-query`.
  - Registers the global toast systems from `@/components/ui/toaster` and `@/components/ui/sonner`.
  - Configures `BrowserRouter`/`Routes`/`Route` from `react-router-dom`.
  - Nests all main routes under a shared `AppLayout` so pages share navigation and shell UI.

Route map (top-level):

- `/` → `HomePage` (dashboard overview)
- `/projects` → `ProjectsPage`
- `/tests` → `TestCasesPage`
- `/urls` → `URLInventoryPage`
- `/data` → `DataValidationPage`
- `/reports` → `ReportsPage`
- `/settings` → `SettingsPage`
- `*` → `NotFound`

When adding new pages, register them here and render them inside `AppLayout` to inherit layout and navigation.

### Layout and navigation shell

- `src/components/layout/AppLayout.tsx`
  - Consumes global UI state from the Zustand store (`useAppStore`).
  - Renders `AppSidebar` next to a main content area whose left margin animates between expanded and collapsed widths using `framer-motion`.
  - Provides a sticky top bar with search, notifications, and current-user summary.
  - Uses `Outlet` from `react-router-dom` to render page components.

- `src/components/layout/AppSidebar.tsx`
  - Also reads from `useAppStore` to toggle `sidebarOpen`.
  - Uses `framer-motion` to animate width between a compact icon rail and full sidebar.
  - Defines primary nav items (Dashboard, Projects, Test Cases, URL Inventory, Data Validation, Reports) and secondary nav (Settings).
  - Relies on the `cn` helper from `src/lib/utils.ts` and shared Tailwind classes to keep nav styling consistent.

### Domain model and global store

The app models migration QA concepts and keeps all domain data in a single global store.

- `src/lib/types.ts`
  - Core types and enums: `Project`, `TestCase`, `URLRecord`, `DataCheck`, `Report`, `Activity`, `DashboardKPIs`, plus `ProjectStatus`, `TestStatus`, `TestCategory`, `Priority`, `URLTestStatus`, `UserRole`.
  - These types are shared by pages and components to enforce a consistent data shape.

- `src/lib/store.ts`
  - Exposes `useAppStore` (a Zustand store) that holds demo in-memory data sets (`demoProjects`, `demoTestCases`, `demoURLRecords`, `demoActivities`, `currentUser`). There is no persistence or backend wiring yet.
  - State slices:
    - Data: `projects`, `testCases`, `urlRecords`, `activities`, `currentUser`.
    - UI: `sidebarOpen`, `selectedProjectId`.
  - Computed selectors:
    - `getKPIs()` → aggregates `DashboardKPIs` for the main dashboard.
    - `getProjectById(id)`, `getTestCasesByProject(projectId)`, `getURLRecordsByProject(projectId)` → filtered views over the collections.
  - Actions:
    - `setSidebarOpen(open)` / `setSelectedProjectId(id)` for UI state.
    - `addProject`, `updateProject`, `deleteProject` for project lifecycle; `deleteProject` cascades to related tests and URL records.
    - `addTestCase`, `updateTestCase`, `deleteTestCase` for managing test cases.
  - New entities are timestamped with `new Date().toISOString()` and identified via `Date.now().toString()`.

When extending the domain, prefer to:

- Add new entity types or fields in `src/lib/types.ts`.
- Extend `useAppStore` with corresponding state, selectors, and actions.
- Have components read/write data exclusively through `useAppStore` rather than duplicating global state locally.

### Feature pages

Pages live under `src/pages/` and represent major feature areas. They all:

- Pull data and actions from `useAppStore`.
- Compose shadcn-style primitives from `src/components/ui`.
- Use `framer-motion` for subtle entrance/transition animations.

Key pages:

- `HomePage.tsx`
  - Uses `getKPIs()` for high-level metrics.
  - Renders KPI cards and visualizations via `KPICard`, `ProjectsOverview`, `TestStatusChart`, and `RecentActivity` in `src/components/dashboard/`.

- `ProjectsPage.tsx`
  - Surfaces `projects` from the store and `addProject` / `deleteProject` actions.
  - Provides search, a dialog-driven flow for creating new projects, and animated project cards with status badges, progress bars, and test counts.
  - Navigates to per-project routes with `useNavigate` (detail routes are not yet implemented but URLs like `/projects/:id` are used).

- `TestCasesPage.tsx`
  - Displays all `testCases` with filters by status and category, plus a search field.
  - Uses enums from `src/lib/types.ts` to drive status/category/priority styling.
  - Allows inline deletion via `deleteTestCase`; editing is stubbed via menu options.

- `URLInventoryPage.tsx`
  - Lists `urlRecords` with filters by project and test status.
  - Visualizes performance/SEO/accessibility scores with compact progress bars (`ScoreBar` component) and error counts.

- `DataValidationPage.tsx`
  - Currently uses local `demoDataChecks` (not the global store) to show how table-level source vs target comparisons would look.
  - Summarizes matched/issue tables and renders a validation table using shared table and badge components.

- `ReportsPage.tsx`
  - Operates on in-file `demoReports` to represent different report types (executive, go-live, detailed, summary).
  - Provides a grid of report type cards and a list of generated reports with download actions.

- `SettingsPage.tsx`
  - Reads `currentUser` from the store.
  - Groups settings into profile, notifications, appearance, and security sections, using shadcn primitives and Tailwind for layout.

### UI primitives, hooks, and styling

- `src/components/ui/`
  - Shared, mostly stateless primitives (buttons, inputs, dialogs, dropdown menus, tables, charts, sidebar, etc.) following shadcn-ui patterns.
  - Extensively Tailwind-based and intended to be reused across pages.

- `src/components/dashboard/`
  - Dashboard-specific visualization components like `KPICard`, `ProjectsOverview`, `RecentActivity`, `TestStatusChart` that sit above the primitive layer.

- `src/hooks/`
  - Custom hooks such as `use-mobile` and `use-toast` encapsulate responsive behavior and toast logic.

Global styles live in `src/index.css` and `src/App.css`, which define Tailwind layers, layout utilities, and shared animations (e.g. `animate-fade-in`).

### Tooling considerations

- `vite.config.ts` sets port/host, the `@` alias, and Lovable's `componentTagger` plugin (used by Lovable to map components during AI editing). Keep this plugin enabled in development unless you intentionally decouple from Lovable.
- `eslint.config.js` uses `@eslint/js` + `typescript-eslint` + `eslint-plugin-react-hooks` + `eslint-plugin-react-refresh` across `**/*.{ts,tsx}`. Prefer updating this config rather than introducing parallel ESLint setups.
- When changing Vite, ESLint, Tailwind, or React Query configuration, make incremental changes and ensure `@` imports and Lovable tooling continue to resolve correctly.
