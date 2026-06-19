# WCORE Security Audit — 2026-04-19

Audit manuel ciblé (Phase 8 uniquement). Snyk agent-scan skippé (pas de `SNYK_TOKEN`).
Scope : 5 checks WCORE-specific listés par l'utilisateur.

## Summary

| Severity | Count | Items |
|---|---|---|
| HIGH | 0 | — |
| MEDIUM | 2 | A (SSRF via rpc-mcp `url` override), E (Ollama bind `::`) |
| LOW | 0 | — |
| PASS | 3 | B, C, D |

Pas de vulnérabilité critique. 2 findings medium à traiter si exposition hors poste local.

---

## A) Validation URLs RPC dans `rpc-mcp.js` — ⚠️ MEDIUM (SSRF potentiel)

**Fichier** : `.mcp/rpc-mcp.js`

### Ce qui est validé ✅
- Chain key whitelistée via `resolveChain()` (l.140-145) : rejet si clé absente de `CHAINS` (auto-discovery depuis `src/*.gs`, fichiers locaux trusted).
- Adresses EVM validées par regex `/^[0-9a-f]{40}$/` dans `hexPadAddress` (l.188-192).
- Token regex filtre EVM/Solana dans `toolCallPrice` (l.246).
- Adresse Cosmos passée dans `encodeURIComponent(address)` (l.223).
- URLs sources des chaînes extraites uniquement depuis `src/*.gs` locaux (user-owned), pas d'input réseau.

### Ce qui ne l'est pas ⚠️
Trois outils acceptent un paramètre `url` / `endpoints` qui **écrase** la RPC par défaut sans allowlist de scheme ni de host :

| Tool | Paramètre | Ligne |
|---|---|---|
| `rpc_call` | `url` | l.208 `const endpoint = url \|\| c.rpc;` |
| `rpc_validate_endpoint` | `url` | l.264 `const endpoint = url \|\| c.rpc;` |
| `rpc_consensus_check` | `endpoints[]` | l.306 `const list = (endpoints && endpoints.length) ? endpoints : [c.rpc];` |

Le `fetch()` qui en découle (l.152, 175) accepte n'importe quoi : `file://`, `http://169.254.169.254/` (cloud metadata), `http://127.0.0.1:11434/` (Ollama local), `http://[::1]:<port>/` (autres services localhost), etc. Le body `{jsonrpc,id,method,params}` est entièrement contrôlable côté caller → l'attaquant choisit la méthode HTTP (`POST`) et le contenu du corps.

### Vecteur d'attaque réaliste
Prompt injection dans un fichier / page web interprété par le LLM → le modèle appelle `rpc_call({chain:"ETHEREUM", method:"any", params:[...], url:"http://169.254.169.254/latest/meta-data/"})` ou cible un service interne.

### Correctif recommandé
Ajouter une allowlist d'hôtes avant le fetch dans `jsonRpcPost` / `httpGetJson`, ou construire les URLs à partir de la config résolue uniquement :

```js
function assertAllowedEndpoint(url, chain) {
  const u = new URL(url);
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("scheme not allowed");
  // Bloc SSRF de base
  const host = u.hostname.toLowerCase();
  if (host === "localhost" || host === "127.0.0.1" || host === "::1" ||
      host === "169.254.169.254" || host.endsWith(".internal")) {
    throw new Error("private/link-local endpoint blocked");
  }
  // Optionnel: restreindre aux endpoints connus de la chain
  const known = new Set([chain.rpc, ...(chain.endpoints || [])]);
  if (!known.has(url)) throw new Error("endpoint not in chain whitelist");
}
```

Ou plus simple : retirer purement `url`/`endpoints` du schema des tools concernés (l.323-338) — le debug via URL override reste possible en ajoutant temporairement l'endpoint au fichier `.gs`.

### Patch v2 (2026-04-19)

Trois bypasses confirmés via PoC `node` et corrigés dans `.mcp/rpc-mcp.js` :

| ID | Sévérité | Bypass | Correctif |
|---|---|---|---|
| B1 | CRITICAL | IPv6 v4-mapped hex form (`::ffff:7f00:1` = 127.0.0.1) non normalisé → ALLOWED | Normalisation hex→dotted dans `assertSafeEndpoint` avant les checks IPv6 existants ; appel récursif sur la forme dotted |
| B3 | HIGH | DNS-to-private (`127.0.0.1.nip.io`) : hostname public mais résout vers privé | Nouveau `assertSafeEndpointWithDns` : post-DNS lookup + `assertSafeEndpoint` sur l'IP résolue. Si `ENOTFOUND`, pass-through (fetch échouera de toute façon) |
| B4 | MEDIUM | `fetch` default `redirect:"follow"` → endpoint légitime 302→`169.254.169.254` bypass | `redirect:"manual"` sur les deux `fetch()` (`jsonRpcPost` + `httpGetJson`) ; throw `redirect blocked: <location>` sur statut 3xx |

