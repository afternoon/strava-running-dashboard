import Foundation

@MainActor
final class AppState: ObservableObject {
    @Published var isConnected = false
    @Published var isLoading = false
    @Published var dashboard: DashboardData?
    @Published var errorMessage: String?

    private var client: GraphQLClient

    init() {
        let url = UserDefaults.standard.string(forKey: "apiURL") ?? "https://running.ben2.com"
        client = GraphQLClient(baseURL: url)
    }

    func refresh() async {
        isLoading = true
        errorMessage = nil

        // Re-create client in case settings changed.
        let url = UserDefaults.standard.string(forKey: "apiURL") ?? "https://running.ben2.com"
        client = GraphQLClient(baseURL: url)

        do {
            let status = try await client.fetchAuthStatus()
            isConnected = status.isConnected
            if isConnected {
                dashboard = try await client.fetchDashboard()
            }
        } catch {
            errorMessage = error.localizedDescription
        }

        isLoading = false
    }

    func reloadDashboard() async {
        guard isConnected else { return }
        isLoading = true
        errorMessage = nil
        do {
            dashboard = try await client.fetchDashboard()
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }
}
