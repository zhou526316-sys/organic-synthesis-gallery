Beijing time: 2026-10-04 11:05:11 +08:00
Context: Daily all-literature bilingual index + manually supplied PDF featured reading; stepwise official-account integration
Inspected main: c8464f8acf9bfaf6265cdfabdc0fcbf1509dcf72
User requested: all newly deployed papers grouped and ordered by journal, Chinese and English titles plus authors, one Read Original entry highlighting the edition additions; user supplies one PDF daily for deep reading with faithful high-quality original figures. First connect automation step by step.
Working assumption (optional format question unanswered): one article with featured section and complete index, one end link. Not treated as an irreversible account configuration.
Completed: source/receipt/metadata verification and interface/documentation research. Pending: actual account permissions, server access, live draft write, edition highlighting, verified first send, recurring execution. No live publishing or scheduling performed.

## Reply body

就按你的这个方案推进。**先打通“网站更新上线 → 自动生成全量目录 → 写入公众号 → 发布／群发”这条流程，再接入你每天上传论文的深度精选。**

我会一步一步带你操作。这一轮先把内容规则确定下来，最后你只需要完成一个操作：**查看公众号的接口权限。**

## 一、每日推文按你的要求组织

先按**一篇推文包含“每日精选＋全部新增目录”，文末一个“阅读原文”入口**设计，符合你只保留一个跳转入口的要求。自动化接入阶段先用目录测试，之后再合入精选。

### 1. 全部新增文献目录：自动生成

目录按此前约定的顺序排列：

**Nature → Science → Nature 子刊 → Science 子刊 → JACS → Angew → Chem → 其他已纳入期刊。**

按具体期刊分组，没有新增文献的期刊不占位置。每篇只显示：

- **中文标题**
- **英文原标题**
- **作者列表**

作者保留原文署名和顺序，默认完整列出。目录中不再逐篇添加跳转按钮；DOI 留在内部数据中，用于去重和对应网站卡片。

