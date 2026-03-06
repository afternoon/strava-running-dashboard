import SwiftUI

struct ContentView: View {
    @EnvironmentObject var appState: AppState

    var body: some View {
        Group {
            if appState.isLoading && appState.dashboard == nil {
                LoadingView()
            } else if appState.isConnected, let data = appState.dashboard {
                DashboardView(data: data)
            } else {
                LoginView()
            }
        }
        .task { await appState.refresh() }
        .alert("Error", isPresented: .constant(appState.errorMessage != nil)) {
            Button("OK") { appState.errorMessage = nil }
        } message: {
            Text(appState.errorMessage ?? "")
        }
    }
}
