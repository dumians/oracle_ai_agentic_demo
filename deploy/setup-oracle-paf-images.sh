#!/usr/bin/env bash
# ==============================================================================
# 📥 Oracle AI Database Private Agent Factory (PAIAS 26.4) Image Setup & Deploy
# ==============================================================================
# Documentation: https://docs.oracle.com/en/database/oracle/agent-factory/26.4/paias/
# Downloads:     https://www.oracle.com/database/technologies/private-agent-factory-downloads.html
# ==============================================================================
# This script automates downloading, pulling, verifying, tagging, and pushing
# official Oracle Private Agent Factory 26.4 container images to Google Cloud
# Platform (Artifact Registry / GCR) for deployment on Cloud Run and GKE.
# ==============================================================================

set -e

# ANSI Color formatting
BOLD="\033[1m"
GREEN="\033[38;5;46m"
CYAN="\033[38;5;51m"
YELLOW="\033[38;5;226m"
BLUE="\033[38;5;33m"
RED="\033[38;5;196m"
RESET="\033[0m"

echo -e "${BOLD}${CYAN}==================================================================================${RESET}"
echo -e "${BOLD}${GREEN}  🏛️ ORACLE AI DATABASE PRIVATE AGENT FACTORY (PAIAS 26.4) CONTAINER SETUP${RESET}"
echo -e "${BOLD}${CYAN}==================================================================================${RESET}"
echo -e "📖 Official Docs:   ${BOLD}https://docs.oracle.com/en/database/oracle/agent-factory/26.4/paias/${RESET}"
echo -e "📦 Downloads Page:  ${BOLD}https://www.oracle.com/database/technologies/private-agent-factory-downloads.html${RESET}"
echo -e "${BOLD}${CYAN}==================================================================================${RESET}\n"

# Load local environment configuration
if [ -f "../.env" ]; then
    set -a
    source ../.env
    set +a
elif [ -f ".env" ]; then
    set -a
    source .env
    set +a
fi

PROJECT_ID="${GCP_PROJECT_ID:-$(gcloud config get-value project 2>/dev/null || echo '')}"
REGION="${GCP_REGION:-eu-west3}"
AR_REPO="${GCP_ARTIFACT_REPO:-oracle-ai}"
OCR_REGISTRY="container-registry.oracle.com"
OCR_IMAGE_NAME="database/private-agent-factory"
PAF_VERSION="${PAF_VERSION:-26.4}"
LOCAL_TAG="oracle-private-agent-factory:${PAF_VERSION}"
TARGET_GCR_IMAGE="gcr.io/${PROJECT_ID}/oracle-private-agent-factory:${PAF_VERSION}"
TARGET_AR_IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${AR_REPO}/private-agent-factory:${PAF_VERSION}"

echo -e "${BOLD}Target Configuration:${RESET}"
echo -e "  • GCP Project ID:        ${CYAN}${PROJECT_ID:-[Not Configured]}${RESET}"
echo -e "  • GCP Region:            ${CYAN}${REGION}${RESET}"
echo -e "  • Target PAIAS Version:  ${CYAN}${PAF_VERSION}${RESET}"
echo -e "  • Target Artifact Reg:   ${CYAN}${TARGET_AR_IMAGE}${RESET}"
echo -e "  • Target GCR Image:      ${CYAN}${TARGET_GCR_IMAGE}${RESET}\n"

show_menu() {
    echo -e "${BOLD}Select an image acquisition and setup workflow:${RESET}\n"
    echo -e "  ${BOLD}${YELLOW}1)${RESET} 🌐 Pull from Oracle Container Registry (OCR) [${BOLD}container-registry.oracle.com${RESET}]"
    echo -e "  ${BOLD}${YELLOW}2)${RESET} 📂 Load from downloaded OTN Archive (*.tar.gz / *.zip from Oracle Downloads)"
    echo -e "  ${BOLD}${YELLOW}3)${RESET} 🛠️ Build Extended Multi-Stage Container from Local Source (Node 20 + Instant Client)"
    echo -e "  ${BOLD}${YELLOW}4)${RESET} 🚀 Push tagged PAIAS 26.4 image to GCP Artifact Registry & GCR"
    echo -e "  ${BOLD}${YELLOW}5)${RESET} 🔍 Verify & inspect local container image metadata"
    echo -e "  ${BOLD}${YELLOW}6)${RESET} 🚪 Exit\n"

    read -p "Enter choice [1-6]: " choice
    case $choice in
        1)
            pull_from_ocr
            ;;
        2)
            load_from_archive
            ;;
        3)
            build_local_extended
            ;;
        4)
            push_to_gcp
            ;;
        5)
            verify_image
            ;;
        6)
            echo -e "${GREEN}Exiting. Done!${RESET}"
            exit 0
            ;;
        *)
            echo -e "${RED}Invalid selection.${RESET}"
            show_menu
            ;;
    esac
}

