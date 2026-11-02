import Foundation

struct AuthStatus: Decodable {
    let isConnected: Bool
}

struct DashboardData: Decodable {
    let goal: Double
    let metrics: Metrics
    let chartData: [YearData]
    let recentRuns: [RecentRun]
    let monthlyData: [MonthlyData]
}

struct Metrics: Decodable {
    let distanceThisYear: Double
    let targetByToday: Double
    let delta: Double
    let lastSevenDays: Double
}

struct YearData: Decodable, Identifiable {
    let year: Int
    let points: [DataPoint]

    var id: Int { year }
}

struct DataPoint: Decodable, Identifiable {
    let dayOfYear: Int
    let cumulativeKm: Double

    var id: Int { dayOfYear }
}

struct RecentRun: Decodable, Identifiable {
    let startDate: String
    let distanceKm: Double

    var id: String { startDate }
}

struct MonthlyData: Decodable, Identifiable {
    let year: Int
    /// Total km for each month, index 0 = January.
    let totals: [Double]

    var id: Int { year }
}
