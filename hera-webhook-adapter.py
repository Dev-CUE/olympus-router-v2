#!/usr/bin/env python3
"""Hera Telegram DM webhook adapter — Dumb Pipe to olympus-router-v2 (≤50 lines)"""
import os, json, urllib.request
from http.server import HTTPServer, BaseHTTPRequestHandler

SECRET = os.environ['OLYMPUS_ROUTER_SECRET']
TOKEN = os.environ['HERA_BOT_TOKEN']
PORT = int(os.environ.get('HERA_WEBHOOK_PORT', '9010'))

class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass  # silent
    def do_GET(self):
        self.send_response(200); self.end_headers()
    def do_POST(self):
        try:
            n = int(self.headers.get('Content-Length', 0))
            b = json.loads(self.rfile.read(n))
            m = b.get('message') or b.get('channel_post') or {}
            c = str(m.get('chat', {}).get('id', ''))
            tid = m.get('message_thread_id')
            t = m.get('text', '')
            if c and t:
                env = json.dumps({
                    'context_key': f'telegram:dm:{c}:root',
                    'routing': {'to': ['hera']},
                    'payload': {
                        'origin_platform': 'telegram', 'chat_id': c,
                        'user': m.get('from', {}).get('username', '') or
                                m.get('from', {}).get('first_name', 'unknown'),
                        'text': t, 'message_id': m.get('message_id')},
                    'idempotency_key': f'telegram:{c}:{m.get("message_id")}'
                }).encode()
                req = urllib.request.Request('http://127.0.0.1:8799/v1/route', data=env,
                    headers={'Content-Type': 'application/json', 'x-zeus-secret': SECRET})
                with urllib.request.urlopen(req, timeout=300) as r:
                    v = json.loads(r.read())
                reply = (v.get('results', [{}])[0].get('text', '') or 
                         v.get('results', [{}])[0].get('message', ''))
                if reply:
                    tg_payload = {'chat_id': c, 'text': reply}
                    if tid:
                        tg_payload['message_thread_id'] = tid
                    tg = json.dumps(tg_payload).encode()
                    urllib.request.urlopen(urllib.request.Request(
                        f'https://api.telegram.org/bot{TOKEN}/sendMessage', data=tg,
                        headers={'Content-Type': 'application/json'}))
        except Exception as ex:
            print(f'webhook err: {ex}', flush=True)
        self.send_response(200); self.send_header('Content-Type', 'application/json')
        self.end_headers(); self.wfile.write(b'{}')

HTTPServer(('127.0.0.1', PORT), H).serve_forever()
