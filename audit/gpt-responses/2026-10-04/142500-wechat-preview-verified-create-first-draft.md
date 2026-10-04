Beijing time: 2026-10-04 14:25 +08:00
Context: User ran preview mode successfully.

Verified preview:
- publicationSlot: 2026-10-04T08:00:00+08:00
- paper_count: 5
- journals: Nature Communications, Angew, CCS Chemistry, Organic Letters
- DOI set:
  10.1038/s41467-026-78226-0
  10.1002/anie.3010868
  10.31635/ccschem.026.202608392
  10.31635/ccschem.026.202608407
  10.1021/acs.orglett.6c03748
- Ordering matches configured journal priority.
- Current draft title remains explicitly marked 【联调草稿】.
- Current source URL is still Gallery home page and immutable edition multi-DOI highlight is not yet implemented; do not publish this test draft.

User-visible reply:

预览完全正确，可以进入第一篇真实草稿测试。

现在在 Ubuntu 里执行：

```bash
sudo python3 "$HOME/organic-synthesis-gallery-publisher/ops/wechat-publisher/create-draft.py" --create
```

这一步会做三件事：

1. 使用现有固定 IP 和公众号凭据获取 access_token；
2. 上传/复用临时测试封面；
3. 调用 `draft/add`，把这 5 篇生成一篇 **“【联调草稿】有机合成文献更新｜2026-10-04 08:00”** 写入公众号草稿箱。

它**不会发布，也不会群发**。

成功时最后会返回类似：

```json
{"stage":"draft_add","errcode":0,"errmsg":"ok","media_id":"...","paper_count":5,"publicationSlot":"2026-10-04T08:00:00+08:00"}
```

执行后做两件事：

- 把终端最后一行 JSON 发给我；
- 去微信公众号后台打开草稿箱，找到这篇“【联调草稿】…”并截一张正文页面给我。

这一版的“阅读原文”还只是 Gallery 首页，所以**先不要发布**。草稿写入确认成功后，我下一步直接做正式链路的两个关键部分：**固定本期新增 DOI 集合的多篇高亮入口**，以及 **08:00/18:00 两个发布槽合并成当天同一篇草稿**。