const oracleDB = require('./oracle-db');
const vertexAI = require('./vertex-ai');

/**
 * RAG Engine to coordinate between Oracle DB and Vertex AI
 */
class RAGEngine {
    async initialize() {
        await oracleDB.initialize();
    }

    async answer(question, topK = 5) {
        try {
            console.log(`\n--- New Question: ${question} ---`);
            
            // 1. Generate Query Embedding
            console.log('1. Generating query embedding via Vertex AI...');
            const embedding = await vertexAI.getEmbedding(question);
            
            // 2. Vector Search in Oracle Database
            console.log('2. Searching for similar chunks in Oracle Database...');
            const contextChunks = await oracleDB.vectorSearch(embedding, topK);
            
            if (!contextChunks || contextChunks.length === 0) {
                console.log('! No relevant context found.');
                return {
                    answer: "I couldn't find any relevant documentation in the database to answer your question.",
                    context: []
                };
            }

            console.log(`✓ Found ${contextChunks.length} relevant chunks.`);

            // 3. Generate Answer via Gemini
            console.log('3. Generating final answer via Gemini...');
            const answer = await vertexAI.generateResponse(question, contextChunks);
            
            console.log('✓ Answer generated.');
            
            return {
                answer: answer,
                context: contextChunks
            };
        } catch (err) {
            console.error('RAG Engine Error:', err);
            throw err;
        }
    }
}

module.exports = new RAGEngine();
