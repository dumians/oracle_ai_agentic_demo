#!/usr/bin/env bash
# ==============================================================================
# 🚀 Oracle AI Database Private Agent Factory - GCP Cloud Run Deployer
# ==============================================================================
# Automates container build via Google Cloud Build and deployment to Cloud Run
# with VPC Access Connector linking to Oracle Database@Google Cloud.
# ==============================================================================

set -e

# Determine Script and Repository directories reliably
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Styling helpers
BOLD="\033[1m"
GREEN="\033[38;5;46m"
CYAN="\033[38;5;51m"
YELLOW="\033[38;5;226m"
RED="\033[38;5;196m"
RESET="\033[0m"

echo -e "${BOLD}${CYAN}==================================================================${RESET}"
echo -e "${BOLD}${GREEN}   ORACLE AI PRIVATE AGENT FACTORY - GCP CLOUD RUN DEPLOYER${RESET}"
echo -e "${BOLD}${CYAN}==================================================================${RESET}"

# Load .env variables if present
if [ -f "${REPO_ROOT}/.env" ]; then
    set -a
    source "${REPO_ROOT}/.env"
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
SERVICE_NAME="${CLOUD_RUN_SERVICE_NAME:-oracle-ai-private-agent-factory}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
IMAGE_NAME="${REGION}-docker.pkg.dev/${PROJECT_ID}/${AR_REPO}/${SERVICE_NAME}:${IMAGE_TAG}"
VPC_CONNECTOR="${GCP_VPC_CONNECTOR:-}"
SA_NAME="oracle-agent-factory-sa"
SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

# Parse CLI arguments
VERIFY_ONLY=false
FORCE_BUILD=false
NO_BUILD=false
CUSTOM_IMAGE=""

while [[ $# -gt 0 ]]; do
    case "$1" in
        --verify)
            VERIFY_ONLY=true
            shift
            ;;
        --force-build)
            FORCE_BUILD=true
            shift
            ;;
        --no-build)
            NO_BUILD=true
            shift
            ;;
        --image=*)
            CUSTOM_IMAGE="${1#*=}"
            shift
            ;;
        --image)
            CUSTOM_IMAGE="$2"
            shift 2
            ;;
        *)
            echo -e "${YELLOW}Unknown option: $1${RESET}"
            shift
            ;;
    esac
done

if [ -n "$CUSTOM_IMAGE" ]; then
    IMAGE_NAME="$CUSTOM_IMAGE"
fi

if [ -z "$PROJECT_ID" ]; then
    echo -e "${RED}[ERROR] GCP_PROJECT_ID is not configured. Please set GCP_PROJECT_ID in .env or run gcloud config set project <id>.${RESET}"
    exit 1
fi

echo -e "${CYAN}[INFO] Repository Root:          ${BOLD}${REPO_ROOT}${RESET}"
echo -e "${CYAN}[INFO] Target GCP Project:       ${BOLD}${PROJECT_ID}${RESET}"
echo -e "${CYAN}[INFO] Target GCP Region:        ${BOLD}${REGION}${RESET}"
echo -e "${CYAN}[INFO] Target Artifact Registry: ${BOLD}${AR_REPO}${RESET}"
echo -e "${CYAN}[INFO] Target Service:           ${BOLD}${SERVICE_NAME}${RESET}"
echo -e "${CYAN}[INFO] Target Container Image:   ${BOLD}${IMAGE_NAME}${RESET}\n"

