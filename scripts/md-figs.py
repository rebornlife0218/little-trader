"""
研究報告 Markdown 的圖：把網頁畫好的圖截成 PNG，放在報告旁邊的 <報告>/ 資料夾，VS Code、GitHub 預覽 md 時就看得到圖。
PNG 只留在本機(.gitignore)，網頁不用：報告裡的 ![說明](<報告>/xxx.png) 由網頁依 JSON 重畫(只看檔名)。

用法：
  python scripts/md-figs.py                     全部報告
  python scripts/md-figs.py rev_drop gap        指定報告(md 檔名，不含 .md)
  --local   優先用本機 web/data(剛跑過 pipeline、還沒發佈時)；預設用 data 分支上已發佈的資料(和網站一樣)，下載不到才用本機
  --light   淺色主題(預設深色)
研究資料或報告文字更新後重跑即可(同名檔覆蓋，報告不再用到的圖會刪掉)。

不啟動伺服器：Playwright 攔截所有請求，網頁檔讀 web/，api/me 回會員(才看得到完整報告)，資料讀 data 分支或本機。
有密碼的研究(處置股策略)從本機 private_strategies.py 讀密碼放進瀏覽器的 sessionStorage，網頁自己解密；密碼不寫進任何檔案、不印出來。
新增研究報告時，在 REPORTS 加一筆(md 路徑 → 網頁網址)；tests/site.test.mjs 會檢查每份有圖的報告都列在這裡。
需要 Python 的 playwright(pip install playwright；python -m playwright install chromium)。
"""
import argparse
import json
import mimetypes
import re
import sys
import urllib.request
from pathlib import Path
from urllib.parse import unquote, urlparse

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
WEB = ROOT / 'web'
REPO = 'rebornlife0218/little-trader'
HOST = 'localhost:8799'                              # 只是網址，請求都被攔截；用 localhost 才是安全來源(網頁解密要用 crypto.subtle)
ORIGIN = f'http://{HOST}'
# 報告 md(相對 repo 根目錄) → 網頁上的網址
REPORTS = {
    'pipeline/index_research/reports/國安基金進場與限空令.md': 'index/crash/nsf',
    'pipeline/index_research/reports/大跌反彈和融資的關係.md': 'index/crash/margin',
    'pipeline/tw_research/reports/rev_pre.md': 'stock/tw-research/rev_pre',
    'pipeline/tw_research/reports/rev_growth.md': 'stock/tw-research/rev_growth',
    'pipeline/tw_research/reports/rev_drop.md': 'stock/tw-research/rev_drop',
    'pipeline/tw_research/reports/rev_turn.md': 'stock/tw-research/rev_turn',
    'pipeline/tw_gap/reports/gap.md': 'stock/tw-research/gap',
    'pipeline/tw_research/reports/disp_kbar.md': 'stock/disposition/kbar',
    'pipeline/tw_research/reports/disp.md': 'stock/disposition/strategy',
    'pipeline/etf_research/reports/etf_follow.md': 'etf/research/etf_follow',
}
LOCKED = {'stock/disposition/strategy': 'disp'}      # 完整報告要密碼的研究：網址 → RESEARCH_PASSWORDS 的鍵
PW_KEY = 'lt.twPw.'                                  # 網頁存密碼的 sessionStorage 鍵(tw-strategy.js 的 PW_KEY)
FIG = re.compile(r'^!\[[^\]]*\]\(([^()\s]+\.png)\)[ \t]*$', re.M)
MEMBER = {'kind': 'member', 'email': None, 'admin': False, 'memberSections': [], 'scripts': [], 'loginReady': False}


def passwords():
    sys.path.insert(0, str(ROOT / 'pipeline' / 'tw_strategy'))
    try:
        from private_strategies import RESEARCH_PASSWORDS
        return RESEARCH_PASSWORDS
    except ImportError:
        return {}


