# 🚀 Oracle AI Database + GCP Vertex AI Multi-Agent 
## Enterprise Demonstration & Execution Runbook

> **Document Version:** 2.0 (Rich UI Hub & Node.js Multi-Agent Architecture Integration)  
> **Target Audience:** Enterprise Architects, VPs of Engineering, C-Suite Executives, Cloud Data Strategists  
> **Duration:** 15–20 Minutes  

---

## 🌟 Executive Summary & Value Proposition

Modern enterprises face a critical bottleneck when deploying Generative AI: **Data Disconnection**. While state-of-the-art LLMs possess incredible semantic reasoning, they remain oblivious to secure, high-speed operational data residing inside specialized enterprise systems like Oracle Autonomous Databases.

This end-to-end technical demonstration showcases a fully operational **Agentic Data **. By bridging **Oracle Database 26ai** (featuring AI Vector Search and Database-Native Domain Agents) with **Google Cloud Vertex AI** (Gemini 1.5 Flash / Gemini 3.1 Flash multi-agent routing), we demonstrate how autonomous agents can natively coordinate, discover dynamically injected tools via the **Model Context Protocol (MCP)**, and generate high-fidelity, grounded enterprise actions without hallucination.

---

## 📋 Pre-Flight Presentation Checklist

Before walking onto the presentation stage or launching a live screen share, verify the local environment settings:

| Verification Target | Command / Action | Expected Outcome |
| :--- | :--- | :--- |
| **Node.js Environment** | `node -v` | v18.x or higher |
| **Environment Config** | Check `.env` presence | Contains `DB_DSN`, `GCP_PROJECT_ID` parameters |
| **GCP Authentication** | `gcloud auth application-default login` | User credentials mapped to local application settings |
| **Port Availability** | Check local TCP port `8080` | Unused / ready to bind |
| **MCP Server Profile** | Ensure `tools.yaml` is properly configured | Ready to load native Oracle schemas |

---

## 🎬 Demo Orchestration Setup (The Script Helper)

To eliminate terminal context-switching during a high-stakes demo, this repository provides an automated orchestration script: `run_demo.sh`. 

### Launching the Demo Platform

Open your favorite terminal application and execute:

```bash
chmod +x run_demo.sh
./run_demo.sh
```

An interactive terminal console menu will appear:
```text
==================================================================
   🚀 ORACLE AI DATABASE + GCP VERTEX AI DEMO ORCHESTRATOR
==================================================================
Please select an execution mode:
  1) 🌐 Start the Unified  Web Hub & Express API (Recommended)
  2) 💻 Start the Multi-Agent CLI Coordinator (Interactive Terminal)
  3) 🧪 Run Simulated Direct Database Connection Proof (scratch_test.js)
  4) 📦 Start Hosted Oracle MCP Toolbox Server (genai-toolbox)
  5) 🚪 Exit
==================================================================
```

**Select Option 1** to initialize the centralized platform. The service spins up immediately and exposes the modern **A2UI Enterprise Gateway** on **`http://localhost:8080`**.

---

## 🎭 Step-by-Step Narrative Script

### Scene 1: The Enterprise Disconnected Reality (The Hook)
> **Timebox:** 2 Minutes  
> **Presenter Screen:** Slides / Conceptual Architecture Diagram  

**Narrative:**  
*"Imagine an operational emergency: Global logistics detects a delay at the Port of Long Beach. A line-of-business manager immediately asks their standard generative AI chatbot: 'What are our inventory stockout risks for SKU-500, and how do we reroute stock?'"*

*"A generic model does one of two things: it returns an unhelpful apology stating it lacks real-time database access, or worse, it confidently hallucinates warehouse stock distributions based on out-of-date web training data. This is the enterprise 'Cold Start' challenge. Let's solve it by giving AI secure, native tool-calling access directly into our database core."*

---

### Scene 2: The Unified  Portal Walkthrough
> **Timebox:** 3 Minutes  
> **Presenter Screen:** Web Browser open to `http://localhost:8080`  

**Visual Actions & Talking Points:**
1. **Sidebar System Status:** Point out the green connected beacon labeled **Connected to 26ai**. This confirms active point-to-point secure validation between the microservice and the cloud engine.
2. **Admin Portal Tabs Walkthrough:**
   - **Data Sources:** Show the federated registries stack (`Oracle ERP`, `Spanner Retail`, `BigQuery Analytics`). Explain that the  doesn't centralize data physically; it connects dynamically.
   - **Agent Config:** Highlight the federated deployment model. Each domain agent maintains rigid data boundaries and specialized system prompts.
   - **MCP Toolbox:** Demonstrate how external database tools (`execute-sql`, `get-table-schema`) are discovered live without hardcoded SDK re-deployments.
