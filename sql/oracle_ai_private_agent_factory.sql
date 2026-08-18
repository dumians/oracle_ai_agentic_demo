rem ============================================================================
rem LICENSE
rem   Copyright (c) 2026 Oracle and/or its affiliates.
rem   Licensed under the Universal Permissive License (UPL), Version 1.0
rem   https://oss.oracle.com/licenses/upl/
rem
rem NAME
rem   oracle_ai_private_agent_factory.sql
rem
rem DESCRIPTION
rem   Enterprise Private Agent Factory and Autonomous Agentic Framework
rem   for Oracle Database 23ai / 26ai on Oracle Database@Google Cloud.
rem
rem   This script installs:
rem     1. Agent Factory Catalog & Metrics Tables (ORACLE_AI_AGENT_CATALOG, ORACLE_AI_AGENT_METRICS)
rem     2. Autonomous Agent Factory Package (ORACLE_AI_AGENT_FACTORY_PKG)
rem     3. Native Private Agent Tools (SQL, Vector, Graph, Spatial, Anomaly, Charting)
rem     4. Pre-configured Enterprise Private Agent Blueprints:
rem        - SUPPLY_CHAIN_AUDITOR
rem        - SQL_TUNING_SENTINEL
rem        - FINANCIAL_RECONCILIATION_AGENT
rem        - CYBER_AUDIT_GUARDIAN
rem        - PREDICTIVE_MAINTENANCE_AGENT
rem
rem ============================================================================

SET SERVEROUTPUT ON
SET VERIFY OFF

PROMPT ======================================================
PROMPT Oracle AI Private Agent Factory & Agentic Framework
PROMPT ======================================================

VAR v_schema VARCHAR2(128)
EXEC :v_schema := NVL('&SCHEMA_NAME', USER);

VAR v_ai_profile_name VARCHAR2(128)
EXEC :v_ai_profile_name := NVL('&AI_PROFILE_NAME', 'VERTEX_AI_GEMINI_PROFILE');

----------------------------------------------------------------
-- 1. Agent Catalog & Telemetry Tables Setup
----------------------------------------------------------------
PROMPT Creating Agent Factory Catalog and Telemetry Tables...

DECLARE
  l_count NUMBER;
BEGIN
  -- Table: ORACLE_AI_AGENT_CATALOG
  SELECT COUNT(*) INTO l_count FROM user_tables WHERE table_name = 'ORACLE_AI_AGENT_CATALOG';
  IF l_count = 0 THEN
    EXECUTE IMMEDIATE '
      CREATE TABLE ORACLE_AI_AGENT_CATALOG (
        AGENT_ID          VARCHAR2(64) PRIMARY KEY,
        AGENT_NAME        VARCHAR2(256) NOT NULL,
        DOMAIN_SCOPE      VARCHAR2(128) NOT NULL,
        MODEL_PROFILE     VARCHAR2(128) NOT NULL,
        DEPLOYMENT_TARGET VARCHAR2(64) DEFAULT ''HYBRID'',
        SYSTEM_ROLE       CLOB NOT NULL,
        TASK_INSTRUCTION  CLOB NOT NULL,
        TOOLS_JSON        CLOB NOT NULL,
        STATUS            VARCHAR2(32) DEFAULT ''ACTIVE'',
        CREATED_AT        TIMESTAMP DEFAULT SYSTIMESTAMP,
        UPDATED_AT        TIMESTAMP DEFAULT SYSTIMESTAMP
      )';
    DBMS_OUTPUT.PUT_LINE('Created ORACLE_AI_AGENT_CATALOG table.');
  END IF;

  -- Table: ORACLE_AI_AGENT_METRICS
  SELECT COUNT(*) INTO l_count FROM user_tables WHERE table_name = 'ORACLE_AI_AGENT_METRICS';
  IF l_count = 0 THEN
    EXECUTE IMMEDIATE '
      CREATE TABLE ORACLE_AI_AGENT_METRICS (
        EXECUTION_ID      VARCHAR2(64) PRIMARY KEY,
        AGENT_ID          VARCHAR2(64) NOT NULL,
        USER_PROMPT       CLOB,
        EXECUTION_STATUS  VARCHAR2(32),
        LATENCY_MS        NUMBER,
        TOKENS_USED       NUMBER,
        TOOL_CALLS_COUNT  NUMBER DEFAULT 0,
        EXECUTED_BY       VARCHAR2(128) DEFAULT USER,
        EXECUTED_AT       TIMESTAMP DEFAULT SYSTIMESTAMP,
        CONSTRAINT FK_AGENT_METRIC FOREIGN KEY (AGENT_ID) REFERENCES ORACLE_AI_AGENT_CATALOG (AGENT_ID) ON DELETE CASCADE
      )';
    DBMS_OUTPUT.PUT_LINE('Created ORACLE_AI_AGENT_METRICS table.');
  END IF;
