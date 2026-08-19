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

# ==============================================================================
# 🔍 Verification Helpers
# ==============================================================================

# Check if image tag exists in Google Artifact Registry
check_artifact_registry_image() {
    local ver="${1:-$PAF_VERSION}"
    AR_IMAGE_FOUND=false
    AR_IMAGE_DIGEST=""
    AR_IMAGE_TIME=""
    AR_IMAGE_SIZE=""

    if [ -z "$PROJECT_ID" ] || [ -z "$REGION" ] || [ -z "$AR_REPO" ]; then
        return 1
    fi

    local pkg_path="${REGION}-docker.pkg.dev/${PROJECT_ID}/${AR_REPO}/private-agent-factory"
    
    # Query Artifact Registry for tag
    local img_info
    img_info=$(gcloud artifacts docker images list "${pkg_path}" \
        --filter="TAGS:${ver}" \
        --format="value(version,createTime,size)" 2>/dev/null | head -n 1 || echo "")

    if [ -n "$img_info" ]; then
        AR_IMAGE_FOUND=true
        AR_IMAGE_DIGEST=$(echo "$img_info" | awk '{print $1}')
        AR_IMAGE_TIME=$(echo "$img_info" | awk '{print $2}')
        AR_IMAGE_SIZE=$(echo "$img_info" | awk '{print $3}')
        return 0
    fi
    return 1
}

# Check if tarball archive exists and get metadata
check_tarball_archive() {
    local archive_path="$1"
    TARBALL_FOUND=false
    TARBALL_SIZE="0"
    TARBALL_MTIME="N/A"

    if [ -n "$archive_path" ] && [ -f "$archive_path" ]; then
        TARBALL_FOUND=true
        TARBALL_SIZE=$(du -sh "$archive_path" 2>/dev/null | awk '{print $1}' || echo "N/A")
        TARBALL_MTIME=$(python3 -c "import os, datetime; print(datetime.datetime.fromtimestamp(os.path.getmtime('$archive_path')).strftime('%Y-%m-%d %H:%M:%S'))" 2>/dev/null || stat -f "%Sm" "$archive_path" 2>/dev/null || echo "N/A")
        return 0
    fi
    return 1
}

# Check if extracted applied-ai kit already exists and is valid
check_extracted_staging() {
    local ver="${1:-$PAF_VERSION}"
    STAGING_KIT_FOUND=false
    STAGING_KIT_PATH=""
    STAGING_KIT_SIZE="0"

    for candidate_dir in "/tmp/paf_build_${ver}" "./build_paf_${ver}" "../build_paf_${ver}"; do
        if [ -d "${candidate_dir}/applied-ai" ] && [ -f "${candidate_dir}/applied-ai/Dockerfile" ]; then
            STAGING_KIT_FOUND=true
            STAGING_KIT_PATH="${candidate_dir}/applied-ai"
            STAGING_KIT_SIZE=$(du -sh "${STAGING_KIT_PATH}" 2>/dev/null | awk '{print $1}' || echo "N/A")
            return 0
        fi
    done
    return 1
}

# Check if local Docker engine has the image
check_local_docker_image() {
    local ver="${1:-$PAF_VERSION}"
    DOCKER_IMAGE_FOUND=false
    DOCKER_IMAGE_ID=""
    DOCKER_IMAGE_SIZE=""

    if command -v docker &>/dev/null; then
        if docker info &>/dev/null; then
            for tag in "oracle-private-agent-factory:${ver}" \
                       "${REGION}-docker.pkg.dev/${PROJECT_ID}/${AR_REPO}/private-agent-factory:${ver}" \
                       "oracle/private-agent-factory:${ver}"; do
                local inspect_out
                inspect_out=$(docker inspect --format='{{.Id}} {{.Size}}' "$tag" 2>/dev/null || echo "")
                if [ -n "$inspect_out" ]; then
                    DOCKER_IMAGE_FOUND=true
                    DOCKER_IMAGE_ID=$(echo "$inspect_out" | awk '{print substr($1, 1, 19)}')
                    DOCKER_IMAGE_SIZE=$(echo "$inspect_out" | awk '{printf "%.2f GiB", $2/(1024*1024*1024)}')
                    return 0
                fi
            done
        fi
    fi
    return 1
}

