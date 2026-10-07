# Private PDF live Canvas verification

这一个小批次已经完成，可以正式收尾。

当前线上主站已经是新的 **PDF.js Canvas 私有 PDF 阅读器**，不是旧的 iframe / 浏览器内置 PDF 插件版本。我刚刚直接核对了正式域名 `https://gallery.gczhouwld.com/pdf/`，页面实际包含：

- `#pdf-canvas`
- “上一页 / 下一页”
- “缩小 / 放大”
- PDF 阅读工具栏

因此线上交付与我们通过测试的版本一致。

同时两条关键回归都已通过：
- **Private PDF access v1 regression：成功**
- **PDF Vault P1 local storage and reader：成功**

正式 Pages 发布也已经成功，主域名和 Pages 的在线交付校验通过；对应发布 run 为：
https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/37621751062

另外，返回 Gallery 后自动退出登录的问题已经修复：现在不会因为一次或两次瞬时 `authenticated:false` 就删除你的 30 天登录 token，只有明确执行“退出登录”才会主动清除。

你现在可以直接做两个实际测试：
1. 刷新 Gallery，点任意一篇已经抓到的 PDF，看是否能在 Gallery 自带阅读器里显示第一页；
2. 点击“返回 Gallery”，确认账号仍保持登录。

如果这两个实际操作都正常，这一块就不再继续改动；下一批再回到剩余 9 篇 PDF 的抓取补齐。
