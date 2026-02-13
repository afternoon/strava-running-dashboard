export type DashboardData =
  | { connected: false }
  | { connected: true; activities: Activity[] };

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

function Chart({ currentYear, yearsData, goal }: { currentYear: number; yearsData: YearData[]; goal: number }) {
  const W = 1000;
  const H = 500;
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

  const yTicks = 5;
  const gridLines = Array.from({ length: yTicks + 1 }, (_, i) => {
    const val = (yMax / yTicks) * i;
    const yPos = y(val);
    return (
      <>
        <line x1={pad.left} y1={yPos} x2={W - pad.right} y2={yPos} stroke="#e0e0e0" stroke-width="1" />
        <text x={pad.left - 8} y={yPos + 4} text-anchor="end" font-size="11" fill="#666">{Math.round(val)}</text>
      </>
    );
  });

  const xLabels = months.map((month, i) => {
    const mid = (monthDays[i] + monthDays[i + 1]) / 2;
    return <text x={x(mid)} y={H - 8} text-anchor="middle" font-size="11" fill="#666">{month}</text>;
  });

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

  const yearLines = yearsData
    .filter((yd) => yd.points.length >= 2)
    .map((yd) => {
      const c = colors[yd.year] ?? { color: "#888", width: 1, opacity: 0.5 };
      const d = yd.points.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.day).toFixed(1)},${y(p.cumKm).toFixed(1)}`).join(" ");
      return <path d={d} fill="none" stroke={c.color} stroke-width={c.width} opacity={c.opacity} />;
    });

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
    { label: "Goal (1,100km)", color: "#999", dash: "6,4" },
  ];

  const lx = W - pad.right - 120;
  const legend = legendItems.map((item, i) => {
    const ly = pad.top + 10 + i * 18;
    return (
      <>
        <line x1={lx} y1={ly} x2={lx + 20} y2={ly} stroke={item.color} stroke-width="2" stroke-dasharray={item.dash || undefined} />
        <text x={lx + 26} y={ly + 4} font-size="11" fill="#333">{item.label}</text>
      </>
    );
  });

  return (
    <svg viewBox={`0 0 ${W} ${H}`} xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto">
      <rect width={W} height={H} fill="white" rx="8" />
      {gridLines}
      {xLabels}
      <line x1={x(0)} y1={y(0)} x2={x(365)} y2={y(goal)} stroke="#999" stroke-width="1.5" stroke-dasharray="6,4" />
      {yearLines}
      {legend}
      <line x1={pad.left} y1={pad.top} x2={pad.left} y2={H - pad.bottom} stroke="#ccc" stroke-width="1" />
      <line x1={pad.left} y1={H - pad.bottom} x2={W - pad.right} y2={H - pad.bottom} stroke="#ccc" stroke-width="1" />
    </svg>
  );
}

export function Dashboard({ activities }: { activities: Activity[] }) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const goal = 1100;

  const thisYearActivities = activities.filter(
    (a) => new Date(a.start_date).getFullYear() === currentYear
  );
  const totalKm = thisYearActivities.reduce((sum, a) => sum + a.distance_meters / 1000, 0);
  const doy = dayOfYear(now);
  const diy = daysInYear(currentYear);
  const targetByToday = (goal * doy) / diy;
  const delta = totalKm - targetByToday;

  const years = [currentYear, currentYear - 1, currentYear - 2];
  const yearsData = years.map((yr) => buildYearData(activities, yr));

  const deltaColor = delta >= 0 ? "#34a853" : "#d93025";
  const deltaSign = delta >= 0 ? "+" : "";

  const weeklyKm = thisYearActivities
    .filter((a) => {
      const d = new Date(a.start_date);
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      return d >= weekAgo;
    })
    .reduce((sum, a) => sum + a.distance_meters / 1000, 0);

  return (
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Running Dashboard</title>
        <link rel="stylesheet" href="/styles.css" />
      </head>
      <body class="dashboard">
        <h1>Running {currentYear}</h1>
        <div class="chart-container">
          <Chart currentYear={currentYear} yearsData={yearsData} goal={goal} />
        </div>
        <div class="metrics-card">
          <table class="metrics-table">
            <tr>
              <td class="metric-label">Distance</td>
              <td class="metric-value">{totalKm.toFixed(1)} km</td>
            </tr>
            <tr>
              <td class="metric-label">Target</td>
              <td class="metric-value">{targetByToday.toFixed(1)} km</td>
            </tr>
            <tr>
              <td class="metric-label">Delta</td>
              <td class="metric-value" style={`color:${deltaColor}`}>{deltaSign}{delta.toFixed(1)} km</td>
            </tr>
            <tr>
              <td class="metric-label">Last 7 days</td>
              <td class="metric-value">{weeklyKm.toFixed(1)} km</td>
            </tr>
          </table>
        </div>
        <div class="footer">
          <a href="/sync">Sync all activities</a>
        </div>
      </body>
    </html>
  );
}

export function ConnectPage() {
  return (
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Connect Strava</title>
        <link rel="stylesheet" href="/styles.css" />
      </head>
      <body class="connect">
        <div class="container">
          <h1>Running Dashboard</h1>
          <p>Connect your Strava account to get started.</p>
          <a class="btn" href="/auth">Connect with Strava</a>
        </div>
      </body>
    </html>
  );
}
