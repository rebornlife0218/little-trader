"""
本機資料集(股價來自本機 PostgreSQL，GitHub Actions 連不到)：Windows 工作排程器「LittleTrader_local」以 pythonw.exe 執行
  等 cm 同步(工作排程器 CM_PostgreSQL_Sync)跑完 → 各資料集 update.py → 發佈到 data 分支 → 觸發一次重新部署；
  股票查詢的資料(price_query)直接同步到 Cloudflare D1
用法：python pipeline/run_local.py [資料集 ...]   (預設全部本機資料集)；記錄寫在 ~/.cache/little-trader/local.log
需要：本機 PostgreSQL 與 pgpass.conf、gh 已登入(gh auth login)

不用 Git Bash：電腦在新式待命(睡眠)時由排程喚醒執行，msys 的 bash.exe 會啟動失敗(0xC0000142)，
所以發佈的步驟(同 publish_data.sh)也改用 Python 直接呼叫 git.exe。
"""
import base64
import logging
import os
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
REPO = 'rebornlife0218/little-trader'
DATASETS = ['tw_strategy', 'disposition', 'etf_compare', 'price_query']
# price_query 不發佈到 data 分支：pipeline/price_query/sync.py 直接寫進 Cloudflare D1(股票查詢頁)；
# wrangler.toml 還沒填 D1 的 database_id(尚未建立資料庫)時略過
LOG = Path.home() / '.cache' / 'little-trader' / 'local.log'
NO_WINDOW = getattr(subprocess, 'CREATE_NO_WINDOW', 0)
log = logging.getLogger('run_local')


def run(cmd, cwd=None, env=None, check=True):
    p = subprocess.run(cmd, cwd=cwd, env=env, capture_output=True, text=True, encoding='utf-8', errors='replace',
                       creationflags=NO_WINDOW)
    out = (p.stdout + p.stderr).strip()
    if check and p.returncode:
        raise RuntimeError(f'{cmd[0]} {cmd[1] if len(cmd) > 1 else ""} 失敗({p.returncode})：{out[-1000:]}')
    return p.returncode, out


TOAST = r"""
[void][Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime]
[void][Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime]
$e = { param($s) [Security.SecurityElement]::Escape($s) }
$x = New-Object Windows.Data.Xml.Dom.XmlDocument
$x.LoadXml("<toast><visual><binding template='ToastGeneric'><text>$(& $e $env:LT_TITLE)</text><text>$(& $e $env:LT_MSG)</text></binding></visual></toast>")
$app = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\WindowsPowerShell\v1.0\powershell.exe'
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($app).Show([Windows.UI.Notifications.ToastNotification]::new($x))
"""


def notify(msg):
    """失敗時跳出 Windows 通知(睡眠中錯過的會留在通知中心)；電腦沒開時由 GitHub 的「本機排程檢查」寄信"""
    env = {**os.environ, 'LT_TITLE': 'Little Trader 本機排程失敗', 'LT_MSG': f'{msg}\n記錄：{LOG}'}
    code, out = run(['powershell', '-NoProfile', '-NonInteractive', '-Command', TOAST], env=env, check=False)
    if code:
        log.warning('Windows 通知失敗：%s', out[-300:])


def wait_cm_sync(max_min=60):
    """cm 同步還在跑就等它，避免讀到一半的資料"""
    for i in range(max_min * 2):
        _, st = run(['powershell', '-NoProfile', '-Command', '(Get-ScheduledTask CM_PostgreSQL_Sync).State'], check=False)
        if st.strip() != 'Running':
            return
        if i == 0:
            log.info('cm 同步中，等待…')
        time.sleep(30)


