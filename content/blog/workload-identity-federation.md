---
title: Workload Identity Federation
slug: workload-identity-federation
author: site-team
summary: "Playbook for configuring workload identity federation with JWKS generation,\
  / Google Cloud providers, service accounts, and GitHub Actions integration."
tags:
- identity
publishedAt: 2025-02-06
updatedAt: 2025-02-06
readingMinutes: 5
---

## 1. Key & JWKS Generation

To create **pri** and **pub** JSON keys

```
# **Create public & private keys**
$ python api/jwks_auth/main.py --help
usage: main.py [-h] [--create] [--stdout] [--save_public SAVE_PUBLIC] [--save_private SAVE_PRIVATE]

options:
  -h, --help            show this help message and exit
  --create              Generate JWKS
  --stdout              Print output to STDOUT
  --save_public SAVE_PUBLIC
                        File path to save public JWKS
  --save_private SAVE_PRIVATE
                        File path to save private JWKS

$ python api/jwks_auth/main.py --create --save_public api/prd-pub.json --save_private api/prd-pri.json --stdout
[*] Creating JWKS...
[*] JWKS Public JSON:
{
    "keys": [
        {
            "e": "AQAB",
            "kty": "RSA",
            "n": "<omitted>"
        }
    ]
}
[*] JWKS Private JSON:
{
    "keys": [
        {
            "d": "<omitted>",
            "dp": "<omitted>",
            "dq": "<omitted>",
            "e": "AQAB",
            "kty": "RSA",
            "n": "<omitted>",
            "p": "<omitted>",
            "q": "<omitted>",
            "qi": "<omitted>"
        }
    ]
}
[*] JWKS Public JSON:
{
    "keys": [
        {
            "e": "AQAB",
            "kty": "RSA",
            "n": "<omitted>"
        }
    ]
}
JWKS (public) JSON file saved successfully to prd-pub.json.
[*] JWKS Private JSON:
{
    "keys": [
        {
            "d": "<omitted>",
            "dp": "<omitted>",
            "dq": "<omitted>",
            "e": "AQAB",
            "kty": "RSA",
            "n": "<omitted>",
            "p": "<omitted>",
            "q": "<omitted>",
            "qi": "<omitted>"
        }
    ]
}
JWKS (private) JSON file saved successfully to prd-pri.json.
```


---

## 2. Configure Workload Identity Federation in Google Cloud

Set up the identity federation configuration in the Google Cloud Console:

### a. Create a Workload Identity Pool

1. **Navigate to IAM & Admin > Workload Identity Pools:**  
   In the GCP Console, go to **IAM & Admin** and select **Workload Identity Pools**.
2. **Create a New Pool:**  
   Provide a name (e.g., `pool-0`) and description. Note your pool’s resource name (it will look like `projects/123456789/locations/global/workloadIdentityPools/pool-0`).

### b. Create a Workload Identity Provider

1. **Within your pool, add a new provider:**  
   Select the provider type (OIDC for JWT-based tokens) and configure the details of your external identity provider (e.g., the issuer URL).
   - **NOTE:** The issuer URL does not have to be externally accessible, "https://example.internal/.well-known/jwks.json" can be used as a default value.
3. **Set up attribute mapping:**  
   Map external identity attributes (e.g., the subject) to Google Cloud attributes. This mapping is used when you impersonate a service account.
   - **NOTE:** In you claims JSON, `"sub"` matches pool ID `"pool-0"`
5. **Record the Provider Resource Name:**  
   If your Provide ID is "pool-0", it will look similar to:  

```
//iam.googleapis.com/projects/123456789/locations/global/workloadIdentityPools/pool-0/providers/pool-0
   ```

### c. Enable Service Account Impersonation

1. **Create (or select) a service account:**  
   Ensure it has the necessary BigQuery permissions.
   - **NOTE:** A default SA should be created by the WIP
3. **Allow the Identity Pool to Impersonate the Service Account:**  
   In the IAM section, grant the `roles/iam.workloadIdentityUser` role on the service account to the identity pool. This allows federated credentials to impersonate the service account.
   - **NOTE:** The default SA should have the correct permissions and roles.  Be sure that role `workloadIdentityUser` is assigned along with the following permissions:

```
BigQuery Data Viewer
BigQuery Job User
BigQuery Metadata Viewer
```


---

## 3. Create an External Credentials File

Instead of a service account key, you create a JSON “external account” credentials file that instructs the Google authentication library how to exchange your external token for GCP credentials.

