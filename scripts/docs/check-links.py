#!/usr/bin/env python3
"""Check repository Markdown links and references to retired documentation paths."""

import html
import re
import subprocess
from pathlib import Path
from urllib.parse import unquote, urlsplit


ROOT = Path(__file__).resolve().parents[2]
FENCE = re.compile(r"^\s*(`{3,}|~{3,})")
MOVED_FLAT_NAMES = (
    'bitcoin-zaps-nwc',
    'chat-composer-attachments',
    'cloudflare-tunnel',
    'content-migration-plan',
    'conventions',
    'data-system',
    'direct-messages',
    'discord-emoji-export',
    'dm-metadata-privacy',
    'games',
    'i18n',
    'i18n-plan',
    'known-bugs',
    'media-packs',
    'mobile-navigation',
    'nostr-wot-sdk-fork',
    'onboarding',
    'read-state',
    'relay-layout-and-branding',
    'relay-roles',
    'search',
    'server-banner',
    'sfu-known-bugs',
    'sfu-system',
    'social-feeds',
    'static-public-pages',
    'tor-desktop-node',
    'uploads',
    'wot-and-invite-credits',
    'wot-integration-plan',
)
STALE = re.compile(
    r"\bdocs/(?:" + "|".join(MOVED_FLAT_NAMES) + r")\.md\b|\bdocs/(?:voice|audits|superpowers|qa|screenshots)/[^\s`\"'<>)]*"
)


def tracked_files():
    result = subprocess.check_output(
        ["git", "ls-files", "--cached", "--others", "--exclude-standard", "-z"], cwd=ROOT
    )
    return sorted({ROOT / name for name in result.decode().split("\0") if name})


def prose_lines(text):
    fence = None
    for number, line in enumerate(text.splitlines(), 1):
        match = FENCE.match(line)
        if match:
            marker = match.group(1)[0]
            if fence is None:
                fence = marker
            elif marker == fence:
                fence = None
            continue
        if fence is None:
            yield number, line


def destinations(line):
    """Read inline destinations with balanced parentheses, plus reference definitions."""
    offset = 0
    while True:
        start = line.find("](", offset)
        if start < 0:
            break
        start += 2
        depth, end = 1, start
        while end < len(line) and depth:
            if line[end] == "\\":
                end += 2
                continue
            if line[end] == "(":
                depth += 1
            elif line[end] == ")":
                depth -= 1
            end += 1
        if depth:
            break
        value = line[start:end - 1].strip()
        if value.startswith("<"):
            value = value[1:value.find(">")]
        else:
            value = re.split(r'\s+[\"\']', value, maxsplit=1)[0]
        yield value
        offset = end
    reference = re.match(r"^\s*\[[^\]]+\]:\s*(<[^>]+>|\S+)", line)
    if reference:
        yield reference.group(1).strip("<>")


def anchors(path):
    text = path.read_text()
    found = set(re.findall(r'\b(?:id|name)=[\"\']([^\"\']+)[\"\']', text))
    counts = {}
    for _, line in prose_lines(text):
        match = re.match(r"^#{1,6}\s+(.+?)(?:\s+#+)?$", line)
        if not match:
            continue
        heading = re.sub(r"<[^>]+>", "", html.unescape(match.group(1)))
        heading = re.sub(r"\[([^]]+)\]\([^)]*\)", r"\1", heading)
        slug = re.sub(r"[^\w\- ]", "", heading.lower()).replace(" ", "-")
        duplicate = counts.get(slug, 0)
        counts[slug] = duplicate + 1
        found.add(slug if not duplicate else f"{slug}-{duplicate}")
    return found


def main():
    failures, count, documents = [], 0, 0
    anchor_cache = {}
    for path in tracked_files():
        if not path.is_file():
            continue
        try:
            text = path.read_text()
        except (UnicodeDecodeError, OSError):
            continue
        relative = path.relative_to(ROOT)
        if path != Path(__file__).resolve():
            for number, line in enumerate(text.splitlines(), 1):
                for match in STALE.finditer(line):
                    failures.append(f"{relative}:{number}: retired documentation path {match.group(0)}")
        if path.suffix != ".md":
            continue
        documents += 1
        for number, line in prose_lines(text):
            for destination in destinations(line):
                parsed = urlsplit(destination)
                if parsed.scheme or parsed.netloc or parsed.path.startswith("/"):
                    continue
                target = (path.parent / unquote(parsed.path)).resolve() if parsed.path else path
                count += 1
                if not target.exists():
                    failures.append(f"{relative}:{number}: missing target {destination}")
                elif parsed.fragment and target.suffix == ".md":
                    if target not in anchor_cache:
                        anchor_cache[target] = anchors(target)
                    if unquote(parsed.fragment) not in anchor_cache[target]:
                        failures.append(f"{relative}:{number}: missing heading {destination}")
    if failures:
        print("\n".join(failures))
        print(f"FAILED: {len(failures)} issues across {documents} Markdown files and {count} local links.")
        return 1
    print(f"PASS: {documents} Markdown files, {count} local links; no retired documentation paths in tracked text.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
