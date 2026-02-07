interface Activity {
  distance_meters: number;
  start_date: string;
}

interface YearData {
  year: number;
  points: { day: number; cumKm: number }[];
}

function dayOfYear(date: Date): number {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = date.getTime() - start.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

function daysInYear(year: number): number {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 366 : 365;
}

function buildYearData(activities: Activity[], year: number): YearData {
  const yearActivities = activities
    .filter((a) => new Date(a.start_date).getFullYear() === year)
    .sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime());

  const points: { day: number; cumKm: number }[] = [{ day: 0, cumKm: 0 }];
  let cumKm = 0;
  for (const a of yearActivities) {
    cumKm += a.distance_meters / 1000;
    points.push({ day: dayOfYear(new Date(a.start_date)), cumKm });
  }
  return { year, points };
}

function renderChart(currentYear: number, yearsData: YearData[], goal: number): string {
  const W = 800;
  const H = 400;
  const pad = { top: 30, right: 30, bottom: 40, left: 60 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;

  const maxCum = Math.max(goal, ...yearsData.flatMap((y) => y.points.map((p) => p.cumKm)));
  const yMax = Math.ceil(maxCum / 100) * 100;
  const xMax = 365;

  const x = (day: number) => pad.left + (day / xMax) * plotW;
  const y = (km: number) => pad.top + plotH - (km / yMax) * plotH;

  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const monthDays = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334, 365];

  // Grid lines
  let grid = "";
  const yTicks = 5;
  for (let i = 0; i <= yTicks; i++) {
    const val = (yMax / yTicks) * i;
    const yPos = y(val);
    grid += `<line x1="${pad.left}" y1="${yPos}" x2="${W - pad.right}" y2="${yPos}" stroke="#e0e0e0" stroke-width="1"/>`;
    grid += `<text x="${pad.left - 8}" y="${yPos + 4}" text-anchor="end" font-size="11" fill="#666">${Math.round(val)}</text>`;
  }

  // X-axis month labels
  let xLabels = "";
  for (let i = 0; i < 12; i++) {
    const mid = (monthDays[i] + monthDays[i + 1]) / 2;
    xLabels += `<text x="${x(mid)}" y="${H - 8}" text-anchor="middle" font-size="11" fill="#666">${months[i]}</text>`;
  }

  // Goal line
  const goalLine = `<line x1="${x(0)}" y1="${y(0)}" x2="${x(365)}" y2="${y(goal)}" stroke="#999" stroke-width="1.5" stroke-dasharray="6,4"/>`;

  // Year lines
  const colors: Record<number, { color: string; width: number; opacity: number }> = {};
  const sortedYears = yearsData.map((yd) => yd.year).sort();
  for (const yr of sortedYears) {
    if (yr === currentYear) {
      colors[yr] = { color: "#FC4C02", width: 2.5, opacity: 1 };
    } else if (yr === currentYear - 1) {
      colors[yr] = { color: "#1a73e8", width: 1.5, opacity: 0.7 };
    } else {
      colors[yr] = { color: "#34a853", width: 1.5, opacity: 0.7 };
    }
  }

  let lines = "";
  for (const yd of yearsData) {
    if (yd.points.length < 2) continue;
    const c = colors[yd.year] ?? { color: "#888", width: 1, opacity: 0.5 };
    const d = yd.points.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.day).toFixed(1)},${y(p.cumKm).toFixed(1)}`).join(" ");
    lines += `<path d="${d}" fill="none" stroke="${c.color}" stroke-width="${c.width}" opacity="${c.opacity}"/>`;
  }

  // Legend
  const legendItems = [
    { label: `${currentYear}`, color: "#FC4C02", dash: "" },
    ...sortedYears
      .filter((yr) => yr !== currentYear)
      .reverse()
      .map((yr) => ({
        label: `${yr}`,
        color: colors[yr]?.color ?? "#888",
        dash: "",
      })),
    { label: "Goal (1100km)", color: "#999", dash: "6,4" },
  ];

  let legend = "";
  const lx = W - pad.right - 120;
  let ly = pad.top + 10;
  for (const item of legendItems) {
    legend += `<line x1="${lx}" y1="${ly}" x2="${lx + 20}" y2="${ly}" stroke="${item.color}" stroke-width="2" ${item.dash ? `stroke-dasharray="${item.dash}"` : ""}/>`;
    legend += `<text x="${lx + 26}" y="${ly + 4}" font-size="11" fill="#333">${item.label}</text>`;
    ly += 18;
  }

  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto">
    <rect width="${W}" height="${H}" fill="white" rx="8"/>
    ${grid}
    ${xLabels}
    ${goalLine}
    ${lines}
    ${legend}
    <line x1="${pad.left}" y1="${pad.top}" x2="${pad.left}" y2="${H - pad.bottom}" stroke="#ccc" stroke-width="1"/>
    <line x1="${pad.left}" y1="${H - pad.bottom}" x2="${W - pad.right}" y2="${H - pad.bottom}" stroke="#ccc" stroke-width="1"/>
  </svg>`;
}

