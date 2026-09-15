import Cocoa
import ApplicationServices
import Carbon
import Darwin
import AVFoundation
import Foundation

struct Grab: Codable {
  var ok: Bool
  var method: String
  var text: String
  var app: String
  var note: String
}

struct LastApp: Codable {
  var name: String
  var bundleId: String
  var pid: Int32
}

struct SavedHighlight: Codable {
  var text: String
  var app: String
  var at: Double
}

struct HotkeyConfig: Codable, Equatable {
  var key: String
  var mods: [String]
}

struct BoundHotkeys: Codable, Equatable {
  var queue: HotkeyConfig
  var play: HotkeyConfig
  var skip: HotkeyConfig
}

func defaultHotkeys() -> BoundHotkeys {
  BoundHotkeys(
    queue: HotkeyConfig(key: "down", mods: ["control", "option"]),
    play: HotkeyConfig(key: "left", mods: ["control", "option"]),
    skip: HotkeyConfig(key: "right", mods: ["control", "option"])
  )
}

func sameHotkey(_ a: HotkeyConfig, _ b: HotkeyConfig) -> Bool {
  a.key.lowercased() == b.key.lowercased() && a.mods.map { $0.lowercased() } == b.mods.map { $0.lowercased() }
}

func isLegacyStock(_ hk: HotkeyConfig?, old: HotkeyConfig) -> Bool {
  hk == nil || sameHotkey(hk!, old)
}

func keyCode(for letter: String) -> UInt32? {
  switch letter.lowercased() {
  case "a": return UInt32(kVK_ANSI_A)
  case "b": return UInt32(kVK_ANSI_B)
  case "c": return UInt32(kVK_ANSI_C)
  case "d": return UInt32(kVK_ANSI_D)
  case "e": return UInt32(kVK_ANSI_E)
  case "f": return UInt32(kVK_ANSI_F)
  case "g": return UInt32(kVK_ANSI_G)
  case "h": return UInt32(kVK_ANSI_H)
  case "i": return UInt32(kVK_ANSI_I)
  case "j": return UInt32(kVK_ANSI_J)
  case "k": return UInt32(kVK_ANSI_K)
  case "l": return UInt32(kVK_ANSI_L)
  case "m": return UInt32(kVK_ANSI_M)
  case "n": return UInt32(kVK_ANSI_N)
  case "o": return UInt32(kVK_ANSI_O)
  case "p": return UInt32(kVK_ANSI_P)
  case "q": return UInt32(kVK_ANSI_Q)
  case "r": return UInt32(kVK_ANSI_R)
  case "s": return UInt32(kVK_ANSI_S)
  case "t": return UInt32(kVK_ANSI_T)
  case "u": return UInt32(kVK_ANSI_U)
  case "v": return UInt32(kVK_ANSI_V)
  case "w": return UInt32(kVK_ANSI_W)
  case "x": return UInt32(kVK_ANSI_X)
  case "y": return UInt32(kVK_ANSI_Y)
  case "z": return UInt32(kVK_ANSI_Z)
  case "0": return UInt32(kVK_ANSI_0)
  case "1": return UInt32(kVK_ANSI_1)
  case "2": return UInt32(kVK_ANSI_2)
  case "3": return UInt32(kVK_ANSI_3)
  case "4": return UInt32(kVK_ANSI_4)
  case "5": return UInt32(kVK_ANSI_5)
  case "6": return UInt32(kVK_ANSI_6)
  case "7": return UInt32(kVK_ANSI_7)
  case "8": return UInt32(kVK_ANSI_8)
  case "9": return UInt32(kVK_ANSI_9)
  case "right": return UInt32(kVK_RightArrow)
  case "left": return UInt32(kVK_LeftArrow)
  case "up": return UInt32(kVK_UpArrow)
  case "down": return UInt32(kVK_DownArrow)
  default: return nil
  }
}

func carbonMods(_ mods: [String]) -> UInt32 {
  var flags: UInt32 = 0
  for raw in mods {
    switch raw.lowercased() {
    case "control", "ctrl": flags |= UInt32(controlKey)
    case "option", "alt": flags |= UInt32(optionKey)
    case "shift": flags |= UInt32(shiftKey)
    case "command", "cmd", "meta": flags |= UInt32(cmdKey)
    default: break
    }
  }
  return flags
}

func formatHotkey(_ hk: HotkeyConfig) -> String {
  var parts: [String] = []
  let mods = hk.mods.map { $0.lowercased() }
  if mods.contains("control") || mods.contains("ctrl") { parts.append("⌃") }
  if mods.contains("option") || mods.contains("alt") { parts.append("⌥") }
  if mods.contains("shift") { parts.append("⇧") }
  if mods.contains("command") || mods.contains("cmd") || mods.contains("meta") { parts.append("⌘") }
  switch hk.key.lowercased() {
  case "right": parts.append("→")
  case "left": parts.append("←")
  case "up": parts.append("↑")
  case "down": parts.append("↓")
  default: parts.append(hk.key.uppercased())
  }
  return parts.joined()
}

func parseHotkey(_ raw: Any?) -> HotkeyConfig? {
  guard let d = raw as? [String: Any],
        let key = d["key"] as? String,
        let mods = d["mods"] as? [String],
        keyCode(for: key) != nil,
        !mods.isEmpty else { return nil }
  return HotkeyConfig(key: key, mods: mods)
}

struct VoiceChoice: Codable {
  var id: String
  var voice: String
  var label: String
}

struct VoiceGroup: Codable {
  var model: String
  var company: String?
  var voices: [VoiceChoice]

  var title: String { company ?? companyLabel(model) }
}

struct VoiceCatalog: Codable {
  var groups: [VoiceGroup]
}

func defaultVoiceGroups() -> [VoiceGroup] {
  let grok = ["eve", "ara", "rex", "leo", "sal"]
  let gemini = ["Kore", "Puck", "Charon", "Zephyr", "Aoede", "Fenrir"]
  return [
    VoiceGroup(
      model: "x-ai/grok-voice-tts-1.0",
      company: "xai",
      voices: grok.map { VoiceChoice(id: "x-ai/grok-voice-tts-1.0::\($0)", voice: $0, label: $0) }
    ),
    VoiceGroup(
      model: "google/gemini-3.1-flash-tts-preview",
      company: "google",
      voices: gemini.map { VoiceChoice(id: "google/gemini-3.1-flash-tts-preview::\($0)", voice: $0, label: $0) }
    )
  ]
}

