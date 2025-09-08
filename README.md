# 🚀 shikamaru CLI

> **Spin up multi-repo dev environments** with **env management**, **port allocation**, **Docker/Hybrid orchestration**, and **real-time log streaming** via terminal or web UI.

[![npm version](https://img.shields.io/npm/v/shikamaru.svg?style=flat)](https://www.npmjs.com/package/shikamaru) ![Node >=16](https://img.shields.io/badge/node-%3E%3D16-green) ![Docker required](https://img.shields.io/badge/docker-required-blue) ![Status](https://img.shields.io/badge/status-beta-yellow)

---

## 📑 Table of Contents

- [Overview](#overview)
- [Installation](#-installation)
- [Quick Start](#-quick-start)
- [Commands](#-commands)
- [Configuration](#-configuration)
- [Environment management](#-environment-management)
- [Infra decision matrix: Docker vs external](#-infra-decision-matrix-docker-vs-external)
- [Port management](#-port-management)
- [Execution modes](#-execution-modes)
- [Logging and the web UI](#-logging-and-the-web-ui)
- [Troubleshooting](#-troubleshooting)
- [Contributing](#-contributing)
- [License](#-license)

---

## 🔎 Overview

shikamaru CLI helps developers run **multi-service environments** locally or in Docker with:

- 📂 **Repo discovery & selection** (interactive prompts)
- ⚙️ **`.env` auto-generation** from `.env.example` templates
- 🔌 **Port allocation & conflict resolution** (persisted per profile)
- 🐳 **Docker & Hybrid orchestration**
- 📡 **Terminal or Web log viewer** (Express + Socket.IO)

**Requirements**

- Node.js ≥ 16
- npm ≥ 8
- Docker (for `docker` / `hybrid` modes)

---

## 🧩 Installation

You can use the CLI directly from this repository or install it globally.

### Prerequisites

- Node.js >= 16
- Docker (for Docker/hybrid modes)

### Global (recommended)

```bash
npm install -g shikamaru
```

### Local (from repo)

```bash
npm install
npm run build
npm start
```

## 🚀 Quick Start

1. In your projects directory, create a `global.env` , `frontend.global.env` with required env values across selected backend/frontend services.
   and To load Azure variable groups, include the following (if applicable):

```bash
ORG=
PROJECT=
AZURE_PERSONAL_ACCESS_TOKEN=
```

2. Run the CLI from your projects root:

```bash
cd ~/workspace/company
maro start
```

What happens:

1. Environment validation (Node, Docker availability, basic checks)
2. Interactive selection of repositories and execution mode (local | docker | hybrid)
   - the tool detects default start and build/install commands from dockerfile
   - the user could overwrite any command for any repo to be run with
3. Ports allocation or reuse with conflict resolution (saved to a file)
4. Env generation per repo from `.env.example`
5. Service execution and logging setup (terminal or web UI)

Open the web UI when prompted, or watch logs in the terminal (based on selection).

---

## 🛠️ Commands

- start: Start the development environment
- profile: Manage saved profiles (list/show/delete/clear)
- help: Show usage help
- version: Show CLI version

Note: Some help text may mention future commands like `logs`, `status`, or `monitor` – these are not enabled in this version.

### Global options

- -v, --verbose: Verbose logging
- --projects-dir <path>: Base directory containing your repositories (default: current directory or `PROJECTS_DIR`)
- --skip-cloud: Skip loading variables from cloud providers (e.g., Azure) and skip tier prompts
- -p, --profile <name>: Load a saved profile by name and skip interactive selection

Environment variables:

- PROJECTS_DIR: Base directory for project discovery

Examples:

```bash
maru start --projects-dir /path/to/projects
maru start --verbose
maru start --skip-cloud
maru start --profile "my-team"
```

---

## Project discovery and profiles

The CLI scans your `--projects-dir` (or `PROJECTS_DIR`) for repositories you want to include. It walks you through selecting repos and choosing an execution mode for each (local | docker | hybrid, plus global defaults).

You can save these choices as a profile and reuse them with `--profile <name>`.

Profiles capture:

- Selected repositories
- Cloud loading preference (skip or not)
- Execution modes (per repo and global)
- Logging mode (web or terminal)
- Port reuse preference

---

## Configuration

The configuration is managed internally via a unified configuration model. Most users configure through the interactive prompts, but these are the core concepts:

- Global mode: `local` | `docker` | `hybrid`
- Projects directory: where your repositories live
- Repo configs: execution mode per repo (override global)
- Logging config: `web` or `terminal`
- Health checks and auto-stop (where applicable)
- Docker compose generation options

You’ll see the effect of your choices reflected in:

- Generated `.env` files in each selected repo
- A persisted ports map for consistent port allocations
- A generated unified Docker Compose file when Docker/hybrid is selected

---

## 🌱 Environment management

The Env Manager resolves variables to produce a real `.env` for each repo based on its `.env.example`.

Sources it can use:

- Global backend/front variables:
  - `global.env` (backend-only variables)
  - `global.frontend.env` (frontend variables)
    Place these files at the root of your `projectsDir`.
- Cloud providers: Azure provider(s). Disable with `--skip-cloud`.
- Local values override cloud when both are present.
- Smart defaults for common services (Postgres, TimescaleDB, Redis, RabbitMQ). For example, when it detects internal/local settings, it applies safe local defaults like:
  - Postgres at `postgres:5432`
  - TimescaleDB at `timescaledb:5432`
  - Redis connections pointing to `localhost:6379`
  - RabbitMQ at `localhost:5672`

Output:

- For each selected repo with `.env.example`, a `.env` file is generated in that repo directory.

Tips:

- If a repo has no `.env.example`, it’s skipped with a warning.
- Use `--skip-cloud` for fully-local development with only local defaults and your `global.env` files.

---

## 🧠 Infra decision matrix: Docker vs external

When deciding whether to spin up databases/queues in Docker or use external endpoints, the tool infers intent from your resolved environment (global.env, cloud providers, `.env.example` values) and sets an internal services set. A service is provisioned in Docker only when it is classified as internal for both Local and Cloud sources.

| Service     | Keys evaluated (examples)                                                                                                                                          | Internal when… (host)                                                                                 | External when… (host)                                          | Provisioned in Docker when…              | External example                                   | Docker default example                                                             |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ---------------------------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Postgres    | `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_USERNAME`, `POSTGRES_PASSWORD`, `POSTGRES_DATABASE`, `DATABASE_URL`                                                    | Host is empty/whitespace, `localhost`, `127.0.0.1`, `::1`, or contains `internal`, `local`, `cluster` | Host clearly points outside local/docker (corp, cloud, SaaS)   | Both Local and Cloud resolve as internal | `postgresql://user:pass@corp-db.acme.com:5432/app` | `postgresql://default_user:default_password@postgres:5432/default_db`              |
| TimescaleDB | `POSTGRES_TIMESCALE_HOST`, `POSTGRES_TIMESCALE_PORT`, `POSTGRES_TIMESCALE_USERNAME`, `POSTGRES_TIMESCALE_PASSWORD`, `POSTGRES_TIMESCALE_DATABASE`, `TIMESCALE_URL` | Same internal rules                                                                                   | Same external rules                                            | Both Local and Cloud resolve as internal | `postgresql://u:p@ts-prod.example.net:5432/tsdb`   | `postgresql://default_user:default_password@timescaledb:5432/default_timescale_db` |
| Redis       | Any `*_REDIS_CONNECTION_URL`, `REDIS_CONNECTION_URL`, `REDIS_HOST`, `REDIS_PORT`                                                                                   | Same internal rules                                                                                   | Host/URL is `redis.example.com`, `rediss://...`, VPC endpoints | Both Local and Cloud resolve as internal | `redis://redis.use1.cache.amazonaws.com:6379`      | `redis://redis:6379`                                                               |
| RabbitMQ    | `RABBITMQ_HOSTNAME`, `RABBITMQ_PORT`, `RABBITMQ_USERNAME`, `RABBITMQ_PASSWORD`, `RABBITMQ_URL`                                                                     | Same internal rules                                                                                   | Host/URL is managed/SaaS MQ, corp hostname                     | Both Local and Cloud resolve as internal | `amqp://user:pass@mq.company.local:5672`           | `amqp://guest:guest@rabbitmq:5672`                                                 |

Notes:

- Precedence: cloud providers and `global.env` override `.env.example` defaults. If those resolve to external endpoints, the service is considered external and won’t be added to Docker compose.
- Local defaults: when values look empty, internal, or explicitly docker-hosted (e.g., `postgres`, `timescaledb`, `redis`, `rabbitmq`), the service is marked internal and added to compose with health checks.
- Hybrid/local modes: only required infra is started. Externalized services are assumed to be reachable and are not provisioned in Docker.
- Forcing behavior:
  - Force external: set the relevant host/URL to your managed endpoint in `global.env` or cloud.
  - Force Docker: leave host empty/whitespace or use the internal docker hostnames shown above (e.g., `postgres`, `timescaledb`, `redis`, `rabbitmq`).

---

## 🔌 Port management

Ports are allocated per service to avoid conflicts and persisted for stability between runs.

- Default range: 4000–5000 (host)
- Internal port (container/app): defaults to 3000 unless inferred per mode
- Persistence file: saved as `ports-map.json` in your `projectsDir`
- Validates for conflicts and can auto-resolve

Example persisted file format (simplified):

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

If you prefer reusing previous allocations, choose port reuse when prompted; otherwise, a fresh allocation will be generated.

---

## 🚦 Execution modes

You can run repos locally, in Docker, or mix them in hybrid mode.

- Local: Runs your apps on the host, using allocated ports
- Docker: Generates a unified compose with app services + required infra
- Hybrid: Some repos local, some in Docker; infra is in Docker as needed

### Unified Docker Compose workflow

When Docker/hybrid is selected, the CLI:

1. Detects Dockerfiles in repos configured for Docker mode
2. Generates a single `docker-compose.unified.yml` in the current working directory
3. Builds and starts services, printing progress with health checks
4. Streams Docker logs to the logging subsystem

Infra services are added on-demand (e.g., Redis, RabbitMQ, Postgres, TimescaleDB) with health checks. Application services depend on infra health when present.

Stopping services will gracefully bring down the unified compose.

---

## 📺 Logging and the web UI

There are two logging modes:

- Web: Launches an Express server with Socket.IO and serves the React UI
- Terminal: Streams colored logs in an interactive terminal viewer

When web logging is enabled, the Express API serves the UI and a Socket.IO endpoint:

- Web UI: printed as `http://localhost:<port>` (defaults to 3015, increments if busy)
- Socket.IO: `http://localhost:<port>/socket.io`

The web app provides:

- Real-time log stream with virtualization
- Filters by service, level, and search
- Pause/resume, clear, and per-service stats

You can also develop the React app independently under `src/react-log-viewer`:

```bash
cd src/react-log-viewer
npm install
npm run dev
# Optionally set VITE_BACKEND_URL to the Express server URL
```

---

## 🧯 Troubleshooting

- Node.js: Ensure Node >= 16 (`node -v`)
- Docker: Verify Docker is running and you have permission to use it
- Ports: If a port conflict occurs, the server will attempt the next port automatically
- Compose errors: Review CLI output; common issues include missing Dockerfiles, image pulls, or permission errors
- Cloud variables: Use `--skip-cloud` to force local defaults

---

## 🤝 Contributing

PRs and issues are welcome. Keep code readable and modular.

---

## 📄 License

MIT © 2025 
