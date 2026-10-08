# Application guidance

- `web` is a React + Vite client. Keep slider/calculator interactions client-side once recipe data is loaded.
- `api` is a thin TypeScript Lambda/API Gateway adapter. Validate boundary data with shared Zod schemas.
- Keep handlers small and route into testable application functions.
- Auction API reads must use normalized prices refreshed ahead of time; never call an external price provider in the user request path.
- Keep ingestion and scheduled pricing work in dedicated packages/runtimes rather than the request path.
- Preserve the application-first visual hierarchy; do not turn the calculator into a generic dashboard.
