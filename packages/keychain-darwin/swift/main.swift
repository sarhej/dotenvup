import AppKit
import Foundation
import LocalAuthentication
import Security

let serviceName = "com.dotenvup.wrapping-key"
let helperVersion = "0.1.0"

// NOTE: kSecAttrAccessControl + UserPresence requires the data-protection keychain and
// restricted entitlements authorised by a provisioning profile. Bare CLI tools (and even
// a thin .app wrapper without a profile) fail with errSecMissingEntitlement (-34018).
// M2 gates `get` with LocalAuthentication (.deviceOwnerAuthentication) instead, and stores
// the item as WhenUnlockedThisDeviceOnly. True Keychain ACL is a later hardening step
// once we ship a provisioned app-bundled helper.

enum ExitCode {
  static let ok = 0
  static let userOrUsage = 1
  static let system = 2
}

func writeStderr(_ message: String) {
  if let data = (message + "\n").data(using: .utf8) {
    FileHandle.standardError.write(data)
  }
}

func writeStdoutLine(_ message: String) {
  if let data = (message + "\n").data(using: .utf8) {
    FileHandle.standardOutput.write(data)
  }
}

func readStdinAll() -> Data {
  FileHandle.standardInput.readDataToEndOfFile()
}

func decodeWrappingKey(from stdin: Data) -> Data? {
  var raw = stdin
  while let last = raw.last, last == 0x0A || last == 0x0D || last == 0x20 || last == 0x09 {
    raw.removeLast()
  }
  if raw.count == 32 {
    return raw
  }
  guard let text = String(data: raw, encoding: .utf8) else { return nil }
  let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
  guard let decoded = Data(base64Encoded: trimmed), decoded.count == 32 else { return nil }
  return decoded
}

/// Touch ID / Apple Watch / login password. Blocks until the user responds.
func requireUserPresence(reason: String) -> Bool {
  let context = LAContext()
  context.localizedCancelTitle = "Cancel"
  var authError: NSError?
  guard context.canEvaluatePolicy(.deviceOwnerAuthentication, error: &authError) else {
    writeStderr("Device owner authentication unavailable: \(authError?.localizedDescription ?? "unknown")")
    return false
  }

  let sem = DispatchSemaphore(value: 0)
  var ok = false
  context.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: reason) { success, error in
    ok = success
    if let error = error as? LAError, error.code == .userCancel || error.code == .appCancel {
      writeStderr("Authentication cancelled")
    } else if let error {
      writeStderr("Authentication failed: \(error.localizedDescription)")
    }
    sem.signal()
  }
  sem.wait()
  return ok
}

func cmdProbe() -> Int32 {
  let context = LAContext()
  var authError: NSError?
  let canBiometry = context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &authError)
  let canOwner = context.canEvaluatePolicy(.deviceOwnerAuthentication, error: &authError)
  let biometryType: String
  switch context.biometryType {
  case .touchID: biometryType = "touchID"
  case .faceID: biometryType = "faceID"
  case .opticID: biometryType = "opticID"
  case .none: biometryType = "none"
  @unknown default: biometryType = "unknown"
  }
  let payload: [String: Any] = [
    "version": helperVersion,
    "service": serviceName,
    "biometryAvailable": canBiometry,
    "ownerAuthAvailable": canOwner,
    "biometryType": biometryType,
    "authGate": "localAuthentication",
  ]
  guard let data = try? JSONSerialization.data(withJSONObject: payload, options: []),
        let json = String(data: data, encoding: .utf8)
  else {
    writeStderr("Failed to encode probe JSON")
    return Int32(ExitCode.system)
  }
  writeStdoutLine(json)
  return Int32(ExitCode.ok)
}

func cmdHas(account: String) -> Int32 {
  let query: [String: Any] = [
    kSecClass as String: kSecClassGenericPassword,
    kSecAttrService as String: serviceName,
    kSecAttrAccount as String: account,
    kSecReturnData as String: false,
  ]
  let status = SecItemCopyMatching(query as CFDictionary, nil)
  if status == errSecSuccess {
    return Int32(ExitCode.ok)
  }
  if status == errSecItemNotFound {
    return Int32(ExitCode.userOrUsage)
  }
  writeStderr("Keychain has failed: \(status)")
  return Int32(ExitCode.system)
}

func cmdSet(account: String) -> Int32 {
  guard let wrappingKey = decodeWrappingKey(from: readStdinAll()) else {
    writeStderr("Expected 32-byte wrapping key on stdin (raw or base64)")
    return Int32(ExitCode.userOrUsage)
  }

  let deleteQuery: [String: Any] = [
    kSecClass as String: kSecClassGenericPassword,
    kSecAttrService as String: serviceName,
    kSecAttrAccount as String: account,
  ]
  SecItemDelete(deleteQuery as CFDictionary)

  let addQuery: [String: Any] = [
    kSecClass as String: kSecClassGenericPassword,
    kSecAttrService as String: serviceName,
    kSecAttrAccount as String: account,
    kSecValueData as String: wrappingKey,
    kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
  ]
  let status = SecItemAdd(addQuery as CFDictionary, nil)
  if status == errSecSuccess {
    return Int32(ExitCode.ok)
  }
  writeStderr("Keychain set failed: \(status)")
  return Int32(ExitCode.system)
}