func loadVoiceGroups() -> [VoiceGroup] {
  let url = URL(fileURLWithPath: codaHome + "/voices.json")
  guard let data = try? Data(contentsOf: url),
        let cat = try? JSONDecoder().decode(VoiceCatalog.self, from: data),
        !cat.groups.isEmpty else {
    return defaultVoiceGroups()
  }
  return cat.groups
}

func hasOpenRouterKey() -> Bool {
  let url = URL(fileURLWithPath: codaHome + "/secrets.json")
  guard let data = try? Data(contentsOf: url),
        let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
        let key = obj["OPENROUTER_API_KEY"] as? String else {
    return false
  }
  return !key.isEmpty
}

func loadModel() -> String {
  let url = URL(fileURLWithPath: codaHome + "/config.json")
  guard let data = try? Data(contentsOf: url),
        let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
        let model = obj["model"] as? String,
        !model.isEmpty else {
    return "x-ai/grok-voice-tts-1.0"
  }
  return model
}

func currentVoiceId() -> String {
  "\(loadModel())::\(loadVoice())"
}

struct InstallPaths: Codable {
  var node: String
  var cli: String
}

func loadInstallPaths() -> (node: String, cli: String)? {
  if let node = ProcessInfo.processInfo.environment["CODA_NODE"],
     let cli = ProcessInfo.processInfo.environment["CODA_CLI"],
     !node.isEmpty, !cli.isEmpty {
    return (node, cli)
  }
  let url = URL(fileURLWithPath: codaHome + "/paths.json")
  guard let data = try? Data(contentsOf: url),
        let rec = try? JSONDecoder().decode(InstallPaths.self, from: data),
        !rec.node.isEmpty, !rec.cli.isEmpty else {
    return nil
  }
  return (rec.node, rec.cli)
}

let speedChoices: [Float] = [0.75, 1, 1.25, 1.5, 1.75, 2]

func formatSpeed(_ rate: Float) -> String {
  if abs(rate - 1) < 0.01 { return "1×" }
  let rounded = (rate * 100).rounded() / 100
  if rounded == rounded.rounded() { return "\(Int(rounded))×" }
  return String(format: "%g×", rounded)
}

func loadSpeed() -> Float {
  let url = URL(fileURLWithPath: codaHome + "/config.json")
  guard let data = try? Data(contentsOf: url),
        let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
    return 1
  }
  let raw: Double
  if let n = obj["speed"] as? Double { raw = n }
  else if let n = obj["speed"] as? Int { raw = Double(n) }
  else { return 1 }
  var best: Float = 1
  var dist = Double.infinity
  for s in speedChoices {
    let d = abs(Double(s) - raw)
    if d < dist {
      best = s
      dist = d
    }
  }
  return best
}

func loadVoice() -> String {
  let url = URL(fileURLWithPath: codaHome + "/config.json")
  guard let data = try? Data(contentsOf: url),
        let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
        let voice = obj["voice"] as? String,
        !voice.isEmpty else {
    return "eve"
  }
  return voice
}

func companyLabel(_ model: String) -> String {
  if model.hasPrefix("x-ai/") { return "xai" }
  if model.hasPrefix("openai/") { return "openai" }
  if model.hasPrefix("google/") { return "google" }
  if let slash = model.firstIndex(of: "/") {
    return String(model[..<slash])
  }
  return model
}

func voiceLabel(_ id: String) -> String {
  if let range = id.range(of: "::") {
    let model = String(id[..<range.lowerBound])
    let voice = String(id[range.upperBound...])
    return "\(voice) · \(companyLabel(model))"
  }
  return id
}

func loadHotkeys() -> BoundHotkeys {
  let defaults = defaultHotkeys()
  let url = URL(fileURLWithPath: codaHome + "/config.json")
  guard let data = try? Data(contentsOf: url),
        let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
        let raw = obj["hotkeys"] as? [String: Any] else {
    return defaults
  }
  let play = parseHotkey(raw["play"])
  let queue = parseHotkey(raw["queue"]) ?? parseHotkey(raw["pause"])
  let skip = parseHotkey(raw["skip"])
  let oldPlay = HotkeyConfig(key: "x", mods: ["control", "option"])
  let oldPause = HotkeyConfig(key: "p", mods: ["control", "option"])
  let oldSkip = HotkeyConfig(key: "right", mods: ["control", "option"])
  let prevQueue = HotkeyConfig(key: "left", mods: ["control", "option"])
  let prevPlay = HotkeyConfig(key: "down", mods: ["control", "option"])
  if (play != nil || queue != nil || skip != nil),
     isLegacyStock(play, old: oldPlay),
     isLegacyStock(queue, old: oldPause),
     isLegacyStock(skip, old: oldSkip) {
    return defaults
  }
  if let queue, let play, sameHotkey(queue, prevQueue), sameHotkey(play, prevPlay),
     isLegacyStock(skip, old: oldSkip) {
    return defaults
  }
  return BoundHotkeys(
    queue: queue ?? defaults.queue,
    play: play ?? defaults.play,
    skip: skip ?? defaults.skip
  )
}

func eventMatches(_ event: NSEvent, _ hk: HotkeyConfig) -> Bool {
  guard let code = keyCode(for: hk.key), event.keyCode == UInt16(code) else { return false }
  let mods = event.modifierFlags.intersection(.deviceIndependentFlagsMask)
    .subtracting([.capsLock, .numericPad, .function])
  let names = hk.mods.map { $0.lowercased() }
  func need(_ name: String, _ alias: String, _ flag: NSEvent.ModifierFlags) -> Bool {
    let wanted = names.contains(name) || names.contains(alias)
    return wanted == mods.contains(flag)
  }
  return need("control", "ctrl", .control)
    && need("option", "alt", .option)
    && need("shift", "shift", .shift)
    && need("command", "cmd", .command)
}