export function renderDashboard(activities: Activity[]): string {
  const now = new Date();
  const currentYear = now.getFullYear();
  const goal = 1100;

  // Metrics
  const thisYearActivities = activities.filter(
    (a) => new Date(a.start_date).getFullYear() === currentYear
  );
  const totalKm = thisYearActivities.reduce((sum, a) => sum + a.distance_meters / 1000, 0);
  const doy = dayOfYear(now);
  const diy = daysInYear(currentYear);
  const targetByToday = (goal * doy) / diy;
  const delta = totalKm - targetByToday;

  // Build year data for chart
  const years = [currentYear, currentYear - 1, currentYear - 2];
  const yearsData = years.map((yr) => buildYearData(activities, yr));

  const chart = renderChart(currentYear, yearsData, goal);

  const deltaColor = delta >= 0 ? "#34a853" : "#d93025";
  const deltaSign = delta >= 0 ? "+" : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Running Dashboard</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f5f5f5; color: #333; padding: 24px; }
    h1 { font-size: 24px; margin-bottom: 20px; }
    .cards { display: flex; gap: 16px; margin-bottom: 20px; flex-wrap: wrap; }
    .card { background: white; border-radius: 8px; padding: 20px; flex: 1; min-width: 160px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .card .label { font-size: 13px; color: #666; margin-bottom: 4px; }
    .card .value { font-size: 28px; font-weight: 700; }
    .chart-container { background: white; border-radius: 8px; padding: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .footer { margin-top: 20px; font-size: 13px; color: #999; }
    .footer a { color: #666; }
  </style>
</head>
<body>
  <h1>Running Dashboard ${currentYear}</h1>
  <div class="cards">
    <div class="card">
      <div class="label">Distance this year</div>
      <div class="value">${totalKm.toFixed(1)} km</div>
    </div>
    <div class="card">
      <div class="label">Target by today</div>
      <div class="value">${targetByToday.toFixed(1)} km</div>
    </div>
    <div class="card">
      <div class="label">Delta</div>
      <div class="value" style="color:${deltaColor}">${deltaSign}${delta.toFixed(1)} km</div>
    </div>
  </div>
  <div class="chart-container">
    ${chart}
  </div>
  <div class="footer">
    <a href="/sync">Sync all activities</a>
  </div>
</body>
</html>`;
}

export function renderConnectPage(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Connect Strava</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f5f5f5; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    .container { text-align: center; background: white; padding: 48px; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    h1 { margin-bottom: 16px; font-size: 24px; }
    p { color: #666; margin-bottom: 24px; }
    a.btn { display: inline-block; background: #FC4C02; color: white; text-decoration: none; padding: 12px 32px; border-radius: 6px; font-weight: 600; }
    a.btn:hover { background: #e04400; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Running Dashboard</h1>
    <p>Connect your Strava account to get started.</p>
    <a class="btn" href="/auth">Connect with Strava</a>
  </div>
</body>
</html>`;
}
