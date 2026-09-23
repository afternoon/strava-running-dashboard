import { Hono } from "hono";
import { FULL_SYNC_DAYS, RunningDashboard } from "./durable-object";
import { ConnectPage, Dashboard } from "./dashboard";
import { ResultPage, StatusPage } from "./status";
import type { WebhookStatus } from "./status";
import {
  createWebhookSubscription,
  deleteWebhookSubscription,
  describeError,
  listWebhookSubscriptions,
} from "./strava";
import { handleGraphQL } from "./graphql";

type AppEnv = { Bindings: Env };

const app = new Hono<AppEnv>();

function getStub(c: { env: Env }): DurableObjectStub<RunningDashboard> {
  const id = c.env.RUNNING_DASHBOARD.idFromName("dashboard");
  return c.env.RUNNING_DASHBOARD.get(id);
}

// The dashboard is rendered from whatever the durable object holds right now,
// so it must never be served from a cache — an iOS home-screen web app would
// otherwise redisplay (and re-fetch) a stale copy when it is reopened.
const NO_STORE = { "Cache-Control": "no-store" };

function callbackUrl(requestUrl: string): string {
  return new URL("/webhook", requestUrl).toString();
}

// Hono's default handler answers with a bare "Internal Server Error", which is
// exactly what made this hard to diagnose: /sync failing on a dead Strava
// token looked identical to the worker being broken. Show the reason.
app.onError((err, c) => {
  console.error("request failed", c.req.method, c.req.path, err);
  if (c.req.path === "/graphql") {
    return c.json({ errors: [{ message: describeError(err) }] }, 500);
  }
  return c.html(
    <ResultPage
      title="Something went wrong"
      message={`${c.req.method} ${c.req.path} failed.`}
      detail={describeError(err)}
      ok={false}
    />,
    500,
    NO_STORE
  );
});

app.get("/", async (c) => {
  const stub = getStub(c);
  const data = await stub.getDashboardData();
  if (!data.connected) {
    return c.html(<ConnectPage />, 200, NO_STORE);
  }
  // Heal a missed webhook event in the background. This page still renders
  // from the copy we already have — the point is that the next load is right,
  // rather than the dashboard sitting stale until someone investigates.
  c.executionCtx.waitUntil(stub.reconcileIfStale());
  return c.html(<Dashboard activities={data.activities} />, 200, NO_STORE);
});

app.get("/webhook", (c) => {
  const mode = c.req.query("hub.mode");
  const token = c.req.query("hub.verify_token");
  const challenge = c.req.query("hub.challenge");

  if (mode === "subscribe" && token === c.env.STRAVA_WEBHOOK_VERIFY_TOKEN) {
    return c.json({ "hub.challenge": challenge });
  }
  return c.text("Forbidden", 403);
});

app.post("/webhook", async (c) => {
  const body = await c.req.json();
  const stub = getStub(c);
  // Strava drops the delivery if we take longer than two seconds, so the work
  // happens after the response. handleWebhookEvent swallows and records its
  // own failures; anything it misses is picked up by the next reconcile.
  c.executionCtx.waitUntil(stub.handleWebhookEvent(body));
  return c.text("OK", 200);
});

/**
 * Register — or repair — the Strava webhook subscription.
 *
 * Answers GET as well as POST so it can be opened in a browser, which is how
 * you actually reach for it. Strava allows one subscription per application,
 * so a subscription left pointing at an old callback URL silently blocks a new
 * one; those are deleted and replaced rather than reported as "already done".
 */