### Sample `clientLibraryConfig-pool-0.json` File

```json
{
  "type": "external_account",
  "audience": "//iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL_ID}/providers/${PROVIDER_ID}",
  "subject_token_type": "urn:ietf:params:oauth:token-type:jwt",
  "token_url": "https://sts.googleapis.com/v1/token",
  "credential_source": {
    "file": "/opt/example-lwt.json"  // This file should contain your external identity token (e.g., a JWT)
  },
  "service_account_impersonation_url": "https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${SERVICE_ACCOUNT_EMAIL}:generateAccessToken"
}
```

- **audience:** Use the provider resource name from your Workload Identity Provider.
- **credential_source:** Retrieve your external token JSON file.
- **service_account_impersonation_url:** Points to the connected service account.

---

## 4. Using the BigQuery Test Client with Federated Credentials

With your environment set up, test the BigQuery connection by listing the tables in the `your_dataset` dataset of the target project ID's BigQuery instance.

```bash
# **CD from repo root**
$ cd your-repo/analytics_cluster/analytics_api

# **Assuming your virtual env is already setup with requirements installed**
$ source venv/bin/activate

# **Generate a new LWT with the private key and claims JSON**
$ python api/jwks_auth/payload.py --files api/prod-pri.json api/prod-claims.json --save_lwt /opt/lwt.json
JWT Token:
<example-jwt-token>
JWT Claims:
{"aud":"//iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL_ID}/providers/${PROVIDER_ID}","iss":"https://example.internal/.well-known/jwks.json","sub":"${SUBJECT_ATTRIBUTE_VALUE}"}
LWT JSON saved to /opt/lwt.json
Generated LWT JSON:
{
    "access_token": "<example-access-token>"
}

# **Validate the LWT (Optional)**
$ python api/jwks_auth/payload.py --validate api/prod-pub.json /opt/lwt.json
Validated JWT Claims from external files:
{"aud":"//iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL_ID}/providers/${PROVIDER_ID}","exp":"<example-expiration>","iat":"<example-issued-at>","iss":"https://example.internal/.well-known/jwks.json","sub":"${SUBJECT_ATTRIBUTE_VALUE}"}

# **Test query the dataset**
$ python api/test_bq_conn.py --dataset your_dataset --creds api/clientLibraryConfig-pool-0.json
Tables in dataset 'your_dataset':
- example_table_one
- example_table_two
- example_table_three
```

---

## 1. Key & JWKS Generation

To create **pri** and **pub** JSON keys

```########################################
### CREATE PUBLIC & PRIVATE KEY JSON ###
########################################

$ python jwks_auth/main.py --help
usage: main.py [-h] [--create] [--stdout] [--save_public SAVE_PUBLIC] [--save_private SAVE_PRIVATE]

options:
  -h, --help            show this help message and exit
  --create              Generate JWKS
  --stdout              Print output to STDOUT
  --save_public SAVE_PUBLIC
                        File path to save public JWKS
  --save_private SAVE_PRIVATE
                        File path to save private JWKS

$ python jwks_auth/main.py --create --save_public prd-pub.json --save_private prd-pri.json --stdout
[*] Creating JWKS...
[*] JWKS Public JSON:
{
    "keys": [
        {
            "e": "AQAB",
            "kty": "RSA",
            "n": "<omitted>"
        }
    ]
}
[*] JWKS Private JSON:
{
    "keys": [
        {
            "d": "<omitted>",
            "dp": "<omitted>",
            "dq": "<omitted>",
            "e": "AQAB",
            "kty": "RSA",
            "n": "<omitted>",
            "p": "<omitted>",
            "q": "<omitted>",
            "qi": "<omitted>"
        }
    ]
}
[*] JWKS Public JSON:
{
    "keys": [
        {
            "e": "AQAB",
            "kty": "RSA",
            "n": "<omitted>"
        }
    ]
}
JWKS (public) JSON file saved successfully to prd-pub.json.
[*] JWKS Private JSON:
{
    "keys": [
        {
            "d": "<omitted>",
            "dp": "<omitted>",
            "dq": "<omitted>",
            "e": "AQAB",
            "kty": "RSA",
            "n": "<omitted>",
            "p": "<omitted>",
            "q": "<omitted>",
            "qi": "<omitted>"
        }
    ]
}
JWKS (private) JSON file saved successfully to prd-pri.json.


#######################
### CREATE LWT JSON ###
#######################

$ python jwks_auth/payload.py --files prd-pri.json prd-claims.json --save_lwt /opt/lwt.json
JWT Token:
<example-jwt-token>
JWT Claims:
{"aud":"https://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/pool-0/providers/pool-0","iss":"https://example.internal/.well-known/jwks.json","sub":"${SERVICE_ACCOUNT_SUBJECT}"}
LWT JSON saved to /opt/lwt.json
Generated LWT JSON:
{
    "access_token": "<example-access-token>"
}


#############################
### TEST TOKEN VALIDATION ###
#############################

$ python jwks_auth/payload.py --validate prd-pub.json /opt/lwt.json
Validated JWT Claims from external files:
{"aud":"https://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/pool-0/providers/pool-0","exp":"<example-expiration>","iat":"<example-issued-at>","iss":"https://example.internal/.well-known/jwks.json","sub":"${SERVICE_ACCOUNT_SUBJECT}"}

```


