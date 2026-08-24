# UnknownPassword ↔ DotEnvUp

> **Canonical team-sharing design:** [TEAM_SECRETS_SOLUTION.md](./TEAM_SECRETS_SOLUTION.md)

UnknownPassword is an **optional** control plane on top of the open `.env.up` format. DotEnvUp OSS never requires UP at runtime.

| | DotEnvUp OSS | UnknownPassword |
|---|--------------|-----------------|
| Decrypt / `up run` / unlock | Yes | Not involved |
| `[policy]` in committed `.env.up` | Format + tools | UX to edit + apply |
| Recipient public keys | Manual / `.dotenvup.recipients.json` | Team directory |
| Share links | `sealedShare` crypto | API + auth |
| Hide key names | **No** (by design) | **No** |

Policy lives **in the file** (cleartext `[policy]` block), not only on UP servers. See the canonical doc for workflows and merge re-encrypt rules.