app.all("/webhook/register", async (c) => {
  if (c.req.method !== "GET" && c.req.method !== "POST") {
    return c.text("Method not allowed", 405);
  }

  const expected = callbackUrl(c.req.url);
  const force = c.req.query("force") === "1";
  const existing = await listWebhookSubscriptions(
    c.env.STRAVA_CLIENT_ID,
    c.env.STRAVA_CLIENT_SECRET
  );

  const good = existing.find((s) => s.callback_url === expected);
  if (good && !force) {
    return c.html(
      <ResultPage
        title="Webhook"
        message={`Already registered (id ${good.id}) for ${expected}.`}
        detail={`Created ${good.created_at}. Add ?force=1 to delete and re-create it.`}
        ok={true}
      />,
      200,
      NO_STORE
    );
  }

  const removed: number[] = [];
  for (const sub of existing) {
    await deleteWebhookSubscription(
      sub.id,
      c.env.STRAVA_CLIENT_ID,
      c.env.STRAVA_CLIENT_SECRET
    );
    removed.push(sub.id);
  }

  const subscription = await createWebhookSubscription(
    c.env.STRAVA_CLIENT_ID,
    c.env.STRAVA_CLIENT_SECRET,
    expected,
    c.env.STRAVA_WEBHOOK_VERIFY_TOKEN
  );

  const detail = removed.length
    ? `Replaced stale subscription(s): ${removed.join(", ")}.`
    : undefined;
  return c.html(
    <ResultPage
      title="Webhook"
      message={`Registered (id ${subscription.id}) for ${expected}.`}
      detail={detail}
      ok={true}
    />,
    200,
    NO_STORE
  );
});

/** One page showing why updates might have stopped, and the buttons to fix it. */
app.get("/status", async (c) => {
  const stub = getStub(c);
  const status = await stub.getStatus();

  const webhook: WebhookStatus = {
    subscriptions: [],
    expectedCallbackUrl: callbackUrl(c.req.url),
    error: null,
  };
  try {
    webhook.subscriptions = await listWebhookSubscriptions(
      c.env.STRAVA_CLIENT_ID,
      c.env.STRAVA_CLIENT_SECRET
    );
  } catch (err) {
    webhook.error = describeError(err);
  }

  return c.html(<StatusPage status={status} webhook={webhook} />, 200, NO_STORE);
});

app.get("/auth", (c) => {
  const redirectUri = new URL("/auth/callback", c.req.url).toString();
  const url = new URL("https://www.strava.com/oauth/authorize");
  url.searchParams.set("client_id", c.env.STRAVA_CLIENT_ID);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", "read,activity:read_all");
  url.searchParams.set("approval_prompt", "auto");
  return c.redirect(url.toString());
});

app.get("/auth/callback", async (c) => {
  const code = c.req.query("code");
  if (!code) return c.text("Missing code", 400);
  const stub = getStub(c);
  await stub.handleOAuthCallback(code);
  return c.redirect("/");
});

app.get("/sync", async (c) => {
  const stub = getStub(c);
  const daysParam = c.req.query("days");

  if (daysParam !== undefined) {
    const days = Number(daysParam);
    if (!Number.isFinite(days) || days <= 0) {
      return c.text("days must be a positive number", 400);
    }
    const window = Math.min(Math.round(days), FULL_SYNC_DAYS);
    const result = await stub.handleSyncDays(window);
    return c.html(
      <ResultPage
        title="Sync"
        message={`Synced ${result.added} runs from the last ${window} days.`}
        detail={`${result.scanned} activities checked, ${result.removed} stale rows removed.`}
        ok={true}
      />,
      200,
      NO_STORE
    );
  }

  const count = await stub.handleSync();
  return c.html(
    <ResultPage title="Sync" message={`Synced ${count} runs.`} ok={true} />,
    200,
    NO_STORE
  );
});

// GraphQL API — used by the iOS app (and any other clients).
// Set DASHBOARD_API_KEY secret to require Bearer token authentication.
app.all("/graphql", async (c) => {
  const stub = getStub(c);
  const response = await handleGraphQL(c.req.raw, stub, c.env.DASHBOARD_API_KEY);
  // The iOS app and widget poll this, so they keep the same backstop running
  // even when the web dashboard goes unopened for days.
  c.executionCtx.waitUntil(stub.reconcileIfStale());
  return response;
});

export { RunningDashboard };

export default app;
