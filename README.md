<p align="center">
  <img src="apps/macos/Mark.png" width="88" alt="Coda">
</p>

# Coda

Highlight text in any Mac app. Press **Control-Option-X**. Coda reads it out loud.

## Install

You need [Node 18+](https://nodejs.org/) and Apple’s command line tools (`xcode-select --install`).

```bash
git clone https://github.com/c-staton/coda
cd coda
node src/cli.mjs install
```

When macOS asks, turn on **CodaBar** under System Settings → Privacy & Security → Accessibility.

Then highlight some text and press Control-Option-X.

## Better voice

Open **Coda** from the menu bar. Paste your [OpenRouter key](https://openrouter.ai/keys). Pick Eve, Ara, Rex, Leo, or Sal.

The key stays on this Mac in `~/.coda/secrets.json`. It never goes in git.

Without a key, Coda uses your Mac’s built-in voice.

## Use

| | |
| --- | --- |
| **Control-Option-X** | Play the highlight. Same text pauses or resumes. New text replaces what’s playing. |
| **Coda menu** | Play / pause, stop, pick a voice, open settings |

The smiley blinks while the voice is loading.

```
coda uninstall
coda stop
```

## Linux

No menu bar. You can still do:

```bash
node src/cli.mjs speak "hello"
```

Install `espeak-ng` first.

## Develop

```bash
npm test
```

No npm packages. Tests use Node’s built-in runner.

## License

[MIT](LICENSE)
