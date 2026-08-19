const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const dotenv = require('dotenv');
const path = require('path');
const oracleDbService = require('./services/oracle-db');
const ragEngine = require('./services/rag-engine');
const coordinator = require('./agents/coordinator-agent');
const adkFactory = require('./adk/agentic-factory');
const privateAgentFactory = require('./adk/private-agent-factory');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8080;

// In-Memory Telemetry Logs Capture
let activeFactoryTrace = {
    state: 'idle',
    agentId: '',
    lastQuery: '',
    steps: []
};
const originalLog = console.log;
const originalWarn = console.warn;
const originalError = console.error;

const systemLogs = [];

function parseConsoleOutput(args) {
    const fullStr = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
    const match = fullStr.match(/^\[(.*?)\]\s*(.*)/);
    if (match) {
        let tag = match[1].trim();
        if (tag.includes('Graph Agent')) tag = 'Graph Agent';
        else if (tag.includes('Spatial Agent')) tag = 'Spatial Agent';
        else if (tag.includes('Oracle AI Database Agent') || tag.includes('Select AI')) tag = 'Oracle AI Database Agent';
        else if (tag.includes('Inventory Action Agent') || tag.includes('Action Agent')) tag = 'Inventory Action Agent';
        else if (tag.includes('RAG')) tag = 'RAG Agent';
        else tag = 'Server';
        return { agent: tag, message: match[2] || fullStr };
    }
    return { agent: 'Server', message: fullStr };
}

console.log = function (...args) {
    originalLog.apply(console, args);
    const parsed = parseConsoleOutput(args);
    systemLogs.push({
        timestamp: new Date().toISOString(),
        agent: parsed.agent,
        type: 'INFO',
        message: parsed.message
    });
    if (systemLogs.length > 500) systemLogs.shift();
};

console.warn = function (...args) {
    originalWarn.apply(console, args);
    const parsed = parseConsoleOutput(args);
    systemLogs.push({
        timestamp: new Date().toISOString(),
        agent: parsed.agent,
        type: 'WARNING',
        message: parsed.message
    });
    if (systemLogs.length > 500) systemLogs.shift();
};

console.error = function (...args) {
    originalError.apply(console, args);
    const parsed = parseConsoleOutput(args);
    systemLogs.push({
        timestamp: new Date().toISOString(),
        agent: parsed.agent,
        type: 'ERROR',
        message: parsed.message
    });
    if (systemLogs.length > 500) systemLogs.shift();
};

// Active Agent Coordination Trace State
let activeTrace = {
    state: 'idle', // idle, processing, completed, error
    lastQuery: '',
    steps: []
};

// Settings Configurations Data
let dbSources = [
    { id: 'ds-oracle-rag', name: 'Oracle Database 26ai', domain: 'Oracle Vector RAG Core', status: 'online' },
    { id: 'ds-oracle-erp', name: 'Oracle ERP Inventory', domain: 'Oracle Supply Chain ERP', status: 'online' },
    { id: 'ds-gcp-vertex', name: 'GCP Vertex AI Engine', domain: 'GCP AI Reasoning Engine', status: 'online' },
    { id: 'ds-mcp-toolbox', name: 'Hosted Oracle MCP', domain: 'Hosted MCP Schemas Bridge', status: 'online' }
];

