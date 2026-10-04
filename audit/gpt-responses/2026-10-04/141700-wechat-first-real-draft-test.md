Beijing time: 2026-10-04 14:17 +08:00
Context: draft/count returned errcode=0,total_count=0. Draft API read access is confirmed.

Functional changes already committed:
- 6c69882fcb465d42a4822282a47e22d116147cb4 ops/wechat-publisher/create-draft.py
- 23b5129aad3bf5a63a2a42967f6effda60be1f7a ops/wechat-publisher/README.md

The helper:
- reads the latest verified lastPublication DOI set from Gallery state;
- resolves journal, Chinese title, English title and authors from production supplements;
- sorts by the established journal priority;
- fails closed if required metadata is missing;
- defaults to preview-only;
- --create obtains token without printing secrets, uploads/reuses public/share-default.png as a temporary permanent cover, and calls draft/add;
- does not publish or mass send.
- Read Original URL is temporarily the Gallery home page for integration testing; immutable multi-DOI edition highlight will be implemented before production publishing.

User-visible reply:
成功。**草稿 API 已经实测通过**：

```json
{"stage":"draft_count","errcode":0,"errmsg":"OK","total_count":0}
```

`total_count=0` 只表示当前草稿箱为空，不是错误。

我已经把第一版公众号草稿生成器加入仓库。现在进行**第一篇真实草稿联调**，但先预览，不写公众号。

### 第 1 步：更新服务器代码

你还在 Ubuntu 里的话，依次执行：

```bash
cd /opt/organic-synthesis-gallery
sudo git pull --ff-only
```

然后运行只读预览：

```bash
sudo python3 ops/wechat-publisher/create-draft.py
```

这一条**不会创建草稿、不会发布、不会群发**。它只读取 Gallery 最新已经正式上线的批次，并输出将要使用的文献。

今天 08:00 这一批正常应该识别到 **5 篇**：

- `10.1002/anie.3010868`
- `10.31635/ccschem.026.202608392`
- `10.31635/ccschem.026.202608407`
- `10.1038/s41467-026-78226-0`
- `10.1021/acs.orglett.6c03748`

并且会自动按我们的期刊优先级排列，正文只放**中文标题、英文标题、作者**。

把这条命令最后输出的 JSON 发给我。

如果 `paper_count=5` 且 DOI 正确，下一条我就让你执行：

```bash
sudo python3 ops/wechat-publisher/create-draft.py --create
```

这一步才会：

**上传一个临时测试封面 → 调用 `draft/add` → 在你的公众号草稿箱生成第一篇真实草稿。**

目前为了只验证发文链路，“阅读原文”暂时指向 Gallery 首页，**这篇联调草稿不要发布**。草稿写入成功后，我下一步就实现你要求的“本期多篇文献固定高亮入口”，再换成正式的阅读原文链接。

所以现在只执行到**预览命令**，把输出发我即可。