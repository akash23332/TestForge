#!/usr/bin/env python3
import subprocess

res = subprocess.run([
    "docker", "exec", "-u", "0", "testforge-judge0-workers",
    "sed", "-n", "105,250p", "/api/app/jobs/isolate_job.rb"
], capture_output=True, text=True)

print(res.stdout)
