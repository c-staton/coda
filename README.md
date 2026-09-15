<p align="center">
  <img src="apps/macos/Mark.png" width="88" alt="Coda">
</p>

# Coda

Coda reads any text on your Mac. Highlight it in an app or on a website. Hear it out loud.

It does not run on Windows or Linux.

## What you need

- A Mac (Intel or Apple silicon)
- [Node 18+](https://nodejs.org/)
- Apple’s command line tools (`xcode-select --install`)
- An [OpenRouter key](https://openrouter.ai/keys) if you want those voices. Optional. Without it, Coda uses the Mac’s built-in voice.

When macOS asks, turn on **Coda** under System Settings → Privacy & Security → Accessibility. It should say Coda.

## Install

```bash
git clone https://github.com/c-staton/coda
cd coda
./install
```

Then highlight text in any app or website and play it.

## Voice

Coda is meant to be used with [OpenRouter](https://openrouter.ai/keys). Open Coda, paste your key, and pick a voice.

The key is optional. Without it, Coda falls back to the Mac’s built-in voice.

The key stays on this Mac in `~/.coda/secrets.json`. It never goes in git.

## Use

Highlight text anywhere on the Mac and play it. If Coda is already talking, the new text waits its turn. Clips play in order. While one plays, Coda gets the next one ready so it can start right away.

The menu bar shows how many are waiting.

| | |
| --- | --- |
| **Queue** | Read this, or put it next |
| **Play / pause** | Pause or keep going |
| **Skip** | Drop this one. Play the next. |
| **Coda menu** | Queue, play / pause, skip, stop, pick a voice, open settings |

Change the shortcuts in Coda.

The smiley goes dark while the voice is loading.

## What you hear

Coda reads the highlight. A few things get a short word instead, so the sentence still works if you are only listening:

- A key, a UUID, or any other token longer than a normal word → **code**
- A long number (13 or more digits) → **number**

Everything else is read as written.

To take it off this Mac:

```bash
./uninstall
```

## Develop

```bash
npm test
```

No npm packages. Tests use Node’s built-in runner.

## License

[MIT](LICENSE)
