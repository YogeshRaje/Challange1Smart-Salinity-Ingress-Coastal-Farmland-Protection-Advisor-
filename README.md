# 🌊 Smart Salinity Ingress – Coastal Farmland Protection Advisor

An **Agentic AI solution** powered by **IBM watsonx.ai** with a multi-agent architecture to monitor soil and groundwater salinity trends in Gujarat coastal districts (Bhavnagar, Jamnagar, Kutch), recommend salt-tolerant crops, and guide farmers on land reclamation and irrigation.

---

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                  Frontend (JavaScript)                  │
│          Interactive Dashboard for Farmers              │
└───────────────────────┬─────────────────────────────────┘
                        │ REST API / WebSocket
┌───────────────────────▼─────────────────────────────────┐
│            Orchestrator Agent (IBM watsonx.ai)           │
│     Routes queries → Delegates to specialist agents     │
└─────┬──────────┬──────────┬────────────┬────────────────┘
      │          │          │            │
┌─────▼──┐ ┌────▼───┐ ┌────▼───┐ ┌──────▼──────┐
│Salinity│ │ Crop   │ │  Land  │ │ Irrigation  │
│Monitor │ │Recomm. │ │Reclam. │ │  Advisory   │
│ Agent  │ │ Agent  │ │ Agent  │ │   Agent     │
└────────┘ └────────┘ └────────┘ └─────────────┘
```

## 🤖 Multi-Agent System

| Agent | Role |
|-------|------|
| **Orchestrator** | Routes farmer queries, coordinates agents, synthesizes responses |
| **Salinity Monitor** | Analyzes EC/pH trends, groundwater depth, seasonal patterns |
| **Crop Recommendation** | Suggests salt-tolerant crops based on soil ECe levels |
| **Land Reclamation** | Guides gypsum treatment, leaching, drainage, bio-remediation |
| **Irrigation Advisory** | Recommends drip/sprinkler scheduling, water quality management |

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- IBM watsonx.ai API Key & Project ID

### Installation

```bash
# Clone and install
npm install

# Configure environment
cp .env.example .env
# Edit .env with your IBM watsonx.ai credentials

# Start backend
npm run server

# Open frontend
open public/index.html
```

### Environment Variables

```env
WATSONX_API_KEY=your_ibm_watsonx_api_key
WATSONX_PROJECT_ID=your_project_id
WATSONX_URL=https://us-south.ml.cloud.ibm.com
WATSONX_MODEL_ID=ibm/granite-13b-instruct-v2
PORT=3000
```

## 📁 Project Structure

```
├── agents/
│   ├── orchestratorAgent.js      # Master coordinator agent
│   ├── salinityMonitorAgent.js   # Salinity trend analysis
│   ├── cropRecommendationAgent.js # Salt-tolerant crop advisor
│   ├── landReclamationAgent.js   # Soil restoration guidance
│   └── irrigationAdvisoryAgent.js # Water management advisor
├── services/
│   ├── watsonxService.js         # IBM watsonx.ai LLM integration
│   ├── salinityDataService.js    # Sensor/field data management
│   └── agentToolsService.js      # Shared agent tools & functions
├── routes/
│   └── api.js                    # REST API endpoints
├── data/
│   └── sampleData.js             # Gujarat district mock sensor data
├── public/
│   ├── index.html                # Main dashboard
│   ├── css/style.css             # Responsive styles
│   └── js/
│       ├── app.js                # Main application logic
│       ├── dashboard.js          # Charts & visualizations
│       ├── chatbot.js            # AI chat interface
│       └── map.js                # Gujarat district map
├── server.js                     # Express server entry point
├── package.json
└── .env.example
```

## 🌾 Features

- **Real-time Salinity Dashboard** — EC/pH trend charts per district
- **AI Chat Interface** — Natural language queries to the multi-agent system  
- **Crop Calendar** — Salt-tolerance based planting recommendations
- **Field Assessment** — Submit GPS coordinates for localized analysis
- **Reclamation Planner** — Step-by-step soil restoration guides
- **Irrigation Scheduler** — Optimized irrigation plans with water quality advisories
- **Alert System** — Threshold-based salinity ingress warnings

## 🌍 Target Districts

- **Kutch** — Severe salinity, Rann salt flats ingress
- **Jamnagar** — Coastal aquifer salinization  
- **Bhavnagar** — Gulf of Khambhat tidal ingress

## 📊 Salinity Scale Reference

| ECe (dS/m) | Classification | Suitable Crops |
|------------|----------------|----------------|
| 0–2 | Non-saline | All crops |
| 2–4 | Slightly saline | Most crops |
| 4–8 | Moderately saline | Salt-tolerant crops |
| 8–16 | Strongly saline | Highly tolerant only |
| >16 | Extremely saline | Halophytes only |
