import SwiftUI

struct DashboardView: View {
    let data: DashboardData
    @EnvironmentObject var appState: AppState
    @State private var showSettings = false

    var body: some View {
        NavigationStack {
            TabView {
                dashboardTab(title: "Progress", systemImage: "chart.xyaxis.line") {
                    MetricsView(metrics: data.metrics)
                    RunChartView(chartData: data.chartData, goal: data.goal)
                }

                dashboardTab(title: "Runs", systemImage: "list.bullet") {
                    RecentRunsView(runs: data.recentRuns)
                }

                dashboardTab(title: "Monthly", systemImage: "chart.bar") {
                    MonthlyChartView(monthlyData: data.monthlyData)
                }
            }
            .navigationTitle("Running")
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
            .sheet(isPresented: $showSettings) { SettingsView() }
        }
    }

    /// A scrollable, pull-to-refresh tab page with the shared grouped background.
    private func dashboardTab<Content: View>(
        title: String,
        systemImage: String,
        @ViewBuilder content: () -> Content
    ) -> some View {
        ScrollView {
            VStack(spacing: 16) {
                content()
            }
            .padding()
        }
        .background(Color(.systemGroupedBackground))
        .refreshable { await appState.reloadDashboard() }
        .tabItem { Label(title, systemImage: systemImage) }
    }
}
