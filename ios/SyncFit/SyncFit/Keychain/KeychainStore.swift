import Foundation
import Security

// Typed Keychain wrapper. v1 stores only the bearer device token; the
// single account name is hardcoded so the API is `save / load / clear`
// rather than dictionary-style.
struct KeychainStore {
    let service: String
    let account = "deviceToken"

    init(service: String = "com.dustinriley.syncfit") {
        self.service = service
    }

    func save(token: String) throws {
        let data = Data(token.utf8)
        // Try update first; if no existing item, fall back to add.
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        let updateStatus = SecItemUpdate(
            query as CFDictionary,
            [kSecValueData as String: data] as CFDictionary
        )
        if updateStatus == errSecItemNotFound {
            var add = query
            add[kSecValueData as String] = data
            let addStatus = SecItemAdd(add as CFDictionary, nil)
            guard addStatus == errSecSuccess else {
                throw KeychainError.osStatus(addStatus)
            }
            return
        }
        guard updateStatus == errSecSuccess else {
            throw KeychainError.osStatus(updateStatus)
        }
    }

    func load() -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var item: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        guard status == errSecSuccess, let data = item as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    func clear() {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        SecItemDelete(query as CFDictionary)
    }

    enum KeychainError: Error, Equatable {
        case osStatus(OSStatus)
    }
}
