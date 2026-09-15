// Public speak engine. Other apps can import these.
export { digest, extractCodaTag, splitSentences, splitBlocks } from "./digest.mjs";
export { speak, resolveEngine, stopCurrent, pauseCurrent, resumeCurrent, playbackStatus } from "./tts.mjs";
export { getState, setState, getConfig, setConfig, paths } from "./state.mjs";
