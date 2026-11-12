# TestForge: Architectural Security Decision — Privileged Worker & Sandbox Isolation
**Document ID:** `PRIVILEGED_WORKER_SECURITY_DECISION`  
**Date:** 2026-11-12  
**Security Finding ID:** `SEC-001` (Container Escape via Privileged Worker)  
**Status:** UNRESOLVED / CRITICAL RISK ACCEPTANCE FOR STAGING ONLY  
**Target Environments:** Azure ARM64 `Standard_D2ps_v5` Staging VM vs. Production Architecture

---

## 1. Executive Summary & Definite Risk Statement

> [!CAUTION]
> **SEC-001 STATUS: CRITICAL AND UNRESOLVED.**
> This document explicitly affirms that **SEC-001 remains an active, unresolved architectural security risk**. The use of `privileged: true` in the Judge0 worker container creates a potential host-compromise vector if an attacker escapes the inner Isolate sandbox. 
> 
> Under **no circumstances** is SEC-001 considered closed or fully mitigated by software wrappers alone. For the upcoming **Phase C Staging Deployment**, this configuration is accepted **strictly on a temporary, single-tenant, disposable staging VM** isolated from production databases, teacher/student PII, and Azure API credentials.

This report evaluates four architectural approaches for sandboxed code execution, balancing upstream Judge0 CE compatibility, Linux cgroup dependencies, operational overhead on Azure ARM64 VM (`Standard_D2ps_v5`), and final production security.

---

## 2. In-Depth Comparative Architectural Analysis

### Approach 1: Privileged Container + Isolate Wrapper + Inner SUID Jail (Current Staging Architecture)

#### Description
The Judge0 worker runs in a Docker container with `privileged: true`. Inside the container, upstream Isolate runs as a SUID binary (`isolate-bin`) guarded by a POSIX argument-allowlist wrapper (`isolate-wrapper.sh`). The wrapper intercepts all commands, enforces zero network egress, sanitizes directory mounts, strips metacharacters, and delegates execution into the inner Linux namespace jail.

#### Security Model & Blast Radius
- **Layer 1 (Outer Container):** `privileged: true` gives the container full access to `/dev`, disables AppArmor and Seccomp profiles, and mounts the host `/sys` filesystem. A root process breaking out of the container achieves immediate host root compromise. A dedicated single-tenant VM reduces blast radius against other systems, but **does not eliminate host compromise risk**.
- **Layer 2 (Interception Wrapper):** Eliminates shell injection, PATH spoofing, arbitrary mounts, and network access before Isolate is executed. *(Audited in Finding SEC-002: In current state, the wrapper intercepts generic 'isolate' calls via PATH; direct execution of the 4755 'isolate-bin' binary remains possible for UID 1000 without sudo unless hardened via Option C root-only permission gating).*
- **Layer 3 (Inner Sandbox):** Isolate leverages Linux namespaces (PID, IPC, UTS, Mount) and cgroups v1 to enforce tight CPU, memory, wall-time, and disk quotas on untrusted code running as unprivileged UID `isolate`.
- **Blast Radius:** If untrusted code achieves a double-escape (jailbreak from Isolate + container escape), it gains root control over the Azure VM. On our staging VM, this host holds zero production databases, zero user tokens, and runs behind an isolated network security group.

#### Compatibility & Feasibility
- **Judge0 CE v1.13.1:** 100% Native compatibility. Upstream Judge0 is architected specifically around privileged containers due to cgroups v1 nesting requirements.
- **Azure ARM64 (`Standard_D2ps_v5`):** Fully supported on Ubuntu 22.04 LTS with cgroup v1 compatibility (`systemd.unified_cgroup_hierarchy=0`).
- **Implementation Effort:** Completed (0 days). Already implemented and verified across 312 tests.

---

### Approach 2: Non-Privileged Container with Granular Linux Capabilities (`cap_add`)

#### Description
Remove `privileged: true` from `docker-compose.yml` and replace it with explicit Linux capabilities required by Isolate: `CAP_SYS_ADMIN`, `CAP_CHOWN`, `CAP_SETUID`, `CAP_SETGID`, `CAP_DAC_OVERRIDE`, and custom security options (`security_opt: [seccomp:unconfined, apparmor:unconfined]`).

#### Security Model & Blast Radius
- **Security Assessment:** In the Linux kernel security model, granting `CAP_SYS_ADMIN` combined with unconfined AppArmor/Seccomp within a Docker container using the default host user namespace is **effectively equivalent to full `privileged: true`**. Numerous documented kernel exploits (e.g. via `cgroups` release_agent or raw disk mounts) permit root escape with `CAP_SYS_ADMIN` alone.
- **Blast Radius:** Marginal reduction in blast radius; does not prevent host takeover if the kernel is vulnerable.
- **False Sense of Security:** Creates an illusion of least-privilege without providing meaningful isolation.

#### Compatibility & Feasibility
- **Judge0 CE v1.13.1:** Partial/Fragile. Upstream Judge0 often fails during cgroup initialization when Docker daemon masks certain `/sys/fs/cgroup` nodes unless systemd cgroup drivers are specifically tuned.
- **Azure ARM64 (`Standard_D2ps_v5`):** High risk of random worker initialization crashes during parallel grading.
- **Implementation Effort:** 2–3 weeks of kernel debugging with zero tangible security gain over Approach 1.

---

### Approach 3: Bare VM Host Execution (Judge0 Worker on Host OS, No Outer Docker)

#### Description
Run the Judge0 API, PostgreSQL, and Redis inside unprivileged containers, but install the Judge0 Worker and compiler toolchains directly onto the host Ubuntu OS. Isolate executes directly on the bare Linux kernel.

