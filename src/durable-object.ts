import { DurableObject } from "cloudflare:workers";
import {
  exchangeToken,
  fetchActivitiesAfter,
  fetchActivity,
  getValidAccessToken,
} from "./strava";
import { renderConnectPage, renderDashboard } from "./dashboard";

interface WebhookEvent {
  object_type: string;
  object_id: number;
  aspect_type: string;
  owner_id: number;
  updates?: Record<string, unknown>;
}

export class RunningDashboard extends DurableObject<Env> {
  private sql: SqlStorage;

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
  }

  private hasToken(): boolean {
    const row = this.sql.exec("SELECT id FROM tokens WHERE id = 1").toArray();
    return row.length > 0;
  }

  async getDashboardHtml(): Promise<string> {
    if (!this.hasToken()) {
      return renderConnectPage();
    }

    const activities = this.sql
      .exec("SELECT distance_meters, start_date FROM activities ORDER BY start_date ASC")
      .toArray() as { distance_meters: number; start_date: string }[];

    return renderDashboard(activities);
  }

  async handleOAuthCallback(code: string): Promise<Response> {
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

    return Response.redirect("/", 302);
  }

  async handleWebhookEvent(event: WebhookEvent): Promise<void> {
    if (event.object_type !== "activity") return;

    const activityId = event.object_id;

    if (event.aspect_type === "delete") {
      this.sql.exec("DELETE FROM activities WHERE strava_id = ?", activityId);
      return;
    }

    // create or update
    const accessToken = await getValidAccessToken(
      this.sql,
      this.env.STRAVA_CLIENT_ID,
      this.env.STRAVA_CLIENT_SECRET
    );

    const activity = await fetchActivity(activityId, accessToken);

    if (activity.type !== "Run") {
      // If type changed away from Run, remove existing row if any
      this.sql.exec("DELETE FROM activities WHERE strava_id = ?", activityId);
      return;
    }

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

  async handleSync(): Promise<number> {
    const accessToken = await getValidAccessToken(
      this.sql,
      this.env.STRAVA_CLIENT_ID,
      this.env.STRAVA_CLIENT_SECRET
    );

    const threeYearsAgo = Math.floor(Date.now() / 1000) - 3 * 365 * 24 * 60 * 60;
    const activities = await fetchActivitiesAfter(threeYearsAgo, accessToken);
    const runs = activities.filter((a) => a.type === "Run");

    for (const activity of runs) {
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

    return runs.length;
  }
}
