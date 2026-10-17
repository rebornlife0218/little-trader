#!/usr/bin/env bash
# 本機資料集(股價來自本機 PostgreSQL，GitHub Actions 連不到)：Windows 工作排程器「LittleTrader_local」以 Git Bash 執行
#   等 cm 同步(工作排程器 CM_PostgreSQL_Sync)跑完 → 各資料集 update.py → 發佈到 data 分支 → 觸發一次 GitHub Pages 重新部署
# 用法：bash pipeline/run_local.sh [資料集 ...]   (預設全部本機資料集)
# 需要：本機 PostgreSQL 與 pgpass.conf、gh 已登入(gh auth login)
set -uo pipefail
cd "$(dirname "$0")/.."
export PYTHONIOENCODING=utf-8
REPO=rebornlife0218/little-trader
[ $# -eq 0 ] && set -- tw_strategy disposition

# cm 同步還在跑就等它(最多 1 小時)，避免讀到一半的資料
for i in $(seq 120); do
  st=$(powershell -NoProfile -Command "(Get-ScheduledTask CM_PostgreSQL_Sync).State" 2>/dev/null | tr -d '\r')
  [ "$st" = "Running" ] || break
  [ "$i" -eq 1 ] && echo "cm 同步中，等待…"
  sleep 30
done

failed=() published=0
export GITHUB_TOKEN GITHUB_REPOSITORY=$REPO
GITHUB_TOKEN="$(gh auth token)"
for ds in "$@"; do
  echo "== $ds"
  if python "pipeline/$ds/update.py" && bash pipeline/publish_data.sh "$ds"; then
    published=$((published + 1))
  else
    failed+=("$ds")
  fi
done
if [ "$published" -gt 0 ]; then
  gh workflow run deploy.yml --ref main --repo "$REPO" && echo "已觸發重新部署"
fi
if [ ${#failed[@]} -gt 0 ]; then
  echo "失敗：${failed[*]}"
  exit 1
fi