Smoke test : 15 cas (11 BLOCK + 2 ALLOW sync, B3 nip.io async, B4 redirect async) → **ALL PASSED**.

---

## B) Clés API dans `~/.claude.json` et `~/.codex/config.toml` — ✅ PASS

Grep insensible à la casse sur `(api[_-]?key|token|secret|password|bearer|authorization|credentials|private[_-]?key|OPENAI|ANTHROPIC)`.

### `~/.claude.json` (29 737 octets)
- Aucun secret en clair.
- Matches `token` = comptabilité de tokens LLM (`inputTokens`, `cacheReadInputTokens`, `claudeCodeFirstTokenDate`, `token_refresh_buffer_ms`), pas des credentials.
- Seule référence credential : l.668 `GOOGLE_APPLICATION_CREDENTIALS = C:/Users/strau/.config/gsheets-mcp/service-account.json` → chemin vers un fichier hors du home-config ← cf. check D.

### `~/.codex/config.toml` (1 415 octets)
- l.15 : `env = { GOOGLE_PROJECT_ID = "wcore-mcp", GOOGLE_APPLICATION_CREDENTIALS = "..." }` → même chemin, aucun contenu de clé.
- l.22 : `command = "C:/Users/strau/.local/bin/token-savior.exe"` → chemin d'exécutable, pas un secret.

### `.mcp/*.js`
- Grep `(GOOGLE_APPLICATION_CREDENTIALS|service[_-]?account|credentials\.json|client_email|private_key)` → **aucun match**.

**Verdict** : aucun hardcode de secret dans les fichiers audités. Les chemins référencés sont des pointeurs vers des fichiers externes, ce qui est la pratique attendue.

---

## C) Scope de `clasp-mcp.js` — ✅ PASS

**Fichier** : `.mcp/clasp-mcp.js`

- **Scope hardcodé** : l.11 `const PROJECT_DIR = path.resolve(__dirname, "..")` → résolu au parent du dossier `.mcp/`, soit `wcore-gsheet/`. Immuable au runtime.
- **CWD forcé** : `runClasp` (l.26) utilise `cwd = PROJECT_DIR` par défaut, et aucun call site dans `handleToolCall` (l.129-171) ne passe un `cwd` override → tous les `clasp` s'exécutent strictement dans `wcore-gsheet/`.
- **Pas d'argument `path`** sur `clasp_push` (l.70-79) : seul flag exposé = `force: boolean`. Impossible de pousser ailleurs via l'MCP.
- **Shell injection** : `shellEscape` (l.19-24) quote agressivement pour cmd.exe (`^` escape sur `["\\^&|<>%]`) et rejette `\0\r\n`. Args passés en string à `spawn(..., {shell: true})` — format attendu et cohérent avec l'escape.
- **Validation `clasp_run`** : `FN_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/` (l.127) bloque toute injection via le nom de fonction.
- **Timeouts** : 120s default, 180s pour `push`/`pull`/`deploy`, 60s pour `logs`. Kill explicite via `setTimeout` + `child.kill()`.

**Caveat résiduel (configuration, pas code)** : si `.clasp.json` est modifié à la main pour pointer vers un autre `scriptId`, `clasp push` enverra ailleurs. C'est une responsabilité utilisateur, pas de l'MCP.

---

## D) Chemin service account Google Sheets dans les logs — ✅ PASS

- **Référencé** dans :
  - `~/.claude.json:668` (config MCP gsheets env block)
  - `~/.codex/config.toml:15` (config Codex MCP)
  - Aucun autre fichier tracké dans le repo `wcore-gsheet/` (`git ls-files | xargs grep -l "service-account\|GOOGLE_APPLICATION_CREDENTIALS\|gsheets-mcp"` → aucun match).
- **Pas de log** : `.mcp/*.js` ne log jamais le chemin ni le contenu du fichier (grep vide).
- **Fichier réel** : `C:/Users/strau/.config/gsheets-mcp/service-account.json`
  - Existe, 2 343 octets, modifié 2026-04-18
  - Owner : `FLORIAN\strau`
  - ACL : `NT AUTHORITY\SYSTEM`, `BUILTIN\Administrators`, `strau` → FullControl chacun
  - Pas de `Everyone` / `Users` / `Authenticated Users` dans les ACEs → conforme au principe du moindre privilège sur Windows.
