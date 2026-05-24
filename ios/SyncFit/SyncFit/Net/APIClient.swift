import Foundation

enum APIClientError: Error, Equatable {
    case unauthorized
    case badRequest
    case server(Int)
    case decoding(String)
    case transport(String)
}

final class APIClient {
    let baseURL: URL
    private let token: String
    private let session: URLSession

    init(baseURL: URL, token: String, session: URLSession = .shared) {
        self.baseURL = baseURL
        self.token = token
        self.session = session
    }

    func healthSync(uploads: [HealthMetricUpload]) async throws -> SyncResponse {
        let url = baseURL.appendingPathComponent("/api/health/sync")
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")

        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        req.httpBody = try encoder.encode(SyncRequest(uploads: uploads))

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
                return try JSONDecoder().decode(SyncResponse.self, from: data)
            } catch {
                throw APIClientError.decoding(error.localizedDescription)
            }
        case 401:
            throw APIClientError.unauthorized
        case 400:
            throw APIClientError.badRequest
        default:
            throw APIClientError.server(http.statusCode)
        }
    }

    func getPlanWeek() async throws -> PlanWeek {
        let url = baseURL.appendingPathComponent("/api/plan/week")
        var req = URLRequest(url: url)
        req.httpMethod = "GET"
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")

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
                return try JSONDecoder().decode(PlanWeek.self, from: data)
            } catch {
                throw APIClientError.decoding(error.localizedDescription)
            }
        case 401:
            throw APIClientError.unauthorized
        case 400:
            throw APIClientError.badRequest
        default:
            throw APIClientError.server(http.statusCode)
        }
    }
}
