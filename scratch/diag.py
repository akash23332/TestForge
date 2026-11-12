#!/usr/bin/env python3
import json
import subprocess

s = json.loads(subprocess.check_output(["docker", "inspect", "testforge-judge0-server"]))[0]
w = json.loads(subprocess.check_output(["docker", "inspect", "testforge-judge0-workers"]))[0]

print("Server image:", s["Image"])
print("Workers image:", w["Image"])
print("Server mounts:", [m["Source"] + " -> " + m["Destination"] for m in s["Mounts"]])
print("Workers mounts:", [m["Source"] + " -> " + m["Destination"] for m in w["Mounts"]])
print("Server working dir:", s["Config"]["WorkingDir"])
print("Workers working dir:", w["Config"]["WorkingDir"])