def publish(ds, token):
    """把 web/data/<ds>/ 發佈到 data 分支(只替換該資料夾、單一 commit)，邏輯同 publish_data.sh"""
    src = ROOT / 'web' / 'data' / ds
    if not (src / 'meta.json').exists():
        raise RuntimeError(f'找不到 {src}/meta.json')
    work = Path(tempfile.mkdtemp(prefix='lt-publish-'))
    try:
        git = lambda *a, check=True: run(['git', '-C', str(work), *a], check=check)  # noqa: E731
        git('init', '-q', '-b', 'data')
        git('config', 'user.name', 'github-actions[bot]')
        git('config', 'user.email', '41898283+github-actions[bot]@users.noreply.github.com')
        git('remote', 'add', 'origin', f'https://github.com/{REPO}.git')
        # token 用 header 傳(同 actions/checkout)，不寫進網址，出錯時才不會印進記錄
        auth = ['-c', 'http.extraheader=AUTHORIZATION: basic ' + base64.b64encode(f'x-access-token:{token}'.encode()).decode()]
        for attempt in range(1, 6):
            for p in work.iterdir():
                if p.name != '.git':
                    shutil.rmtree(p) if p.is_dir() else p.unlink()
            git('read-tree', '--empty')
            base = ''
            if git(*auth, 'fetch', '-q', '--depth=1', 'origin', 'data', check=False)[0] == 0:
                base = git('rev-parse', 'FETCH_HEAD')[1]
                git('checkout', '-q', 'FETCH_HEAD', '--', '.', check=False)
            shutil.rmtree(work / ds, ignore_errors=True)
            shutil.copytree(src, work / ds)
            git('add', '-A')
            tree = git('write-tree')[1]
            commit = git('commit-tree', tree, '-m', f'data: {ds} {time.strftime("%Y-%m-%dT%H:%MZ", time.gmtime())}')[1]
            if git(*auth, 'push', '-q', 'origin', f'{commit}:refs/heads/data', f'--force-with-lease=refs/heads/data:{base}', check=False)[0] == 0:
                log.info('已發佈 %s 到 data 分支', ds)
                return
            log.info('data 分支剛被其他資料集更新，重試(%d/5)…', attempt)
            time.sleep(attempt * 5)
        raise RuntimeError('發佈失敗')
    finally:
        shutil.rmtree(work, ignore_errors=True)


def main():
    LOG.parent.mkdir(parents=True, exist_ok=True)
    handlers = [logging.FileHandler(LOG, encoding='utf-8')]
    if sys.stdout is not None:      # pythonw 沒有 stdout
        handlers.append(logging.StreamHandler(sys.stdout))
    logging.basicConfig(level=logging.INFO, format='%(asctime)s %(message)s', handlers=handlers)
    datasets = sys.argv[1:] or DATASETS
    log.info('開始：%s', '、'.join(datasets))
    python = str(Path(sys.executable).with_name('python.exe'))    # 用 pythonw 啟動時，子程序改用 python.exe
    env = {**os.environ, 'PYTHONIOENCODING': 'utf-8'}
    failed, published = [], 0
    try:
        wait_cm_sync()
        token = run(['gh', 'auth', 'token'])[1]
        for ds in datasets:
            if ds == 'price_query':
                if '00000000-0000-0000-0000-000000000000' in (ROOT / 'wrangler.toml').read_text(encoding='utf-8'):
                    log.info('price_query：D1 尚未建立，略過')
                    continue
                try:
                    log.info('price_query：\n%s', run([python, str(ROOT / 'pipeline' / 'price_query' / 'sync.py')], cwd=ROOT, env=env)[1])
                except Exception as e:  # noqa: BLE001
                    log.error('price_query 失敗：%s', e)
                    failed.append(ds)
                continue
            try:
                out = run([python, str(ROOT / 'pipeline' / ds / 'update.py')], cwd=ROOT, env=env)[1]
                log.info('%s：\n%s', ds, out)
                publish(ds, token)
                published += 1
            except Exception as e:  # noqa: BLE001
                log.error('%s 失敗：%s', ds, e)
                failed.append(ds)
        if published:
            run(['gh', 'workflow', 'run', 'deploy.yml', '--ref', 'main', '--repo', REPO])
            log.info('已觸發重新部署')
    except Exception as e:  # noqa: BLE001
        log.exception('執行失敗')
        notify(f'執行失敗：{str(e)[:150]}')
        sys.exit(1)
    if failed:
        log.error('失敗：%s', '、'.join(failed))
        notify(f'更新失敗：{"、".join(failed)}')
        sys.exit(1)
    log.info('完成')


if __name__ == '__main__':
    main()
