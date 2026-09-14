# Coda handoff

Paste this into a cloud agent in this repo (`/Users/personal/coda`). The repo is an empty git init. No app code exists yet. Date of research: 14 Sep 2026.

## What this project is

Coda is a small, shareable text-to-speech product. It should speak a **digest of the last finished assistant reply**, skip dumps/code/tool noise, and let the user **toggle listening on and off** without hunting through chat.

It is **not** a speaker button on Cursor chat messages. Cursor has no API for that.

Cursor is the **first client**, not the product. The speak engine must be reusable by a later Grok bot app, a Mac menu-bar reader, and anything else. Do not bake Cursor types into the core.

Repo name: `coda` at `/Users/personal/coda`. Git is initialized. There is no remote, no commits with files (only empty init), no `package.json`, no plugin files.

## User intent (locked)

- Hear Cursor replies instead of reading them.
- Custom control: smart, not “read the whole wall of tokens.”
- Last **final** message only, after the agent is done. Not streaming partials. Not tool traces.
- Easy listen / mute toggle.
- Lightweight, reliable, working.
- Shareable on GitHub so other people can install it.
- Must not go stale when Cursor changes. Same engine should later power:
  - a Grok bot / other app (speaker on **that** app’s last reply)
  - a Mac menu-bar “Speechify-like” reader (select text anywhere, hotkey, Grok or OpenAI voices)
- Use **p-stack / poteto-mode** for how the agent works.
- **Models:** Cursor Ultra. Other model families are usage-maxed. Prefer **Cursor Grok 4.6** and **Composer**. Do not spend Claude/GPT/Opus quota on subagents. If a skill defaults to Claude/GPT, override to Grok 4.6 or Composer.

## Hard constraints from research (do not fight these)

### Cursor cannot get a chat-row speaker

Official Grok Voice skill `add-read-aloud` states: “Cursor has no speaker; wire the **app**, not the IDE.”

Cursor plugins package skills, hooks, MCP, rules, commands, agents, variables. They do **not** add IDE chrome. No `vscode.cursor.chat.addMessageAction`. Marketplace plugins ship no binaries.

