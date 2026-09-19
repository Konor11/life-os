#!/usr/local/lib/hermes-agent/venv/bin/python
"""Standalone STT server for AgentOS. Holds faster-whisper 'base' in memory.
POST / {"data":"<base64 audio>","ext":"webm"} -> {"text":"..."}
Listens on 0.0.0.0:3005
"""
import base64, json, tempfile, os, threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from faster_whisper import WhisperModel

MODEL = WhisperModel('base', device='cpu', compute_type='int8')
print("[stt] faster-whisper 'base' загружен", flush=True)

class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a): pass

    def _send(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        try:
            length = int(self.headers.get('Content-Length', 0))
            payload = json.loads(self.rfile.read(length) or b'{}')
            data, ext = payload.get('data', ''), payload.get('ext', 'webm')
            if not data:
                return self._send(400, {'error': 'no data'})
            raw = base64.b64decode(data)
            fd, tmp = tempfile.mkstemp(suffix='.' + ext)
            with os.fdopen(fd, 'wb') as f:
                f.write(raw)
            try:
                segs, info = MODEL.transcribe(tmp, language='ru', vad_filter=True)
                text = ''.join(s.text for s in segs).strip()
                self._send(200, {'text': text})
            except Exception as e:
                self._send(500, {'error': str(e)})
            finally:
                try: os.unlink(tmp)
                except OSError: pass
        except Exception as e:
            self._send(500, {'error': str(e)})

    def do_GET(self):
        self._send(200, {'status': 'ok'})

if __name__ == '__main__':
    srv = ThreadingHTTPServer(('0.0.0.0', 3005), Handler)
    print("[stt] listening on :3005", flush=True)
    srv.serve_forever()