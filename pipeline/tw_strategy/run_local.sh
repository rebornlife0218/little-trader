#!/usr/bin/env bash
# 本機排程用(Windows 工作排程器「LittleTrader_tw_strategy」以 Git Bash 執行)：
#   更新 tw_strategy(查本機 PostgreSQL) → 發佈到 data 分支 → 觸發 GitHub Pages 重新部署
# 需要：本機 PostgreSQL 與 pgpass.conf、gh 已登入(gh auth login)
set -euo pipefail
cd "$(dirname "$0")/../.."
export PYTHONIOENCODING=utf-8
python pipeline/tw_strategy/update.py
GITHUB_TOKEN="$(gh auth token)" GITHUB_REPOSITORY=rebornlife0218/little-trader bash pipeline/publish_data.sh tw_strategy
gh workflow run deploy.yml --ref main --repo rebornlife0218/little-trader
echo "已觸發重新部署"
