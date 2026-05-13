# Demo Guide: Oracle AI Database + GCP Vertex AI Agentic RAG

## Overview
This demo showcases a cutting-edge **Retrieval-Augmented Generation (RAG)** architecture that bridges enterprise data in **Oracle Database 26ai** with the generative power of **Google Cloud Vertex AI**. It demonstrates how a Node.js-based agentic workflow can provide high-fidelity, grounded answers to complex technical and business questions by performing real-time vector similarity searches on internal documentation.

## Value Proposition
- **Enterprise Grounding:** Prevent AI hallucinations by grounding responses in your own Oracle Database data.
- **Unified Ecosystem:** Seamlessly integrate Oracle's industry-leading data platform with Google's state-of-the-art Gemini models.
- **Agentic Ready:** Built with an OpenAPI-first approach, making it ready to be plugged into Gemini CLI, Dialogflow CX, or custom Agentic workflows.
- **Modern Tech Stack:** Leverages the latest Oracle 26ai Vector Search and Vertex AI Gemini 1.5 Flash.

## Architecture
The demo follows a high-performance RAG pipeline:
1.  **Ingestion:** Enterprise docs (PDFs/Text) are chunked and embedded via Vertex AI `text-embedding-004`.
2.  **Storage:** Vectors are stored in Oracle 26ai using the new `VECTOR` data type.
3.  **Retrieval:** At query time, the agent performs a `VECTOR_DISTANCE` search in Oracle to find relevant context.
4.  **Generation:** Gemini 1.5 Flash synthesizes the answer using the retrieved context.

## Prerequisites
- Node.js & Oracle Instant Client
- Oracle Database 26ai (OCI or Local)
- Google Cloud Project with Vertex AI enabled
- Authenticated GCP environment (`gcloud auth application-default login`)

## Setup & Deployment
1.  **Clone & Install:**
    ```bash
    npm install
    ```
2.  **Configure `.env`:**
    Set `DB_USERNAME`, `DB_PASSWORD`, `DB_DSN`, and `GCP_PROJECT_ID`.
3.  **Database Initialization:**
    Run `sql/setup.sql` to prepare the vector store.
4.  **Start the Engine:**
    ```bash
    npm start
    ```

---

## Demo Script: Step-by-Step Walkthrough

### 1. The "Cold Start" Problem
**Narrative:** "Imagine a new employee asking a complex technical question about our proprietary database configurations. A standard LLM might hallucinate or give a generic answer."
- **Action:** Show a query failing or giving a generic response without RAG.

### 2. Intelligent Retrieval
**Narrative:** "Now, let's watch our Agentic RAG in action. When I ask about 'JSON Relational Duality', the agent doesn't just guess. It searches our Oracle 26ai Vector Store."
- **Action:** 
    ```bash
    curl -X POST http://localhost:8080/api/v1/query \
      -d '{"question": "Explain JSON Relational Duality in Oracle 26ai"}'
    ```
- **Observation:** Point out the "Context Chunks" in the console output. Show how the agent retrieved specific paragraphs from the documentation.

### 3. Grounded Synthesis
**Narrative:** "The agent then passes this specific context to Gemini 1.5 Flash. The result is a highly accurate, technical response that cites our internal documents."
- **Observation:** Review the generated `answer` in the API response.

### 4. Agentic Integration (The "A2A" Story)
**Narrative:** "Because this demo exposes an OpenAPI spec at `/api-docs`, it can be instantly imported into Gemini CLI or Dialogflow as a tool."
- **Action:** Open `http://localhost:8080/api-docs` in the browser to show the schema.
- **Talking Point:** "This turns our Oracle Database into a 'living tool' that any AI agent can now use to solve problems."

---

## Key Talking Points
- **"Vector-Native Database":** Oracle 26ai isn't just a database with an add-on; it's a vector-native engine that handles billions of vectors alongside relational data.
- **"Vertex AI Performance":** Using `text-embedding-004` ensures our semantic search is as accurate as possible, supporting over 768 dimensions of meaning.
- **"From Insight to Action":** This isn't just a chatbot. It's the foundation for agents that can identify supply chain risks (via Oracle Graph) or visualize warehouse hotspots (via Oracle Spatial).

## Clean-up
- Stop the Node.js process (`Ctrl+C`).
- (Optional) Truncate the `RAG_TAB` table if using a shared environment.

---

## Expanding to Multi-Agent (A2A via Node.js)
**Narrative:** "To scale our AI capabilities, we've implemented an Agent-to-Agent (A2A) architecture using Node.js and the `@google-cloud/vertexai` SDK. We've converted the Java, Golang, and Python agents from the reference architectures into a unified Node.js multi-agent system."

### Specialized Agent Toolkit
We now have several specialized agents that the coordinator can seamlessly route to:
- **RAG Agent:** Handles semantic document lookups (runs on `app.js`).
- **Select AI Agent:** Translates NL to SQL to query inventory risks.
- **Graph Agent:** Retrieves supply chain properties and dependencies.
- **Spatial Agent:** Determines warehouse hotspots geographically.
- **Inventory Action Agent:** Drafts transfer operations and checks policies.
- **MCP Toolbox Database Tools:** Executes live SQL and retrieves schemas directly against Oracle using the GCP hosted Oracle MCP (`genai-toolbox`).

- **Action:** Start the MCP Toolbox Server, RAG Agent, and Coordinator Agent in separate terminals.
    ```bash
    # Terminal 1: Start GCP hosted Oracle MCP (genai-toolbox)
    toolbox --tools-file tools.yaml

    # Terminal 2: Start the Node.js RAG API
    npm start

    # Terminal 3: Start the Node.js Coordinator Agent
    node agents/coordinator-agent.js
    ```
- **Observation:** Show how the Coordinator Agent receives a user prompt, determines the required intent, calls the appropriate specialized tools (`query_oracle_rag_kb`, `get_supply_chain_graph`, etc.) using native Vertex AI tool calling, and synthesizes a final response. Try asking about the database structure: *"Show me the RAG table schema"* or *"What inventory action should we take for SKU-500?"* The coordinator will automatically fetch data via MCP and gather spatial evidence before drafting an action. This highlights composability and specialized agent capabilities in an enterprise context.