def main():
    ap = argparse.ArgumentParser(description='把網頁畫好的研究報告圖截成 PNG，給本機預覽 md 用')
    ap.add_argument('names', nargs='*', help='報告的 md 檔名(不含 .md)，省略時全部')
    ap.add_argument('--local', action='store_true', help='優先用本機 web/data')
    ap.add_argument('--light', action='store_true', help='淺色主題')
    a = ap.parse_args()
    todo = {Path(k): v for k, v in REPORTS.items() if not a.names or Path(k).stem in a.names}
    if a.names and len(todo) < len(set(a.names)):
        sys.exit(f"找不到報告：{', '.join(sorted(set(a.names) - {p.stem for p in todo}))}")

    cache = {}

    def data(rel):
        """data/<資料集>/<檔>：預設先下載 data 分支(和網站一樣)，--local 時先用本機"""
        if rel in cache:
            return cache[rel]
        local = WEB / 'data' / rel
        body = local.read_bytes() if a.local and local.is_file() else None
        if body is None:
            try:
                with urllib.request.urlopen(f'https://raw.githubusercontent.com/{REPO}/data/{rel}', timeout=30) as r:
                    body = r.read()
            except Exception:
                body = local.read_bytes() if local.is_file() else None
        cache[rel] = body
        return body

    def handle(route, req):
        u = urlparse(req.url)
        if u.netloc in ('fonts.googleapis.com', 'fonts.gstatic.com'):
            return route.continue_()
        if u.netloc != HOST:
            return route.abort()
        p = unquote(u.path).lstrip('/')
        if p == 'api/me':
            return route.fulfill(json=MEMBER)
        if p.startswith('api/'):
            return route.fulfill(status=204, body='')
        if p.startswith('data/'):
            body = data(p[len('data/'):])
            return route.fulfill(status=200, body=body, content_type='application/json') if body else route.fulfill(status=404, body='')
        f = WEB / p
        if p and f.is_file():
            return route.fulfill(body=f.read_bytes(), content_type=mimetypes.guess_type(f.name)[0] or 'application/octet-stream')
        return route.fulfill(body=(WEB / 'index.html').read_bytes(), content_type='text/html')   # 一般網址(stock/tw-research/…)都回首頁，由前端路由

    pw = passwords()
    total, problems = 0, []
    with sync_playwright() as p:
        browser = p.chromium.launch()
        for md, url in todo.items():
            refs = FIG.findall((ROOT / md).read_text(encoding='utf-8'))
            if not refs:
                continue
            out = (ROOT / md).parent / md.stem
            key = LOCKED.get(url)
            if key and not pw.get(key):
                problems.append(f'{md.name}：private_strategies.py 沒有密碼，跳過')
                continue
            ctx = browser.new_context(viewport={'width': 1100, 'height': 900}, bypass_csp=True)
            ctx.route('**/*', handle)
            ctx.add_init_script(f"try{{localStorage.setItem('lt.theme',{json.dumps('light' if a.light else 'dark')})}}catch(e){{}}")
            if key:
                ctx.add_init_script(f"try{{sessionStorage.setItem({json.dumps(PW_KEY + key)},{json.dumps(pw[key])})}}catch(e){{}}")
            pg = ctx.new_page()
            errs = []
            pg.on('pageerror', lambda e: errs.append(str(e)))
            pg.goto(f'{ORIGIN}/{url}')
            try:
                pg.wait_for_selector('.md-fig [data-fig]', timeout=60000)
            except Exception:
                problems.append(f'{md.name}：網頁上沒有出現報告的圖({url}){"；" + errs[0] if errs else ""}')
                ctx.close()
                continue
            pg.wait_for_load_state('networkidle')
            pg.wait_for_timeout(1000)
            pg.add_style_tag(content='.md-fig figcaption{display:none!important}.lt-tip{display:none!important}')
            out.mkdir(exist_ok=True)
            got = set()
            figs = pg.locator('.md-fig:has([data-fig])')
            for i in range(figs.count()):
                fig = figs.nth(i)
                name = fig.locator('[data-fig]').first.get_attribute('data-fig').split('/')[-1]
                fig.scroll_into_view_if_needed()
                fig.screenshot(path=str(out / name))
                got.add(name)
            want = {r.split('/')[-1] for r in refs}
            for f in out.glob('*.png'):          # 報告不再用到的圖
                if f.name not in want:
                    f.unlink()
            miss = sorted(want - got)
            wrong = [r for r in refs if r != f'{md.stem}/{r.split("/")[-1]}']
            if miss:
                problems.append(f'{md.name}：網頁沒有畫 {", ".join(miss)}')
            if wrong:
                problems.append(f'{md.name}：圖片路徑要寫成 {md.stem}/檔名.png：{", ".join(wrong)}')
            if errs:
                problems.append(f'{md.name}：網頁錯誤 {errs[0]}')
            print(f'{md.as_posix()}：{len(got)} 張')
            total += len(got)
            ctx.close()
        browser.close()
    print(f'共 {total} 張')
    for s in problems:
        print('注意：' + s, file=sys.stderr)
    sys.exit(1 if problems else 0)


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')
    main()
