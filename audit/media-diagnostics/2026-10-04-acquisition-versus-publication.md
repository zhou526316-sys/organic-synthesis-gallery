# TOC 与正文图获取、暂存及发布诊断 — 2026-10-04

用户请求：查看最新的日志，并说明最近正文图少、新文献 TOC 难以补全的原因；随后要求继续。此次仅诊断，不修改抓取代码、图片对象、生产数据、发布规则或定时安排。

核对 main：a5de5a3462cd1c13915f0a8888677d64f799d1bf。
第一份只读在线快照：run 37171310776，artifact 11291531366，2026-10-04T02:31:30.314Z 至 02:31:41.169Z（北京时间10:31:30–41）。下载的 tm-media-yield-20261004.zip 含精确源代码、最近报告、逐 DOI 报告、TOC 与正文图暂存库存、生产库存、静态媒体索引及发布账本。
补充只读实物核验：run 37172047885，job 111346813971，2026-10-04T02:45:59.245Z（北京时间10:45:59），只读取本网站已存 TOC 和旧暂存列表，不请求出版社，不写图片。

## 一、最新脚本实际在跑；新回执不等于全部处理的图片

local-diagnostics 上传于北京时间10:28:12.676，运行开始于10:10:16.414，controllerRevision=2.2.39，queueCoverageRevision=20261003-queue-coverage-v6，phase=running，inventoryErrors=[]、inventoryUnknown=0。这份实际浏览器上报证明已运行 v6，不能再把本次现象一律归因于没更新脚本。

同一份运行中快照：18篇已访问、19次尝试，5成功、10部分完成、4失败；figure item 中22个 staged、18个 already_staged、19个 failed，19个失败原因全部是 no_usable_figure_variant。故“新增正文图22”并不包括18张有效断点复用，也不意味着图片上传全面失效。这只是10:28的中途快照，不是现在的最终完成数。

200个 DOI 最新报告样本：87 success、91 partial、21 failed、1 progress。报告索引 total=765，正式卡片785。不同 DOI 报告时间不同，不能把200条解释为同一轮尝试或全站失败率。

## 二、最近上架文献的采集与上线差距

这里严格按网站 addedDate>=2026-10-02 分组，不是声称所有论文的原始出版日期都在三天内。共59篇（10/2为39篇、10/3为15篇、10/4为5篇）。

| 网站上架日期 | 篇数 | 有官方TOC采集记录 | 静态索引有官方TOC | 有合格正文图暂存的篇数 | 合格暂存图数 | 标准正文图发布账本条目 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 2026-10-02 | 39 | 33 | 18 | 21 | 93 | 0 |
| 2026-10-03 | 15 | 13 | 3 | 11 | 45 | 0 |
| 2026-10-04 | 5 | 2 | 0 | 3 | 15 | 0 |
| 合计 | 59 | 48 | 21 | 35 | 153 | 0 |

方法：只在正式 DOI 集合内关联当前世代官方 TOC 回执和生产 TOC 状态；Figure1不算官方TOC。正文图按完整暂存库存里的 DOI、图号合格回执计数；这些回执不自动等于整篇已抓全或整包已满足上线条件。静态 figures 中另有5篇各1张 Figure1 替代图，不属于本表标准正文图发布条目，不能笼统说网页完全没有图。

读取时 media-index.json generatedAt=2026-10-04T00:04:28.094Z；body-publication-ledger.json generatedAt=2026-10-04T00:03:25.384Z，全站账本709条。与10:31采集快照不是同一时点，部分差额包含正常发布时差。

## 三、已确认的正文图发布阻断：旧列表2000条上限

当前 cloudflare/scripts/merge-new-body-auto.mjs 的 readLiveInputs 仍读取 /api/article-figures/staged（没有 inventory=1），同时要求 stage.count===stage.items.length 且 stage.count<=2000，否则设置 stageError=auto_stage_truncated_or_invalid 并将 stage=null。Worker 默认接口的 count 是完整数量，但 items 只返回前2000条。抓取端的完整库存接口已经修复，发布端并没有一起改完。

补充实测北京时间10:45:59，默认接口 HTTP200，count=2349，returnedItems=2000。这与上述拒绝条件直接冲突。10:31完整合格库存计2344个图号回执；2349为稍后默认列表原始条目数，口径和时点不同，勿混用。

实际发布任务 run37163851712（Publish validated new body figures），inspect job111322642608，在北京时间08:05:50输出：

NEW_BODY_AUTO_PENDING {"count":0,"articles":0,"targetArticles":1,"ready":false,"mode":"waiting","stageError":"auto_stage_truncated_or_invalid","localCaptureError":null}

publish job111322684865为 skipped。整个workflow显示success只是检查程序正常退出，不是成功发布了正文图。本次不是因为未凑够20篇；目标已是1篇，问题在读取输入失败却被呈现成0待发布。

该问题不会因为反复重新抓已存图片而得到解决。修复应使用完整、可验证的发布元数据分页或清单，保留源DOI、摘要校验和整包校验，不能只把旧接口换成缺少发布证据字段的简化库存，更不能删掉完整性断言。

## 四、TOC 不是全部没抓到：19条被静态清理、8条晚于网页快照

