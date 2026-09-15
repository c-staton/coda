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
  var play: HotkeyConfig
}

func defaultHotkeys() -> BoundHotkeys {
  BoundHotkeys(play: HotkeyConfig(key: "x", mods: ["control", "option"]))
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
  parts.append(hk.key.uppercased())
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

let voices: [(id: String, label: String)] = [
  ("eve", "Eve"),
  ("ara", "Ara"),
  ("rex", "Rex"),
  ("leo", "Leo"),
  ("sal", "Sal"),
]

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

func loadVoice() -> String {
  let url = URL(fileURLWithPath: codaHome + "/config.json")
  guard let data = try? Data(contentsOf: url),
        let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
        let voice = obj["voice"] as? String,
        !voice.isEmpty else {
    return "eve"
  }
  return voice.lowercased()
}

func voiceLabel(_ id: String) -> String {
  voices.first(where: { $0.id == id })?.label ?? id.capitalized
}

func loadHotkeys() -> BoundHotkeys {
  let defaults = defaultHotkeys()
  let url = URL(fileURLWithPath: codaHome + "/config.json")
  guard let data = try? Data(contentsOf: url),
        let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
        let raw = obj["hotkeys"] as? [String: Any] else {
    return defaults
  }
  return BoundHotkeys(play: parseHotkey(raw["play"]) ?? defaults.play)
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
  if eventMatches(event, keys.play) { return "play" }
  return nil
}

let codaHome = NSHomeDirectory() + "/.coda"
let lastAppPath = codaHome + "/last-app.json"
let lastHighlightPath = codaHome + "/last-highlight.json"
let lastGrabPath = codaHome + "/last-grab.json"
let playbackPath = codaHome + "/playback.json"
let playerCmdPath = codaHome + "/player-cmd.json"

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
    player?.prepareToPlay()
    player?.play()
    file = path
    writePlayback(playing: true, paused: false, file: path)
  }

  func pause() {
    guard let player, player.isPlaying else { return }
    player.pause()
    writePlayback(playing: false, paused: true, file: file)
  }

  func resumePlay() {
    guard let player, !player.isPlaying else { return }
    player.play()
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

func saveHighlight(_ text: String, app: String) {
  let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
  if trimmed.count < 2 || looksLikeSecret(trimmed) { return }
  writeJson(SavedHighlight(text: trimmed, app: app, at: Date().timeIntervalSince1970), to: lastHighlightPath)
}

func loadHighlight() -> SavedHighlight? {
  guard let data = try? Data(contentsOf: URL(fileURLWithPath: lastHighlightPath)),
        let rec = try? JSONDecoder().decode(SavedHighlight.self, from: data) else { return nil }
  if Date().timeIntervalSince1970 - rec.at > 300 { return nil }
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

func axSelectedText(pid: pid_t) -> String {
  let appEl = AXUIElementCreateApplication(pid)
  var focused: CFTypeRef?
  guard AXUIElementCopyAttributeValue(appEl, kAXFocusedUIElementAttribute as CFString, &focused) == .success,
        let raw = focused else { return "" }
  let element = unsafeBitCast(raw, to: AXUIElement.self)
  var selected: CFTypeRef?
  guard AXUIElementCopyAttributeValue(element, kAXSelectedTextAttribute as CFString, &selected) == .success,
        let text = selected as? String else { return "" }
  return text.trimmingCharacters(in: .whitespacesAndNewlines)
}

func postCmdC(to pid: pid_t?, hid: Bool) {
  let src = CGEventSource(stateID: .hidSystemState)
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

func copyInApp(_ app: NSRunningApplication) -> String {
  let board = NSPasteboard.general
  let previous = clipboardString()
  let count = board.changeCount
  postCmdC(to: nil, hid: true)
  for _ in 0..<10 {
    usleep(25_000)
    if board.changeCount != count {
      let now = clipboardString()
      if now != previous { setClipboard(previous) }
      return now
    }
  }
  return ""
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
    App.shared?.speakHighlight()
  }
  return noErr
}

func grabHighlight() -> Grab {
  let cached = loadHighlight()
  guard let app = targetApp() else {
    if let cached {
      let grab = Grab(ok: true, method: "remembered", text: cached.text, app: cached.app, note: "remembered highlight")
      writeJson(grab, to: lastGrabPath)
      return grab
    }
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
    if looksLikeSecret(ax) {
      let grab = Grab(ok: false, method: "selection", text: "", app: name, note: "that looks like a key. Coda will not read it.")
      writeJson(grab, to: lastGrabPath)
      return grab
    }
    saveHighlight(ax, app: name)
    let grab = Grab(ok: true, method: "highlight", text: ax, app: name, note: "highlighted text")
    writeJson(grab, to: lastGrabPath)
    return grab
  }

  let copied = copyInApp(app)
  if !copied.isEmpty {
    if looksLikeSecret(copied) {
      let grab = Grab(ok: false, method: "selection", text: "", app: name, note: "that looks like a key. Coda will not read it.")
      writeJson(grab, to: lastGrabPath)
      return grab
    }
    saveHighlight(copied, app: name)
    let grab = Grab(ok: true, method: "copy", text: copied, app: name, note: "read the highlight via Copy")
    writeJson(grab, to: lastGrabPath)
    return grab
  }

  if let cached {
    let grab = Grab(ok: true, method: "remembered", text: cached.text, app: cached.app, note: "played the highlight Coda remembered")
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
  var currentHotkeys = defaultHotkeys()
  var carbonRefs: [EventHotKeyRef] = []
  var configTimer: Timer?
  var lastHotkeySig = ""
  var lastVoice = ""
  var lastPlayerCmdId: Double = 0
  var busy = false
  var busyTimer: Timer?
  let sound = Sound()
  var node = "/usr/bin/env"
  var cli = ""
  let settingsURL = URL(string: "http://127.0.0.1:8787")!

  func applicationDidFinishLaunching(_ notification: Notification) {
    NSApp.setActivationPolicy(.accessory)
    requestAccessibility()
    writeJson(["trusted": AXIsProcessTrusted()] as [String: Bool], to: codaHome + "/ax.json")
    watchApps()
    watchSelections()
    if let front = NSWorkspace.shared.frontmostApplication { saveLastApp(front) }
    if let found = loadInstallPaths() {
      node = found.node
      cli = found.cli
    }
    adoptExistingPlayerCmd()
    writePlayback(playing: false, paused: false)
    item = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
    item.button?.image = codaMenuImage()
    item.button?.imagePosition = .imageOnly
    item.button?.title = ""
    item.button?.toolTip = "Coda"
    item.button?.setAccessibilityTitle("Coda")
    rebuildMenu()
    ensureUi()
    registerHotkeys()
  }

  func requestAccessibility() {
    let key = kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String
    _ = AXIsProcessTrustedWithOptions([key: true] as CFDictionary)
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

  func startBusy() {
    writePlayback(playing: false, paused: false, loading: true)
    item.button?.toolTip = "Getting the voice…"
    if busy { return }
    busy = true
    busyTimer?.invalidate()
    var dim = false
    busyTimer = Timer.scheduledTimer(withTimeInterval: 0.38, repeats: true) { [weak self] _ in
      dim.toggle()
      self?.item.button?.animator().alphaValue = dim ? 0.25 : 1
    }
  }

  func stopBusy() {
    busy = false
    busyTimer?.invalidate()
    busyTimer = nil
    item.button?.animator().alphaValue = 1
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

  func rebuildMenu() {
    lastVoice = loadVoice()
    let menu = NSMenu()
    menu.addItem(withTitle: "Open Coda", action: #selector(openSettings), keyEquivalent: "o")
    menu.addItem(NSMenuItem.separator())
    menu.addItem(withTitle: "Play / pause  (\(formatHotkey(currentHotkeys.play)))", action: #selector(playSelection), keyEquivalent: "")
    menu.addItem(withTitle: "Stop", action: #selector(stop), keyEquivalent: ".")
    menu.addItem(NSMenuItem.separator())
    let voiceMenu = NSMenu()
    for voice in voices {
      let voiceItem = NSMenuItem(title: voice.label, action: #selector(pickVoice(_:)), keyEquivalent: "")
      voiceItem.target = self
      voiceItem.representedObject = voice.id
      voiceItem.state = voice.id == lastVoice ? .on : .off
      voiceMenu.addItem(voiceItem)
    }
    let voiceParent = NSMenuItem(title: "Voice  \(voiceLabel(lastVoice))", action: nil, keyEquivalent: "")
    voiceParent.submenu = voiceMenu
    menu.addItem(voiceParent)
    menu.addItem(NSMenuItem.separator())
    menu.addItem(withTitle: "Quit Coda menu", action: #selector(quit), keyEquivalent: "q")
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

  func speakHighlight() {
    let now = Date().timeIntervalSince1970
    if now - lastSpeakAt < 0.5 { return }
    lastSpeakAt = now
    startBusy()
    DispatchQueue.global(qos: .userInitiated).async { [weak self] in
      self?.runCoda(["grab"], wait: true)
      DispatchQueue.main.async {
        guard let self, self.busy, self.sound.player?.isPlaying != true else { return }
        self.stopBusy()
      }
    }
  }

  func registerHotkeys() {
    var spec = EventTypeSpec(eventClass: OSType(kEventClassKeyboard), eventKind: UInt32(kEventHotKeyPressed))
    InstallEventHandler(GetApplicationEventTarget(), codaHotKeyCallback, 1, &spec, nil, nil)
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
    }
    Timer.scheduledTimer(withTimeInterval: 0.05, repeats: true) { [weak self] _ in
      self?.pollPlayerCmd()
    }
  }

  func handleHotkey(_ event: NSEvent) -> Bool {
    if hotkeyAction(for: event) == "play" {
      speakHighlight()
      return true
    }
    return false
  }

  func hotkeySig(_ keys: BoundHotkeys) -> String {
    "\(keys.play.mods.joined(separator: "+"))+\(keys.play.key)"
  }

  func reloadHotkeysIfNeeded() {
    let next = loadHotkeys()
    let sig = hotkeySig(next)
    let voice = loadVoice()
    if sig != lastHotkeySig {
      applyHotkeys(next)
      return
    }
    if voice != lastVoice, item != nil {
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
    struct HotkeyInfo: Codable {
      var carbon: Int
      var play: String
    }
    writeJson(
      HotkeyInfo(carbon: playStatus, play: formatHotkey(currentHotkeys.play)),
      to: codaHome + "/hotkey.json"
    )
    if item != nil { rebuildMenu() }
  }

  @objc func openSettings() {
    ensureUi()
    NSWorkspace.shared.open(settingsURL)
  }
  @objc func playSelection() { speakHighlight() }
  @objc func stop() { runCoda(["stop"]) }
  @objc func pickVoice(_ sender: NSMenuItem) {
    guard let id = sender.representedObject as? String else { return }
    runCoda(["voice", id], wait: true)
    lastVoice = id
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
