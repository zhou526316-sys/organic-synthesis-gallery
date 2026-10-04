# Existing Tencent Cloud instance recall

Beijing time: 2026-10-04
Context: Organic Synthesis Gallery — existing Tencent Cloud server check

用户问是否已经有腾讯云。

答复要点：
- 是，用户已经购买并使用腾讯云轻量应用服务器。
- 当前实例为 Ubuntu，现用于 relay.gczhouwld.com 的微信固定出口/中继服务。
- 该服务器不应直接重装为 Windows，否则会影响现有微信 JS-SDK / access_token / jsapi_ticket / 公众号发布中继链路。
- 对未来 aTrust + Playwright 抓取，建议继续保留现有 Ubuntu relay；如 aTrust 需要 Windows，则在同一腾讯云账号下新增一台独立 Windows 轻量实例做 72h 验证与后续 collector。
- 现有 Ubuntu 服务器仍可继续承担控制面、relay、健康检查等轻量服务。
