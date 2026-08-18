/* -------------------------------------------------------------------------
   SPA STATE & INTERFACE MANAGER
   ------------------------------------------------------------------------- */

document.addEventListener('DOMContentLoaded', () => {
    // --- Global Application State ---
    const state = {
        activeTab: 'workspace',
        mode: 'real', // real or mock
        isPollingTrace: false,
        traceTimer: null,
        settings: { dataSources: [], agents: [] },
        logs: [],
        mcpTools: [],
        blueprints: [],
        privateAgents: [],
        activeSandboxAgentId: '',
        traceCollapsed: false
    };

    // --- Cache DOM Elements ---
    const elements = {
        // Navigation / Header
        navItems: document.querySelectorAll('.nav-item'),
        tabPanes: document.querySelectorAll('.tab-pane'),
        pageTitle: document.getElementById('page-title'),
        pageSubtitle: document.getElementById('page-subtitle'),
        modeRealBtn: document.getElementById('mode-real'),
        modeMockBtn: document.getElementById('mode-mock'),
        refreshBtn: document.getElementById('refresh-btn'),
        refreshIcon: document.getElementById('refresh-icon'),

        // Chat / Workspace
        chatMessages: document.getElementById('chat-messages-box'),
        chatForm: document.getElementById('chat-input-form'),
        chatField: document.getElementById('chat-input-field'),
        chatSubmitBtn: document.getElementById('chat-submit-btn'),

        // Collapsible Trace
        tracePanel: document.getElementById('trace-panel'),
        toggleTraceBtn: document.getElementById('toggle-trace-btn'),
        traceArrow: document.getElementById('trace-toggle-arrow'),
        traceSteps: document.getElementById('trace-steps-container'),

        // Admin Containers
        dsContainer: document.getElementById('ds-list-container'),
        agentsContainer: document.getElementById('agents-list-container'),
        mcpServersContainer: document.getElementById('mcp-servers-container'),
        mcpToolsContainer: document.getElementById('mcp-tools-container'),
        terminalContainer: document.getElementById('terminal-output-box'),

        // Filters / Forms
        logFilter: document.getElementById('log-filter'),
        agentForm: document.getElementById('agent-config-form'),

        // Agent Form inputs
        cfgAgentId: document.getElementById('cfg-agent-id'),
        cfgAgentName: document.getElementById('cfg-agent-name'),
        cfgAgentModel: document.getElementById('cfg-agent-model'),
        cfgAgentDomain: document.getElementById('cfg-agent-domain'),
        cfgAgentPrompt: document.getElementById('cfg-agent-prompt'),
        formAgentTitle: document.getElementById('form-agent-title'),

        // Agent Factory Elements
        kpiActiveAgents: document.getElementById('kpi-active-agents'),
        factorySubnavBtns: document.querySelectorAll('.factory-subnav-btn'),
        factorySubviews: document.querySelectorAll('.factory-subview'),
        factoryBlueprintsContainer: document.getElementById('factory-blueprints-container'),
        btnOpenForge: document.getElementById('btn-open-forge'),
        agentForgeForm: document.getElementById('agent-forge-form'),
        sandboxAgentSelect: document.getElementById('sandbox-agent-select'),
        sandboxPresetPills: document.getElementById('sandbox-preset-pills'),
        sandboxQueryForm: document.getElementById('sandbox-query-form'),
        sandboxPromptInput: document.getElementById('sandbox-prompt-input'),
        sandboxSubmitBtn: document.getElementById('sandbox-submit-btn'),
        sandboxTraceContainer: document.getElementById('sandbox-trace-container'),
        sandboxResultBox: document.getElementById('sandbox-result-box'),
        sandboxResultContent: document.getElementById('sandbox-result-content'),
        sandboxStatusBadge: document.getElementById('sandbox-status-badge'),

        // Modals
        addDsModal: document.getElementById('add-ds-modal'),
        addDsForm: document.getElementById('add-ds-form'),
        btnAddDs: document.getElementById('btn-add-ds'),
        closeModalBtn: document.getElementById('close-modal-btn'),
        cancelModalBtn: document.getElementById('cancel-modal-btn'),
        dsNameInput: document.getElementById('ds-name'),
        dsDomainInput: document.getElementById('ds-domain'),

        // Export Modal
        exportCodeModal: document.getElementById('export-code-modal'),
        exportModalTitle: document.getElementById('export-modal-title'),
        exportModalSubtitle: document.getElementById('export-modal-subtitle'),
        exportCodeContent: document.getElementById('export-code-content'),
        copyExportCodeBtn: document.getElementById('copy-export-code-btn'),
        closeExportModalBtn: document.getElementById('close-export-modal-btn'),
        dismissExportModalBtn: document.getElementById('dismiss-export-modal-btn')
    };

    // --- Tab Titles / Subtitles Metadata ---
    const tabMetadata = {
        workspace: { title: 'Agent Workspace', subtitle: 'Interact and proof the multi-agent  in real-time.' },
        'agent-factory': { title: 'Private Agent Factory', subtitle: 'Provision, govern, and deploy database-native and GCP containerized agents.' },
        'data-sources': { title: 'Data Sources', subtitle: 'Manage connections to your cloud enterprise databases.' },
        'agent-config': { title: 'Agent Configuration', subtitle: 'Update system prompts, LLM choices, and scope boundaries.' },
        'mcp-tools': { title: 'MCP Toolbox', subtitle: 'Explore dynamic capabilities loaded through Model Context Protocol.' },
        'live-logs': { title: 'Live Telemetry', subtitle: 'Inspect active transactional events and engine routing trails.' }
    };

    // --- Initialization ---
    const init = async () => {
        setupEventListeners();
        injectInitialChatMessage();
        await refreshData();
        // Poll server telemetry logs every 3.5 seconds in background
        setInterval(fetchTelemetryLogs, 3500);
    };

    // --- Event Listeners Setup ---
    const setupEventListeners = () => {
        // Navigation switching
        elements.navItems.forEach(item => {
            item.addEventListener('click', () => {
                const targetTab = item.getAttribute('data-tab');
                switchTab(targetTab);
            });
        });

        // Switch Mode (Real vs Simulation)
        elements.modeRealBtn.addEventListener('click', () => switchMode('real'));
        elements.modeMockBtn.addEventListener('click', () => switchMode('mock'));

        // Manual Sync Refresher
        elements.refreshBtn.addEventListener('click', async () => {
            elements.refreshIcon.classList.add('animate-spin');
            await refreshData();
            setTimeout(() => {
                elements.refreshIcon.classList.remove('animate-spin');
            }, 800);
        });

        // Chat form submit
        elements.chatForm.addEventListener('click', (e) => {
            // If the click is on the submit button inside form
            const submitBtn = e.target.closest('#chat-submit-btn');
            if (submitBtn) {
                e.preventDefault();
                submitUserQuery();
            }
        });
        elements.chatForm.addEventListener('submit', (e) => {
            e.preventDefault();
            submitUserQuery();
        });

        // Collapsible Trace Panel
        elements.toggleTraceBtn.addEventListener('click', () => {
            state.traceCollapsed = !state.traceCollapsed;
            if (state.traceCollapsed) {
                elements.tracePanel.classList.add('collapsed');
                elements.traceArrow.style.transform = 'rotate(180deg)';
            } else {
                elements.tracePanel.classList.remove('collapsed');
                elements.traceArrow.style.transform = 'rotate(0deg)';
            }
        });

        // Log domain filtering
        elements.logFilter.addEventListener('change', renderTelemetryLogs);

        // Save Agent Settings Configuration
        elements.agentForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const agentId = elements.cfgAgentId.value;
            const payload = {
                name: elements.cfgAgentName.value,
                model: elements.cfgAgentModel.value,
                domain: elements.cfgAgentDomain.value,
                systemInstruction: elements.cfgAgentPrompt.value
            };

            try {
                const response = await fetch(`/api/config/agents/${agentId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                if (response.ok) {
                    alert('Agent settings updated successfully!');
                    await fetchSettings();
                }
            } catch (err) {
                console.error('Failed to update agent settings:', err);
            }
        });

        // Modals event listeners for Registering Data Source
        elements.btnAddDs.addEventListener('click', () => {
            elements.addDsModal.classList.add('active');
        });
        const closeModal = () => {
            elements.addDsModal.classList.remove('active');
            elements.addDsForm.reset();
        };
        elements.closeModalBtn.addEventListener('click', closeModal);
        elements.cancelModalBtn.addEventListener('click', closeModal);

        elements.addDsForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const payload = {
                name: elements.dsNameInput.value,
                domain: elements.dsDomainInput.value
            };
            try {
                const response = await fetch('/api/config/data-sources', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                if (response.ok) {
                    closeModal();
                    await fetchSettings();
                }
            } catch (err) {
                console.error('Failed to register data source:', err);
            }
        });

        // --- Agent Factory Sub-Navigation Switching ---
        elements.factorySubnavBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const targetSubview = btn.getAttribute('data-subview');
                switchFactorySubview(targetSubview);
            });
        });

        if (elements.btnOpenForge) {
            elements.btnOpenForge.addEventListener('click', () => {
                switchFactorySubview('forge');
            });
        }

        // Agent Forge Form Submit
        if (elements.agentForgeForm) {
            elements.agentForgeForm.addEventListener('submit', handleForgeSubmit);
        }

        // Sandbox Agent Select Change
        if (elements.sandboxAgentSelect) {
            elements.sandboxAgentSelect.addEventListener('change', (e) => {
                const selectedId = e.target.value;
                state.activeSandboxAgentId = selectedId;
                renderSandboxPresets(selectedId);
            });
        }

        // Sandbox Query Form Submit
        if (elements.sandboxQueryForm) {
            elements.sandboxQueryForm.addEventListener('submit', handleSandboxSubmit);
        }

        // Export Modal Close Handlers
        const closeExportModal = () => {
            if (elements.exportCodeModal) {
                elements.exportCodeModal.classList.remove('active');
            }
        };
        if (elements.closeExportModalBtn) elements.closeExportModalBtn.addEventListener('click', closeExportModal);
        if (elements.dismissExportModalBtn) elements.dismissExportModalBtn.addEventListener('click', closeExportModal);
        if (elements.copyExportCodeBtn) elements.copyExportCodeBtn.addEventListener('click', copyExportCode);
    };

    // --- Switch Factory Subview (Blueprints, Forge, Sandbox, Topology) ---
    const switchFactorySubview = (subviewId) => {
        elements.factorySubnavBtns.forEach(btn => {
            if (btn.getAttribute('data-subview') === subviewId) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        elements.factorySubviews.forEach(view => {
            if (view.getAttribute('id') === `factory-subview-${subviewId}`) {
                view.classList.add('active');
            } else {
                view.classList.remove('active');
            }
        });
        lucide.createIcons();
    };

    // --- Tab Switching Logic ---
    const switchTab = (tabId) => {
        state.activeTab = tabId;

        // Update navigation styles
        elements.navItems.forEach(btn => {
            if (btn.getAttribute('data-tab') === tabId) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        // Toggle viewport views
        elements.tabPanes.forEach(pane => {
            if (pane.getAttribute('id') === `tab-${tabId}`) {
                pane.classList.add('active');
            } else {
                pane.classList.remove('active');
            }
        });

        // Update Page Meta titles
        const meta = tabMetadata[tabId] || { title: 'Oracle Gateway', subtitle: '' };
        elements.pageTitle.innerText = meta.title;
        elements.pageSubtitle.innerText = meta.subtitle;

        // Trigger dynamic layouts rendering if needed
        if (tabId === 'live-logs') {
            setTimeout(() => {
                elements.terminalContainer.scrollTop = elements.terminalContainer.scrollHeight;
            }, 100);
        } else if (tabId === 'agent-factory') {
            fetchAgentFactoryData();
        }
    };

    // --- Toggle Mode (Real vs Simulation) ---
    const switchMode = (mode) => {
        state.mode = mode;
        if (mode === 'real') {
            elements.modeRealBtn.classList.add('active');
            elements.modeMockBtn.classList.remove('active');
        } else {
            elements.modeMockBtn.classList.add('active');
            elements.modeRealBtn.classList.remove('active');
        }

        // Output a message to terminal logs to document the change
        console.log(`Environment profile toggled to: ${mode.toUpperCase()}`);
    };

    // --- Fetch Actions & Synchronization ---
    const refreshData = async () => {
        await fetchSettings();
        await fetchTelemetryLogs();
        await fetchMcpTools();
        await fetchAgentFactoryData();
    };

    const fetchSettings = async () => {
        try {
            const res = await fetch('/api/settings');
            state.settings = await res.json();
            renderDataSources();
            renderAgents();
            renderMcpServers();
        } catch (err) {
            console.error('Failed to sync settings:', err);
        }
    };

    const fetchTelemetryLogs = async () => {
        try {
            const res = await fetch('/api/admin/logs');
            const data = await res.json();
            state.logs = data.logs || [];
            renderTelemetryLogs();
        } catch (err) {
            console.warn('Could not sync telemetry logs.');
        }
    };

    const fetchMcpTools = async () => {
        try {
            const res = await fetch('/api/mcp/tools');
            state.mcpTools = await res.json();
            renderMcpTools();
        } catch (err) {
            console.error('Failed to sync MCP tools:', err);
        }
    };


    // --- Render Functions ---

    const injectInitialChatMessage = () => {
        elements.chatMessages.innerHTML = '';
        appendMessageBubble('agent', `Hello! I am the primary Multi-Agent Gateway. I coordinate a federated  of domain-scoped specialist agents (RAG, Graph, Spatial, Select AI, Action) grounded in your Oracle Database 26ai and Vertex AI infrastructure.\n\nAsk me a question to test the agents in real-time! E.g.:\n- "What inventory transfer actions should we take for SKU-500?"\n- "Generate a Stock Distribution Bar Chart for SKU-500 across our warehouses."`);
    };

    const appendMessageBubble = (sender, text) => {
        const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const wrapper = document.createElement('div');
        wrapper.className = `message-wrapper ${sender}`;

        const avatarIcon = sender === 'user' ? 'user' : 'bot';
        const senderName = sender === 'user' ? 'YOU' : 'COORDINATOR ';

        wrapper.innerHTML = `
            <div class="message-avatar">
                <i data-lucide="${avatarIcon}"></i>
            </div>
            <div class="message-bubble">
                <div class="message-meta">
                    <span>${senderName}</span>
                    <span>${timestamp}</span>
                </div>
                <p id="text-container"></p>
            </div>
        `;

        // Support rich visual rendering (SVGs, Charts, Action Sheets) via helper
        const textContainer = wrapper.querySelector('#text-container');

        if (sender === 'agent') {
            // Call the Rich rendering component SDK (a2ui-components.js)
            window.A2UI.renderRichContent(text, textContainer);
        } else {
            textContainer.innerText = text;
        }

        elements.chatMessages.appendChild(wrapper);
        elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
        lucide.createIcons();
    };

    // Render in-memory data sources
    const renderDataSources = () => {
        elements.dsContainer.innerHTML = '';
        state.settings.dataSources.forEach(ds => {
            const card = document.createElement('div');
            card.className = 'conn-card glass';
            card.innerHTML = `
                <div class="conn-left">
                    <div class="conn-icon-box">
                        <i data-lucide="database"></i>
                    </div>
                    <div class="conn-details">
                        <h4>${ds.name}</h4>
                        <p>${ds.domain}</p>
                    </div>
                </div>
                <span class="conn-status ${ds.status}">${ds.status}</span>
            `;
            elements.dsContainer.appendChild(card);
        });
        lucide.createIcons();
    };

    // Render active agents stack & bind edit event
    const renderAgents = () => {
        elements.agentsContainer.innerHTML = '';
        state.settings.agents.forEach(agent => {
            const row = document.createElement('div');
            row.className = 'agent-row';
            row.innerHTML = `
                <div class="agent-info">
                    <div class="agent-avatar">
                        <i data-lucide="bot"></i>
                    </div>
                    <div class="agent-info-text">
                        <h4>${agent.name}</h4>
                        <span>Domain: ${agent.domain} | Model: ${agent.model}</span>
                    </div>
                </div>
                <div class="agent-row-actions">
                    <button class="edit-icon-btn" data-agent-id="${agent.id}">
                        <i data-lucide="edit-2"></i>
                    </button>
                    <span class="conn-status online">online</span>
                </div>
            `;

            // Bind edit button
            row.querySelector('.edit-icon-btn').addEventListener('click', () => {
                loadAgentConfigIntoForm(agent);
            });

            elements.agentsContainer.appendChild(row);
        });

        // Auto-load first agent in list to populate form on init
        if (state.settings.agents.length > 0 && !elements.cfgAgentId.value) {
            loadAgentConfigIntoForm(state.settings.agents[0]);
        }
        lucide.createIcons();
    };

    const loadAgentConfigIntoForm = (agent) => {
        elements.cfgAgentId.value = agent.id;
        elements.cfgAgentName.value = agent.name;
        elements.cfgAgentModel.value = agent.model;
        elements.cfgAgentDomain.value = agent.domain;
        elements.cfgAgentPrompt.value = agent.systemInstruction || '';
        elements.formAgentTitle.innerText = `Configure ${agent.name}`;
    };

    const renderMcpServers = () => {
        elements.mcpServersContainer.innerHTML = '';
        const servers = [
            { name: 'StitchMCP Server', url: 'http://127.0.0.1:5001', status: 'online' }
        ];
        servers.forEach(server => {
            const card = document.createElement('div');
            card.className = 'mcp-server-card glass';
            card.innerHTML = `
                <i data-lucide="server"></i>
                <div class="status-details">
                    <p>${server.name}</p>
                    <span>${server.url}</span>
                </div>
                <span class="conn-status ${server.status}" style="margin-left: auto;">${server.status}</span>
            `;
            elements.mcpServersContainer.appendChild(card);
        });
        lucide.createIcons();
    };

    const renderMcpTools = () => {
        elements.mcpToolsContainer.innerHTML = '';
        state.mcpTools.forEach(tool => {
            const card = document.createElement('div');
            card.className = 'tool-definition-card glass';
            card.innerHTML = `
                <div class="tool-header">
                    <h4>${tool.name}</h4>
                    <span class="tool-server-badge">${tool.server}</span>
                </div>
                <p>${tool.description}</p>
            `;
            elements.mcpToolsContainer.appendChild(card);
        });
        lucide.createIcons();
    };

    // =========================================================================
    // PRIVATE AGENT FACTORY & AGENTIC FRAMEWORK LOGIC
    // =========================================================================

    const fetchAgentFactoryData = async () => {
        try {
            const [templatesRes, agentsRes] = await Promise.all([
                fetch('/api/factory/templates'),
                fetch('/api/factory/agents')
            ]);
            
            if (templatesRes.ok) state.blueprints = await templatesRes.json();
            if (agentsRes.ok) state.privateAgents = await agentsRes.json();

            if (elements.kpiActiveAgents) {
                elements.kpiActiveAgents.innerText = state.privateAgents.length || state.blueprints.length;
            }

            renderBlueprints();
            renderSandboxAgentSelect();
        } catch (err) {
            console.error('Failed to sync Agent Factory data:', err);
        }
    };

    const renderBlueprints = () => {
        if (!elements.factoryBlueprintsContainer) return;
        elements.factoryBlueprintsContainer.innerHTML = '';

        const blueprints = state.blueprints.length > 0 ? state.blueprints : [
            {
                id: 'supply_chain_auditor',
                name: 'Supply Chain Risk Auditor',
                domain: 'Oracle Supply Chain ERP',
                model: 'gemini-3.1-flash',
                deploymentTarget: 'HYBRID',
                description: 'Autonomous risk auditor for multi-tier supply chain dependencies, shipping bottlenecks, and inventory stockouts.',
                tools: ['SQL_TOOL', 'GRAPH_TRAVERSAL', 'SPATIAL_HOTSPOTS', 'ACTION_DISPATCH']
            }
        ];

        blueprints.forEach(bp => {
            const card = document.createElement('div');
            card.className = 'blueprint-card glass';

            const targetClass = (bp.deploymentTarget || 'HYBRID').toLowerCase();
            const targetLabel = bp.deploymentTarget === 'DB_NATIVE' ? 'DB Native (26ai)' : (bp.deploymentTarget === 'GCP_CONTAINER' ? 'GCP Container' : 'Hybrid Mesh');

            const toolsHtml = (bp.tools || []).map(t => `<span class="tool-tag">${t}</span>`).join('');

            card.innerHTML = `
                <div>
                    <div class="blueprint-header">
                        <div>
                            <h4 class="blueprint-title">${bp.name}</h4>
                            <span class="blueprint-domain">${bp.domain}</span>
                        </div>
                        <span class="badge-target ${targetClass}">${targetLabel}</span>
                    </div>
                    <p class="blueprint-desc">${bp.description || 'Enterprise private agent blueprint.'}</p>
                    <div class="blueprint-tools-row">
                        ${toolsHtml}
                    </div>
                </div>
                <div class="blueprint-footer">
                    <button class="primary-btn btn-test-agent" data-agent-id="${bp.id}">
                        <i data-lucide="play-circle"></i> Test in Sandbox
                    </button>
                    <button class="glass-btn btn-inspect-plsql" data-agent-id="${bp.id}" title="Inspect Oracle DB PL/SQL script">
                        <i data-lucide="database"></i> PL/SQL
                    </button>
                    <button class="glass-btn btn-inspect-gcp" data-agent-id="${bp.id}" title="Inspect GCP Container Manifest">
                        <i data-lucide="container"></i> GCP YAML
                    </button>
                </div>
            `;

            // Button handlers
            card.querySelector('.btn-test-agent').addEventListener('click', () => {
                switchFactorySubview('sandbox');
                if (elements.sandboxAgentSelect) {
                    elements.sandboxAgentSelect.value = bp.id;
                    state.activeSandboxAgentId = bp.id;
                    renderSandboxPresets(bp.id);
                }
            });

            card.querySelector('.btn-inspect-plsql').addEventListener('click', () => {
                openExportModal('plsql', bp.id);
            });

            card.querySelector('.btn-inspect-gcp').addEventListener('click', () => {
                openExportModal('manifest', bp.id);
            });

            elements.factoryBlueprintsContainer.appendChild(card);
        });

        lucide.createIcons();
    };

    const renderSandboxAgentSelect = () => {
        if (!elements.sandboxAgentSelect) return;
        const currentVal = elements.sandboxAgentSelect.value;
        elements.sandboxAgentSelect.innerHTML = '';

        const agentList = state.privateAgents.length > 0 ? state.privateAgents : state.blueprints;

        agentList.forEach(a => {
            const opt = document.createElement('option');
            opt.value = a.id;
            opt.textContent = `${a.name} (${a.domain})`;
            elements.sandboxAgentSelect.appendChild(opt);
        });

        if (currentVal && agentList.some(a => a.id === currentVal)) {
            elements.sandboxAgentSelect.value = currentVal;
            state.activeSandboxAgentId = currentVal;
        } else if (agentList.length > 0) {
            elements.sandboxAgentSelect.value = agentList[0].id;
            state.activeSandboxAgentId = agentList[0].id;
        }

        renderSandboxPresets(state.activeSandboxAgentId);
    };

    const renderSandboxPresets = (agentId) => {
        if (!elements.sandboxPresetPills) return;
        elements.sandboxPresetPills.innerHTML = '';

        const agent = state.privateAgents.find(a => a.id === agentId) ||
                      state.blueprints.find(b => b.id === agentId) || {};

        const presets = agent.presetQueries || [
            'What inventory action should we take for SKU-500?',
            'Generate a Stock Distribution Bar Chart for SKU-500 across our warehouses.'
        ];

        presets.forEach(query => {
            const pill = document.createElement('button');
            pill.type = 'button';
            pill.className = 'preset-pill';
            pill.innerHTML = `<i data-lucide="sparkles" style="width: 12px; height: 12px; vertical-align: middle; margin-right: 4px; color: hsl(var(--primary));"></i> ${query}`;
            pill.addEventListener('click', () => {
                elements.sandboxPromptInput.value = query;
            });
            elements.sandboxPresetPills.appendChild(pill);
        });

        // Set default text in prompt input if empty
        if (!elements.sandboxPromptInput.value && presets.length > 0) {
            elements.sandboxPromptInput.value = presets[0];
        }

        lucide.createIcons();
    };

    const handleForgeSubmit = async (e) => {
        e.preventDefault();
        const checkedTools = Array.from(document.querySelectorAll('input[name="forge_tools"]:checked')).map(cb => cb.value);
        const presetQueriesRaw = document.getElementById('forge-preset-queries').value;
        const presetQueries = presetQueriesRaw ? presetQueriesRaw.split(',').map(s => s.trim()).filter(Boolean) : [];

        const payload = {
            id: document.getElementById('forge-agent-id').value.trim(),
            name: document.getElementById('forge-agent-name').value.trim(),
            domain: document.getElementById('forge-domain').value,
            model: document.getElementById('forge-model').value,
            deploymentTarget: document.getElementById('forge-target').value,
            systemRole: document.getElementById('forge-system-role').value.trim(),
            taskInstruction: document.getElementById('forge-task-instruction').value.trim(),
            tools: checkedTools,
            presetQueries: presetQueries
        };

        try {
            const res = await fetch('/api/factory/provision', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                alert(`✓ Agent '${payload.name}' provisioned successfully!`);
                elements.agentForgeForm.reset();
                await fetchAgentFactoryData();
                switchFactorySubview('sandbox');
                if (elements.sandboxAgentSelect) {
                    elements.sandboxAgentSelect.value = payload.id;
                    state.activeSandboxAgentId = payload.id;
                    renderSandboxPresets(payload.id);
                }
            } else {
                const errData = await res.json();
                alert(`Failed to forge agent: ${errData.error || 'Server error'}`);
            }
        } catch (err) {
            console.error('Error forging agent:', err);
            alert(`Error forging agent: ${err.message}`);
        }
    };

    const handleSandboxSubmit = async (e) => {
        e.preventDefault();
        const agentId = elements.sandboxAgentSelect.value;
        const prompt = elements.sandboxPromptInput.value.trim();
        if (!agentId || !prompt) return;

        elements.sandboxSubmitBtn.disabled = true;
        elements.sandboxStatusBadge.className = 'badge-status processing';
        elements.sandboxStatusBadge.textContent = 'Reasoning...';

        elements.sandboxTraceContainer.innerHTML = `
            <div class="trace-node">
                <div class="trace-indicator processing"><i data-lucide="loader" class="animate-spin" style="width: 12px; height: 12px;"></i></div>
                <div class="trace-body">
                    <h4>Agent Runtime Gateway</h4>
                    <p>Dispatching prompt to private agent [${agentId}]...</p>
                </div>
            </div>
        `;
        elements.sandboxResultBox.style.display = 'none';
        lucide.createIcons();

        try {
            const res = await fetch('/api/factory/execute', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    agentId,
                    prompt,
                    mode: state.mode
                })
            });

            const result = await res.json();

            // Fetch trace steps from server or render returned trace
            const traceRes = await fetch('/api/factory/trace');
            const traceData = await traceRes.json();

            elements.sandboxTraceContainer.innerHTML = '';
            const steps = (traceData && traceData.steps && traceData.steps.length > 0) ? traceData.steps : [
                { agent: result.agentName || 'Private Agent', query: `Executed prompt on ${result.metadata?.model || 'Gemini 3.1'}`, result: 'Verification passed' }
            ];

            steps.forEach(s => {
                const node = document.createElement('div');
                node.className = 'trace-node';
                node.innerHTML = `
                    <div class="trace-indicator success"><i data-lucide="check" style="width: 12px; height: 12px;"></i></div>
                    <div class="trace-body">
                        <h4>${s.agent}</h4>
                        <p>${s.query}</p>
                        ${s.result ? `<div class="trace-result">${typeof s.result === 'object' ? JSON.stringify(s.result, null, 2) : s.result}</div>` : ''}
                    </div>
                `;
                elements.sandboxTraceContainer.appendChild(node);
            });

            // Render final rich output
            elements.sandboxResultBox.style.display = 'block';
            window.A2UI.renderRichContent(result.data, elements.sandboxResultContent);

            elements.sandboxStatusBadge.className = 'badge-status completed';
            elements.sandboxStatusBadge.textContent = 'Completed';
        } catch (err) {
            elements.sandboxTraceContainer.innerHTML = `
                <div class="trace-node">
                    <div class="trace-indicator" style="background: hsl(var(--danger));"><i data-lucide="alert-triangle" style="width: 12px; height: 12px;"></i></div>
                    <div class="trace-body">
                        <h4>Execution Error</h4>
                        <p>${err.message}</p>
                    </div>
                </div>
            `;
            elements.sandboxStatusBadge.className = 'badge-status error';
            elements.sandboxStatusBadge.textContent = 'Failed';
        } finally {
            elements.sandboxSubmitBtn.disabled = false;
            lucide.createIcons();
        }
    };

    const openExportModal = async (type, agentId) => {
        if (!elements.exportCodeModal) return;
        const endpoint = type === 'plsql' ? `/api/factory/export/plsql/${agentId}` : `/api/factory/export/gcp-manifest/${agentId}`;
        
        elements.exportModalTitle.innerText = type === 'plsql' 
            ? `Oracle Database 26ai Native PL/SQL Installer: ${agentId}` 
            : `GCP Container Cloud Run Manifest: ${agentId}`;
        elements.exportModalSubtitle.innerText = type === 'plsql'
            ? 'Execute directly in SQL*Plus, SQLcl, or Oracle Database Actions Worksheet.'
            : 'Deploy directly via Google Cloud CLI: gcloud run services replace manifest.yaml';

        elements.exportCodeContent.innerText = 'Generating deployment artifact...';
        elements.exportCodeModal.classList.add('active');

        try {
            const res = await fetch(endpoint);
            const data = await res.json();
            elements.exportCodeContent.innerText = type === 'plsql' ? data.plsql : data.manifest;
        } catch (err) {
            elements.exportCodeContent.innerText = `Failed to generate artifact: ${err.message}`;
        }
    };

    const copyExportCode = () => {
        const code = elements.exportCodeContent.innerText;
        navigator.clipboard.writeText(code).then(() => {
            const btn = elements.copyExportCodeBtn;
            const originalHTML = btn.innerHTML;
            btn.innerHTML = `<i data-lucide="check"></i> Copied!`;
            lucide.createIcons();
            setTimeout(() => {
                btn.innerHTML = originalHTML;
                lucide.createIcons();
            }, 1800);
        }).catch(err => {
            console.error('Clipboard copy failed:', err);
        });
    };


    const renderTelemetryLogs = () => {
        elements.terminalContainer.innerHTML = '';
        const filter = elements.logFilter.value;

        const filteredLogs = state.logs.filter(log => {
            if (filter === 'all') return true;
            return log.agent === filter;
        });

        if (filteredLogs.length === 0) {
            elements.terminalContainer.innerHTML = `<div class="trace-empty-state"><p>No transaction records</p></div>`;
            return;
        }

        filteredLogs.forEach(log => {
            const timestamp = new Date(log.timestamp).toLocaleTimeString();
            const typeClass = log.type.toLowerCase();

            const line = document.createElement('div');
            line.className = 'terminal-line';

            const spanTime = document.createElement('span');
            spanTime.className = 'term-timestamp';
            spanTime.textContent = `[${timestamp}] `;

            const spanAgent = document.createElement('span');
            spanAgent.className = 'term-agent';
            spanAgent.textContent = `<${log.agent}> `;

            const spanType = document.createElement('span');
            spanType.className = `term-type ${typeClass}`;
            spanType.textContent = `${log.type} `;

            const spanMsg = document.createElement('span');
            spanMsg.className = 'term-msg';
            spanMsg.textContent = log.message || '';

            line.appendChild(spanTime);
            line.appendChild(spanAgent);
            line.appendChild(spanType);
            line.appendChild(spanMsg);

            elements.terminalContainer.appendChild(line);
        });

        // Automatically scroll down if active on tab
        if (state.activeTab === 'live-logs') {
            elements.terminalContainer.scrollTop = elements.terminalContainer.scrollHeight;
        }
    };

    // --- Core Agent Coordination Loop Integration ---

    const submitUserQuery = async () => {
        const queryText = elements.chatField.value.trim();
        if (!queryText || state.isPollingTrace) return;

        elements.chatField.value = '';
        elements.chatField.disabled = true;
        elements.chatSubmitBtn.disabled = true;

        // Add user message
        appendMessageBubble('user', queryText);

        // Inject coordinating agent loader
        injectLoaderBubble();

        // Reset tracing UI state
        elements.traceSteps.innerHTML = '';
        state.isPollingTrace = true;

        try {
            // Initiate coordinator process
            const response = await fetch('/api/query', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    query: queryText,
                    mode: state.mode
                })
            });

            if (response.ok) {
                // Start execution tracing status polling
                state.traceTimer = setInterval(pollTraceStatus, 1500);
            } else {
                removeLoaderBubble();
                appendMessageBubble('agent', 'Failed to contact coordinator server.');
                state.isPollingTrace = false;
                elements.chatField.disabled = false;
                elements.chatSubmitBtn.disabled = false;
            }
        } catch (err) {
            removeLoaderBubble();
            appendMessageBubble('agent', `Server coordination connection error: ${err.message}`);
            state.isPollingTrace = false;
            elements.chatField.disabled = false;
            elements.chatSubmitBtn.disabled = false;
        }
    };

    const injectLoaderBubble = () => {
        const loader = document.createElement('div');
        loader.className = 'message-wrapper agent loader-bubble';
        loader.id = 'chat-loader-bubble';
        loader.innerHTML = `
            <div class="message-avatar">
                <i data-lucide="refresh-cw" class="animate-spin"></i>
            </div>
            <div class="message-bubble font-mono text-xs flex align-center gap-2" style="border-top-left-radius: 0;">
                <i data-lucide="activity" class="animate-bounce color-primary"></i>
                <span>Master Coordinator is orchestrating specialist agents...</span>
            </div>
        `;
        elements.chatMessages.appendChild(loader);
        elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
        lucide.createIcons();
    };

    const removeLoaderBubble = () => {
        const loader = document.getElementById('chat-loader-bubble');
        if (loader) loader.remove();
    };

    const pollTraceStatus = async () => {
        try {
            const res = await fetch('/api/status');
            const status = await res.json();

            // Draw timeline trace nodes
            renderTraceSteps(status.steps);

            if (status.state === 'completed' || status.state === 'error') {
                clearInterval(state.traceTimer);
                removeLoaderBubble();
                state.isPollingTrace = false;
                elements.chatField.disabled = false;
                elements.chatSubmitBtn.disabled = false;

                // Extract final answer
                if (status.steps && status.steps.length > 0) {
                    const finalStep = status.steps[status.steps.length - 1];
                    const answerText = finalStep.result || "Analysis resolved.";
                    appendMessageBubble('agent', answerText);
                } else {
                    appendMessageBubble('agent', 'Analysis finished with no result returned.');
                }

                // Flush telemetry logs so transaction appears instantly
                await fetchTelemetryLogs();
            }
        } catch (err) {
            console.error("Failed to poll agent status:", err);
        }
    };

    const renderTraceSteps = (steps) => {
        if (!steps || steps.length === 0) {
            elements.traceSteps.innerHTML = `
                <div class="trace-empty-state">
                    <i data-lucide="activity"></i>
                    <p>Active Coordination Step...</p>
                </div>
            `;
            return;
        }

        elements.traceSteps.innerHTML = '';
        steps.forEach((step, i) => {
            const node = document.createElement('div');
            node.className = 'trace-node';

            const indicatorClass = step.result ? 'success' : 'processing';
            const icon = step.result ? 'check' : 'loader';

            const indicatorDiv = document.createElement('div');
            indicatorDiv.className = `trace-indicator ${indicatorClass}`;
            indicatorDiv.innerHTML = `<i data-lucide="${icon}" class="${icon === 'loader' ? 'animate-spin' : ''}" style="width: 12px; height: 12px;"></i>`;

            const bodyDiv = document.createElement('div');
            bodyDiv.className = 'trace-body';

            const h4 = document.createElement('h4');
            h4.textContent = step.agent || 'Agent';

            const p = document.createElement('p');
            p.textContent = step.query || '';

            bodyDiv.appendChild(h4);
            bodyDiv.appendChild(p);

            if (step.result) {
                const resDiv = document.createElement('div');
                resDiv.className = 'trace-result';
                resDiv.textContent = formatResult(step.result);
                bodyDiv.appendChild(resDiv);
            }

            node.appendChild(indicatorDiv);
            node.appendChild(bodyDiv);

            elements.traceSteps.appendChild(node);
        });
        lucide.createIcons();
    };

    const formatResult = (res) => {
        if (typeof res === 'object') {
            return JSON.stringify(res, null, 2);
        }
        return String(res);
    };

    // Trigger init on load
    init();
});
