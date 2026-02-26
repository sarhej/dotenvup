# DotEnvUp vs Sealed Secrets

A concise comparison of **DotEnvUp** (this project) and **[Sealed Secrets](https://github.com/bitnami-labs/sealed-secrets)** (Bitnami). Both encrypt secrets for safe storage and version control; they target different environments and workflows.

---

## One-line positioning

| | DotEnvUp | Sealed Secrets |
|---|----------|----------------|
| **Tagline** | “.env files, but with memory — and a lock.” | “Encrypt K8s Secrets so they’re safe to store in git.” |
| **Core idea** | **Local .env** → encrypt to **.env.up**; lock/unlock on the **developer machine**. No server; keypair at ~/.dotenvup. | **Kubernetes Secrets** → encrypt to **SealedSecret**; only the **cluster controller** can decrypt. Store SealedSecrets in git; controller unseals into Secrets in the cluster. |

---

## Scope and environment

| Aspect | DotEnvUp | Sealed Secrets |
|--------|----------|----------------|
| **Target** | **.env** (and env vars) on your machine or in repo. | **Kubernetes `Secret`** resources. |
| **Where it runs** | **Local**: CLI + VS Code on dev machine; CI can use `up run --`. | **Cluster + local**: controller in K8s; **kubeseal** CLI to create SealedSecrets. |
| **Who decrypts** | **You** (with ~/.dotenvup/identity or key in env). | **Controller only** — you cannot decrypt a SealedSecret without the controller’s private key (or a backup). |
| **Commit to git** | **.env.up** ✅ (safe; metadata visible). | **SealedSecret** YAML ✅ (safe; only controller can unseal). |
| **Plaintext on disk** | **.env** only when “unlocked”; **lock** deletes it. Optional **up run** for no file. | Plaintext **Secret** exists only **inside the cluster** after the controller unseals. |

---

## Security model

| Aspect | DotEnvUp | Sealed Secrets |
|--------|----------|----------------|
| **Crypto** | X25519-XChaCha20-Poly1305 (per-recipient). | Asymmetric (controller’s cert); see [Sealed Secrets crypto](https://github.com/bitnami-labs/sealed-secrets#crypto). |
| **Key model** | **Local keypair** per machine (or per repo); optional multi-recipient in one .env.up. | **Controller** holds private key(s) in the cluster; **kubeseal** uses controller’s **public cert** to seal. |
| **Key renewal** | Manual (new keypair); multi-recipient can add new keys. | Controller **auto-renews** sealing keys (e.g. every 30 days); old keys kept so existing SealedSecrets still unseal. |
| **Offline decrypt** | Yes — you have the private key locally. | **No** by design (unless you back up controller keys and use `kubeseal --recovery-unseal`). |

---

## Workflow

| Aspect | DotEnvUp | Sealed Secrets |
|--------|----------|----------------|
| **Encrypt** | `up import .env` → .env.up; **up lock** (removes .env). Or extension: Protect / Import. | Create a K8s Secret (e.g. `kubectl create secret ... -o json`), pipe to **kubeseal** → SealedSecret YAML. |
| **Decrypt / use** | **up unlock** (creates .env) or **up run -- your-app** (inject env, no file). App / `dotenv` reads .env. | **Controller** watches SealedSecrets; creates/updates **Secret** in the same namespace. Pods reference the Secret as usual. |
| **Edit secrets** | Edit .env (when unlocked), then **up import** + **up lock**. Or **Safe Edit** in extension (no .env on disk). | Edit SealedSecret YAML (encrypted blobs) or seal a new Secret and replace; controller reconciles. |
| **Scopes** | N/A (one .env.up per dir; optional multi-recipient). | **strict** (name+namespace fixed), **namespace-wide**, **cluster-wide** — name/namespace can be bound to ciphertext. |

---

## Use case focus

| Aspect | DotEnvUp | Sealed Secrets |
|--------|----------|----------------|
| **Primary use** | **Local app development**: .env for API keys, DB URLs, etc.; safe to commit .env.up; lock when not working. | **GitOps for Kubernetes**: store SealedSecrets in git; controller in cluster unseals to Secrets; no plaintext in repo. |
| **CI/CD** | **up run --** to inject env in CI; or unlock with key from secret store. | Apply SealedSecret YAML (e.g. `kubectl apply -f`); controller creates Secret. |
| **Who uses it** | Developers (and CI) for app config / env vars. | DevOps / platform teams for K8s Secrets; developers may run **kubeseal** to create SealedSecrets. |

---

## When to use which

**Consider DotEnvUp when you want:**

- **Encrypted .env** for **local development** and optional CI: one .env.up in the repo, lock/unlock on your machine.
- **Zero server**: no cluster, no controller — keypair only at **~/.dotenvup/identity**.
- **Explicit lock** that **deletes** .env so plaintext isn’t left on disk.
- **VS Code/Cursor** one-click lock/unlock, Safe Edit, key management.
- **Visible metadata** (key names, versions, timestamps) in .env.up without decrypting.

**Consider Sealed Secrets when you want:**

- **Kubernetes Secrets** stored safely in **git** (GitOps): apply SealedSecret YAML; controller unseals to Secret in the cluster.
- **Only the cluster** to hold the decryption key; developers and git never see plaintext Secrets.
- **Scopes** (strict / namespace-wide / cluster-wide) for where a SealedSecret can be unsealed.
- **Integration** with kubectl, Helm, Kustomize, Flux, Argo CD, etc.

---

## Can you use both?

**Yes.** They solve different layers:

- **DotEnvUp**: encrypt **.env** for **app config** (local dev, optional CI); commit .env.up; no K8s required.
- **Sealed Secrets**: encrypt **K8s Secrets** for **cluster config**; store SealedSecrets in git; controller in cluster.

Typical combo: **DotEnvUp** for local .env and maybe CI env vars; **Sealed Secrets** for secrets that must end up as K8s Secrets (e.g. image pull secrets, DB credentials injected into pods). No overlap in format or runtime.

---

## Summary table

| | DotEnvUp | Sealed Secrets |
|---|----------|----------------|
| **Encrypted artifact** | .env.up (env file format) | SealedSecret (K8s custom resource) |
| **Decryptor** | You (local key) or CI (key in env) | Controller in cluster only |
| **Commit** | .env.up ✅ | SealedSecret YAML ✅ |
| **Environment** | Local / CI (any OS) | Kubernetes cluster + kubeseal CLI |
| **Editor UX** | Lock/unlock; Safe Edit; status bar | kubeseal; edit YAML (encrypted blobs) |
| **Focus** | .env and env vars, zero server | K8s Secrets, GitOps |

**In short:** DotEnvUp is for **encrypted .env on the developer machine** (and CI), with lock/unlock and no server. Sealed Secrets is for **encrypted Kubernetes Secrets in git**, decrypted only by the **controller in the cluster**. Use DotEnvUp for app .env; use Sealed Secrets for K8s Secrets in GitOps.
