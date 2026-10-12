# Organic Synthesis Gallery 本地 PDF 生产发布与功能边界

- 北京时间：2026-10-12 10:58:01
- 当前会话工作线：用户“继续”本地 PDF 功能与 10.1021/acscatal.6c06048 误判修复
- main 工作版合并：PR #542 / 207d44e074c505b10015a093a0fdb2094a7b0411
- 后续回归修正合并：PR #543 / ccc471d8093ca823d941bb1d3e19287aa4534b36
- Pages 正式部署：#38191954934, success
- PDF Vault 线上验收：#38193078242, success
- 线上资源校验：verifiedFiles=18，匹配 Pages #38191954934 和源提交 ccc471d8093ca823d941bb1d3e19287aa4534b36
- 主线浏览器验收：#38191954879 37/37 pass；Pages 发布步骤再次 37/37 pass
- 账号权限、用户本地文件、D1/R2 与每日 08:00 文献发布计划未主动修改

## 用户可见答复正文

## 本地 PDF 修复已正式部署

刚核查 GitHub，修订后的正式发布与线上验收均已成功。

- [PR #542](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/542)：修复目录扫描、DOI 识别和失败缓存。
- [PR #543](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/543)：修复首次扫描与浏览器测试之间的竞态。
- [正式 Pages 部署 #38191954934](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38191954934)：成功。
- [PDF Vault 线上验收 #38193078242](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38193078242)：成功。
- [主线浏览器回归 #38191954879](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38191954879)：37/37 通过。

这意味着本次修复不再只是 GitHub 代码完成，而是已经通过正式网站的发布流程。

**生产端对照已完成。** PDF Vault 线上验收报告确认，18 个生产资源文件与 Pages 发布版本一致，源提交为 `ccc471d`。

你现在可以打开 [这篇 ACS Catalysis 文献的本地 PDF 页面](https://gallery.gczhouwld.com/pdf-vault/open/?doi=10.1021%2Facscatal.6c06048)。第一次在阅读页点击「第一步：选择 PDF 保存文件夹」，授权你实际保存论文的文件夹；随后通过期刊的正常下载流程将正文 PDF 保存到该目录。以后再点击主站的「本地 PDF」，程序会在授权目录中进行有界、多层级、可续跑的 DOI 识别，匹配后直接用浏览器原生 PDF 阅读器打开。对于仍未找到的文件，阅读页现在应给出扫描 PDF 数、DOI 不同数、未识别数、待检文件夹数，不再笼统报告不存在。

**仍未实现的用户目标：** 当前普通网页尚不能在主站卡片的第一次点击中自动弹出系统文件夹选择器、取得任意出版社登录下载的 PDF 并直接写入所选文件夹。当前版本的实际交互仍是在首次点击后进入本地 PDF 页面，再点选文件夹；出版社页面发起的下载由 Edge/Chrome 的下载设置或用户“另存为”决定。真正的“一次点击选目录并自动下载（前提有合法权限）”需要独立对接浏览器/Tampermonkey 授权采集及本地文件写入，不能因为下载入口存在就宣称已经成功保存。现有 TOC 主线并无直接完整的 GM_download 与用户选定目录的安全写入整合，因此暂不把它标为已完成。

本轮的 37 项测试与生产文件核验不等于已经使用你的 Windows 账户和本地原始 ACS PDF 实测。请不要删除站点存储。若这篇 PDF 再次无法匹配，把页面底部新增的扫描统计截图发来，即可进一步定位。电脑本地文件名和路径不需要上传。

本次答复已同步记录到仓库的 `audit/gpt-responses/2026-10-12/105801-pdf-vault-production-release-status.md`。

## 限制/未完成清单

1. Windows Edge/Chrome 真正的文件夹持久授权尚无用户设备实测。
2. 任意受版权和网站访问权限限制的出版社 PDF 自动获取与自选目录写入尚未接通；页面只有出版社跳转及授权目录后的自动识别。
3. 不得把第 2 项描述成已上线；如后续实施必须先验证权限、浏览器用户激活、File System Access 读写权限和正确 DOI 校验。
