#!/usr/bin/env bash
# 把 web/data/<資料集>/ 發佈到 data 分支(只保留最新一份、單一 commit，避免 repo 越來越大)
# 其他資料集的檔案原封不動，因此各資料集可以各自排程更新。
# 用法(在 GitHub Actions 內)：bash pipeline/publish_data.sh <資料集名稱>
set -euo pipefail
DS="$1"
SRC="$(pwd)/web/data/$DS"
[ -f "$SRC/meta.json" ] || { echo "找不到 $SRC/meta.json"; exit 1; }

WORK="$(mktemp -d)"
cd "$WORK"
git init -q -b data
git config user.name "github-actions[bot]"
git config user.email "41898283+github-actions[bot]@users.noreply.github.com"
git remote add origin "https://x-access-token:${GITHUB_TOKEN}@github.com/${GITHUB_REPOSITORY}.git"

# 取回目前 data 分支(第一次執行時還不存在)
if git fetch -q --depth=1 origin data 2>/dev/null; then
  git checkout -q FETCH_HEAD -- . 2>/dev/null || true
fi

rm -rf "$DS"
mkdir -p "$DS"
cp -r "$SRC"/. "$DS"/
git add -A
git commit -q -m "data: $DS $(date -u +%Y-%m-%dT%H:%MZ)"
git push -q -f origin HEAD:data
echo "已發佈 $DS 到 data 分支"
