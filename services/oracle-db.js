const oracledb = require('oracledb');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');
const child_process = require('child_process');

dotenv.config();

/**
 * Oracle Database Service for Vector Search
 */
class OracleDBService {
    constructor() {
        this.config = {
            user: process.env.DB_USERNAME || process.env.ORACLE_USER,
            password: process.env.DB_PASSWORD || process.env.ORACLE_PASSWORD,
            connectString: process.env.DB_DSN || process.env.ORACLE_TNS_ALIAS,
            walletLocation: process.env.DB_WALLET_DIR || process.env.ORACLE_WALLET,
            walletPassword: process.env.DB_WALLET_PASSWORD,
        };
        this.pool = null;
    }

    async initialize() {
        try {
            console.log('Connecting to Oracle Database...');
            
            // If using wallet, set TNS_ADMIN
            if (this.config.walletLocation) {
                let targetWalletDir = this.config.walletLocation;
                // Resilient handling if user passes a .zip file path directly
                if (targetWalletDir.endsWith('.zip')) {
                    const extractDir = path.join(process.cwd(), '.oracle_wallet');
                    try {
                        if (!fs.existsSync(extractDir)) {
                            fs.mkdirSync(extractDir, { recursive: true });
                        }
                        console.log(`Extracting wallet archive profile dynamically to: ${extractDir}`);
                        child_process.execSync(`unzip -o "${targetWalletDir}" -d "${extractDir}"`, { stdio: 'ignore' });
                        targetWalletDir = extractDir;
                        
                        // Patch extracted sqlnet.ora to rewrite absolute local wallet paths dynamically
                        const sqlnetPath = path.join(extractDir, 'sqlnet.ora');
                        if (fs.existsSync(sqlnetPath)) {
                            let sqlnetStr = fs.readFileSync(sqlnetPath, 'utf8');
                            sqlnetStr = sqlnetStr.replace(/\?\/network\/admin/g, extractDir.replace(/\\/g, '/'));
                            fs.writeFileSync(sqlnetPath, sqlnetStr, 'utf8');
                            console.log("✓ Applied dynamic local path override to sqlnet.ora profile config.");
                        }
                    } catch (unzipErr) {
                        console.warn(`⚠️ Warning: Could not unzip wallet automatically: ${unzipErr.message}`);
                    }
                }
                process.env.TNS_ADMIN = targetWalletDir;
            }

            // Natively support advanced DB@GCP network routing by initializing thick mode client drivers when possible
            try {
                const clientOpts = {};
                if (process.env.TNS_ADMIN) {
                    clientOpts.configDir = process.env.TNS_ADMIN;
                }
                if (process.env.ORACLE_CLIENT_LIB_DIR) {
                    clientOpts.libDir = process.env.ORACLE_CLIENT_LIB_DIR;
                }
                oracledb.initOracleClient(clientOpts);
                console.log("✓ Explicit thick client OCI library layer initialized successfully.");
            } catch (thickClientErr) {
                console.log("  👉 Note: Native OCI thick libraries not installed locally. Operating in pure Thin driver stack mode seamlessly.");
            }

            const poolConfig = {
                user: this.config.user,
                password: this.config.password,
                connectString: this.config.connectString,
                poolMin: 1,
                poolMax: 4,
                queueTimeout: 10000 // Restrict unbounded queuing to 10s to support fast fail-over verifications
            };

            if (this.config.walletLocation) {
                const resolvedDir = process.env.TNS_ADMIN || this.config.walletLocation;
                poolConfig.walletLocation = resolvedDir;
                poolConfig.configDir = resolvedDir;
                if (this.config.walletPassword) {
                    poolConfig.walletPassword = this.config.walletPassword;
                }
            }

            this.pool = await oracledb.createPool(poolConfig);
            
            console.log('✓ Oracle Database Connection Pool initialized');
        } catch (err) {
            console.error('FAILED to initialize Oracle Database Pool:', err.message);
            throw err;
        }
    }

    async vectorSearch(queryEmbedding, topK = 5) {
        let connection;
        try {
            connection = await this.pool.getConnection();
            
            // Oracle 26ai Vector Search Query
            // Assuming table RAG_TAB with columns: ID, CONTENT, EMBEDDING
            // EMBEDDING column is of type VECTOR
            const sql = `
                SELECT CONTENT, 
                       VECTOR_DISTANCE(EMBEDDING, :embedding, DOT_PRODUCT) as distance
                FROM RAG_TAB
                ORDER BY distance
                FETCH FIRST :topK ROWS ONLY
            `;

            // Oracle DB vector type expects a Float32Array or a specific format
            // In oracledb 6.x+, you can pass arrays directly for VECTOR columns
            const result = await connection.execute(sql, {
                embedding: new Float32Array(queryEmbedding),
                topK: topK
            }, { outFormat: oracledb.OUT_FORMAT_OBJECT });

            return result.rows.map(row => row.CONTENT);
        } catch (err) {
            console.error('Vector Search Error:', err);
            throw err;
        } finally {
            if (connection) {
                await connection.close();
            }
        }
    }

    async runAIAgent(prompt) {
        let connection;
        try {
            connection = await this.pool.getConnection();
            
            // Execute DBMS_CLOUD_AI_AGENT.RUN inside SQL query
            const sql = `
                SELECT DBMS_CLOUD_AI_AGENT.RUN(
                    team_name => 'ORACLE_AI_DATABASE_AGENT',
                    prompt => :prompt
                ) AS response FROM DUAL
            `;

            const result = await connection.execute(sql, {
                prompt: prompt
            }, { outFormat: oracledb.OUT_FORMAT_OBJECT });

            if (result.rows && result.rows[0]) {
                // The response CLOB is fetched as a string or Lob stream in thin/thick mode.
                // If it is a Lob object, we can read it.
                let response = result.rows[0].RESPONSE || result.rows[0].response;
                
                if (response && typeof response.getData === 'function') {
                    response = await response.getData();
                } else if (response && response.pipe) {
                    // Handle stream if it is a stream
                    response = await new Promise((resolve, reject) => {
                        let clobData = '';
                        response.setEncoding('utf8');
                        response.on('data', (chunk) => { clobData += chunk; });
                        response.on('end', () => resolve(clobData));
                        response.on('error', (err) => reject(err));
                    });
                }
                return response;
            }
            return null;
        } catch (err) {
            console.error('Error running DBMS_CLOUD_AI_AGENT:', err);
            throw err;
        } finally {
            if (connection) {
                await connection.close();
            }
        }
    }

    async close() {
        if (this.pool) {
            try {
                // Enforce immediate drain timeout (0) to bypass busy state blocking
                await this.pool.close(0);
            } catch (closeErr) {
                console.warn(`⚠️ Warning: Forced connection pool shutdown notice: ${closeErr.message}`);
            }
        }
    }
}

module.exports = new OracleDBService();
