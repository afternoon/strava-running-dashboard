import type { RunningDashboard } from "./durable-object";
import { GOAL_KM } from "./constants";

function dayOfYear(date: Date): number {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = date.getTime() - start.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

function daysInYear(year: number): number {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 366 : 365;
}

interface DataPoint {
  dayOfYear: number;
  cumulativeKm: number;
}

interface YearData {
  year: number;
  points: DataPoint[];
}

interface Metrics {
  distanceThisYear: number;
  targetByToday: number;
  delta: number;
  lastSevenDays: number;
}

interface DashboardPayload {
  goal: number;
  metrics: Metrics;
  chartData: YearData[];
}

async function resolveDashboard(
  stub: DurableObjectStub<RunningDashboard>
): Promise<DashboardPayload> {
  const data = await stub.getDashboardData();
  if (!data.connected) throw new Error("Not connected to Strava");

  const { activities } = data;
  const now = new Date();
  const currentYear = now.getFullYear();

  const thisYear = activities.filter(
    (a) => new Date(a.start_date).getFullYear() === currentYear
  );
  const distanceThisYear = thisYear.reduce(
    (sum, a) => sum + a.distance_meters / 1000,
    0
  );
  const doy = dayOfYear(now);
  const targetByToday = (GOAL_KM * doy) / daysInYear(currentYear);
  const delta = distanceThisYear - targetByToday;
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const lastSevenDays = thisYear
    .filter((a) => new Date(a.start_date) >= weekAgo)
    .reduce((sum, a) => sum + a.distance_meters / 1000, 0);

  const years = [currentYear, currentYear - 1, currentYear - 2];
  const chartData: YearData[] = years.map((year) => {
    const sorted = activities
      .filter((a) => new Date(a.start_date).getFullYear() === year)
      .sort(
        (a, b) =>
          new Date(a.start_date).getTime() - new Date(b.start_date).getTime()
      );
    const points: DataPoint[] = [{ dayOfYear: 0, cumulativeKm: 0 }];
    let cum = 0;
    for (const a of sorted) {
      cum += a.distance_meters / 1000;
      points.push({ dayOfYear: dayOfYear(new Date(a.start_date)), cumulativeKm: cum });
    }
    return { year, points };
  });

  return {
    goal: GOAL_KM,
    metrics: { distanceThisYear, targetByToday, delta, lastSevenDays },
    chartData,
  };
}

// Introspection schema string returned for __schema queries.
const SCHEMA_SDL = `
type Query {
  authStatus: AuthStatus!
  dashboard: DashboardData!
}
type AuthStatus {
  isConnected: Boolean!
}
type DashboardData {
  goal: Float!
  metrics: Metrics!
  chartData: [YearData!]!
}
type Metrics {
  distanceThisYear: Float!
  targetByToday: Float!
  delta: Float!
  lastSevenDays: Float!
}
type YearData {
  year: Int!
  points: [DataPoint!]!
}
type DataPoint {
  dayOfYear: Int!
  cumulativeKm: Float!
}
`.trim();

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
} as const;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

export async function handleGraphQL(
  request: Request,
  stub: DurableObjectStub<RunningDashboard>,
  apiKey?: string
): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  // GET /graphql?query=... is useful for tooling; we also support it.
  let query: string;
  let variables: Record<string, unknown> | undefined;

  if (request.method === "GET") {
    const url = new URL(request.url);
    query = url.searchParams.get("query") ?? "";
  } else if (request.method === "POST") {
    let body: { query?: string; variables?: Record<string, unknown> };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return jsonResponse({ errors: [{ message: "Invalid JSON body" }] }, 400);
    }
    query = body.query ?? "";
    variables = body.variables;
  } else {
    return jsonResponse({ errors: [{ message: "Method not allowed" }] }, 405);
  }

  // Auth check — only enforced when DASHBOARD_API_KEY is configured.
  if (apiKey) {
    const auth = request.headers.get("Authorization") ?? "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (token !== apiKey) {
      return jsonResponse({ errors: [{ message: "Unauthorized" }] }, 401);
    }
  }

  // Return SDL for simple introspection (Apollo sandbox, etc.)
  if (query.trim() === "" || query.includes("__schema")) {
    return jsonResponse({ data: { __schema: { sdl: SCHEMA_SDL } } });
  }

  const data: Record<string, unknown> = {};
  const errors: { message: string }[] = [];

  try {
    if (query.includes("authStatus")) {
      const dashData = await stub.getDashboardData();
      data.authStatus = { isConnected: dashData.connected };
    }

    if (query.includes("dashboard")) {
      data.dashboard = await resolveDashboard(stub);
    }
  } catch (err) {
    errors.push({ message: err instanceof Error ? err.message : "Unknown error" });
  }

  if (errors.length > 0) {
    return jsonResponse({ errors }, 200);
  }
  return jsonResponse({ data });
}
