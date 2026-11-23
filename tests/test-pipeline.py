#!/usr/bin/env python3
"""
Automated Test Suite for ColonyVision Lab.
Validates file integrity, samples, ground truth, and static asset readiness.
"""

import os
import json
import unittest

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

class TestColonyVisionProject(unittest.TestCase):
    def test_vendor_opencv_exists(self):
        cv_path = os.path.join(ROOT_DIR, "vendor", "opencv", "4.12.0", "opencv.js")
        self.assertTrue(os.path.exists(cv_path), "opencv.js is missing from vendor directory")
        size = os.path.getsize(cv_path)
        self.assertGreater(size, 10_000_000, f"opencv.js is too small ({size} bytes)")

    def test_samples_and_ground_truth(self):
        samples_dir = os.path.join(ROOT_DIR, "samples")
        for filename in ["bacterial-plate.jpg", "staph-blood-agar.jpg", "yeast-cell-culture.jpg"]:
            path = os.path.join(samples_dir, filename)
            self.assertTrue(os.path.exists(path), f"Sample {filename} is missing")
            self.assertGreater(os.path.getsize(path), 50_000, f"Sample {filename} is too small")

        gt_path = os.path.join(samples_dir, "ground-truth.json")
        self.assertTrue(os.path.exists(gt_path), "ground-truth.json is missing")
        with open(gt_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        self.assertIn("bacterial-plate.jpg", data)
        self.assertGreater(data["bacterial-plate.jpg"]["count"], 50)

    def test_core_html_pages(self):
        pages = ["index.html", "how-it-works.html", "resources.html", os.path.join("guide", "index.html")]
        for page in pages:
            path = os.path.join(ROOT_DIR, page)
            self.assertTrue(os.path.exists(path), f"Page {page} missing")
            with open(path, "r", encoding="utf-8") as f:
                content = f.read()
            self.assertIn("<!doctype html>", content.lower())
            self.assertIn("Zoryana Pihach Romankiv", content, f"Author attribution missing from {page}")
            self.assertIn("ColonyVision", content, f"ColonyVision title missing from {page}")

    def test_js_modules(self):
        for js_file in ["app.js", "db.js", "pipeline.js", "vision-client.js"]:
            path = os.path.join(ROOT_DIR, "js", js_file)
            self.assertTrue(os.path.exists(path), f"JS module {js_file} missing")
            self.assertGreater(os.path.getsize(path), 500)

        worker_path = os.path.join(ROOT_DIR, "vision.worker.js")
        self.assertTrue(os.path.exists(worker_path), "vision.worker.js missing")

    def test_netlify_configs(self):
        toml_path = os.path.join(ROOT_DIR, "netlify.toml")
        self.assertTrue(os.path.exists(toml_path), "netlify.toml missing")
        with open(toml_path, "r", encoding="utf-8") as f:
            content = f.read()
        self.assertIn('publish = "."', content)
        self.assertIn('Content-Security-Policy', content)

    def test_pwa_offline_files(self):
        manifest_path = os.path.join(ROOT_DIR, "manifest.json")
        sw_path = os.path.join(ROOT_DIR, "sw.js")
        self.assertTrue(os.path.exists(manifest_path), "manifest.json missing")
        self.assertTrue(os.path.exists(sw_path), "sw.js missing")

if __name__ == "__main__":
    unittest.main()
