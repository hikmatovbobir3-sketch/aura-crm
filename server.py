import http.server
import socketserver
import os
import json
import re
import subprocess
import threading
import time
import hashlib
import sys

# Ensure UTF-8 output for Windows console
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATE_FILE = os.path.join(BASE_DIR, 'aura_state.json')
PORT = int(os.environ.get('AURA_PORT', 3333))

# Ensure state file exists
if not os.path.exists(STATE_FILE):
    initial_state = {
        "sent": {},
        "vouchers": {},
        "videos": {},
        "links": {},
        "views": {},
        "trash": {},
        "custom": []
    }
    with open(STATE_FILE, 'w', encoding='utf-8') as f:
        json.dump(initial_state, f, ensure_ascii=False, indent=2)

STATE_JS = os.path.join(BASE_DIR, 'js', 'aura_initial_state.js')
STATE_REL = 'aura_state.json'
STATE_JS_REL = 'js/aura_initial_state.js'
MAP_SECTIONS = ['sent', 'vouchers', 'videos', 'links', 'views', 'trash', 'edits']

# Guards aura_state.json and every git command that may touch the working tree
state_lock = threading.RLock()
push_event = threading.Event()
git_status = {"ok": True, "message": "", "at": 0}

GIT_ENV = os.environ.copy()
_git_dir = r"C:\Users\user\AppData\Local\Programs\Git\cmd"
if _git_dir not in GIT_ENV.get("PATH", ""):
    GIT_ENV["PATH"] = _git_dir + os.pathsep + GIT_ENV.get("PATH", "")


def git(*args, timeout=60):
    return subprocess.run(['git', *args], cwd=BASE_DIR, env=GIT_ENV, capture_output=True,
                          text=True, encoding='utf-8', errors='replace', timeout=timeout)


def canon(v):
    return json.dumps(v, ensure_ascii=False, sort_keys=True)


def normalize_state(s):
    s = s if isinstance(s, dict) else {}
    out = {}
    for sec in MAP_SECTIONS:
        out[sec] = dict(s[sec]) if isinstance(s.get(sec), dict) else {}
        out[sec].pop('undefined', None)
    out['custom'] = [b for b in s.get('custom', []) if isinstance(b, dict) and b.get('id')] if isinstance(s.get('custom'), list) else []
    try:
        out['viewsRev'] = int(s.get('viewsRev') or 0)
    except (TypeError, ValueError):
        out['viewsRev'] = 0
    return out


def merge_states(base, local, remote):
    """Apply every change between base and local on top of remote (same rules as the browser)."""
    base, local, res = normalize_state(base), normalize_state(local), normalize_state(remote)
    for sec in MAP_SECTIONS:
        b, l, r = base[sec], local[sec], res[sec]
        for k in set(b) | set(l):
            if canon(b.get(k)) == canon(l.get(k)) and (k in b) == (k in l):
                continue
            if k in l:
                r[k] = l[k]
            else:
                r.pop(k, None)
    b_map = {x['id']: x for x in base['custom']}
    l_map = {x['id']: x for x in local['custom']}
    for cid in set(b_map) | set(l_map):
        if canon(b_map.get(cid)) == canon(l_map.get(cid)):
            continue
        idx = next((i for i, x in enumerate(res['custom']) if x['id'] == cid), -1)
        if cid in l_map:
            if idx >= 0:
                res['custom'][idx] = l_map[cid]
            else:
                res['custom'].append(l_map[cid])
        elif idx >= 0:
            res['custom'].pop(idx)
    res['viewsRev'] = max(base['viewsRev'], local['viewsRev'], res['viewsRev'])
    return res


def read_state_bytes():
    try:
        with open(STATE_FILE, 'rb') as f:
            return f.read()
    except OSError:
        return b'{}'


