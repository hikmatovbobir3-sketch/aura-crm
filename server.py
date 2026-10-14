import http.server
import socketserver
import os
import json
import re
import subprocess
import threading
import time
import sys

# Ensure UTF-8 output for Windows console
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATE_FILE = os.path.join(BASE_DIR, 'aura_state.json')
PORT = 3333

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

class CustomHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=BASE_DIR, **kwargs)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def do_GET(self):
        if self.path == '/api/state':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            try:
                with open(STATE_FILE, 'rb') as f:
                    self.wfile.write(f.read())
            except Exception as e:
                self.wfile.write(b'{}')
        else:
            super().do_GET()

    def do_POST(self):
        if self.path == '/api/state':
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length)
            try:
                data = json.loads(body.decode('utf-8'))
                with open(STATE_FILE, 'w', encoding='utf-8') as f:
                    json.dump(data, f, ensure_ascii=False, indent=2)
                state_js = os.path.join(BASE_DIR, 'js', 'aura_initial_state.js')
                try:
                    with open(state_js, 'w', encoding='utf-8') as f:
                        f.write('// Auto-synchronized initial state for AURA CRM\nwindow.AURA_INITIAL_STATE = ' + json.dumps(data, ensure_ascii=False, indent=2) + ';\n')
                except Exception:
                    pass
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(b'{"status":"saved"}')
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
        elif self.path == '/api/push':
            try:
                git_path = r"C:\Users\user\AppData\Local\Programs\Git\cmd"
                env = os.environ.copy()
                if git_path not in env.get("PATH", ""):
                    env["PATH"] = git_path + os.pathsep + env.get("PATH", "")

                subprocess.run(['git', 'add', '.'], cwd=BASE_DIR, env=env, check=True)
                subprocess.run(['git', 'commit', '-m', 'Update CRM database and state'], cwd=BASE_DIR, env=env)
                res = subprocess.run(['git', 'push', 'origin', 'main'], cwd=BASE_DIR, env=env, capture_output=True, text=True)

                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps({"status": "pushed", "output": res.stdout}).encode('utf-8'))
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))
        else:
            self.send_response(404)
            self.end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

def run_git_autopull():
    # The site saves straight to GitHub; keep this folder in step with it
    git_path = r"C:\Users\user\AppData\Local\Programs\Git\cmd"
    env = os.environ.copy()
    if git_path not in env.get("PATH", ""):
        env["PATH"] = git_path + os.pathsep + env.get("PATH", "")
    while True:
        try:
            res = subprocess.run(['git', 'pull', '--rebase', '--autostash', 'origin', 'main'],
                                 cwd=BASE_DIR, env=env, capture_output=True, text=True, timeout=60)
            if res.returncode != 0:
                print("[!] git pull failed:", (res.stderr or res.stdout).strip())
            elif 'Already up to date' not in res.stdout:
                print("[OK] Pulled latest database from GitHub")
        except Exception as e:
            print("[!] git pull error:", e)
        time.sleep(30)

def run_server():
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", PORT), CustomHandler) as httpd:
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
    threading.Thread(target=run_git_autopull, daemon=True).start()
    time.sleep(1)
    run_tunnel()
