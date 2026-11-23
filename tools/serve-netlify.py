#!/usr/bin/env python3
"""
Simple local development server for ColonyVision Lab.
Simulates Netlify's headers (MIME types, COOP/COEP, security headers, caching).
Usage: python tools/serve-netlify.py [port]
"""

import http.server
import socketserver
import sys
import os

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8080

class NetlifyHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # Security headers
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('X-Frame-Options', 'DENY')
        self.send_header('Referrer-Policy', 'strict-origin-when-cross-origin')
        self.send_header('Cross-Origin-Opener-Policy', 'same-origin')
        
        # Proper MIME types
        if self.path.endswith('.wasm'):
            self.send_header('Content-Type', 'application/wasm')
        elif self.path.endswith('.js') or self.path.endswith('.mjs'):
            self.send_header('Content-Type', 'application/javascript; charset=utf-8')
        elif self.path.endswith('.json'):
            self.send_header('Content-Type', 'application/json; charset=utf-8')

        super().end_headers()

def main():
    os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    with socketserver.TCPServer(("", PORT), NetlifyHandler) as httpd:
        print(f"ColonyVision Lab running locally at http://localhost:{PORT}")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nServer stopped.")

if __name__ == "__main__":
    main()
