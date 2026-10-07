# WeChat Angew / phoenix1 real draft delivery

Beijing time: 2026-10-07T13:09:56+08:00
Context: continuation of user-approved daily Angew 10.1002/anie.3699223 and retrospective Nature Catalysis 10.1038/s41929-026-01593-w. User requested completion, self-review, and actual draft preview links, with no public send.
Final-review commit: 3bb5f30a55ea5a20158412c7fda409d94a87f2e0
Publisher run: 37572845923 (successful final job 112640145243).
Real readback inspection run: 37574532699 (success); artifact 11462141122.
Preview: https://relay.gczhouwld.com/wechat-preview/996cb9dd18c792fe056e2760.html
Preview SHA256: a66af44685961c4dbba453958eff93a9b7511e4aae9e964310ae8c02e30efb7c

## User-visible progress messages from this turn

继续。这次不再改封面，直接推进两篇正文、配图和素材上传，再写入微信草稿并回读审核。

Angew 的图文稿已重新整理：正文图按完整逻辑分组保留，不再拆成30块；胺类反应的白光条件也已与SI核对。刚把约4.5 MB的稿件和素材包上传成功，接下来将图片本体固定到仓库，解决此前只有本地文件、发布端拿不到素材的问题。

两篇正文和原文配图都已固定到仓库，已不是只有本地文件。内部手机排版检查中，28处正文图片均正常加载，没有横向溢出；Nature Catalysis 稿也保留了超快数据的出处差异和SET/XAT并行路径的证据边界。现在进入最终审核记录与微信草稿写入。

写入环节定位到了一个具体阻断：发布脚本在检查图号时引用了 `re`，却漏了导入，程序因此在调用微信写入前退出。现在只修这个程序错误，保留已审核的两篇稿件、配图和封面不变。

两篇草稿已经成功写入微信，`draft/get` 回读也已通过。现在检查真实草稿预览中的两篇顺序、封面和图片显示，完成后给你查看链接。

回读检查发现了最后一个显示问题：微信把正文图片地址保存为 `data-src`，外部预览页没有加载这些图片。草稿内容和图片地址都在，现在只修复预览页的图片加载，不改正文、封面或化学结构。

## Final response

**两篇草稿已经完成，已写入公众号草稿箱，并通过回读和最终自审。** fileciteturn115file0L2-L2

**[查看两篇真实草稿（微信回读预览）](https://relay.gczhouwld.com/wechat-preview/996cb9dd18c792fe056e2760.html)**

页面第一篇是**今日精选 Angew：NHC–三芳胺杂化光催化剂**，第二篇是**往期精选 Nature Catalysis：phoenix1结构再生催化**，点击顶部对应卡片即可跳转。往期精选使用你确认的**去白底凤凰封面**，没有再次生成化学结构。fileciteturn115file0L2-L2

我已经检查微信实际保存后的全文和手机端截图：正文段落、图注及图文对应没有遗漏，正文图片均正常加载，也没有被微信的占位提示图替换；在390像素手机宽度下没有横向溢出。之前的首图遗漏、图片延迟加载和外部预览图片显示问题也已修复。fileciteturn113file0L2-L2 fileciteturn115file0L2-L2

**这个链接来自微信实际草稿的 `draft/get` 回读，不是另做的模拟稿，也不是旧稿链接。目前仅保存为草稿，尚未群发。** fileciteturn99file0L2-L2
