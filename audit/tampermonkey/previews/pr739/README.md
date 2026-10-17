# PR739 temporary, owner-only Tampermonkey trial

This is **not** the production installer. It preserves the existing
userscript @name and @namespace so it REPLACES the installed Bridge.

* Bridge version: 2.2.93 (trial).
* Installed capture engine: 6.2.74 (trial).
* Capture wire protocol remains 6.2.20 / controller 2.2.41.
* The @updateURL and @downloadURL metadata are deliberately removed.
* Before installation, pause collection and export the installed
  2.2.92 script. Install the trial as an UPDATE, never enable both.
* A normal user browser must remain VPN/owner authorized. Do not
  bypass publisher authentication, PDF lease or 403/429 controls.
* Only run a bounded publisher trial. The pre-PR failure baseline
  is 320 queued / 33 actually visited / 3 resolved / 2 official TOCs.
* After the trial, use "upload local diagnostic" and let the agent
  check sanitized read-only receipts. Deferred PDF != stored.
* To revert, use the existing official 2.2.92 installer at:
  https://gallery.gczhouwld.com/gallery-vpn-bridge.user.js
* Do not merge this preview binary into the production branch.