let agents = [
    {
        id: 'coordinator',
        name: 'Master Coordinator',
        model: process.env.COORDINATOR_MODEL || 'gemini-2.0-flash',
        domain: 'Global',
        status: 'online',
        systemInstruction: 'Primary Inventory Gateway orchestrating RAG, Graph, Spatial, Select AI, and Action specialized agents workflows.',
        mcpServers: [{ name: 'StitchMCP Server', mcpUrl: 'http://127.0.0.1:5001' }]
    },
    {
        id: 'rag-agent',
        name: 'RAG Agent',
        model: process.env.GEMINI_MODEL_FLASH || 'gemini-2.0-flash',
        domain: 'Oracle Vector RAG Core',
        status: 'online',
        systemInstruction: 'Executes vector-distance similarity searches against unstructured documentation chunks inside RAG_TAB.',
        mcpServers: []
    },
    {
        id: 'graph-agent',
        name: 'Graph Agent',
        model: process.env.GEMINI_MODEL_FLASH || 'gemini-2.0-flash',
        domain: 'Oracle Supply Chain ERP',
        status: 'online',
        systemInstruction: 'Traverses supply chain nodes (Supplier, Plant, Port, Warehouse) to highlight dependencies and review delays.',
        mcpServers: []
    },
    {
        id: 'spatial-agent',
        name: 'Spatial Agent',
        model: process.env.GEMINI_MODEL_FLASH || 'gemini-2.0-flash',
        domain: 'Oracle Supply Chain ERP',
        status: 'online',
        systemInstruction: 'Pinpoints geographic warehouse risk hotspots and routes excess available relief capacity safely.',
        mcpServers: []
    },
    {
        id: 'db-agent',
        name: 'Oracle AI Database Agent',
        model: process.env.GEMINI_MODEL_PRIMARY || 'gemini-2.0-flash',
        domain: 'Oracle Vector RAG Core',
        status: 'online',
        systemInstruction: 'Queries database structures using natural language translation and generates interactive Chart.js JSON blocks.',
        mcpServers: []
    },
    {
        id: 'action-agent',
        name: 'Inventory Action Agent',
        model: process.env.GEMINI_MODEL_FLASH || 'gemini-2.0-flash',
        domain: 'Oracle Supply Chain ERP',
        status: 'online',
        systemInstruction: 'Drafts secure inventory transfer actions gathering multi-agent spatial and graph evidence before dispatch.',
        mcpServers: []
    }
];


// Determine runtime mode: Full UIX vs Headless API
const ENABLE_UIX = process.env.ENABLE_UIX !== 'false' && 
                   process.env.HEADLESS_MODE !== 'true' && 
                   process.env.PAIAS_MODE !== 'headless';

// Middleware
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());

if (ENABLE_UIX) {
    app.use(express.static(path.join(__dirname, 'uix')));
}

// Routes

// Healthcheck
app.get('/api/v1/health', (req, res) => {
    res.json({ 
        status: 'healthy', 
        mode: ENABLE_UIX ? 'full_hybrid_uix' : 'headless_paf_26_7',
        timestamp: new Date().toISOString() 
    });
});

// Submit Query to Multi-Agent (Supports Coordinator and Private Agent Factory blueprints)
app.post('/api/query', async (req, res) => {
    const { query, mode, agentId, sync } = req.body;
    if (!query) {
        return res.status(400).json({ error: 'Query is required' });
    }

    const isMockMode = (mode === 'mock');
    const isSync = (sync === true || req.query.sync === 'true');
    const startTime = Date.now();

    activeTrace = {
        state: 'processing',
        lastQuery: query,
        agentId: agentId || 'coordinator',
        steps: []
    };

    const processExecution = async () => {
        try {
            let finalResult;
            const onStep = (step) => {
                activeTrace.steps.push(step);
                // Also append to live logs for trace observability
                systemLogs.push({
                    timestamp: step.timestamp || new Date().toISOString(),
                    agent: step.agent || (agentId ? `Agent: ${agentId}` : 'Specialist Agent'),
                    type: 'INFO',
                    message: step.result
                        ? `${step.query} -> Result: ${typeof step.result === 'object' ? JSON.stringify(step.result) : step.result}`
                        : step.query
                });
            };

            if (agentId && agentId !== 'coordinator') {
                // Execute directly via Private Agent Factory blueprint
                const blueprintExec = await privateAgentFactory.executeAgent(agentId, query, onStep, isMockMode);
                finalResult = blueprintExec.data;
                activeTrace.steps.push({
                    agent: blueprintExec.metadata ? blueprintExec.metadata.agentName : agentId,
                    query: "Execution finalized.",
                    result: finalResult,
                    timestamp: new Date().toISOString()
                });
            } else {
                // Execute via Master Coordinator federated orchestration
                finalResult = await coordinator.runCoordinatorQuery(query, onStep, isMockMode);
                activeTrace.steps.push({
                    agent: "Master Coordinator",
                    query: "Synthesized final response.",
                    result: finalResult,
                    timestamp: new Date().toISOString()
                });
            }

            activeTrace.state = 'completed';
            return { success: true, result: finalResult, steps: activeTrace.steps, latencyMs: Date.now() - startTime };
        } catch (err) {
            console.error("Agent execution error:", err);
            const errMsg = `Execution failed: ${err.message}`;
            activeTrace.steps.push({
                agent: agentId || "Master Coordinator",
                query: "Error encountered.",
                result: errMsg,
                timestamp: new Date().toISOString()
            });
            activeTrace.state = 'error';
            return { success: false, error: errMsg, steps: activeTrace.steps, latencyMs: Date.now() - startTime };
        }
    };

    if (isSync) {
        const outcome = await processExecution();
        if (outcome.success) {
            return res.json({ status: 'completed', result: outcome.result, steps: outcome.steps, latencyMs: outcome.latencyMs });
        } else {
            return res.status(500).json({ status: 'error', error: outcome.error, steps: outcome.steps, latencyMs: outcome.latencyMs });
        }
    } else {
        // Asynchronous mode: respond immediately and process in background for /api/status polling
        res.json({ status: 'started', agentId: agentId || 'coordinator' });
        processExecution();
    }
});

