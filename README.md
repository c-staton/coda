# Coda

Highlight text in any Mac app. Press **Control-Option-X**. Coda reads it out loud.

## Install (Mac)

You need [Node 18+](https://nodejs.org/) and Apple’s command line tools (`xcode-select --install`).

```bash
git clone https://github.com/c-staton/coda
cd coda
node src/cli.mjs install
```

When macOS asks, turn on **CodaBar** under System Settings → Privacy & Security → Accessibility.

Then highlight some text and press Control-Option-X.

Optional, so you can type `coda` instead of `node src/cli.mjs`:

```bash
npm link
```

## A better voice

Without a key, Coda uses your Mac’s built-in voice. For Grok voices (Eve, Ara, Rex, Leo, Sal):

```bash
coda key openrouter YOUR_KEY
```

Get a key at [openrouter.ai/keys](https://openrouter.ai/keys). It stays in `~/.coda/secrets.json` on this Mac only — never in git.

Direct xAI or OpenAI keys work too: `coda key xai` / `coda key openai`.

## Use

| | |
| --- | --- |
| **Control-Option-X** | Play the highlight. Same text pauses or resumes. New text replaces what’s playing. |
| **Coda menu** (menu bar) | Play / pause, stop, pick a voice, open settings |
| **Settings** | `coda ui` or **Open Coda** in the menu |

You can change the shortcut in settings.

```
coda uninstall     # remove the menu app
coda voice eve     # eve | ara | rex | leo | sal
coda speak hello   # read text from the command line
coda stop
```

State lives in `~/.coda/`. Keys stay in `~/.coda/secrets.json` (mode 600).

## Linux

The Mac menu is macOS-only. On Linux you can still digest and speak from the terminal after `sudo apt-get install espeak-ng`:

```bash
node src/cli.mjs speak "hello"
```

## Develop

```bash
npm test
```

No npm dependencies. Tests use Node’s built-in runner.

## Reuse the speak engine

`src/` has no Mac-only types. Other apps can import it:

```js
import { digest, speak } from "coda";

const spoken = digest(text, { maxChars: 800 });
if (spoken) await speak(spoken, { engine: "apple", voice: "eve" });
```

See [`skills/add-coda`](skills/add-coda/SKILL.md).

## License

[MIT](LICENSE)
