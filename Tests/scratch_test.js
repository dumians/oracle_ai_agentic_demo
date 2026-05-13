const path = require('path');
const dotenv = require('dotenv');

// Load .env from the project root workspace
dotenv.config({ path: '/Users/jdumitru/Projects/oracle_ai_agentic_demo/.env' });

// Import the database service
const oracleDbService = require('/Users/jdumitru/Projects/oracle_ai_agentic_demo/services/oracle-db');

async function testConnection() {
    console.log("Starting database pool initialization...");
    try {
        await oracleDbService.initialize();
        console.log("Database pool successfully initialized.");
        
        const testPrompt = "Show details for SKU-500";
        console.log(`Sending test prompt to DBMS_CLOUD_AI_AGENT: "${testPrompt}"`);
        
        const response = await oracleDbService.runAIAgent(testPrompt);

        console.log("\n==================================================");
        console.log("AI Agent Response:");
        console.log("==================================================");
        console.log(response);
        console.log("==================================================\n");
        
    } catch (err) {
        console.error("Error occurred during testing:", err.message);
    } finally {
        console.log("Closing database pool...");
        await oracleDbService.close();
        console.log("Database pool closed. Exiting.");
    }
}

testConnection();
