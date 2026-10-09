# Gallery private PDF network coverage clarification

Beijing time: 2026-10-09 13:34:38
Context: Gallery architecture / PDF network and access coverage question
Baseline: main commit a1058eb8f9feb5b4f4ffe0954e10242b23293051; PR #420 remains Draft, unmerged.

## Reply

**不是。现在不能保证所有网络都能稳定读取 Gallery 的在线私有 PDF，也不是所有账号都拥有读取权限。**

目前生产版采用 `api.gczhouwld.com` 作为主线路、Cloudflare Worker 域名作为备用线路；**这两条仍属于 Cloudflare 体系**。腾讯云独立备用网关的 PR #420 仍是 Draft，未合并或启用，因此遇到某些校园网、移动网络或跨境连接问题时，两条线路都可能失败。

另外，**网页能打开 ≠ PDF 能读取**。私有 PDF 仍需要有效登录、站长读取权限、文件确实已保存，以及网络能够完成授权和 PDF 数据传输。普通用户不能因为输入了 DOI 就访问站长的私有 PDF；他们可以读取自己已保存的本地 PDF。

目前海外测试线路通过，**但尚未针对国内移动、电信、联通及你的 Edge／校园网络逐一完成真实账号验收**。所以现在不能称作“全国所有网络都可以访问”。

后续要提高国内可用性，应在安全、配额及实际网络测试通过后再启用独立的腾讯网关，同时继续保留账号权限控制。
