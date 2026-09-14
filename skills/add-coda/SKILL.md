---
name: add-coda
description: Wire the Coda speak engine into another app (Grok bot, Mac reader, etc.) so it speaks a smart digest of that app's last finished reply, with a listen/mute toggle.
---

# Add Coda to an app

Coda's core (`src/digest.mjs`, `src/tts.mjs`, `src/state.mjs`) has no Cursor types.
Reuse it anywhere you have a "last finished reply" and want to speak a smart digest.

## Steps

1. Import the engine:

   ```js
   import { digest, speak, getState } from "coda";
   ```

2. When your app finishes a reply, digest then speak (respecting the mute toggle):

   ```js
   if (getState().listening) {
     const spoken = digest(finalReplyText, { maxChars: 800 });
     if (spoken) await speak(spoken, { engine: "grok", voice: "eve", language: "auto" });
   }
   ```

3. Expose a mute toggle in your app UI that flips `listening` via `setState({ listening })`,
   or shell out to `coda on|off|toggle`.

## Engine choice

- `apple` / `espeak`: local, zero-key. Good default before API keys exist.
- `grok`: xAI Grok TTS. Set `XAI_API_KEY`. Voices: `eve` (default), `ara`, `rex`, `leo`, `luna`.
- `openai`: OpenAI Speech. Set `OPENAI_API_KEY`.

Never ship API keys in a client bundle or commit them. Keep them in the user's env.

## Digest contract

- An explicit `<coda>...</coda>` block in the reply always wins.
- Otherwise: code fences, tables, images, and HTML are stripped; long replies collapse
  to their closing 2-4 sentences; `[1]` citations are kept, `[laugh]`-style speech tags
  are dropped.
