import { DurableObject } from "cloudflare:workers";
import {
  StravaApiError,
  exchangeToken,
  fetchActivitiesAfter,
  fetchActivity,
  refreshToken,
} from "./strava";
import type { StravaActivity } from "./strava";
import type { DashboardData } from "./dashboard";

interface WebhookEvent {
  object_type: string;
  object_id: number;
  aspect_type: string;
  owner_id: number;
  updates?: Record<string, unknown>;
}

export interface SyncResult {
  added: number;
  removed: number;
  scanned: number;
}

export interface StatusData {
  connected: boolean;
  athleteId: number | null;
  tokenExpiresAt: number | null;
  activityCount: number;
  latestRun: { name: string; startDate: string; distanceMeters: number } | null;
  lastSyncAt: string | null;
  lastSyncSummary: string | null;
  lastSyncError: string | null;
  lastWebhookAt: string | null;
  lastWebhookError: string | null;
  tokenError: string | null;
}

const DAY_SECONDS = 24 * 60 * 60;

// How far back a reconcile looks. Wide enough that a run uploaded while the
// webhook was broken is still picked up days later, narrow enough to stay one
// Strava page.
export const RECONCILE_DAYS = 14;

// How far back "sync all" reaches; the dashboard only charts three years.
export const FULL_SYNC_DAYS = 3 * 365;

// Above this many stored runs missing from a Strava response, assume the
// response is wrong rather than history. See syncSince.
const MAX_PRUNE_CANDIDATES = 25;

export class RunningDashboard extends DurableObject<Env> {
  private sql: SqlStorage;

