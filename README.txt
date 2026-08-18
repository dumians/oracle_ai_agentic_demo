========================================
Applied AI agent_factory – README.txt file
========================================
This readme file will equip you with the knowledge needed to setup, manage and utilise Applied AI agent_factory. 




========================================
Applied AI agent_factory – User Guide
========================================

This guide will walk you through the setup and usage of the Applied AI agent_factory platform.

-------------------------------------------------------------
Prerequisites
-------------------------------------------------------------

Podman Setup (if facing issues as your user)
--------------------------------------------

If Podman is not working correctly due to storage locations pointing to your home directory, follow these steps:

1. Create graphroot and runroot directories:

   mkdir -p /scratch/podman_storage/storage/graphroot
   mkdir -p /scratch/podman_storage/storage/runroot

2. Create Podman config directory if it doesn't exist:

   mkdir -p ~/.config/containers

3. Edit/create `~/.config/containers/storage.conf` and add:

   [storage]
   driver = "overlay"
   graphroot = "/scratch/podman_storage/storage/graphroot"
   runroot = "/scratch/podman_storage/storage/runroot"

4. Update user ID mappings and migrate:

   sudo /sbin/usermod --add-subgids 10000-75535 <USERNAME>
   sudo /sbin/usermod --add-subuids 10000-75535 <USERNAME>

   podman system migrate

Optional: If /var/tmp does not have enough space (error shown during image pulls), use a different TMPDIR:

   mkdir /scratch/podman_tmp

Then edit `~/.config/containers/containers.conf`:

   [engine]
   env = ["TMPDIR=/scratch/podman_tmp"]

-------------------------------------------------------------
Podman Compose Setup
-------------------------------------------------------------

Install Podman Compose:

   sudo yum install podman-compose

If it fails due to missing EPEL repo, create `/etc/yum.repos.d/oracle-epel-ol8.repo` with the following content:

   [ol8_developer_EPEL]
   name=Oracle Linux $releasever EPEL Packages for Development ($basearch)
   baseurl=https://yum$ociregion.$ocidomain/repo/OracleLinux/OL8/developer/EPEL/$basearch/
   gpgkey=file:///etc/pki/rpm-gpg/RPM-GPG-KEY-oracle
   gpgcheck=1
   enabled=1

   [ol8_developer_EPEL_modular]
   name=Oracle Linux $releasever EPEL Modular Packages for Development ($basearch)
   baseurl=https://yum$ociregion.$ocidomain/repo/OracleLinux/OL8/developer/EPEL/modular/$basearch/
   gpgkey=file:///etc/pki/rpm-gpg/RPM-GPG-KEY-oracle
   gpgcheck=1
   enabled=1

-------------------------------------------------------------
Accessing Oracle Container Registry
-------------------------------------------------------------

1. Visit: https://container-registry.oracle.com/

2. Log in and generate your auth token.

3. (Oracle internal only) Set proxy:

   export https_proxy=http://www-proxy.us.oracle.com:80
   export http_proxy=http://www-proxy.us.oracle.com:80
   export HTTPS_PROXY=http://www-proxy.us.oracle.com:80
   export HTTP_PROXY=http://www-proxy.us.oracle.com:80

4. Authenticate:

   podman login container-registry.oracle.com

5. Test pull:

   podman pull container-registry.oracle.com/database/free:23.8.0.0

-------------------------------------------------------------
Creating Database User
-------------------------------------------------------------

You need to create runtime and read-only 23ai DB users for Applied AI Agent Factory. Run the following SQL as SYS user:

   CREATE USER <DB_USER> IDENTIFIED BY <DB_PASSWORD> DEFAULT TABLESPACE USERS QUOTA unlimited ON USERS;
   GRANT CREATE SESSION, CREATE TABLE, CREATE SEQUENCE, CREATE TRIGGER, CREATE TYPE, CREATE PROCEDURE, CREATE VIEW, CREATE SYNONYM TO <DB_USER>;
   GRANT READ, WRITE ON DIRECTORY DATA_PUMP_DIR TO <DB_USER>;
   CREATE USER AAI_RO_<DB_USER> IDENTIFIED BY <DB_PASSWORD> ACCOUNT UNLOCK;
   GRANT CREATE SESSION TO AAI_RO_<DB_USER>;
   exit

Important:
- The read-only user name must be `AAI_RO_<DB_USER>`.
- The read-only user password must match `<DB_PASSWORD>`.

-------------------------------------------------------------
Installation
-------------------------------------------------------------

You can install Applied AI agent_factory in either `prod` or `quickstart` mode.

From Source
-----------

1. Navigate to the staging location:

   cd <staging_location>

2. Untar the package:

   tar xzf applied_ai.tar.gz

3. Build images:

   make build

4. Bring up the containers:

   make install

5. Choose installation mode when prompted:

   For `prod` mode: type `prod`  
   For `quickstart` mode: type `quickstart`

6. Monitor installation logs:

   make logsaai

7. Once installation completes, access the app at:

   https://<hostname>:8080/agentFactory/installation  
   Or if local: https://localhost:8080/agentFactory/installation

-------------------------------------------------------------
UI-Based Installation Flow
-------------------------------------------------------------

Prod Mode
---------

1. Open the installation URL (mentioned above).  
2. Set up a username and password for login.  
3. Provide database connection details and click "Test Connection".  
4. If successful, click "Next" and then "Install" to create DB objects.  
5. You'll be redirected to the login page. Log in using the credentials you created.  
6. You'll reach the application home page and can start using Applied AI agent_factory.

Quickstart Mode
---------------

