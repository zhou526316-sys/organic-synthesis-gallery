Beijing date: 2026-10-07
Context: approved pagination release continuation; architecture, PDF Vault and acquisition excluded.
Merged UI: 25a2edb393e6bdb230569be3ec95ebf59473a36b.
Pages deployment 37585923361 completed successfully; downloaded delivery artifact 11467531166 SHA256 cdbc64262877abaf367824c8af578849f19e47c71c419cd9923cddddde41ab3b identifies deployed source abcf1b15c36ebfb3177f4a4234d071a052e7a008, a verified descendant of the UI merge with no intervening frontend source changes. Worker sync 37585923295 also succeeded.

Added read-only production acceptance workflow in commit daeb1d80d5fee51ac3f874309cdc59f007b107c4. Run 37586983585 attempt 1 accessed the pre-deploy website and failed because the new jump control was absent. After successful Pages deployment, the unchanged probe was rerun once; attempt 2 passed all four browser/viewport cases. No account/feedback/analytics production test writes were allowed, and catalog/media/UI responses were not mocked. Captured filteredReadPath is empty, so this report does not claim a live D1-index-specific pass. Existing D1 fixture regression passed before deployment.
Verified artifacts: Chromium 11467436183 SHA256 880c1e7914ea7852b940aab6c6a19ac0952176bc06bb2e63c673b934a66663c8; WebKit 11466778417 SHA256 54cad76b6635cf36bd43e184f78b131c405078919a4d7d3471d3bdd47b9593ae. Browser completion times 2026-10-07T07:26:51.348Z and 07:27:14.574Z. Both viewport widths 1280 and 320 had centered controls, zero horizontal overflow, >=44px targets, successful next/page-number/Enter jumps, invalid-input rejection, distinct page DOIs, and no pageerrors.

Visual inspection found an additional narrow-screen defect: fixed feedback/navigation launchers overlap edge page-number buttons. Do not call all mobile polish complete merely because the first automated cases passed. This branch adds only mobile footer clearance in src/pagination-layout.css, leaving launchers visible and saved positions unchanged. Adds real-widget overlap assertions and native last-page button clicks to existing pagination acceptance tests. The follow-up is not deployed at this checkpoint and must pass CI before merge. It does not change architecture, catalog limits, publisher media, PDF capture or feedback statuses.

User-visible progress messages this turn:
继续核对部署和正式网页，重点确认新版分页是否真正生效；若发布失败，就定位并处理阻塞。
Worker 端部署和前端同步已成功。接下来直接检查主站的分页按钮和跳页行为，确认上线的确实是新版。
当前执行环境无法解析主站域名。我改用 GitHub 的浏览器验收流程检查现网，不把这里的网络错误当成网站故障。
现网验收已提交：直接访问正式域名，点击翻页、输入页码，并核对切换后的文献；不会重新部署或修改文献数据。
主站构建已通过分页和历史检索检查，两个浏览器也已开始访问正式网址验收。这次会保留现网截图，区别于之前的测试页截图。
首轮现网检查确认：正式页面还没有“指定页跳转”输入框，当时 Pages 发布尚未完成。我会在发布完成后复跑同一套检查，不放宽验收条件。
Pages 已发布成功，正式域名的文件一致性检查也已通过。Chrome 内核的现网翻页与指定页跳转已通过，现在还在核对 WebKit 的结果和截图。
新版分页已经在主站通过跳页检查。但查看手机截图时又发现：悬浮的“吐槽”和“返回顶部”会挡住两侧页码。这个遮挡也需要补掉，不能只看测试通过。
