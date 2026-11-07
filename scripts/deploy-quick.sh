#!/usr/bin/env bash
# Pull latest code and deploy production without running tests.
set -euo pipefail

export SKIP_TESTS=1
exec "$(dirname "$0")/deploy.sh" --pull
