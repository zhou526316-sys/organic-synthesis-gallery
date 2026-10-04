Beijing time: 2026-10-04 14:36 +08:00
Context: User's second create attempt failed locally before WeChat upload: Pillow cannot identify public/share-default.png. User also showed Official Account draft list with 暂无素材.

Diagnosis:
- draft/add was never reached, so empty draft list is expected.
- GitHub blob is binary but server copy/source is not reliably decodable by Pillow.
- Integration testing should not depend on the placeholder asset.

Functional change:
- d114e01e831c3f3c102e5a3124609aeda308032d updates create-draft.py.
- prepare_thumb_cover now attempts to decode the repository cover, but if decoding fails it generates a clean 900x383 JPG integration cover locally, compresses below 64 KiB, and uploads it as permanent type=thumb.
- No publishing or mass-send behavior added.

User-visible reply:

这次错误也已经处理掉了。

你后台截图里的 **“暂无素材”是正常的**。因为之前两次都在封面处理阶段失败，程序还没有执行到 `draft/add`，所以公众号草稿箱不会出现半成品。

现在脚本已经改成：

**能正常读取原封面 → 转 JPG；读不了原封面 → 现场生成标准 JPG 联调封面 → 压到 64 KB 以下 → 以 `thumb` 上传 → 再创建草稿。**

因此不再依赖那张异常的 `share-default.png`。

现在 Ubuntu 里只执行：

```bash
cd "$HOME/organic-synthesis-gallery-publisher"
git pull --ff-only

sudo python3 "$HOME/organic-synthesis-gallery-publisher/ops/wechat-publisher/create-draft.py" --create
```

不需要再安装东西。

正常会连续看到两条 JSON。第一条仍然是：

```json
{"stage":"preview", ... "paper_count":5 ...}
```

第二条我们要的是：

```json
{"stage":"draft_add","errcode":0,"errmsg":"ok","media_id":"...","paper_count":5,...}
```

如果第二条成功，刷新你刚才那个“暂无素材”的公众号草稿页面，应该就会出现第一篇 **“【联调草稿】有机合成文献更新｜2026-10-04 08:00”**。

把新的最后一行 JSON 发给我即可。**这篇仍不要发布。** 草稿出现后，我就不再折腾接口基础能力，直接进入正式功能：当天 08:00+18:00 合并、固定本期新增文献高亮链接、正式封面和后续每日精选图片链路。