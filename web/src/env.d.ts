// Type declarations for secrets set via `wrangler secret put`.
// These are not included in the auto-generated worker-configuration.d.ts.
interface Env {
  STRAVA_CLIENT_ID: string;
  STRAVA_CLIENT_SECRET: string;
  STRAVA_WEBHOOK_VERIFY_TOKEN: string;
  // Optional: set via `wrangler secret put DASHBOARD_API_KEY` to require
  // Bearer token auth on the GraphQL endpoint (recommended for iOS app use).
  DASHBOARD_API_KEY?: string;
}
