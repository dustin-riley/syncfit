import Foundation

final class PairingClient {
    let baseURL: URL
    private let session: URLSession

    init(baseURL: URL, session: URLSession = .shared) {
        self.baseURL = baseURL
        self.session = session
    }

    func pair(code: String, deviceName: String) async throws -> String {
        let url = baseURL.appendingPathComponent("/api/devices/pair")
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONEncoder().encode(PairRequest(code: code, deviceName: deviceName))

        let (data, resp): (Data, URLResponse)
        do {
            (data, resp) = try await session.data(for: req)
        } catch {
            throw APIClientError.transport(error.localizedDescription)
        }
        guard let http = resp as? HTTPURLResponse else {
            throw APIClientError.transport("non-HTTP response")
        }
        switch http.statusCode {
        case 200:
            do {
                return try JSONDecoder().decode(PairResponse.self, from: data).token
            } catch {
                throw APIClientError.decoding(error.localizedDescription)
            }
        case 400:
            throw APIClientError.badRequest
        default:
            throw APIClientError.server(http.statusCode)
        }
    }
}
