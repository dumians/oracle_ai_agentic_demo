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
RAW_REGION="${GCP_REGION:-europe-west3}"

# Normalize GCP region names (e.g., eu-west3 -> europe-west3)
case "${RAW_REGION}" in
    eu-west3)
        REGION="europe-west3"
        ;;
    eu-west1)
        REGION="europe-west1"
        ;;
    eu-west2)
        REGION="europe-west2"
        ;;
    eu-west4)
        REGION="europe-west4"
        ;;
    *)
        REGION="${RAW_REGION}"
        ;;
esac

AR_REPO="${GCP_ARTIFACT_REPO:-oracle-ai}"
OCR_REGISTRY="container-registry.oracle.com"
OCR_IMAGE_NAME="database/private-agent-factory"
PAF_VERSION="${PAF_VERSION:-26.4}"
LOCAL_TAG="oracle-private-agent-factory:${PAF_VERSION}"
TARGET_AR_IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${AR_REPO}/private-agent-factory:${PAF_VERSION}"
TARGET_AR_LATEST="${REGION}-docker.pkg.dev/${PROJECT_ID}/${AR_REPO}/private-agent-factory:latest"
TARGET_GCR_IMAGE="gcr.io/${PROJECT_ID}/oracle-private-agent-factory:${PAF_VERSION}"

# Helper to verify or create the Artifact Registry repository
ensure_artifact_registry() {
    if [ -n "$PROJECT_ID" ] && [ -n "$AR_REPO" ]; then
        echo -e "\n${BOLD}${BLUE}Checking Artifact Registry repository '${AR_REPO}' in ${REGION}...${RESET}"
        if ! gcloud artifacts repositories describe "${AR_REPO}" --location="${REGION}" --project="${PROJECT_ID}" &>/dev/null; then
            echo -e "${YELLOW}Artifact Registry repository '${AR_REPO}' not found. Creating it...${RESET}"
            gcloud artifacts repositories create "${AR_REPO}" \
                --repository-format=docker \
                --location="${REGION}" \
                --description="Oracle AI Private Agent Factory Container Registry" \
                --project="${PROJECT_ID}" --quiet || true
        else
            echo -e "${GREEN}✓ Artifact Registry repository '${AR_REPO}' is ready.${RESET}"
        fi
    fi
}

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
    echo -e "\n${BOLD}${BLUE}--- Workflow 2: Loading from Downloaded Oracle Archive ---${RESET}"
    echo -e "Download the official container archive from:"
    echo -e "👉 ${BOLD}https://www.oracle.com/database/technologies/private-agent-factory-downloads.html${RESET}\n"

    DEFAULT_DOWNLOAD_PATH="$(ls ~/Downloads/oracle_agent_factory_x86_*.tar.gz 2>/dev/null | head -n 1 || echo '')"
    if [ -n "$DEFAULT_DOWNLOAD_PATH" ]; then
        echo -e "Found candidate archive in Downloads: ${BOLD}${CYAN}${DEFAULT_DOWNLOAD_PATH}${RESET}"
    fi

    read -p "Enter path to archive [Default: ${DEFAULT_DOWNLOAD_PATH:-./oracle_agent_factory.tar.gz}]: " ARCHIVE_PATH
    ARCHIVE_PATH="${ARCHIVE_PATH:-$DEFAULT_DOWNLOAD_PATH}"

    if [ ! -f "$ARCHIVE_PATH" ]; then
        echo -e "${RED}[ERROR] File not found at: ${ARCHIVE_PATH}${RESET}"
        show_menu
        return
    fi

    # Extract version if pattern matches
    DETECTED_VER="$(basename "$ARCHIVE_PATH" | grep -oE "[0-9]+\.[0-9]+\.[0-9]+" || echo "$PAF_VERSION")"
    TARGET_AR_VER_TAG="${REGION}-docker.pkg.dev/${PROJECT_ID}/${AR_REPO}/private-agent-factory:${DETECTED_VER}"
    TARGET_AR_LATEST_TAG="${REGION}-docker.pkg.dev/${PROJECT_ID}/${AR_REPO}/private-agent-factory:latest"
    TARGET_GCR_VER_TAG="gcr.io/${PROJECT_ID}/oracle-private-agent-factory:${DETECTED_VER}"

    echo -e "\nDetected Agent Factory Version: ${BOLD}${GREEN}${DETECTED_VER}${RESET}"
    echo -e "Target Artifact Registry: ${BOLD}${CYAN}${TARGET_AR_VER_TAG}${RESET}"
    echo -e "Target GCR Image:         ${BOLD}${CYAN}${TARGET_GCR_VER_TAG}${RESET}\n"

    if command -v docker &> /dev/null; then
        echo -e "Loading container image archive with docker load..."
        docker load -i "${ARCHIVE_PATH}"
        docker tag "oracle/private-agent-factory:${DETECTED_VER}" "${LOCAL_TAG}" 2>/dev/null || true
        docker tag "${LOCAL_TAG}" "${TARGET_AR_VER_TAG}"
        docker tag "${LOCAL_TAG}" "${TARGET_AR_LATEST_TAG}"
        docker tag "${LOCAL_TAG}" "${TARGET_GCR_VER_TAG}" 2>/dev/null || true
        echo -e "${GREEN}✓ Successfully loaded and tagged image with Docker!${RESET}"
        echo -e "  • ${TARGET_AR_VER_TAG}"
        echo -e "  • ${TARGET_AR_LATEST_TAG}"
    else
        echo -e "${YELLOW}[INFO] Docker not detected locally. Submitting direct Cloud Build from extracted kit...${RESET}"
        STAGE_DIR="/tmp/paf_build_${DETECTED_VER}"
        mkdir -p "${STAGE_DIR}"
        echo -e "Extracting applied-ai build kit to ${STAGE_DIR}..."
        tar -xzf "${ARCHIVE_PATH}" -C "${STAGE_DIR}" ./applied-ai
        # Clean internal ADE symlinks
        rm -f "${STAGE_DIR}/applied-ai/kit/agent_factory/third_party/python3/bin/.ade_path" \
              "${STAGE_DIR}/applied-ai/kit/agent_factory/third_party/python3/lib/.ade_path" 2>/dev/null || true

        ensure_artifact_registry
        echo -e "Submitting build to Google Cloud Build targeting Artifact Registry..."
        CLOUDSDK_AUTH_ACCESS_TOKEN=$(gcloud auth application-default print-access-token 2>/dev/null || echo '') \
        gcloud builds submit \
            --tag "${TARGET_AR_VER_TAG}" \
            --project="${PROJECT_ID}" \
            "${STAGE_DIR}/applied-ai"
        
        echo -e "${GREEN}✓ Container built and pushed to Artifact Registry: ${TARGET_AR_VER_TAG}${RESET}"
    fi
    show_menu
}

