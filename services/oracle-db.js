const oracledb = require('oracledb');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');
const child_process = require('child_process');

dotenv.config();

/**
 * Oracle Database Service for Vector Search and Private Agent Factory
 * Implements connection lifecycle, user provisioning, and schema initialization as defined in README.txt
 */
class OracleDBService {
    constructor() {
        this.config = {
            user: process.env.DB_USERNAME || process.env.ORACLE_USER || 'ADMIN',
            password: process.env.DB_PASSWORD || process.env.ORACLE_PASSWORD,
            connectString: process.env.DB_DSN || process.env.ORACLE_TNS_ALIAS || 'jdatpai02_medium',
            walletLocation: process.env.DB_WALLET_DIR || process.env.ORACLE_WALLET,
            walletPassword: process.env.DB_WALLET_PASSWORD || process.env.DB_PASSWORD,
        };
        this.pool = null;
        this.prepareWallet();
    }

    /**
     * Extracts and configures Oracle Autonomous Database wallet if a .zip archive is provided
     */
    prepareWallet() {
        if (this.config.walletLocation) {
            let targetWalletDir = this.config.walletLocation;
            if (targetWalletDir.endsWith('.zip')) {
                const extractDir = path.join(process.cwd(), '.oracle_wallet');
                try {
                    if (!fs.existsSync(extractDir)) {
                        fs.mkdirSync(extractDir, { recursive: true });
                    }
                    if (fs.existsSync(targetWalletDir)) {
                        child_process.execSync(`unzip -o "${targetWalletDir}" -d "${extractDir}"`, { stdio: 'ignore' });
                        targetWalletDir = extractDir;

                        // Patch extracted sqlnet.ora to rewrite absolute local wallet paths dynamically
                        const sqlnetPath = path.join(extractDir, 'sqlnet.ora');
                        if (fs.existsSync(sqlnetPath)) {
                            let sqlnetStr = fs.readFileSync(sqlnetPath, 'utf8');
                            sqlnetStr = sqlnetStr.replace(/\?\/network\/admin/g, extractDir.replace(/\\/g, '/'));
                            fs.writeFileSync(sqlnetPath, sqlnetStr, 'utf8');
                        }
                    }
                } catch (unzipErr) {
                    console.warn(`⚠️ Warning: Could not unzip wallet automatically: ${unzipErr.message}`);
                }
            }
            process.env.TNS_ADMIN = targetWalletDir;
        }
    }

    /**
     * Test connection to Oracle Database and return diagnostic metadata
     * (Matches UI "Test Connection" step in README.txt)
     */
    async testConnection(customConfig = null) {
        const cfg = customConfig || this.config;
        const startTime = Date.now();
        let connection = null;

        try {
            this.prepareWallet();
            const connParams = {
                user: cfg.user,
                password: cfg.password,
                connectString: cfg.connectString,
            };

            if (this.config.walletLocation || process.env.TNS_ADMIN) {
                const resolvedDir = process.env.TNS_ADMIN || this.config.walletLocation;
                connParams.configDir = resolvedDir;
                connParams.walletLocation = resolvedDir;
                if (cfg.walletPassword) {
                    connParams.walletPassword = cfg.walletPassword;
                }
            }

            connection = await oracledb.getConnection(connParams);
            const latencyMs = Date.now() - startTime;

            // Fetch DB version, banner, and session info
            const versionRes = await connection.execute(
                "SELECT BANNER FROM V$VERSION WHERE ROWNUM = 1",
                [],
                { outFormat: oracledb.OUT_FORMAT_OBJECT }
            );
            const banner = versionRes.rows && versionRes.rows[0] ? (versionRes.rows[0].BANNER || versionRes.rows[0].banner) : 'Oracle Database';

            const userRes = await connection.execute(
                "SELECT USER as CURRENT_USER, SYS_CONTEXT('USERENV', 'DB_NAME') as DB_NAME, SYS_CONTEXT('USERENV', 'CON_NAME') as PDB_NAME FROM DUAL",
                [],
                { outFormat: oracledb.OUT_FORMAT_OBJECT }
            );
            const session = userRes.rows && userRes.rows[0] ? userRes.rows[0] : {};

            return {
                status: 'CONNECTED',
                success: true,
                latencyMs,
                banner,
                user: session.CURRENT_USER || cfg.user,
                dbName: session.DB_NAME || 'ORCL',
                pdbName: session.PDB_NAME || 'FREEPDB1',
                connectString: cfg.connectString,
                timestamp: new Date().toISOString()
            };
        } catch (err) {
            return {
                status: 'FAILED',
                success: false,
                latencyMs: Date.now() - startTime,
                error: err.message,
                connectString: cfg.connectString,
                timestamp: new Date().toISOString()
            };
        } finally {
            if (connection) {
                await connection.close();
            }
        }
    }

