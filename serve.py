#!/usr/bin/env python3
"""serve.py — quiet static dev server for STARLEFT.

Drop-in replacement for `python3 -m http.server`, but it:
  • supports HTTP Range requests (206 Partial Content) so audio/video stream + seek
    properly (the stdlib server ignores Range and returns the whole file), and
  • swallows the harmless client-disconnect errors (BrokenPipeError / ConnectionResetError)
    that the stdlib server prints as noisy tracebacks when the browser cancels a media
    download — e.g. when the Episode VII "flash" music element is stopped/torn down at the
    hub transition. Those are normal: the browser closed the socket mid-transfer; nothing
    is wrong with the game.

Usage:
    python3 serve.py [port]          # default 8000  →  http://localhost:8000/rts.html
"""
import os, re, sys, http.server, socketserver

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
_DISCONNECT = (BrokenPipeError, ConnectionResetError)


class QuietRangeHandler(http.server.SimpleHTTPRequestHandler):
    # --- silence client-disconnect noise (the BrokenPipeError tracebacks) ---
    def copyfile(self, source, outputfile):
        try:
            super().copyfile(source, outputfile)
        except _DISCONNECT:
            pass

    def handle_one_request(self):
        try:
            super().handle_one_request()
        except _DISCONNECT:
            self.close_connection = True

    # --- minimal HTTP Range support (206) so media elements stream/seek cleanly ---
    def do_GET(self):
        rng = self.headers.get("Range")
        path = self.translate_path(self.path)
        if rng and os.path.isfile(path):
            m = re.match(r"bytes=(\d*)-(\d*)\s*$", rng.strip())
            if m:
                try:
                    self._serve_range(path, m)
                    return
                except _DISCONNECT:
                    self.close_connection = True
                    return
                except Exception:
                    pass  # fall through to a normal full-file response
        try:
            super().do_GET()
        except _DISCONNECT:
            self.close_connection = True

    def _serve_range(self, path, m):
        size = os.path.getsize(path)
        start = int(m.group(1)) if m.group(1) else 0
        end = int(m.group(2)) if m.group(2) else size - 1
        start = max(0, start)
        end = min(end, size - 1)
        if start > end:
            self.send_response(416)
            self.send_header("Content-Range", f"bytes */{size}")
            self.end_headers()
            return
        length = end - start + 1
        self.send_response(206)
        self.send_header("Content-Type", self.guess_type(path))
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self.send_header("Content-Length", str(length))
        self.end_headers()
        with open(path, "rb") as f:
            f.seek(start)
            remaining = length
            while remaining > 0:
                chunk = f.read(min(64 * 1024, remaining))
                if not chunk:
                    break
                self.wfile.write(chunk)
                remaining -= len(chunk)


class Server(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


if __name__ == "__main__":
    with Server(("", PORT), QuietRangeHandler) as httpd:
        print(f"STARLEFT dev server → http://localhost:{PORT}/rts.html  (Ctrl+C to stop)")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nbye")
