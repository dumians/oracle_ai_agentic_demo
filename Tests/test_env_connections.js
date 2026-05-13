/**
 * ==============================================================================
 * Environment Profile Connectivity Tester
 * ==============================================================================
 * Executes granular verification checks for all external cloud dependencies defined
 * in the local .env configuration profile (Oracle Database, GCP GenAI, MCP Server).
 * ==============================================================================
 */

const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');
const { GoogleGenAI } = require('@google/genai');
const oracleDbService = require('../services/oracle-db');

// Load workspace environment configuration
dotenv.config();

// ANSI color-coding formatters
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const CYAN = "\x1b[36m";

function printHeader(title) {
    console.log(`\n${BOLD}${CYAN}=== ${title} ===${RESET}`);
}

function printStatus(name, status, details = "") {
    const color = status === "OK" ? GREEN : (status === "WARN" ? YELLOW : RED);
    const mark = status === "OK" ? "✓" : (status === "WARN" ? "⚠️" : "✗");
    console.log(`${BOLD}${color}[${mark}] ${name.padEnd(32)} : ${status}${RESET}`);
    if (details) {
        console.log(`      └─ ${details}`);
    }
}

async function verifyOracleConnection() {
    printHeader("1. Oracle Database Configuration & Reachability");
    const dsn = process.env.DB_DSN || process.env.ORACLE_TNS_ALIAS || "Unset";
    const user = process.env.DB_USERNAME || process.env.ORACLE_USER || "Unset";
    const walletDir = process.env.DB_WALLET_DIR || "Unset";

    const displayDsn = dsn.length > 40 ? `${dsn.substring(0, 35)}... (Full TSN Descriptor)` : dsn;
    console.log(`  Target DSN Alias  : ${displayDsn}`);
    console.log(`  Target User Profile: ${user}`);
    console.log(`  Wallet Target Path: ${walletDir}`);

    if (dsn === "Unset" || user === "Unset") {
        printStatus("Oracle Profile Validation", "FAIL", "Missing required DB_DSN or DB_USERNAME parameters in .env");
        return false;
    }

    printStatus("Oracle Profile Validation", "OK", "Required profile configuration parameters present.");

    console.log("\n  Attempting secure physical connection loop pool init...");
    try {
        // Initialize pool
        await oracleDbService.initialize();
        printStatus("Oracle Database Connection Pool", "OK", "Service initial pool array state allocated successfully.");

        console.log("  Verifying physical listener ping via test execution payload...");

        // Acquire connection and execute dummy statement racing against threshold
        const connectionResult = await Promise.race([
            (async () => {
                const conn = await oracleDbService.pool.getConnection();
                try {
                    await conn.execute("SELECT 1 FROM DUAL");
                    return "SUCCESS";
                } finally {
                    await conn.close();
                }
            })(),
            new Promise((_, reject) => setTimeout(() => reject(new Error("Connection verification request queue timeout exceeded")), 8000))
        ]);

        if (connectionResult === "SUCCESS") {
            printStatus("Oracle Database Link Reachability", "OK", "Physical session verified against OCI listener smoothly.");
            return true;
        }
    } catch (dbErr) {
        printStatus("Oracle Database Link Reachability", "FAIL", `Network listener handshake error: ${dbErr.message}`);
        return false;
    } finally {
        await oracleDbService.close();
    }
}