# Find candidate archive tarball across standard download locations
find_candidate_archive() {
    for f in \
        ~/Downloads/oracle_agent_factory_x86_*.tar.gz \
        /downloads/oracle_agent_factory_x86_*.tar.gz \
        ../downloads/oracle_agent_factory_x86_*.tar.gz \
        ./downloads/oracle_agent_factory_x86_*.tar.gz \
        ./oracle_agent_factory_x86_*.tar.gz \
        ../oracle_agent_factory_x86_*.tar.gz \
        /tmp/oracle_agent_factory_x86_*.tar.gz; do
        if [ -f "$f" ]; then
            echo "$f"
            return 0
        fi
    done
    echo ""
}

# Display full verification status dashboard
display_full_verification_report() {
    local check_ver="${1:-$PAF_VERSION}"
    local candidate_arc="$(find_candidate_archive)"

    echo -e "\n${BOLD}${CYAN}==================================================================================${RESET}"
    echo -e "${BOLD}${GREEN}  🔍 ORACLE AI PRIVATE AGENT FACTORY: ARTIFACT & IMAGE VERIFICATION REPORT${RESET}"
    echo -e "${BOLD}${CYAN}==================================================================================${RESET}"
    echo -e "Target GCP Project:    ${BOLD}${CYAN}${PROJECT_ID:-[Not Configured]}${RESET}"
    echo -e "Target Region:         ${BOLD}${CYAN}${REGION}${RESET}"
    echo -e "Artifact Repository:   ${BOLD}${CYAN}${AR_REPO}${RESET}"
    echo -e "PAF Version:           ${BOLD}${CYAN}${check_ver}${RESET}\n"

    # 1. Check Local Tarball Archive
    echo -e "${BOLD}1. 📦 Local Tarball Archive (*.tar.gz):${RESET}"
    if [ -n "$candidate_arc" ] && check_tarball_archive "$candidate_arc"; then
        echo -e "  • Status:        ${GREEN}✓ FOUND & READY${RESET}"
        echo -e "  • Path:          ${CYAN}${candidate_arc}${RESET}"
        echo -e "  • Size:          ${BOLD}${TARBALL_SIZE}${RESET}"
        echo -e "  • Last Modified: ${TARBALL_MTIME}"
    else
        echo -e "  • Status:        ${YELLOW}⚠️ NOT FOUND in ~/Downloads or /downloads${RESET}"
        echo -e "  • Download from: ${BLUE}https://www.oracle.com/database/technologies/private-agent-factory-downloads.html${RESET}"
    fi

    # 2. Check Extracted Staging Kit
    echo -e "\n${BOLD}2. 📂 Local Extracted Staging Kit (applied-ai):${RESET}"
    if check_extracted_staging "$check_ver"; then
        echo -e "  • Status:        ${GREEN}✓ EXTRACTED & READY FOR BUILD${RESET}"
        echo -e "  • Staging Path:  ${CYAN}${STAGING_KIT_PATH}${RESET}"
        echo -e "  • Size on Disk:  ${BOLD}${STAGING_KIT_SIZE}${RESET}"
        echo -e "  • Dockerfile:    ${GREEN}✓ Verified present${RESET}"
    else
        echo -e "  • Status:        ${YELLOW}⚠️ NOT EXTRACTED (Will extract from archive during build)${RESET}"
    fi

    # 3. Check Local Docker Engine
    echo -e "\n${BOLD}3. 🐳 Local Docker Engine:${RESET}"
    if command -v docker &>/dev/null; then
        if check_local_docker_image "$check_ver"; then
            echo -e "  • Status:        ${GREEN}✓ IMAGE LOADED IN LOCAL DOCKER${RESET}"
            echo -e "  • Image ID:      ${CYAN}${DOCKER_IMAGE_ID}${RESET}"
            echo -e "  • Size:          ${BOLD}${DOCKER_IMAGE_SIZE}${RESET}"
        else
            echo -e "  • Status:        ${YELLOW}⚠️ Docker available, but image '${check_ver}' is not loaded locally${RESET}"
        fi
    else
        echo -e "  • Status:        ${BLUE}ℹ️ Docker CLI not installed locally (Builds will use Google Cloud Build)${RESET}"
    fi

    # 4. Check Google Artifact Registry (Remote)
    echo -e "\n${BOLD}4. ☁️ Google Artifact Registry (Remote GCP):${RESET}"
    echo -e "  • Target URI:    ${CYAN}${REGION}-docker.pkg.dev/${PROJECT_ID}/${AR_REPO}/private-agent-factory:${check_ver}${RESET}"
    if check_artifact_registry_image "$check_ver"; then
        echo -e "  • Status:        ${GREEN}✓ IMAGE ALREADY PUBLISHED IN ARTIFACT REGISTRY${RESET}"
        echo -e "  • Digest:        ${CYAN}${AR_IMAGE_DIGEST}${RESET}"
        echo -e "  • Created Time:  ${AR_IMAGE_TIME}"
        echo -e "  • Image Size:    ${AR_IMAGE_SIZE}"
    else
        echo -e "  • Status:        ${YELLOW}⚠️ IMAGE NOT FOUND in Artifact Registry (Requires build & push)${RESET}"
        if ! gcloud auth print-access-token &>/dev/null; then
            echo -e "  • Auth Note:     ${RED}gcloud authentication token expired. Run 'gcloud auth login' to query remote status.${RESET}"
        fi
    fi

    echo -e "\n${BOLD}${CYAN}==================================================================================${RESET}\n"
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
    echo -e "  ${BOLD}${YELLOW}4)${RESET} 🚀 Push tagged PAIAS image to GCP Artifact Registry"
    echo -e "  ${BOLD}${YELLOW}5)${RESET} 🔍 Verify & inspect archives, staging kits, Docker & Artifact Registry images"
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

    DEFAULT_DOWNLOAD_PATH="$(find_candidate_archive)"
    if [ -n "$DEFAULT_DOWNLOAD_PATH" ]; then
        check_tarball_archive "$DEFAULT_DOWNLOAD_PATH"
        echo -e "Found candidate archive in Downloads: ${BOLD}${CYAN}${DEFAULT_DOWNLOAD_PATH}${RESET}"
        echo -e "  • File Size:     ${BOLD}${TARBALL_SIZE}${RESET}"
        echo -e "  • Last Modified: ${TARBALL_MTIME}"
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
    echo -e "Target Artifact Registry:       ${BOLD}${CYAN}${TARGET_AR_VER_TAG}${RESET}"

    # --------------------------------------------------------------------------
    # 🔍 Verification Check 1: Check if Image is Already Published in Artifact Registry
    # --------------------------------------------------------------------------
    echo -e "\n${BOLD}${BLUE}Checking if container image is already published in Artifact Registry...${RESET}"
    if check_artifact_registry_image "${DETECTED_VER}"; then
        echo -e "\n${BOLD}${GREEN}==================================================================================${RESET}"
        echo -e "${BOLD}${GREEN}✓ [VERIFIED] Remote Container Image is ALREADY created in Artifact Registry!${RESET}"
        echo -e "${BOLD}${GREEN}==================================================================================${RESET}"
        echo -e "  • Image URI:     ${BOLD}${CYAN}${TARGET_AR_VER_TAG}${RESET}"
        echo -e "  • Digest:        ${CYAN}${AR_IMAGE_DIGEST}${RESET}"
        echo -e "  • Created At:    ${AR_IMAGE_TIME}"
        echo -e "  • Image Size:    ${AR_IMAGE_SIZE}"
        echo -e "${BOLD}${GREEN}==================================================================================${RESET}\n"

        read -p "The container image already exists in Artifact Registry. Skip build and use existing image? [Y/n]: " SKIP_BUILD
        SKIP_BUILD="${SKIP_BUILD:-Y}"
        if [[ "$SKIP_BUILD" =~ ^[Yy]$ ]]; then
            echo -e "\n${GREEN}✓ Using existing verified image in Artifact Registry: ${BOLD}${TARGET_AR_VER_TAG}${RESET}"
            echo -e "\n${BOLD}Ready for deployment:${RESET}"
            echo -e "  • Cloud Run: ${CYAN}gcloud run deploy oracle-paf-${DETECTED_VER} --image=${TARGET_AR_VER_TAG} --region=${REGION}${RESET}"
            echo -e "  • GKE:       ${CYAN}kubectl apply -f deploy/gke-paf-26.4.yaml${RESET}\n"
            show_menu
            return 0
        fi
        echo -e "${YELLOW}Proceeding with rebuild/re-upload as requested...${RESET}\n"
    fi

    # --------------------------------------------------------------------------
    # 🔍 Execution: Local Docker vs Direct Cloud Build
    # --------------------------------------------------------------------------
    if command -v docker &> /dev/null && docker info &>/dev/null; then
        # Check if already loaded in local Docker
        if check_local_docker_image "${DETECTED_VER}"; then
            echo -e "\n${BOLD}${GREEN}✓ [VERIFIED] Container image '${DETECTED_VER}' is already loaded in local Docker!${RESET}"
            echo -e "  • Image ID: ${CYAN}${DOCKER_IMAGE_ID}${RESET}"
            echo -e "  • Size:     ${BOLD}${DOCKER_IMAGE_SIZE}${RESET}"
            read -p "Skip docker load and re-tag existing local image? [Y/n]: " SKIP_DOCKER_LOAD
            SKIP_DOCKER_LOAD="${SKIP_DOCKER_LOAD:-Y}"
        else
            SKIP_DOCKER_LOAD="N"
        fi

        if [[ ! "$SKIP_DOCKER_LOAD" =~ ^[Yy]$ ]]; then
            echo -e "Loading container image archive with docker load (~2.3GB)..."
            docker load -i "${ARCHIVE_PATH}"
        fi

        docker tag "oracle/private-agent-factory:${DETECTED_VER}" "${LOCAL_TAG}" 2>/dev/null || true
        docker tag "${LOCAL_TAG}" "${TARGET_AR_VER_TAG}"
        docker tag "${LOCAL_TAG}" "${TARGET_AR_LATEST_TAG}"
        docker tag "${LOCAL_TAG}" "${TARGET_GCR_VER_TAG}" 2>/dev/null || true
        echo -e "${GREEN}✓ Successfully tagged image with Docker!${RESET}"
        echo -e "  • ${TARGET_AR_VER_TAG}"
        echo -e "  • ${TARGET_AR_LATEST_TAG}"
    else
        echo -e "${YELLOW}[INFO] Local Docker daemon not available. Building via Google Cloud Build...${RESET}"
        STAGE_DIR="/tmp/paf_build_${DETECTED_VER}"

        # ----------------------------------------------------------------------
        # 🔍 Verification Check 2: Check if Staging Kit is Already Extracted
        # ----------------------------------------------------------------------
        if check_extracted_staging "${DETECTED_VER}"; then
            echo -e "\n${BOLD}${GREEN}✓ [VERIFIED] Extracted applied-ai build kit already exists!${RESET}"
            echo -e "  • Staging Path:  ${CYAN}${STAGING_KIT_PATH}${RESET}"
            echo -e "  • Size on Disk:  ${BOLD}${STAGING_KIT_SIZE}${RESET}"
            echo -e "  • Dockerfile:    ${GREEN}✓ Verified present${RESET}\n"

            read -p "Reuse existing extracted staging kit (skip ~2.3GB decompression)? [Y/n]: " REUSE_STAGING
            REUSE_STAGING="${REUSE_STAGING:-Y}"
        else
            REUSE_STAGING="N"
        fi

        if [[ ! "$REUSE_STAGING" =~ ^[Yy]$ ]]; then
            echo -e "Extracting applied-ai build kit to ${STAGE_DIR} (from ${ARCHIVE_PATH})..."
            rm -rf "${STAGE_DIR}"
            mkdir -p "${STAGE_DIR}"
            tar -xzf "${ARCHIVE_PATH}" -C "${STAGE_DIR}" ./applied-ai
            # Clean internal ADE symlinks
            rm -f "${STAGE_DIR}/applied-ai/kit/agent_factory/third_party/python3/bin/.ade_path" \
                  "${STAGE_DIR}/applied-ai/kit/agent_factory/third_party/python3/lib/.ade_path" 2>/dev/null || true
            echo -e "${GREEN}✓ Extraction completed successfully.${RESET}"
        else
            echo -e "${GREEN}✓ Reusing existing extracted staging kit at ${STAGE_DIR}/applied-ai${RESET}"
        fi

        ensure_artifact_registry
        echo -e "\nSubmitting build to Google Cloud Build targeting Artifact Registry..."
        CLOUDSDK_AUTH_ACCESS_TOKEN=$(gcloud auth application-default print-access-token 2>/dev/null || echo '') \
        gcloud builds submit \
            --tag "${TARGET_AR_VER_TAG}" \
            --project="${PROJECT_ID}" \
            "${STAGE_DIR}/applied-ai"
        
        echo -e "\n${BOLD}${GREEN}==================================================================================${RESET}"
        echo -e "${BOLD}${GREEN}✓ Container built and pushed to Artifact Registry: ${TARGET_AR_VER_TAG}${RESET}"
        echo -e "${BOLD}${GREEN}==================================================================================${RESET}"
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

    # Check if image already exists in Artifact Registry
    if check_artifact_registry_image "$PAF_VERSION"; then
        echo -e "\n${BOLD}${YELLOW}⚠️ Image already exists in Artifact Registry:${RESET}"
        echo -e "  • Tag:    ${CYAN}${TARGET_AR_IMAGE}${RESET}"
        echo -e "  • Digest: ${CYAN}${AR_IMAGE_DIGEST}${RESET}"
        read -p "Do you want to overwrite / re-push this image? [y/N]: " REPUSH_CONFIRM
        if [[ ! "$REPUSH_CONFIRM" =~ ^[Yy]$ ]]; then
            echo -e "${GREEN}Push skipped. Existing image remains in Artifact Registry.${RESET}"
            show_menu
            return 0
        fi
    fi

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
# Workflow 5: Comprehensive Verification Dashboard
# ------------------------------------------------------------------------------
verify_image() {
    display_full_verification_report "$PAF_VERSION"
    show_menu
}

# ------------------------------------------------------------------------------
# CLI Flag & Argument Dispatcher
# ------------------------------------------------------------------------------
if [ "$1" = "--verify" ] || [ "$1" = "-v" ] || [ "$1" = "verify" ]; then
    display_full_verification_report "${2:-$PAF_VERSION}"
    exit 0
elif [ "$1" = "--check-image" ]; then
    check_artifact_registry_image "${2:-$PAF_VERSION}"
    if [ "$AR_IMAGE_FOUND" = true ]; then
        echo "EXISTS: ${AR_IMAGE_DIGEST} (${AR_IMAGE_TIME})"
        exit 0
    else
        echo "NOT_FOUND"
        exit 1
    fi
elif [ "$1" = "--check-archive" ]; then
    check_tarball_archive "${2:-$(find_candidate_archive)}"
    if [ "$TARBALL_FOUND" = true ]; then
        echo "EXISTS: ${TARBALL_SIZE} (${TARBALL_MTIME})"
        exit 0
    else
        echo "NOT_FOUND"
        exit 1
    fi
fi

# Start main interactive menu
show_menu
