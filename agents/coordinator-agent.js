const { GoogleGenAI } = require('@google/genai');
const readline = require('readline');
const dotenv = require('dotenv');
const oracleDbService = require('../services/oracle-db');
const {
    get_supply_chain_graph,
    get_spatial_hotspots,
    query_inventory_risk,
    draft_inventory_action
} = require('./specialist-agents');

dotenv.config();

const RAG_API_URL = process.env.ORACLE_RAG_API_URL || "http://localhost:8080/api/v1/query";

async function query_oracle_rag_kb({ query, top_k = 5 }) {
    console.log(`[RAG Agent] Called query_oracle_rag_kb with query='${query}'`);
    try {
        const response = await fetch(RAG_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ question: query, top_k })
        });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        const chunks_count = data.context ? data.context.length : 0;
        return `${data.answer}\n\n[Source: ${chunks_count} chunks]`;
    } catch (e) {
        return `Error querying RAG knowledge base: ${e.message}`;
    }
}

// Map functions for easy lookup
const toolsFunctions = {
    query_oracle_rag_kb,
    get_supply_chain_graph,
    get_spatial_hotspots,
    query_inventory_risk,
    draft_inventory_action
};

const toolDeclarations = [
    {
        name: 'query_oracle_rag_kb',
        description: 'Search the Oracle Database knowledge base for documentation, features, and capabilities.',
        parametersJsonSchema: {
            type: 'object',
            properties: {
                query: { type: 'string', description: 'The search query' },
                top_k: { type: 'integer', description: 'Number of results to return' }
            },
            required: ['query']
        }
    },
    {
        name: 'get_supply_chain_graph',
        description: 'Use this tool to get the supply chain dependency graph for a specific product SKU. Returns the supplier, plant, port, and warehouse dependencies.',
        parametersJsonSchema: {
            type: 'object',
            properties: {
                sku: { type: 'string', description: 'The product SKU' }
            },
            required: ['sku']
        }
    },
    {
        name: 'get_spatial_hotspots',
        description: 'Use this tool to get warehouse hotspots and relief routes for a specific product SKU on a map.',
        parametersJsonSchema: {
            type: 'object',
            properties: {
                sku: { type: 'string', description: 'The product SKU' }
            },
            required: ['sku']
        }
    },
    {
        name: 'query_inventory_risk',
        description: 'Use this tool to ask natural language questions about database tables, perform distinct/range values analysis, or generate data visualizations/charts. It calls the native Oracle AI Database Agent inside the database.',
        parametersJsonSchema: {
            type: 'object',
            properties: {
                query: { type: 'string', description: 'The plain text query or question to run on the database' }
            },
            required: ['query']
        }
    },
    {
        name: 'draft_inventory_action',
        description: 'Use this tool to draft an inventory transfer action based on graph, spatial, and external evidence. Returns the draft status and whether human approval is required.',
        parametersJsonSchema: {
            type: 'object',
            properties: {
                sku: { type: 'string' },
                source_warehouse: { type: 'string' },
                dest_warehouse: { type: 'string' },
                units: { type: 'integer' }
            },
            required: ['sku', 'source_warehouse', 'dest_warehouse', 'units']
        }
    }
];

const instructions = `
You are the primary Oracle AI Coordinator Agent and Inventory System Gateway.
You orchestrate a multi-agent environment connected to Oracle Database 26ai.

Available Agentic Tools:
1. \`query_oracle_rag_kb\`: For general Oracle documentation, concept, and "how-to" questions.
2. \`query_inventory_risk\` (Oracle AI Database Agent): To query database tables, verify values using distinct/range checks, or generate visualizations/charts using the database-native agent.
3. \`get_supply_chain_graph\` (Graph Agent): To analyze supply chain dependencies for a specific product SKU.
4. \`get_spatial_hotspots\` (Spatial Agent): To pinpoint geographic warehouse hotspots and relief routes.
5. \`draft_inventory_action\` (Inventory Action Agent): To draft an inventory transfer after gathering evidence.

Workflow for Inventory Action queries (e.g., "What action should we take for SKU-500?"):
Step 1: Gather evidence using \`query_inventory_risk\`, \`get_supply_chain_graph\`, and \`get_spatial_hotspots\`.
Step 2: Synthesize the evidence to determine the best transfer action.
Step 3: Call \`draft_inventory_action\` to create the transfer draft.
Step 4: Present the final summary to the user, including whether approval is required.

Guidelines for Visualizations/Charts:
- If the user explicitly asks for a chart, graph, plot, or visualization of the database data, make sure to invoke \`query_inventory_risk\` with a clear prompt requesting a chart (e.g., "Generate a bar chart of daily sales...").
- The database-native agent will execute the GENERATE_CHART tool and return a valid Chart.js JSON block wrapped in a \`\`\`chartjs code block.
- Do not modify or strip this \`\`\`chartjs block; pass it directly to the user in your final response.
`;

function mapToolToAgent(fnName) {
    switch (fnName) {
        case 'query_oracle_rag_kb': return 'RAG Agent';
        case 'get_supply_chain_graph': return 'Graph Agent';
        case 'get_spatial_hotspots': return 'Spatial Agent';
        case 'query_inventory_risk': return 'Oracle AI Database Agent';
        case 'draft_inventory_action': return 'Inventory Action Agent';
        default: return 'Specialist Agent';
    }
}

