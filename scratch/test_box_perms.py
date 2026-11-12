#!/usr/bin/env python3
import subprocess

cmd = """
isolate --init --box-id=42 --cg
ls -ld /var/local/lib/isolate/42/box
touch /var/local/lib/isolate/42/box/test.sh
echo 'echo hello' > /var/local/lib/isolate/42/box/test.sh
isolate --box-id=42 --cg --run -- /bin/bash test.sh
ls -ld /var/local/lib/isolate/42/box
touch /var/local/lib/isolate/42/box/test2.sh
isolate --cleanup --box-id=42 --cg
"""

res = subprocess.run([
    "docker", "exec", "-u", "judge0", "testforge-judge0-workers",
    "bash", "-c", cmd
], capture_output=True, text=True)

print("stdout:\n", res.stdout)
print("stderr:\n", res.stderr)