func cmdGet(account: String) -> Int32 {
  guard requireUserPresence(reason: "DotEnvUp needs your key to unlock encrypted environment files") else {
    return Int32(ExitCode.userOrUsage)
  }

  let query: [String: Any] = [
    kSecClass as String: kSecClassGenericPassword,
    kSecAttrService as String: serviceName,
    kSecAttrAccount as String: account,
    kSecReturnData as String: true,
    kSecMatchLimit as String: kSecMatchLimitOne,
  ]

  var item: CFTypeRef?
  let status = SecItemCopyMatching(query as CFDictionary, &item)
  if status == errSecItemNotFound {
    writeStderr("Keychain item not found")
    return Int32(ExitCode.userOrUsage)
  }
  guard status == errSecSuccess, let data = item as? Data, data.count == 32 else {
    writeStderr("Keychain get failed: \(status)")
    return Int32(ExitCode.system)
  }
  writeStdoutLine(data.base64EncodedString())
  return Int32(ExitCode.ok)
}

func cmdDelete(account: String) -> Int32 {
  let query: [String: Any] = [
    kSecClass as String: kSecClassGenericPassword,
    kSecAttrService as String: serviceName,
    kSecAttrAccount as String: account,
  ]
  let status = SecItemDelete(query as CFDictionary)
  if status == errSecSuccess || status == errSecItemNotFound {
    return Int32(ExitCode.ok)
  }
  writeStderr("Keychain delete failed: \(status)")
  return Int32(ExitCode.system)
}

func emitPresenceEvent(_ event: String) {
  writeStdoutLine("{\"event\":\"\(event)\"}")
}

/// Long-running: emit NDJSON events for screen lock, sleep, and logout/shutdown.
func cmdWatchPresence() -> Int32 {
  let sigint = DispatchSource.makeSignalSource(signal: SIGINT, queue: .main)
  let sigterm = DispatchSource.makeSignalSource(signal: SIGTERM, queue: .main)
  signal(SIGINT, SIG_IGN)
  signal(SIGTERM, SIG_IGN)
  let stop: () -> Void = {
    exit(Int32(ExitCode.ok))
  }
  sigint.setEventHandler(handler: stop)
  sigterm.setEventHandler(handler: stop)
  sigint.resume()
  sigterm.resume()

  let dnc = DistributedNotificationCenter.default()
  dnc.addObserver(
    forName: NSNotification.Name("com.apple.screenIsLocked"),
    object: nil,
    queue: nil
  ) { _ in
    emitPresenceEvent("screenLocked")
  }
  dnc.addObserver(
    forName: NSNotification.Name("com.apple.screenIsUnlocked"),
    object: nil,
    queue: nil
  ) { _ in
    emitPresenceEvent("screenUnlocked")
  }

  let nc = NSWorkspace.shared.notificationCenter
  nc.addObserver(
    forName: NSWorkspace.willSleepNotification,
    object: nil,
    queue: nil
  ) { _ in
    emitPresenceEvent("sleep")
  }
  nc.addObserver(
    forName: NSWorkspace.sessionDidResignActiveNotification,
    object: nil,
    queue: nil
  ) { _ in
    emitPresenceEvent("logout")
  }
  nc.addObserver(
    forName: NSWorkspace.willPowerOffNotification,
    object: nil,
    queue: nil
  ) { _ in
    emitPresenceEvent("logout")
  }

  writeStdoutLine("{\"event\":\"watching\",\"version\":\"\(helperVersion)\"}")
  RunLoop.main.run()
  return Int32(ExitCode.ok)
}

func usage() {
  writeStderr(
    """
    Usage: dotenvup-keychain <probe|set|get|has|delete|watch-presence> [account]
    set/get/has/delete require <account> (Key-Id).
    set reads 32-byte wrapping key from stdin (raw or base64).
    get prompts (Touch ID / password) then writes base64 wrapping key to stdout.
    """
  )
}

func main() -> Int32 {
  let args = Array(CommandLine.arguments.dropFirst())
  guard let command = args.first else {
    usage()
    return Int32(ExitCode.userOrUsage)
  }

  switch command {
  case "probe":
    return cmdProbe()
  case "watch-presence":
    return cmdWatchPresence()
  case "set", "get", "has", "delete":
    guard args.count >= 2 else {
      usage()
      return Int32(ExitCode.userOrUsage)
    }
    let account = args[1]
    switch command {
    case "set": return cmdSet(account: account)
    case "get": return cmdGet(account: account)
    case "has": return cmdHas(account: account)
    case "delete": return cmdDelete(account: account)
    default: break
    }
  case "-h", "--help", "help":
    usage()
    return Int32(ExitCode.ok)
  default:
    usage()
    return Int32(ExitCode.userOrUsage)
  }
  return Int32(ExitCode.userOrUsage)
}

exit(main())
