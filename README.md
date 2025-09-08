# 🚀 shikamaru CLI

> **Spin up multi-repo dev environments** with **env management**, **port allocation**, **Docker/Hybrid orchestration**, and **real-time log streaming** (terminal & web UI).

[![npm version](https://img.shields.io/npm/v/shikamaru.svg?style=flat)](https://www.npmjs.com/package/shikamaru) ![Node >=16](https://img.shields.io/badge/node-%3E%3D16-green) ![Docker required](https://img.shields.io/badge/docker-required-blue) ![Status](https://img.shields.io/badge/status-beta-yellow)

---

## 📑 Contents

- [Overview](#overview)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Commands](#commands)
- [Profiles & Project Discovery](#profiles--project-discovery)
- [Configuration](#configuration)
- [Environment Management](#environment-management)
- [Infra: Docker vs External](#infra-docker-vs-external)
- [Port Management](#port-management)
- [Execution Modes](#execution-modes)
- [Logging & Web UI](#logging--web-ui)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [License](#license)

---

## 🔎 Overview

**shikamaru** makes local dev across multiple services painless:

- 📂 Auto-detect & select repos
- ⚙️ Generate `.env` from `.env.example`
- 🔌 Assign ports & avoid conflicts
- 🐳 Run in **local**, **docker**, or **hybrid** mode
- 📡 Stream logs in terminal or web UI

**Requirements**

- Node.js ≥ 16
- npm ≥ 8
- Docker (for docker/hybrid modes)

---

## 🧩 Installation

```bash
# Global (recommended)
npm install -g shikamaru

# Local (from repo)
npm install
npm run build
npm start
```

---

## 🚀 Quick Start

1. In your workspace, add `global.env` (backend vars) and `frontend.global.env` (frontend vars).  
   To load Azure variable groups, set:

   ```bash
   ORG=
   PROJECT=
   AZURE_PERSONAL_ACCESS_TOKEN=
   ```

2. Run from your projects root:

   ```bash
   maru start
   ```

3. The CLI will:
   - Check environment (Node, Docker, etc.)
   - Prompt repo & mode selection
   - Allocate/reuse ports
   - Generate `.env` files
   - Start services & log viewer

👉 Open the provided web URL or watch logs in terminal.

---

## 🛠️ Commands

| Command   | Description                  |
| --------- | ---------------------------- |
| `start`   | Start selected repos & infra |
| `profile` | Manage saved profiles        |
| `help`    | Show help                    |
| `version` | Show CLI version             |

**Global Options**

- `-v, --verbose` → verbose logging
- `--projects-dir <path>` → base directory (default: `PROJECTS_DIR` or cwd)
- `--skip-cloud` → ignore Azure/cloud vars
- `-p, --profile <name>` → reuse a saved profile

Examples:

```bash
maru start --verbose
maru start --projects-dir ~/workspace
maru start --skip-cloud
maru start --profile "frontend+api"
```

---

## 📂 Profiles & Project Discovery

- CLI scans `--projects-dir` for repos
- You pick repos & modes (local / docker / hybrid)
- Save as a **profile** for reuse

Profiles include:

- Selected repos
- Cloud env usage (on/off)
- Execution modes
- Logging mode (web/terminal)
- Port allocations

---

## ⚙️ Configuration

Configuration is interactive. Under the hood, it manages:

- Execution mode: `local` | `docker` | `hybrid`
- Projects dir
- Per-repo overrides
- Logging (terminal / web)
- Docker compose generation
- Health checks & auto-stop

Artifacts:

- `.env` files per repo
- `ports-map.json` (stable allocations)
- `docker-compose.unified.yml` (docker/hybrid)

---

## 🌱 Environment Management

Env files are built from:

1. **Global files**:
   - `global.env` (backend)
   - `frontend.global.env` (frontend)
2. **Cloud vars**: (Azure, optional)
3. **Local defaults** for infra:
   - Postgres → `postgres:5432`
   - TimescaleDB → `timescaledb:5432`
   - Redis → `localhost:6379`
   - RabbitMQ → `localhost:5672`

➡️ Local values always override cloud.  
➡️ If `.env.example` missing → skipped with warning.

---

## 🧠 Infra: Docker vs External

shikamaru decides whether to spin up infra in Docker:

| Service     | Provisioned in Docker when host is… | Example Docker default                                        |
| ----------- | ----------------------------------- | ------------------------------------------------------------- |
| Postgres    | empty / localhost / `postgres`      | `postgresql://default_user:default_password@postgres:5432`    |
| TimescaleDB | empty / localhost / `timescaledb`   | `postgresql://default_user:default_password@timescaledb:5432` |
| Redis       | empty / localhost / `redis`         | `redis://redis:6379`                                          |
| RabbitMQ    | empty / localhost / `rabbitmq`      | `amqp://guest:guest@rabbitmq:5672`                            |

To force external: set a real host (corp/cloud).  
To force Docker: leave host blank or use docker hostname.

---

## 🔌 Port Management

- Host ports allocated in **4000–5000** range
- Stable across runs via `ports-map.json`
- Auto-resolves conflicts

Example `ports-map.json`:

```json
[
  {
    "Service": "campaign-management",
    "Internal Port": 3000,
    "Host Port": 4136,
    "Mode": "docker"
  }
]
```

---

## 🚦 Execution Modes

- **Local** → runs services on host
- **Docker** → unified compose file for all
- **Hybrid** → some local, some docker

When Docker/hybrid:

1. Detects Dockerfiles
2. Generates `docker-compose.unified.yml`
3. Starts infra + services with health checks
4. Streams logs

Stopping brings everything down cleanly.

---

## 📺 Logging & Web UI

- **Terminal** → colored logs, interactive
- **Web** → Express + Socket.IO + React UI

Web UI features:

- Live log stream
- Filters (service, level, search)
- Pause / resume / clear
- Stats per service

Default: `http://localhost:3001` (auto-increments if busy).

---

## 🧯 Troubleshooting

- Ensure Node ≥ 16, Docker running
- Port conflicts → CLI retries next available
- Compose errors → check Dockerfiles, permissions
- For fully local env → `--skip-cloud`

---

## 🤝 Contributing

PRs/issues welcome. Keep code modular & clean.

---

## 📄 License

MIT © 2025
