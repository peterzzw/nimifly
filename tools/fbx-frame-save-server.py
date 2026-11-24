"""Local-only receiver for transparent FBX roll-frame PNG exports."""

import base64
import json
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path


OUTPUT = Path(__file__).resolve().parent / "fbx-frames"


class Handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_POST(self):
        length = int(self.headers.get("Content-Length", "0"))
        payload = json.loads(self.rfile.read(length))
        name = Path(payload["name"]).name
        data = payload["data"].split(",", 1)[-1]
        OUTPUT.mkdir(parents=True, exist_ok=True)
        (OUTPUT / name).write_bytes(base64.b64decode(data))
        self.send_response(200)
        self._cors()
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(b'{"ok":true}')

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "http://127.0.0.1:8766")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")


if __name__ == "__main__":
    HTTPServer(("127.0.0.1", 8768), Handler).serve_forever()
