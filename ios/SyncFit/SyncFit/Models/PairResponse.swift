import Foundation

struct PairRequest: Codable {
    let code: String
    let deviceName: String
}

struct PairResponse: Codable {
    let token: String
}
