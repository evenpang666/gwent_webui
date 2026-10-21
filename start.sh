#!/usr/bin/env sh
set -eu
GWENT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
if ! command -v node >/dev/null 2>&1; then
  printf '%s\n' '需要 Node.js 18 或更新版本。安装后重新执行：sh start.sh'
  exit 1
fi
if ! node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 18 ? 0 : 1)'; then
  printf '%s\n' 'Node.js 版本过旧，请升级到 18 或更新版本。'
  exit 1
fi
exec node "$GWENT_DIR/server.cjs" --open