- **Hors du repo** : `~/.config/gsheets-mcp/` ≠ `wcore-gsheet/`. Pas de risque de commit accidentel.

**Recommandation mineure** : envisager de déplacer le fichier dans un dossier chiffré (BitLocker already on C:) ou d'activer l'attribut `Hidden + System` pour réduire la visibilité en énumération casual. Non bloquant.

---

## E) Manifest `localhost:3001` et Ollama `11434` — ⚠️ MEDIUM (Ollama bind exposé)

`Get-NetTCPConnection -State Listen` sur les deux ports :

| Port | LocalAddress | PID | Verdict |
|---|---|---|---|
| 3001 (Manifest) | `127.0.0.1` | 18584 | ✅ loopback-only |
| 11434 (Ollama) | `::` | 30780 | ⚠️ toutes interfaces IPv6 |

### Analyse Ollama `::`
- `::` = équivalent IPv6 de `0.0.0.0` → écoute sur toutes les interfaces IPv6, **pas loopback-only**.
- Les connexions IPv4 vers 11434 ne sont PAS couvertes par ce bind IPv6 (pas de dual-stack par défaut sur Windows → un autre listener IPv4 séparé serait nécessaire pour accepter IPv4, donc IPv4 probablement implicitement en `0.0.0.0` ou absent). À vérifier avec `Get-NetTCPConnection -LocalPort 11434 -AddressFamily IPv4`.
- **Firewall** : aucune règle explicite `Get-NetFirewallPortFilter -LocalPort 11434`. Windows Defender Firewall bloque par défaut les connexions inbound non-matchées sur le profil Public. Sur Private/Domain, le comportement dépend du profil courant.
- Ce bind `::` apparaît quand `OLLAMA_HOST=0.0.0.0` ou `::` est défini dans les variables d'environnement ou le service Ollama.

### Surface d'attaque
- Si le poste est sur un réseau hostile (café, hôtel, wifi public), un attaquant en LAN peut potentiellement atteindre Ollama → inférence gratuite sur tes modèles, DoS, et éventuellement attaque via payload malformé sur l'API `/api/generate`.
- En LAN de confiance (domicile) : risque faible mais pas nul (compromission latérale d'un autre appareil → accès aux prompts/logs Ollama).

### Correctif recommandé
Forcer Ollama en loopback-only :

**Variante 1 — variable d'environnement**
```powershell
[System.Environment]::SetEnvironmentVariable("OLLAMA_HOST", "127.0.0.1:11434", "User")
```
Puis redémarrer le service Ollama.

**Variante 2 — règle firewall explicite (defense-in-depth)**
```powershell
New-NetFirewallRule -DisplayName "Block Ollama 11434 inbound" `
  -Direction Inbound -Action Block -Protocol TCP -LocalPort 11434 `
  -Profile Any -RemoteAddress "!127.0.0.1,!::1"
```

Tester ensuite :
```powershell
Get-NetTCPConnection -State Listen | Where-Object LocalPort -eq 11434
# Doit montrer 127.0.0.1 ou ::1, pas ::
```

---

## Recommandations par priorité

1. **(Medium, 5 min)** Fixer Ollama en loopback — `OLLAMA_HOST=127.0.0.1:11434` puis restart service. Vérifier via `Get-NetTCPConnection`. → Check E.
2. **(Medium, 30 min)** Ajouter une allowlist d'hôtes dans `rpc-mcp.js` (`jsonRpcPost`/`httpGetJson`) ou retirer les paramètres `url`/`endpoints` des tools `rpc_call`/`rpc_validate_endpoint`/`rpc_consensus_check`. → Check A.
3. **(Low, optionnel)** Déplacer `service-account.json` vers un dossier avec ACL plus restrictif (retirer `BUILTIN\Administrators` si single-user).

## Passed Checks ✅

- **B** : aucun secret hardcodé dans `~/.claude.json`, `~/.codex/config.toml`, ni `.mcp/*.js`. Seuls des chemins vers credentials externes.
- **C** : `clasp-mcp.js` est scopé à `wcore-gsheet/` de manière immuable, valide le nom de fonction pour `clasp_run`, escape correctement les args shell.
- **D** : chemin credentials pas logué dans les MCPs. Service account hors du repo git. ACL Windows restreinte à `SYSTEM`, `Administrators`, user owner.

---

_Audit réalisé par inspection manuelle (Read + Grep + PowerShell). Aucun outil de scan automatisé utilisé._