// Direct GET /api/query for browser testing, health verification & curl exploration
app.get('/api/query', async (req, res) => {
    const query = req.query.q || req.query.query;
    if (!query) {
        return res.json({
            endpoint: '/api/query',
            method: 'POST',
            description: 'Oracle AI Database & Vertex AI Multi-Agent Query Gateway',
            usage: {
                headers: { 'Content-Type': 'application/json' },
                body: {
                    query: 'What inventory transfer actions should we take for SKU-500?',
                    mode: 'real | mock',
                    agentId: 'coordinator | supply_chain_auditor | sql_tuning_sentinel | financial_recon_agent | cyber_audit_guardian | predictive_maintenance_agent',
                    sync: 'true (optional, for synchronous output)'
                }
            }
        });
    }

    const mode = req.query.mode || 'real';
    const agentId = req.query.agentId || 'coordinator';
    const isMockMode = (mode === 'mock');

    try {
        let result;
        if (agentId && agentId !== 'coordinator') {
            const exec = await privateAgentFactory.executeAgent(agentId, query, () => {}, isMockMode);
            result = exec.data;
        } else {
            result = await coordinator.runCoordinatorQuery(query, () => {}, isMockMode);
        }
        res.json({ query, agentId, mode, result });
    } catch (err) {
        res.status(500).json({ query, error: err.message });
    }
});

// Get active trace timeline
app.get('/api/status', (req, res) => {
    res.json(activeTrace);
});

// Get settings data
app.get('/api/settings', (req, res) => {
    res.json({
        dataSources: dbSources,
        agents: agents,
        mcpServerStatuses: {
            StitchMCP: 'online'
        }
    });
});

// Trigger telemetry flush (Simulated)
app.post('/api/refresh-telemetry', (req, res) => {
    systemLogs.push({
        timestamp: new Date().toISOString(),
        agent: 'Server',
        type: 'INFO',
        message: 'Manual telemetry refresh initiated.'
    });
    res.json({ success: true });
});

// Get live backend logs
app.get('/api/admin/logs', (req, res) => {
    res.json({ logs: systemLogs });
});


// Edit active agent settings
app.put('/api/config/agents/:id', (req, res) => {
    const { id } = req.params;
    const { name, model, domain, systemInstruction } = req.body;

    const agentIndex = agents.findIndex(a => a.id === id);
    if (agentIndex === -1) return res.status(404).json({ error: 'Agent not found' });

    agents[agentIndex] = {
        ...agents[agentIndex],
        name: name || agents[agentIndex].name,
        model: model || agents[agentIndex].model,
        domain: domain !== undefined ? domain : agents[agentIndex].domain,
        systemInstruction: systemInstruction || agents[agentIndex].systemInstruction
    };

    res.json(agents[agentIndex]);
});

