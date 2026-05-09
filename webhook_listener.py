#!/usr/bin/env python3
"""
GitHub webhook listener for auto-redeploying the Tetris app.
Listens on port 3002. Expects POST from GitHub push events.
"""
import os
import sys
import json
import hmac
import hashlib
import subprocess
from http.server import HTTPServer, BaseHTTPRequestHandler

# Configuration
REPO_DIR = "/home/ubuntu/projects/tetris"
SERVICE_NAME = "tetris"
SECRET = os.environ.get("TETRIS_WEBHOOK_SECRET", "").encode()
PORT = 3002


def verify_signature(payload: bytes, signature: str) -> bool:
    if not SECRET:
        print("WARN: No webhook secret configured, skipping verification", file=sys.stderr)
        return True
    if not signature.startswith("sha256="):
        return False
    expected = signature[7:]
    computed = hmac.new(SECRET, payload, hashlib.sha256).hexdigest()
    return hmac.compare_digest(computed, expected)


def get_git_hash() -> str:
    result = subprocess.run(
        ["git", "rev-parse", "--short", "HEAD"],
        cwd=REPO_DIR, capture_output=True, text=True, check=True
    )
    return result.stdout.strip()


def deploy():
    print("[deploy] Starting deploy...", file=sys.stderr)
    # Pull latest
    subprocess.run(
        ["git", "pull", "origin", "main"],
        cwd=REPO_DIR, capture_output=True, text=True, check=True
    )
    # Update version.txt with commit hash
    try:
        base = "1.0.0"
        version_path = os.path.join(REPO_DIR, "version.txt")
        with open(version_path, "r") as f:
            base = f.read().strip().split()[0]
        short_hash = get_git_hash()
        new_version = f"{base} ({short_hash})"
        with open(version_path, "w") as f:
            f.write(new_version + "\n")
        print(f"[deploy] Updated version to {new_version}", file=sys.stderr)
    except Exception as e:
        print(f"[deploy] Failed to update version: {e}", file=sys.stderr)
    # Restart service
    subprocess.run(
        ["sudo", "systemctl", "restart", SERVICE_NAME],
        capture_output=True, text=True, check=True
    )
    print("[deploy] Service restarted", file=sys.stderr)


class WebhookHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        # Suppress default logging; we print to stderr manually
        pass

    def do_POST(self):
        if self.path != "/":
            self.send_error(404)
            return

        content_length = int(self.headers.get("Content-Length", 0))
        payload = self.rfile.read(content_length)
        signature = self.headers.get("X-Hub-Signature-256", "")
        event = self.headers.get("X-GitHub-Event", "")

        if not verify_signature(payload, signature):
            self.send_error(401, "Invalid signature")
            return

        if event != "push":
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b"OK: ignored non-push event\n")
            return

        try:
            data = json.loads(payload)
            ref = data.get("ref", "")
            if ref != "refs/heads/main":
                self.send_response(200)
                self.end_headers()
                self.wfile.write(b"OK: ignored non-main branch\n")
                return
            deploy()
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b"OK: deployed\n")
        except Exception as e:
            print(f"[deploy] Error: {e}", file=sys.stderr)
            self.send_error(500, str(e))

    def do_GET(self):
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b"Webhook listener active\n")


def main():
    server = HTTPServer(("127.0.0.1", PORT), WebhookHandler)
    print(f"Webhook listener running on http://127.0.0.1:{PORT}/", file=sys.stderr)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.shutdown()


if __name__ == "__main__":
    main()
