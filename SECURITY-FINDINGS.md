# OpenRemote — Application Security Findings

**Date:** 2026-06-09
**Scope:** Vulnerabilities introduced by the OpenRemote codebase itself (application logic), **not** third-party dependency CVEs.
**Method:** Manual data-flow review from HTTP/MQTT entry points to sinks, across authentication/authorization, multi-tenancy (realm) isolation, dynamic SQL, file handling, SSRF, XXE, deserialization, the rules engine, and the web UI.

> **How to read severities** — `read:assets`, `write:assets`, `write:rules`, `write:alarms`, `read:admin`, `write:admin` are **realm-scoped** roles held by ordinary (non-superuser) users *within a realm*. "Super-user" is the `admin` realm-role in the `master` realm. The recurring problem below is endpoints that check the **caller's** realm/role but never check the **target object's** realm — yielding cross-tenant access.

## Headline

The dominant vulnerability class is **broken access control — cross-tenant (realm) IDOR**. A secondary cluster is **SSRF** with no network-egress filtering. The cryptographic and parsing primitives (JWT verification, XML/XXE hardening, Java/Jackson deserialization, and the large majority of dynamic SQL) were reviewed and found **sound** — the weaknesses are in authorization logic.

## Summary table

| # | Finding | Class (CWE) | Severity | Min. privilege |
|---|---------|-------------|----------|----------------|
| [1](#1-cross-realm-bulk-alarm-deletion-removealarms) | Cross-realm bulk alarm deletion (`removeAlarms`) | Broken object-level authz (639) | **High** | `write:alarms` |
| [2](#2-cross-realm-user--service-account-secret-disclosure) | Cross-realm user / service-account-secret disclosure | Broken object-level authz (639/200) | **High** | `read:admin` |
| [3](#3-notification-admin-endpoints-not-realm-scoped) | Notification admin endpoints not realm-scoped; `removeNotification` has no authz | Broken authz (862/639) | **High** | `read:admin` / `write:admin` |
| [4](#4-full-read-ssrf-via-http-agent-baseuri) | Full-read SSRF via HTTP agent `baseURI` | SSRF (918) | **High** | `write:assets` |
| [5](#5-blind-ssrf-via-webhook-rule-action) | Blind SSRF via webhook rule action | SSRF (918) | **High** | `write:rules` |
| [6](#6-groovy-rules-execute-unsandboxed-latent-rce) | Groovy rules execute unsandboxed (dead sandbox) | Code injection (94) | **High** (latent) | super-user today |
| [7](#7-unauthenticated-mqtt-session-disconnect-disconnectusersession) | Unauthenticated MQTT session disconnect | Missing authentication (306) | **Medium** | anonymous |
| [8](#8-second-order-sql-injection-in-csv-crosstab-export) | Second-order SQLi via asset name in CSV crosstab export | SQL injection (89) | **Medium** | `write:assets` |
| [9](#9-stored-xss-via-map-marker-label) | Stored XSS via map-marker label | XSS (79) | **Medium** | attribute writer |
| [10](#10-cors-allow-all-with-credentials) | CORS allow-all + credentials (dev default + prod wildcard-collapse) | CORS misconfig (942) | **Medium** | remote web attacker |
| [11](#11-device-provisioning--no-revocation-ca-expiry-unchecked) | Device provisioning: no revocation, CA expiry unchecked | Improper cert validation (299/298) | **Medium** | operational |
| [12](#12-lower-severity--defense-in-depth) | Lower-severity / defense-in-depth (10 items) | various | Low | various |

---

## 1. Cross-realm bulk alarm deletion (`removeAlarms`)

- **Severity:** High · **CWE-639** (Authorization Bypass Through User-Controlled Key) · *verified against source*
- **Location:** `manager/src/main/java/org/openremote/manager/alarm/AlarmResourceImpl.java:73-88`
- **Required role:** `WRITE_ALARMS_ROLE` (a normal operator role — `model/.../alarm/AlarmResource.java:57`)

The only check is on the **caller's own** realm (always accessible); the supplied alarm IDs are never checked against that realm:

```java
public void removeAlarms(RequestParams requestParams, List<Long> alarmIds) {
    if (!isRealmActiveAndAccessible(getAuthenticatedRealmName())) {   // caller's OWN realm — always true
        throw new ForbiddenException(...);
    }
    List<SentAlarm> alarms = alarmService.getAlarms(alarmIds);        // load by ID, no realm filter
    alarmService.removeAlarms(alarms, alarmIds);                      // DELETE ... where id in :ids
}
```

The singular `removeAlarm` (line 109) **correctly** checks `alarm.getRealm()`; only the bulk path regressed. Alarm IDs are sequential `Long`s.

**Exploit:** As any `write:alarms` user in realm A: `DELETE /api/A/alarm` with body `[1,2,3,…]` deletes alarms belonging to **every** tenant.

**Proposed fix** — validate every fetched alarm's realm, mirroring the single-delete path:

```java
@Override
public void removeAlarms(RequestParams requestParams, List<Long> alarmIds) {
    try {
        List<SentAlarm> alarms = alarmService.getAlarms(alarmIds);
        for (SentAlarm alarm : alarms) {
            if (!isRealmActiveAndAccessible(alarm.getRealm())) {
                throw new ForbiddenException("Realm '" + alarm.getRealm() + "' is nonexistent, inactive or inaccessible");
            }
        }
        alarmService.removeAlarms(alarms, alarmIds);
    } catch (EntityNotFoundException e) {
        throw new WebApplicationException(Response.Status.NOT_FOUND);
    } catch (ForbiddenException e) {
        throw new WebApplicationException(Response.Status.FORBIDDEN);
    } catch (IllegalArgumentException e) {
        throw new WebApplicationException(Response.Status.BAD_REQUEST);
    }
}
```

**Related defects in the same file (fix together):**
- `setAssetLinks` (`:174-192`) validates only the **first** realm in the list — iterate and check **all** realms in `links`.
- `getAssetLinks` (`:159-171`) trusts the `realm` query parameter without binding it to the alarm's real realm — load the alarm and compare.

---

## 2. Cross-realm user & service-account-secret disclosure

- **Severity:** High · **CWE-639 / CWE-200** · *verified against source*
- **Locations:** `manager/src/main/java/org/openremote/manager/security/UserResourceImpl.java`
  - `get` — `:101-118`
  - `getUserSessions` — `:417-430`
  - `getUserClientRoles` — `:293-310`
  - `getUserRealmRoles` — `:312-329`
- **Required role:** `read:admin` (a per-realm admin role, **not** super-user). The roles/sessions endpoints have **no `@RolesAllowed`** on the interface at all (`model/.../security/UserResource.java:151-161,195-199`).

The gate is "do you hold `read:admin`?" — evaluated against the caller's own token — and the `{realm}` path parameter is **never compared to the caller's realm**:

```java
public User get(RequestParams requestParams, String realm, String userId) {
    boolean hasAdminReadRole = hasResourceRole(ClientRole.READ_ADMIN.getValue(), Constants.KEYCLOAK_CLIENT_ID);
    if (!hasAdminReadRole && !Objects.equals(getUserId(), userId)) {
        throw new ForbiddenException(...);
    }
    return identityService.getIdentityProvider().getUser(userId);   // DB lookup by ID only — realm IGNORED
}
```

`getUser(userId)` resolves by primary key with no realm predicate (`ManagerIdentityProvider.getUserByIdFromDb`: `select u from User u where u.id = :userId`). A realm-A admin can therefore read **any** user in **any** realm by UUID — full record including, for **service accounts, the client secret** (→ impersonation of that service account).

The write equivalents (`update`, `delete`, role writes) correctly call `throwIfNotSameRealm` / `throwIfCannotAdminRealm`; the read paths omit it.

**Proposed fix** — reuse the existing realm helper and verify the resolved user actually belongs to the requested realm. Apply the same pattern to all four methods:

```java
public User get(RequestParams requestParams, String realm, String userId) {
    boolean hasAdminReadRole = hasResourceRole(ClientRole.READ_ADMIN.getValue(), Constants.KEYCLOAK_CLIENT_ID);
    if (!hasAdminReadRole && !Objects.equals(getUserId(), userId)) {
        throw new ForbiddenException("Can only retrieve own user info unless you have role '" + ClientRole.READ_ADMIN + "'");
    }
    // Enforce realm isolation: non-super-users may only target their own (accessible) realm...
    throwIfCannotAdminRealm(realm);                     // already exists in this class (:483)
    User user = identityService.getIdentityProvider().getUser(userId);
    // ...and the resolved user must actually live in that realm
    if (user != null && !realm.equals(user.getRealm())) {
        throw new ForbiddenException("User not in realm");
    }
    return user;
}
```

For `getUserClientRoles`, `getUserRealmRoles`, and `getUserSessions`, add `throwIfCannotAdminRealm(realm);` after the `read:admin` check (the underlying Keycloak provider already scopes roles by `realm(realm).users().get(userId)`, but the explicit check makes isolation independent of provider behavior and covers the DB-backed `getUserSessions`). Also add `@RolesAllowed(Constants.READ_ADMIN_ROLE)` to these three interface methods for defense in depth (they have no "own user" variant — `getCurrentUser*Roles` cover that case separately).

---

## 3. Notification admin endpoints not realm-scoped

- **Severity:** High · **CWE-862 / CWE-639** · *verified against source*
- **Locations:** `manager/src/main/java/org/openremote/manager/notification/NotificationResourceImpl.java:64-104`; service `NotificationService.java:324-360` (applies no realm scoping)
- **Required role:** `READ_ADMIN_ROLE` / `WRITE_ADMIN_ROLE` (per-realm admin), despite the Javadoc claiming "Only the superuser can call this operation."

```java
public SentNotification[] getNotifications(... String realmId, String userId, String assetId) {
    return notificationService.getNotifications(... realmId..., userId..., assetId...).toArray(...);  // no realm check
}
public void removeNotification(RequestParams requestParams, Long notificationId) {
    notificationService.removeNotification(notificationId);   // NO authorization at all — deletes by ID
}
```

A realm-B admin can read/delete **any** realm's notifications, and `removeNotification(id)` performs **zero** authorization — `DELETE /notification/{anyId}` deletes any notification by sequential ID. Notification bodies routinely contain message text / PII / alarm detail.

**Proposed fix** — there are two coherent options; pick per product intent:

**Option A (match the Javadoc — super-user only):** add `@RolesAllowed` is insufficient since `read:admin` ≠ super-user; enforce in-method:

```java
if (!isSuperUser()) {
    throw new ForbiddenException("Only super users may query/delete notifications by target");
}
```

**Option B (recommended — proper multi-tenant scoping):** allow realm admins, but constrain to their realm.

```java
// getNotifications / removeNotifications: force realm for non-super-users
String callerRealm = getAuthenticatedRealmName();
List<String> realmIds = isSuperUser()
        ? (realmId != null ? List.of(realmId) : null)
        : List.of(callerRealm);                 // ignore/override client-supplied realmId

// removeNotification(id): resolve the target's realm and check access
SentNotification n = notificationService.getSentNotification(notificationId);
if (n == null) throw new WebApplicationException(NOT_FOUND);
String targetRealm = /* realm of n.getTargetId() (user/asset/realm) */;
if (!isRealmActiveAndAccessible(targetRealm)) {
    throw new WebApplicationException(FORBIDDEN);
}
notificationService.removeNotification(notificationId);
```

Whichever path is chosen, `removeNotification(Long)` must gain an authorization check — today it has none.

---

## 4. Full-read SSRF via HTTP agent `baseURI`

- **Severity:** High · **CWE-918**
- **Location:** `agent/src/main/java/org/openremote/agent/protocol/http/HTTPProtocol.java:316-343`; sink `container/src/main/java/org/openremote/container/web/WebTargetBuilder.java`
- **Required role:** `WRITE_ASSETS_ROLE`

An Agent is an Asset, so creating an `HTTPAgent` requires only `write:assets`. Its `baseURI` attribute flows unchecked into the JAX-RS client, and polling responses are written back to a linked attribute (`onPollingResponse:565-586` → `updateLinkedAttribute`) — so the **response body is readable**:

```java
uri = new URIBuilder(baseUri).build();                 // baseUri = agent.getBaseURI() (attacker-controlled)
target = new WebTargetBuilder(client, uri).build();    // no host validation anywhere
```

**Exploit:** create an `HTTPAgent` with `baseURI = http://169.254.169.254/latest/meta-data/iam/security-credentials/…` plus a polling agent-link; read the exfiltrated cloud credentials back from the linked attribute. Also applies to the Mail agent (`agent/.../mail/MailClient.java:140-144`) and anything built on `WebTargetBuilder`.

**Proposed fix** — central egress validation (also fixes Finding 5). Resolve the host and reject non-public targets unless explicitly allow-listed:

```java
// e.g. in WebTargetBuilder construction / a shared SsrfGuard.assertAllowed(uri)
InetAddress[] addrs = InetAddress.getAllByName(uri.getHost());
for (InetAddress a : addrs) {
    if (a.isLoopbackAddress() || a.isLinkLocalAddress() || a.isSiteLocalAddress()
            || a.isAnyLocalAddress() || a.isMulticastAddress()
            || a.getHostAddress().startsWith("169.254.")        // link-local / cloud metadata
            || isUniqueLocalIPv6(a)) {                          // fc00::/7
        if (!egressAllowList.contains(uri.getHost())) {
            throw new IllegalArgumentException("Blocked SSRF target: " + uri.getHost());
        }
    }
}
```

Notes: provide an operator allow-list (`OR_HTTP_EGRESS_ALLOWLIST`) for legitimate internal endpoints; keep `followRedirects=false` (already the default) so a 30x cannot bypass the check; to fully close DNS-rebinding, pin the validated `InetAddress` and connect to it directly.

---

## 5. Blind SSRF via webhook rule action

- **Severity:** High · **CWE-918**
- **Location:** `manager/src/main/java/org/openremote/manager/webhook/WebhookService.java:80`; data flow from `manager/.../rules/JsonRulesBuilder.java:991-1017`
- **Required role:** `write:rules` (JSON rulesets are **not** super-user-gated — only Groovy is)

```java
WebTargetBuilder builder = new WebTargetBuilder(getClient(), URI.create(webhook.getUrl()));  // attacker URL
```

Any `write:rules` user can author a JSON rule whose `then` action POSTs attacker-controlled method/headers/body to `http://169.254.169.254/…` or an internal service. Blind (only the status is logged, `:67-71`; redirects off), but usable for internal POSTs, metadata exfil where a GET-with-headers suffices, and port/timing probing.

**Proposed fix:** route `WebhookService.buildWebTarget` through the same `SsrfGuard` from Finding 4. One central control covers both findings.

---

## 6. Groovy rules execute unsandboxed (latent RCE)

- **Severity:** High (latent) · **CWE-94**
- **Location:** `manager/src/main/java/org/openremote/manager/rules/RulesetDeployment.java:70-94, 320-356`

A `GroovyDenyAllFilter`/`SandboxTransformer` is defined, but the runtime interceptor that actually enforces it is **commented out** and exists nowhere:

```java
// TODO Implement sandbox
// new DenyAll().register();
Script script = groovyShell.parse(ruleset.getRules());   // runs as fully privileged Java
```

`SandboxTransformer` only filters calls while a `GroovyInterceptor` is registered on the executing thread, so all Groovy executes unsandboxed (`Runtime.exec`, file IO, reflection).

**Current mitigation:** every Groovy write path in `RulesResourceImpl` requires `isSuperUser()` (`:277-281, 327-329, 349-351, 376-380, 430-434`), and the only DB store path (`RulesetStorageService.merge`) is reached only through those. So this is **not** a privilege-escalation vector today — but host RCE is guarded by a single boolean, and the shipped `GroovyDenyAllFilter` gives a false impression of protection. Any new code path that persists a `GROOVY` ruleset without that check (import/setup/MQTT/gateway sync) becomes instant RCE.

**Proposed fix** — make the control real (defense in depth), not cosmetic. Register the interceptor around compile/run with an allow-list, e.g.:

```java
GroovyInterceptor interceptor = new GroovyAllowListFilter(/* permitted receivers/methods */);
interceptor.register();
try {
    Script script = groovyShell.parse(ruleset.getRules());
    script.run();
} finally {
    interceptor.unregister();
}
```

If a full sandbox is out of scope, **remove the dead `GroovyDenyAllFilter`/`SandboxTransformer` scaffolding** and document the "super-user authors Groovy = trusted code execution by design" trust model explicitly, so reviewers don't assume protection that isn't there.

---

## 7. Unauthenticated MQTT session disconnect (`disconnectUserSession`)

- **Severity:** Medium · **CWE-306** (Missing Authentication for Critical Function) · *verified against source*
- **Location:** `manager/src/main/java/org/openremote/manager/security/UserResourceImpl.java:432-437`; interface `model/.../security/UserResource.java:201-204`

The method has **no in-method auth check**, and its interface entry has **no `@RolesAllowed`** (only `@GET`/`@Path`/`@Operation`):

```java
public void disconnectUserSession(RequestParams requestParams, String realm, String sessionID) {
    if (!mqttBrokerService.disconnectSession(sessionID)) {   // no isAuthenticated(), no role, no realm check
        throw new NotFoundException("User session not found");
    }
}
```

RESTEasy runs with `setSecurityEnabled(true)` (only *annotated* methods are access-restricted, `container/.../web/WebService.java:344-346`) and `JWTAuthenticationFilter` lets anonymous requests through, so **anyone** can call `GET /api/{realm}/disconnect/{sessionID}` and force-disconnect a session. `disconnectSession` looks up the connection by ID across the whole broker with no realm scoping. Impact is bounded by connection-ID unpredictability (targeted termination / brute-force DoS), hence Medium.

**Proposed fix:**

```java
// interface (UserResource.java)
@RolesAllowed(Constants.WRITE_ADMIN_ROLE)
void disconnectUserSession(...);
```
```java
// impl — also scope to the caller's realm
public void disconnectUserSession(RequestParams requestParams, String realm, String sessionID) {
    throwIfCannotAdminRealm(realm);
    if (!mqttBrokerService.disconnectSession(sessionID)) {
        throw new NotFoundException("User session not found");
    }
}
```

> **Systemic note:** audit every JAX-RS method across the API for a missing `@RolesAllowed`. Because the deployment is "secure but default-permit when unannotated," an unannotated method with no in-method guard is publicly reachable. `disconnectUserSession` is the clearest instance; treat the annotation as mandatory on every mutating endpoint.

---

## 8. Second-order SQL injection in CSV crosstab export

- **Severity:** Medium · **CWE-89** · *verified against source*
- **Location:** `manager/src/main/java/org/openremote/manager/datapoint/AssetDatapointService.java:330-332` (header from `:385-391`)
- **Required role:** `write:assets` (ability to set an asset name)

The category VALUES list escapes single quotes (`:325`), but the crosstab **column-definition** list does not escape double quotes in the header, which is built from the free-form asset name:

```java
String attributeColumns = headers.stream()
    .map(header -> "\"" + header + "\" text")   // header = assetName + " : " + attrName; '"' NOT escaped
    .collect(Collectors.joining(", "));
...
"copy (select * from crosstab('%s', $cat$%s$cat$) as ct(timestamp timestamp, %s)..."  // %s = attributeColumns
```

Asset `name` is `@NotBlank @Size(max=1023)` with **no character restriction**, so it may contain `"`. A user renames an asset to embed a `"` and a crafted identifier payload, then calls `GET /asset/datapoint/export?...&format=CSV_CROSSTAB`, breaking out of the quoted column identifier. The attribute *name* is not a vector (`^\w+$`); the asset *name* is. The plain-CSV path and all other dynamic SQL in the codebase use parameter binding and are safe — this is the one genuine injection.

**Proposed fix** — escape embedded double quotes when forming the SQL identifier (and, ideally, derive column names from a safe surrogate index):

```java
.map(header -> "\"" + header.replace("\"", "\"\"") + "\" text")
```

---

## 9. Stored XSS via map-marker label

- **Severity:** Medium · **CWE-79**
- **Location:** `ui/component/or-map/src/markers/or-map-marker.ts:368-371` (template `:137-153`); source `or-map-marker-asset.ts:191-194`
- **Required role:** ability to write the labelled attribute (within a realm)

The marker `displayValue` — an asset attribute value fetched raw via `Util.getValueAsString` (no escaping, `core/src/util.ts:655-662`) — is interpolated into `innerHTML` (plain DOM, **not** Lit auto-escaping):

```ts
div.innerHTML = OrMapMarker._defaultTemplate(this.icon, {displayValue: this.displayValue, direction: this.direction});
// template: `<div class="label"><span>${options.displayValue}</span></div>`
```

When a marker is configured to show a string attribute as its label, anyone who can write that attribute stores e.g. `<img src=x onerror=alert(document.cookie)>`, which runs in every viewer's browser.

**Proposed fix** — escape before injecting, or build the node with `textContent`:

```ts
const esc = (s: string) => s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
// ...`<span>${esc(options.displayValue)}</span>`...
```

Also numeric-validate `direction` before placing it in inline CSS (`transform: rotate(${direction}deg)`).

---

## 10. CORS allow-all with credentials

- **Severity:** Medium · **CWE-942** · *verified against source*
- **Location:** `container/src/main/java/org/openremote/container/web/CORSConfig.java:38, 47, 127-132`; default `model/.../util/Config.java:33` (`OR_DEV_MODE` default **true**)

`corsAllowCredentials` defaults `true`. In dev mode the allowed origin is `*`, and `OR_DEV_MODE` defaults to `true`; with the `com.thetransactioncompany` CORS filter, `allowOrigin=*` + credentials reflects the request `Origin` and sets `Access-Control-Allow-Credentials: true`, so any site can issue credentialed cross-origin reads. Worse, even in production, **any** wildcard-containing entry collapses to allow-**all**:

```java
boolean containsWildcard = allowedOrigins.stream().anyMatch(o -> o.contains(DEFAULT_CORS_ALLOW_ALL));
if (containsWildcard) {
    allowedOrigins = Set.of(DEFAULT_CORS_ALLOW_ALL);     // a subdomain wildcard silently disables ALL origin checks
}
```

So `OR_WEBSERVER_ALLOWED_ORIGINS=https://*.example.com` (intending a subdomain wildcard) disables all origin restrictions while credentials remain on. (Shipped production profiles set `OR_DEV_MODE=false`, and the API is primarily Bearer-token rather than cookie authenticated, which reduces — but does not eliminate — practical impact.)

**Proposed fixes:**
- Never combine `Access-Control-Allow-Origin: *` with `Allow-Credentials: true`. If origins resolve to `*`, force `corsAllowCredentials=false`.
- Do **not** collapse partial wildcards to allow-all. Either implement proper suffix matching (`*.example.com`) in the filter, or reject/log the misconfiguration instead of silently widening it.
- Decouple the dev-mode relaxations from the **default-`true`** `OR_DEV_MODE`; require an explicit opt-in (`OR_DEV_MODE` should default to `false`, or CORS-allow-all should require its own flag).

---

## 11. Device provisioning — no revocation, CA expiry unchecked

- **Severity:** Medium · **CWE-299 / CWE-298**
- **Location:** `manager/src/main/java/org/openremote/manager/mqtt/UserAssetProvisioningMQTTHandler.java:444-468`

The device-certificate **signature** check is cryptographically sound (a forged CA is correctly rejected — confirmed empirically against the project's `device4_forged.pem`). What is missing:

```java
clientCertificate.verify(caCertificate.getPublicKey());          // (signature only)
if (!config.getData().isIgnoreExpiryDate()) {
    clientCertificate.checkValidity(now);                        // CLIENT expiry only
}
// caCertificate.checkValidity(now)  — NEVER called → expired CA keeps provisioning
// No CRL / OCSP anywhere → individual devices cannot be revoked
```

Device certs are minted with `notAfter = 2071`, so a single extracted device key is a permanent foothold (auto-recreates its service user + asset on reconnect) until an operator disables the whole config. The bundled `device3_caexpired.pem` is accepted.

**Proposed fixes:**
- Add `caCertificate.checkValidity(now);` (gated behind the same `isIgnoreExpiryDate` flag if desired).
- Add a per-`ProvisioningConfig` revocation mechanism — at minimum a serial-number denylist checked here; ideally CRL/OCSP via `CertPathValidator` + `PKIXParameters`.
- Optionally require the configured issuer to be a real CA (`BasicConstraints CA:TRUE`) and check `KeyUsage`.

---

## 12. Lower-severity / defense-in-depth

| Item | Location | Note / fix |
|------|----------|------------|
| Dashboard `update` mass-assignment | `manager/.../dashboard/DashboardStorageService.java:266-295` | `em.merge` persists the whole client object; a user with write access to a shared dashboard can change `ownerId`/`access`. Copy immutable fields from the stored entity before merge. Within-realm only. |
| Path containment via `.contains()` not `.startsWith()` | `manager/.../app/ConfigurationService.java:251,282`; `manager/.../map/MapService.java:510` | Blocks standard `../` traversal but is fragile. Use `Path.toRealPath()` + `startsWith(baseReal)`. |
| Unauthenticated config/image endpoints | `model/.../manager/ConfigurationResource.java:59-68` | Likely intentional (pre-login branding). Confirm `getManagerConfig` leaks no sensitive data; tighten the `{filename:.+}` regex. |
| Certificate CN injection | `manager/.../mqtt/UserAssetProvisioningMQTTHandler.java:537-543` | CN used as `String.replaceAll` replacement (where `$`/`\` are special) and injected into a JSON asset template. Use `Matcher.quoteReplacement(cn)` and validate CN charset (`[A-Za-z0-9._-]`). Needs an attacker-chosen CA-signed CN. |
| `eval()` of attribute data | `ui/component/or-asset-tree/src/index.ts:1359-1363` | Numeric filter concatenates `attr.value` unquoted into `eval`. Replace with a numeric comparator parser. |
| PBKDF2 at 1000 iterations | `container/.../security/basic/PasswordStorage.java:70` | Only the non-default `BasicIdentityProvider` (Keycloak is default). Constant-time compare is correct. Raise iterations / migrate to PBKDF2-HMAC-SHA256 if this path is used. |
| Weak CSP (no `script-src`/`default-src`) | `manager/.../security/ManagerKeycloakIdentityProvider.java:1276-1295` | Add a restrictive `script-src`/`default-src`; removing `'unsafe-eval'` also mitigates the `eval` sinks. |
| Offline refresh token in localStorage | `ui/.../core/src/index.ts:982-985` → `console.ts:493` | Native/offline path only; long-lived token readable by any XSS on the origin. Scope/shorten where possible. |
| JWT audience service-account bypass | `container/.../security/keycloak/TokenVerifierImpl.java:96-105` | Documented TODO (#2642); signature+issuer still enforced, so it only permits replay of a validly-signed service-account token from another client in the same realm. |
| `forceClientDisconnects` NPE | `manager/.../mqtt/UserAssetProvisioningMQTTHandler.java:558-569` | `remove()` may return null → `forEach` NPE on config update/delete. Null-guard. |
| Inverted realm check in dead code | `manager/.../agent/AgentResourceImpl.java:249` | `getParent` throws when realm *matches* (logic reversed). Currently unused + super-user-gated. Fix or remove. |
| Empty default KeyStore password | `manager/.../security/KeyStoreServiceImpl.java:87` | Local keystore defaults to empty password if `OR_KEYSTORE_PASSWORD` unset. Low (local file), but document/require it. |

---

## Reviewed and found sound (negative results)

- **JWT verification** — RS256 pinned (no `alg:none`/HS256 confusion), JWKS-by-`kid`, `exp`/`nbf`, issuer == `{publicUrl}/realms/{realm}`, realm-binding to the `Realm` header, cross-realm restricted to super-users (`TokenVerifierImpl`).
- **Dynamic SQL** — the asset query builder, datapoint/dashboard/alarm/ruleset/notification/user query builders, and `LTreeType` all use JPA/JDBC parameter binding; the only concatenated values are typed primitives/enums. (Sole exception: Finding 8.)
- **XXE** — real XML sinks (VELBUS, KNX) build hardened factories (DTD/external-entity disabled); the generic parser is not used on untrusted input.
- **Deserialization** — no `ObjectInputStream`/`readObject`; Jackson polymorphism uses `@JsonTypeInfo(use = Id.NAME)` with explicit subtypes; no `activateDefaultTyping`.
- **Static-file & map-tile serving** — Undertow canonicalizes/blocks `../`; tile params are typed `int` bound into parameterized SQL.
- **MQTT topic authorization & gateway scoping** — realm/client/asset-link checks enforced; gateway inbound data is re-scoped to its own subtree/realm; tunnel REST API enforces realm + asset ownership.
- **No** command-execution sinks, committed production secrets, or privileged containers.

## Recommended fix order

1. Add target-realm checks: Findings **1, 2, 3, 7** (small, localized; reuse `isRealmActiveAndAccessible` / `throwIfCannotAdminRealm`).
2. Central SSRF egress guard in `WebTargetBuilder`: Findings **4, 5**.
3. Escape the crosstab column identifier: Finding **8**.
4. HTML-escape the map-marker label (**9**) and register the Groovy interceptor or remove the dead sandbox (**6**).
5. Harden CORS wildcard handling and decouple from `OR_DEV_MODE` (**10**); add CA-expiry + revocation to provisioning (**11**).
6. Work through Finding **12** as hardening.
