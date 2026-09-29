# Security policy

This file is for **reporting a vulnerability** in DotEnvUp. The threat model (what the tool does and does not protect against) is [docs/SECURITY.md](docs/SECURITY.md), published at [https://dotenvup.com/security](https://dotenvup.com/security).

## How to report

Use GitHub private vulnerability reporting:

https://github.com/sarhej/dotenvup/security/advisories/new

Do not open a public issue with proof-of-concept code, private keys, recovery codes, or decrypted values.

If private reporting is unavailable, email the maintainer listed on [https://github.com/sarhej](https://github.com/sarhej) and say it is a DotEnvUp security report. Do not attach secrets until we confirm a channel.

## What we will do

We will acknowledge the report when we see it. We have not published a measured response-time SLA.

Please include: affected package and version (`@dotenvup/cli`, extension `dotenvup.dotenvup`, or `@dotenvup/format`), what you expected, what happened, and how to reproduce without sending real production secrets.

## Scope

In scope: the format parser, CLI, VS Code/Cursor extension, MCP server, Keychain helper, and this website's static content.

Out of scope: UnknownPassword (separate product), third-party git hosts, and "any process as the same user can read `/proc/<pid>/environ`". That last item is documented on the threat model page. It is not a vulnerability in DotEnvUp.

## Maintainer security ops

- Dependency audit remediation: [docs/SECURITY_AUDIT_REMEDIATION.md](docs/SECURITY_AUDIT_REMEDIATION.md)
- Findings triage (CodeQL, secret scanning, Scorecard): [docs/SECURITY_FINDINGS.md](docs/SECURITY_FINDINGS.md)
- Local checklist: [docs/SECURITY_CHECKS_LOCAL.md](docs/SECURITY_CHECKS_LOCAL.md)