func hotkeyAction(for event: NSEvent) -> String? {
  let keys = App.shared?.currentHotkeys ?? defaultHotkeys()
  if eventMatches(event, keys.queue) { return "queue" }
  if eventMatches(event, keys.play) { return "play" }
  if eventMatches(event, keys.skip) { return "skip" }
  return nil
}

let codaHome = NSHomeDirectory() + "/.coda"
let lastAppPath = codaHome + "/last-app.json"
let lastHighlightPath = codaHome + "/last-highlight.json"
let lastGrabPath = codaHome + "/last-grab.json"
let playbackPath = codaHome + "/playback.json"
let playerCmdPath = codaHome + "/player-cmd.json"
let grabCmdPath = codaHome + "/grab-cmd.json"
let queuePath = codaHome + "/queue.json"
let hotkeyPressPath = codaHome + "/hotkey-press.json"

struct QueueInfo: Codable {
  var count: Int
}

struct GrabCmd: Codable {
  var id: Double
}

struct HotkeyPress: Codable {
  var at: Double
  var trusted: Bool
}

struct PlayerCmd: Codable {
  var action: String
  var file: String
  var id: Double
}

struct PlaybackState: Codable {
  var playing: Bool
  var paused: Bool
  var file: String
  var loading: Bool

  init(playing: Bool, paused: Bool, file: String = "", loading: Bool = false) {
    self.playing = playing
    self.paused = paused
    self.file = file
    self.loading = loading
  }

  init(from decoder: Decoder) throws {
    let c = try decoder.container(keyedBy: CodingKeys.self)
    playing = try c.decodeIfPresent(Bool.self, forKey: .playing) ?? false
    paused = try c.decodeIfPresent(Bool.self, forKey: .paused) ?? false
    file = try c.decodeIfPresent(String.self, forKey: .file) ?? ""
    loading = try c.decodeIfPresent(Bool.self, forKey: .loading) ?? false
  }
}

func writePlayback(playing: Bool, paused: Bool, file: String = "", loading: Bool = false) {
  writeJson(PlaybackState(playing: playing, paused: paused, file: file, loading: loading), to: playbackPath)
}

func sendPlayerCommand(action: String, file: String) {
  writeJson(PlayerCmd(action: action, file: file, id: Date().timeIntervalSince1970), to: playerCmdPath)
}

final class Sound: NSObject, AVAudioPlayerDelegate {
  var player: AVAudioPlayer?
  var file = ""
  var rate: Float = 1

  func applyRate() {
    player?.enableRate = true
    player?.rate = rate
  }

  func setRate(_ value: Float) {
    rate = value
    applyRate()
  }

  func play(path: String) {
    stop()
    let url = URL(fileURLWithPath: path)
    do {
      player = try AVAudioPlayer(contentsOf: url)
    } catch {
      writePlayback(playing: false, paused: false)
      return
    }
    player?.delegate = self
    player?.enableRate = true
    player?.rate = rate
    player?.prepareToPlay()
    player?.play()
    file = path
    writePlayback(playing: true, paused: false, file: path)
  }

  func pause() {
    guard let player else { return }
    if player.isPlaying { player.pause() }
    writePlayback(playing: false, paused: true, file: file)
  }

  func resumePlay() {
    guard let player else { return }
    if !player.isPlaying { player.play() }
    writePlayback(playing: true, paused: false, file: file)
  }

  func stop() {
    player?.stop()
    player = nil
    file = ""
    writePlayback(playing: false, paused: false)
  }

  func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
    writePlayback(playing: false, paused: false, file: file)
    self.player = nil
  }
}

func ignoreApp(_ name: String, bundleId: String) -> Bool {
  let n = name.lowercased()
  if bundleId == "com.cstaton.coda" { return true }
  return n == "coda" || n == "codabar" || n.contains("codabar")
}

func windowTitles(pid: pid_t) -> [String] {
  let appEl = AXUIElementCreateApplication(pid)
  var value: CFTypeRef?
  guard AXUIElementCopyAttributeValue(appEl, kAXWindowsAttribute as CFString, &value) == .success,
        let windows = value as? [AXUIElement] else { return [] }
  return windows.compactMap { win in
    var title: CFTypeRef?
    guard AXUIElementCopyAttributeValue(win, kAXTitleAttribute as CFString, &title) == .success else {
      return nil
    }
    return title as? String
  }
}

func isCodaFront(_ app: NSRunningApplication) -> Bool {
  let name = app.localizedName ?? ""
  let bundle = app.bundleIdentifier ?? ""
  if ignoreApp(name, bundleId: bundle) { return true }
  if bundle == "com.google.Chrome" {
    return windowTitles(pid: app.processIdentifier).contains {
      $0.localizedCaseInsensitiveContains("coda") || $0.contains("127.0.0.1:8787")
    }
  }
  return false
}

func running(named name: String, bundleId: String, pid: Int32) -> NSRunningApplication? {
  if let byPid = NSRunningApplication(processIdentifier: pid), !byPid.isTerminated {
    return byPid
  }
  if !bundleId.isEmpty {
    return NSWorkspace.shared.runningApplications.first { $0.bundleIdentifier == bundleId && !$0.isTerminated }
  }
  return NSWorkspace.shared.runningApplications.first { $0.localizedName == name && !$0.isTerminated }
}

func loadLastApp() -> LastApp? {
  guard let data = try? Data(contentsOf: URL(fileURLWithPath: lastAppPath)) else { return nil }
  return try? JSONDecoder().decode(LastApp.self, from: data)
}

func saveLastApp(_ app: NSRunningApplication) {
  guard let name = app.localizedName else { return }
  if isCodaFront(app) { return }
  let rec = LastApp(name: name, bundleId: app.bundleIdentifier ?? "", pid: app.processIdentifier)
  writeJson(rec, to: lastAppPath)
}

func targetApp() -> NSRunningApplication? {
  let front = NSWorkspace.shared.frontmostApplication
  if let front, !isCodaFront(front) { return front }
  if let last = loadLastApp(), let app = running(named: last.name, bundleId: last.bundleId, pid: last.pid) {
    return app
  }
  return front
}