def write_state(data):
    text = json.dumps(data, ensure_ascii=False, indent=2) + '\n'
    with open(STATE_FILE, 'w', encoding='utf-8', newline='\n') as f:
        f.write(text)
    with open(STATE_JS, 'w', encoding='utf-8', newline='\n') as f:
        f.write('// Auto-synchronized initial state for AURA CRM\nwindow.AURA_INITIAL_STATE = ' + json.dumps(data, ensure_ascii=False, indent=2) + ';\n')


def state_sha():
    return hashlib.sha1(read_state_bytes()).hexdigest()


def git_show_json(rev):
    res = git('show', f'{rev}:{STATE_REL}')
    if res.returncode != 0:
        return {}
    try:
        return json.loads(res.stdout)
    except ValueError:
        return {}


def set_git_status(ok, message):
    git_status.update(ok=ok, message=message, at=int(time.time()))
    print(('[OK] ' if ok else '[!] ') + message)


def git_sync():
    """Commit local database changes, merge in GitHub's, push. Only the two state files are ever committed."""
    fetch = git('fetch', 'origin', 'main')
    if fetch.returncode != 0:
        set_git_status(False, 'Нет связи с GitHub: ' + fetch.stderr.strip()[:200])
        return
    with state_lock:
        if git('diff', '--quiet', '--', STATE_REL, STATE_JS_REL).returncode != 0:
            git('add', '--', STATE_REL, STATE_JS_REL)
            git('commit', '-m', 'CRM: обновление базы', '--', STATE_REL, STATE_JS_REL)

        behind = git('rev-list', '--count', 'HEAD..origin/main').stdout.strip() or '0'
        if behind != '0':
            merge = git('merge', '--no-edit', '--autostash', 'origin/main')
            if merge.returncode != 0:
                # Both sides changed the database: merge the JSON by content instead of by lines
                git('merge', '--abort')
                base_rev = git('merge-base', 'HEAD', 'origin/main').stdout.strip()
                merged = merge_states(git_show_json(base_rev), git_show_json('HEAD'), git_show_json('origin/main'))
                merge = git('merge', '--no-edit', '--autostash', '-X', 'ours', 'origin/main')
                if merge.returncode != 0:
                    git('merge', '--abort')
                    set_git_status(False, 'Не удалось объединить с GitHub: ' + (merge.stderr or merge.stdout).strip()[:300])
                    return
                write_state(merged)
                git('add', '--', STATE_REL, STATE_JS_REL)
                git('commit', '--amend', '--no-edit', '--', STATE_REL, STATE_JS_REL)
            # Keep the browser fallback file in step with what was pulled
            write_state(normalize_state(json.loads(read_state_bytes().decode('utf-8') or '{}')))
            if git('diff', '--quiet', '--', STATE_REL, STATE_JS_REL).returncode != 0:
                git('add', '--', STATE_REL, STATE_JS_REL)
                git('commit', '-m', 'CRM: обновление базы', '--', STATE_REL, STATE_JS_REL)

        ahead = git('rev-list', '--count', 'origin/main..HEAD').stdout.strip() or '0'
        if ahead != '0':
            push = git('push', 'origin', 'HEAD:main')
            if push.returncode != 0:
                set_git_status(False, 'Не удалось отправить в GitHub: ' + push.stderr.strip()[:300])
                push_event.set()  # someone pushed in between - try again
                return
            set_git_status(True, 'База отправлена в GitHub')
        elif behind != '0':
            set_git_status(True, 'Получены изменения с GitHub')
        else:
            git_status.update(ok=True, at=int(time.time()))


def run_git_sync_loop():
    while True:
        # Wake up soon after a save, otherwise poll GitHub every 30 seconds
        if push_event.wait(timeout=30):
            time.sleep(3)  # let a burst of clicks land in one commit
            push_event.clear()
        try:
            git_sync()
        except Exception as e:
            set_git_status(False, 'Ошибка синхронизации: ' + str(e))
        time.sleep(1)


class CustomHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=BASE_DIR, **kwargs)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        self.send_header('Access-Control-Allow-Origin', '*')
        super().end_headers()

    def send_json(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):
        if '/api/' not in (args[0] if args else ''):
            super().log_message(fmt, *args)

    def do_GET(self):
        if self.path.split('?')[0] == '/api/sync':
            with state_lock:
                raw = read_state_bytes()
            try:
                state = json.loads(raw.decode('utf-8') or '{}')
            except ValueError:
                state = {}
            self.send_json(200, {"sha": hashlib.sha1(raw).hexdigest(), "state": state, "git": git_status})
        elif self.path.split('?')[0] == '/api/state':
            with state_lock:
                raw = read_state_bytes()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.end_headers()
            self.wfile.write(raw)
        else:
            super().do_GET()

    def do_POST(self):
        path = self.path.split('?')[0]
        if path in ('/api/sync', '/api/state'):
            try:
                body = json.loads(self.rfile.read(int(self.headers.get('Content-Length', 0))).decode('utf-8'))
            except ValueError:
                self.send_json(400, {"error": "bad json"})
                return
            with state_lock:
                if path == '/api/sync':
                    # Optimistic locking: the browser must have merged the latest file first
                    if body.get('sha') != state_sha():
                        self.send_json(409, {"error": "conflict"})
                        return
                    data = body.get('state')
                else:
                    data = body  # legacy clients
                write_state(normalize_state(data))
                sha = state_sha()
            push_event.set()
            self.send_json(200, {"sha": sha, "git": git_status})
        elif path == '/api/push':
            push_event.set()
            self.send_json(200, {"status": "scheduled"})
        else:
            self.send_response(404)
            self.end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

def run_server():
    socketserver.ThreadingTCPServer.allow_reuse_address = True
    socketserver.ThreadingTCPServer.daemon_threads = True
    with socketserver.ThreadingTCPServer(("", PORT), CustomHandler) as httpd:
        print(f"[OK] Local server running on http://localhost:{PORT}")
        httpd.serve_forever()

def run_tunnel():
    cloudflared_path = os.path.join(BASE_DIR, 'cloudflared.exe')
    if not os.path.exists(cloudflared_path):
        print(f"[!] cloudflared.exe not found in {BASE_DIR}")
        return

    cmd = [cloudflared_path, 'tunnel', '--url', f'http://localhost:{PORT}']
    print("[...] Launching Cloudflare Tunnel...")
    
    process = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        bufsize=1,
        encoding='utf-8',
        errors='replace'
    )

    tunnel_url = None
    url_pattern = re.compile(r'https://[a-zA-Z0-9-]+\.trycloudflare\.com')

    for line in process.stderr:
        match = url_pattern.search(line)
        if match:
            tunnel_url = match.group(0)
            print("\n" + "="*60)
            print(">>> AURA CRM IS ONLINE (Cloudflare Tunnel) <<<")
            print(f"PUBLIC URL: {tunnel_url}")
            print(f"LOCAL URL:  http://localhost:{PORT}")
            print("="*60 + "\n")
            
            with open(os.path.join(BASE_DIR, 'PUBLIC_LINK.txt'), 'w', encoding='utf-8') as f:
                f.write(tunnel_url + '\n')
            
            desktop_link = os.path.join(r'C:\Users\user\Desktop', 'AURA_CRM_LINK.txt')
            try:
                with open(desktop_link, 'w', encoding='utf-8') as f:
                    f.write("AURA CRM Public Link (Cloudflare Tunnel):\n" + tunnel_url + "\n")
            except:
                pass
            break

    process.wait()

if __name__ == '__main__':
    t = threading.Thread(target=run_server, daemon=True)
    t.start()
    threading.Thread(target=run_git_sync_loop, daemon=True).start()
    push_event.set()  # sync once right after start
    time.sleep(1)
    run_tunnel()
