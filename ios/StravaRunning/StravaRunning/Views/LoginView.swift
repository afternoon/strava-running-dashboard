import SwiftUI

struct LoginView: View {
    @EnvironmentObject var appState: AppState
    @State private var showSettings = false

    var body: some View {
        NavigationStack {
            VStack(spacing: 32) {
                Spacer()

                Image(systemName: "figure.run.circle.fill")
                    .font(.system(size: 90))
                    .foregroundStyle(.orange)

                VStack(spacing: 8) {
                    Text("Running Dashboard")
                        .font(.largeTitle.bold())
                    Text("Connect your Strava account\nto view your running progress.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                }

                Button(action: openStravaAuth) {
                    Label("Connect with Strava", systemImage: "link")
                        .font(.headline)
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(Color.orange)
                        .foregroundStyle(.white)
                        .clipShape(RoundedRectangle(cornerRadius: 14))
                }
                .padding(.horizontal, 32)

                Button("Refresh") {
                    Task { await appState.refresh() }
                }
                .foregroundStyle(.secondary)

                Spacer()
            }
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button { showSettings = true } label: {
                        Image(systemName: "gearshape")
                    }
                }
            }
            .sheet(isPresented: $showSettings) {
                SettingsView()
            }
        }
    }

    private func openStravaAuth() {
        let base = UserDefaults.standard.string(forKey: "apiURL") ?? "https://running.ben2.com"
        guard let url = URL(string: "\(base)/auth") else { return }
        UIApplication.shared.open(url)
    }
}
