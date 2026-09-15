---
name: add-coda
description: Wire Coda’s speak engine into another app so it can read text aloud.
---

# Add Coda to an app

Coda’s core (`src/digest.mjs`, `src/tts.mjs`, `src/state.mjs`) has no Mac-only types.
Reuse it anywhere you have text and want to speak it.

## Steps

1. Import the engine:

   ```js
   import { digest, speak } from "coda";
   ```

2. When you have text, digest then speak:

   ```js
   const spoken = digest(finalReplyText, { maxChars: 800 });
   if (spoken) await speak(spoken, { engine: "grok", voice: "eve", language: "auto" });
   ```

## Engine choice

- `apple` / `espeak`: local, no key. Good default.
- `openrouter`: Grok voices via OpenRouter. Set `OPENROUTER_API_KEY`.
- `grok`: xAI Grok TTS. Set `XAI_API_KEY`. Voices: `eve` (default), `ara`, `rex`, `leo`, `sal`.
- `openai`: OpenAI Speech. Set `OPENAI_API_KEY`.

Never ship API keys in a client bundle or commit them. Keep them in the user’s env or `~/.coda/secrets.json`.

## Digest contract

- An explicit `<coda>...</coda>` block in the reply always wins.
- Otherwise: code fences, tables, images, and HTML are stripped; long replies collapse
  to their closing 2-4 sentences; `[1]` citations are kept, `[laugh]`-style speech tags
  are dropped.
