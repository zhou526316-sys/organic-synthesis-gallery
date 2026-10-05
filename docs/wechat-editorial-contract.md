# WeChat Editorial Contract

Updated: 2026-10-05
Status: active

## Daily publication shape

The 10:00 Asia/Shanghai WeChat update is one multi-article push with two editorial entries:

1. **今日更新 + 每日精选**
   - Uses only the verified 08:00 Gallery release for that Beijing date.
   - The daily featured paper is the main editorial content and receives most of the article space.
2. **往期精选**
   - A previously deep-read high-value paper selected from the retrospective pool.
   - It is a separate article/card in the same WeChat push, similar to a two-card Official Account message.
   - Do not repeat a recent retrospective unless explicitly requested.

Final publication remains manual for the current personal-subject Official Account; draft creation/update and preview generation remain automated.

## Selection authority

- **每日精选** and **往期精选** are manually selected by the user until the user explicitly changes this policy.
- The system must not auto-pick, substitute, rank into, or replace either selection based on journal prestige, recency, score, or model preference.
- A daily featured manifest is used only after that day's user selection is known.
- A retrospective slug in the daily edition means: attach that user-selected retrospective as a **separate WeChat article/card in the outgoing multi-article queue**. It must never be merged into the daily featured article body.
- If the user has not selected a retrospective, omit the retrospective card rather than auto-filling one.

## Daily literature list compression

Let N be the number of papers released at 08:00.

- If **N <= 5**: show each paper's Chinese title, English title, and authors, grouped by journal.
- If **N > 5**: **do not enumerate individual titles/authors in the body**. Show only:
  - total paper count;
  - each journal that has updates;
  - count per journal.
  Example: `Nature Communications 2 篇 · JACS 3 篇 · Angew 2 篇`.
- The compact update block should occupy minimal vertical space. The daily featured paper receives the dominant visual and text space.
- When N > 5, the text list still stays compressed to journal counts only, but the Gallery jump card may show **3–4 real miniatures** from that day's new papers. These miniatures are navigation/visual context, not a substitute for re-enumerating the full list.
- The full list remains accessible through “阅读原文” at the fixed Gallery edition link.

## Gallery jump card

Immediately below the compact “今日更新” block, include one Gallery entry visual optimized for the WeChat article width:

- Left: a miniature styled as a **real card from that day's newly added literature**, using the paper's actual title/journal/DOI and an original paper visual when available.
- Right: a large, high-contrast QR code pointing to the fixed daily Gallery edition URL: `https://gallery.gczhouwld.com/?edition=YYYY-MM-DD`.
- Copy must say only that readers can view **all of today's new papers** and continue **searching/filtering/browsing** on the Gallery.
- Do **not** claim the Gallery website itself provides “深度解读”; the deep-reading editorial belongs to the WeChat article.
- The whole block should fit the normal mobile WeChat article width and read as one compact horizontal card rather than a standalone QR code.

## Featured-paper writing standard

Both “每日精选” and “往期精选” use the same deep-reading standard:

1. Start shallow: what the authors did, what is genuinely clever, and why the paper is worth reading.
2. Then explain the problem and reaction design.
3. Use original figures at the exact argumentative point where they help the reader.
4. Move into conditions and mechanistic evidence only after the reader understands the reaction.
5. Distinguish:
   - direct experimental support;
   - indirect/compatible evidence;
   - computational support;
   - author-proposed model;
   - unresolved alternatives.
6. Peer review is used as evidence, not decoration: explain what reviewers challenged, what experiments/calculations were added, and how the final claims changed.
7. Discuss scope boundaries and failed substrates, not only best yields.
8. End with what the reader can actually learn from the work and what should not be overclaimed.

## Visual standard

- Prefer original paper figures and SI figures; never AI-redraw chemical structures.
- Maintain high-resolution rendering and WeChat-compatible image formats.
- Avoid long uninterrupted text blocks; alternate figures and explanation.
- Cover must communicate the paper's central reaction or concept at a glance and must not be an arbitrary cropped page.
- Editorial logic must come from the paper's actual experimental design, evidence chain, scope, comparison, or author/reviewer argument. Do not manufacture a relationship merely to make two facts sound "smart", and avoid generic labels such as "最聪明的地方" unless the paper itself supplies a defensible causal reason.
- For a retrospective used as the small secondary WeChat card, build a **dedicated square thumbnail** with only the minimum paper identity and original chemistry visual needed at small size; never shrink a dense wide cover into the square slot.

## Authorship / disclosure

- Author display: 化之岛.
- Keep the AI-assisted creation statement.
- Keep the fixed original editorial statement.
- Platform-native “原创” settings are checked manually at final publication when applicable.

## Featured-paper editorial QA

- Use the previous successfully published featured article as the structural baseline: result first, then why the chemistry is difficult, the decisive design/optimization, scope, synthetic application, mechanism, practical limitations, and a concise take-home.
- The three opening boxes must form one causal reading path rather than three generic selling points: **what was achieved -> what bottleneck was actually solved -> why the paper is worth studying as a method/mechanism story**.
- The first paper figure belongs immediately above the opening “做了什么” block.
- Every body figure must be a clean crop from the final paper or SI: no journal header, footer, page number, neighbouring paragraph, half-cut caption, or unrelated panel unless that context is explicitly needed.
- Prefer final-PDF crops over screenshots. Render at high resolution before cropping; do not enlarge a low-resolution screenshot.
- Do not include spectra merely because they are present in SI. A spectrum is used only when the article text explicitly teaches the reader what feature in that spectrum is evidence for the claim. Otherwise explain the conclusion in prose or use a more interpretable table/scheme.
- Never reuse one figure for two different claims. Each image must have one clear evidentiary role and its explanation goes below the image.
- Keep “chemical space” discussion paper-specific. For the 2026-10-05 bundle, the chemical-space discussion belongs to the MacMillan retrospective, not the JACS daily pick.

