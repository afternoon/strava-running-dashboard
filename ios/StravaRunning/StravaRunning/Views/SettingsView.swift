import SwiftUI
import WidgetKit

private let sharedDefaults = UserDefaults(suiteName: "group.com.personal.StravaRunning") ?? .standard

struct SettingsView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var apiURL = sharedDefaults.string(forKey: "apiURL") ?? "https://running.ben2.com"
    @State private var apiKey = sharedDefaults.string(forKey: "apiKey") ?? ""

    var body: some View {
        NavigationStack {
            Form {
                Section("Server") {
                    LabeledContent("API URL") {
                        TextField("https://running.ben2.com", text: $apiURL)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .keyboardType(.URL)
                            .multilineTextAlignment(.trailing)
                    }
                }

                Section {
                    LabeledContent("API Key") {
                        SecureField("Optional", text: $apiKey)
                            .multilineTextAlignment(.trailing)
                    }
                } header: {
                    Text("Authentication")
                } footer: {
                    Text("Set an API key only if DASHBOARD_API_KEY is configured on the server.")
                }
            }
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        sharedDefaults.set(apiURL, forKey: "apiURL")
                        sharedDefaults.set(apiKey, forKey: "apiKey")
                        WidgetCenter.shared.reloadAllTimelines()
                        dismiss()
                    }
                    .bold()
                }
            }
        }
    }
}
