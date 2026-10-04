Beijing time: 2026-10-04
Context: WeChat V2 draft update failed while uploading featured paper Figure 2: errcode 40137 invalid image format.

Diagnosis:
- Draft permissions are already confirmed and this failure is isolated to article-body image upload.
- Figure 1 had already passed, Figure 2 was rejected by WeChat's media/uploadimg endpoint.
- Previous downloader trusted the publisher URL/extension and uploaded returned bytes directly.
- Publisher/CDN content negotiation can return an encoding WeChat does not accept even when the URL ends in .png, or an HTML/error response can be mislabeled locally.

Fix committed:
- ff4f5cecef28b4d607e3f3bf01de5ac5b3083e2c
- Force Accept toward PNG/JPEG/GIF instead of AVIF/WebP.
- Reject HTML responses.
- Decode each source image with Pillow.
- Preserve original pixel dimensions.
- Flatten transparency onto white only when needed.
- Re-encode the exact pixels as a standards-compliant RGB PNG.
- Do not redraw or regenerate any chemical structure.
- uploadimg then receives a real .png with image/png MIME.

User-visible next step:
cd "$HOME/organic-synthesis-gallery-publisher"
git pull --ff-only

sudo python3 ops/wechat-publisher/create-draft.py \
  --create \
  --media-id "KhELYUzvwADwB_l1xH1SWKHHML8o7gycWcX1eke97rsdw2z3a5LAHMN5GiO54hUP"

No need to rerun enable-draft-preview.sh if it already succeeded.
If the next error says a figure returned HTML instead of an image, then the publisher URL itself is not directly fetchable on the server and the fallback should switch to rendering that figure from the uploaded paper PDF, not inventing/recreating it.
