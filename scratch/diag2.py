#!/usr/bin/env python3
import subprocess

for name in ["testforge-judge0-server", "testforge-judge0-workers"]:
    res = subprocess.run(["docker", "exec", name, "id"], capture_output=True, text=True)
    print(f"{name} id: rc={res.returncode}, stdout={res.stdout.strip()}, stderr={res.stderr.strip()}")
    res = subprocess.run(["docker", "exec", "-u", "root", name, "id"], capture_output=True, text=True)
    print(f"{name} root id: rc={res.returncode}, stdout={res.stdout.strip()}, stderr={res.stderr.strip()}")
