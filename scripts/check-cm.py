"""這台電腦上傳到 Seeking_Alpha 的資料有沒有停更(.github/workflows/check-local.yml 每天呼叫)
排程沒跑(電腦沒開、沒登入)時本機通知也不會跳，所以從 GitHub 這邊看每日檔最新到哪一天：
最新一天到今天之間，隔超過 MAX_MISSED 個平日沒資料就失敗 → GitHub 寄信。
只看檔名，不下載內容。農曆年長假時台股會誤報。
用法：SEEKING_ALPHA_DEPLOY_KEY=... python3 scripts/check-cm.py；或 CM_DIR=<本機工作目錄> 直接看該目錄
"""
import os
import re
import subprocess
import sys
import tempfile
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

REPO_URL = 'ssh://git@ssh.github.com:443/rebornlife0218/Seeking_Alpha.git'
FEEDS = {'台股': 'CM/台股/Daily/daily', '美股': 'CM/美股/Daily/daily', '國際指數': 'CM/國際指數/Daily/daily'}
MAX_MISSED = 2   # 週五、週一連休最多少兩天(例如 2026-10-23、10-26)
LS_TREE = ['-c', 'core.quotepath=false', 'ls-tree', '-r', '--name-only', 'HEAD']


def weekdays_between(last, today):
    """last 與 today 之間(不含兩端)有幾個平日"""
    days = (last + timedelta(days=i) for i in range(1, (today - last).days))
    return sum(d.weekday() < 5 for d in days)


def list_files():
    """回傳 repo 的所有檔名；私鑰只暫存到下載完，不會出現在指令或 log"""
    if os.environ.get('CM_DIR'):
        return subprocess.run(['git', '-C', os.environ['CM_DIR'], *LS_TREE], check=True, capture_output=True,
                              text=True, encoding='utf-8').stdout.splitlines()
    with tempfile.TemporaryDirectory(prefix='sa_') as d:
        key = Path(d) / 'id'
        key.write_text(os.environ['SEEKING_ALPHA_DEPLOY_KEY'].strip() + '\n', encoding='ascii', newline='\n')
        key.chmod(0o600)
        env = dict(os.environ, GIT_TERMINAL_PROMPT='0',
                   GIT_SSH_COMMAND=f'ssh -i "{key.as_posix()}" -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new')
        repo = str(Path(d) / 'r')
        subprocess.run(['git', 'clone', '-q', '--depth=1', '--filter=blob:none', '--no-checkout', REPO_URL, repo],
                       check=True, env=env, capture_output=True)
        return subprocess.run(['git', '-C', repo, *LS_TREE], check=True, env=env, capture_output=True,
                              text=True, encoding='utf-8').stdout.splitlines()


def main():
    today = datetime.now(timezone(timedelta(hours=8))).date()
    files = list_files()
    problems = []
    lines = ['### 上傳資料檢查', '', '| 資料 | 最新一天 | 少了幾個平日 |', '|---|---|---|']
    for name, folder in FEEDS.items():
        days = [m[1] for f in files if f.startswith(folder + '/') and (m := re.search(r'/(\d{8})\.parquet$', f))]
        if not days:
            problems.append(f'{name}：找不到每日檔')
            continue
        last = max(days)
        missed = weekdays_between(date(int(last[:4]), int(last[4:6]), int(last[6:])), today)
        lines.append(f'| {name} | {last} | {missed} |')
        if missed > MAX_MISSED:
            problems.append(f'{name}：最新只到 {last}，已少 {missed} 個平日，請檢查上傳資料的電腦是否開機、排程是否正常')
    print('\n'.join(lines))
    if os.environ.get('GITHUB_STEP_SUMMARY'):
        with open(os.environ['GITHUB_STEP_SUMMARY'], 'a', encoding='utf-8') as f:
            f.write('\n'.join(lines) + '\n')
    for p in problems:
        print(f'::error::{p}')
    return 1 if problems else 0


if __name__ == '__main__':
    sys.exit(main())