// Edit registered data sources
app.put('/api/config/data-sources/:id', (req, res) => {
    const { id } = req.params;
    const { name, domain, status } = req.body;

    const dsIndex = dbSources.findIndex(d => d.id === id);
    if (dsIndex === -1) return res.status(404).json({ error: 'Data source not found' });

    dbSources[dsIndex] = {
        ...dbSources[dsIndex],
        name: name || dbSources[dsIndex].name,
        domain: domain || dbSources[dsIndex].domain,
        status: status || dbSources[dsIndex].status
    };

    res.json(dbSources[dsIndex]);
});

// Create new registered data source
app.post('/api/config/data-sources', (req, res) => {
    const { name, domain } = req.body;
    if (!name || !domain) return res.status(400).json({ error: 'Name and domain are required' });

    const newDs = {
        id: `ds-${Date.now()}`,
        name,
        domain,
        status: 'online'
    };
    dbSources.push(newDs);
    res.json(newDs);
});

// Get MCP tools list
app.get('/api/mcp/tools', (req, res) => {
    res.json([
        { name: 'query_oracle_rag_kb', server: 'StitchMCP', description: 'Search the Oracle Database knowledge base for documentation, features, and capabilities.' },
        { name: 'get_supply_chain_graph', server: 'StitchMCP', description: 'Get the supply chain dependency graph for a specific product SKU.' },
        { name: 'get_spatial_hotspots', server: 'StitchMCP', description: 'Get warehouse hotspots and relief routes for a specific product SKU.' },
        { name: 'query_inventory_risk', server: 'StitchMCP', description: 'Ask natural language questions about database tables, perform checks, or generate visualizations.' },
        { name: 'draft_inventory_action', server: 'StitchMCP', description: 'Draft an inventory transfer action based on graph, spatial, and external evidence.' }
    ]);
});

// Inspect provisioned ADK reference agent contract runtime configurations
app.get('/api/adk/inspect', (req, res) => {
    const sampleAgent = adkFactory.getAgent('coordinator', agents);
    res.json({
        status: 'provisioned',
        factoryAware: true,
        agentProfile: {
            id: sampleAgent.id,
            name: sampleAgent.name,
            model: sampleAgent.model,
            domain: sampleAgent.domain,
            contractCompliant: true
        }
    });
});

// ==============================================================================
// Oracle DB AI Private Agent Factory Endpoints
// ==============================================================================

// 1. Get all enterprise blueprints
app.get('/api/factory/templates', (req, res) => {
    res.json(privateAgentFactory.listBlueprints());
});

// 2. Get all provisioned private agents
app.get('/api/factory/agents', (req, res) => {
    res.json(privateAgentFactory.listProvisionedAgents());
});

// 3. Dynamically provision a new private agent (The Agent Forge)
app.post('/api/factory/provision', (req, res) => {
    const { id, name, domain, model, deploymentTarget, systemRole, taskInstruction, tools, presetQueries } = req.body;
    if (!name) {
        return res.status(400).json({ error: 'Agent name is required' });
    }
    const agentId = (id || `agent_${Date.now()}`).toLowerCase().replace(/\s+/g, '_');
    const newAgent = privateAgentFactory.provisionAgent({
        id: agentId,
        name,
        domain: domain || 'Oracle Enterprise Data',
        model: model || 'gemini-2.0-flash',
        deploymentTarget: deploymentTarget || 'HYBRID',
        systemRole: systemRole || 'You are an autonomous private database agent.',
        taskInstruction: taskInstruction || 'Analyze user query: {query} and respond accurately with data grounding.',
        tools: tools || ['query_inventory_risk', 'query_oracle_rag_kb'],
        presetQueries: presetQueries || ['What insights can you provide about the database?']
    });

    // Synchronize with global agents registry if not already present
    const existingIndex = agents.findIndex(a => a.id === agentId);
    const agentConfigEntry = {
        id: agentId,
        name: newAgent.name,
        model: newAgent.model,
        domain: newAgent.domain,
        status: 'online',
        systemInstruction: newAgent.systemRole,
        mcpServers: []
    };
    if (existingIndex >= 0) {
        agents[existingIndex] = agentConfigEntry;
    } else {
        agents.push(agentConfigEntry);
    }

    res.status(201).json(newAgent);
});

