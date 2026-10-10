# Zero-incremental-cost owner-private PDF alternate ingress

**Implementation in progress. Not activated in production.**
Source branch: `feature/owner-private-pdf-dual-ingress-20261008`.
Existing production `osg-wechat-relay` Nginx site is NEVER replaced or restarted.
New costs, paid services, overage, PDF public storage, access bypass: prohibited.

## Components

- `gateway.py` — no-dependency Python3.10+ loopback-only HTTP relay at 127.0.0.1:18867. Routes are strictly allowlisted for limited login/session/open/file access; HTTPS to canonical Cloudflare origin; owner entitlement is checked by Worker; signed file URL rewritten to `https://pdf.gczhouwld.com/`. For private PDF `/file`, supports GET/HEAD, Range 206, Set-Cookie continuation and safe cache/CORS headers. No request URL/access logs or local PDF bytes. Durable pessimistic `256 MiB/month` gateway transfer quota, fail closed when reached.
- `install.sh` — `--preflight` read-only; `--install` requires DNS-only A record and either a valid PDF certificate or free certbot. Safely stages new Nginx vhost and ACME HTTP-01 webroot, independent systemd service, verifies nginx -t, compares unchanged WeChat vhost sha, checks local TLS health, rolls back new files/service on failure. `--rollback` only removes specially marked PDF site/service. Never overwrites current WeChat vhost.
- `run-from-windows.ps1` — downloads two source files from repository via HTTPS, copies over existing SSH, and runs remote script. Defaults to Preflight; Install requires explicit `-Mode Install` and console confirmation.
- `public/pdf-gateway-routing.json` — `enabled:false` until domain+TLS+real China acceptance; already-tested branch code fails closed when disabled.

## 2026-10-09 deployment update: single WeChat QR

Tencent Lighthouse's owner-protected SSH login requires WeChat QR for **every**
new SSH or SCP connection. The older `run-from-windows.ps1` performs four
connections and therefore prompts multiple QR scans. **Use the new
`run-once-from-windows.ps1`** rather than the older multi-login launcher.

The one-session launcher runs on the user's **local Windows PowerShell**.
It creates a short UTF-8 Bash command, sends it in Base64 over **one SSH
session**, downloads reviewed Python/Bash payloads at the immutable Git commit
`bc50cc94f6a83fdd85a579442b8c4a5ee6b10784` on the existing Tencent VM,
and runs `sudo bash install.sh --preflight` or `--install` inside that same
session. It also supports `--rollback`. No SCP connections, API keys, or
separate server purchase are involved.

- Windows PowerShell 5.1 UTF-8 BOM, GitHub raw-download parse, single-SSH static
  safeguard: passed in [GitHub Actions run 37874518296](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/37874518296).
- `--install` requires typing YES locally, before the SSH connection. A
  Tencent QR authentication can still be required once, plus a separate
  `sudo` password if the VM's privilege policy requires it.
- The installer creates a dedicated ACME HTTP challenge vhost temporarily and
  reuses it after installing free HTTPS with Certbot. Existing
  `osg-wechat-relay` files remain unchanged, checked by SHA. Nginx is syntax
  validated before graceful reload; failure triggers rollback.
- The first SSH command **never proves Gallery PDF is deployed**. Owner PDF
  routing remains disabled by `public/pdf-gateway-routing.json` until
  real China-end-user acceptance of same-account authentication, 206 Range,
  both pages and attachment download.
- The existing 512GB VM package is shared with WeChat. Gateway's 256MiB quota
  limits its own transfer, not total VM usage; do not assume provider overage
  is impossible if the rest of the VM exhausts its package. The user requires
  **zero incremental paid cost**.

## Certificate issuance correction — 2026-10-09

The first owner-triggered `--install` reached Certbot but Let's Encrypt's HTTP-01
probe received 404 from the correct DNS-only Tencent IP, and the PDF vhost
rolled back. Root cause in the installer is consistent with `umask 077`:
new `/var/www/gallery-pdf-acme` and `/opt/gallery-pdf-gateway` directories
were created as root-only `0700`; nginx's worker cannot traverse the HTTP-01
webroot and systemd's `gallerypdf` cannot traverse the app directory.

