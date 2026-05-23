import SwiftUI

struct RootView: View {
    @EnvironmentObject var session: AppSession

    var body: some View {
        Group {
            if !session.healthAuthorized {
                PermissionView()
            } else if session.deviceToken == nil {
                PairingView()
            } else {
                HomeView()
            }
        }
    }
}
