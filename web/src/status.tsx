import type { StatusData } from "./durable-object";
import type { WebhookSubscription } from "./strava";

export interface WebhookStatus {
  subscriptions: WebhookSubscription[];
  expectedCallbackUrl: string;
  /** Null when Strava itself could not be reached. */
  error: string | null;
}

function Shell(props: { title: string; children?: unknown }) {
  return (
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>{props.title}</title>
        <link rel="stylesheet" href="/styles.css" />
      </head>
      <body class="status">
        <div class="status-page">
          <h1>{props.title}</h1>
          {props.children}
        </div>
      </body>
    </html>
  );
}

function ago(iso: string | null): string {
  if (!iso) return "never";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;
  const minutes = Math.round((Date.now() - then) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} days ago`;
}

function Row(props: { label: string; value: string; bad?: boolean }) {
  return (
    <tr>
      <td class="status-label">{props.label}</td>
      <td class={props.bad ? "status-value bad" : "status-value"}>{props.value}</td>
    </tr>
  );
}

/**
 * The repair page. Everything needed to tell why the dashboard stopped
 * updating — and a button for each thing that can fix it — in one place.
 */
export function StatusPage(props: { status: StatusData; webhook: WebhookStatus }) {
  const { status, webhook } = props;
  const now = Math.floor(Date.now() / 1000);

  const matching = webhook.subscriptions.filter(
    (s) => s.callback_url === webhook.expectedCallbackUrl
  );
  const stale = webhook.subscriptions.filter(
    (s) => s.callback_url !== webhook.expectedCallbackUrl
  );

  let webhookLine: string;
  let webhookBad = true;
  if (webhook.error) {
    webhookLine = `could not check — ${webhook.error}`;
  } else if (matching.length > 0) {
    webhookLine = `registered (id ${matching[0].id})`;
    webhookBad = false;
  } else if (stale.length > 0) {
    webhookLine = `points somewhere else — ${stale[0].callback_url}`;
  } else {
    webhookLine = "not registered";
  }

  return (
    <Shell title="Dashboard status">
      <table class="status-table">
        <Row
          label="Strava connection"
          value={status.connected ? "connected" : "not connected"}
          bad={!status.connected}
        />
        {status.tokenError ? (
          <Row label="Token error" value={status.tokenError} bad={true} />
        ) : null}
        <Row
          label="Access token"
          value={
            status.tokenExpiresAt === null
              ? "none"
              : status.tokenExpiresAt > now
                ? `valid for ${Math.round((status.tokenExpiresAt - now) / 60)} min`
                : "expired (refreshes on next use)"
          }
        />
        <Row label="Webhook" value={webhookLine} bad={webhookBad} />
        <Row label="Runs stored" value={String(status.activityCount)} />
        <Row
          label="Latest run"
          value={
            status.latestRun
              ? `${new Date(status.latestRun.startDate).toLocaleDateString("en-GB")} — ` +
                `${(status.latestRun.distanceMeters / 1000).toFixed(1)} km`
              : "none"
          }
        />
        <Row label="Last webhook event" value={ago(status.lastWebhookAt)} />
        {status.lastWebhookError ? (
          <Row label="Webhook error" value={status.lastWebhookError} bad={true} />
        ) : null}
        <Row label="Last sync" value={ago(status.lastSyncAt)} />
        {status.lastSyncSummary ? (
          <Row label="Last sync result" value={status.lastSyncSummary} />
        ) : null}
        {status.lastSyncError ? (
          <Row label="Sync error" value={status.lastSyncError} bad={true} />
        ) : null}
      </table>

      <div class="status-actions">
        <a class="btn" href="/webhook/register">
          Repair webhook
        </a>
        <a class="btn" href="/sync?days=30">
          Sync last 30 days
        </a>
        <a class="btn" href="/sync">
          Sync all activities
        </a>
        <a class="btn" href="/auth">
          Reconnect Strava
        </a>
      </div>
      <p class="status-note">
        Opening the dashboard re-checks Strava when the local copy is more than half an
        hour old, so a missed webhook catches up on its own — these buttons are for when
        you don't want to wait.
      </p>
      <p class="status-note">
        <a href="/">Back to dashboard</a>
      </p>
    </Shell>
  );
}

export function ResultPage(props: {
  title: string;
  message: string;
  detail?: string;
  ok: boolean;
}) {
  return (
    <Shell title={props.title}>
      <p class={props.ok ? "status-result" : "status-result bad"}>{props.message}</p>
      {props.detail ? <pre class="status-detail">{props.detail}</pre> : null}
      <p class="status-note">
        <a href="/status">Status</a> · <a href="/">Back to dashboard</a>
      </p>
    </Shell>
  );
}