    /**
     * Provisions Application and Read-Only Users as documented in README.txt (lines 107-119):
     * 1. CREATE USER <DB_USER> IDENTIFIED BY <DB_PASSWORD> ...
     * 2. GRANT CREATE SESSION, CREATE TABLE, ... TO <DB_USER>
     * 3. CREATE USER AAI_RO_<DB_USER> IDENTIFIED BY <DB_PASSWORD> ...
     * 4. GRANT CREATE SESSION TO AAI_RO_<DB_USER>
     */
    async provisionApplicationUsers(dbUser = null, dbPassword = null) {
        const targetUser = (dbUser || this.config.user || 'AAI_USER').toUpperCase();
        const targetPassword = dbPassword || this.config.password;
        const roUser = `AAI_RO_${targetUser}`;

        let connection = null;
        const results = [];

        try {
            connection = await this.pool.getConnection();

            // 1. Provision Main Application User
            const userCheck = await connection.execute(
                `SELECT COUNT(*) as CNT FROM ALL_USERS WHERE USERNAME = :u`,
                { u: targetUser },
                { outFormat: oracledb.OUT_FORMAT_OBJECT }
            );
            const userExists = (userCheck.rows[0].CNT || userCheck.rows[0].cnt) > 0;

            if (!userExists) {
                await connection.execute(`CREATE USER ${targetUser} IDENTIFIED BY "${targetPassword}" DEFAULT TABLESPACE USERS QUOTA UNLIMITED ON USERS`);
                results.push(`Created user ${targetUser}`);
            } else {
                results.push(`User ${targetUser} already exists`);
            }

            // Grant permissions
            await connection.execute(`GRANT CREATE SESSION, CREATE TABLE, CREATE SEQUENCE, CREATE TRIGGER, CREATE TYPE, CREATE PROCEDURE, CREATE VIEW, CREATE SYNONYM TO ${targetUser}`);
            try {
                await connection.execute(`GRANT READ, WRITE ON DIRECTORY DATA_PUMP_DIR TO ${targetUser}`);
            } catch (dpErr) {
                // DATA_PUMP_DIR may not exist on all non-ADB setups
            }
            results.push(`Granted runtime privileges to ${targetUser}`);

            // 2. Provision Read-Only User (AAI_RO_<DB_USER>)
            const roCheck = await connection.execute(
                `SELECT COUNT(*) as CNT FROM ALL_USERS WHERE USERNAME = :u`,
                { u: roUser },
                { outFormat: oracledb.OUT_FORMAT_OBJECT }
            );
            const roExists = (roCheck.rows[0].CNT || roCheck.rows[0].cnt) > 0;

            if (!roExists) {
                await connection.execute(`CREATE USER ${roUser} IDENTIFIED BY "${targetPassword}" ACCOUNT UNLOCK`);
                results.push(`Created read-only user ${roUser}`);
            } else {
                results.push(`Read-only user ${roUser} already exists`);
            }
            await connection.execute(`GRANT CREATE SESSION TO ${roUser}`);
            results.push(`Granted CREATE SESSION to ${roUser}`);

            return { success: true, targetUser, roUser, logs: results };
        } catch (err) {
            console.error('User provisioning failed:', err.message);
            throw err;
        } finally {
            if (connection) {
                await connection.close();
            }
        }
    }

    async initialize() {
        try {
            console.log('Connecting to Oracle Database...');
            this.prepareWallet();

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

            if (this.config.walletLocation || process.env.TNS_ADMIN) {
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

    async runPrivateAgent(agentId, prompt) {
        let connection;
        try {
            connection = await this.pool.getConnection();
            const teamName = `${agentId.toUpperCase()}_TEAM`;
            
            // Try calling via package first, fallback to DBMS_CLOUD_AI_AGENT.RUN
            const sql = `
                SELECT DBMS_CLOUD_AI_AGENT.RUN(
                    team_name => :teamName,
                    prompt => :prompt
                ) AS response FROM DUAL
            `;

            const result = await connection.execute(sql, {
                teamName: teamName,
                prompt: prompt
            }, { outFormat: oracledb.OUT_FORMAT_OBJECT });

            if (result.rows && result.rows[0]) {
                let response = result.rows[0].RESPONSE || result.rows[0].response;
                if (response && typeof response.getData === 'function') {
                    response = await response.getData();
                }
                return response;
            }
            return null;
        } catch (err) {
            console.error(`Error running Private Agent [${agentId}]:`, err.message);
            throw err;
        } finally {
            if (connection) {
                await connection.close();
            }
        }
    }

    async getDatabaseAgentCatalog() {
        let connection;
        try {
            connection = await this.pool.getConnection();
            const sql = `
                SELECT AGENT_ID, AGENT_NAME, DOMAIN_SCOPE, MODEL_PROFILE, DEPLOYMENT_TARGET, STATUS, TO_CHAR(CREATED_AT, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as CREATED_AT
                FROM ORACLE_AI_AGENT_CATALOG
                WHERE STATUS = 'ACTIVE'
            `;
            const result = await connection.execute(sql, {}, { outFormat: oracledb.OUT_FORMAT_OBJECT });
            return result.rows || [];
        } catch (err) {
            console.warn('Notice: ORACLE_AI_AGENT_CATALOG table not yet initialized in database.', err.message);
            return [];
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
