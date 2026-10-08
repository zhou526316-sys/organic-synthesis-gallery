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
