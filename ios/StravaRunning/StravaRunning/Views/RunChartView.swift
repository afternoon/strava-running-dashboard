import SwiftUI
import Charts

/// Colour palette matching the web dashboard, shared by the yearly and monthly charts.
enum YearPalette {
    static var currentYear: Int { Calendar.current.component(.year, from: Date()) }

    static func color(for year: Int) -> Color {
        switch year {
        case currentYear:     return Color(red: 0.99, green: 0.30, blue: 0.01) // Strava orange
        case currentYear - 1: return Color(red: 0.10, green: 0.45, blue: 0.91) // blue
        case currentYear - 2: return Color(red: 0.20, green: 0.66, blue: 0.33) // green
        default:              return .gray
        }
    }

    static let goal = Color.gray.opacity(0.6)
}

struct RunChartView: View {
    let chartData: [YearData]
    let goal: Double

    private var currentYear: Int { YearPalette.currentYear }

    private func color(for year: Int) -> Color { YearPalette.color(for: year) }

    private func lineWidth(for year: Int) -> CGFloat { year == currentYear ? 3 : 1.5 }

    /// Number of days in the current year (365 or 366).
    private var daysInYear: Int {
        Calendar.current.range(of: .day, in: .year, for: Date())?.count ?? 365
    }

    /// Endpoints of the target line: 0 km on Jan 1, the full goal on Dec 31.
    private var goalLine: [DataPoint] {
        [DataPoint(dayOfYear: 0, cumulativeKm: 0),
         DataPoint(dayOfYear: daysInYear, cumulativeKm: goal)]
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Yearly Progress")
                .font(.headline)
                .padding(.horizontal)

            Chart {
                // Dashed goal line: the target cumulative distance for each day of the
                // year, rising from 0 on Jan 1 to the full goal on Dec 31 (as on the web).
                ForEach(goalLine) { point in
                    LineMark(
                        x: .value("Day", point.dayOfYear),
                        y: .value("km", point.cumulativeKm),
                        series: .value("Year", "Goal")
                    )
                    .foregroundStyle(YearPalette.goal)
                    .lineStyle(StrokeStyle(lineWidth: 1.5, dash: [6, 4]))
                }

                // One LineMark series per year
                ForEach(chartData) { yearData in
                    ForEach(yearData.points) { point in
                        LineMark(
                            x: .value("Day", point.dayOfYear),
                            y: .value("km", point.cumulativeKm),
                            series: .value("Year", String(yearData.year))
                        )
                        .foregroundStyle(color(for: yearData.year))
                        .lineStyle(StrokeStyle(lineWidth: lineWidth(for: yearData.year)))
                        .interpolationMethod(.monotone)
                    }
                }
            }
            .chartXScale(domain: 0...366)
            .chartXAxis {
                // Show month labels at the start of each month.
                let monthStarts = [1, 32, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335]
                let monthNames  = ["Jan","Feb","Mar","Apr","May","Jun",
                                   "Jul","Aug","Sep","Oct","Nov","Dec"]
                AxisMarks(values: monthStarts) { value in
                    AxisValueLabel {
                        if let day = value.as(Int.self),
                           let idx = monthStarts.firstIndex(of: day) {
                            Text(monthNames[idx]).font(.caption2)
                        }
                    }
                    AxisGridLine()
                }
            }
            .chartYAxis {
                AxisMarks { value in
                    AxisGridLine()
                    AxisValueLabel {
                        if let km = value.as(Double.self) {
                            Text("\(Int(km))").font(.caption2)
                        }
                    }
                }
            }
            .chartLegend(position: .bottom, alignment: .leading, spacing: 8) {
                HStack(spacing: 14) {
                    ForEach(chartData.sorted(by: { $0.year > $1.year })) { yd in
                        HStack(spacing: 4) {
                            RoundedRectangle(cornerRadius: 2)
                                .fill(color(for: yd.year))
                                .frame(width: 16, height: 3)
                            Text(String(yd.year))
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                        }
                    }
                    HStack(spacing: 4) {
                        // Dashed line legend for goal
                        Rectangle()
                            .fill(YearPalette.goal)
                            .frame(width: 16, height: 1.5)
                        Text("Goal (\(Int(goal)) km)")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                }
                .padding(.horizontal)
            }
            .frame(height: 260)
            .padding(.horizontal, 4)
        }
        .padding(.vertical)
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 14))
    }
}