# ------------------------------------------------------------------------------
# Workflow 3: Build Extended Multi-Stage Container
# ------------------------------------------------------------------------------
build_local_extended() {
    echo -e "\n${BOLD}${BLUE}--- Workflow 3: Building Extended Multi-Stage Production Container ---${RESET}"
    cd ..
    echo -e "Building container from local Dockerfile with Oracle Instant Client + Node 20 runtime..."
    docker build -t "${LOCAL_TAG}" -t "${TARGET_AR_IMAGE}" -t "${TARGET_AR_LATEST}" -t "${TARGET_GCR_IMAGE}" .
    echo -e "${GREEN}✓ Container built and tagged successfully:${RESET}"
    echo -e "  • ${LOCAL_TAG}"
    echo -e "  • ${TARGET_AR_IMAGE}"
    echo -e "  • ${TARGET_AR_LATEST}"
    echo -e "  • ${TARGET_GCR_IMAGE}"
    cd deploy
    show_menu
}

# ------------------------------------------------------------------------------
# Workflow 4: Push to GCP Artifact Registry
# ------------------------------------------------------------------------------
push_to_gcp() {
    echo -e "\n${BOLD}${BLUE}--- Workflow 4: Pushing to Google Cloud Platform ---${RESET}"
    if [ -z "$PROJECT_ID" ]; then
        echo -e "${RED}[ERROR] GCP_PROJECT_ID is not configured in environment.${RESET}"
        show_menu
        return
    fi

    ensure_artifact_registry

    echo -e "Configuring gcloud authentication for Artifact Registry Docker..."
    gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet 2>/dev/null || true

    echo -e "\nPushing to GCP Artifact Registry (${TARGET_AR_IMAGE})..."
    docker push "${TARGET_AR_IMAGE}"
    docker push "${TARGET_AR_LATEST}" 2>/dev/null || true
    echo -e "${GREEN}✓ Pushed to Artifact Registry: ${TARGET_AR_IMAGE}${RESET}"

    echo -e "\n${BOLD}${GREEN}==================================================================================${RESET}"
    echo -e "${BOLD}${GREEN}✓ Oracle Private Agent Factory container images are staged in Artifact Registry!${RESET}"
    echo -e "${BOLD}${GREEN}==================================================================================${RESET}"
    echo -e "Use the following image in Cloud Run or GKE:"
    echo -e "👉 ${BOLD}${CYAN}${TARGET_AR_IMAGE}${RESET}"
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