The updated installer explicitly repairs its dedicated directory modes to
`0755` (preserves `/var/lib/gallery-pdf-gateway` private mode `0700`), stages
a `0644` **fake challenge file**, and verifies the exact file bytes through
the actual localhost Nginx HTTP-01 virtual host **before** requesting a real
certificate. If this probe fails, the installer aborts without touching CA
rate limits and rolls back its own vhost. Certbot runs with temporary
`umask 022` only; private key modes remain managed by Certbot.
A GitHub hosted Linux regression reproduces `0700` under `umask 077`, repairs
the directory, and confirms an unprivileged `nobody` reader can read the
`0644` challenge file. The independent VM will still require live proof
before claiming issued TLS or successful PDF access.

**The old source commit `f36fc03...` must not be used for new installations.**
Use the new `run-once-from-windows.ps1` pinned to the corrected version.

## Workflow

1. Review sources in GitHub, run isolated Python test `python3 -m unittest discover -s deploy/pdf-gateway -p test_gateway.py` (9/9 passing) and private PDF Playwright test (33/33 passing).
2. On Windows PowerShell, run the downloaded script with `-Mode Preflight` and inspect 80/443, upstream health, existing Nginx vhost, free TLS tooling and domain alignment. This does not install or modify.
3. Add **one** A record in existing Cloudflare DNS zone: Type=A, Name=pdf, Content=the same existing Tencent public IPv4 as relay.gczhouwld.com, **Proxy status DNS only (grey cloud)**, TTL auto. No new domain or paid plan. Existing relay DNS and Nginx must remain intact. If account's existing token has safe DNS edit scope, it may be added via a separate approved and audited workflow after all preflights; otherwise use dashboard.
4. On existing Ubuntu VM, if certbot is not installed, assess compatibility before installing the free certbot package. Do not install unknown software over WeChat or require a paid certificate. If already installed, the installer can request a free Let's Encrypt domain certificate using its own isolated HTTP-01 virtual host.
5. Run `-Mode Install` ONLY after DNS resolves unproxied to Tencent and preflight is clean. It will prepare certificate if necessary, install the localhost gateway, and do an nginx syntax-validated reload. Observe official-account relay continues to function.
6. Test `https://pdf.gczhouwld.com/_pdf_gateway_health` across domestic networks, plus test **real owner login, 401/403 ordinary user denied, existing ready PDF from representative journals**, first and second PDF page, Range 206, full download and publisher return. **Do not log or copy signed PDF URLs/tokens.**
7. Only after live acceptance change `public/pdf-gateway-routing.json` to `enabled:true` through protected Pages deployment gate. This turns on the alternate path for Gallery reader/capability/password sign-in. Inability to accept mainland networks => keep disabled.
8. If there is failure, use PowerShell `-Mode Rollback`, check `nginx -t`, keep the original WeChat relay unaffected. Unrelated 08:00 literature schedule remains unchanged.

## HTTPS / access specifics

The origin Worker generates 5-minute signed tickets, a view absolute window of 90 minutes, and host-only Secure/HttpOnly/SameSite=Strict `gpdf_*` continuation cookies scoped to `/api/user-ui/private-pdf/file`. The relay must not return the Cloudflare URL when user selected the Tencent path; signed URLs are rewritten only when origin host, path, token format and download flag are valid.

## Limitations

Independently routed Tencent client ingress still depends on the **same Cloudflare upstream** for entitlement and storage. A total upstream outage cannot be fixed without a second private upstream (outside zero-cost approved scope). Neither US GitHub test success nor Tencent->Cloudflare health establishes domestic all-carrier availability. Strict quota and existing VM's total monthly WeChat traffic remain a condition: 256MiB gateway cap is a safety throttle, not an absolute guarantee of ¥0 if **other traffic** exhausts the shared 512GB allowance. Provider hard account quota would be needed for a mathematical guarantee.

## 2026-10-10 second ACME 404 (permissions already 0755)

The owner's next one-QR install again stopped at the **LOCAL, before-certbot**
HTTP-01 canary with HTTP 404, even though dedicated ACME directories were 0755,
upstream health 200 and `nginx -t` passed. This makes the previously diagnosed
0700 *child-directory* issue insufficient to explain this occurrence.

A real isolated Nginx reproducer now proves a different possible routing cause:
when an existing server listens specifically on `127.0.0.1:80`, it can take
precedence over the new vhost's wildcard `listen 80` for localhost requests;
a request with the correct PDF Host can then receive 404. Adding an explicit
`listen 127.0.0.1:80` for the PDF vhost resolves the reproducer (404->200).
**This is a verified Nginx behavior, not yet proof of the actual Tencent Nginx
listener topology.**

