# 📋 TestForge — System & Terminal Execution Requirements

This document outlines all software, runtime, and terminal command requirements to install, configure, and execute the **TestForge** platform on any operating system (Windows, macOS, Linux).

---

## 💻 1. Core System Prerequisites

| Requirement | Minimum Version | Recommended | Purpose | Verify Command |
| :--- | :--- | :--- | :--- | :--- |
| **Node.js** | `v18.0.0` | `v20.x` or `v22.x` | Backend runtime & Frontend build tooling | `node -v` |
| **npm** | `v9.0.0` | `v10.x+` | Package manager | `npm -v` |
| **MongoDB** | `v6.0+` / Atlas | MongoDB Atlas (Cloud) | Main document database (Questions, Tests, Users) | `mongosh --version` |
| **Git** | `v2.30+` | Latest | Version control | `git --version` |

> [!NOTE]
> **MongoDB is already pre-configured:** The `server/.env` file is already connected to a managed MongoDB Atlas cloud cluster, so running a local MongoDB instance is **optional**.

---

## ⚙️ 2. Optional Language Runtimes (For Code Runner & Mutation Lab)

TestForge supports isolated in-process code execution for student reference solutions and mutation test suites across 4 languages:

| Language | Runtime / Compiler | Purpose | How to Verify | Optional Fallback |
| :--- | :--- | :--- | :--- | :--- |
| **JavaScript** | Built-in Node.js VM | Executes JS questions & test assertions | `node -v` | Always available |
| **Python** | Python 3.9+ | Executes Python questions with test runner | `python --version` or `python3 --version` | Native Python installation |
| **Java** | OpenJDK / Oracle JDK 17+ | Compiles & runs Java reference solutions | `javac --version` & `java --version` | Add JDK to system PATH |
| **C++** | GCC / G++ (MinGW on Win, clang/gcc on Unix) | Compiles & executes C++ code | `g++ --version` | MinGW-w64 or Xcode tools |

---

## 🌐 3. Network Ports & Firewall Requirements

Make sure the following local ports are free before starting:

| Port | Service | Configuration File |
| :--- | :--- | :--- |
| **`5000`** | TestForge Express REST API | `server/.env` (`PORT=5000`) |
| **`5173`** | TestForge React + Vite Frontend | `client/vite.config.js` (`port: 5173`) |
| **`27017`** | Local MongoDB (Only if using local Mongo) | `docker-compose.yml` |

---

## 🔑 4. Environment Configuration (`server/.env`)

Ensure `server/.env` contains the required keys:

```env
PORT=5000
NODE_ENV=development
MONGODB_URI=mongodb+srv://<username>:<password>@cluster0.mongodb.net/testforge?retryWrites=true&w=majority
JWT_SECRET=super_secure_testforge_secret_key_change_in_production_min_32_chars
JWT_EXPIRES_IN=30d
CLIENT_ORIGIN=http://localhost:5173
```

---

## 🚀 5. Terminal Execution Commands (Step-by-Step)

### Option A: One-Click Launchers (Easiest)

- **On Windows**:
  Double-click `run-dev.bat` or run in PowerShell:
  ```powershell
  .\run-dev.ps1
  ```
- **On macOS / Linux**:
  ```bash
  chmod +x run-dev.sh
  ./run-dev.sh
  ```

---

### Option B: Step-by-Step Terminal Execution

#### Step 1: Install Dependencies
From the repository root (`D:\TestForge`):
```bash
npm run install:all
```
*Or install individually:*
```bash
cd server && npm install
cd ../client && npm install
```

#### Step 2: Seed Demo Questions & Test Cases (Optional)
Populates your database with sample LeetCode-style questions, reference solutions, and test cases:
```bash
# From root:
npm run seed

# Or directly in server:
cd server
node scripts/seed.js
```

#### Step 3: Start Backend API (Terminal 1)
```bash
# From root:
npm run dev:server

# Or inside server directory:
cd server
npm run dev
```
> Server will boot at: **`http://localhost:5000`**  
> Health check: **`http://localhost:5000/api/v1/health`**

#### Step 4: Start Frontend Client (Terminal 2)
```bash
# From root:
npm run dev:client

# Or inside client directory:
cd client
npm run dev
```
> Frontend will boot at: **`http://localhost:5173`**  
> (Vite automatically proxies `/api` calls to `http://localhost:5000`)

---

## 🧪 6. Testing & Build Commands

| Task | Terminal Command | Description |
| :--- | :--- | :--- |
| **Run Backend Unit & Integration Tests** | `npm test` or `npm --prefix server run test` | Runs Jest test suite with Supertest |
| **Build Frontend for Production** | `npm run build` or `npm --prefix client run build` | Compiles Vite React bundle into `client/dist/` |
| **Preview Production Frontend** | `npm --prefix client run preview` | Serves production build locally |
| **Docker Multi-Container Run** | `docker compose up --build` | Runs MongoDB, API, and Client in containers |

---

## 🛠️ 7. Troubleshooting Common Terminal Issues

1. **Port 5000 or 5173 Already in Use (`EADDRINUSE`)**:
   - **Windows PowerShell**:
     ```powershell
     Get-Process -Id (Get-NetTCPConnection -LocalPort 5000).OwningProcess | Stop-Process -Force
     ```
   - **macOS / Linux**:
     ```bash
     lsof -ti:5000 | xargs kill -9
     ```

2. **MongoDB Connection Timeout**:
   - Verify internet access (for MongoDB Atlas cloud connection).
   - If using local MongoDB, ensure the service is running (`mongod` or `docker compose up mongodb -d`).

3. **Compiler Not Found (`javac` or `g++`)**:
   - If compiling Java or C++ questions in Mutation Lab, verify `javac` and `g++` are on your system PATH (`where javac` or `where g++`).
   - JavaScript and Python questions run out of the box with standard Node.js and Python.
