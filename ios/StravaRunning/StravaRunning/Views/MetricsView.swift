import SwiftUI

struct MetricsView: View {
    let metrics: Metrics
    let goal: Double

    private var deltaColor: Color { metrics.delta >= 0 ? .green : .red }

    private var progressFraction: Double {
        guard goal > 0 else { return 0 }
        return min(metrics.distanceThisYear / goal, 1.0)
    }

    var body: some View {
        VStack(spacing: 12) {
            // Annual progress bar
            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    Text("Progress to \(Int(goal)) km goal")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                    Spacer()
                    Text(metrics.distanceThisYear.kmString)
                        .font(.subheadline.bold())
                }
                ProgressView(value: progressFraction)
                    .tint(.orange)
            }
            .padding()
            .cardStyle()

            // 2×2 metric grid
            HStack(spacing: 12) {
                MetricCard(title: "This Year",   value: metrics.distanceThisYear.kmString, color: .orange)
                MetricCard(title: "Target Today", value: metrics.targetByToday.kmString,   color: .blue)
            }
            HStack(spacing: 12) {
                MetricCard(
                    title: "Delta",
                    value: (metrics.delta >= 0 ? "+" : "") + metrics.delta.kmString,
                    color: deltaColor
                )
                MetricCard(title: "Last 7 Days", value: metrics.lastSevenDays.kmString, color: .purple)
            }
        }
    }
}

struct MetricCard: View {
    let title: String
    let value: String
    let color: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title)
                .font(.caption)
                .foregroundStyle(.secondary)
            Text(value)
                .font(.title2.bold())
                .foregroundStyle(color)
                .minimumScaleFactor(0.7)
                .lineLimit(1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
        .cardStyle()
    }
}

// MARK: - Helpers

private extension Double {
    var kmString: String { String(format: "%.1f km", self) }
}

private extension View {
    func cardStyle() -> some View {
        self
            .background(Color(.secondarySystemGroupedBackground))
            .clipShape(RoundedRectangle(cornerRadius: 14))
    }
}
