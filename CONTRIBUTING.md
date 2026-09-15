# Contributing

Thanks for wanting to help.

## Run it

Coda is a Mac app. Tests run with Node 18+ anywhere. You need a Mac to try the menu bar.

```bash
npm test
```

On a Mac, `node src/cli.mjs install` builds `~/Applications/Coda.app`.

## Pull requests

- Keep changes small and easy to try.
- Add or update a test when you change behavior.
- Do not commit API keys, `~/.coda/`, or anything from `.env`.
- Do not paste real keys into issues or PRs.

## Layout

| Path | What it is |
| --- | --- |
| `src/` | CLI, speak engine, settings |
| `apps/macos/` | Menu bar app and the smiley |
| `test/` | `node --test` |

Keep the README short. If someone cannot install from it, the docs are not done.
