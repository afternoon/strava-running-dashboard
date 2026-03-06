import SwiftUI

struct SettingsView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var apiURL = UserDefaults.standard.string(forKey: "apiURL") ?? "https://running.ben2.com"
    @State private var apiKey = UserDefaults.standard.string(forKey: "apiKey") ?? ""

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
                        UserDefaults.standard.set(apiURL, forKey: "apiURL")
                        UserDefaults.standard.set(apiKey, forKey: "apiKey")
                        dismiss()
                    }
                    .bold()
                }
            }
        }
    }
}
