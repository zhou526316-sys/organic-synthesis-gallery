# Phoenix cover transparent-background revision r5

Beijing time: 2026-10-07 11:49:00 +08:00
Context: user asked to remove white backgrounds behind the source-locked chemical structures, not to redraw chemistry or update the WeChat draft in this step.

## Initial reply

可以，白底不必保留。这次只把原文结构图层的白底转为透明，再叠回凤凰背景，不重画结构；同时检查细键、自由基点和正电荷有没有被误删。

## Actual execution and evidence

Mounted prior source package confirmed: /mnt/data/phoenix-cover-source-locked-r4.zip.
Extracted to /mnt/data/phoenix-cover-r5-work. Reused its compose.py, original five structure PNGs, source-manifest.json and the mounted user-selected artwork image(20261007-030416).png. SHA256 checks from the old source manifest pass before composition.

Outputs are real raster files under /mnt/data/phoenix-cover-r5. All six structure placements retain their exact r4 placement and uniform scale. Continuous white-to-alpha conversion uses alpha = 255 - min(R,G,B) after the same scaling operation as r4; no binary threshold, morphology, OCR, inferred chemical drawing, new bonds or generative edit is applied. Nonwhite source-pixel support is identical to output positive-alpha support. Display ink colours are adjusted to pale warm/cool colours for legibility. Source phoenix1 red connecting-bond pixels retain a separate warm-colour cue. Opaque white cards and their edges are removed; soft local dark shading improves contrast. This is a presentation-colour/alpha edit, not RGB pixel equality to the old opaque cover.

Transparent PNG layers and matching alpha masks are saved for all six placements. Full cover and square were both opened and visually inspected after generation. Free-radical dot and positive charge remain visible. No PDFs, credentials or private publisher tokens committed. Image assets themselves have NOT been committed or uploaded to WeChat. No publisher trigger or draft/get was invoked.

Full cover SHA256: 5a566cc29abc2ef26b1546db0feb97d45cffa025a1945cdcc9e688bd9f685508
Square SHA256: 7846c8a6ad0a6935589042d2f9a57215cb216f90bb6fa349945ea9c000c8b6a5
Recovery package: /mnt/data/phoenix-cover-transparent-r5.zip (3357683 bytes); includes exact rendered files, transparent structure PNGs, alpha masks, original-structure PNGs, composition script and provenance.

The user-visible execution produced: 已生成去白底封面和方形封面；6处结构图层的非白像素保留检查均通过。

## Final reply

**可以，已经去掉白色底板，方形封面也同步改好了。**

这次直接把原文结构图层的白底转为透明，没有重新生成结构。键线形状、原子标记、自由基点和正电荷均保留；为适配深色凤凰背景，仅调整了线条颜色，并用柔和暗影提高可读性。

[查看去白底完整封面](sandbox:/mnt/data/phoenix-cover-r5/phoenix-source-locked-cover.png)　[查看去白底方形封面](sandbox:/mnt/data/phoenix-cover-r5/phoenix-wechat-square.png)

[封面与透明结构图层素材包](sandbox:/mnt/data/phoenix-cover-transparent-r5.zip)

本次更新的是封面文件，尚未写入公众号草稿。
