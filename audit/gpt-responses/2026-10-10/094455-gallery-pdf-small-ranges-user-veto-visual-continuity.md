# Gallery PDF small Range chunks — user experience decision

Beijing time: 2026-10-10 09:44:55
Context: The user explicitly said not to implement smaller Range segments if they affect PDF reading experience.
Decision: Hold adaptive small-chunk implementation; 128-256KiB chunks do not change fidelity but risk increased RTT, page-render latency and scroll stutter under campus VPN/proxy. No repair code or production deployment in this turn.
Existing complaint: PDF first page waiting for Range bytes on campus VPN+Ghelper US rule-based proxy; the underlying failure is not claimed solved.
Project rules: feedback verification/approval gate; do not modify without compatible plan and evidence.

## Complete user-facing response

**会有影响加载流畅度的风险，但不会降低 PDF 的画质。**

小分段读取不会改变文字、化学结构、图片分辨率或连续纵向滚动的显示方式。不过，把 1 MiB 分段改为 128–256 KiB，会增加网络请求次数。在你目前的校园网＋学校 VPN＋Ghelper 美国节点环境下，请求往返延迟较高，可能导致翻到后续页面时等待更久，甚至比现在更慢。

**因此按你的要求，这次不实施小分段读取，也不改变现有阅读观感。**

接下来优先核查不改变 PDF 显示方式的措施：区分“收到 206 响应头”和“文件数据确实传输完成”、记录不含隐私的传输进度和失败原因，减少重复请求，并继续解决真正独立的国内备用网络入口。任何会影响连续滚动、清晰度或阅读流畅度的改动，都不直接上线。

目前 PDF 打不开的问题仍未解决，我不会把“不采用小分段”当作修复完成。
