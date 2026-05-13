/* -------------------------------------------------------------------------
   A2UI DYNAMIC CONTENT SDK & COMPONENTS
   High-Fidelity Rendering for Structured Agents Outputs
   ------------------------------------------------------------------------- */

(function() {
    const A2UI = {};

    /**
     * Main Router for Parsing & Rendering Agentic Responses
     */
    A2UI.renderRichContent = function(text, containerElement) {
        containerElement.innerHTML = '';

        // 1. Check for Chart.js block (```chartjs ... ```)
        const chartRegex = /```chartjs\s*([\s\S]*?)\s*```/;
        const chartMatch = text.match(chartRegex);
        
        let textToRender = text;
        let chartConfig = null;

        if (chartMatch) {
            try {
                chartConfig = JSON.parse(chartMatch[1].trim());
                // Strip the block from the narrative text
                textToRender = text.replace(chartRegex, '');
            } catch (e) {
                console.error("Failed to parse Chart.js block:", e);
            }
        }

        // 2. Render standard text paragraphs
        const paragraphs = textToRender.split('\n\n');
        paragraphs.forEach(para => {
            if (!para.trim()) return;
            
            const p = document.createElement('p');
            p.style.marginBottom = '12px';
            p.innerHTML = formatMarkdownInline(para);
            containerElement.appendChild(p);
        });

        // 3. Mount Dynamic Components based on keywords or parsed outputs
        
        // A. Render Chart if matched
        if (chartConfig) {
            mountChartComponent(chartConfig, containerElement);
        }

        // B. Render Supply Chain Graph if query is SKU-500 Graph related
        if (text.toLowerCase().includes('customs review delay') && text.toLowerCase().includes('blue ocean')) {
            mountSupplyChainGraphComponent(containerElement);
        }

        // C. Render Spatial warehouse map if hotspots are discussed
        if (text.toLowerCase().includes('spatial hotspots') || text.toLowerCase().includes('reno dc') && text.toLowerCase().includes('austin assembly') && text.toLowerCase().includes('relief')) {
            mountSpatialHotspotsComponent(containerElement);
        }

        // D. Render Structured Action card if transfer action is drafted
        if (text.toLowerCase().includes('draft-transfer-sku-500') || text.toLowerCase().includes('inventory action drafted')) {
            mountInventoryActionCard(containerElement);
        }
    };

    /**
     * Format inline styles: bold, code snippets, bullets
     */
    function formatMarkdownInline(str) {
        let html = str;
        // Bold (**text**)
        html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        // Inline Code (`code`)
        html = html.replace(/`(.*?)`/g, '<code class="inline-code" style="background: rgba(255,255,255,0.08); padding: 2px 6px; border-radius: 4px; font-family: \'Fira Code\', monospace; font-size: 90%;">$1</code>');
        
        // Handle multi-line paragraph text strings to render beautiful margins and bullet layout
        const lines = html.split('\n');
        const formattedLines = lines.map(line => {
            const trimmed = line.trim();
            if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
                const isSub = line.startsWith('  ');
                const margin = isSub ? '32px' : '16px';
                const bulletChar = isSub ? '◦' : '•';
                return `<div style="margin-left: ${margin}; margin-bottom: 6px; margin-top: 4px; display: flex; gap: 8px; line-height: 1.5;">
                            <span style="color: hsl(var(--primary)); flex-shrink: 0; font-weight: bold;">${bulletChar}</span>
                            <div>${trimmed.substring(2)}</div>
                        </div>`;
            }
            return line;
        });
        return formattedLines.join('<br>');
    }

    /**
     * Chart.js Dynamic Mount Component
     */
    function mountChartComponent(config, container) {
        const wrapper = document.createElement('div');
        wrapper.className = 'chart-wrapper glass';
        
        const canvas = document.createElement('canvas');
        canvas.style.width = '100%';
        canvas.style.height = '220px';
        
        wrapper.appendChild(canvas);
        container.appendChild(wrapper);

        // Wait a frame to let DOM layout complete before rendering chart
        requestAnimationFrame(() => {
            try {
                // Set responsive options
                if (!config.options) config.options = {};
                config.options.responsive = true;
                config.options.maintainAspectRatio = false;
                
                // Theme chart colors for dark mode
                config.options.scales = {
                    y: {
                        grid: { color: 'rgba(255,255,255,0.05)' },
                        ticks: { color: 'rgba(255,255,255,0.6)', font: { size: 10 } }
                    },
                    x: {
                        grid: { color: 'rgba(255,255,255,0.05)' },
                        ticks: { color: 'rgba(255,255,255,0.6)', font: { size: 10 } }
                    }
                };
                if (!config.options.plugins) config.options.plugins = {};
                config.options.plugins.legend = {
                    labels: { color: 'rgba(255,255,255,0.8)', font: { size: 11 } }
                };

                new Chart(canvas.getContext('2d'), config);
            } catch (err) {
                console.error("Failed to initialize Chart.js canvas:", err);
                wrapper.innerHTML = `<p style="color: hsl(var(--danger)); font-size: 11px;">Failed to mount Chart visualization.</p>`;
            }
        });
    }

    /**
     * Supply Chain Interactive SVG Network Component
     */
    function mountSupplyChainGraphComponent(container) {
        const card = document.createElement('div');
        card.className = 'a2ui-card glass';
        card.innerHTML = `
            <h4 style="font-size: 12px; font-weight: 700; margin-bottom: 8px; font-family: 'Outfit', sans-serif;">
                <i data-lucide="network" style="width: 14px; height: 14px; vertical-align: middle; margin-right: 4px; color: hsl(var(--primary));"></i>
                Resolved Supply Chain Graph
            </h4>
            <div class="graph-svg-container">
                <svg viewBox="0 0 400 180" width="100%" height="100%">
                    <!-- Paths / Links -->
                    <path d="M 50 90 L 150 90" class="graph-link" stroke-dasharray="5" />
                    <path d="M 150 90 L 250 50" class="graph-link" />
                    <path d="M 150 90 L 250 130" class="graph-link" />
                    
                    <!-- Nodes -->
                    <!-- Supplier -->
                    <g class="graph-node" transform="translate(50, 90)">
                        <circle r="18" fill="#1e293b" stroke="#6366f1" stroke-width="2" />
                        <text x="0" y="4" text-anchor="middle" font-size="9" fill="#fff">SUP</text>
                        <title>Supplier: Blue Ocean (Customs Delay)</title>
                    </g>
                    <!-- Plant -->
                    <g class="graph-node" transform="translate(150, 90)">
                        <circle r="18" fill="#1e293b" stroke="#3b82f6" stroke-width="2" />
                        <text x="0" y="4" text-anchor="middle" font-size="9" fill="#fff">PLT</text>
                        <title>Plant: Austin Assembly (Excess stock: 450)</title>
                    </g>
                    <!-- Port -->
                    <g class="graph-node" transform="translate(250, 50)">
                        <circle r="18" fill="#1e293b" stroke="#f59e0b" stroke-width="2" />
                        <text x="0" y="4" text-anchor="middle" font-size="9" fill="#fff">PRT</text>
                        <title>Port: Long Beach</title>
                    </g>
                    <!-- Warehouse (Hotspot) -->
                    <g class="graph-node" transform="translate(250, 130)">
                        <circle r="18" fill="#1e293b" stroke="#ef4444" stroke-width="2" style="filter: drop-shadow(0 0 6px #ef4444);" />
                        <text x="0" y="4" text-anchor="middle" font-size="9" fill="#fff" style="font-weight: bold;">RNO</text>
                        <title>Reno DC: Low Stock Hotspot (120 units)</title>
                    </g>

                    <!-- Text labels overlay -->
                    <text x="50" y="125" text-anchor="middle" font-size="8" fill="rgba(255,255,255,0.6)">Blue Ocean</text>
                    <text x="150" y="125" text-anchor="middle" font-size="8" fill="rgba(255,255,255,0.6)">Austin</text>
                    <text x="250" y="25" text-anchor="middle" font-size="8" fill="rgba(255,255,255,0.6)">Long Beach</text>
                    <text x="250" y="162" text-anchor="middle" font-size="8" fill="#ef4444" font-weight="bold">Reno DC (Hot)</text>
                </svg>
            </div>
        `;
        container.appendChild(card);
    }

    /**
     * Spatial Warehouse Hotspots Overlay Map Component
     */
    function mountSpatialHotspotsComponent(container) {
        const card = document.createElement('div');
        card.className = 'a2ui-card glass';
        card.innerHTML = `
            <h4 style="font-size: 12px; font-weight: 700; margin-bottom: 8px; font-family: 'Outfit', sans-serif;">
                <i data-lucide="map" style="width: 14px; height: 14px; vertical-align: middle; margin-right: 4px; color: hsl(var(--primary));"></i>
                Grounded Warehouse Spatial hotspots Map
            </h4>
            <div class="graph-svg-container" style="position: relative; overflow: hidden; background: radial-gradient(circle, #1e293b 0%, #0f172a 100%); border: 1px dashed rgba(255,255,255,0.1)">
                <!-- Simulated styled map grids -->
                <div style="position: absolute; inset: 0; opacity: 0.1; background-size: 20px 20px; background-image: linear-gradient(to right, #fff 1px, transparent 1px), linear-gradient(to bottom, #fff 1px, transparent 1px);"></div>
                
                <!-- US West Coast line representations -->
                <svg style="position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none;">
                    <path d="M 50 -20 Q 70 80, 60 130 T 120 220" fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="3" />
                </svg>

                <!-- Glowing hotspots markers -->
                <!-- Reno -->
                <div class="map-hotspot" style="position: absolute; top: 70px; left: 90px;">
                    <span style="display: block; width: 12px; height: 12px; border-radius: 50%; background: #ef4444; box-shadow: 0 0 0 6px rgba(239,68,68,0.3), 0 0 20px 10px rgba(239,68,68,0.5);"></span>
                    <span style="position: absolute; top: -18px; left: 18px; font-size: 9px; font-weight: 700; color: #ef4444; background: rgba(0,0,0,0.6); padding: 2px 6px; border-radius: 4px; border: 1px solid rgba(239,68,68,0.3); white-space: nowrap;">Reno DC (Risk: High)</span>
                </div>

                <!-- Austin -->
                <div class="map-hotspot" style="position: absolute; top: 120px; left: 240px;">
                    <span style="display: block; width: 12px; height: 12px; border-radius: 50%; background: #10b981; box-shadow: 0 0 0 6px rgba(16,185,129,0.3), 0 0 20px 10px rgba(16,185,129,0.4);"></span>
                    <span style="position: absolute; top: -18px; left: 18px; font-size: 9px; font-weight: 700; color: #10b981; background: rgba(0,0,0,0.6); padding: 2px 6px; border-radius: 4px; border: 1px solid rgba(16,185,129,0.3); white-space: nowrap;">Austin Plant (Relief Source)</span>
                </div>

                <!-- Transit Line -->
                <svg style="position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none;">
                    <path d="M 246 126 Q 180 80, 96 76" fill="none" stroke="#6366f1" stroke-width="2" stroke-dasharray="4" style="animation: dash 10s linear infinite;" />
                </svg>
            </div>
        `;
        container.appendChild(card);
    }

    /**
     * Structured Action Proposal Card with Interactive Approval handlers
     */
    function mountInventoryActionCard(container) {
        const card = document.createElement('div');
        card.className = 'a2ui-card action-card glass';
        
        const actionId = `draft-${Math.random().toString(36).substring(7)}`;
        
        card.innerHTML = `
            <div class="action-badge pending">
                <i data-lucide="clock" style="width: 12px; height: 12px;"></i>
                Draft Inventory Transfer (Approval Required)
            </div>
            
            <div class="action-details">
                <div class="detail-item">
                    <span>RECOMMENDED SKUs</span>
                    <p>SKU-500 (Customs Delayed)</p>
                </div>
                <div class="detail-item">
                    <span>TRANSFER QUANTITY</span>
                    <p>130 Units</p>
                </div>
                <div class="detail-item">
                    <span>SOURCE WAREHOUSE</span>
                    <p>Austin Assembly Plant</p>
                </div>
                <div class="detail-item">
                    <span>DESTINATION WAREHOUSE</span>
                    <p>Reno Distribution Center</p>
                </div>
            </div>
            
            <div class="action-btn-group" id="btn-group-${actionId}">
                <button class="btn-approve" id="approve-btn-${actionId}">Approve Transfer</button>
                <button class="glass-btn" style="padding: 8px 16px; font-size: 12px; border-radius: 10px;" id="deny-btn-${actionId}">Deny</button>
            </div>
        `;
        
        container.appendChild(card);

        // Attach event listener for Approve button
        setTimeout(() => {
            const approveBtn = document.getElementById(`approve-btn-${actionId}`);
            const denyBtn = document.getElementById(`deny-btn-${actionId}`);
            const group = document.getElementById(`btn-group-${actionId}`);

            if (approveBtn) {
                approveBtn.addEventListener('click', () => {
                    group.innerHTML = `
                        <p style="color: hsl(var(--success)); font-weight: 700; font-size: 12px; display: flex; align-items: center; gap: 6px;">
                            <i data-lucide="check-circle" style="width: 16px; height: 16px;"></i>
                            Transfer proposal approved and dispatched to ERP!
                        </p>
                    `;
                    
                    // Edit badge class
                    const badge = card.querySelector('.action-badge');
                    badge.className = 'action-badge success';
                    badge.style.background = 'hsl(var(--success) / 0.15)';
                    badge.style.color = 'hsl(var(--success))';
                    badge.style.borderColor = 'hsl(var(--success) / 0.3)';
                    badge.innerHTML = `<i data-lucide="check-circle" style="width: 12px; height: 12px;"></i> Transfer Dispatched`;
                    
                    lucide.createIcons();
                    console.log(`Inventory transfer for SKU-500 approved and executed by user.`);
                });
            }

            if (denyBtn) {
                denyBtn.addEventListener('click', () => {
                    group.innerHTML = `
                        <p style="color: hsl(var(--text-muted)); font-weight: 700; font-size: 12px; display: flex; align-items: center; gap: 6px;">
                            <i data-lucide="x-circle" style="width: 16px; height: 16px;"></i>
                            Transfer proposal rejected.
                        </p>
                    `;
                    const badge = card.querySelector('.action-badge');
                    badge.className = 'action-badge error';
                    badge.style.background = 'hsl(var(--danger) / 0.15)';
                    badge.style.color = 'hsl(var(--danger))';
                    badge.style.borderColor = 'hsl(var(--danger) / 0.3)';
                    badge.innerHTML = `<i data-lucide="x-circle" style="width: 12px; height: 12px;"></i> Transfer Cancelled`;
                    lucide.createIcons();
                });
            }
        }, 50);
    }

    // Expose to window
    window.A2UI = A2UI;
})();
