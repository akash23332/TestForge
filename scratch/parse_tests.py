#!/usr/bin/env python3
import re

with open("deploy/judge0/verify-containment.sh", "r", encoding="utf-8") as f:
    content = f.read()

# Find all test blocks
test_matches = re.findall(r'(# -+\n# (?:SECTION|Test) [^\n]+\n(?:[^\n]+\n){1,15})', content)
print(f"Total test headers found: {len(test_matches)}")

# Print test definitions
lines = content.splitlines()
for i, line in enumerate(lines):
    if line.startswith("# SECTION") or "Test " in line and line.startswith("echo"):
        print(f"L{i+1}: {line}")
