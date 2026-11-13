# Kata Containers 3.x Isolation Blueprint for TestForge

## Architectural Purpose

This directory contains the reference configuration blueprint for deploying **Kata Containers** to resolve **SEC-001** (`privileged: true` on Judge0 worker containers).

By placing `testforge-judge0-workers` inside a Kata MicroVM:
1. The container's `privileged: true` configuration applies strictly to the **guest Linux kernel**, never the host Linux kernel.
2. The untrusted code execution sandbox (IOI Isolate) retains native access to guest cgroups v1, private mount namespaces, network namespaces, and private device nodes.
3. If an adversary escapes the IOI Isolate chroot jail and compromises container root, they land inside an ephemeral hardware-isolated MicroVM with no access to the host kernel, host physical disks (`/dev/sda1`), host network, or cloud metadata credentials.

---

## Technical Feasibility & Cloud Hardware Constraint

> [!WARNING]
> **CRITICAL HARDWARE LIMITATION ON AZURE ARM64:**
> Microsoft Azure **DOES NOT SUPPORT NESTED VIRTUALIZATION** on any ARM-based VM series (including `Standard_B2ps_v2` and `Standard_D2ps_v5`).
> 
> Attempts to initialize Kata Containers or KVM inside an Azure ARM64 virtual machine fail because `/dev/kvm` is not exposed by Azure's Hyper-V hypervisor for ARM64 guests.
>
> Running Kata with QEMU TCG software emulation is unviable for production due to extreme (50x-100x) CPU and latency overhead.

### Viable Production Paths for Hardware MicroVMs:

1. **Cross-Architecture Migration to Azure x86_64:**
   - Migrate staging/production host to an x86_64 VM supporting nested virtualization (e.g., `Standard_D2as_v5` with AMD EPYC or `Standard_D2s_v5` with Intel Xeon).
   - Fully supported by Azure (`NestedVirtualization=True`), enabling native KVM hardware acceleration.
   - Cost implication: ~$0.096/hr (~$70/month), which impacts the ₹0 personal student budget.
2. **Bare-Metal ARM64 Hosting:**
   - Deploying on physical bare-metal ARM64 hardware (e.g. Oracle Cloud `BM.Standard.A1.160`, on-premise Ampere Altra server, or Apple Silicon bare metal) where `/dev/kvm` is exposed directly by the Linux kernel without nesting.

---

## Blueprint Artifacts

- [`daemon.json`](file:///d:/TestForge/deploy/judge0/kata/daemon.json): Docker daemon OCI runtime registration for `kata-qemu` and `kata-clh`.
- [`docker-compose.kata.yml`](file:///d:/TestForge/deploy/judge0/kata/docker-compose.kata.yml): Compose override applying `runtime: kata-qemu` to worker service while keeping database, redis, and API on standard `runc`.
- [`configuration-qemu-arm64.toml`](file:///d:/TestForge/deploy/judge0/kata/configuration-qemu-arm64.toml): Hypervisor, guest kernel, and virtio-fs parameters for Kata 3.x.
