#!/usr/bin/env python3
import json
import subprocess

s = json.loads(subprocess.check_output(["docker", "inspect", "testforge-judge0-server"]))[0]
print("GraphDriver Data:")
print(json.dumps(s.get("GraphDriver", {}), indent=2))
print("HostConfig:")
print("Privileged:", s["HostConfig"].get("Privileged"))
print("SecurityOpt:", s["HostConfig"].get("SecurityOpt"))
print("CapAdd:", s["HostConfig"].get("CapAdd"))
print("CapDrop:", s["HostConfig"].get("CapDrop"))
print("UsernsMode:", s["HostConfig"].get("UsernsMode"))