END;
/

----------------------------------------------------------------
-- 2. Oracle AI Agent Factory Package Specification
----------------------------------------------------------------
PROMPT Creating Package Specification: ORACLE_AI_AGENT_FACTORY_PKG...

CREATE OR REPLACE PACKAGE oracle_ai_agent_factory_pkg AS

  -- Provision a new private agent into DBMS_CLOUD_AI_AGENT and local catalog
  PROCEDURE provision_private_agent (
    p_agent_id          IN VARCHAR2,
    p_agent_name        IN VARCHAR2,
    p_domain_scope      IN VARCHAR2,
    p_model_profile     IN VARCHAR2,
    p_deployment_target IN VARCHAR2 DEFAULT 'HYBRID',
    p_system_role       IN CLOB,
    p_task_instruction  IN CLOB,
    p_tools_json        IN CLOB
  );

  -- Execute a private agent task with audit logging and return response CLOB
  FUNCTION execute_private_agent (
    p_agent_id    IN VARCHAR2,
    p_user_prompt IN CLOB
  ) RETURN CLOB;

  -- Decommission an existing private agent safely
  PROCEDURE decommission_private_agent (
    p_agent_id IN VARCHAR2
  );

  -- Retrieve all cataloged agents as JSON array
  FUNCTION get_agent_catalog_json RETURN CLOB;

  -- Retrieve execution metrics for a specific agent or all agents as JSON
  FUNCTION get_agent_metrics_json (
    p_agent_id IN VARCHAR2 DEFAULT NULL
  ) RETURN CLOB;

END oracle_ai_agent_factory_pkg;
/

----------------------------------------------------------------
-- 3. Oracle AI Agent Factory Package Body
----------------------------------------------------------------
PROMPT Creating Package Body: ORACLE_AI_AGENT_FACTORY_PKG...

