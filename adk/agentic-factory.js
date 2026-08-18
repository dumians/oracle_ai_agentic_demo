/**
 * ==============================================================================
 * ADK: Agentic Factory
 * ==============================================================================
 * Core provisioning engine designed to dynamically instantiate, configure, and
 * cache specialized domain GenericAgent instances to scale topologies.
 * Integrates with the Enterprise Private Agent Factory.
 * ==============================================================================
 */

const GenericAgent = require('./generic-agent');
const privateAgentFactory = require('./private-agent-factory');

class AgenticFactory {
    constructor() {
        // In-memory cache registry to retain initialized agent persona sessions
        this.agentCache = new Map();
        this.privateFactory = privateAgentFactory;
    }

    /**
     * Retrieve active cached agent instance or dynamically provision a new profile
     * based on provided template definitions.
     */
    getAgent(agentId, configTemplates = []) {
        if (this.agentCache.has(agentId)) {
            return this.agentCache.get(agentId);
        }

        // Check private agent factory first
        const privateAgent = this.privateFactory.getAgent(agentId);
        if (privateAgent) {
            const template = {
                id: privateAgent.id,
                name: privateAgent.name,
                model: privateAgent.model,
                domain: privateAgent.domain,
                systemInstruction: privateAgent.systemRole
            };
            const agentInstance = new GenericAgent(template);
            this.agentCache.set(agentId, agentInstance);
            return agentInstance;
        }

        // Locate configuration template targeting the specific agent ID
        const template = configTemplates.find(t => t.id === agentId) || {
            id: agentId,
            name: `Dynamic Agent (${agentId})`,
            domain: 'Global'
        };

        console.log(`[ADK Factory] Dynamically provisioning new agent instance context: ${template.name}`);
        const agentInstance = new GenericAgent(template);

        // Retain instance within internal thread cache registry
        this.agentCache.set(agentId, agentInstance);

        return agentInstance;
    }

    /**
     * Expose the Private Agent Factory instance
     */
    getPrivateFactory() {
        return this.privateFactory;
    }

    /**
     * Clear all registered agent instance sessions from persistent caching layers
     */
    flushCache() {
        this.agentCache.clear();
        console.log("[ADK Factory] Internal agent profiles cache flushed successfully.");
    }
}

module.exports = new AgenticFactory();
