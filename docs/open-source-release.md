# Open-source release and privacy

## License and upstream attribution

Mju Agents is distributed under the [MIT License](../LICENSE). It is derived
from [agegr/pi-web](https://github.com/agegr/pi-web), also under MIT. Keep the
upstream copyright notice and the bundled-runtime attributions in
[NOTICE](../NOTICE) in every source and npm distribution. Mju is an
independently maintained derivative and is not affiliated with or endorsed by
agegr.

## Safe to publish

- Source code, tests, documentation, and generic example configuration.
- `.pi/settings.json` when it contains only package names such as
  `npm:pi-subagents`.
- Lockfiles without private registry credentials.

## Never publish

- `~/.pi/agent/auth.json`, `models.json`, session JSONL files, or API keys.
- Project `.pi/agents/*.md` containing client, matter, or personal information.
- A personal Obsidian vault, its `.agents` or `.pi/agents`, local audit logs,
  private screenshots, or exported transcripts.
- `config/local/`, `.next/`, `.env*`, private certificates, tokens, and cookies.

Before the first public push, review the staged file list, search it for
personal paths and secrets, and verify the app from a clean clone without your
personal Obsidian vault. Also confirm the public npm and GitHub identities:
the intended package name is `@tttangerine/mju`. Before publishing, add the final GitHub
repository URL to `package.json`; do not leave upstream repository metadata in
the package.