上述59篇里48篇有官方TOC采集记录，而静态索引只显示21篇。差额27篇分为：19篇 toc.reason=invalid_static_media_pruned，另8篇没有该静态条目，其采集时间均晚于当前静态索引08:04生成时间。这8篇不能直接判成发布故障。

19个被清理条目对应的当前官方采集记录均为SVG。例如10.1021/jacs.6c13713、10.1021/acs.orglett.6c03558、10.1021/acs.joc.6c01674。

补充直接读取这三个网站存储对象：均HTTP200、Content-Type=image/svg+xml，实际长度分别459685、334502、564562 bytes，与各自存储记录一致；SVG根元素位于第39字节，均能通过 sanitize-static-media.mjs 所用1024字节格式头识别条件。SHA256分别为c26611244a5eaa93d9cea55636cb3ff30fdbe0cbdf6ce0310636b226c19bb24d、be1d135ff6321aeb5b804eb78c0ce314731334985839223d2dda957e8b653b1f、f5e677d5ddde3636665e675a33450b1af70e4ea4828393965c1c0f02906c5f76。

这证明对应TOC源文件仍可读取，不能称其根本未采集。尚未逐一还原构建期间的本地文件路径、后续覆盖和字节，因此不宣称已确定是哪一行删除了正确文件，也不把格式头识别等同于完整SVG安全/语义验收。优先核查静态镜像、扩展名、文件存在性和构建覆盖顺序，而非盲目要求用户再次采集。

另外11篇没有当前官方TOC采集记录。not_found只证明本轮未取得合格官方图，不证明出版社一定没有。今天两篇CCS（10.31635/ccschem.026.202608392、10.31635/ccschem.026.202608407）正文图已有4张、6张暂存，而TOC任务仍not_found；这不是此前漏注入域名导致所有层都不能跑的同一个现象。

## 五、ACS 正文图实际获取瓶颈

最近日志中的主要失败组合：acs.silverchair-cdn.com/DownloadFile/DownloadImage.aspx 大图请求HTTP403；同图inline PNG可以读取，但经 articleFigureResolution 判断为low，于是最终no_usable_figure_variant。page_fetch的Failed to fetch在没有HTTP状态时不能擅自认定CORS、限额或403。

- 10.1021/jacs.6c16285：最新报告正文图2/8；Figure1大图403，inline图520×586标为low。当前位图usable要求最长边>=600、最短边>=140、面积>=120000，520×586虽然面积达标仍因最长边不足被拒。
- 10.1021/acscatal.6c04883：TOC stored、正文图0/11；多个大图403及520像素宽的候选low。
- 10.1021/acs.orglett.6c03908：正文图2/4，也有大图403和低尺寸候选。
- 10.1021/acs.orglett.6c03980：正文图5/5，存在中间403但其他SVG来源成功。因此不能把每一个候选403都计作整篇失败。

需要先核对官方页面实际提供且用户有权访问的高清/矢量来源及请求上下文，避免无收益重复候选。不得取消来源校验或直接把低清图当高清成功；如采用降级预览必须另行明确产品规则。22个新staged回执也说明不能在无账单/容量证据下笼统归咎R2已满。

## 六、Angew 是候选识别阶段零结果，尚未证明是上传故障

上述59篇中的14篇Angew，最新报告均figuresDiscovered=0、figuresStored=0，但TOC已有采集记录。10.1002/anie.3010868的trace多次出现：
page state loaded，doiMatch=true;textLength=42993;accessGate=false；
figure_discovery scan_complete，isolated_labels=0;variants=0。

当前适配器从img/object抽取候选，依赖图块与图注，未匹配独立Figure/Scheme/Chart标签则排除。日志足以定位到“正文图候选发现”而非“已发现图片但上传失败”；尚需真实DOM/当前稿件页面确认是选择器未适配、图注位置/懒加载，还是当前版本只提供PDF等差异。不据此声称14篇都没有正文图，也不把所有出版社归为同一个原因。

出版社自身版本差异也要单列：Nature官方页面10.1038/s41467-026-78226-0明确注明当前是提前共享的已接收版本、还会被最终Version of Record替换。这个事实不能直接证明该篇永久无TOC，但说明“新发表就一定已有与正式HTML相同的图结构”的假设不成立。公开来源：https://www.nature.com/articles/s41467-026-78226-0 （2026-10-04检索）。

## 七、仍存在的发布契约与独立告警

现行policy要求同次构建具备官方TOC、合格完成包，并限制每卡10张。completedPacketMap只读取最近200个DOI最新报告、要求final success且mediaNeed含figures及stored=discovered。后续TOC-only/partial报告可能遮蔽之前的完整正文图结果；这是需要按DOI分层持久回执核查的风险，不能声称153张均满足当前整包发布条件。

独立线上验收run37169344188/job111338920968于北京时间09:53输出 body published without official TOC 10.1021/acs.joc.6c01197，browserRenderingVerified=false。它是发布后的一致性告警，不应被误说成抓取器Playwright失败，也不能据此断定它本身阻止了前面的发布任务。

## 建议修复顺序（本轮未实施）

先修发布输入完整性及错误状态，定位19个静态TOC清理案例，解决已存却不可见；再针对ACS大图路径/候选收益和Wiley真实DOM适配；最后核对分层回执到发布完成包的交接。保持用户既定的全队列、缺项、最新优先、单篇失败继续和严格DOI绑定规则，不用新的批次数量补丁替代上述故障修复。
