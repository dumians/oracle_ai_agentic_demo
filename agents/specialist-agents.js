const oracleDbService = require('../services/oracle-db');

function get_supply_chain_graph({ sku }) {
    console.log(`[Graph Agent] Retrieving dependencies for ${sku}...`);
    if (sku.includes("500")) {
        return JSON.stringify({
            sku: sku,
            nodes: ["Supplier: Blue Ocean", "Plant: Austin Assembly", "Port: Long Beach", "Warehouse: Reno DC"],
            edges: ["SUPPLIES", "SHIPS_VIA", "ROUTES_TO"],
            alert: "Customs Review Delay"
        });
    }
    return JSON.stringify({ sku: sku, nodes: ["Supplier: Default", "Warehouse: Default"] });
}

function get_spatial_hotspots({ sku }) {
    console.log(`[Spatial Agent] Analyzing spatial hotspots for ${sku}...`);
    return JSON.stringify({
        sku: sku,
        hotspot_warehouse: "Reno DC",
        relief_source: "Austin Assembly",
        risk_level: "High",
        actionable_insight: "Shift inventory from Austin to Reno."
    });
}

async function query_inventory_risk({ query }) {
    console.log(`[Oracle AI Database Agent] Querying database: ${query}`);
    try {
        const response = await oracleDbService.runAIAgent(query);
        if (!response) {
            return JSON.stringify({ error: "No response returned from Autonomous AI Database Agent" });
        }
        return response;
    } catch (e) {
        console.error("Error in query_inventory_risk:", e.message);
        return JSON.stringify({ error: "Failed to execute query on Autonomous AI Database Agent", details: e.message });
    }
}


function draft_inventory_action({ sku, source_warehouse, dest_warehouse, units }) {
    console.log(`[Inventory Action Agent] Drafting transfer of ${units} units of ${sku} from ${source_warehouse} to ${dest_warehouse}...`);
    return JSON.stringify({
        status: "completed",
        draftActionId: `draft-transfer-${sku.toLowerCase()}`,
        actionType: "INVENTORY_TRANSFER",
        source: source_warehouse,
        destination: dest_warehouse,
        units: units,
        policy: { requiresApproval: true }
    });
}

module.exports = {
    get_supply_chain_graph,
    get_spatial_hotspots,
    query_inventory_risk,
    draft_inventory_action
};
