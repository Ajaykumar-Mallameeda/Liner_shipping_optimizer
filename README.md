# 🚢 AI-Driven Liner Shipping Network Optimization System

A distributed maritime optimization platform for large-scale liner shipping network design, fleet allocation, routing optimization, and real-time orchestration using hybrid Genetic Algorithms (GA), Mixed Integer Linear Programming (MILP), and multi-agent optimization workflows.

---

# 📌 Overview

The **AI-Driven Liner Shipping Network Optimization System** is an enterprise-style maritime optimization framework designed to solve complex vessel routing and shipping service design problems across dense global shipping networks.

The platform decomposes large maritime optimization problems into regional subproblems using geographic clustering and executes parallel optimization workflows through a distributed multi-agent orchestration pipeline.

The system combines:

* Hybrid GA + MILP optimization
* Multi-agent orchestration
* Real-time optimization telemetry
* WebSocket streaming
* FastAPI backend services
* Regional decomposition workflows
* Interactive optimization dashboards
* Containerized deployment infrastructure

---

# 🏗️ System Architecture

## High-Level Optimization Pipeline

```text
WebSocket Client
        ↓
FastAPI Backend
        ↓
RealOrchestratorIntegration
        ↓
OrchestratorAgent
        ↓
Port Clustering (K-Means)
        ↓
Regional Problem Decomposition
        ↓
Parallel Regional Agents
        ↓
Service Generation
        ↓
Hierarchical Genetic Algorithm
        ↓
Hub-Based MILP Optimization
        ↓
Coordinator Agent
        ↓
Global Aggregation
        ↓
Real-Time Dashboard Streaming
```

---

# ⚙️ Core Features

## 🌍 Distributed Maritime Optimization

* Large-scale liner shipping optimization
* Parallel regional optimization execution
* Multi-agent orchestration framework
* Global fleet allocation workflows

## 🧠 Hybrid Optimization Engine

* Genetic Algorithm service selection
* Frequency optimization
* MILP-based routing optimization
* Hub-and-spoke routing decomposition

## 📡 Real-Time Backend Infrastructure

* FastAPI backend services
* WebSocket telemetry streaming
* Event-driven optimization updates
* Live orchestration monitoring

## 📊 Interactive Dashboard

* Real-time optimization visualization
* Service-level analytics
* Regional optimization tracking
* Pipeline execution monitoring

## 🐳 Deployment Infrastructure

* Docker containerization
* Kubernetes-ready architecture
* Async orchestration support
* Production scalability planning

---

# 🧩 Repository Structure

```text
shipping_optimizer/
│
├── backend/                # FastAPI backend and orchestration APIs
├── frontend/               # Dashboard frontend (Vite + Tailwind)
├── src/                    # Core optimization engine
├── tests/                  # Optimization and orchestration tests
├── docs/                   # System documentation
├── logs/                   # Runtime logs
├── data/                   # Input datasets
├── graphify-out/           # Graph analysis outputs
├── Dockerfile              # Container configuration
├── requirements.txt        # Python dependencies
└── SYSTEM_ARCHITECTURE_ANALYSIS.md
```

---

# 🧠 Optimization Workflow

## 1. Problem Decomposition

The system first analyzes the shipping network and decomposes it into regional optimization workloads using:

* Geographic K-Means clustering
* Origin-based regional assignment
* Demand conservation validation
* Zero-duplication splitting

---

## 2. Service Generation

Each regional agent generates candidate shipping services using:

* Direct services
* Hub loops
* Feeder routes
* Trunk routes

---

## 3. Genetic Algorithm Optimization

The GA layer performs:

* Service selection
* Frequency optimization
* Coverage maximization
* Cost minimization

### Optimization Targets

* Profitability
* Demand coverage
* Fleet utilization
* Operating efficiency

---

## 4. MILP Routing Optimization

The MILP engine performs:

* Hub routing optimization
* Flow assignment
* Transfer-pair routing
* Capacity balancing

---

## 5. Coordination Layer

The coordinator agent handles:

* Conflict detection
* Regional overlap resolution
* Feedback-driven optimization
* Global metrics aggregation

---

# 🧪 Technologies Used

## Backend & Systems

* Python
* FastAPI
* AsyncIO
* WebSockets
* SQLite

## Optimization

* Genetic Algorithms
* MILP
* PuLP
* K-Means Clustering

## Frontend

* Vite
* TailwindCSS
* JavaScript

## Infrastructure

* Docker
* Kubernetes-ready deployment

## AI & Orchestration

* Multi-Agent Systems
* LLM-assisted orchestration
* Runtime governance

---

# 📂 Important Modules

## Backend

### `backend/main.py`

Main FastAPI server entry point.

### `backend/real_orchestrator_integration.py`

Integrates orchestration workflows with optimization agents.

### `backend/pipeline_streamer.py`

Handles real-time optimization event streaming.

---

## Optimization Engine

### `src/optimization/hierarchical_ga.py`

Hybrid hierarchical genetic algorithm implementation.

### `src/optimization/hub_milp.py`

MILP-based hub routing optimizer.

### `src/decomposition/port_clustering.py`

Geographic decomposition using K-Means.

---

# 📊 Dashboard Features

The frontend dashboard provides:

* Optimization telemetry
* Real-time event visualization
* Pipeline monitoring
* Regional optimization insights
* Service analytics
* Runtime orchestration tracking

---

# 🚀 Installation

## Clone Repository

```bash
git clone https://github.com/112301021/Liner_shipping_optimizer.git
cd Liner_shipping_optimizer/shipping_optimizer
```

---

## Backend Setup

```bash
pip install -r requirements.txt
```

Run backend:

```bash
python backend/main.py
```

---

## Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

---

# 🐳 Docker Deployment

Build container:

```bash
docker build -t liner-shipping-optimizer .
```

Run container:

```bash
docker run -p 8000:8000 liner-shipping-optimizer
```

---

# 🧪 Testing

Run optimization tests:

```bash
pytest tests/
```

Available tests include:

* Clustering tests
* GA optimization tests
* MILP routing tests
* Orchestrator tests
* Service generation tests
* LLM integration tests

---

# 📈 Scalability Considerations

The system includes architectural planning for:

* Distributed optimization execution
* Regional parallelization
* Runtime caching
* Async orchestration
* Kubernetes deployment
* Redis integration
* Horizontal scaling

---

# ⚠️ Current Challenges

Identified optimization bottlenecks include:

* Transfer-pair explosion in dense networks
* MILP variable scaling
* Distance matrix memory growth
* Sequential iteration dependencies
* WebSocket synchronization overhead

Detailed analysis is documented in:

```text
SYSTEM_ARCHITECTURE_ANALYSIS.md
ARCHITECTURE_AUDIT_REPORT.md
```

---

# 🔬 Research & Engineering Focus

This project explores:

* Maritime logistics optimization
* Large-scale routing systems
* Multi-agent orchestration
* Distributed optimization
* AI-assisted planning systems
* Real-time optimization telemetry
* Hybrid optimization architectures

---

# 📚 Documentation

Additional documentation available in `/docs`:

* Developer Guide
* Runbook
* FAQ
* System Architecture
* Data Dictionary

---

# 🛠️ Future Improvements

Planned enhancements:

* Redis caching layer
* Full async orchestration
* PostgreSQL migration
* Advanced telemetry
* Adaptive GA tuning
* Distributed MILP solving
* Production-grade WebSocket manager

---

# 👨‍💻 Author

Ajay Kumar Mallameeda
Indian Institute of Technology Palakkad

---

# 📜 License

This project is intended for academic, research, and engineering exploration purposes.