**这里的“新增”，按网站实际新增上线的文献计算。** 我刚核对了今天 08:00 的上线记录：这一批有 5 篇，均已有中英文标题和作者字段，而论文发表日期都是 10 月 3 日。因此，直接筛“今天发表”的文献会漏掉它们。公众号应读取网站已经验证成功的发布清单。[本批上线记录](https://github.com/zhou526316-sys/organic-synthesis-gallery/blob/c8464f8acf9bfaf6265cdfabdc0fcbf1509dcf72/audit/deployment-deliveries/37163552636-1.json) · [对应文献数据](https://github.com/zhou526316-sys/organic-synthesis-gallery/blob/c8464f8acf9bfaf6265cdfabdc0fcbf1509dcf72/public/rolling-supplement.json)

### 2. 每日文献精选：你上传，我解读

你每天把选好的论文 PDF 发进这个聊天，我根据原文完成：

**研究问题、核心创新、反应设计、关键条件、底物范围与限制、机理证据、值得借鉴之处。**

解读配对应的原文 Figure／Scheme，明确区分论文证明的结论和我们的分析。生成好的精选再合入当天尚未发送的草稿。

**目录生成不必等待 PDF。** 网站更新成功后先生成目录草稿，你提供论文后，再加入精选内容。

## 二、“阅读原文”要固定对应这一期新增文献

这一点需要专门实现。

例如，10 月 4 日的推文，应固定对应“10 月 4 日这期所收录的新增文献”。读者 10 月 8 日再打开这篇推文，仍然应高亮这批文献，不能变成 10 月 8 日的新文献。

我会按以下方式接：

- 每期保存一份固定的文献清单。
- “阅读原文”携带该期标识，进入 `gallery.gczhouwld.com`。
- 网页显示“本期新增 · N 篇”，定位并突出显示对应卡片。
- 提供返回全部文献的入口。

**当前网站已有单篇 DOI 定位；这次要求的“本期多篇高亮”还需要新增，不能把它当成已经可用的功能。** 后续会和公众号草稿一起验收，包括在微信里实际点击后的访问结果。

## 三、图片高清按这个流程做

你的要求我会落实到**原图取得、输出和微信上传后的验收**，不会只改一个 DPI 数值就说图片变清楚了。

1. **优先取得 PDF 原始图像或矢量内容。** 完整内嵌图片直接提取；由化学结构、文字和位图混合组成的图，按完整图区域高分辨率渲染，保留图例和条件。
2. **复杂横图增加局部放大。** 保留总览，再按原图分区展示关键部分，避免把几十个底物压成手机上看不清的一张图。
3. **结构和数据保持原样。** 原子标记、立体键、反应条件、产率、ee、坐标等不由生成式工具重绘或补全。
4. **正文图和封面分别适配。** 保留高清母版，按实际使用的公众号上传接口生成发布版；上传后检查手机正文和点击大图的清晰度。

微信正文图片、封面和其他消息图片的限制不能混用。本次未取得正文图片接口的现行官方参数全文，所以我暂时不把“必须 300 dpi”“统一 1080 像素”之类说法当成微信规定。**正式接入时，以对应接口的要求、上传结果和手机预览共同验收。**

## 四、整个接入流程分六步

| 步骤 | 要完成的事 | 验收结果 |
|---|---|---|
| **1. 查公众号权限** | 确认账号类型，以及素材、草稿、发布、群发权限 | 明确能自动做到哪一步 |
| **2. 检查现有服务器** | 核对微信中转服务器、现有凭据和出口 IP | 能正常调用对应微信接口 |
| **3. 写入第一篇真实草稿** | 用今天这批文献生成中英文目录，上传封面并创建草稿 | 公众号后台能看到、打开、读回这篇稿件 |
| **4. 接上阅读原文** | 实现本期清单与网站多篇高亮 | 手机微信点击后，准确进入本期新增文献 |
| **5. 验收首次正式推送** | 使用已经确认的完整稿件测试最终发布／群发环节 | 核实最终发送状态，而不仅是请求提交成功 |
| **6. 开启日常自动执行** | 网站上线成功后生成或更新草稿，按确定的时间发送 | 全量、不重复，并留下发送结果记录 |

日常运行可以采用：**08:00 上线后生成当天草稿，18:00 上线后补齐同一份未发送草稿，每天正式推送一次。** 这样能合并两次更新，也方便加入你的每日精选。

腾讯客服目前说明，资讯类公众号每天可群发一条消息，服务号每月可群发四条，因此具体发送节奏必须和账号类型匹配。这个额度也不等于账号已拥有 API 群发权限。genui{"citation":{"ref":"turn70view2"}}

## 五、现在只做第 1 步：查看公众号接口权限

### ① 打开并登录公众号

进入：

**[微信公众平台：https://mp.weixin.qq.com/](https://mp.weixin.qq.com/)**

登录你准备用来发这些文献推文的账号。

### ② 找到开发接口管理

从后台进入：

**设置与开发 → 开发接口管理**

腾讯官方当前说明中的路径为“设置与开发 → 开发接口管理 → 基本配置”；进入这个管理区域后，查找“接口权限”页面或页签。genui{"citation":{"ref":"turn70view0"}}

### ③ 查看这四项

| 权限项 | 需要看到的信息 |
|---|---|
| 素材管理／图片上传 | 是否已获得 |
| 草稿箱／新建草稿 | 是否已获得 |
| 发布／发布能力 | 是否已获得 |
| 群发／群发接口 | 是否已获得 |

同时确认账号属于**公众号／订阅号还是服务号**，以及主体、认证状态。

### ④ 把权限区域截图发到这里

**先发“接口权限”这一页的截图即可。** 如果账号类型和认证状态在另一页，再补充文字说明。

**不用发送 AppSecret，也不要为了这一步重置它。** 之前已经配置过的凭据和服务可以继续复用。

拿到这页信息后，我就按你的实际账号给出**第 2 步的服务器检查操作**，随后用已经核对好的真实文献数据，把第一篇目录写进你的公众号草稿箱。
