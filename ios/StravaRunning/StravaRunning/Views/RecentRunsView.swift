import SwiftUI

struct RecentRunsView: View {
    let runs: [RecentRun]

    private static let parser: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f
    }()

    private static let fallbackParser: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    // Strava reports start_date in UTC; the web dashboard displays it as-is, so match that.
    private static let dateFormatter: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone(identifier: "UTC")
        f.dateFormat = "MMM d"
        return f
    }()

    private static let timeFormatter: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone(identifier: "UTC")
        f.dateFormat = "HH:mm"
        return f
    }()

    private func date(for run: RecentRun) -> Date? {
        Self.parser.date(from: run.startDate) ?? Self.fallbackParser.date(from: run.startDate)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Recent Runs")
                .font(.headline)
                .padding(.horizontal)
                .padding(.vertical, 12)

            if runs.isEmpty {
                Text("No runs yet")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .padding(.horizontal)
                    .padding(.bottom, 12)
            } else {
                ForEach(Array(runs.enumerated()), id: \.element.id) { index, run in
                    HStack {
                        if let d = date(for: run) {
                            Text(Self.dateFormatter.string(from: d))
                                .font(.body)
                                .frame(width: 70, alignment: .leading)
                            Text(Self.timeFormatter.string(from: d))
                                .font(.body.monospacedDigit())
                                .foregroundStyle(.secondary)
                        } else {
                            Text(run.startDate)
                                .font(.body)
                                .foregroundStyle(.secondary)
                        }
                        Spacer()
                        Text(String(format: "%.1f km", run.distanceKm))
                            .font(.body.bold().monospacedDigit())
                    }
                    .padding(.horizontal)
                    .padding(.vertical, 10)

                    if index < runs.count - 1 {
                        Divider().padding(.leading)
                    }
                }
            }
        }
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 14))
    }
}
