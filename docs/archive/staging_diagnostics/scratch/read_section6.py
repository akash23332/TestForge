#!/usr/bin/env python3
with open("deploy/judge0/verify-containment.sh", "r", encoding="utf-8") as f:
    lines = f.readlines()

print("".join(lines[660:714]))
