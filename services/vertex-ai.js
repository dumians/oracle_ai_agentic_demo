const { GoogleGenAI } = require('@google/genai');
const dotenv = require('dotenv');

dotenv.config();

/**
 * Vertex AI Service for Embeddings and LLM using Modern @google/genai SDK
 */
class VertexAIService {
    constructor() {
        const project = process.env.GCP_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT;
        const location = process.env.GCP_REGION || process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';
        this.ai = new GoogleGenAI({
            enterprise: true,
            project: project,
            location: location,
        });
    }

    /**
     * Generate embeddings for a given text
     */
    async getEmbedding(text) {
        try {
            const response = await this.ai.models.embedContent({
                model: 'text-embedding-004',
                contents: text,
            });
            if (response.embeddings && response.embeddings[0] && response.embeddings[0].values) {
                return response.embeddings[0].values;
            }
            throw new Error("Failed to generate embedding values from response");
        } catch (err) {
            if (err.message && (err.message.includes('invalid_rapt') || err.message.includes('invalid_grant'))) {
                console.error('\n⚠️  GCP ADC Security Exception: Reauthentication required (invalid_rapt).');
                console.error('👉 To restore secure cloud access, run: gcloud auth application-default login\n');
            } else {
                console.error('Error getting embedding:', err);
            }
            throw err;
        }
    }

    /**
     * Generate response from LLM (Gemini)
     */
    async generateResponse(prompt, contextChunks) {
        try {
            const context = contextChunks.map((c, i) => `[Context ${i+1}]: ${c}`).join('\n\n');
            
            const fullPrompt = `
                You are a helpful AI assistant specialized in Oracle Database technologies.
                Use the following retrieved context to answer the user question.
                If the answer is not in the context, say you don't know, but try to be helpful based on general knowledge if appropriate.

                CONTEXT:
                ${context}

                USER QUESTION:
                ${prompt}

                ANSWER:
            `;

            const targetModel = process.env.RAG_MODEL || 'gemini-2.5-flash';
            const response = await this.ai.models.generateContent({
                model: targetModel,
                contents: fullPrompt,
                config: {
                    maxOutputTokens: 2048,
                    temperature: 0.2,
                }
            });

            return response.text || response.candidates?.[0]?.content?.parts?.[0]?.text || "No answer generated.";
        } catch (err) {
            if (err.message && (err.message.includes('invalid_rapt') || err.message.includes('invalid_grant'))) {
                console.error('\n⚠️  GCP ADC Security Exception: Reauthentication required (invalid_rapt).');
                console.error('👉 To restore secure cloud access, run: gcloud auth application-default login\n');
            } else {
                console.error('Error generating response:', err);
            }
            throw err;
        }
    }
}

module.exports = new VertexAIService();