// 4. Execute query on a specific Private Agent
app.post('/api/factory/execute', async (req, res) => {
    const { agentId, prompt, mode } = req.body;
    if (!agentId || !prompt) {
        return res.status(400).json({ error: 'agentId and prompt are required' });
    }

    const isMockMode = (mode === 'mock');
    activeFactoryTrace = {
        state: 'processing',
        agentId: agentId,
        lastQuery: prompt,
        steps: []
    };

    // Return immediate receipt for async polling, or execute and return
    try {
        const result = await privateAgentFactory.executeAgent(
            agentId,
            prompt,
            (step) => {
                activeFactoryTrace.steps.push(step);
                systemLogs.push({
                    timestamp: step.timestamp || new Date().toISOString(),
                    agent: step.agent || 'Private Agent',
                    type: 'INFO',
                    message: step.result
                        ? `${step.query} -> Result: ${typeof step.result === 'object' ? JSON.stringify(step.result) : step.result}`
                        : step.query
                });
            },
            isMockMode
        );

        activeFactoryTrace.steps.push({
            agent: result.agentName || "Private Agent",
            query: "Synthesized contract response.",
            result: result.data,
            timestamp: new Date().toISOString()
        });

        activeFactoryTrace.state = 'completed';
        res.json(result);
    } catch (err) {
        console.error("Private Agent execution error:", err);
        activeFactoryTrace.state = 'error';
        res.status(500).json({ error: 'Private Agent execution failed', message: err.message });
    }
});

// 5. Get Private Agent execution trace
app.get('/api/factory/trace', (req, res) => {
    res.json(activeFactoryTrace);
});

// 6. Decommission a private agent
app.delete('/api/factory/agents/:id', (req, res) => {
    const { id } = req.params;
    const success = privateAgentFactory.decommissionAgent(id);
    if (!success) {
        return res.status(404).json({ error: 'Agent not found' });
    }
    res.json({ success: true, message: `Agent ${id} decommissioned.` });
});

// 7. Export Database-Native PL/SQL Installer script
app.get('/api/factory/export/plsql/:id', (req, res) => {
    const { id } = req.params;
    const agent = privateAgentFactory.getAgent(id) || privateAgentFactory.getBlueprint(id);
    if (!agent) {
        return res.status(404).json({ error: 'Agent not found' });
    }
    const plsql = privateAgentFactory.generatePLSQL(agent);
    res.json({ agentId: id, plsql });
});

// 8. Export GCP Container Manifest (Cloud Run / GKE)
app.get('/api/factory/export/gcp-manifest/:id', (req, res) => {
    const { id } = req.params;
    const agent = privateAgentFactory.getAgent(id) || privateAgentFactory.getBlueprint(id);
    if (!agent) {
        return res.status(404).json({ error: 'Agent not found' });
    }
    const manifest = privateAgentFactory.generateGCPManifest(agent);
    res.json({ agentId: id, manifest });
});

// 9. GCP Container diagnostics and status
app.get('/api/factory/gcp/status', (req, res) => {
    res.json(privateAgentFactory.getGCPContainerStatus());
});

// 10. Private Agent metrics
app.get('/api/factory/metrics', (req, res) => {
    res.json({
        totalExecutions: privateAgentFactory.metrics.length,
        activeAgentsCount: privateAgentFactory.listProvisionedAgents().length,
        metrics: privateAgentFactory.metrics
    });
});

// Native RAG Endpoint (legacy support)
app.post('/api/v1/query', async (req, res) => {
    const { question, top_k } = req.body;
    if (!question) {
        return res.status(400).json({ error: 'Question is required' });
    }
    try {
        const result = await ragEngine.answer(question, top_k || 5);
        res.json(result);
    } catch (err) {
        console.error('RAG API Error:', err);
        res.status(500).json({ error: 'Failed to process query', message: err.message });
    }
});
// 11. Database Connection Diagnostics & Test (matches README.txt UI Flow)
app.post('/api/v1/db/test-connection', async (req, res) => {
    try {
        const customConfig = req.body.user ? {
            user: req.body.user,
            password: req.body.password,
            connectString: req.body.connectString,
            walletPassword: req.body.walletPassword
        } : null;

        const result = await oracleDbService.testConnection(customConfig);
        res.json(result);
    } catch (err) {
        res.status(500).json({ status: 'FAILED', error: err.message });
    }
});

