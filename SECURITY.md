# Security

## API keys

Coda stores keys in `~/.coda/secrets.json` with mode `600`. You can also set `OPENROUTER_API_KEY`, `XAI_API_KEY`, or `OPENAI_API_KEY` in your environment.

Never commit those files. Never put a key in an issue, pull request, or screenshot.

If a key was shared by mistake, revoke it at the provider and make a new one.

## Report a vulnerability

Please do not open a public issue for a security problem.

Email the maintainer listed on the GitHub repo, or open a [private security advisory](https://github.com/c-staton/coda/security/advisories/new) if that is enabled.
