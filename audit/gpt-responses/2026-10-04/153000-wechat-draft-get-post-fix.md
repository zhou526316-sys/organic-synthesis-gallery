Beijing time: 2026-10-04
Context: draft/update succeeded, then draft/get failed with WeChat errcode 43002 "require POST method".

Fix:
- Commit 809f662a7b4026f118f64e921cdfc8dc6eec2ece
- /cgi-bin/draft/get now uses POST.
- access_token remains in query string.
- media_id is sent in JSON request body.

Consequence:
- The user's real WeChat draft was already updated before the readback failure.
- Re-running the same publisher command is safe; cached body image uploads and cover media are reused where applicable.
- On success, the script will read back the stored WeChat draft and emit preview_url.