// 12. Provision Application & Read-Only Users (README.txt lines 107-119)
app.post('/api/v1/db/provision-users', async (req, res) => {
    try {
        const { dbUser, dbPassword } = req.body;
        const result = await oracleDbService.provisionApplicationUsers(dbUser, dbPassword);
        res.json(result);
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 13. Installation Status & UI Metadata (README.txt lines 154-184)
app.get('/agentFactory/installation', async (req, res) => {
    const testResult = await oracleDbService.testConnection();
    const catalog = await oracleDbService.getDatabaseAgentCatalog();
    res.json({
        title: 'Oracle AI Database Private Agent Factory Installation Flow',
        mode: process.env.NODE_ENV === 'production' ? 'prod' : 'quickstart',
        database: testResult,
        agentCatalogCount: catalog.length,
        endpoints: {
            testConnection: 'POST /api/v1/db/test-connection',
            provisionUsers: 'POST /api/v1/db/provision-users',
            agentsCatalog: 'GET /api/factory/agents',
            health: 'GET /api/v1/health'
        }
    });
});

// Native docs path
app.get('/api-docs', (req, res) => {
    res.json({
        openapi: '3.0.0',
        info: {
            title: 'Oracle AI Database RAG API',
            version: '1.0.0',
            description: 'API for querying Oracle Database Knowledge Base with RAG'
        }
    });
});

// Catch-all handler: Serve UIX index.html if UIX enabled, or JSON API discovery in headless mode
if (ENABLE_UIX) {
    app.get('*', (req, res) => {
        res.sendFile(path.join(__dirname, 'uix', 'index.html'));
    });
} else {
    app.get('/', (req, res) => {
        res.json({
            service: 'Oracle AI Private Agent Factory (PAIAS 26.7.0)',
            mode: 'headless_api_runtime',
            status: 'online',
            endpoints: {
                health: '/api/v1/health',
                query: '/api/query',
                legacyRag: '/api/v1/query',
                templates: '/api/factory/templates',
                agents: '/api/factory/agents',
                provision: '/api/factory/provision',
                execute: '/api/factory/execute',
                metrics: '/api/factory/metrics',
                exportPlSql: '/api/factory/export/plsql/:agentId',
                exportGcp: '/api/factory/export/gcp/:agentId',
                apiDocs: '/api-docs'
            }
        });
    });

    app.use((req, res) => {
        res.status(404).json({
            error: 'Not Found',
            message: `Route ${req.method} ${req.originalUrl} not found on Oracle Private Agent Factory 26.7 (Headless API mode).`,
            discovery: '/'
        });
    });
}

// Initialize and Start Server
const startServer = async () => {
    try {
        await ragEngine.initialize();
        console.log('✓ RAG Engine initialized successfully.');
    } catch (err) {
        console.error('⚠️ Warning: Failed to initialize Oracle Database pool during startup:', err.message);
    }

    try {
        app.listen(PORT, '0.0.0.0', () => {
            console.log(`\n🏛️ Oracle AI Private Agent Factory (PAIAS 26.7.0) running in [${ENABLE_UIX ? 'Full Hybrid Web + UIX' : 'Headless Container API'}] mode at:`);
            if (ENABLE_UIX) {
                console.log(`   - Web UIX:       http://localhost:${PORT}`);
            } else {
                console.log(`   - API Discovery: http://localhost:${PORT}/`);
            }
            console.log(`   - Query API:     http://localhost:${PORT}/api/query`);
            console.log(`   - Factory API:   http://localhost:${PORT}/api/factory/agents`);
            console.log(`   - Legacy RAG:    http://localhost:${PORT}/api/v1/query`);
            console.log(`   - Health Check:  http://localhost:${PORT}/api/v1/health`);
        });
    } catch (err) {
        console.error('Could not start Express server:', err.message);
        process.exit(1);
    }
};

startServer();
