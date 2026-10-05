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

## Daily literature list compression

Let N be the number of papers released at 08:00.

- If **N <= 5**: show each paper's Chinese title, English title, and authors, grouped by journal.
- If **N > 5**: **do not enumerate individual titles/authors in the body**. Show only:
  - total paper count;
  - each journal that has updates;
  - count per journal.
  Example: `Nature Communications 2 篇 · JACS 3 篇 · Angew 2 篇`.
- The compact update block should occupy minimal vertical space. The daily featured paper receives the dominant visual and text space.
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

## Authorship / disclosure

- Author display: 化之岛.
- Keep the AI-assisted creation statement.
- Keep the fixed original editorial statement.
- Platform-native “原创” settings are checked manually at final publication when applicable.
