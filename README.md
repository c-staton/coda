<p align="center">
  <img src="apps/macos/Mark.png" width="88" alt="Coda">
</p>

# Coda

A Mac app. Highlight text in any app. Press **Control-Option-Down**. Coda reads it out loud. Press Down again while it is talking and the next bit waits in line.

It does not run on Windows or Linux.

## What you need

- A Mac (Intel or Apple silicon)
- [Node 18+](https://nodejs.org/)
- Apple’s command line tools (`xcode-select --install`)

That’s it. When macOS asks, turn on **Coda** under System Settings → Privacy & Security → Accessibility. It should say Coda. Leave Node and Terminal off.

## Install

```bash
git clone https://github.com/c-staton/coda
cd coda
./install
```

Then highlight some text and press Control-Option-Down. Press Down again to put the next bit in line.

## Better voice

Open **Coda** from the menu bar. Paste your [OpenRouter key](https://openrouter.ai/keys). Then pick a voice. Voices are grouped by OpenRouter model.

The key stays on this Mac in `~/.coda/secrets.json`. It never goes in git.

Without a key, Coda uses your Mac’s built-in voice.

## Use

Highlight text. **Control-Option-Down** reads it. If Coda is already talking, that new text waits in line. Clips play in the order you added them. While one plays, Coda gets the next one ready so it can start right away.

The menu bar shows how many are waiting.

| | |
| --- | --- |
| **Control-Option-Down** | Read this, or put it next in line |
| **Control-Option-Left** | Play or pause |
| **Control-Option-Right** | Skip this one. Play the next in line. |
| **Coda menu** | Queue, play / pause, skip, stop, pick a voice, open settings |

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
