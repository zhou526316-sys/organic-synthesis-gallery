Beijing time: 2026-10-04 14:32 +08:00
Context: WeChat draft creation failed at cover upload with errcode 40113 unsupported file type. User also resent the draft/switch documentation screenshot.

Diagnosis:
- draft/switch and draft/count already succeeded; this is not a draft permission failure.
- The failed implementation uploaded public/share-default.png as permanent type=image.
- WeChat draft covers use a thumb_media_id. Current implementation has been changed to convert the cover to a JPG below 64 KiB and upload it as permanent type=thumb.
- Article-body figures remain a separate media/uploadimg path.

Functional commits:
- b6ec050aac271695a1207057655145e731bbd471 fix publisher cover upload to thumb/JPG
- c7772cfbddfc0fca0674d3427972222302569bd5 document Pillow dependency and cover/body image separation

User-visible reply:

这次报错已经定位并修掉了。**不是草稿权限问题**——你的 `draft/switch` 和 `draft/count` 都已经成功；失败点只在封面：

```text
errcode 40113
unsupported file type
```

上一版脚本把 `share-default.png` 当普通永久图片 `type=image` 上传。现在已经改成公众号草稿封面的正确链路：

**PNG 原图 → 转成 JPG → 压到 64 KB 以下 → 以永久素材 `type=thumb` 上传 → 得到 `thumb_media_id` → 创建草稿。**

正文里的论文 Figure/Scheme 不走这条链，后面仍然用你已经有权限的“上传发表内容中的图片”接口，所以不会因为封面压缩而降低每日精选正文图片质量。

现在在 Ubuntu 执行下面三步：

```bash
cd "$HOME/organic-synthesis-gallery-publisher"
git pull --ff-only

sudo apt-get update
sudo apt-get install -y python3-pil

sudo python3 "$HOME/organic-synthesis-gallery-publisher/ops/wechat-publisher/create-draft.py" --create
```

前两行是拉取刚修好的脚本并安装图片转换库；最后一条才重新创建草稿。

成功后应该先输出原来的 `stage=preview`，随后再出现：

```json
{"stage":"draft_add","errcode":0,"errmsg":"ok","media_id":"...","paper_count":5,...}
```

如果出现这个结果，就去公众号草稿箱看第一篇真实联调稿。

**这篇仍然不要发布。** “阅读原文”目前还只是 Gallery 首页。等草稿创建成功，我下一步就把正式的“本期多篇 DOI 固定高亮入口”接上，并把 08:00 与 18:00 两批合并到同一天的一篇草稿里。

你刚发的这张截图还是 `draft/switch` 文档，不需要再继续截这个页面了。