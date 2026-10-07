Beijing time: 2026-10-07
Context: long Gallery architecture boundedness audit — public media inventory

Public inventory previously used all in-memory paper DOIs and did not set readOnly, so ordinary Gallery visits could scale with the Hot corpus and indirectly create media repair rows.

Fixed:
- inventory source is now only rendered #gallery TOC slots;
- bounded by the desktop result-window maximum (24; mobile naturally has 2);
- public request sets readOnly:true;
- Worker requires write authorization for any non-read-only inventory call.

No Tampermonkey acquisition or promotion authority changed.
