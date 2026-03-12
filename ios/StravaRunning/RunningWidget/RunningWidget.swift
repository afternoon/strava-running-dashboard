import WidgetKit
import SwiftUI

// MARK: - Shared configuration

private let appGroupID  = "group.com.personal.StravaRunning"
private let apiURLKey   = "apiURL"
private let apiKeyKey   = "apiKey"
private let defaultURL  = "https://running.ben2.com"

private var sharedDefaults: UserDefaults {
    UserDefaults(suiteName: appGroupID) ?? .standard
}

// MARK: - Timeline entry

struct RunningEntry: TimelineEntry {
    let date: Date
    let delta: Double?   // nil = failed to load
}

// MARK: - Timeline provider

struct RunningProvider: TimelineProvider {

    func placeholder(in context: Context) -> RunningEntry {
        RunningEntry(date: .now, delta: 12.3)
    }

    func getSnapshot(in context: Context, completion: @escaping (RunningEntry) -> Void) {
        completion(RunningEntry(date: .now, delta: 12.3))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<RunningEntry>) -> Void) {
        Task {
            let entry = await fetchEntry()
            let next  = Calendar.current.date(byAdding: .hour, value: 1, to: .now) ?? .now
            completion(Timeline(entries: [entry], policy: .after(next)))
        }
    }

    // MARK: Private

    private func fetchEntry() async -> RunningEntry {
        let baseURL = sharedDefaults.string(forKey: apiURLKey) ?? defaultURL
        let apiKey  = sharedDefaults.string(forKey: apiKeyKey) ?? ""

        guard let url = URL(string: "\(baseURL)/graphql") else {
            return RunningEntry(date: .now, delta: nil)
        }

        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if !apiKey.isEmpty {
            req.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")
        }
        req.httpBody = #"{"query":"{ dashboard { metrics { delta } } }"}"#.data(using: .utf8)

        do {
            let (data, _) = try await URLSession.shared.data(for: req)

            struct R: Decodable {
                struct D: Decodable {
                    struct Dash: Decodable {
                        struct M: Decodable { let delta: Double }
                        let metrics: M
                    }
                    let dashboard: Dash
                }
                let data: D
            }

            let delta = try JSONDecoder().decode(R.self, from: data).data.dashboard.metrics.delta
            return RunningEntry(date: .now, delta: delta)
        } catch {
            return RunningEntry(date: .now, delta: nil)
        }
    }
}

// MARK: - Widget view

struct RunningWidgetView: View {
    let entry: RunningEntry
    @Environment(\.colorScheme) private var colorScheme

    private var isAhead: Bool { (entry.delta ?? 0) >= 0 }

    private var gradientColors: [Color] {
        guard entry.delta != nil else {
            return colorScheme == .dark
                ? [Color(white: 0.18), Color(white: 0.12)]
                : [Color(white: 0.88), Color(white: 0.78)]
        }
        if isAhead {
            return colorScheme == .dark
                ? [Color(red: 0.06, green: 0.42, blue: 0.22), Color(red: 0.02, green: 0.22, blue: 0.12)]
                : [Color(red: 0.55, green: 0.90, blue: 0.66), Color(red: 0.22, green: 0.72, blue: 0.42)]
        } else {
            return colorScheme == .dark
                ? [Color(red: 0.46, green: 0.07, blue: 0.07), Color(red: 0.26, green: 0.03, blue: 0.03)]
                : [Color(red: 0.99, green: 0.66, blue: 0.62), Color(red: 0.90, green: 0.34, blue: 0.30)]
        }
    }

    private var deltaText: String {
        guard let d = entry.delta else { return "—" }
        return String(format: "%@%.1f", d >= 0 ? "+" : "", d)
    }

    var body: some View {
        ZStack {
            LinearGradient(
                colors: gradientColors,
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )

            VStack(spacing: 4) {
                Text("DELTA")
                    .font(.system(size: 11, weight: .semibold, design: .rounded))
                    .tracking(1.5)
                    .foregroundStyle(.white.opacity(0.75))

                Text(deltaText)
                    .font(.system(size: 44, weight: .bold, design: .rounded))
                    .foregroundStyle(.white)
                    .minimumScaleFactor(0.45)
                    .lineLimit(1)

                Text("km vs target")
                    .font(.system(size: 11, weight: .medium, design: .rounded))
                    .foregroundStyle(.white.opacity(0.75))
            }
            .padding(12)
        }
    }
}

// MARK: - Widget configuration

struct RunningWidget: Widget {
    let kind = "RunningWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: RunningProvider()) { entry in
            RunningWidgetView(entry: entry)
        }
        .configurationDisplayName("Running Delta")
        .description("Shows how far ahead or behind your annual goal you are.")
        .supportedFamilies([.systemSmall])
    }
}

// MARK: - Previews

#Preview("Ahead", as: .systemSmall) {
    RunningWidget()
} timeline: {
    RunningEntry(date: .now, delta: 42.7)
}

#Preview("Behind", as: .systemSmall) {
    RunningWidget()
} timeline: {
    RunningEntry(date: .now, delta: -8.3)
}