### NOTES

```
# DEV
principal://iam.googleapis.com/projects/${PROJECT_NUMBER_DEV}/locations/global/workloadIdentityPools/pool-0/subject/${SERVICE_ACCOUNT_NAME_DEV}

# PRD
principal://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/pool-0/subject/${SERVICE_ACCOUNT_NAME_PROD}

principal://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/pool-0/subject/SUBJECT_ATTRIBUTE_VALUE

principal://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/pool-0/subject/pool-0
```

Example Analytics Pool

```ID
pool-0
Description
Example analytics WIF
Status
IAM principal 
principal://iam.googleapis.com/projects/${PROJECT_NUMBER_DEV}/locations/global/workloadIdentityPools/pool-0/subject/SUBJECT_ATTRIBUTE_VALUE 
Logs 
View
```

Providers

```
example-oidc-provider	OIDC
```

Provider Details

```example-oidc-provider
```

Issuer URL

```
https://example.internal/.well-known/jwks.json
```

**NOTE:** Record the resulting IAM principal, grant to SA with `roles/iam.workloadIdentityUser`

```
principal://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/pool-0/subject/SUBJECT_ATTRIBUTE_VALUE
```

Audiences
Default Audiences

```
# DEV
https://iam.googleapis.com/projects/${PROJECT_NUMBER_DEV}/locations/global/workloadIdentityPools/pool-0/providers/example-jwt-provider

# PRD
https://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/pool-0/providers/example-oidc-provider
```

OIDC 1

```assertion.sub
```

SA Permissions/Roles

```
# DEV
${SERVICE_ACCOUNT_NAME_DEV}@${PROJECT_ID_DEV}.iam.gserviceaccount.com
${SERVICE_ACCOUNT_NAME_DEV}
BigQuery Data Viewer
BigQuery Job User
BigQuery Metadata Viewer

# PRD
${SERVICE_ACCOUNT_NAME_PROD}@${PROJECT_ID_PROD}.iam.gserviceaccount.com
${SERVICE_ACCOUNT_NAME_PROD}	
BigQuery Data Viewer
BigQuery Job User
BigQuery Metadata Viewer
```

Service Account must be granted access to IAM WIP principal (from pool creation) with `roles/iam.workloadIdentityUser`

Create a `claims.json` with your SA, issue, and audience (without `https:`)

```
{
  "sub": "${SERVICE_ACCOUNT_SUBJECT}",
  "iss": "https://example.internal/.well-known/jwks.json",
  "aud": "//iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/pool-0/providers/example-oidc-provider"
}
```

---

## 2. Configure Workload Identity Federation in Google Cloud

Before writing any code, you need to set up your identity federation configuration in the Google Cloud Console:

### a. Create a Workload Identity Pool

1. **Navigate to IAM & Admin > Workload Identity Pools:**  
   In the GCP Console, go to **IAM & Admin** and select **Workload Identity Pools**.
2. **Create a New Pool:**  
   Provide a name (e.g., `pool-0`) and description. Note your pool’s resource name (it will look like `projects/123456789/locations/global/workloadIdentityPools/pool-0`).

### b. Create a Workload Identity Provider

1. **Within your pool, add a new provider:**  
   Select the provider type (for example, OIDC for JWT-based tokens) and configure the details of your external identity provider (e.g., the issuer URL).
2. **Set up attribute mapping:**  
   Map external identity attributes (like email or subject) to Google Cloud attributes. This mapping is used when you impersonate a service account.
3. **Record the Provider Resource Name:**  
   It will look similar to:  

