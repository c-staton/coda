# Coda

Speak a **smart digest of the last finished assistant reply** — not the whole wall of
tokens, not streaming partials, not tool noise. Toggle listening on and off with a
single command.

Coda is a small, shareable text-to-speech tool. **Cursor is the first client, not the
product**: the speak engine (`src/`) has no Cursor-specific types, so a Grok bot, a Mac
menu-bar reader, or any other app can reuse it.

## Requirements

- Node 18+ (developed and tested on Node 22).
- A TTS engine. Coda auto-detects one:
  - macOS: `say` (built in).
  - Linux: `espeak-ng` (`apt-get install espeak-ng`).
  - `grok`: xAI Grok TTS (`XAI_API_KEY`).
  - `openai`: OpenAI Speech (`OPENAI_API_KEY`).
  - `print`: zero-dependency fallback that writes the digest to stdout (always works).

No npm dependencies are required at runtime — Coda uses Node built-ins only.

## Quick start (the simple way)

Three commands, then restart Cursor. On macOS this needs **no API keys and no extra installs** — your Mac already has a built-in voice.

```bash
git clone https://github.com/c-staton/coda
cd coda
node src/cli.mjs install
```

That's it. `install` wires Coda into Cursor for **every** project and turns it on.
Fully quit and reopen Cursor, send any message, and when the reply finishes you'll
hear a short spoken summary.

- Mute / unmute anytime: `node src/cli.mjs off` / `node src/cli.mjs on`
- Check state: `node src/cli.mjs status`
- Remove it: `node src/cli.mjs uninstall`

Tip: run `npm link` once to get a global `coda` command, so you can type
`coda off` instead of `node src/cli.mjs off`.

> Linux: install a voice engine first with `sudo apt-get install espeak-ng`.
> macOS uses the built-in `say`. No engine? Coda safely prints the summary instead.

## Manual install

```bash
git clone https://github.com/c-staton/coda
cd coda
npm ci        # no runtime deps; sets up the CLI
npm link      # optional: puts `coda` on your PATH
```

## CLI

```
coda install | uninstall           # wire (or remove) the Cursor hook, everywhere
coda on | off | toggle | status    # control the listen/mute flag
coda speak [text]                  # digest + speak some text
coda replay                        # speak the last digest again
coda hook                          # read afterAgentResponse JSON from stdin
```

State lives in `~/.coda/state.json`; config in `~/.coda/config.json`
(engine, voice, language, speed, maxChars). Override the engine per run with
`CODA_ENGINE=espeak coda speak "hello"`.

## How it plugs into Cursor

Coda speaks when Cursor finishes an assistant reply, via the
[`afterAgentResponse` hook](https://cursor.com/docs/hooks.md). `coda install` sets this
up for you by merging a single entry into `~/.cursor/hooks.json` (it never touches your
other hooks). That's the recommended path and works in every project.

If you'd rather wire it by hand, add this to `~/.cursor/hooks.json` with an absolute path:

```json
{
  "version": 1,
  "hooks": {
    "afterAgentResponse": [
      { "command": "node /absolute/path/to/coda/scripts/after-agent-response.mjs" }
    ]
  }
}
```

This repo is also a Cursor **plugin** (import from GitHub): `hooks/hooks.json` calls
`scripts/after-agent-response.mjs`, which pipes the reply into `coda hook`.

## How the digest works

1. An explicit `<coda>...</coda>` block in the reply always wins (last one, if several).
2. Otherwise the reply is reduced to prose: fenced code, tables, images, and HTML are
   stripped; `[laugh]`-style speech tags are dropped while `[1]` citations are kept.
3. Short prose is spoken as-is; a long reply collapses to its closing 2–4 sentences.
4. Empty / trivial / code-only replies are skipped.

The [`coda-spoken-summary`](rules/coda-spoken-summary.mdc) rule asks the agent to end long
replies with a `<coda>` wrap-up so the spoken version stays crisp.

## Reuse the engine elsewhere

See [`skills/add-coda`](skills/add-coda/SKILL.md). Core imports:

```js
import { digest, speak, getState, setState } from "coda";
```

## Develop

```bash
npm test      # behavior tests (node:test, zero deps)
```

Tests cover the digest heuristics (code omitted, `<coda>` wins, long → wrap-up,
skip-on-empty) and the CLI/hook path (mute, malformed JSON, replay).

## License

MIT
