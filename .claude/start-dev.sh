#!/bin/bash
export PATH="/Users/agustinkassis/.nvm/versions/node/v20.13.1/bin:$PATH"
cd "$(dirname "$0")/.."
exec npx next dev
