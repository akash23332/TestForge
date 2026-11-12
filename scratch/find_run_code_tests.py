#!/usr/bin/env python3
import re

with open("deploy/judge0/verify-containment.sh", "r", encoding="utf-8") as f:
    content = f.read()

# Find all run_code_test calls
pattern = r'run_code_test\s+([^\n]+)'
matches = re.findall(pattern, content)

for idx, match in enumerate(matches):
    print(f"Test Call {idx+1}: {match}")
