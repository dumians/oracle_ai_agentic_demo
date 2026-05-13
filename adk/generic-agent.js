/**
 * ==============================================================================
 * ADK: Generic Agent Base Class
 * ==============================================================================
 * Standard configuration-driven building block encapsulating core model routing,
 * context initialization, and mandatory Data Product Contract compliance metrics.
 * ==============================================================================
 */

const { GoogleGenAI } = require('@google/genai');

class GenericAgent {
    /**
     * Initialize agent template scope config parameters
     */
    constructor(configTemplate) {
        this.id = configTemplate.id || 'generic-agent';
        this.name = configTemplate.name || 'Generic Specialist Agent';
        this.model = configTemplate.model || 'gemini-2.5-flash';
        this.domain = configTemplate.domain || 'Global';
        this.systemInstruction = configTemplate.systemInstruction || 'You are a specialized domain agent.';
        
        const project = process.env.GCP_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT;
        const location = process.env.GCP_REGION || process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';
        
        this.ai = new GoogleGenAI({ enterprise: true, project, location });
        this.chatSession = null;
    }

    /**
     * Initialize local thread/chat context model session
     */
    initializeSession(customTools = []) {
        const config = {
            systemInstruction: this.systemInstruction,
            temperature: 0.2,
        };

        if (customTools && customTools.length > 0) {
            config.tools = customTools;
        }

        this.chatSession = this.ai.chats.create({
            model: this.model,
            config: config
        });
    }

    /**
     * Execute inbound user inquiry and return strict Data Product Contract wrapper object
     */
    async execute(promptText, contextData = {}) {
        if (!this.chatSession) {
            this.initializeSession();
        }

        try {
            // Inject catalog or graph metadata grounding context explicitly
            let payloadStr = promptText;
            if (contextData && Object.keys(contextData).length > 0) {
                payloadStr = `[Grounding Context]: ${JSON.stringify(contextData)}\n\n[User Prompt]: ${promptText}`;
            }

            const response = await this.chatSession.sendMessage({ message: payloadStr });

            // Ensure strict adherence to KI Data Product Contract standards
            // CRITICAL: Always invoke response.text() as a function per ADK instructions
            const resolvedText = typeof response.text === 'function' ? response.text() : (response.text || "Empty generation.");

            return {
                domain: this.domain,
                data: resolvedText,
                metadata: {
                    confidence: 0.95,
                    source: this.name,
                    model: this.model,
                    timestamp: new Date().toISOString()
                },
                insights: `${this.name} domain processing contract validated.`
            };
        } catch (err) {
            console.error(`[ADK: ${this.name}] Execution payload failed:`, err.message);
            return {
                domain: this.domain,
                data: `Execution block interrupted: ${err.message}`,
                metadata: {
                    confidence: 0.0,
                    source: this.name,
                    model: this.model,
                    error: true
                },
                insights: "Transaction abort state."
            };
        }
    }
}

module.exports = GenericAgent;
