import Foundation

struct AuthStatus: Decodable {
    let isConnected: Bool
}

struct DashboardData: Decodable {
    let goal: Double
    let metrics: Metrics
    let chartData: [YearData]
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
