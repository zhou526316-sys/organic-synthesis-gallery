# Tencent Cloud instance verification instructions

Beijing time: 2026-10-04
Context: Organic Synthesis Gallery — verify existing Tencent Cloud resources before adding Windows collector

User asked how to verify the existing Tencent Cloud server and what to check.

Instructions:
1. Log in to Tencent Cloud console.
2. Open Lightweight Application Server / 轻量应用服务器.
3. On instance list, open the existing Ubuntu instance used for relay.gczhouwld.com.
4. Only read information; do NOT reinstall/reset/stop/delete the instance.
5. Record or screenshot:
   - instance name
   - region/zone
   - OS/image
   - CPU/RAM
   - system disk size
   - public bandwidth
   - public IPv4
   - billing mode
   - expiration/renewal date
   - current instance state
6. Open Billing / Orders or renewal page and record actual renewal price / effective monthly price for the current instance.
7. Open Create Lightweight Application Server in a new tab (do not purchase yet), select the same account and test:
   - whether Windows Server images are available
   - 2C2G price
   - 2C4G price
   - region options
   - bandwidth/disk
   - billing period
   - whether promotional price is first-purchase only
8. Prefer China mainland region for the aTrust test if the school's VPN may restrict overseas cloud IPs; if a mainland Windows image is not available at the target budget, note the available Hong Kong/overseas choices.
9. If possible, inspect account resource quota / number of allowed lightweight instances.
10. Do not send passwords, verification codes, API keys, SSH private keys, VPN credentials, or full billing account identifiers.

What the user should send back:
- Screenshot A: existing Ubuntu instance overview/details.
- Screenshot B: Windows instance creation page showing 2C2G and 2C4G prices.
- Screenshot C (optional): renewal price / billing page with sensitive account data hidden.

Goal:
Determine whether the current Ubuntu relay should remain untouched and whether a second Windows collector can be added under ~RMB 50/month, or whether Azure free testing is better first.
