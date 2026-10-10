#!/usr/bin/env python3
"""Bounded Nginx parent include patch for the independent PDF gateway.

Only add/remove an exact, marked include in nginx.conf when the existing main
configuration directly includes the unchanged osg-wechat-relay site. Do not
edit the relay site, do not print main config content, and back up first.
"""
import os
import re
import shutil
import stat
import sys
import tempfile
from pathlib import Path

MAIN = Path("/etc/nginx/nginx.conf")
BACKUP_DIR = Path("/var/backups/gallery-pdf-gateway")
RELAY_INCLUDE = b"/etc/nginx/sites-enabled/osg-wechat-relay"
PDF_INCLUDE = b"/etc/nginx/sites-enabled/gallery-pdf-gateway"
MARKER = b"GALLERY_PDF_GATEWAY_INCLUDE_MANAGED_V1"


def _line_regex(target):
    return re.compile(rb"^([ \t]*)include[ \t]+" + re.escape(target) +
                      rb"[ \t]*;[ \t]*(?:#[^\r\n]*)?$")


def _nl(line):
    return b"\r\n" if line.endswith(b"\r\n") else b"\n"


def add_include(raw, relay=RELAY_INCLUDE, pdf=PDF_INCLUDE):
    """Return an additive parent config edit, or raise before changing bytes."""
    lines = raw.splitlines(keepends=True)
    if any(MARKER in line for line in lines):
        raise ValueError("Managed PDF include already exists; manual state review required")
    if any(_line_regex(pdf).fullmatch(line.rstrip(b"\r\n")) for line in lines):
        raise ValueError("Unmanaged PDF include already exists; refuse duplicate")
    # Explicit-only relay deployments commonly use an absolute or /etc/nginx-
    # relative path. Never modify an unrecognized parent include.
    names = [relay]
    if relay.startswith(b"/etc/nginx/"):
        names.append(relay[len(b"/etc/nginx/"):])
    matches = []
    for idx, line in enumerate(lines):
        for target in names:
            match = _line_regex(target).fullmatch(line.rstrip(b"\r\n"))
            if match:
                matches.append((idx, match.group(1)))
                break
    if len(matches) != 1:
        raise ValueError(
            "Expected exactly one explicit relay include in main nginx.conf; "
            "refuse automated parent edit"
        )
    idx, indent = matches[0]
    anchor = lines[idx]
    suffix = b"" if anchor.endswith(b"\n") else b"\n"
    managed = indent + b"include " + pdf + b"; # " + MARKER + _nl(anchor)
    lines[idx] = anchor + suffix
    lines.insert(idx + 1, managed)
    return b"".join(lines)


def remove_include(raw, pdf=PDF_INCLUDE):
    """Remove only our exactly marked line, preserving unrelated config bytes."""
    lines = raw.splitlines(keepends=True)
    managed = _line_regex(pdf + b"; # " + MARKER)
    # _line_regex builds an include directive; special-case the marker below.
    regex = re.compile(rb"^[ \t]*include[ \t]+" + re.escape(pdf) +
                       rb"[ \t]*;[ \t]*#[ \t]*" + MARKER + rb"[ \t]*$")
    matches = [i for i, line in enumerate(lines)
               if regex.fullmatch(line.rstrip(b"\r\n"))]
    if len(matches) > 1:
        raise ValueError("Ambiguous duplicated managed include")
    if not matches:
        if MARKER in raw:
            raise ValueError("Modified/unrecognized managed include; refusing removal")
        return raw, False
    idx = matches[0]
    del lines[idx]
    return b"".join(lines), True


def replace_atomic(path, previous, updated):
    if path.is_symlink() or not path.is_file():
        raise ValueError("Main nginx.conf is missing or symlinked; refuse edit")
    meta = path.stat()
    fd, tmp = tempfile.mkstemp(prefix=".gallery-pdf-parent-", dir=str(path.parent))
    try:
        os.fchmod(fd, stat.S_IMODE(meta.st_mode))
        os.fchown(fd, meta.st_uid, meta.st_gid)
        with os.fdopen(fd, "wb") as out:
            out.write(updated)
            out.flush()
            os.fsync(out.fileno())
        if path.read_bytes() != previous:
            raise ValueError("Concurrent nginx.conf change; refuse overwrite")
        os.replace(tmp, path)
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)


def backup_main(path, data):
    BACKUP_DIR.mkdir(mode=0o700, parents=True, exist_ok=True)
    fd, name = tempfile.mkstemp(prefix="nginx.main.before.", suffix=".bak",
                                dir=str(BACKUP_DIR))
    try:
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, "wb") as output:
            output.write(data)
            output.flush()
            os.fsync(output.fileno())
    except BaseException:
        os.unlink(name)
        raise
    return name


def main(argv):
    if len(argv) != 2 or argv[1] not in {"apply", "remove", "status"}:
        raise ValueError("Usage: nginx_include.py [apply|remove|status]")
    mode = argv[1]
    if os.geteuid() != 0:
        raise ValueError("Root-only helper")
    current = MAIN.read_bytes()
    if mode == "status":
        _, changed = remove_include(current)
        print("[CHECK] Managed parent PDF include " +
              ("present" if changed else "absent"))
        return
    if mode == "apply":
        updated = add_include(current)
        backup_main(MAIN, current)
        replace_atomic(MAIN, current, updated)
        print("[CHECK] Added single managed PDF include beside existing relay include.")
    else:
        updated, found = remove_include(current)
        if not found:
            print("[CHECK] No managed parent PDF include to remove.")
            return
        backup_main(MAIN, current)
        replace_atomic(MAIN, current, updated)
        print("[CHECK] Removed only marked PDF include from main nginx.conf.")


if __name__ == "__main__":
    try:
        main(sys.argv)
    except (OSError, ValueError) as exc:
        print("[STOP] Safe parent nginx include: " + str(exc), file=sys.stderr)
        sys.exit(1)
