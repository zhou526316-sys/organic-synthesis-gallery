北京时间：2026-09-26 21:05
任务：当前 Gallery 全量数据状态

刚重新跑完一轮全量只读审计，使用当前生产 registry 与生产 API，不复用下午数据。审计 run：36243942925。

当前全站文献总数：614 篇。

总体状态：
- 正式 TOC：396 篇已有，218 篇缺失。
- 正文图暂存：363 篇至少有 1 张，当前 registry 对应暂存图共 1622 张；251 篇一张正文图暂存都没有。
- 正文图正式公开发布：0 篇；当前 production article-figures 仍为空，正文图仍全部停留在 staging/review 层。
- Evidence：163 篇已有，451 篇缺失。
  - complete：79
  - partial：65
  - abstract_only：19
- 公开摘要：68 篇已发布，546 篇未发布。
  - 其中 95 篇已有 Evidence，只差摘要审核/发布（scheduled_summary_pending）。
  - 451 篇没有 Evidence，因此无法可靠生成摘要。

和下午 13:32 的 611 篇快照相比：
- 文献总数：611 → 614（+3）
- 正式 TOC：334 → 396（+62）
- 缺 TOC：277 → 218（-59，考虑新增 3 篇）
- Evidence：108 → 163（+55）
- 缺 Evidence：503 → 451（-52，考虑新增 3 篇）
- 公开摘要：4 → 68（+64）
- 已有 Evidence 但待摘要：104 → 95（-9）
- 正文图暂存覆盖：352 → 363 篇（+11）
- 当前 registry 正文图暂存数：1562 → 1622 张（+60）

当前各期刊缺口（生产口径）：
| 期刊 | 总数 | 缺 TOC | 缺 Evidence | 缺公开摘要 |
| Nature | 10 | 10 | 8 | 8 |
| Science | 5 | 5 | 1 | 5 |
| Nature Chemistry | 13 | 13 | 9 | 10 |
| Nature Synthesis | 17 | 17 | 13 | 14 |
| Nature Catalysis | 12 | 12 | 11 | 11 |
| Nature Communications | 49 | 49 | 26 | 27 |
| JACS | 121 | 6 | 101 | 119 |
| Angew | 62 | 2 | 1 | 46 |
| ACS Catalysis | 44 | 10 | 38 | 40 |
| Organic Letters | 259 | 92 | 230 | 250 |
| JOC | 20 | 0 | 12 | 15 |
| CCS Chemistry | 1 | 1 | 1 | 1 |
| Science Advances | 1 | 1 | 0 | 0 |

正文图暂存覆盖（当前 registry）：
- Organic Letters：180/259 篇，734 张
- JACS：42/121 篇，162 张
- ACS Catalysis：31/44 篇，135 张
- JOC：19/20 篇，83 张
- Nature Communications：36/49 篇，231 张
- Nature Chemistry：13/13 篇，55 张
- Nature Synthesis：17/17 篇，98 张
- Nature Catalysis：12/12 篇，64 张
- Nature：8/10 篇，37 张
- Science：5/5 篇，23 张
- Angew：0/62 篇，0 张暂存正文图
- CCS Chemistry / Science Advances：0 篇正文图暂存

Tampermonkey 当前最近 80 条报告已经全部是 Bridge 2.2.35，说明版本已经完全收敛，不再有 2.2.34/2.2.33 混跑。

当前最值得关注：
1. Angew TOC 修复效果已经很明显：62 篇只剩 2 篇缺正式 TOC，Evidence 只缺 1 篇；但正文图仍是 0/62，这是下一阶段最明显的媒体缺口。
2. JACS TOC 只剩 6 篇，但 Evidence 仍缺 101 篇、正文图暂存仅 42/121。
3. Organic Letters 仍是绝对量最大缺口：92 篇缺 TOC、230 篇缺 Evidence、250 篇缺摘要。
4. Nature family 的正文图抓取覆盖其实较好，但正式 TOC 生产口径仍大量缺失，尤其 Nature Communications 49/49 缺正式 TOC，需要继续区分“暂存/已有 fallback”与“正式 official TOC”。

本轮只读审计没有修改生产数据。
