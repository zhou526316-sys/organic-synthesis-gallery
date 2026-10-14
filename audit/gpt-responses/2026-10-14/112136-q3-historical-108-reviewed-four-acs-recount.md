# Organic Synthesis Gallery — 历史回溯：ACS四篇双遍审核、CI合并与Q3来源复算

北京时间：2026-10-14 11:21:36 (Asia/Shanghai)。当前任务在用户“继续”请求下延续 PR #622 后已确认的104篇历史准入、13篇待08:00入库基线。项目仓库 zhou526316-sys/organic-synthesis-gallery，唯一 main；本记录为该聊天窗口的用户可见回复与真正已执行产物的完整审计摘要。没有任何私密密钥、付费论文全文、PDF或SI。

## 本轮已经完成的科研审核

从 2026Q3 16刊完整源候选队列中经冻结Crossref/OpenAlex和ACS官方Article History/公开摘要，逐篇交叉核对真实首次在线、书目、一般制备转化和双遍独立学术挑战。四个确实尚未正式收录、未在既有104篇学术清单、2篇pending或12条用户明确排除名单中的原创合成DOI：

1. ACS Catalysis 10.1021/acscatal.6c02607，2026-07-13在线：MacE/MacF/At4CL1将苯丙酮酸及肉桂酸前体制成多芳基γ-丁内酯 maculalactones；独立体外一锅分离13种衍生物、最多96%收率；96次酶组合转化筛选不等于96个分离产物。E. coli组合基因簇产物与体外合成分别叙述。它是γ-丁内酯类天然产物，**不是大环内酯(macrolide)**。真实有机合成平台不可因文章包含酶工程/肿瘤筛选就无条件排除。
2. Organic Letters 10.1021/acs.orglett.6c03221，2026-09-02在线：手性金属中心Rh(III)促进氧氮杂䓬与双环[1.1.0]丁烷不对称[3+2]环加成，得到aza-双环[2.1.1]己烷，50–96%分离收率、最高99% ee，存在放大与衍生化；不得把上限泛化为所有底物。
3. Organic Letters 10.1021/acs.orglett.6c03207，2026-09-02在线：Pd催化串联不对称烯丙基烷基化/醚化得到手性中环氧杂螺环，最高98%收率与95% ee、克级实验；游离酚羟基对于立体诱导与第一步烯丙基烷基化控制是实验限制，不推断完全唯一过渡态。
4. JOC 10.1021/acs.joc.6c01737，2026-09-21在线：苯胺/硫酚体系电流调控的先成C–C、再成C–S氧化交叉脱氢偶联合成双芳硫基联苯二胺，最高96%收率、1.9克规模；没有外加化学氧化剂不代表不存在阳极氧化，**绝不可误标交替极性交流电**，后续作为有机硫材料和单体不抹去真实方法学范围。

四篇逐篇审核证据 audit/historical-reviewed/2026-10-14-q3-four-acs-original-methods-two-pass.json；冻结源批次sha a755e26f93efd287a279c7f9a9ffea343e3e095a、80aca4837373541c9ba22bdcae30cd0bd2f64511、0a6b4fb5580453d2b101f2f94030ee7f9c473541。独立第一遍范围证据和独立第二遍反向挑战均按最新scope-2026-10-02-v1写入。媒体严格toc_only，new=false，addedDate空；没有复制付费正文、历史PDF、正文图或SI。

## PR与CI真实验收

PR #636 https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/636；最初CI发现部分scopeAssessment.sourceEvidence未重复写完整DOI身份，本轮在PR内修订而没有放宽校验；正式末版提交6e7d7a3d816583159f6365206c8c5086ecb934ca。历史准入 #38504829614、全站/Playwright #38504829599、Tampermonkey #38504829601、私人PDF #38504829632 四项均completed/success后，通过保护性最新main重读（未发现目录/审批或用户已定排除交集）正式squash合并，合并commit **51db180adf9c85ef9bdbd6b6d8350ac48ad280a9**。不触及任何正式目录或历史媒体。

## Q3独立复算与正式/学术边界

唯一历史学术批准清单 audit/historical-reviewed/approved-admissions.json 现为 **108篇include、2篇原pending、累计检查110篇**；正式历史已入库91篇，**新近17篇只在批准清单，未在当前正式目录**；唯一下一合法正式新增为2026-10-15北京时间08:00，须由既有writer独立放行。Git正式文献总目录 **1087篇**，生产同步状态文件 phase=synced_with_pending，最后可验证正式目录成员1087。当前纠错清单12个最终排除DOI与这108篇历史审批的交集为空。

在已存在而非新创建的 staging-only 历史季度复算触发文件上提交更改 main commit **23cfb008e808358be83f5b94b566ffe36b1a8311**；旧工作流 https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38505631686 completed/success。两份staging审计生成日期均为2026-10-14T03:19:32.799Z，即北京时间11:19:32：Q3 16刊Crossref/OpenAlex 来源根 **192/192**、去重来源候选 **12286 DOI**、Q3正式 **820**、已审待08:00 **17**、未审或首次在线待核 **11431**（比此前11435少4）；源publisherIssueResearchReconciliationComplete=false。11431混合学科候选不等于已证实漏收的有机合成论文，1000篇只是召回警示并非硬指标。没有Cloudflare D1查询/改写、历史PDF/SI/正文图，也没有新增或修改18点槽位。

## 本轮新增发现但未擅自作学术准入的日期/身份核查

Chem同一标题及作者的10.1016/j.chempr.2026.102990与10.1016/j.chempr.2026.103106同时出现在2026-08-01 Crossref源切片，然而出版社ScienceDirect S2451929426000562记录早在2026-03-27 Available Online；双DOI是否校正前后版本尚需独立Crossmark/出版社核实，不能按标题擅自删某个DOI或都纳入Q3。CCS Chemistry 10.31635/ccschem.026.202608043 源8月22日与次级资料6月30日分歧，必须出版社历史佐证。Nature Catalysis 10.1038/s41929-026-01608-6明确2026-08-25首发、确有IL@Bi电催化 CO2/亚磷酸根合成foscarnet的C–P键，但公开原文强调37.5%法拉第效率等材料机理指标，未确认足够一般性制备范围；不自动当成漏收或永久排除。以上只是unfinished核查，未改变原2篇pending。专项证据留存在历史Issue #498： https://github.com/zhou526316-sys/organic-synthesis-gallery/issues/498#issuecomment-6160033958 。

历史Issue #498本轮的真实PR和复算里程碑已更新： https://github.com/zhou526316-sys/organic-synthesis-gallery/issues/498#issuecomment-6160125555 。单篇审核准入与跨期刊出版社Research TOC完整性严格分开，后者仍未验收完。下一工作应覆盖余下出版社Research逐期目录、在线优先文献和未解决的日期身份，而非靠关键词或数量凑足季度配额。

## 用户可见回报归档声明

本聊天已先报告最初4篇候选的日期、真实制备和来源，再针对maculalactones更正“γ-丁内酯而非大环内酯”；随后报告PR #636合并、历史108篇审批及17篇等待08:00，和Q3来源复算完成。所有声称已完成的仓库/CI/Action均由本轮真实API回读确认。正式正文/媒体采集权限与08:00发布合同不变。
