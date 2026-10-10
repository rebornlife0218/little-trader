#!/usr/bin/env bash
# 把 web/data/<資料集>/ 發佈到 data 分支(只保留最新一份、單一 commit，避免 repo 越來越大)
# 其他資料集的檔案原封不動，因此各資料集可以各自排程、同時更新：
# 推送時用 --force-with-lease 確認 data 分支沒被別的資料集搶先更新，若有就重新取回再試。
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

for attempt in 1 2 3 4 5; do
  # 取回目前 data 分支(第一次執行時還不存在)
  rm -rf ./* && git read-tree --empty
  BASE=""
  if git fetch -q --depth=1 origin data 2>/dev/null; then
    BASE="$(git rev-parse FETCH_HEAD)"
    git checkout -q FETCH_HEAD -- . 2>/dev/null || true
  fi
  rm -rf "$DS" && mkdir -p "$DS" && cp -r "$SRC"/. "$DS"/
  git add -A
  TREE="$(git write-tree)"
  COMMIT="$(git commit-tree "$TREE" -m "data: $DS $(date -u +%Y-%m-%dT%H:%MZ)")"
  if git push -q origin "$COMMIT:refs/heads/data" --force-with-lease="refs/heads/data:${BASE}"; then
    echo "已發佈 $DS 到 data 分支"
    exit 0
  fi
  echo "data 分支剛被其他資料集更新，重試($attempt/5)…"
  sleep $((attempt * 5))
done
echo "發佈失敗"; exit 1
