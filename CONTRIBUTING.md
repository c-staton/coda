# Contributing

Thanks for wanting to help.

## Run it

Node 18+. macOS if you are changing the menu app.

```bash
npm test
```

On a Mac, `node src/cli.mjs install` builds the menu app into `~/.coda/bin/CodaBar`.

## Pull requests

- Keep changes small and easy to try.
- Add or update a test when you change behavior.
- Do not commit API keys, `~/.coda/`, or anything from `.env`.
- Do not paste real keys into issues or PRs.

## Layout

| Path | What it is |
| --- | --- |
| `src/` | CLI, speak engine, settings server |
| `apps/macos/CodaBar.swift` | Menu bar app (hotkeys, highlight, playback) |
| `test/` | `node --test` |

Please keep the README in plain language. If a newcomer cannot install from the first screen, the docs are not done.