func writeJson<T: Encodable>(_ value: T, to path: String) {
  try? FileManager.default.createDirectory(atPath: codaHome, withIntermediateDirectories: true)
  if let data = try? JSONEncoder().encode(value) {
    try? data.write(to: URL(fileURLWithPath: path))
  }
}

func looksLikeSecret(_ text: String) -> Bool {
  let t = text.trimmingCharacters(in: .whitespacesAndNewlines)
  return t.hasPrefix("sk-") || t.hasPrefix("sk-or-") || t.hasPrefix("sk-xai-")
}

func tokenCore(_ token: String) -> (String, String, String) {
  let chars = Array(token)
  var i = 0
  var j = chars.count
  func wordChar(_ c: Character) -> Bool { c.isLetter || c.isNumber }
  while i < j && !wordChar(chars[i]) { i += 1 }
  while j > i && !wordChar(chars[j - 1]) { j -= 1 }
  return (String(chars[0..<i]), String(chars[i..<j]), String(chars[j..<chars.count]))
}

func looksLikeUUID(_ text: String) -> Bool {
  let parts = text.split(separator: "-")
  guard parts.count == 5,
        parts[0].count == 8, parts[1].count == 4,
        parts[2].count == 4, parts[3].count == 4,
        parts[4].count == 12 else { return false }
  return text.allSatisfy { $0.isHexDigit || $0 == "-" }
}

func isUnreadableToken(_ token: String) -> Bool {
  let core = tokenCore(token).1
  if core.isEmpty { return false }
  if looksLikeSecret(core) { return true }
  if looksLikeUUID(core) { return true }
  let digits = core.filter { $0.isNumber }
  if digits.count >= 13 && core.allSatisfy({ $0.isNumber || $0 == "," || $0 == "_" }) { return true }
  if core.count >= 20 && core.allSatisfy({ $0.isHexDigit }) { return true }
  return core.count > 24
}

func spokenWord(_ core: String) -> String {
  if core.allSatisfy({ $0.isNumber || $0 == "," || $0 == "_" }) && core.filter({ $0.isNumber }).count >= 13 {
    return "number"
  }
  return "code"
}

func forSpeech(_ text: String) -> String {
  let parts = text.split(separator: " ", omittingEmptySubsequences: false)
  let swapped = parts.map { raw -> String in
    let token = String(raw)
    if token.isEmpty || !isUnreadableToken(token) { return token }
    let pieces = tokenCore(token)
    return pieces.0 + spokenWord(pieces.1) + pieces.2
  }
  return swapped.joined(separator: " ")
    .replacingOccurrences(of: "  +", with: " ", options: .regularExpression)
    .trimmingCharacters(in: .whitespacesAndNewlines)
}

func saveHighlight(_ text: String, app: String) {
  let trimmed = forSpeech(text)
  if trimmed.count < 2 || looksLikeSecret(trimmed) { return }
  writeJson(SavedHighlight(text: trimmed, app: app, at: Date().timeIntervalSince1970), to: lastHighlightPath)
}

func loadHighlight(forApp name: String = "") -> SavedHighlight? {
  guard let data = try? Data(contentsOf: URL(fileURLWithPath: lastHighlightPath)),
        let rec = try? JSONDecoder().decode(SavedHighlight.self, from: data) else { return nil }
  if Date().timeIntervalSince1970 - rec.at > 2 { return nil }
  if !name.isEmpty, rec.app != name { return nil }
  if rec.text.count < 2 || looksLikeSecret(rec.text) { return nil }
  return rec
}

func clipboardString() -> String {
  NSPasteboard.general.string(forType: .string)?
    .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
}

func setClipboard(_ value: String) {
  let pb = NSPasteboard.general
  pb.clearContents()
  pb.setString(value, forType: .string)
}

