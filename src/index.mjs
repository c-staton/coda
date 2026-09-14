// Public, Cursor-agnostic surface for the coda speak engine.
// A Grok bot, a Mac menu-bar reader, or any other client can import these.
export { digest, extractCodaTag, splitSentences } from "./digest.mjs";
export { speak, resolveEngine, stopCurrent } from "./tts.mjs";
export { getState, setState, getConfig, setConfig, paths } from "./state.mjs";