3. **The Mode Switcher Toggle:** Highlight the top-right switcher (`Real Connections` vs `Simulation`). 
   - **Talking Point:** *"Enterprise data demonstrations can fail if conference WiFi drops or complex corporate firewalls block OCI/GCP VPC links. Our UI features built-in visual resilience. Presenters can seamlessly flip to 'Simulation Mode' to run live, multi-agent deterministic proofs safely on any stage."*

---

### Scene 3: Multi-Agent Coordination Trace in Action
> **Timebox:** 6 Minutes  
> **Presenter Screen:** Main **Agent Workspace** Tab  

**Narrative:**  
*"Let's submit the identical supply chain disruption prompt into our coordinated  and observe the trace logic unfold in real-time."*

**Action:**  
In the chat input field, paste or type the following complex operational request:
```text
What inventory action should we take for SKU-500?
```
Press **Enter** or click the Send Compass Icon.

#### 🔍 Observing the Trace Timeline Unfolding
Expand the right-hand **Coordination Trace** sidebar to reveal active micro-step updates:
1. **Step 1: Oracle AI Database Agent Execution**  
   - *Visual:* Node activates showing query into the database engine.  
   - *Backend:* Executes distinct checks inside Oracle 26ai, returning current stock metrics (`120 units`, `CRITICAL_STOCKOUT_RISK`).
2. **Step 2: Graph Agent Traversal**  
   - *Visual:* Trace node updates to `Graph Agent`.  
   - *Backend:* Traverses supply paths revealing that suppliers flow through the delayed port sector.
3. **Step 3: Spatial Agent Hotspot Mapping**  
   - *Visual:* Trace node updates to `Spatial Agent`.  
   - *Backend:* Maps spatial locations to locate the nearest available warehouse with excess safety capacity (`Austin Assembly`, `450 available`).
4. **Step 4: Inventory Action Agent Synthesis**  
   - *Visual:* Final trace resolution node.  
   - *Backend:* Generates an immutable transfer action draft ID.

#### 🎨 Observing Rich SDK Rendering Output
The final chat response injected into the stream isn't just plain markdown text. Highlight the high-fidelity UI elements rendered via the **A2UI Dynamic Content SDK**:
- **Interactive Supply Chain Network:** A crisp SVG dependency map illustrating nodes (`Supplier`, `Plant`, `Port`, `Warehouse`) and visually flagging the hotspot.
- **Grounded Spatial Map Overlay:** A beautifully themed interactive visual map displaying pulsing warning circles over Reno and green safe relief corridors connecting Austin.
- **Actionable Propose Card:** A fully formatted workflow item labeled `Draft Inventory Transfer`.
  - **Presenter Interactive Action:** Click the **Approve Transfer** button directly inside the chat stream. Show the interface update instantly to a success banner stating: *“Transfer proposal approved and dispatched to ERP!”* This proves end-to-end enterprise write capabilities.

---

### Scene 4: Visual Analytics On-Demand
> **Timebox:** 3 Minutes  
> **Presenter Screen:** Main **Agent Workspace** Tab  

**Narrative:**  
*"Executives rarely want to parse markdown tables; they want immediate visual intelligence. Because our Database-Native AI agent supports specialized tool generation, we can request programmatic visualizations directly."*

**Action:**  
Submit the following query into the workspace prompt:
```text
Generate a Stock Distribution Bar Chart for SKU-500 across our warehouses.
```

**Observation:**  
Watch the system resolve the request. The backend agent intercepts the visual prompt, delegates directly to the Oracle database agent engine, and dynamically injects a **responsive, interactive Chart.js canvas** natively inside the chat stream. Hover over the bar charts to showcase live data binding.

---

### Scene 5: Extensibility & Security Profile
> **Timebox:** 3 Minutes  
> **Presenter Screen:** Tabs: `Live Telemetry`, `API Keys`, and Browser Open to `http://localhost:8080/api-docs`  

**Talking Points:**
1. **Live Telemetry Review:** Click over to the `Live Telemetry` admin tab. Show the real-time stream of routing statements, proving complete LLM auditing and immutability for governance teams.
2. **OpenAPI Standard Endpoint:** Open a new browser tab directly to **`http://localhost:8080/api-docs`**.
   - *"Because our entire architecture is built OpenAPI-first, this schema file can be imported into Google Cloud Dialogflow CX, Vertex AI Agent Builder, or the Gemini CLI with zero additional engineering. We have effectively turned our operational database into an autonomous plug-and-play tool."*

---

## 🧹 Demo Clean-up Procedures

Once the presentation wraps up successfully:
1. Return to the running terminal orchestrator session.
2. Select **Option 5 (Exit)** or press `Ctrl+C` to gracefully terminate background Express worker pools.
3. (Optional) If running against a live pre-production database instance, clean up test vector records inside `sql/setup.sql` schemas.

---
*End of Runbook.*
