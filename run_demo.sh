#!/usr/bin/env bash
# ==============================================================================
# Oracle AI Database + GCP Vertex AI Multi-Agent Demo Orchestration Script
# ==============================================================================
# This helper script streamlines local context execution during enterprise demos.
# It provides an interactive console menu to spin up the backend API Hub, launch
# specialized CLI coordinators, or run direct resilient simulation tests.
# ==============================================================================

# Exit immediately if a pipeline exits with a non-zero status
set -e

# Determine Script Directory reliably and set working directory to repo root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${SCRIPT_DIR}"

# ANSI Color output styling variables
RESET="\033[0m"
BOLD="\033[1m"
RED="\033[38;5;196m"
GREEN="\033[38;5;46m"
YELLOW="\033[38;5;226m"
CYAN="\033[38;5;51m"
BLUE="\033[38;5;33m"
MAGENTA="\033[38;5;201m"

# Helper print utility
print_header() {
    echo -e "\n${BOLD}${CYAN}==================================================================${RESET}"
    echo -e "${BOLD}${GREEN}   🚀 ORACLE AI DATABASE + GCP VERTEX AI DEMO ORCHESTRATOR${RESET}"
    echo -e "${BOLD}${CYAN}==================================================================${RESET}"
}

print_info() {
    echo -e "${BOLD}${BLUE}[INFO]${RESET} $1"
}

print_success() {
    echo -e "${BOLD}${GREEN}[SUCCESS]${RESET} $1"
}

print_warn() {
    echo -e "${BOLD}${YELLOW}[WARN]${RESET} $1"
}

print_error() {
    echo -e "${BOLD}${RED}[ERROR]${RESET} $1"
}

# Pre-flight check verification
check_environment() {
    if [ ! -f ".env" ]; then
        print_warn ".env file not found in local workspace root."
        if [ -f ".env.template" ]; then
            print_info "Generating default .env from .env.template profile..."
            cp .env.template .env
            print_success "Created .env profile successfully."
        else
            print_error "Missing both .env and .env.template parameters. Exiting."
            exit 1
        fi
    else
        print_success "Verified existing .env workspace configuration."
    fi

    if ! command -v node &> /dev/null; then
        print_error "Node.js runtime executable not found on system path. Please install Node v18+."
        exit 1
    fi
}

