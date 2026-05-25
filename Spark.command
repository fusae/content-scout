#!/bin/bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$APP_DIR"

if ! command -v node >/dev/null 2>&1; then
  osascript -e 'display dialog "未检测到 Node.js。请先安装 Node.js LTS 后再打开 Spark。" buttons {"知道了"} default button 1 with icon caution'
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  osascript -e 'display dialog "未检测到 npm。请确认 Node.js 已正确安装。" buttons {"知道了"} default button 1 with icon caution'
  exit 1
fi

if [ ! -d "$APP_DIR/node_modules" ]; then
  osascript -e 'display notification "首次启动需要安装依赖，可能需要几分钟。" with title "Spark"'
  npm install
fi

npm run desktop
