import { Hono } from "hono";
import { RunningDashboard } from "./durable-object";
import { ConnectPage, Dashboard } from "./dashboard";
import { getWebhookSubscription, createWebhookSubscription } from "./strava";

type AppEnv = { Bindings: Env };

const app = new Hono<AppEnv>();

function getStub(c: { env: Env }): DurableObjectStub<RunningDashboard> {
  const id = c.env.RUNNING_DASHBOARD.idFromName("dashboard");
  return c.env.RUNNING_DASHBOARD.get(id);
}

app.get("/", async (c) => {
  const stub = getStub(c);
  const data = await stub.getDashboardData();
  if (!data.connected) {
    return c.html(<ConnectPage />);
  }
  return c.html(<Dashboard activities={data.activities} />);
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
  c.executionCtx.waitUntil(stub.handleWebhookEvent(body));
  return c.text("OK", 200);
});

app.post("/webhook/register", async (c) => {
  const existing = await getWebhookSubscription(
    c.env.STRAVA_CLIENT_ID,
    c.env.STRAVA_CLIENT_SECRET
  );
  if (existing) {
    return c.json({ status: "already_registered", subscription: existing });
  }
  const callbackUrl = new URL("/webhook", c.req.url).toString();
  const subscription = await createWebhookSubscription(
    c.env.STRAVA_CLIENT_ID,
    c.env.STRAVA_CLIENT_SECRET,
    callbackUrl,
    c.env.STRAVA_WEBHOOK_VERIFY_TOKEN
  );
  return c.json({ status: "registered", subscription });
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
  const count = await stub.handleSync();
  return c.html(`<p>Synced ${count} runs. <a href="/">Back to dashboard</a></p>`);
});

export { RunningDashboard };
export default app;
