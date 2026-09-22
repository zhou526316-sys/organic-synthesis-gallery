# Original reading-status images (feedback 28A)

Reading-status uploads default to an uncropped original image. Supported formats
are PNG, JPEG, WebP and GIF, validated against the file signature. The original
limit is 30,000,000 bytes (30 MB). Images are fitted proportionally into the status
button/label and can be viewed in a bounded dialog. Existing color controls remain;
removing an image restores the normal text/shape rendering.

## Storage and synchronization boundary

Original bytes and MIME type are stored in IndexedDB in the current browser and
site origin, keyed by SHA-256. Preferences include only a small PNG preview and
file metadata. Transient blob URLs are never serialized. A new browser/origin with
synchronized preferences displays the preview, not the original; GIF previews are
static. Clearing site data or browser eviction may remove the original. This is
not cloud backup or cross-device original/GIF synchronization. Retain the source file.

An optional static-crop checkbox keeps the existing crop tool (20 MB input limit).
That mode intentionally produces a static cropped preview; it does not preserve
GIF animation. Original uploads bypass the crop tool unless explicitly selected.

## Failure handling

A replacement is published into preferences only after its original has been
stored. Preference-storage failure restores the old image fields. Replacing or
removing the status during an in-flight upload prevents stale completion from
restoring an older image. Unsupported, oversized or undecodable files leave the
previous status unchanged and display an error. No originals are sent to a server.

Removal unlinks the image from preferences; this first batch does not garbage-
collect unreferenced originals. Existing originals remain origin-private.

## Verification

New browser tests check original hashes, animated frame changes, reload, preview
fallback in a separate context, file-size boundaries and storage/cancellation
failures. Legacy crop tests explicitly opt into static cropping rather than
removing their previous assertions. Live deployment acceptance is separate from
these isolated tests. The permanent CI is status-original-images-ci.yml.
