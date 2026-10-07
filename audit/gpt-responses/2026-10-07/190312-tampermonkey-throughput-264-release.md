# Tampermonkey 2.2.64 throughput/result-truth release reply

北京时间：2026-10-07 19:03 +08:00

用户在当前 Gallery 页面执行“上传本地 TOC 日志”后，本轮读取最新本地诊断并完成已证实原因的修复。

## 核查结论

最新本地日志确认控制器并未卡死：phase=running、localBusy=true、ownerIsThisPage=true，租约正常续期，并正在处理 DOI 10.1038/s41929-026-01602-y。

真正的吞吐问题来自队列与结果状态：
- 本轮 81 次尝试仅覆盖 59 篇不同 DOI，出现 22 次额外重复尝试。
- 55/81 次尝试在追“已有 Figure 1 的 Nature/Science-family 论文的官方 TOC”。
- 43 次被标为 failed 的尝试其实已经成功保存全文、正文图或 PDF。
- 代码原先以 productionOfficial 为唯一 TOC 完成条件，忽略已验证 Figure 1 fallback，因此会反复打开出版社页面寻找很多文章并不存在的独立官方 TOC。
- 结果状态原先也没有把全文/PDF成功计入整体 partial，造成“什么都没抓到”的假象。

## 已发布修复

Bridge 2.2.64 / install 6.2.45：
1. Nature / Science family 若已有验证过的 Figure 1 fallback，不再为了“官方 TOC”单独反复重抓；真实 PDF 等其他缺口仍可独立触发访问。
2. 恢复旧/进行中的队列时，同样立即关闭这类遗留 TOC obligation，避免升级后继续旧循环。
3. 只要本次实际保存了正文图、全文或 PDF，就不再把整篇误标成 failed；TOC 缺口仍保持独立、真实可见。
4. 回归测试通过，Worker 的 Deploy frontend assets 步骤成功。
5. 已在线读取固定安装地址，确认 @version=2.2.64、INSTALL_REVISION=6.2.45，并包含新的 Figure 1 队列策略。

RSC 的正文图 0/0 和部分 PDF HTTP 403 是另一条独立问题，本版没有把它伪装成已解决；后续应根据新版运行结果单独修 RSC DOM/权限路径。

## 用户可见回复

已定位并修好了这次“很慢、像是什么都没抓到”的主因。

你刚上传的日志显示：这一轮 **81 次尝试只覆盖了 59 篇论文，55 次都在重复追“已有 Figure 1 的 Nature/Science 论文的官方 TOC”**；同时有 **43 次虽然抓到了全文、正文图或 PDF，却仍被显示成 failed**。这就是速度慢、结果看起来全失败的主要原因。

新版 **VPN Bridge 2.2.64 / 安装版 6.2.45** 已上线并核验。它会把 Nature/Science 已验证的 Figure 1 当作可接受的卡片视觉，不再为不存在的独立官方 TOC 反复重抓；抓到全文、正文图或 PDF 时也会正确显示为部分成功。

[更新链接（VPN Bridge 2.2.64）](https://api.gczhouwld.com/gallery-vpn-bridge.user.js)

更新后刷新 Gallery 页面即可。RSC 的正文图识别和部分 PDF 403 是另一条问题，我没有把它混进这次修复里。