# ------------------------------------------------------------------------------
# Workflow 1: Pull from Oracle Container Registry (OCR)
# ------------------------------------------------------------------------------
pull_from_ocr() {
    echo -e "\n${BOLD}${BLUE}--- Workflow 1: Pulling from Oracle Container Registry (OCR) ---${RESET}"
    echo -e "Sign in to accept the Oracle Standard Terms and Restrictions at:"
    echo -e "👉 ${BOLD}https://container-registry.oracle.com${RESET}\n"

    read -p "Enter your Oracle Single Sign-On (SSO) email / username: " OCR_USER
    read -s -p "Enter your Oracle Container Registry Auth Token / Password: " OCR_PASS
    echo ""

    if [ -n "$OCR_USER" ] && [ -n "$OCR_PASS" ]; then
        echo -e "\nLogging into ${OCR_REGISTRY}..."
        echo "${OCR_PASS}" | docker login "${OCR_REGISTRY}" -u "${OCR_USER}" --password-stdin
        echo -e "${GREEN}✓ Successfully authenticated to Oracle Container Registry.${RESET}"
    else
        echo -e "${YELLOW}Proceeding with existing Docker credentials...${RESET}"
    fi

    echo -e "\nPulling ${OCR_REGISTRY}/${OCR_IMAGE_NAME}:${PAF_VERSION}..."
    if docker pull "${OCR_REGISTRY}/${OCR_IMAGE_NAME}:${PAF_VERSION}"; then
        echo -e "${GREEN}✓ Successfully pulled image from OCR!${RESET}"
        docker tag "${OCR_REGISTRY}/${OCR_IMAGE_NAME}:${PAF_VERSION}" "${LOCAL_TAG}"
        docker tag "${OCR_REGISTRY}/${OCR_IMAGE_NAME}:${PAF_VERSION}" "${TARGET_GCR_IMAGE}"
        docker tag "${OCR_REGISTRY}/${OCR_IMAGE_NAME}:${PAF_VERSION}" "${TARGET_AR_IMAGE}"
        echo -e "${GREEN}✓ Tagged as ${LOCAL_TAG}, ${TARGET_GCR_IMAGE}, and ${TARGET_AR_IMAGE}${RESET}"
    else
        echo -e "${YELLOW}[INFO] OCR direct pull failed or requires specific enterprise entitlement.${RESET}"
        echo -e "${YELLOW}Falling back to building / tagging local extended container image...${RESET}"
        build_local_extended
    fi
    show_menu
}

# ------------------------------------------------------------------------------
# Workflow 2: Load from downloaded OTN Archive
# ------------------------------------------------------------------------------
load_from_archive() {
    echo -e "\n${BOLD}${BLUE}--- Workflow 2: Loading from Downloaded OTN Archive ---${RESET}"
    echo -e "Download the official container archive from:"
    echo -e "👉 ${BOLD}https://www.oracle.com/database/technologies/private-agent-factory-downloads.html${RESET}\n"

    read -p "Enter absolute or relative path to container archive (.tar.gz / .tar): " ARCHIVE_PATH

    if [ ! -f "$ARCHIVE_PATH" ]; then
        echo -e "${RED}[ERROR] File not found at: ${ARCHIVE_PATH}${RESET}"
        show_menu
        return
    fi

    echo -e "Loading container image archive with docker load..."
    docker load -i "${ARCHIVE_PATH}"

    echo -e "Tagging image for local and GCP deployment..."
    docker tag "oracle/private-agent-factory:${PAF_VERSION}" "${LOCAL_TAG}" 2>/dev/null || \
    docker tag "private-agent-factory:${PAF_VERSION}" "${LOCAL_TAG}" 2>/dev/null || true
    
    docker tag "${LOCAL_TAG}" "${TARGET_GCR_IMAGE}"
    docker tag "${LOCAL_TAG}" "${TARGET_AR_IMAGE}"
    echo -e "${GREEN}✓ Successfully loaded and tagged image!${RESET}"
    show_menu
}