func axAttrString(_ el: AXUIElement, _ attr: CFString) -> String? {
  var val: CFTypeRef?
  guard AXUIElementCopyAttributeValue(el, attr, &val) == .success else { return nil }
  let text = (val as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
  return text.isEmpty ? nil : text
}

func axSelectedTextOn(_ el: AXUIElement) -> String? {
  axAttrString(el, kAXSelectedTextAttribute as CFString)
}

func axSelectedText(pid: pid_t) -> String {
  let appEl = AXUIElementCreateApplication(pid)
  if let text = axSelectedTextOn(appEl) { return text }
  var focused: CFTypeRef?
  guard AXUIElementCopyAttributeValue(appEl, kAXFocusedUIElementAttribute as CFString, &focused) == .success,
        let raw = focused else { return "" }
  var element = unsafeBitCast(raw, to: AXUIElement.self)
  for _ in 0..<8 {
    if let text = axSelectedTextOn(element) { return text }
    var parent: CFTypeRef?
    guard AXUIElementCopyAttributeValue(element, kAXParentAttribute as CFString, &parent) == .success,
          let pref = parent else { break }
    element = unsafeBitCast(pref, to: AXUIElement.self)
  }
  return ""
}

func modifiersHeld() -> Bool {
  let flags = CGEventSource.flagsState(.hidSystemState)
  return flags.contains(.maskControl)
    || flags.contains(.maskAlternate)
    || flags.contains(.maskCommand)
    || flags.contains(.maskShift)
}

func waitForModifiersUp() {
  for _ in 0..<40 {
    if !modifiersHeld() { return }
    usleep(25_000)
  }
}

func postCmdC(to pid: pid_t?, hid: Bool) {
  let src = CGEventSource(stateID: .privateState)
  let down = CGEvent(keyboardEventSource: src, virtualKey: 8, keyDown: true)
  let up = CGEvent(keyboardEventSource: src, virtualKey: 8, keyDown: false)
  down?.flags = .maskCommand
  up?.flags = .maskCommand
  if hid {
    down?.post(tap: .cghidEventTap)
    up?.post(tap: .cghidEventTap)
  } else if let pid {
    down?.postToPid(pid)
    up?.postToPid(pid)
  }
}

func waitForClipboardChange(count: Int, previous: String) -> String? {
  for _ in 0..<32 {
    usleep(25_000)
    if NSPasteboard.general.changeCount == count { continue }
    let now = clipboardString()
    if now != previous { setClipboard(previous) }
    return now
  }
  return nil
}

func copyInApp(_ app: NSRunningApplication) -> String {
  waitForModifiersUp()
  let board = NSPasteboard.general
  let previous = clipboardString()
  let count = board.changeCount
  postCmdC(to: nil, hid: true)
  if let now = waitForClipboardChange(count: count, previous: previous), !now.isEmpty {
    return now
  }
  postCmdC(to: app.processIdentifier, hid: false)
  return waitForClipboardChange(count: board.changeCount, previous: previous) ?? ""
}

func rememberFrontSelection() {
  guard let app = NSWorkspace.shared.frontmostApplication, !isCodaFront(app) else { return }
  let ax = axSelectedText(pid: app.processIdentifier)
  if !ax.isEmpty {
    saveHighlight(ax, app: app.localizedName ?? "app")
  }
}

func codaHotKeyCallback(
  _ nextHandler: EventHandlerCallRef?,
  _ theEvent: EventRef?,
  _ userData: UnsafeMutableRawPointer?
) -> OSStatus {
  guard let theEvent else { return noErr }
  var id = EventHotKeyID()
  GetEventParameter(
    theEvent,
    EventParamName(kEventParamDirectObject),
    EventParamType(typeEventHotKeyID),
    nil,
    MemoryLayout<EventHotKeyID>.size,
    nil,
    &id
  )
  DispatchQueue.main.async {
    if id.id == 1 {
      App.shared?.togglePauseAudio()
    } else if id.id == 3 {
      App.shared?.skipHighlight()
    } else {
      App.shared?.speakHighlight()
    }
  }
  return noErr
}

func grabHighlight() -> Grab {
  guard let app = targetApp() else {
    let grab = Grab(ok: false, method: "selection", text: "", app: "", note: "no app in front")
    writeJson(grab, to: lastGrabPath)
    return grab
  }
  let name = app.localizedName ?? "app"
  let front = NSWorkspace.shared.frontmostApplication
  if let front, isCodaFront(front), front != app {
    app.activate()
    usleep(180_000)
  }

  let ax = axSelectedText(pid: app.processIdentifier)
  if !ax.isEmpty {
    let spoken = forSpeech(ax)
    saveHighlight(spoken, app: name)
    let grab = Grab(ok: !spoken.isEmpty, method: "highlight", text: spoken, app: name, note: "highlighted text")
    writeJson(grab, to: lastGrabPath)
    return grab
  }

  let copied = copyInApp(app)
  if !copied.isEmpty {
    let spoken = forSpeech(copied)
    saveHighlight(spoken, app: name)
    let grab = Grab(ok: !spoken.isEmpty, method: "copy", text: spoken, app: name, note: "read the highlight via Copy")
    writeJson(grab, to: lastGrabPath)
    return grab
  }

  if let cached = loadHighlight(forApp: name) {
    let grab = Grab(ok: true, method: "remembered", text: cached.text, app: cached.app, note: "highlighted text")
    writeJson(grab, to: lastGrabPath)
    return grab
  }

  let trusted = AXIsProcessTrusted()
  let note = trusted
    ? "Highlight the text, let go of the mouse, then tap Play."
    : "Turn on Coda in System Settings → Privacy & Security → Accessibility, then try again."
  let grab = Grab(ok: false, method: "selection", text: "", app: name, note: note)
  writeJson(grab, to: lastGrabPath)
  return grab
}

func notify(_ title: String, _ body: String) {
  let n = NSUserNotification()
  n.title = title
  n.informativeText = body
  NSUserNotificationCenter.default.deliver(n)
}

func menuIconCandidates() -> [String] {
  var paths: [String] = []
  if let bundled = Bundle.main.path(forResource: "MenuIcon", ofType: "png") {
    paths.append(bundled)
  }
  if let exe = CommandLine.arguments.first {
    let dir = URL(fileURLWithPath: exe).deletingLastPathComponent()
    paths.append(dir.appendingPathComponent("MenuIcon.png").path)
    paths.append(dir.deletingLastPathComponent().appendingPathComponent("Resources").appendingPathComponent("MenuIcon.png").path)
  }
  paths.append(codaHome + "/bin/MenuIcon.png")
  return paths
}

func codaMenuImage(points: CGFloat = 18) -> NSImage {
  for path in menuIconCandidates() where FileManager.default.fileExists(atPath: path) {
    if let image = NSImage(contentsOfFile: path) {
      image.size = NSSize(width: points, height: points)
      image.isTemplate = true
      return image
    }
  }
  return NSImage(size: NSSize(width: points, height: points))
}

func claimMenuBarLock() -> Bool {
  try? FileManager.default.createDirectory(atPath: codaHome, withIntermediateDirectories: true)
  let fd = open(codaHome + "/menubar.lock", O_CREAT | O_RDWR, 0o644)
  guard fd >= 0 else { return true }
  if flock(fd, LOCK_EX | LOCK_NB) != 0 {
    close(fd)
    return false
  }
  return true
}

final class App: NSObject, NSApplicationDelegate {
  var item: NSStatusItem!
  var mouseMonitor: Any?
  var keyMonitor: Any?
  var hotkeyMonitor: Any?
  var localHotkeyMonitor: Any?
  var cacheWork: DispatchWorkItem?
  var lastSpeakAt: TimeInterval = 0
  var lastPauseAt: TimeInterval = 0
  var lastSkipAt: TimeInterval = 0
  var lastQueueCount = -1
  var currentHotkeys = defaultHotkeys()
  var carbonRefs: [EventHotKeyRef] = []
  var configTimer: Timer?
  var lastHotkeySig = ""
  var lastVoiceId = ""
  var lastVoiceStamp = ""
  var lastSpeed: Float = 1
  var lastPlayerCmdId: Double = 0
  var lastGrabCmdId: Double = 0
  var lastAccessNudge: TimeInterval = 0
  var busy = false
  let sound = Sound()
  var node = "/usr/bin/env"
  var cli = ""
  let settingsURL = URL(string: "http://127.0.0.1:8787")!

  func applicationDidFinishLaunching(_ notification: Notification) {
    NSApp.setActivationPolicy(.accessory)
    requestAccessibility()
    refreshTrust()
    watchApps()
    watchSelections()
    if let front = NSWorkspace.shared.frontmostApplication { saveLastApp(front) }
    if let found = loadInstallPaths() {
      node = found.node
      cli = found.cli
    }
    adoptExistingPlayerCmd()
    adoptExistingGrabCmd()
    writePlayback(playing: false, paused: false)
    lastSpeed = loadSpeed()
    sound.setRate(lastSpeed)
    item = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
    item.button?.image = codaMenuImage()
    item.button?.imagePosition = .imageOnly
    item.button?.title = ""
    item.button?.toolTip = "Coda"
    item.button?.setAccessibilityTitle("Coda")
    refreshTrust()
    rebuildMenu()
    ensureUi()
    registerHotkeys()
  }

  func requestAccessibility() {
    let key = kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String
    _ = AXIsProcessTrustedWithOptions([key: true] as CFDictionary)
  }

  func refreshTrust() {
    let trusted = AXIsProcessTrusted()
    writeJson(["trusted": trusted] as [String: Bool], to: codaHome + "/ax.json")
    item?.button?.toolTip = trusted ? "Coda" : "Coda needs Accessibility"
  }

  func openAccessibilitySettings() {
    let candidates = [
      "x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension?Privacy_Accessibility",
      "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility",
    ]
    for raw in candidates {
      if let url = URL(string: raw) {
        NSWorkspace.shared.open(url)
        return
      }
    }
  }

  func nudgeAccess() {
    let now = Date().timeIntervalSince1970
    if now - lastAccessNudge < 8 { return }
    lastAccessNudge = now
    requestAccessibility()
    openAccessibilitySettings()
    notify("Coda", "Remove Coda in Accessibility, add Coda.app again, turn it on, then quit Coda and open it.")
  }

  func adoptExistingPlayerCmd() {
    guard let data = try? Data(contentsOf: URL(fileURLWithPath: playerCmdPath)),
          let cmd = try? JSONDecoder().decode(PlayerCmd.self, from: data) else { return }
    lastPlayerCmdId = cmd.id
  }

  func pollPlayerCmd() {
    guard let data = try? Data(contentsOf: URL(fileURLWithPath: playerCmdPath)),
          let cmd = try? JSONDecoder().decode(PlayerCmd.self, from: data),
          cmd.id != lastPlayerCmdId else { return }
    lastPlayerCmdId = cmd.id
    handlePlayer(["action": cmd.action, "file": cmd.file])
  }

  func adoptExistingGrabCmd() {
    guard let data = try? Data(contentsOf: URL(fileURLWithPath: grabCmdPath)),
          let cmd = try? JSONDecoder().decode(GrabCmd.self, from: data) else { return }
    lastGrabCmdId = cmd.id
  }

  func pollGrabCmd() {
    guard let data = try? Data(contentsOf: URL(fileURLWithPath: grabCmdPath)),
          let cmd = try? JSONDecoder().decode(GrabCmd.self, from: data),
          cmd.id != lastGrabCmdId else { return }
    lastGrabCmdId = cmd.id
    _ = grabHighlight()
  }

  func audioIsPlaying() -> Bool {
    sound.player?.isPlaying == true
  }

  func audioIsPaused() -> Bool {
    guard let player = sound.player else { return false }
    return !player.isPlaying && !sound.file.isEmpty
  }

  func flashIcon() {
    item.button?.alphaValue = 0.22
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.12) { [weak self] in
      if self?.busy == true { return }
      self?.item.button?.alphaValue = 1
    }
  }

  func showBusy() {
    busy = true
    item.button?.alphaValue = 0.22
    item.button?.toolTip = "Getting the voice…"
  }

  func startBusy() {
    writePlayback(playing: false, paused: false, loading: true)
    showBusy()
  }

  func stopBusy() {
    busy = false
    item.button?.alphaValue = 1
    item.button?.toolTip = "Coda"
  }

  func handlePlayer(_ info: [String: Any]) {
    let action = String(describing: info["action"] ?? "")
    let file = String(describing: info["file"] ?? "")
    switch action {
    case "loading":
      startBusy()
    case "play":
      stopBusy()
      if !file.isEmpty { sound.play(path: file) }
    case "pause":
      stopBusy()
      sound.pause()
    case "resume":
      stopBusy()
      sound.resumePlay()
    case "stop":
      stopBusy()
      sound.stop()
    default:
      break
    }
  }

  func watchApps() {
    NSWorkspace.shared.notificationCenter.addObserver(
      forName: NSWorkspace.didActivateApplicationNotification,
      object: nil,
      queue: .main
    ) { note in
      if let app = note.userInfo?[NSWorkspace.applicationUserInfoKey] as? NSRunningApplication {
        saveLastApp(app)
      }
    }
  }

  func watchSelections() {
    mouseMonitor = NSEvent.addGlobalMonitorForEvents(matching: [.leftMouseUp]) { [weak self] _ in
      self?.scheduleRemember()
    }
    keyMonitor = NSEvent.addGlobalMonitorForEvents(matching: [.keyUp]) { [weak self] event in
      // Keyboard selection only — never Command, or a fake Copy loops and the Edit menu flashes.
      if event.modifierFlags.contains(.shift), !event.modifierFlags.contains(.command) {
        self?.scheduleRemember()
      }
    }
  }

  func scheduleRemember() {
    cacheWork?.cancel()
    let work = DispatchWorkItem { rememberFrontSelection() }
    cacheWork = work
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.16, execute: work)
  }

  func voicesStamp() -> String {
    let keyed = hasOpenRouterKey() ? "1" : "0"
    let path = codaHome + "/voices.json"
    var mtime = 0.0
    if let attrs = try? FileManager.default.attributesOfItem(atPath: path),
       let date = attrs[.modificationDate] as? Date {
      mtime = date.timeIntervalSince1970
    }
    return "\(keyed)|\(mtime)|\(currentVoiceId())|\(loadSpeed())"
  }

  func rebuildMenu() {
    lastVoiceId = currentVoiceId()
    lastSpeed = loadSpeed()
    lastVoiceStamp = voicesStamp()
    sound.setRate(lastSpeed)
    let menu = NSMenu()
    menu.addItem(withTitle: "Open Coda", action: #selector(openSettings), keyEquivalent: "o")
    menu.addItem(NSMenuItem.separator())
    menu.addItem(withTitle: "Queue  (\(formatHotkey(currentHotkeys.queue)))", action: #selector(queueSelection), keyEquivalent: "")
    menu.addItem(withTitle: "Play / pause  (\(formatHotkey(currentHotkeys.play)))", action: #selector(playSelection), keyEquivalent: "")
    menu.addItem(withTitle: "Skip  (\(formatHotkey(currentHotkeys.skip)))", action: #selector(skipSelection), keyEquivalent: "")
    menu.addItem(withTitle: "Stop", action: #selector(stop), keyEquivalent: ".")
    if !AXIsProcessTrusted() {
      menu.addItem(withTitle: "Turn on Accessibility…", action: #selector(showAccess), keyEquivalent: "")
    }
    menu.addItem(NSMenuItem.separator())
    if hasOpenRouterKey() {
      let voiceMenu = NSMenu()
      for group in loadVoiceGroups() {
        let sub = NSMenu()
        for choice in group.voices {
          let voiceItem = NSMenuItem(title: choice.label, action: #selector(pickVoice(_:)), keyEquivalent: "")
          voiceItem.target = self
          voiceItem.representedObject = choice.id
          voiceItem.state = choice.id == lastVoiceId ? .on : .off
          sub.addItem(voiceItem)
        }
        let groupItem = NSMenuItem(title: group.title, action: nil, keyEquivalent: "")
        groupItem.submenu = sub
        voiceMenu.addItem(groupItem)
      }
      let voiceParent = NSMenuItem(title: "Voice  \(voiceLabel(lastVoiceId))", action: nil, keyEquivalent: "")
      voiceParent.submenu = voiceMenu
      menu.addItem(voiceParent)
    }
    let speedMenu = NSMenu()
    for rate in speedChoices {
      let speedItem = NSMenuItem(title: formatSpeed(rate), action: #selector(pickSpeed(_:)), keyEquivalent: "")
      speedItem.target = self
      speedItem.representedObject = rate
      speedItem.state = abs(rate - lastSpeed) < 0.01 ? .on : .off
      speedMenu.addItem(speedItem)
    }
    let speedParent = NSMenuItem(title: "Speed  \(formatSpeed(lastSpeed))", action: nil, keyEquivalent: "")
    speedParent.submenu = speedMenu
    menu.addItem(speedParent)
    menu.addItem(NSMenuItem.separator())
    menu.addItem(withTitle: "Quit Coda", action: #selector(quit), keyEquivalent: "q")
    item.menu = menu
  }

  func runCoda(_ args: [String], stdin: String? = nil, wait: Bool = false) {
    if cli.isEmpty {
      if let found = loadInstallPaths() {
        node = found.node
        cli = found.cli
      } else {
        return
      }
    }
    let task = Process()
    task.executableURL = URL(fileURLWithPath: node)
    task.arguments = [cli] + args
    if let stdin {
      let pipe = Pipe()
      task.standardInput = pipe
      task.standardOutput = FileHandle.nullDevice
      task.standardError = FileHandle.nullDevice
      try? task.run()
      pipe.fileHandleForWriting.write(Data(stdin.utf8))
      try? pipe.fileHandleForWriting.close()
    } else {
      task.standardOutput = FileHandle.nullDevice
      task.standardError = FileHandle.nullDevice
      try? task.run()
    }
    if wait { task.waitUntilExit() }
  }

  func ensureUi() {
    let task = Process()
    task.executableURL = URL(fileURLWithPath: node)
    task.arguments = [cli, "ui", "--no-open"]
    task.standardOutput = FileHandle.nullDevice
    task.standardError = FileHandle.nullDevice
    try? task.run()
  }

  func togglePauseAudio() {
    let now = Date().timeIntervalSince1970
    if now - lastPauseAt < 0.3 { return }
    lastPauseAt = now
    flashIcon()
    if audioIsPlaying() {
      sound.pause()
      return
    }
    if audioIsPaused() {
      sound.resumePlay()
      return
    }
    runCoda(["toggle-pause"])
  }

  func applyQueueCount(_ n: Int) {
    if n == lastQueueCount { return }
    lastQueueCount = n
    if n > 0 {
      item.length = NSStatusItem.variableLength
      item.button?.imagePosition = .imageLeft
      item.button?.title = "\(n)"
    } else {
      item.length = NSStatusItem.squareLength
      item.button?.imagePosition = .imageOnly
      item.button?.title = ""
    }
  }

  func pollQueue() {
    guard let data = try? Data(contentsOf: URL(fileURLWithPath: queuePath)),
          let info = try? JSONDecoder().decode(QueueInfo.self, from: data) else {
      applyQueueCount(0)
      return
    }
    applyQueueCount(max(0, info.count))
  }

  func skipHighlight() {
    let now = Date().timeIntervalSince1970
    if now - lastSkipAt < 0.3 { return }
    lastSkipAt = now
    flashIcon()
    runCoda(["skip"])
  }

  func speakHighlight() {
    let now = Date().timeIntervalSince1970
    if now - lastSpeakAt < 0.5 { return }
    lastSpeakAt = now
    writeJson(HotkeyPress(at: now, trusted: AXIsProcessTrusted()), to: hotkeyPressPath)
    let occupied = audioIsPlaying() || audioIsPaused() || busy
    if occupied { flashIcon() } else { showBusy() }
    refreshTrust()
    if !AXIsProcessTrusted() {
      stopBusy()
      nudgeAccess()
      return
    }
    let grab = grabHighlight()
    guard grab.ok,
          let data = try? JSONEncoder().encode(grab),
          let raw = String(data: data, encoding: .utf8) else {
      stopBusy()
      notify("Coda", grab.note)
      return
    }
    DispatchQueue.global(qos: .userInitiated).async { [weak self] in
      self?.runCoda(["play-selection"], stdin: raw, wait: true)
      DispatchQueue.main.async {
        guard let self, self.busy, self.sound.player?.isPlaying != true else { return }
        self.stopBusy()
      }
    }
  }

  func registerHotkeys() {
    var spec = EventTypeSpec(eventClass: OSType(kEventClassKeyboard), eventKind: UInt32(kEventHotKeyPressed))
    InstallEventHandler(GetApplicationEventTarget(), codaHotKeyCallback, 1, &spec, nil, nil)
    InstallEventHandler(GetEventDispatcherTarget(), codaHotKeyCallback, 1, &spec, nil, nil)
    applyHotkeys(loadHotkeys())
    hotkeyMonitor = NSEvent.addGlobalMonitorForEvents(matching: .keyDown) { [weak self] event in
      self?.handleHotkey(event)
    }
    localHotkeyMonitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { [weak self] event in
      if self?.handleHotkey(event) == true { return nil }
      return event
    }
    configTimer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in
      self?.reloadHotkeysIfNeeded()
      self?.refreshTrust()
    }
    Timer.scheduledTimer(withTimeInterval: 0.05, repeats: true) { [weak self] _ in
      self?.pollPlayerCmd()
      self?.pollGrabCmd()
      self?.pollQueue()
    }
  }

  func handleHotkey(_ event: NSEvent) -> Bool {
    let action = hotkeyAction(for: event)
    if action == "queue" {
      speakHighlight()
      return true
    }
    if action == "play" {
      togglePauseAudio()
      return true
    }
    if action == "skip" {
      skipHighlight()
      return true
    }
    return false
  }

  func hotkeySig(_ keys: BoundHotkeys) -> String {
    "\(keys.queue.mods.joined(separator: "+"))+\(keys.queue.key)/\(keys.play.mods.joined(separator: "+"))+\(keys.play.key)/\(keys.skip.mods.joined(separator: "+"))+\(keys.skip.key)"
  }

  func reloadHotkeysIfNeeded() {
    let next = loadHotkeys()
    let sig = hotkeySig(next)
    let stamp = voicesStamp()
    if sig != lastHotkeySig {
      applyHotkeys(next)
      return
    }
    if stamp != lastVoiceStamp, item != nil {
      lastVoiceStamp = stamp
      lastVoiceId = currentVoiceId()
      lastSpeed = loadSpeed()
      sound.setRate(lastSpeed)
      rebuildMenu()
    }
  }

  func registerCarbon(_ hk: HotkeyConfig, id: UInt32) -> Int {
    guard let code = keyCode(for: hk.key) else { return -1 }
    var ref: EventHotKeyRef?
    let status = RegisterEventHotKey(
      code,
      carbonMods(hk.mods),
      EventHotKeyID(signature: OSType(0x434F4441), id: id),
      GetApplicationEventTarget(),
      0,
      &ref
    )
    if let ref { carbonRefs.append(ref) }
    return Int(status)
  }

  func applyHotkeys(_ keys: BoundHotkeys) {
    currentHotkeys = keys
    lastHotkeySig = hotkeySig(currentHotkeys)
    for ref in carbonRefs {
      UnregisterEventHotKey(ref)
    }
    carbonRefs.removeAll()
    let playStatus = registerCarbon(currentHotkeys.play, id: 1)
    let queueStatus = registerCarbon(currentHotkeys.queue, id: 2)
    let skipStatus = registerCarbon(currentHotkeys.skip, id: 3)
    struct HotkeyInfo: Codable {
      var carbon: Int
      var queue: String
      var play: String
      var skip: String
    }
    writeJson(
      HotkeyInfo(
        carbon: playStatus + queueStatus + skipStatus,
        queue: formatHotkey(currentHotkeys.queue),
        play: formatHotkey(currentHotkeys.play),
        skip: formatHotkey(currentHotkeys.skip)
      ),
      to: codaHome + "/hotkey.json"
    )
    if item != nil { rebuildMenu() }
  }

  @objc func openSettings() {
    ensureUi()
    NSWorkspace.shared.open(settingsURL)
  }
  @objc func showAccess() { nudgeAccess() }
  @objc func queueSelection() { speakHighlight() }
  @objc func playSelection() { togglePauseAudio() }
  @objc func skipSelection() { skipHighlight() }
  @objc func stop() { runCoda(["stop"]) }
  @objc func pickVoice(_ sender: NSMenuItem) {
    guard let id = sender.representedObject as? String else { return }
    runCoda(["voice", id], wait: true)
    lastVoiceId = id
    rebuildMenu()
  }
  @objc func pickSpeed(_ sender: NSMenuItem) {
    guard let rate = sender.representedObject as? Float else { return }
    lastSpeed = rate
    sound.setRate(rate)
    runCoda(["speed", formatSpeed(rate).replacingOccurrences(of: "×", with: "")], wait: true)
    rebuildMenu()
  }
  @objc func quit() { NSApp.terminate(nil) }

  static var shared: App?
}

let args = Array(CommandLine.arguments.dropFirst())
if args.contains("--grab") {
  let result = grabHighlight()
  let data = try! JSONEncoder().encode(result)
  FileHandle.standardOutput.write(data)
  FileHandle.standardOutput.write(Data("\n".utf8))
  exit(0)
}

if let i = args.firstIndex(of: "--ctl") {
  let action = args.indices.contains(i + 1) ? args[i + 1] : ""
  var file = ""
  if let f = args.firstIndex(of: "--file"), args.indices.contains(f + 1) {
    file = args[f + 1]
  }
  sendPlayerCommand(action: action, file: file)
  let deadline = Date().addingTimeInterval(0.5)
  while Date() < deadline {
    if let data = try? Data(contentsOf: URL(fileURLWithPath: playbackPath)),
       let rec = try? JSONDecoder().decode(PlaybackState.self, from: data) {
      if action == "loading" && rec.loading { break }
      if action == "play" && rec.playing { break }
      if action == "pause" && rec.paused { break }
      if action == "resume" && rec.playing { break }
      if action == "stop" && !rec.playing && !rec.paused { break }
    }
    usleep(15_000)
  }
  exit(0)
}

if !claimMenuBarLock() {
  exit(0)
}

let app = NSApplication.shared
let delegate = App()
App.shared = delegate
app.delegate = delegate
app.run()
