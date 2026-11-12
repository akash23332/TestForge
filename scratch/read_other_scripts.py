#!/usr/bin/env python3
for filename in ["deploy/judge0/verify-cgroups-isolate.sh", "deploy/judge0/verify-resource-accounting.sh"]:
    print(f"=== {filename} ===")
    with open(filename, "r", encoding="utf-8") as f:
        print(f.read()[:800])