#### Security Model & Blast Radius
- **Security Assessment:** Eliminates container nesting entirely. Untrusted code is confined directly by Isolate's native kernel namespaces and cgroups without Docker layers.
- **Blast Radius:** If untrusted code breaks out of Isolate, it directly lands on the VM host. However, there is no Docker daemon attack surface (no Docker socket vulnerabilities).
- **Drawbacks:** Destroys infrastructure reproducibility. Installing 15+ compilers and runtimes (Python, GCC, OpenJDK, Rust, Node, etc.) directly on the VM host creates package dependency hell, difficult updates, and non-deterministic staging environments.

#### Compatibility & Feasibility
- **Judge0 CE v1.13.1:** Supported upstream as "bare-metal installation", but highly complex to automate and maintain.
- **Azure ARM64 (`Standard_D2ps_v5`):** High maintenance burden; incompatible with ephemeral CI/CD pipelines.
- **Implementation Effort:** 3–4 weeks of DevOps scripting.

---

### Approach 4: MicroVMs (AWS Firecracker / Kata Containers) or Rootless Cgroups v2 (Target Production Architecture)

#### Description
Replace Docker container isolation with hardware-assisted virtualization:
1. **Option A (Kata Containers / Firecracker):** Each untrusted execution or worker runs inside a lightweight, hardware-isolated KVM microVM with its own dedicated Linux kernel. Even if untrusted code achieves root inside the VM, it cannot break into the hypervisor.
2. **Option B (Rootless Cgroups v2 + User Namespaces):** Modern Linux kernel isolation utilizing fully unprivileged user namespaces and hierarchical cgroups v2, eliminating root and SUID entirely.

#### Security Model & Blast Radius
- **Security Assessment:** **Industry Gold Standard.** Hardware virtualization boundary guarantees true multi-tenant security. The blast radius is strictly confined to an ephemeral microVM that is terminated immediately after code evaluation.
- **Blast Radius:** Zero host compromise risk. Complete isolation between concurrent student evaluations.

#### Compatibility & Feasibility
- **Judge0 CE v1.13.1:** Requires extensive engineering. Upstream Judge0 v1.13.1 does not support Firecracker natively and requires cgroups v1. Porting to rootless cgroups v2 requires custom patch sets or moving to a custom execution orchestrator.
- **Azure ARM64 (`Standard_D2ps_v5`):** Requires nested virtualization (`KVM`), which is only supported on specific Azure hypervisor sizes (e.g. `Standard_D4ps_v5` or larger with nested virtualization enabled).
- **Implementation Effort:** 6–8 weeks (Scheduled for Milestone G).

---

## 3. Comprehensive Approach Comparison Matrix

| Evaluation Dimension | Approach 1: Privileged + Wrapper + Isolate (Current) | Approach 2: `cap_add: [SYS_ADMIN]` | Approach 3: Bare VM Worker | Approach 4: MicroVMs (Firecracker / Kata) |
| :--- | :--- | :--- | :--- | :--- |
| **Security Isolation Level** | Medium (In-depth jail inside privileged container) | Medium-Low (Privilege illusion; equivalent escape surface) | Medium (Direct OS sandbox, no container layer) | **Maximum (Hardware KVM virtualization)** |
| **Blast Radius** | Host VM Root (if double-escape occurs) | Host VM Root (if double-escape occurs) | Host VM User/Root | **None (Ephemeral MicroVM instance only)** |
| **SEC-001 Resolution** | **Unresolved (Mitigated via Defense-in-Depth)** | **Unresolved (Fragile bypass)** | **Unresolved (Direct host)** | **RESOLVED (True hardware isolation)** |
| **Upstream Judge0 v1.13.1 Fit**| **100% Native & Verified** | Highly Unstable | Complex (Non-Docker) | Requires custom runner architecture |
| **ARM64 Azure `D2ps_v5` Fit** | **Optimal (Low memory, verified)** | Medium | Low reproducibility | Incompatible with `D2ps_v5` without nested KVM |
| **Operational Overhead** | Minimal (Standard Docker Compose) | High (Constant debugging) | Extreme (Host package drift) | Moderate (Hypervisor daemon management) |
| **Implementation Timeline** | **Completed & Verified (Milestone B)** | 2–3 weeks | 3–4 weeks | **6–8 weeks (Milestone G Target)** |

---

## 4. Final Security Decision & Roadmap Recommendations

### 1. Decision for Phase C (Staging VM Deployment)
**Proceed with Approach 1 (Privileged Container + Isolate Wrapper + Inner SUID Jail)** for the upcoming Phase C Staging Deployment, subject to the following **mandatory non-negotiable staging boundaries**:
1. **Dedicated Disposable Infrastructure:** The staging VM (`testforge-judge0-staging`) must remain a single-purpose sandbox instance. It must NOT host the PostgreSQL production database, Redis production caches, or backend application servers.
2. **Zero Inbound/Outbound Production Connectivity:** The VM network security group must drop all outbound connections to Azure management endpoints, metadata services (`169.254.169.254`), and external internet networks except necessary Ubuntu/Docker package repositories during provisioning.
3. **Defense-in-Depth Wrapper:** The hardened wrapper [`isolate-wrapper.sh`](file:///D:/TestForge/deploy/judge0/docker/isolate-wrapper.sh) with zero-egress enforcement and strict argument allowlisting must be active for all execution paths.

### 2. Decision for Production Deployment (Milestone G)
**Approach 1 is NOT approved for multi-tenant production.**  
Before general production release with sensitive institutional and student examination data:
1. Milestone G will transition the execution engine to **Approach 4 (MicroVM isolation via Firecracker or Rootless Cgroups v2 with User Namespaces)**.
2. Re-architect the backend runner service to delegate grading jobs to ephemeral microVM instances, fully closing SEC-001.
