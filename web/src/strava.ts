export interface TokenData {
  athlete_id: number;
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

export interface StravaActivity {
  id: number;
  name: string;
  distance: number;
  moving_time: number;
  start_date: string;
  type: string;
}

/**
 * A non-2xx response from Strava, with the status kept so callers can tell a
 * dead grant (the user has to reconnect) from a blip worth retrying.
 */
export class StravaApiError extends Error {
  readonly status: number;
  readonly body: string;

  constructor(what: string, status: number, body: string) {
    super(`${what} failed: ${status} ${body}`);
    this.name = "StravaApiError";
    this.status = status;
    this.body = body;
  }

  /** The grant is gone — deauthorised, or the refresh token was superseded. */
  get isAuthFailure(): boolean {
    return this.status === 400 || this.status === 401;
  }

  get isNotFound(): boolean {
    return this.status === 404;
  }

  /**
   * Strava deactivates an API application when the account that owns it has
   * no active Strava subscription, and then answers every data endpoint with
   * this 403 while OAuth and token refresh keep working normally. That
   * combination reads as a token problem and is not one, so it is worth
   * naming rather than showing the raw response.
   */
  get isApplicationInactive(): boolean {
    if (this.status !== 403) return false;
    try {
      const parsed = JSON.parse(this.body) as {
        errors?: { resource?: string; code?: string }[];
      };
      return (parsed.errors ?? []).some(
        (e) => e.resource === "Application" && e.code === "Inactive"
      );
    } catch {
      return false;
    }
  }
}

export const APPLICATION_INACTIVE_MESSAGE =
  "Your Strava API application is inactive, so Strava is refusing every data " +
  "request even though signing in still works. The account that owns the " +
  "application needs an active Strava subscription; reactivate the app at " +
  "https://www.strava.com/settings/api.";

/** The message to show a human for a failure that came back from Strava. */
export function describeError(err: unknown): string {
  if (err instanceof StravaApiError && err.isApplicationInactive) {
    return APPLICATION_INACTIVE_MESSAGE;
  }
  return err instanceof Error ? err.message : String(err);
}

async function stravaFetch(what: string, url: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(url, init);
  if (!res.ok) throw new StravaApiError(what, res.status, await res.text());
  return res;
}

export async function exchangeToken(
  code: string,
  clientId: string,
  clientSecret: string
): Promise<TokenData> {
  const res = await stravaFetch("Token exchange", "https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
    }),
  });
  const data = (await res.json()) as {
    athlete: { id: number };
    access_token: string;
    refresh_token: string;
    expires_at: number;
  };
  return {
    athlete_id: data.athlete.id,
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: data.expires_at,
  };
}

export async function refreshToken(
  refresh: string,
  clientId: string,
  clientSecret: string
): Promise<TokenData> {
  const res = await stravaFetch("Token refresh", "https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refresh,
      grant_type: "refresh_token",
    }),
  });
  const data = (await res.json()) as {
    access_token: string;
    refresh_token: string;
    expires_at: number;
  };
  return {
    athlete_id: 0, // not returned on refresh
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: data.expires_at,
  };
}

export async function fetchActivity(
  activityId: number,
  accessToken: string
): Promise<StravaActivity> {
  const res = await stravaFetch(
    "Fetch activity",
    `https://www.strava.com/api/v3/activities/${activityId}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  return (await res.json()) as StravaActivity;
}

export interface WebhookSubscription {
  id: number;
  callback_url: string;
  created_at: string;
  updated_at: string;
}

export async function listWebhookSubscriptions(
  clientId: string,
  clientSecret: string
): Promise<WebhookSubscription[]> {
  const url = new URL("https://www.strava.com/api/v3/push_subscriptions");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("client_secret", clientSecret);
  const res = await stravaFetch("List webhook subscriptions", url.toString());
  return (await res.json()) as WebhookSubscription[];
}

export async function createWebhookSubscription(
  clientId: string,
  clientSecret: string,
  callbackUrl: string,
  verifyToken: string
): Promise<WebhookSubscription> {
  const res = await stravaFetch(
    "Create webhook subscription",
    "https://www.strava.com/api/v3/push_subscriptions",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        callback_url: callbackUrl,
        verify_token: verifyToken,
      }),
    }
  );
  return (await res.json()) as WebhookSubscription;
}

export async function deleteWebhookSubscription(
  id: number,
  clientId: string,
  clientSecret: string
): Promise<void> {
  const url = new URL(`https://www.strava.com/api/v3/push_subscriptions/${id}`);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("client_secret", clientSecret);
  await stravaFetch("Delete webhook subscription", url.toString(), { method: "DELETE" });
}

// Strava caps per_page at 200. The page cap is a backstop: without it a bug in
// Strava's paging (or an unexpected response shape) would spin forever and
// burn the worker's subrequest budget.
const PER_PAGE = 200;
const MAX_PAGES = 30;

export async function fetchActivitiesAfter(
  afterEpoch: number,
  accessToken: string
): Promise<StravaActivity[]> {
  const all: StravaActivity[] = [];

  for (let page = 1; page <= MAX_PAGES; page++) {
    const res = await stravaFetch(
      "Fetch activities",
      `https://www.strava.com/api/v3/athlete/activities?after=${afterEpoch}&page=${page}&per_page=${PER_PAGE}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const batch = (await res.json()) as StravaActivity[];
    all.push(...batch);
    if (batch.length < PER_PAGE) break;
  }

  return all;
}