# Helper: Check if container image exists in Artifact Registry
check_image_exists() {
    local target_img="$1"
    IMAGE_EXISTS=false
    IMAGE_DIGEST=""
    IMAGE_CREATE_TIME=""
    IMAGE_SIZE=""

    # Extract repository and image name from full path
    # e.g., europe-west3-docker.pkg.dev/proj/oracle-ai/service:tag
    local pkg_path="${target_img%:*}"
    local tag="${target_img##*:}"
    if [ "$tag" = "$target_img" ]; then
        tag="latest"
    fi

    local img_info
    img_info=$(gcloud artifacts docker images list "${pkg_path}" \
        --filter="TAGS:${tag}" \
        --format="value(version,createTime,size)" 2>/dev/null | head -n 1 || echo "")

    if [ -n "$img_info" ]; then
        IMAGE_EXISTS=true
        IMAGE_DIGEST=$(echo "$img_info" | awk '{print $1}')
        IMAGE_CREATE_TIME=$(echo "$img_info" | awk '{print $2}')
        IMAGE_SIZE=$(echo "$img_info" | awk '{print $3}')
        return 0
    fi
    return 1
}

# Step 1: Enable required GCP Services
echo -e "${BOLD}${YELLOW}Step 1: Enabling Required GCP APIs...${RESET}"
gcloud services enable \
    run.googleapis.com \
    cloudbuild.googleapis.com \
    artifactregistry.googleapis.com \
    secretmanager.googleapis.com \
    aiplatform.googleapis.com \
    vpcaccess.googleapis.com \
    --project="${PROJECT_ID}" --quiet

# Step 2: Create Artifact Registry Repository if needed
echo -e "\n${BOLD}${YELLOW}Step 2: Checking Artifact Registry repository '${AR_REPO}'...${RESET}"
if ! gcloud artifacts repositories describe "${AR_REPO}" --location="${REGION}" --project="${PROJECT_ID}" &>/dev/null; then
    echo -e "Creating Artifact Registry repository '${AR_REPO}' in ${REGION}..."
    gcloud artifacts repositories create "${AR_REPO}" \
        --repository-format=docker \
        --location="${REGION}" \
        --description="Oracle AI Private Agent Factory Registry" \
        --project="${PROJECT_ID}" --quiet || true
else
    echo -e "${GREEN}✓ Artifact Registry repository '${AR_REPO}' is ready.${RESET}"
fi

# Step 3: Create IAM Service Account if needed
echo -e "\n${BOLD}${YELLOW}Step 3: Checking IAM Service Account & Workload Identity...${RESET}"
if ! gcloud iam service-accounts describe "${SA_EMAIL}" --project="${PROJECT_ID}" &>/dev/null; then
    echo -e "Creating Service Account: ${SA_EMAIL}..."
    gcloud iam service-accounts create "${SA_NAME}" \
        --display-name="Oracle AI Agent Factory Runner SA" \
        --project="${PROJECT_ID}"
fi

# Grant Vertex AI User and Secret Manager Accessor roles
echo -e "Granting Vertex AI User and Secret Manager permissions..."
gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
    --member="serviceAccount:${SA_EMAIL}" \
    --role="roles/aiplatform.user" \
    --condition=None --quiet >/dev/null

gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
    --member="serviceAccount:${SA_EMAIL}" \
    --role="roles/secretmanager.secretAccessor" \
    --condition=None --quiet >/dev/null

# Step 4: Check Container Image in Artifact Registry
echo -e "\n${BOLD}${YELLOW}Step 4: Checking Container Image in Artifact Registry...${RESET}"
check_image_exists "${IMAGE_NAME}" || true

if [ "$IMAGE_EXISTS" = true ]; then
    echo -e "${GREEN}✓ [FOUND] Container image already exists in Artifact Registry!${RESET}"
    echo -e "  • Image URI:     ${BOLD}${CYAN}${IMAGE_NAME}${RESET}"
    echo -e "  • Digest:        ${CYAN}${IMAGE_DIGEST}${RESET}"
    echo -e "  • Created At:    ${IMAGE_CREATE_TIME}"
    echo -e "  • Size:          ${IMAGE_SIZE}\n"
else
    echo -e "${YELLOW}ℹ️ [NOT FOUND] Container image is not yet published to Artifact Registry.${RESET}"
    echo -e "  • Target Image:  ${CYAN}${IMAGE_NAME}${RESET}\n"