A speaker icon on each Cursor assistant message would be a **Cursor product change**. There is a forum request: [Add “Read aloud” to chat message menu](https://forum.cursor.com/t/add-read-aloud-to-chat-message-menu/163224). Do not try to inject into the Agent chat webview.

### What *does* work for hearing Cursor

`afterAgentResponse` hook. Input is `{ "text": "<assistant final text>" }` plus common fields (`conversation_id`, `transcript_path`, …). Fires after the assistant message is complete. Documented: https://cursor.com/docs/hooks.md

That is the one official Cursor extension point that matches “reply finished → speak.”

Mute/listen is **not** a chat button. It is a CLI / hotkey / menu-bar / status-bar flag the hook checks before playing audio.

### Official Grok Voice plugin is the wrong surface for this goal

Listing: https://cursor.com/marketplace/cursor/grok-voice  
Repo: https://github.com/cursor/plugins/tree/main/grok-voice

Manifest is skills only (`add-voice`, `add-dictation`, `add-read-aloud`, `debug-voice`). It teaches the agent to add Grok voice **into the user’s app**, not into Cursor. Keep using it when wiring TTS into a product. Do not use it as “read Cursor aloud.”

### ChatGPT Voice Mode is not a TTS engine

ChatGPT Advanced Voice is a consumer chat feature. You cannot route it into a third-party Mac app or Cursor plugin.

Shippable engines:

| Engine | Endpoint | Use |
| --- | --- | --- |
| xAI Grok TTS | `POST https://api.x.ai/v1/tts` (streaming: `wss://api.x.ai/v1/tts`) | Preferred “Grok voice.” Voices: `eve` (default), `ara`, `rex`, `leo`, `luna`, … plus custom voice ids. Required field: `language` (`auto` or BCP-47). Batch limit 15,000 chars. Docs: https://docs.x.ai/developers/model-capabilities/audio/text-to-speech |
| OpenAI Speech | `POST https://api.openai.com/v1/audio/speech` | ChatGPT-quality read-aloud. Model `gpt-4o-mini-tts` (or `tts-1` / `tts-1-hd`). Voices: alloy, coral, marin, cedar, … |
| OpenAI Realtime / GPT-Live | speech-to-speech | Overkill and expensive for read-aloud. Do not use for v1. |
| Apple `say` / AVSpeech | local | Zero-key fallback so the product works before API keys exist. |
| Kokoro / MLX | local neural | Optional later. Heavier install. Existing Mac apps already do this. |

Auth: API keys stay on the user’s machine / env. Never put `XAI_API_KEY` or `OPENAI_API_KEY` in a client bundle or in git. Grok TTS has no documented ephemeral-token flow for batch TTS.

### Existing things we are not wrapping as the product

- **Varterm TTS** (Open VSX `Varterm.varterm-cursor`): already auto-reads finished Cursor replies via `afterAgentResponse`, status-bar Auto-read toggle. Reads the **whole** reply. Edge / ElevenLabs, not Grok. Chat highlights in the webview are not readable. Fine as a no-build fallback, not what we are building.
- **valentinIA**: local Piper TTS of agent responses, status bar mute. Not Grok.
- **macOS Speak Selection** (Option-Esc): works on editor text. Chat webview selection is flaky. Not smart.
- Local Mac readers (Aloud, Outloud, Recite, MLXRead, Murmur): global hotkey + Accessibility API. Murmur can use OpenAI TTS. None is a Grok-routed Cursor digest plus reusable engine.

### How Cursor plugins are shared

- Local: `~/.cursor/plugins/local/<name>`
- GitHub import: Customize → From GitHub Repository (repo needs `.cursor-plugin/plugin.json` or Agent Plugin `plugin.json`)
- Team marketplace: Teams/Enterprise
- Official marketplace: public open-source repo, submit https://cursor.com/marketplace/publish, manual review every update, curated
- Skills/rules alone are not imported from GitHub. They must be packaged in a plugin.

Cursor installs VS Code-style extensions from **Open VSX**, not marketplace.visualstudio.com. Microsoft Marketplace-only extensions (including VS Code Speech) are not a supported Cursor path.

Hooks in a plugin: `hooks/hooks.json`. User-level hooks: `~/.cursor/hooks.json` (do not run on Cloud Agents). Project hooks `.cursor/hooks.json` do run on Cloud Agents for some lifecycle events; `afterAgentResponse` is the one we need on the **desktop** agent loop.

Marketplace plugins: no binaries. The hook must be a script Cursor can run (Node/shell), not a compiled Mac app.

## Recommended product shape (build this)

Three layers. Build 1 now. Leave 2 and 3 as clean interfaces, not vaporware folders.

### Layer 1 — speak engine (the shareable core)

A Node 18+ CLI with **no required npm deps at runtime** if possible (fetch + `child_process` for `say`/`afplay`). Zero-build `.mjs` is more reliable for Cursor hooks than a tsc pipeline, because installing a Cursor plugin does **not** run `npm install`.

CLI:

```
coda on | off | toggle | status
coda speak [text]
coda replay
coda hook          # read afterAgentResponse JSON from stdin
```

State: `~/.coda/state.json` `{ "listening": true, "lastDigest": "...", "lastSpokenAt": "..." }`  
Config: `~/.coda/config.json` plus env `XAI_API_KEY` / `OPENAI_API_KEY`

```json
{
  "engine": "apple" | "grok" | "openai",
  "voice": "eve",
  "language": "auto",
  "speed": 1.0,
  "maxChars": 800
}
```

Default engine **apple** so it works with zero keys. Document switching to grok when `XAI_API_KEY` is set.

**One utterance at a time.** Starting a new speak stops the current `say`/`afplay`. Store the player PID. Do not `killall afplay` (that can kill unrelated audio).

**Digest (smart last message), heuristic first, no LLM required for v1:**

1. If listening is false, write nothing, play nothing, exit 0.
2. Parse stdin JSON, take `.text`.
3. If a `<coda>...</coda>` (or `<!-- coda: ... -->`) block exists, speak the **last** one only.
4. Else strip fenced code to a short omission (do not speak code), strip tables or one sentence per row, strip images/html, neutralize documented Grok speech tags if they appear as model output (`[laugh]`, `<whisper>`, …) but keep `[1]` citations.
5. If remaining prose is short (under `maxChars`), speak it.
6. If long, speak the wrap-up: last 2–4 sentences, or a closing heading’s body.
7. Skip empty / trivial / mostly-code leftovers.
8. Batch TTS 15k char limit: split on paragraph/sentence if needed. v1 digest should stay under `maxChars` so this rarely fires.

Optional later: LLM digest behind a flag. Do not block v1 on it. Heuristic + `<coda>` tag is the reliable path.

**Plugin rule (alwaysApply in the Cursor plugin):** when a reply is long, end with a 1–2 sentence `<coda>` spoken wrap-up. No code, no links, no lists inside the tag. Skip the tag for one-liners. Never put secrets in `<coda>`. The hook then prefers that tag.

### Layer 2 — Cursor plugin (first client)

Same repo is a Cursor Plugin:

```
coda/
  .cursor-plugin/plugin.json
  hooks/hooks.json          # afterAgentResponse → scripts/after-agent-response.sh
  scripts/after-agent-response.sh  # exec node src/cli.mjs hook
  src/                      # engine + CLI
  rules/coda-spoken-summary.mdc
  skills/add-coda/SKILL.md  # how to wire this engine into another app
  README.md
  HANDOFF.md                # this file
```

`hooks/hooks.json` should call a **relative** script so GitHub plugin install works:

```json
{
  "version": 1,
  "hooks": {
    "afterAgentResponse": [
      { "command": "node ./scripts/after-agent-response.mjs" }
    ]
  }
}
```

Also document a **user-level** install (`~/.cursor/hooks.json` with an absolute path) so it works in every project without installing the plugin per repo.

Share: GitHub plugin import first. Team marketplace if they have a team. Official marketplace later (must be public OSS).

### Layer 3 — later (do not build in v1 unless leftover time)

- Mac menu-bar app: Accessibility selected text + clipboard fallback (needed for Electron/Cursor chat), global hotkey, same engine, HUD play/pause/speed. Existing local apps prove the capture pattern.
- `/add-coda` skill used inside a Grok bot repo: speaker on **that** app’s last finished reply, mute toggle, same digest rules. Pattern copy from Grok Voice `/add-read-aloud` but call Coda’s engine or `POST /v1/tts` directly in the app.

The skill in this repo should already describe that app integration so a future agent can run it.

## UX for mute (experience first)

The user asked for “easily toggle in and out of listening.” v1:

- `coda toggle` / `coda on` / `coda off` / `coda status`
- Print a one-line status. Optional macOS notification via `osascript` so they know it flipped.
- Document binding that CLI to Raycast / macOS Shortcuts / a keyboard shortcut.
- `coda replay` speaks `lastDigest` even if they missed it.

Do not require a full Mac app for mute in v1. A menu-bar is v3.

Do not auto-speak on Cursor load. Only after a completed assistant message, and only if listening is on.

## Tests and proof

Behavior tests, not implementation tests:

- Digest: fenced code omitted; `<coda>` wins; long reply becomes last sentences; empty after strip → skip; mute → no speak.
- Hook: valid JSON stdin with `.text` produces a digest; missing text exits cleanly.
- TTS: if no API key, apple `say` path works on macOS. Do not call live xAI in CI without a mock.

Prove it works: install the user hook, turn listening on, send a Cursor agent message, hear a short digest, `coda off`, send another, hear silence, `coda on`, `coda replay`.

Wrong-surface (only “it compiles”) is not a pass.

## p-stack / how to work

Use poteto-mode / p-stack Feature playbook:

1. `how` over Cursor hooks + TTS (surrounding systems). Greenfield otherwise.
2. `architect` / arena for the engine shape before dumping files. Two structurally distinct sketches, then pick one small public CLI.
3. Throughput checkpoint, then implement.
4. Verify on the real hook path.
5. Small commits. Opening a PR only if a GitHub remote exists (it does not yet). Do not invent a GitHub repo unless the user asks.

**Models for this run:** Grok 4.6 (Cursor) and Composer only. User Ultra account. Other families are usage-maxed. Available in the prior session included `cursor-grok-4.6-high-fast` and `composer-2.5-fast`. Prefer those. Do not launch Claude/GPT/Opus subagents.

No `~/.cursor/rules/pstack-models.mdc` was written. If you `/setup-pstack`, set every role to Grok 4.6 / Composer.

## What the previous agent did not finish

Stopped after research + empty repo + this handoff. Did **not** implement CLI, digest, TTS, plugin, tests, or README (other than this file).

A research canvas exists only in the old empty-window workspace, not in this repo:  
`/Users/personal/.cursor/projects/empty-window/canvases/tts-share-options.canvas.tsx`  
Treat this HANDOFF as the source of truth.

## Success for v1

A clone of this repo plus Node 18+ on macOS:

1. `coda on`
2. Cursor `afterAgentResponse` hook runs
3. A long agent reply is spoken as a short wrap-up, not the full dump
4. `coda off` silences the next reply immediately
5. Someone else can install from GitHub as a Cursor plugin or by pointing `~/.cursor/hooks.json` at the script
6. Core speak/digest/mute has no Cursor-specific types, so a Grok bot or Mac app can call the same functions later
