#!/usr/bin/env bash
# Reject raw control bytes in tracked source and text files.
#
# A NUL byte inside src/utils/message-text/mentions.ts once made grep, ripgrep and git diff
# treat the file as binary, which hid every export in it from repo-wide
# search for weeks. .gitattributes cannot prevent that (grep never reads it),
# so this is the gate: any byte in 0x00-0x08, 0x0B, 0x0C, 0x0E-0x1F or 0x7F
# in a tracked text file fails the run and names the file, line and byte.
# Tab, LF and CR are allowed.
#
#   bash scripts/check-source-bytes.sh          # exit 0 when clean
#
# Runs in CI (.github/workflows/ci.yml) before lint.

set -euo pipefail

cd "$(dirname "$0")/.."

# Tracked files only, NUL-separated so odd file names survive. Perl does the
# scan: it is on every GitHub runner and every developer machine, and unlike
# grep -P it behaves the same on macOS and Linux.
git ls-files -z | perl -0 -ne '
  chomp;
  next unless /\.(ts|tsx|js|mjs|cjs|json|md|mdx|css|sh|yml|yaml|html|svg|txt|example)$/;
  open(my $fh, "<:raw", $_) or next;
  local $/;
  my $data = <$fh>;
  close $fh;
  while ($data =~ /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g) {
    my $pos = $-[0];
    my $line = 1 + (substr($data, 0, $pos) =~ tr/\n//);
    printf "%s:%d: raw control byte 0x%02x\n", $_, $line, ord(substr($data, $pos, 1));
    $bad = 1;
    last;
  }
  END { exit($bad ? 1 : 0) }
' && echo "check-source-bytes: clean"