The new isolated installer also uses an unambiguous alphanumeric ACME canary
instead of a literal trailing '$', tests active Nginx-worker file readability,
and on failed localhost HTTP-01 checks reports bound HTTP ports and parent path
permissions before rolling back. **Certbot is never called before a correct
200 with byte-for-byte challenge verification.** WeChat vhost hash preservation,
one SSH/WeChat QR, dedicated app service, no paid resources and route
`enabled:false` are unchanged. Linux isolated-vhost precedence regression
and Windows PowerShell 5.1 raw URL parse are mandatory before the owner retries.
The owner's retry uses the updated one-session launcher at an immutable branch
commit, pinned to the installer-source commit `bc50cc94f6a83fdd85a579442b8c4a5ee6b10784`.

## 2026-10-10 additional owner install report: still local 404 after 127.0.0.1 listener fix

The owner supplied a third Tencent one-SSH install log. The ACME file had 0644
and its ancestors 0755; nginx -t succeeded, and the live HTTP sockets were
0.0.0.0:80 and [::]:80. Nevertheless, Nginx returned HTTP 404 on the local
Host-based canary. Certbot was NOT invoked and the PDF-only Nginx changes were
rolled back. The previous isolated 127.0.0.1:80 precedence reproducer does not
establish the cause of this live failure.

The installer now checks that its uniquely marked PDF vhost appears in the
effective nginx -T include graph before attempting the ACME request, fixing
a missed failure class: nginx -t can succeed even if a newly created
sites-enabled symlink is not included by the actual configuration. On failure,
a filtered diagnostic prints only loaded config file paths, listen/server_name
directives, nginx service state and HTTP listener process data. It NEVER prints
entire nginx.conf contents, authentication tokens or request URLs. The
alphanumeric canary now uses Bash's numeric $$ PID, removing the confusing
literal dollar-sign suffix. The Nginx include test has a 404 -> 200 regression.

Next safe real-server action: run -Mode Diagnose from the one-session
Windows launcher. This is read-only and only needs one WeChat QR SSH login;
it does not change Nginx, obtain a certificate, or enable the route. Capture
the [DIAG] section. Then adapt the Nginx target configuration according
to observed effective includes/listener mapping rather than repeatedly guessing.
Only run -Mode Install after the effective route issue is understood.
No PDF chunk-size, resolution, continuous scroll or account authorization code
changes are part of this step.

## 2026-10-10 exact-only Nginx parent include fallback (owner read-only diagnosis)

Owner read-only Diagnose printed a healthy Nginx MainPID 18637, wildcard HTTP
80 sockets and exactly two effective configuration files after rollback:
`/etc/nginx/nginx.conf` and `/etc/nginx/sites-enabled/osg-wechat-relay`.
The fact that only the relay is listed after rollback is not by itself
proof of an exact include directive rather than a glob. It does, however,
prioritize the original installer's unverified `sites-enabled/*` assumption.

Now, while staging the isolated PDF vhost but **before nginx reload or certbot**,
the installer inspects `nginx -T` to verify that the marked PDF site is actually
loaded. If yes, the unchanged existing include path is used. If not, a tightly
restricted Python helper may add precisely one reversible marked line beside
one exact, existing relay include in `/etc/nginx/nginx.conf`, after a private
root-only backup. It refuses unknown/duplicate/missing anchors, pre-existing
unmanaged PDF includes, or a symlinked main config. The relay vhost bytes
are not modified. The helper updates the main config atomically and validates
`nginx -t` and `nginx -T` again BEFORE a graceful reload. Failure removes
only the marker-owned parent line and dedicated PDF vhost; unrelated changes
are not overwritten. `--rollback` removes the marker before deleting the
isolated PDF site. No raw nginx.conf content, tickets or credentials are logged.

An isolated Nginx regression covers explicit relay include 404 -> added PDF
include 200 -> exact rollback 404 while relay vhost SHA remains identical.
Six Python safety/unit tests protect byte-exact include round trips, duplicate
and unknown configs. Linux and Windows PS 5.1 jobs PASSED:
https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38020555346

Immutable launcher revision: e2b52071b9eb80b23170e896639a78e54c949b31.
Pinned source revision: 22bf1a51c85201b691d5bf07b6c28a7b458c1a02
(gateway.py, install.sh and nginx_include.py were compared byte-for-byte
against the CI revision).

Live installation is **not** proved by CI. The Tencent HTTPS domain and
actual mobile/cellular PDF login+Range remain unaccepted and routing flag
`enabled:false` MUST remain. The parent edit requires the owner's existing
`-Mode Install` YES confirmation and one Tencent WeChat QR SSH authorization.
Do not change PDF chunk sizing, quality, continuous scrolling or rights.