1. Open the installation URL (mentioned above).  
2. Set up a username and password for login.  
3. Click "Install" to register the admin user and complete the setup.  
4. You'll be redirected to the login page.  
5. Log in using your credentials to access the application home page.

-------------------------------------------------------------
You're now ready to use Applied AI agent_factory!
-------------------------------------------------------------




========================================
Applied AI agent_factory – Makefile
========================================

This Makefile is used to manage container lifecycles, image builds, and logs for the Applied AI agent_factory using Podman Compose.

To run a target:
    make <target_name>

Variables
---------
- PROJECT_NAME:         Default = applied-ai-agent_factory. Can be overridden on the command line (e.g., `make PROJECT_NAME=my-project up`).
- COMPOSE_FILE_PROD:    Default = podman-compose.yaml
- COMPOSE_FILE_QUICKSTART: Default = podman-compose-quickstart.yaml
- AAI_CONTAINER_NAME:   Default = oracle-applied-ai-label
- AGENT_FACTORY_CERT_FQDN:       Optional FQDN used when generating self-signed certificates.
- AGENT_FACTORY_CERT_IP_ADDRESS: Optional IP address used when generating self-signed certificates.

Targets
-------

1. all  
   - Default target. Runs `make install`.

2. install  
   - Prompts user for prod or quickstart mode, then deploys containers.  
   - If the input is `1`, `prod`, or `production`, it calls `make deploy` with `COMPOSE_FILE` set to `podman-compose.yaml`.
   - If the input is `2`, `quick`, or `quickstart`, it calls `make deploy` with `COMPOSE_FILE` set to `podman-compose-quickstart.yaml`.

3. deploy  
   - Starts containers using the selected compose file.  
   - Command: `make deploy`
   - Runs: podman-compose -f $(COMPOSE_FILE) -p $(PROJECT_NAME) up -d

4. down  
   - Stops and removes containers (uses quickstart compose file).  
   - Command: `make down`
   - Runs: podman-compose -f $(COMPOSE_FILE_QUICKSTART) -p $(PROJECT_NAME) down

5. start
   - Starts previously stopped containers defined in the active Podman Compose file for the project. 
   - Ensures that the cron daemon inside the container named $(AAI_CONTAINER_NAME) is started.
   - Command: `make start`
   - Runs: podman-compose -f $(COMPOSE_FILE_ACTIVE) -p $(PROJECT_NAME) start
           podman exec -u 0 $(AAI_CONTAINER_NAME) crond start

6. stop
   - Stops all running containers defined in the active Podman Compose file without removing them.
   - Runs: podman-compose -f $(COMPOSE_FILE_ACTIVE) -p $(PROJECT_NAME) stop

7. restart  
   - Stops and restarts the app (first runs 'stop' and then 'start')
   - Command: `make restart`
   - Runs: 'make stop' followed by 'make start'

8. clean  
   - Stops app and removes built images.  
   - Command: `make clean`
   - Runs: podman image rm $(PROJECT_NAME) || true

9. buildaai  
   - Builds the AAI image.  
   - Command: `make buildaai`
   - Runs: sh build-image.sh aai

10. build23ai  
   - Builds the 23AI database image.  
   - Command: `make build23ai`
   - Runs: sh build-image.sh db23aifree

11. build  
    - Builds all images: AAI and 23AI.  
    - Command: `make build`
    - Runs: `make buildaai` and `make build23ai` sequentially

12. diagnose  
    - Runs diagnostic script.  
    - Command: `make diagnose`
    - Runs: sh diagnose.sh

13. logs  
    - Shows logs for all quickstart containers.  
    - Command: `make logs`
    - Runs: podman-compose -f $(COMPOSE_FILE_QUICKSTART) -p $(PROJECT_NAME) logs -f

14. logsaai  
    - Shows logs for AAI container only.  
    - Command: `make logsaai`
    - Runs: podman logs -f $(AAI_CONTAINER_NAME)

15. certificates
    - Regenerates the application self-signed TLS certificate inside the running AAI container.
    - Optional inputs:
      - FQDN: Fully qualified domain name to include in the certificate.
      - IP_ADDRESS: IP address to include in the certificate.
    - If FQDN and/or IP_ADDRESS are provided on the command line, non-empty values are persisted to `.env` as AGENT_FACTORY_CERT_FQDN and AGENT_FACTORY_CERT_IP_ADDRESS.
    - If no command-line inputs are provided, the target uses AGENT_FACTORY_CERT_FQDN and AGENT_FACTORY_CERT_IP_ADDRESS from `.env` or the current environment.
    - Generated certificates always include DNS:localhost and IP:127.0.0.1.
    - If only an IP address is configured, the generated certificate keeps the configured identity IP-only, plus localhost entries.
    - Command examples:
      make certificates FQDN=myhost.example.com IP_ADDRESS=10.0.0.10
      make certificates FQDN=myhost.example.com
      make certificates IP_ADDRESS=10.0.0.10
      make certificates
    - Note: The generated certificate is self-signed. Browsers will still report an untrusted/self-signed certificate until the certificate is trusted by the client or replaced with a CA-signed certificate.

16. install-certificates
    - Installs an existing certificate and private key into the running AAI container using the built-in certificate import command.
    - Use this target when you have a CA-signed certificate or another certificate/key pair that should replace the generated self-signed certificate.
    - CERT_FILE should point to the certificate file. When using a CA-signed certificate, provide the full certificate chain when available.
    - KEY_FILE should point to the matching private key file.
    - Command:
      make install-certificates CERT_FILE=/path/fullchain.pem KEY_FILE=/path/key.pem
