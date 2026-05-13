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
    print_header
    echo -e "${BOLD}Please select an execution mode:${RESET}\n"
    echo -e "  ${BOLD}${YELLOW}1)${RESET} 🌐 Start the Unified  Web Hub & Express API ${BOLD}${GREEN}(Recommended)${RESET}"
    echo -e "  ${BOLD}${YELLOW}2)${RESET} 💻 Start the Multi-Agent CLI Coordinator ${BOLD}(Interactive Terminal)${RESET}"
    echo -e "  ${BOLD}${YELLOW}3)${RESET} 🧪 Run Simulated Direct Database Connection Proof ${BOLD}(scratch_test.js)${RESET}"
    echo -e "  ${BOLD}${YELLOW}4)${RESET} 📦 Start Hosted Oracle MCP Toolbox Server ${BOLD}(genai-toolbox)${RESET}"
    echo -e "  ${BOLD}${YELLOW}5)${RESET} 🔍 Run Systematic Environment Validation & Networking Test"
    echo -e "  ${BOLD}${YELLOW}6)${RESET} 🚪 Exit\n"
    echo -e "${BOLD}${CYAN}==================================================================${RESET}"
    
    read -p "Enter choice [1-6]: " choice
    case $choice in
        1)
            print_info "Spinning up the primary Express Server Hub and Web Gateway UI..."
            print_info "Access portal interface natively at: http://localhost:8080"
            npm start
            ;;
        2)
            print_info "Launching localized interactive multi-agent coordinator CLI session..."
            node agents/coordinator-agent.js
            ;;
        3)
            print_info "Executing database direct isolation test harness (scratch_test.js)..."
            node scratch_test.js
            ;;
        4)
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
        5)
            print_info "Running end-to-end systematic connectivity test harness (.env)..."
            node test_env_connections.js
            ;;
        6)
            print_success "Exiting demo orchestration sequence. Goodbye!"
            exit 0
            ;;
        *)
            print_error "Invalid selection. Please choose an index between 1 and 6."
            sleep 1
            show_menu
            ;;
    esac
}

# Execute startup handlers
check_environment
show_menu
