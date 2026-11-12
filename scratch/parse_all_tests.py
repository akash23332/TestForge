#!/usr/bin/env python3
with open("deploy/judge0/verify-containment.sh", "r", encoding="utf-8") as f:
    lines = f.readlines()

for i, line in enumerate(lines):
    if "echo \"── [Test" in line or "# SECTION" in line or "echo \"── [Baseline" in line:
        print(f"Line {i+1}: {line.strip()}")
