import Foundation

// MARK: - Request / Response wrappers

private struct GraphQLRequest: Encodable {
    let query: String
}

private struct GraphQLResponse<T: Decodable>: Decodable {
    let data: T?
    let errors: [GraphQLError]?
}

private struct GraphQLError: Decodable {
    let message: String
}

// MARK: - Client

final class GraphQLClient {
    private let baseURL: String
    private let session: URLSession

    init(baseURL: String) {
        self.baseURL = baseURL
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 30
        self.session = URLSession(configuration: config)
    }

    // MARK: Public queries

    func fetchAuthStatus() async throws -> AuthStatus {
        struct Response: Decodable { let authStatus: AuthStatus }
        let query = "query { authStatus { isConnected } }"
        let response: Response = try await execute(query: query)
        return response.authStatus
    }

    func fetchDashboard() async throws -> DashboardData {
        struct Response: Decodable { let dashboard: DashboardData }
        let query = """
        query {
          dashboard {
            goal
            metrics {
              distanceThisYear
              targetByToday
              delta
              lastSevenDays
            }
            chartData {
              year
              points {
                dayOfYear
                cumulativeKm
              }
            }
          }
        }
        """
        let response: Response = try await execute(query: query)
        return response.dashboard
    }

    // MARK: Private

    private func execute<T: Decodable>(query: String) async throws -> T {
        guard let url = URL(string: "\(baseURL)/graphql") else {
            throw URLError(.badURL)
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let sharedDefaults = UserDefaults(suiteName: "group.com.ben2.StravaRunning") ?? .standard
        if let key = sharedDefaults.string(forKey: "apiKey"), !key.isEmpty {
            request.setValue("Bearer \(key)", forHTTPHeaderField: "Authorization")
        }

        request.httpBody = try JSONEncoder().encode(GraphQLRequest(query: query))

        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
            throw URLError(.badServerResponse)
        }

        let decoded = try JSONDecoder().decode(GraphQLResponse<T>.self, from: data)

        if let errors = decoded.errors, !errors.isEmpty {
            throw NSError(
                domain: "GraphQL",
                code: -1,
                userInfo: [NSLocalizedDescriptionKey: errors.map(\.message).joined(separator: "; ")]
            )
        }

        guard let result = decoded.data else {
            throw URLError(.cannotParseResponse)
        }
        return result
    }
}
