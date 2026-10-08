# 用户腾讯云 Ubuntu 服务器 SSH 初次检查结果与下一步

北京时间：2026-10-08T19:39:35.994+08:00
项目：抓取有机合成文献并持续更新网页 — owner-private PDF independent zero-charge gateway feasibility.

## User message
Ubuntu 22.04 SSH session returned:
```
ubuntu
Mem total 1.9 GiB, used 433 MiB, free 162 MiB, buff/cache 1.3 GiB, available 1.3 GiB; swap 0
/dev/vda2 40G total, 7.0G used, 31G available
ports :80 and :443 LISTEN on 0.0.0.0 and [::]; ss without root privileges shows no process names.
```
No secrets or sensitive local identity data.

## Entire user-visible reply
从你已经登录的 Ubuntu 服务器输出中，可以确认：

- **内存可用约 1.3 GiB**。虽然 `free` 只有 162 MiB，但 Linux 将大量内存用作缓存；判断余量应看 `available`。CPU 与内存基础资源足以考虑低并发的流式 PDF 网关。
- **磁盘剩余 31 GB**，足够运行轻量级服务；不需要在服务器保存 PDF 副本。
- **80 和 443 端口已经有人监听**，且同时监听 IPv4 和 IPv6。不能再直接启动一个抢占这两个端口的新服务；应先确认现有 Web 服务能否安全增加独立虚拟主机。
- **Swap 为 0**，所以应避免大内存缓存或高并发 PDF 代理。当前输出还没有显示 80/443 的进程名，因为普通用户可能无权查看其他进程。

现在请在**已经登录的 `ubuntu@VM-0-11-ubuntu:~$` 终端里**直接复制下面整段 Bash 命令。不要退出 SSH，也不需要再打开另一个 PowerShell：

```bash
echo '=== Web 服务是否运行 ==='
for svc in nginx caddy apache2 docker; do
  printf '%s: ' "$svc"
  systemctl is-active "$svc" 2>/dev/null || true
done

echo '=== 80/443 端口及占用进程 ==='
if sudo -n ss -ltnp '( sport = :80 or sport = :443 )' 2>/dev/null; then
  :
else
  ss -ltnp '( sport = :80 or sport = :443 )'
fi

echo '=== 已启用的网站配置文件名（不读取配置内容） ==='
ls -1 /etc/nginx/sites-enabled/ 2>/dev/null || true
ls -1 /etc/caddy/ 2>/dev/null || true

echo '=== 服务器到两个授权源站的连接耗时 ==='
for u in   https://api.gczhouwld.com/api/_healthcheck   https://organic-synthesis-gallery.zhou526316.workers.dev/api/_healthcheck
do
  echo "$u"
  curl --noproxy '*' -sS -o /dev/null     --connect-timeout 4 --max-time 10     -w 'HTTP:%{http_code} DNS:%{time_namelookup}s TCP:%{time_connect}s TLS:%{time_appconnect}s TTFB:%{time_starttransfer}s TOTAL:%{time_total}s\n'     "$u"
  echo "退出码：$?"
done
```

这些仍然只是**只读检查**，不会安装软件、修改配置、重启 Nginx、干扰公众号或增加订阅费用。把输出发给我；我会先确认现有 HTTPS 入口和腾讯云到 Cloudflare 的实际连接是否适合复用。**目前还不能声称跨网络 PDF 已修复。**

## Scope
Only interpretation and user-initiated read-only next commands. No remote execution by assistant, no DNS/Worker/Nginx/WeChat modification, no access grants, no new charges, no changes to formal literature publication. Project feedback gate: any production changes require specific approval after facts. Hard 0 incremental cost.
