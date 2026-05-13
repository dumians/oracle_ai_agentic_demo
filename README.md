# Oracle AI Database + GCP Vertex AI E2E Demo (JavaScript)

This project is a JavaScript/Node.js implementation of a RAG (Retrieval-Augmented Generation) AI agent. It integrates **Oracle Database 26ai** vector storage with **Google Cloud Vertex AI** for intelligent question-answering.

## Architecture

1.  **Express.js API:** Provides REST endpoints for querying the agent.
2.  **Oracle Database 26ai:** Stores document chunks and their vector embeddings. Performs high-speed vector similarity search using `VECTOR_DISTANCE`.
3.  **Vertex AI (text-embedding-004):** Generates embeddings for user queries.
4.  **Vertex AI (Gemini 1.5 Flash):** Generates natural language responses grounded in the retrieved context.

## Prerequisites

-   **Node.js** (v18 or higher)
-   **Oracle Database 26ai** with vector features enabled.
-   **Google Cloud Project** with Vertex AI API enabled.
-   **GCP Credentials:** Authenticated via `gcloud auth application-default login`.

## Setup

1.  **Clone/Copy this directory.**
2.  **Install dependencies:**
    ```bash
    npm install
    ```
3.  **Configure Environment Variables:**
    Copy `.env.template` to `.env` and fill in your Oracle DB and GCP details.
    ```bash
    cp .env.template .env
    ```
4.  **Database Setup:**
    Run the SQL script in `sql/setup.sql` on your Oracle Database to create the `RAG_TAB` table and vector index.

## Running the Demo

Start the server:
```bash
npm start
```

For development with auto-reload:
```bash
npm run dev
```

The API will be available at `http://localhost:8080`.

## API Usage

### Query the RAG Agent
```bash
curl -X POST http://localhost:8080/api/v1/query \
  -H "Content-Type: application/json" \
  -d '{"question": "How do I use vector search in Oracle 26ai?"}'
```

### Health Check
```bash
curl http://localhost:8080/api/v1/health
```

### OpenAPI Spec
```bash
curl http://localhost:8080/api-docs
```

## Dialogflow Integration

This API is designed to be used as a **Custom Tool** in Google Cloud Dialogflow CX/Agent Builder:

1.  Deploy this service to Cloud Run or a GCP VM.
2.  In Dialogflow, create a new Tool of type **OpenAPI**.
3.  Use the URL `https://YOUR_SERVICE_URL/api-docs` as the schema source.
4.  The agent can now "Query Oracle Database Knowledge" to answer user questions.

## Node.js Multi-Agent Architecture (A2A)

The solution has been structured to support a multi-agentic architecture using Node.js and the modern **`@google/genai`** SDK tool calling capabilities, adhering to enterprise folders namespace layouts.

### Architecture

1. **Core Services (`services/`)**: Modular services handling direct database pools (`oracle-db.js`), vector embedding translations, and core RAG orchestration workflows (`rag-engine.js`).
2. **RAG Server Hub (`app.js`)**: A standalone Express.js service serving the custom glassmorphism client portal from the **`uix/`** directory and exposing core A2A HTTP tool interfaces.
3. **Specialist Agents (`agents/specialist-agents.js`)**: A collection of domain experts matching the Java and Golang counterparts:
   - **Graph Agent:** Retrieves supply chain dependencies.
   - **Spatial Agent:** Pinpoints geographic warehouse hotspots.
   - **Select AI Agent:** Queries the database for inventory risk using natural language.
   - **Inventory Action Agent:** Drafts actionable supply chain operations (e.g., transfers) based on evidence.
4. **Coordinator Agent (`agents/coordinator-agent.js`)**: The primary orchestration agent (Inventory System Gateway) using modern `@google/genai` tool declaration schemas. It interprets user intent and delegates to specialized agents and RAG HTTP tools for a unified workflow.
5. **Agent Development Kit (`adk/`)**: Reference blueprints providing an **`AgenticFactory`** module caching engine and a **`GenericAgent`** base layout enforcing strict **Data Product Contract** JSON mapping compliance.
6. **A2UI Frontend Framework (`uix/`)**: Incorporates enhanced rich text parsers (`a2ui-components.js`) that display trace data objects and dynamic multi-line markdown bullet points seamlessly within custom glassmorphic layout frames.

### Setup & Usage

1. **Start the MCP Toolbox (Optional):**
   ```bash
   toolbox --tools-file tools.yaml
   ```

2. **Start the RAG API:**
   ```bash
   npm start
   ```

3. **Start the Coordinator Agent:**
   In a new terminal window, run the Node.js coordinator:
   ```bash
   node agents/coordinator-agent.js
   ```
   *You can now interact with the multi-agent system via the CLI prompt.*
