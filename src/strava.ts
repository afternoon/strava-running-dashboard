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

export async function exchangeToken(
  code: string,
  clientId: string,
  clientSecret: string
): Promise<TokenData> {
  const res = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error(`Token exchange failed: ${res.status}`);
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
  const res = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refresh,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`Token refresh failed: ${res.status}`);
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

export async function getValidAccessToken(
  sql: SqlStorage,
  clientId: string,
  clientSecret: string
): Promise<string> {
  const row = sql
    .exec("SELECT access_token, refresh_token, expires_at FROM tokens WHERE id = 1")
    .toArray()[0] as { access_token: string; refresh_token: string; expires_at: number } | undefined;

  if (!row) throw new Error("No tokens stored");

  const now = Math.floor(Date.now() / 1000);
  if (row.expires_at > now + 60) {
    return row.access_token;
  }

  const refreshed = await refreshToken(row.refresh_token, clientId, clientSecret);
  sql.exec(
    "UPDATE tokens SET access_token = ?, refresh_token = ?, expires_at = ? WHERE id = 1",
    refreshed.access_token,
    refreshed.refresh_token,
    refreshed.expires_at
  );
  return refreshed.access_token;
}

export async function fetchActivity(
  activityId: number,
  accessToken: string
): Promise<StravaActivity> {
  const res = await fetch(
    `https://www.strava.com/api/v3/activities/${activityId}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) throw new Error(`Fetch activity failed: ${res.status}`);
  return (await res.json()) as StravaActivity;
}

export async function fetchActivitiesAfter(
  afterEpoch: number,
  accessToken: string
): Promise<StravaActivity[]> {
  const all: StravaActivity[] = [];
  let page = 1;
  const perPage = 200;

  while (true) {
    const res = await fetch(
      `https://www.strava.com/api/v3/athlete/activities?after=${afterEpoch}&page=${page}&per_page=${perPage}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!res.ok) throw new Error(`Fetch activities failed: ${res.status}`);
    const batch = (await res.json()) as StravaActivity[];
    all.push(...batch);
    if (batch.length < perPage) break;
    page++;
  }

  return all;
}