async function runCoordinatorQuery(userInput, onStepCallback) {
    const project = process.env.GCP_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT;
    const location = process.env.GCP_REGION || process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';
    
    try {
        const ai = new GoogleGenAI({ enterprise: true, project, location });
        const targetModel = process.env.COORDINATOR_MODEL || 'gemini-2.5-flash';
        const chat = ai.chats.create({
            model: targetModel,
            config: {
                systemInstruction: instructions,
                tools: [{ functionDeclarations: toolDeclarations }]
            }
        });
        
        onStepCallback({
            agent: "Master Coordinator",
            query: `Initiating conversation: "${userInput}"`,
            timestamp: new Date().toISOString()
        });

        let response = await chat.sendMessage({ message: userInput });

        while (response.functionCalls && response.functionCalls.length > 0) {
            const functionResponses = [];

            for (const functionCall of response.functionCalls) {
                const functionName = functionCall.name;
                const functionArgs = functionCall.args;

                onStepCallback({
                    agent: mapToolToAgent(functionName),
                    query: `Executing tool '${functionName}' with arguments: ${JSON.stringify(functionArgs)}`,
                    timestamp: new Date().toISOString()
                });

                const fn = toolsFunctions[functionName];
                let apiResponse;
                if (fn) {
                    try {
                        apiResponse = await fn(functionArgs);
                    } catch (e) {
                        apiResponse = JSON.stringify({ error: `Execution failed: ${e.message}` });
                    }
                } else {
                    apiResponse = JSON.stringify({ error: "Function not found" });
                }

                onStepCallback({
                    agent: mapToolToAgent(functionName),
                    query: `Tool '${functionName}' finished.`,
                    result: apiResponse,
                    timestamp: new Date().toISOString()
                });

                functionResponses.push({
                    functionResponse: {
                        name: functionName,
                        response: { result: apiResponse }
                    }
                });
            }

            response = await chat.sendMessage({ message: functionResponses });
        }

        return response.text || "No response returned by coordinator.";
    } catch (liveErr) {
        const errReason = liveErr.message?.includes('invalid_rapt') || liveErr.message?.includes('invalid_grant') 
            ? 'GCP ADC Security Session Expired (invalid_rapt)' 
            : liveErr.message;
            
        onStepCallback({
            agent: "Master Coordinator",
            query: `Live API Link Exception: ${errReason}. Execution aborted.`,
            timestamp: new Date().toISOString()
        });
        
        throw liveErr;
    }
}

async function main() {
    const project = process.env.GCP_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT;
    const location = process.env.GCP_REGION || process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';

    if (!project) {
        console.error("GCP_PROJECT_ID or GOOGLE_CLOUD_PROJECT is required.");
        return;
    }

    try {
        await oracleDbService.initialize();
    } catch (err) {
        console.error("Warning: Failed to initialize Oracle Database pool. Specialist agents relying on direct DB access will fail.", err.message);
    }

    const ai = new GoogleGenAI({ enterprise: true, project, location });
    const targetModel = process.env.COORDINATOR_MODEL || 'gemini-2.5-flash';
    const chat = ai.chats.create({
        model: targetModel,
        config: {
            systemInstruction: instructions,
            tools: [{ functionDeclarations: toolDeclarations }]
        }
    });

    console.log("Oracle AI Coordinator (Inventory System Gateway) initialized.");
    console.log("This Node.js agent dynamically routes to RAG, Graph, Spatial, Select AI, and Action agents.");
    console.log("Type 'exit' or 'quit' to stop.");

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    const askQuestion = () => {
        rl.question('\nYou: ', async (userInput) => {
            if (userInput.toLowerCase() === 'exit' || userInput.toLowerCase() === 'quit') {
                rl.close();
                await oracleDbService.close();
                return;
            }

            try {
                let response = await chat.sendMessage({ message: userInput });

                while (response.functionCalls && response.functionCalls.length > 0) {
                    const functionResponses = [];
                    for (const functionCall of response.functionCalls) {
                        const functionName = functionCall.name;
                        const functionArgs = functionCall.args;
                        
                        const fn = toolsFunctions[functionName];
                        let apiResponse;
                        if (fn) {
                            apiResponse = await fn(functionArgs);
                        } else {
                            apiResponse = JSON.stringify({ error: "Function not found" });
                        }
                        
                        functionResponses.push({
                            functionResponse: {
                                name: functionName,
                                response: { result: apiResponse }
                            }
                        });
                    }

                    response = await chat.sendMessage({ message: functionResponses });
                }

                console.log(`\n🤔 Agent: ${response.text || ''}`);
            } catch (err) {
                console.error(`\nError: ${err.message}`);
                if (err.message?.includes('invalid_grant') || err.message?.includes('invalid_rapt')) {
                    console.log("\n⚠️  GCP ADC Session Security Policy Block triggered (invalid_rapt / Reauth required).");
                    console.log("👉 To restore secure remote model connectivity, please run: gcloud auth application-default login");
                }
            }

            askQuestion();
        });
    };

    askQuestion();
}

if (require.main === module) {
    main();
}

module.exports = {
    runCoordinatorQuery,
    toolDeclarations,
    instructions
};