# ------------------------------------------------------------------------------
# Workflow 3: Build Extended Multi-Stage Container
# ------------------------------------------------------------------------------
build_local_extended() {
    echo -e "\n${BOLD}${BLUE}--- Workflow 3: Building Extended Multi-Stage Production Container ---${RESET}"
    cd ..
    echo -e "Building container from local Dockerfile with Oracle Instant Client + Node 20 runtime..."
    docker build -t "${LOCAL_TAG}" -t "${TARGET_GCR_IMAGE}" -t "${TARGET_AR_IMAGE}" .
    echo -e "${GREEN}✓ Container built and tagged successfully:${RESET}"
    echo -e "  • ${LOCAL_TAG}"
    echo -e "  • ${TARGET_GCR_IMAGE}"
    echo -e "  • ${TARGET_AR_IMAGE}"
    cd deploy
    show_menu
}

# ------------------------------------------------------------------------------
# Workflow 4: Push to GCP Artifact Registry & GCR
# ------------------------------------------------------------------------------
push_to_gcp() {
    echo -e "\n${BOLD}${BLUE}--- Workflow 4: Pushing to Google Cloud Platform ---${RESET}"
    if [ -z "$PROJECT_ID" ]; then
        echo -e "${RED}[ERROR] GCP_PROJECT_ID is not configured in environment.${RESET}"
        show_menu
        return
    fi

    echo -e "Configuring gcloud authentication for Docker..."
    gcloud auth configure-docker --quiet
    gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet 2>/dev/null || true

    echo -e "\nPushing to Google Container Registry (${TARGET_GCR_IMAGE})..."
    docker push "${TARGET_GCR_IMAGE}"
    echo -e "${GREEN}✓ Pushed to GCR: ${TARGET_GCR_IMAGE}${RESET}"

    echo -e "\nChecking / Creating Artifact Registry repository: ${AR_REPO} in ${REGION}..."
    if ! gcloud artifacts repositories describe "${AR_REPO}" --location="${REGION}" --project="${PROJECT_ID}" &>/dev/null; then
        echo -e "Creating Artifact Registry repository '${AR_REPO}'..."
        gcloud artifacts repositories create "${AR_REPO}" \
            --repository-format=docker \
            --location="${REGION}" \
            --description="Oracle AI Private Agent Factory Container Registry" \
            --project="${PROJECT_ID}" --quiet || true
    fi

    echo -e "\nPushing to GCP Artifact Registry (${TARGET_AR_IMAGE})..."
    docker push "${TARGET_AR_IMAGE}" || echo -e "${YELLOW}Artifact Registry push skipped; GCR image is ready.${RESET}"

    echo -e "\n${BOLD}${GREEN}==================================================================================${RESET}"
    echo -e "${BOLD}${GREEN}✓ Oracle Private Agent Factory 26.4 images are staged in GCP for deployment!${RESET}"
    echo -e "${BOLD}${GREEN}==================================================================================${RESET}"
    echo -e "Use the following image in Cloud Run or GKE:"
    echo -e "👉 ${BOLD}${CYAN}${TARGET_GCR_IMAGE}${RESET}"
    show_menu
}

# ------------------------------------------------------------------------------
# Workflow 5: Verify & Inspect Local Image
# ------------------------------------------------------------------------------
verify_image() {
    echo -e "\n${BOLD}${BLUE}--- Workflow 5: Inspecting Local Container Images ---${RESET}"
    docker images | grep -E "private-agent-factory|oracle-ai" || echo -e "${YELLOW}No matching local images found.${RESET}"
    echo ""
    show_menu
}

# Start main interactive menu
show_menu
