# Tencent Cloud Windows collector purchase guidance

Beijing time: 2026-10-04
Context: Organic Synthesis Gallery — selecting the Windows Lighthouse instance from user screenshot

From the screenshot:
- Region: Shanghai.
- Current tab: "使用应用镜像", selected Hermes Agent. This is NOT appropriate for the aTrust collector.
- Available Sharp/锐驰 packages shown:
  - 2C2G / 40GB / 200Mbps: RMB 45/month
  - 2C2G / 50GB / 200Mbps: RMB 50/month
  - 2C4G / 50GB / 200Mbps: RMB 65/month
  - higher tiers also available.
- Recommendation under the user's <= RMB 50/month budget:
  1. Switch to "基于操作系统镜像".
  2. Choose Windows Server 2022 64-bit if available; Windows Server 2019 is acceptable; Windows Server 2025 can be tested if that is the only/current option.
  3. Keep region Shanghai.
  4. Prefer the RMB 50/month 2C2G / 50GB option rather than RMB 45/month 2C2G / 40GB, because Windows + aTrust + Chromium/Playwright leaves limited disk headroom on 40GB.
  5. Use one month only for the first validation and disable auto-renew.
  6. Do not select extra storage or optional add-ons.
  7. Use password login/RDP for Windows; no need for SSH keys.
  8. Before payment, confirm that the selected Windows image does not change the package price and send a screenshot showing Windows image + Shanghai + 2C2G 50GB + final RMB 50/month price.
- 2GB RAM is sufficient for a 72-hour compatibility test with one browser instance and low concurrency, but production reliability may require 4GB if memory pressure is observed.
