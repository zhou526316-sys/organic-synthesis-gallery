# Final protected-literature authorization readback for PR #684

Owner approval (2026-10-15 Asia/Shanghai) covers TM stage-index 500, missing bound publisher heartbeats and owner PDF upload recovery, plus a separate author-only correction to the Oct15 released Nature paper.

The separate author-only correction PR #690 passed all 5 workflows including the Site quality gate and merged to main at `4c4a78f42078806b87997fb7ff6a3d020dd3da09`. It strictly attests the original 08:00 release marker blob `cd56d8ecbda84df374603d1e8b455160ab8921a5` unchanged and the one correctly publisher-evidenced six-author DOI `10.1038/s41586-026-11242-8` in original fixed `public/rolling-supplement.json` blob `28f3238f45b380855f68fc7ab79da03ba4c9f181`. No DOI/date/count changed and no new release window.

This audit-only file requests new CI for PR #684 against **current corrected main**. PR #684 production code is unchanged by this note. Merge the TM change only if fresh source/scope checks pass, then verify independent Pages/Worker live deployment and both script endpoints. Do not treat CI alone as evidence of actual browser capture or PDF retrieval.
