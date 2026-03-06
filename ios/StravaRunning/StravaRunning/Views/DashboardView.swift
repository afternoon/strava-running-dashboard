import SwiftUI

struct DashboardView: View {
    let data: DashboardData
    @EnvironmentObject var appState: AppState
    @State private var showSettings = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    MetricsView(metrics: data.metrics, goal: data.goal)
                    RunChartView(chartData: data.chartData, goal: data.goal)
                }
                .padding()
            }
            .background(Color(.systemGroupedBackground))
            .navigationTitle("Running \(Calendar.current.component(.year, from: Date()))")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button { showSettings = true } label: {
                        Image(systemName: "gearshape")
                    }
                }
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button {
                        Task { await appState.reloadDashboard() }
                    } label: {
                        if appState.isLoading {
                            ProgressView()
                        } else {
                            Image(systemName: "arrow.clockwise")
                        }
                    }
                    .disabled(appState.isLoading)
                }
            }
            .refreshable { await appState.reloadDashboard() }
            .sheet(isPresented: $showSettings) { SettingsView() }
        }
    }
}
