import SwiftUI
import Charts

struct MonthlyChartView: View {
    let monthlyData: [MonthlyData]

    private static let monthNames = ["Jan","Feb","Mar","Apr","May","Jun",
                                     "Jul","Aug","Sep","Oct","Nov","Dec"]

    private var currentYear: Int { YearPalette.currentYear }
    private var currentMonth: Int { Calendar.current.component(.month, from: Date()) - 1 }

    private var currentYearData: MonthlyData? { monthlyData.first { $0.year == currentYear } }

    /// Prior years, oldest first (draw order), matching the web chart.
    private var priorYears: [MonthlyData] {
        monthlyData.filter { $0.year != currentYear }.sorted { $0.year < $1.year }
    }

    private func symbol(for year: Int) -> BasicChartSymbolShape {
        year == currentYear - 2 ? .cross : .circle
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Monthly Distance")
                .font(.headline)
                .padding(.horizontal)

            Chart {
                // Bars for the current year, up to and including the current month.
                if let current = currentYearData {
                    ForEach(Array(current.totals.enumerated()), id: \.offset) { month, km in
                        if month <= currentMonth && km > 0 {
                            BarMark(
                                x: .value("Month", Self.monthNames[month]),
                                y: .value("km", km),
                                width: .ratio(0.4)
                            )
                            .foregroundStyle(YearPalette.color(for: current.year))
                            .cornerRadius(2)
                        }
                    }
                }

                // Markers for prior years.
                ForEach(priorYears) { yearData in
                    ForEach(Array(yearData.totals.enumerated()), id: \.offset) { month, km in
                        if km > 0 {
                            PointMark(
                                x: .value("Month", Self.monthNames[month]),
                                y: .value("km", km)
                            )
                            .foregroundStyle(YearPalette.color(for: yearData.year))
                            .symbol(symbol(for: yearData.year))
                            .symbolSize(40)
                        }
                    }
                }
            }
            .chartXScale(domain: Self.monthNames)
            .chartXAxis {
                AxisMarks { value in
                    AxisValueLabel {
                        if let month = value.as(String.self) {
                            Text(month).font(.caption2)
                        }
                    }
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
                    ForEach(monthlyData.sorted(by: { $0.year > $1.year })) { yd in
                        HStack(spacing: 4) {
                            if yd.year == currentYear {
                                RoundedRectangle(cornerRadius: 2)
                                    .fill(YearPalette.color(for: yd.year))
                                    .frame(width: 12, height: 10)
                            } else if yd.year == currentYear - 2 {
                                Image(systemName: "xmark")
                                    .font(.caption2.bold())
                                    .foregroundStyle(YearPalette.color(for: yd.year))
                            } else {
                                Circle()
                                    .fill(YearPalette.color(for: yd.year))
                                    .frame(width: 8, height: 8)
                            }
                            Text(String(yd.year))
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                        }
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