# Display menu logic
show_menu() {
    local choice="$1"

    if [ -z "$choice" ]; then
        print_header
        echo -e "${BOLD}Please select an execution mode:${RESET}\n"
        echo -e "  ${BOLD}${YELLOW}1)${RESET} 🌐 Start Unified Web Hub & A2UI Portal ${BOLD}${GREEN}(http://localhost:8080)${RESET}"
        echo -e "  ${BOLD}${YELLOW}2)${RESET} 🏭 Test Private Agent Factory CLI (Execute Blueprints in Terminal)"
        echo -e "  ${BOLD}${YELLOW}3)${RESET} 💻 Start Multi-Agent Coordinator CLI ${BOLD}(Interactive Terminal)${RESET}"
        echo -e "  ${BOLD}${YELLOW}4)${RESET} 🧪 Run Direct Database Connection Proof ${BOLD}(Tests/scratch_test.js)${RESET}"
        echo -e "  ${BOLD}${YELLOW}5)${RESET} 📦 Start Hosted Oracle MCP Toolbox Server ${BOLD}(genai-toolbox)${RESET}"
        echo -e "  ${BOLD}${YELLOW}6)${RESET} 📥 Setup Oracle Private Agent Factory Images ${BOLD}(OCR / Downloads Archive)${RESET}"
        echo -e "  ${BOLD}${YELLOW}7)${RESET} 🚀 Deploy Private Agent Factory to GCP Cloud Run"
        echo -e "  ${BOLD}${YELLOW}8)${RESET} 🔍 Run Environment Validation & Reachability Harness ${BOLD}(Tests/test_env_connections.js)${RESET}"
        echo -e "  ${BOLD}${YELLOW}9)${RESET} ⚙️ Test Database Connection & Provision Users ${BOLD}(README.txt Setup)${RESET}"
        echo -e "  ${BOLD}${YELLOW}10)${RESET} 🚪 Exit\n"
        echo -e "${BOLD}${CYAN}==================================================================${RESET}"
        
        read -p "Enter choice [1-10]: " choice
    fi

    case $choice in
        1|--web|--hub)
            print_info "Spinning up Express Server Hub, Private Agent Factory, and A2UI Gateway..."
            print_info "Access portal interface at: http://localhost:8080"
            npm start
            ;;
        2|--factory)
            print_info "Testing Private Agent Factory execution against Supply Chain Risk Auditor..."
            node -e "
            const factory = require('./adk/private-agent-factory');
            (async () => {
                console.log('\n--- Active Private Agent Blueprints ---');
                factory.listBlueprints().forEach(b => console.log(' • [' + b.id + '] ' + b.name + ' (' + b.deploymentTarget + ')'));
                console.log('\nExecuting Supply Chain Risk Auditor...');
                const res = await factory.executeAgent('supply_chain_auditor', 'What inventory action should we take for SKU-500?', (s) => console.log(' [Trace]', s.query), true);
                console.log('\nResult:\n' + res.data);
                console.log('\nMetadata:\n', JSON.stringify(res.metadata, null, 2));
            })();
            "
            ;;
        3|--coordinator)
            print_info "Launching localized interactive multi-agent coordinator CLI session..."
            node agents/coordinator-agent.js
            ;;
        4|--scratch)
            print_info "Executing database direct isolation test harness (Tests/scratch_test.js)..."
            if [ -f "Tests/scratch_test.js" ]; then
                node Tests/scratch_test.js
            elif [ -f "scratch_test.js" ]; then
                node scratch_test.js
            else
                print_error "scratch_test.js not found in Tests/ or root."
            fi
            ;;
        5|--toolbox)
            print_info "Initializing standalone hosted Oracle MCP Toolbox Server daemon..."
            if command -v toolbox &> /dev/null; then
                print_info "Exporting .env profile namespace variables into local environment context..."
                set -a
                source .env
                set +a
                toolbox --config tools.yaml
            else
                print_error "Native executable 'toolbox' missing from shell path profile."
                print_warn "Make sure MCP toolkit tools dependencies are pre-installed locally."
            fi
            ;;
        6|--setup-images)
            print_info "Launching Oracle Private Agent Factory Image Setup & Acquisition Suite..."
            if [ -f "deploy/setup-oracle-paf-images.sh" ]; then
                bash deploy/setup-oracle-paf-images.sh
            else
                print_error "deploy/setup-oracle-paf-images.sh not found."
            fi
            ;;
        7|--deploy-cloudrun)
            print_info "Launching automated GCP Cloud Run container deployment..."
            if [ -f "deploy/deploy-gcp-cloudrun.sh" ]; then
                bash deploy/deploy-gcp-cloudrun.sh
            else
                print_error "deploy/deploy-gcp-cloudrun.sh not found."
            fi
            ;;
        8|--test-env)
            print_info "Running end-to-end systematic connectivity test harness (Tests/test_env_connections.js)..."
            if [ -f "Tests/test_env_connections.js" ]; then
                node Tests/test_env_connections.js
            elif [ -f "test_env_connections.js" ]; then
                node test_env_connections.js
            else
                print_error "test_env_connections.js not found."
            fi
            ;;
        9|--db-setup)
            print_info "Testing database connection and verifying README.txt user setup..."
            node -e "
            const db = require('./services/oracle-db');
            (async () => {
                console.log('Testing Oracle Database connectivity...');
                const status = await db.testConnection();
                console.log('Connection Status:', JSON.stringify(status, null, 2));
            })();
            "
            ;;
        10|--exit|q|exit)
            print_success "Exiting demo orchestration sequence. Goodbye!"
            exit 0
            ;;
        *)
            print_error "Invalid selection '$choice'. Please choose an index between 1 and 10."
            sleep 1
            show_menu ""
            ;;
    esac
}

# Execute startup handlers
check_environment
show_menu "$1"
