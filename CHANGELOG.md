# Changelog

## 0.1.1

- Read the highlight from Coda.app so macOS asks for Coda, not Node.
- In Cursor and other apps that do not expose the highlight, wait until Control-Option is up, then Copy.
- Do not replay a highlight from another window.
- Menu item is Quit Coda.
- `./install` builds for this Mac even if the command line tools are leftover or mixed.

If you already installed:

```bash
git pull
./install
```

Turn Coda off and on in Accessibility if the shortcut goes quiet after the refresh.

## 0.1.0

First public Mac app. Highlight text, press Control-Option-X.