async function verifyGcpConnection() {
    printHeader("2. Google Cloud GenAI Foundation Models Reachability");
    const project = process.env.GCP_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || "Unset";
    const location = process.env.GCP_REGION || process.env.GOOGLE_CLOUD_LOCATION || "us-central1";
    const model = process.env.COORDINATOR_MODEL || process.env.RAG_MODEL || "gemini-2.5-flash";

    console.log(`  Target Project ID : ${project}`);
    console.log(`  Target Region/Loc : ${location}`);
    console.log(`  Target Foundation Model: ${model}`);

    if (project === "Unset") {
        printStatus("GCP Profile Validation", "FAIL", "Missing GCP_PROJECT_ID parameter configuration.");
        return false;
    }

    printStatus("GCP Profile Validation", "OK", "Target region and project profiles verified.");
    console.log("\n  Verifying authorization session handshake with cloud APIs...");

    try {
        const ai = new GoogleGenAI({ enterprise: true, project, location });

        try {
            // Perform light model metadata handshake or single-word generation race against timeout
            const testRes = await Promise.race([
                ai.models.generateContent({
                    model: model,
                    contents: "Acknowledge connection test.",
                    config: { maxOutputTokens: 10 }
                }),
                new Promise((_, reject) => setTimeout(() => reject(new Error("Remote inference gateway verification timeout")), 6000))
            ]);

            if (testRes && testRes.text) {
                printStatus("GCP GenAI Link Reachability", "OK", `Authorized securely. Token session validation successful.`);
                return true;
            }
        } catch (modelErr) {
            if (modelErr.status === 404 || (modelErr.message && modelErr.message.includes('404'))) {
                printStatus("GCP GenAI Link Reachability", "WARN", `Model '${model}' not hosted in secondary region '${location}'. Attempting baseline fallback...`);
                console.log(`  👉 Technical Note: Advanced foundation models like gemini-2.5-flash are progressively rolled out across main regional cloud endpoints. Testing secondary benchmark...`);

                const fallbackRes = await Promise.race([
                    ai.models.generateContent({
                        model: 'gemini-1.5-flash',
                        contents: "Acknowledge connection test.",
                        config: { maxOutputTokens: 10 }
                    }),
                    new Promise((_, reject) => setTimeout(() => reject(new Error("Remote fallback verification timeout")), 6000))
                ]);

                if (fallbackRes && fallbackRes.text) {
                    printStatus("GCP GenAI Fallback Reachability", "OK", `Handshake validated smoothly on secondary baseline profile.`);
                    return true;
                }
            } else {
                throw modelErr;
            }
        }
    } catch (gcpErr) {
        const errNote = gcpErr.message?.includes('invalid_rapt') || gcpErr.message?.includes('invalid_grant')
            ? "Application Default Credentials session security policy token expired (invalid_rapt)."
            : gcpErr.message;

        printStatus("GCP GenAI Link Reachability", "FAIL", errNote);
        if (gcpErr.message?.includes('invalid_rapt') || gcpErr.message?.includes('invalid_grant')) {
            console.log(`\n  👉 Fix Required: Execute 'gcloud auth application-default login' in terminal to authorize local context.`);
        }
        return false;
    }
}

async function verifyMcpConnection() {
    printHeader("3. Hosted Model Context Protocol Toolbox Bridges");
    const mcpUrl = process.env.TOOLBOX_URL || "http://127.0.0.1:5001";
    console.log(`  Target MCP Server Bridge URL : ${mcpUrl}`);

    try {
        // Lightweight verification attempt
        const res = await Promise.race([
            fetch(mcpUrl),
            new Promise((_, reject) => setTimeout(() => reject(new Error("Bridge ping healthcheck unreachable")), 3000))
        ]);

        // Whether status is 200, 404, or other HTTP code, connection itself was established
        printStatus("Hosted MCP Toolbox Reachability", "OK", `Bridge gateway TCP port listener active.`);
        return true;
    } catch (mcpErr) {
        printStatus("Hosted MCP Toolbox Reachability", "WARN", `Bridge daemon unreachable: ${mcpErr.message}`);
        console.log(`\n  👉 Note: Standalone MCP schema bridges load dynamically on-demand. Run Option 4 in orchestrator launcher script if local custom tools execution is desired.`);
        return false;
    }
}

async function runAllVerifications() {
    console.log(`\n${BOLD}==================================================================${RESET}`);
    console.log(`   🌐 SYSTEM CONNECTIVITY & ENVIRONMENT VALIDATION HARNESS`);
    console.log(`==================================================================${RESET}`);

    await verifyOracleConnection();
    await verifyGcpConnection();
    await verifyMcpConnection();

    console.log(`\n${BOLD}==================================================================${RESET}`);
    console.log(`   🏁 VALIDATION COMPLETION SEQUENCE RESOLVED`);
    console.log(`==================================================================${RESET}\n`);
}

// Execute verifications when invoked directly
if (require.main === module) {
    runAllVerifications();
}

module.exports = {
    runAllVerifications
};
