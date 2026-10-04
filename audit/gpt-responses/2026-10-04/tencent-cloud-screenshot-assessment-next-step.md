# Tencent Cloud screenshot assessment and next step

Beijing time: 2026-10-04
Context: Organic Synthesis Gallery — evaluate existing Lighthouse screenshots and choose a Windows collector

From the screenshots:
- Existing instance: China Hong Kong, Zone 3.
- Ubuntu Server 22.04 LTS 64-bit.
- 2 vCPU / 2 GB RAM.
- 40 GB SSD system disk.
- 20 Mbps peak bandwidth.
- 512 GB/month traffic package.
- Expiration: 2026-10-24 00:38:43.
- This is the existing relay server and must remain untouched.
- The second screenshot is the "upgrade package" dialog. The selected General-purpose options start at 320 RMB/month (4C8G), so this path is not relevant for creating the aTrust collector. Do not upgrade the existing instance.

Current Tencent Cloud official pricing shows:
- Hong Kong beginner Windows: 2C2G / 40GB / 20Mbps / 512GB = 50 RMB/month.
- Hong Kong beginner Windows 2C2G / 50GB / 30Mbps / 1024GB = 70 RMB/month.
- Hong Kong Windows 2C4G / 70GB / 30Mbps / 2048GB = 115 RMB/month.
- Overseas Windows beginner 2C2G / 40GB / 20Mbps / 512GB = 44 RMB/month.
Tencent Cloud also warns that Hong Kong beginner packages do not guarantee cross-border quality between mainland China and Hong Kong.

Recommendation:
1. Do not touch the existing Ubuntu relay.
2. Return to the Lighthouse instance list and choose "Create/New/Purchase instance", not "Upgrade".
3. First check mainland China regions (Shanghai/Guangzhou/Beijing) for a Windows Server image and a 2C2G package at <=50 RMB/month. Since the school VPN gateway is likely in mainland China, this is preferable for aTrust validation if available.
4. If no suitable mainland Windows package appears, choose China Hong Kong beginner Windows 2C2G / 40GB / 20Mbps / 512GB at 50 RMB/month.
5. For the first test buy only 1 month, and disable auto-renew.
6. Prefer Windows Server 2022 64-bit if available; otherwise Windows Server 2025 can be tested. The objective is compatibility with aTrust, not the newest OS.
7. Do not purchase yet if uncertain: send a screenshot of the "Create Lighthouse instance" page showing region, image, package and final price, and verify before payment.
8. Once created, use RDP, install aTrust from the school's official portal, and run the 72-hour persistence test.
9. 2 GB RAM is acceptable for validation with one Chromium browser and aTrust, but it is tight for production. If memory pressure causes failures, production will need 4 GB or a split architecture.

Sources:
- Tencent Cloud Lighthouse pricing: https://cloud.tencent.com/document/product/1207/73452
- Current Hong Kong pricing includes Windows beginner 2C2G 40GB 20Mbps 512GB at 50 RMB/month.
