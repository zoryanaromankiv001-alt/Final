#!/usr/bin/env python3
import urllib.request
import sys

BASE_URL = "http://localhost:8080"
ENDPOINTS = [
    ("/", 200, "text/html"),
    ("/index.html", 200, "text/html"),
    ("/how-it-works.html", 200, "text/html"),
    ("/resources.html", 200, "text/html"),
    ("/guide/index.html", 200, "text/html"),
    ("/css/styles.css", 200, "text/css"),
    ("/js/app.js", 200, "application/javascript"),
    ("/js/db.js", 200, "application/javascript"),
    ("/js/pipeline.js", 200, "application/javascript"),
    ("/js/vision-client.js", 200, "application/javascript"),
    ("/js/theme.js", 200, "application/javascript"),
    ("/vision.worker.js", 200, "application/javascript"),
    ("/vendor/opencv/4.12.0/opencv.js", 200, "application/javascript"),
    ("/samples/bacterial-plate.jpg", 200, "image/jpeg"),
    ("/samples/staph-blood-agar.jpg", 200, "image/jpeg"),
    ("/samples/yeast-cell-culture.jpg", 200, "image/jpeg"),
    ("/samples/ground-truth.json", 200, "application/json"),
    ("/manifest.json", 200, "application/json"),
    ("/sw.js", 200, "application/javascript"),
]

passed = 0
failed = 0

print(f"Testing endpoints against {BASE_URL}...\n")
for path, expected_status, expected_mime in ENDPOINTS:
    url = BASE_URL + path
    try:
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=5) as res:
            status = res.status
            content_type = res.headers.get("Content-Type", "")
            coop = res.headers.get("Cross-Origin-Opener-Policy", "")
            nosniff = res.headers.get("X-Content-Type-Options", "")
            
            if status == expected_status:
                print(f" [PASS] {path:35} -> {status} (Content-Type: {content_type.split(';')[0]})")
                passed += 1
            else:
                print(f" [FAIL] {path:35} -> Expected {expected_status}, got {status}")
                failed += 1
    except Exception as e:
        print(f" [FAIL] {path:35} -> Error: {e}")
        failed += 1

print(f"\nResults: {passed} passed, {failed} failed.")
if failed > 0:
    sys.exit(1)
