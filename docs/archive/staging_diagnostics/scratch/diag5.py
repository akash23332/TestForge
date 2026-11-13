#!/usr/bin/env python3
import subprocess

res = subprocess.run(["docker", "diff", "testforge-judge0-server"], capture_output=True, text=True)
for line in res.stdout.splitlines():
    if "/etc" in line:
        print(line)