fi

if [ "$VERIFY_ONLY" = true ]; then
    echo -e "${GREEN}✓ Verification complete (--verify flag set). Exiting.${RESET}"
    exit 0
fi

# Determine whether to build
DO_BUILD=false
if [ "$NO_BUILD" = true ]; then
    DO_BUILD=false
    echo -e "${GREEN}✓ Skipping build (--no-build flag set). Deploying existing image.${RESET}"
elif [ "$FORCE_BUILD" = true ]; then
    DO_BUILD=true
    echo -e "${YELLOW}Proceeding with forced build (--force-build flag set)...${RESET}"
elif [ "$IMAGE_EXISTS" = true ]; then
    read -p "Container image already exists. Rebuild or use existing image? [u=use existing / R=rebuild, default: u]: " BUILD_CHOICE
    BUILD_CHOICE="${BUILD_CHOICE:-u}"
    if [[ "$BUILD_CHOICE" =~ ^[Rr]$ ]]; then
        DO_BUILD=true
    else
        DO_BUILD=false
        echo -e "${GREEN}✓ Deploying existing image.${RESET}"
    fi
else
    DO_BUILD=true
fi

# Execute Build if required
if [ "$DO_BUILD" = true ]; then
    if [ ! -f "${REPO_ROOT}/Dockerfile" ]; then
        echo -e "${RED}[ERROR] Dockerfile not found at ${REPO_ROOT}/Dockerfile!${RESET}"
        exit 1
    fi
    echo -e "\nSubmitting container build to Google Cloud Build from ${REPO_ROOT}..."
    gcloud builds submit \
        --tag "${IMAGE_NAME}" \
        --project="${PROJECT_ID}" \
        "${REPO_ROOT}"
    echo -e "${GREEN}✓ Cloud Build completed successfully.${RESET}"
fi

# Step 5: Deploy to Google Cloud Run
echo -e "\n${BOLD}${YELLOW}Step 5: Deploying Service to Cloud Run...${RESET}"

VPC_FLAGS=()
if [ -n "$VPC_CONNECTOR" ]; then
    VPC_FLAGS=(
        "--vpc-connector=${VPC_CONNECTOR}"
        "--vpc-egress=private-ranges-only"
    )
fi

gcloud run deploy "${SERVICE_NAME}" \
    --image="${IMAGE_NAME}" \
    --region="${REGION}" \
    --platform=managed \
    --service-account="${SA_EMAIL}" \
    --memory=2Gi \
    --cpu=2 \
    --min-instances=0 \
    --max-instances=10 \
    --port=8080 \
    --allow-unauthenticated \
    --set-env-vars="NODE_ENV=production,GCP_PROJECT_ID=${PROJECT_ID},GCP_REGION=${REGION},COORDINATOR_MODEL=gemini-3.1-flash,DB_DSN=${DB_DSN:-adbs_high},DB_USERNAME=${DB_USERNAME:-ADMIN}" \
    "${VPC_FLAGS[@]}" \
    --project="${PROJECT_ID}"

SERVICE_URL="$(gcloud run services describe "${SERVICE_NAME}" --platform=managed --region="${REGION}" --project="${PROJECT_ID}" --format='value(status.url)' 2>/dev/null || echo 'http://deployed-url')"

echo -e "\n${BOLD}${GREEN}==================================================================${RESET}"
echo -e "${BOLD}${GREEN}✓ Oracle AI Private Agent Factory deployed successfully!${RESET}"
echo -e "${BOLD}${GREEN}==================================================================${RESET}"
echo -e "Access Endpoint: ${BOLD}${CYAN}${SERVICE_URL}${RESET}"
echo -e "Health Check:    ${BOLD}${CYAN}${SERVICE_URL}/api/v1/health${RESET}"
echo -e "Agent Factory:   ${BOLD}${CYAN}${SERVICE_URL}/api/factory/agents${RESET}\n"