```
//iam.googleapis.com/projects/123456789/locations/global/workloadIdentityPools/pool-0/providers/my-provider
   ```

### c. Enable Service Account Impersonation

1. **Create (or select) a service account:**  
   Ensure it has the necessary BigQuery permissions.
2. **Allow the Identity Pool to Impersonate the Service Account:**  
   In the IAM section, grant the `roles/iam.workloadIdentityUser` role on the service account to the identity pool. This allows federated credentials to impersonate the service account.

*For additional details, refer to the [Workload Identity Federation documentation](https://cloud.google.com/docs/authentication/workload-identity-federation) citeturn0doc1.*

---

## 3. Create an External Credentials File

Instead of a service account key, you create a JSON file (often called an “external account” credentials file) that instructs the Google authentication library how to exchange your external token for GCP credentials.

### Sample `clientLibraryConfig-pool-0.json` File

```json
{
  "type": "external_account",
  "audience": "//iam.googleapis.com/projects/123456789/locations/global/workloadIdentityPools/pool-0/providers/my-provider",
  "subject_token_type": "urn:ietf:params:oauth:token-type:jwt",
  "token_url": "https://sts.googleapis.com/v1/token",
  "credential_source": {
    "file": "/path/to/external/token"  // This file should contain your external identity token (e.g., a JWT)
  },
  "service_account_impersonation_url": "https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/my-service-account@my-project.iam.gserviceaccount.com:generateAccessToken"
}
```

- **audience:** Use the provider resource name from your Workload Identity Provider.
- **credential_source:** Configure how to retrieve your external token. This might be a file, a command, or another source.
- **service_account_impersonation_url:** Points to the service account you wish to impersonate.

*More on external account configuration can be found in the [External Account Credentials documentation](https://cloud.google.com/docs/authentication/external-account) citeturn0doc2.*

### NOTES

External Credentials File **clientLibraryConfig-example-jwt-provider.json**

```
{
  "universe_domain": "googleapis.com",
  "type": "external_account",
  "audience": "//iam.googleapis.com/projects/${PROJECT_NUMBER_DEV}/locations/global/workloadIdentityPools/pool-0/providers/example-jwt-provider",
  "subject_token_type": "urn:ietf:params:oauth:token-type:jwt",
  "token_url": "https://sts.googleapis.com/v1/token",
  "service_account_impersonation_url": "https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${SERVICE_ACCOUNT_NAME_DEV}@${PROJECT_ID_DEV}.iam.gserviceaccount.com:generateAccessToken",
  "credential_source": {
    "file": "/opt/lwt.json",
    "format": {
      "type": "json",
      "subject_token_field_name": "access_token"
    }
  }
}
```

---

## 4. Set the Environment Variable

Tell the Google Cloud client libraries where to find your external account credentials by setting the environment variable:

```bash
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/clientLibraryConfig-pool-0.json"
```

This step ensures that when you create a BigQuery client, it will automatically load and use the federated credentials.

### NOTES

```
# **NOTE:** for BQ federated identity auth
GCP_PROJECT="${PROJECT_ID_DEV}"
GCP_BQ_DATASET="${BQ_DATASET_ID}"
GCP_CLIENT_CONF="/app/api/clientLibraryConfig-example.json"
GCP_PRI_KEY="/app/api/pri.json"
GCP_CLAIMS_FILE="/app/api/claims.json"
GCP_PUB_KEY="/app/api/pub.json"
```

---

## 5. Using the BigQuery Python Client with Federated Credentials

With your environment set up, your Python code remains almost identical to using any other form of credentials. The `google-cloud-bigquery` library leverages the credentials provided via the environment variable.

### Sample Code

```python
from google.cloud import bigquery

# The client automatically picks up the federated credentials from the environment.
client = bigquery.Client()

query = """
    SELECT name, SUM(number) as total
    FROM `bigquery-public-data.usa_names.usa_1910_2013`
    GROUP BY name
    ORDER BY total DESC
    LIMIT 10
"""

query_job = client.query(query)
results = query_job.result()

print("Top 10 Names by Total Count:")
for row in results:
    print(f"{row.name}: {row.total}")
```

When this script runs, the BigQuery client:
- Reads the JSON credentials file specified by `GOOGLE_APPLICATION_CREDENTIALS`.
- Uses the external token (provided via your `credential_source`) and exchanges it for short-lived Google Cloud credentials via the Security Token Service (STS).
- Impersonates the designated service account and accesses BigQuery as allowed by the service account’s permissions.
