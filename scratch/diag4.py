#!/usr/bin/env python3
import subprocess

res = subprocess.run(["docker", "diff", "testforge-judge0-server"], capture_output=True, text=True)
print("diff count:", len(res.stdout.splitlines()))
print("\n".join(res.stdout.splitlines()[:50]))