CREATE OR REPLACE PACKAGE BODY oracle_ai_agent_factory_pkg AS

  PROCEDURE provision_private_agent (
    p_agent_id          IN VARCHAR2,
    p_agent_name        IN VARCHAR2,
    p_domain_scope      IN VARCHAR2,
    p_model_profile     IN VARCHAR2,
    p_deployment_target IN VARCHAR2 DEFAULT 'HYBRID',
    p_system_role       IN CLOB,
    p_task_instruction  IN CLOB,
    p_tools_json        IN CLOB
  ) IS
    l_task_name   VARCHAR2(128) := UPPER(p_agent_id) || '_TASK';
    l_agent_name  VARCHAR2(128) := UPPER(p_agent_id) || '_AGENT';
    l_team_name   VARCHAR2(128) := UPPER(p_agent_id) || '_TEAM';
    l_task_attr   CLOB;
    l_agent_attr  CLOB;
    l_team_attr   CLOB;
  BEGIN
    -- 1. Upsert metadata into ORACLE_AI_AGENT_CATALOG
    MERGE INTO ORACLE_AI_AGENT_CATALOG c
    USING (SELECT p_agent_id AS agent_id FROM dual) s
    ON (c.agent_id = s.agent_id)
    WHEN MATCHED THEN
      UPDATE SET 
        agent_name        = p_agent_name,
        domain_scope      = p_domain_scope,
        model_profile     = p_model_profile,
        deployment_target = p_deployment_target,
        system_role       = p_system_role,
        task_instruction  = p_task_instruction,
        tools_json        = p_tools_json,
        status            = 'ACTIVE',
        updated_at        = SYSTIMESTAMP
    WHEN NOT MATCHED THEN
      INSERT (agent_id, agent_name, domain_scope, model_profile, deployment_target, system_role, task_instruction, tools_json, status, created_at, updated_at)
      VALUES (p_agent_id, p_agent_name, p_domain_scope, p_model_profile, p_deployment_target, p_system_role, p_task_instruction, p_tools_json, 'ACTIVE', SYSTIMESTAMP, SYSTIMESTAMP);

    COMMIT;

    -- 2. Build Task Attributes and create task in DBMS_CLOUD_AI_AGENT
    BEGIN
      DBMS_CLOUD_AI_AGENT.DROP_TASK(l_task_name);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    l_task_attr := '{' ||
      '"instruction":' || JSON_ARRAY(p_task_instruction RETURNING CLOB) || '[0],' ||
      '"tools":' || p_tools_json || ',' ||
      '"enable_human_tool":"false"' ||
      '}';

    DBMS_CLOUD_AI_AGENT.CREATE_TASK(
      task_name   => l_task_name,
      description => 'Autonomous Task for ' || p_agent_name,
      attributes  => l_task_attr
    );

    -- 3. Build Agent Attributes and create agent
    BEGIN
      DBMS_CLOUD_AI_AGENT.DROP_AGENT(l_agent_name);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    l_agent_attr := '{' ||
      '"profile_name":"' || p_model_profile || '",' ||
      '"role":' || JSON_ARRAY(p_system_role RETURNING CLOB) || '[0]' ||
      '}';

    DBMS_CLOUD_AI_AGENT.CREATE_AGENT(
      agent_name  => l_agent_name,
      attributes  => l_agent_attr,
      description => 'Private AI Agent for ' || p_agent_name
    );

    -- 4. Build Team Attributes and create team
    BEGIN
      DBMS_CLOUD_AI_AGENT.DROP_TEAM(l_team_name);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    l_team_attr := '{' ||
      '"agents":[{"name":"' || l_agent_name || '","task":"' || l_task_name || '"}],' ||
      '"process":"sequential"' ||
      '}';

    DBMS_CLOUD_AI_AGENT.CREATE_TEAM(
      team_name   => l_team_name,
      attributes  => l_team_attr,
      description => 'Autonomous Team Orchestrator for ' || p_agent_name
    );

    DBMS_OUTPUT.PUT_LINE('✓ Private Agent [' || p_agent_id || '] provisioned successfully in Oracle DB.');
  EXCEPTION
    WHEN OTHERS THEN
      DBMS_OUTPUT.PUT_LINE('Error provisioning agent: ' || SQLERRM);
      RAISE;
  END provision_private_agent;

  FUNCTION execute_private_agent (
    p_agent_id    IN VARCHAR2,
    p_user_prompt IN CLOB
  ) RETURN CLOB IS
    l_team_name    VARCHAR2(128) := UPPER(p_agent_id) || '_TEAM';
    l_exec_id      VARCHAR2(64)  := 'exec-' || SYS_GUID();
    l_start_time   TIMESTAMP;
    l_end_time     TIMESTAMP;
    l_latency_ms   NUMBER;
    l_response     CLOB;
    l_status       VARCHAR2(32)  := 'SUCCESS';
  BEGIN
    l_start_time := SYSTIMESTAMP;

    BEGIN
      -- Execute using native DBMS_CLOUD_AI_AGENT.RUN
      l_response := DBMS_CLOUD_AI_AGENT.RUN(
        team_name => l_team_name,
        prompt    => p_user_prompt
      );
    EXCEPTION
      WHEN OTHERS THEN
        l_status := 'FAILED';
        l_response := '{"error":"Agent execution failed: ' || REPLACE(SQLERRM, '"', '\"') || '"}';
    END;

    l_end_time := SYSTIMESTAMP;
    l_latency_ms := ROUND(EXTRACT(SECOND FROM (l_end_time - l_start_time)) * 1000 +
                          EXTRACT(MINUTE FROM (l_end_time - l_start_time)) * 60000);

    -- Record execution telemetry
    INSERT INTO ORACLE_AI_AGENT_METRICS (
      EXECUTION_ID, AGENT_ID, USER_PROMPT, EXECUTION_STATUS, LATENCY_MS, TOKENS_USED, EXECUTED_BY, EXECUTED_AT
    ) VALUES (
      l_exec_id, p_agent_id, p_user_prompt, l_status, l_latency_ms, 0, USER, l_start_time
    );
    COMMIT;

    RETURN l_response;
  END execute_private_agent;

  PROCEDURE decommission_private_agent (
    p_agent_id IN VARCHAR2
  ) IS
    l_task_name   VARCHAR2(128) := UPPER(p_agent_id) || '_TASK';
    l_agent_name  VARCHAR2(128) := UPPER(p_agent_id) || '_AGENT';
    l_team_name   VARCHAR2(128) := UPPER(p_agent_id) || '_TEAM';
  BEGIN
    BEGIN DBMS_CLOUD_AI_AGENT.DROP_TEAM(l_team_name); EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN DBMS_CLOUD_AI_AGENT.DROP_AGENT(l_agent_name); EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN DBMS_CLOUD_AI_AGENT.DROP_TASK(l_task_name); EXCEPTION WHEN OTHERS THEN NULL; END;

    UPDATE ORACLE_AI_AGENT_CATALOG 
    SET STATUS = 'DECOMMISSIONED', UPDATED_AT = SYSTIMESTAMP
    WHERE AGENT_ID = p_agent_id;
    COMMIT;

    DBMS_OUTPUT.PUT_LINE('✓ Private Agent [' || p_agent_id || '] decommissioned.');
  END decommission_private_agent;

  FUNCTION get_agent_catalog_json RETURN CLOB IS
    l_json CLOB;
  BEGIN
    SELECT JSON_ARRAYAGG(
      JSON_OBJECT(
        'agentId'          VALUE AGENT_ID,
        'agentName'        VALUE AGENT_NAME,
        'domainScope'      VALUE DOMAIN_SCOPE,
        'modelProfile'     VALUE MODEL_PROFILE,
        'deploymentTarget' VALUE DEPLOYMENT_TARGET,
        'status'           VALUE STATUS,
        'systemRole'       VALUE SYSTEM_ROLE,
        'taskInstruction'  VALUE TASK_INSTRUCTION,
        'tools'            VALUE JSON_QUERY(TOOLS_JSON, '$' RETURNING CLOB),
        'createdAt'        VALUE TO_CHAR(CREATED_AT, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
        'updatedAt'        VALUE TO_CHAR(UPDATED_AT, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
      RETURNING CLOB)
    RETURNING CLOB) INTO l_json
    FROM ORACLE_AI_AGENT_CATALOG;

    RETURN NVL(l_json, '[]');
  END get_agent_catalog_json;

  FUNCTION get_agent_metrics_json (
    p_agent_id IN VARCHAR2 DEFAULT NULL
  ) RETURN CLOB IS
    l_json CLOB;
  BEGIN
    SELECT JSON_ARRAYAGG(
      JSON_OBJECT(
        'executionId'      VALUE EXECUTION_ID,
        'agentId'          VALUE AGENT_ID,
        'executionStatus'  VALUE EXECUTION_STATUS,
        'latencyMs'        VALUE LATENCY_MS,
        'toolCallsCount'   VALUE TOOL_CALLS_COUNT,
        'executedBy'       VALUE EXECUTED_BY,
        'executedAt'       VALUE TO_CHAR(EXECUTED_AT, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
      RETURNING CLOB)
    RETURNING CLOB) INTO l_json
    FROM (
      SELECT * FROM ORACLE_AI_AGENT_METRICS
      WHERE (p_agent_id IS NULL OR AGENT_ID = p_agent_id)
      ORDER BY EXECUTED_AT DESC
      FETCH FIRST 50 ROWS ONLY
    );

    RETURN NVL(l_json, '[]');
  END get_agent_metrics_json;

END oracle_ai_agent_factory_pkg;
/

----------------------------------------------------------------
-- 4. Seed Pre-Configured Enterprise Private Agent Blueprints
----------------------------------------------------------------
PROMPT Seeding Enterprise Private Agent Blueprints into Factory...

BEGIN
  -- Blueprint 1: Supply Chain Risk Auditor
  oracle_ai_agent_factory_pkg.provision_private_agent(
    p_agent_id          => 'supply_chain_auditor',
    p_agent_name        => 'Supply Chain Risk Auditor',
    p_domain_scope      => 'Oracle Supply Chain ERP',
    p_model_profile     => :v_ai_profile_name,
    p_deployment_target => 'HYBRID',
    p_system_role       => 'You are an autonomous Supply Chain Risk Auditor embedded in Oracle Database 26ai. You evaluate multi-tier supply chain dependencies, monitor shipping bottlenecks, detect warehouse stockouts, and propose grounded transfer operations.',
    p_task_instruction  => 'Analyze the supply chain query: {query}. First inspect inventory balances with SQL_TOOL. If supplier or plant dependencies are involved, consult dependency graphs. Identify spatial warehouse hotspots and formulate an actionable inventory transfer draft if risk is critical.',
    p_tools_json        => '["SQL_TOOL","DISTINCT_VALUES_CHECK","RANGE_VALUES_CHECK","GENERATE_CHART"]'
  );

  -- Blueprint 2: Autonomous SQL Performance & Tuning Sentinel
  oracle_ai_agent_factory_pkg.provision_private_agent(
    p_agent_id          => 'sql_tuning_sentinel',
    p_agent_name        => 'SQL Tuning & Index Sentinel',
    p_domain_scope      => 'Oracle Database Core Diagnostics',
    p_model_profile     => :v_ai_profile_name,
    p_deployment_target => 'DB_NATIVE',
    p_system_role       => 'You are an expert Oracle Autonomous Database Performance and Index Tuning Sentinel. You analyze SQL execution plans, identify missing vector indexes (HNSW, IVF), detect full table scans on large tables, and provide automated SQL rewrite recommendations.',
    p_task_instruction  => 'Inspect the SQL or performance question: {query}. Analyze execution metrics, recommend partition pruning or vector index creations, and provide optimized PL/SQL and SQL remediation code.',
    p_tools_json        => '["SQL_TOOL","RANGE_VALUES_CHECK"]'
  );

  -- Blueprint 3: Financial Reconciliation & Fraud Sentinel
  oracle_ai_agent_factory_pkg.provision_private_agent(
    p_agent_id          => 'financial_recon_agent',
    p_agent_name        => 'Financial Reconciliation & Anomaly Agent',
    p_domain_scope      => 'Oracle Financials General Ledger',
    p_model_profile     => :v_ai_profile_name,
    p_deployment_target => 'GCP_CONTAINER',
    p_system_role       => 'You are a Financial Reconciliation and Fraud Sentinel agent. You verify general ledger double-entry balances, detect statistical anomalies in transaction streams, perform fuzzy merchant matching, and flag high-risk disbursements.',
    p_task_instruction  => 'Review financial discrepancies or transaction inquiries: {query}. Verify debit/credit balance equality using SQL_TOOL, run fuzzy distinct checks on merchant identifiers, and generate distribution charts for outliers.',
    p_tools_json        => '["SQL_TOOL","DISTINCT_VALUES_CHECK","RANGE_VALUES_CHECK","GENERATE_CHART"]'
  );

  -- Blueprint 4: Cyber Threat & Audit Guardian
  oracle_ai_agent_factory_pkg.provision_private_agent(
    p_agent_id          => 'cyber_audit_guardian',
    p_agent_name        => 'Cyber Audit & Compliance Guardian',
    p_domain_scope      => 'Oracle Unified Audit & Security',
    p_model_profile     => :v_ai_profile_name,
    p_deployment_target => 'HYBRID',
    p_system_role       => 'You are a Cyber Threat and Unified Audit Sentinel for Oracle Database on GCP. You continuously analyze UNIFIED_AUDIT_TRAIL events, detect anomalous privilege escalations, identify off-hours data exfiltration attempts, and enforce compliance policies.',
    p_task_instruction  => 'Analyze security telemetry or audit query: {query}. Check UNIFIED_AUDIT_TRAIL records, identify client IP origins, detect unauthorized DDL changes, and format structured forensic security incident briefs.',
    p_tools_json        => '["SQL_TOOL","RANGE_VALUES_CHECK"]'
  );

  -- Blueprint 5: Predictive Equipment Maintenance Agent
  oracle_ai_agent_factory_pkg.provision_private_agent(
    p_agent_id          => 'predictive_maintenance_agent',
    p_agent_name        => 'Predictive Maintenance & IoT Vector Agent',
    p_domain_scope      => 'Oracle IoT & Asset Management',
    p_model_profile     => :v_ai_profile_name,
    p_deployment_target => 'HYBRID',
    p_system_role       => 'You are a Predictive Equipment Maintenance Agent leveraging Oracle 26ai Vector Search on sensor telemetry embeddings. You compare live vibration and thermal vector profiles against historical failure vectors, predict remaining useful life (RUL), and draft preventive maintenance orders.',
    p_task_instruction  => 'Examine equipment telemetry or sensor inquiry: {query}. Perform vector similarity searches against failure pattern embeddings in RAG_TAB, correlate telemetry ranges, and generate diagnostic bar/line charts.',
    p_tools_json        => '["SQL_TOOL","RANGE_VALUES_CHECK","GENERATE_CHART"]'
  );

  DBMS_OUTPUT.PUT_LINE('======================================================');
  DBMS_OUTPUT.PUT_LINE('✓ Oracle AI Private Agent Factory initialized with 5 Blueprints.');
  DBMS_OUTPUT.PUT_LINE('======================================================');
END;
/