  // Strava invalidates a refresh token as soon as it hands out its
  // replacement, so two refreshes racing each other can leave us storing the
  // loser's token — which is already dead. Every caller shares one refresh.
  private refreshInFlight: Promise<string> | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;

    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS activities (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        strava_id INTEGER UNIQUE,
        name TEXT,
        distance_meters REAL,
        moving_time_seconds INTEGER,
        start_date TEXT,
        type TEXT
      )
    `);

    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS tokens (
        id INTEGER PRIMARY KEY CHECK(id = 1),
        athlete_id INTEGER,
        access_token TEXT,
        refresh_token TEXT,
        expires_at INTEGER
      )
    `);

    // Diagnostics: when the last sync and webhook ran, and why they failed.
    // Without this a silent breakage only shows up as a dashboard that has
    // quietly stopped moving.
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS meta (
        key TEXT PRIMARY KEY,
        value TEXT
      )
    `);
  }

  private getMeta(key: string): string | null {
    const row = this.sql
      .exec("SELECT value FROM meta WHERE key = ?", key)
      .toArray()[0] as { value: string } | undefined;
    return row?.value ?? null;
  }

  private setMeta(key: string, value: string | null): void {
    if (value === null) {
      this.sql.exec("DELETE FROM meta WHERE key = ?", key);
      return;
    }
    this.sql.exec(
      `INSERT INTO meta (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      key,
      value
    );
  }

  private hasToken(): boolean {
    const row = this.sql.exec("SELECT id FROM tokens WHERE id = 1").toArray();
    return row.length > 0;
  }

  /**
   * A valid access token, refreshing it if needed. Callers get a clear message
   * when the grant is dead, because that means reconnecting — no amount of
   * retrying will fix it.
   */
  private async getAccessToken(): Promise<string> {
    const row = this.sql
      .exec("SELECT access_token, refresh_token, expires_at FROM tokens WHERE id = 1")
      .toArray()[0] as
      | { access_token: string; refresh_token: string; expires_at: number }
      | undefined;

    if (!row) throw new Error("Strava is not connected — visit /auth to connect.");

    const now = Math.floor(Date.now() / 1000);
    if (row.expires_at > now + 60) return row.access_token;

    if (!this.refreshInFlight) {
      this.refreshInFlight = this.doRefresh(row.refresh_token).finally(() => {
        this.refreshInFlight = null;
      });
    }
    return this.refreshInFlight;
  }

  private async doRefresh(refresh: string): Promise<string> {
    try {
      const refreshed = await refreshToken(
        refresh,
        this.env.STRAVA_CLIENT_ID,
        this.env.STRAVA_CLIENT_SECRET
      );
      this.sql.exec(
        "UPDATE tokens SET access_token = ?, refresh_token = ?, expires_at = ? WHERE id = 1",
        refreshed.access_token,
        refreshed.refresh_token,
        refreshed.expires_at
      );
      this.setMeta("token_error", null);
      return refreshed.access_token;
    } catch (err) {
      if (err instanceof StravaApiError && err.isAuthFailure) {
        this.setMeta("token_error", err.message);
        throw new Error(
          `Strava rejected the stored refresh token (${err.status}). ` +
            `Reconnect at /auth to restore access. Details: ${err.body}`
        );
      }
      throw err;
    }
  }

  async getDashboardData(): Promise<DashboardData> {
    if (!this.hasToken()) {
      return { connected: false };
    }

    const activities = this.sql
      .exec("SELECT distance_meters, start_date FROM activities ORDER BY start_date ASC")
      .toArray() as { distance_meters: number; start_date: string }[];

    return { connected: true, activities };
  }

  async getStatus(): Promise<StatusData> {
    const token = this.sql
      .exec("SELECT athlete_id, expires_at FROM tokens WHERE id = 1")
      .toArray()[0] as { athlete_id: number; expires_at: number } | undefined;

    const count = this.sql
      .exec("SELECT COUNT(*) AS n FROM activities")
      .toArray()[0] as { n: number };

    const latest = this.sql
      .exec(
        "SELECT name, start_date, distance_meters FROM activities ORDER BY start_date DESC LIMIT 1"
      )
      .toArray()[0] as
      | { name: string; start_date: string; distance_meters: number }
      | undefined;

    return {
      connected: !!token,
      athleteId: token?.athlete_id ?? null,
      tokenExpiresAt: token?.expires_at ?? null,
      activityCount: Number(count.n),
      latestRun: latest
        ? {
            name: latest.name,
            startDate: latest.start_date,
            distanceMeters: latest.distance_meters,
          }
        : null,
      lastSyncAt: this.getMeta("last_sync_at"),
      lastSyncSummary: this.getMeta("last_sync_summary"),
      lastSyncError: this.getMeta("last_sync_error"),
      lastWebhookAt: this.getMeta("last_webhook_at"),
      lastWebhookError: this.getMeta("last_webhook_error"),
      tokenError: this.getMeta("token_error"),
    };
  }

  async handleOAuthCallback(code: string): Promise<void> {
    const token = await exchangeToken(
      code,
      this.env.STRAVA_CLIENT_ID,
      this.env.STRAVA_CLIENT_SECRET
    );

    this.sql.exec(
      `INSERT INTO tokens (id, athlete_id, access_token, refresh_token, expires_at)
       VALUES (1, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         athlete_id = excluded.athlete_id,
         access_token = excluded.access_token,
         refresh_token = excluded.refresh_token,
         expires_at = excluded.expires_at`,
      token.athlete_id,
      token.access_token,
      token.refresh_token,
      token.expires_at
    );

    this.setMeta("token_error", null);
  }

  private upsertActivity(activity: StravaActivity): void {
    this.sql.exec(
      `INSERT INTO activities (strava_id, name, distance_meters, moving_time_seconds, start_date, type)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(strava_id) DO UPDATE SET
         name = excluded.name,
         distance_meters = excluded.distance_meters,
         moving_time_seconds = excluded.moving_time_seconds,
         start_date = excluded.start_date,
         type = excluded.type`,
      activity.id,
      activity.name,
      activity.distance,
      activity.moving_time,
      activity.start_date,
      activity.type
    );
  }

  /**
   * Apply one webhook event. Kept separate from handleWebhookEvent so that
   * failures are recorded rather than vanishing into a dropped waitUntil.
   */
  private async applyWebhookEvent(event: WebhookEvent): Promise<void> {
    if (event.object_type !== "activity") return;

    const activityId = event.object_id;

    if (event.aspect_type === "delete") {
      this.sql.exec("DELETE FROM activities WHERE strava_id = ?", activityId);
      return;
    }

    const accessToken = await this.getAccessToken();

    let activity: StravaActivity;
    try {
      activity = await fetchActivity(activityId, accessToken);
    } catch (err) {
      // Deleted between the event and this fetch — nothing to store, and
      // treating it as an error would mask real failures. Only a 404 counts:
      // a 403 means we lost read access, not that the run is gone.
      if (err instanceof StravaApiError && err.isNotFound) {
        this.sql.exec("DELETE FROM activities WHERE strava_id = ?", activityId);
        return;
      }
      throw err;
    }

    if (activity.type !== "Run") {
      // If type changed away from Run, remove existing row if any
      this.sql.exec("DELETE FROM activities WHERE strava_id = ?", activityId);
      return;
    }

    this.upsertActivity(activity);
  }

  async handleWebhookEvent(event: WebhookEvent): Promise<void> {
    this.setMeta("last_webhook_at", new Date().toISOString());
    try {
      await this.applyWebhookEvent(event);
      this.setMeta("last_webhook_error", null);
    } catch (err) {
      // Strava does not usefully retry, and this runs in a waitUntil where a
      // throw would be invisible. Record it and let the scheduled reconcile
      // pick the activity up instead.
      const message = err instanceof Error ? err.message : String(err);
      console.error("webhook event failed", message);
      this.setMeta("last_webhook_error", message);
    }
  }

  /**
   * Pull everything Strava has since `afterEpoch` and make our copy match it.
   *
   * Rows in the window that Strava no longer lists are checked one by one
   * before being dropped: a missing activity is only deleted once Strava
   * answers 404 for it. If a suspicious number of rows go missing at once —
   * the shape of a downgraded scope rather than a few deleted runs — nothing
   * is pruned at all, because wrongly deleting history is far worse than
   * carrying a stale row until the next sync.
   */
  private async syncSince(afterEpoch: number): Promise<SyncResult> {
    const accessToken = await this.getAccessToken();
    const activities = await fetchActivitiesAfter(afterEpoch, accessToken);
    const runs = activities.filter((a) => a.type === "Run");

    for (const activity of runs) {
      this.upsertActivity(activity);
    }

    const seen = new Set(runs.map((r) => r.id));
    const windowStart = new Date(afterEpoch * 1000).toISOString();
    const stored = this.sql
      .exec("SELECT strava_id FROM activities WHERE start_date >= ?", windowStart)
      .toArray() as { strava_id: number }[];

    const missing = stored.filter((row) => !seen.has(row.strava_id));
    let removed = 0;

    if (missing.length <= MAX_PRUNE_CANDIDATES) {
      for (const row of missing) {
        try {
          const activity = await fetchActivity(row.strava_id, accessToken);
          if (activity.type !== "Run") {
            this.sql.exec("DELETE FROM activities WHERE strava_id = ?", row.strava_id);
            removed++;
          }
        } catch (err) {
          if (err instanceof StravaApiError && err.isNotFound) {
            this.sql.exec("DELETE FROM activities WHERE strava_id = ?", row.strava_id);
            removed++;
            continue;
          }
          throw err;
        }
      }
    } else {
      console.warn(
        `skipping prune: ${missing.length} stored runs absent from Strava's response`
      );
    }

    return { added: runs.length, removed, scanned: activities.length };
  }

  private async runSync(days: number, label: string): Promise<SyncResult> {
    const after = Math.floor(Date.now() / 1000) - days * DAY_SECONDS;
    try {
      const result = await this.syncSince(after);
      this.setMeta("last_sync_at", new Date().toISOString());
      this.setMeta(
        "last_sync_summary",
        `${label}: ${result.added} runs up to date, ${result.removed} removed`
      );
      this.setMeta("last_sync_error", null);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.setMeta("last_sync_error", `${label}: ${message}`);
      this.setMeta("last_sync_at", new Date().toISOString());
      throw err;
    }
  }

  /** Full three-year backfill — what the "Sync all activities" link runs. */
  async handleSync(): Promise<number> {
    const result = await this.runSync(FULL_SYNC_DAYS, "full sync");
    return result.added;
  }

  async handleSyncDays(days: number): Promise<SyncResult> {
    return this.runSync(days, `${days}-day sync`);
  }

  /**
   * The safety net behind the webhook: re-pull the recent window on a
   * schedule so a dropped, failed or unsubscribed webhook event self-heals
   * without anyone noticing the dashboard had gone stale.
   */
  async reconcile(): Promise<SyncResult | null> {
    if (!this.hasToken()) return null;
    return this.runSync(RECONCILE_DAYS, "scheduled reconcile");
  }
}
