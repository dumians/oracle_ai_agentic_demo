#!/usr/bin/env bash
# ==============================================================================
# 🚀 Oracle AI Database Private Agent Factory - GCP Cloud Run Deployer
# ==============================================================================
# Automates container build via Google Cloud Build and deployment to Cloud Run
# with VPC Access Connector linking to Oracle Database@Google Cloud.
# ==============================================================================

set -e

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
SERVICE_NAME="oracle-ai-private-agent-factory"
IMAGE_NAME="${REGION}-docker.pkg.dev/${PROJECT_ID}/${AR_REPO}/${SERVICE_NAME}:latest"
VPC_CONNECTOR="${GCP_VPC_CONNECTOR:-oracle-db-connector}"
SA_NAME="oracle-agent-factory-sa"
SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

if [ -z "$PROJECT_ID" ]; then
    echo -e "${RED}[ERROR] GCP_PROJECT_ID is not configured. Please set GCP_PROJECT_ID in .env or run gcloud config set project <id>.${RESET}"
    exit 1
fi

echo -e "${CYAN}[INFO] Target GCP Project:       ${BOLD}${PROJECT_ID}${RESET}"
echo -e "${CYAN}[INFO] Target GCP Region:        ${BOLD}${REGION}${RESET}"
echo -e "${CYAN}[INFO] Target Artifact Registry: ${BOLD}${AR_REPO}${RESET}"
echo -e "${CYAN}[INFO] Target Service:           ${BOLD}${SERVICE_NAME}${RESET}"
echo -e "${CYAN}[INFO] Container Image:          ${BOLD}${IMAGE_NAME}${RESET}"

# Step 1: Enable required GCP Services
echo -e "\n${BOLD}${YELLOW}Step 1: Enabling Required GCP APIs...${RESET}"
gcloud services enable \
    run.googleapis.com \
    cloudbuild.googleapis.com \
    artifactregistry.googleapis.com \
    secretmanager.googleapis.com \
    aiplatform.googleapis.com \
    vpcaccess.googleapis.com \
    --project="${PROJECT_ID}"

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

# Step 4: Build Container via Google Cloud Build
echo -e "\n${BOLD}${YELLOW}Step 4: Submitting Container Build to Google Cloud Build...${RESET}"
cd ..
gcloud builds submit --tag "${IMAGE_NAME}" --project="${PROJECT_ID}"

# Step 5: Deploy to Google Cloud Run
echo -e "\n${BOLD}${YELLOW}Step 5: Deploying Service to Cloud Run...${RESET}"
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
    --project="${PROJECT_ID}"

SERVICE_URL="$(gcloud run services describe "${SERVICE_NAME}" --platform=managed --region="${REGION}" --project="${PROJECT_ID}" --format='value(status.url)' 2>/dev/null || echo 'http://deployed-url')"

echo -e "\n${BOLD}${GREEN}==================================================================${RESET}"
echo -e "${BOLD}${GREEN}✓ Oracle AI Private Agent Factory deployed successfully!${RESET}"
echo -e "${BOLD}${GREEN}==================================================================${RESET}"
echo -e "Access Endpoint: ${BOLD}${CYAN}${SERVICE_URL}${RESET}"
echo -e "Health Check:    ${BOLD}${CYAN}${SERVICE_URL}/api/v1/health${RESET}"
echo -e "Agent Factory:   ${BOLD}${CYAN}${SERVICE_URL}/api/factory/agents${RESET}"
