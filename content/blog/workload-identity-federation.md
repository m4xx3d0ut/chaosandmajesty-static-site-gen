---
title: Workload Identity Federation
slug: workload-identity-federation
author: m4xx3d0ut
summary: Playbook for configuring workload identity federation with JWKS generation,
  Google Cloud providers, service accounts, and GitHub Actions integration.
tags:
- m4xx3d
publishedAt: 2025-02-06
updatedAt: 2025-02-06
readingMinutes: 5
---
# Workload Identity Federation

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
            "n": "yY2lgcZ2QvRu7hKwB63MOW0EsYf84X-MbzR_PRAtyZhSXIevwSTE1z98mK29wvbq1NRO2FDYs7A9lgBt1azJoMxt-M8Ya7Ox5t4eny_gsUzzh89iyfOHDR7Lss81Kg9dvRRoV8lbvNmmuEIu-capuJ7-FqVy_t-hGRetm9qjFm5Pqy05wAvKvrmssKAbowfC1heo6FJtKQf7XFI78iOl9QbPfgNHUBP8ZBhjMvcjezxQpVbi8e1BtZGHfASWJg52Gr2l0B26fKtGtzInsw2OKkf9xzRPtQOVxNIBzG5FHWgwlHnJCtv21mcL5k0fmUzkbZTFiRTH-TUzcK8oqYXqhQ"
        }
    ]
}
[*] JWKS Private JSON:
{
    "keys": [
        {
            "d": "ErEL6wnacFGmUvZRNFkaEi5Jy-QCX_A5-BssfJ96O5KgervLoRQVnCejWK5uJX1MIGIzEK0It7tNrtJJ3VHJnhuvTC56g4x14GTzfoxMYGz0PcFOFk_7E4yqU-IS-lxT82PH3HJMS2p842Qh4qCZn0lBY5zC2h-nm0HepBBF5R-6F4HXbGQrW50lo_4ck85uFCLkH19q8J20_ffnLS2hvLWT62hUPb3tsjNpf4n5Ji0PpUUczmuvH2w8sP7sNOofu8juvIe97BITRSaJ2HLyNqrCXlSAvJXOkIFaqdWN5wmmII06XI0eruhrpbtEUVe7UOUucZ0MzjddaYM1K2bVIQ",
            "dp": "Is_jhC1KQRtFlZEqxa_9QtQMxIovlO56CyBIj0tOgHBrGlgH35IXWe5rM4HE_t0eZMPM_xUXOnwrtsU8VoBF_PD7YTHorB3M_Tkb9Sp9lxenGRbemsr5b3sufo-ANw233boJtaqUqeOHT_RDL8ySQ3kdKohR30b4Tc2d2_xCSQU",
            "dq": "BKav1gED28fY5ph_geT38Jumq_lDs4VZva2p6V9HOdoJBjew7GXo1ef5nEw-rtOPE8kia_P5sSOJ5Amiii10bQs_NMLTKkJg1xUEXSXMwOWQN6KgIeY-sopKCg4Z3IP_Ve8W0Wixaeux1-dwtwTTgzH-tmt9ZPKrUh548dCBHgE",
            "e": "AQAB",
            "kty": "RSA",
            "n": "yY2lgcZ2QvRu7hKwB63MOW0EsYf84X-MbzR_PRAtyZhSXIevwSTE1z98mK29wvbq1NRO2FDYs7A9lgBt1azJoMxt-M8Ya7Ox5t4eny_gsUzzh89iyfOHDR7Lss81Kg9dvRRoV8lbvNmmuEIu-capuJ7-FqVy_t-hGRetm9qjFm5Pqy05wAvKvrmssKAbowfC1heo6FJtKQf7XFI78iOl9QbPfgNHUBP8ZBhjMvcjezxQpVbi8e1BtZGHfASWJg52Gr2l0B26fKtGtzInsw2OKkf9xzRPtQOVxNIBzG5FHWgwlHnJCtv21mcL5k0fmUzkbZTFiRTH-TUzcK8oqYXqhQ",
            "p": "8Qst5oskOgezNYveifXbIUa3jpcyM9LbnGv2k4LETOR7FaQnelUrP7CDLQ89thxTP2Bcr9yvXIL3j0sxke9oB1Q0vxhPyhS_d2pMtnimb6EtpfyVc-KUOt75lTffgSXPPwtDa5LmuUb6EA3u2pZiEtyqthEM8dK2Q4HX9avWRiU",
            "q": "1g8wTdDfyJOJyZmL74vV20CW8ZtEdK736lHnYJLN3bW7AwFIpS72nlkU5yo-ZRPCChsA6iOIHEQj4P5OWSrlH5TmHSEQu_Z9YtnJvMsg2CWX8iEJcVOF5Nn955NmlTAnLb1CPzFoBTukmh5QQydJWiic1rAleNIGnRYfsSjL9OE",
            "qi": "wVFX_l61o3_U45Gi_kSdqpTFxztXYDG22gvMN1dChBf2sNJHNXCyjp7xNfA4Dts_aYdTKnkuG8FXWKLbB1dyYwHt1JGmMOSW0Ki2QygTqHjH2z0MjDynqm4K5VPfWBjm_jMOoiJsYwjqYg3Rqibb26CwUyVLvCOYawm26c9WvaI"
        }
    ]
}
[*] JWKS Public JSON:
{
    "keys": [
        {
            "e": "AQAB",
            "kty": "RSA",
            "n": "yY2lgcZ2QvRu7hKwB63MOW0EsYf84X-MbzR_PRAtyZhSXIevwSTE1z98mK29wvbq1NRO2FDYs7A9lgBt1azJoMxt-M8Ya7Ox5t4eny_gsUzzh89iyfOHDR7Lss81Kg9dvRRoV8lbvNmmuEIu-capuJ7-FqVy_t-hGRetm9qjFm5Pqy05wAvKvrmssKAbowfC1heo6FJtKQf7XFI78iOl9QbPfgNHUBP8ZBhjMvcjezxQpVbi8e1BtZGHfASWJg52Gr2l0B26fKtGtzInsw2OKkf9xzRPtQOVxNIBzG5FHWgwlHnJCtv21mcL5k0fmUzkbZTFiRTH-TUzcK8oqYXqhQ"
        }
    ]
}
JWKS (public) JSON file saved successfully to prd-pub.json.
[*] JWKS Private JSON:
{
    "keys": [
        {
            "d": "ErEL6wnacFGmUvZRNFkaEi5Jy-QCX_A5-BssfJ96O5KgervLoRQVnCejWK5uJX1MIGIzEK0It7tNrtJJ3VHJnhuvTC56g4x14GTzfoxMYGz0PcFOFk_7E4yqU-IS-lxT82PH3HJMS2p842Qh4qCZn0lBY5zC2h-nm0HepBBF5R-6F4HXbGQrW50lo_4ck85uFCLkH19q8J20_ffnLS2hvLWT62hUPb3tsjNpf4n5Ji0PpUUczmuvH2w8sP7sNOofu8juvIe97BITRSaJ2HLyNqrCXlSAvJXOkIFaqdWN5wmmII06XI0eruhrpbtEUVe7UOUucZ0MzjddaYM1K2bVIQ",
            "dp": "Is_jhC1KQRtFlZEqxa_9QtQMxIovlO56CyBIj0tOgHBrGlgH35IXWe5rM4HE_t0eZMPM_xUXOnwrtsU8VoBF_PD7YTHorB3M_Tkb9Sp9lxenGRbemsr5b3sufo-ANw233boJtaqUqeOHT_RDL8ySQ3kdKohR30b4Tc2d2_xCSQU",
            "dq": "BKav1gED28fY5ph_geT38Jumq_lDs4VZva2p6V9HOdoJBjew7GXo1ef5nEw-rtOPE8kia_P5sSOJ5Amiii10bQs_NMLTKkJg1xUEXSXMwOWQN6KgIeY-sopKCg4Z3IP_Ve8W0Wixaeux1-dwtwTTgzH-tmt9ZPKrUh548dCBHgE",
            "e": "AQAB",
            "kty": "RSA",
            "n": "yY2lgcZ2QvRu7hKwB63MOW0EsYf84X-MbzR_PRAtyZhSXIevwSTE1z98mK29wvbq1NRO2FDYs7A9lgBt1azJoMxt-M8Ya7Ox5t4eny_gsUzzh89iyfOHDR7Lss81Kg9dvRRoV8lbvNmmuEIu-capuJ7-FqVy_t-hGRetm9qjFm5Pqy05wAvKvrmssKAbowfC1heo6FJtKQf7XFI78iOl9QbPfgNHUBP8ZBhjMvcjezxQpVbi8e1BtZGHfASWJg52Gr2l0B26fKtGtzInsw2OKkf9xzRPtQOVxNIBzG5FHWgwlHnJCtv21mcL5k0fmUzkbZTFiRTH-TUzcK8oqYXqhQ",
            "p": "8Qst5oskOgezNYveifXbIUa3jpcyM9LbnGv2k4LETOR7FaQnelUrP7CDLQ89thxTP2Bcr9yvXIL3j0sxke9oB1Q0vxhPyhS_d2pMtnimb6EtpfyVc-KUOt75lTffgSXPPwtDa5LmuUb6EA3u2pZiEtyqthEM8dK2Q4HX9avWRiU",
            "q": "1g8wTdDfyJOJyZmL74vV20CW8ZtEdK736lHnYJLN3bW7AwFIpS72nlkU5yo-ZRPCChsA6iOIHEQj4P5OWSrlH5TmHSEQu_Z9YtnJvMsg2CWX8iEJcVOF5Nn955NmlTAnLb1CPzFoBTukmh5QQydJWiic1rAleNIGnRYfsSjL9OE",
            "qi": "wVFX_l61o3_U45Gi_kSdqpTFxztXYDG22gvMN1dChBf2sNJHNXCyjp7xNfA4Dts_aYdTKnkuG8FXWKLbB1dyYwHt1JGmMOSW0Ki2QygTqHjH2z0MjDynqm4K5VPfWBjm_jMOoiJsYwjqYg3Rqibb26CwUyVLvCOYawm26c9WvaI"
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
   - **NOTE:** The issuer URL does not have to be externally accessible, "https://yourdomain/.well-known/jwks.json" can be used as a default value.
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
  "audience": "//iam.googleapis.com/projects/164926465179/locations/global/workloadIdentityPools/pool-0/providers/pool-0",
  "subject_token_type": "urn:ietf:params:oauth:token-type:jwt",
  "token_url": "https://sts.googleapis.com/v1/token",
  "credential_source": {
    "file": "/opt/lwt.json"  // This file should contain your external identity token (e.g., a JWT)
  },
  "service_account_impersonation_url": "https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/prod-sa@prd.iam.gserviceaccount.com:generateAccessToken"
}
```

- **audience:** Use the provider resource name from your Workload Identity Provider.
- **credential_source:** Retrieve your external token JSON file.
- **service_account_impersonation_url:** Points to the connected service account.

---

## 4. Using the BigQuery Test Client with Federated Credentials

With your environment set up, test the BigQuery connection by listing the tables in the `event_logs` dataset of the target project ID's BigQuery instance.

```bash
# **CD from repo root**
$ cd console-data-vis-stack/analytics_cluster/analytics_api

# **Assuming your virtual env is already setup with requirements installed**
$ source venv/bin/activate

# **Generate a new LWT with the private key and claims JSON**
$ python api/jwks_auth/payload.py --files api/prd-pri.json api/prd-claims.json --save_lwt /opt/lwt.json
JWT Token:
eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJhdWQiOiIvL2lhbS5nb29nbGVhcGlzLmNvbS9wcm9qZWN0cy8xNjQ5MjY0NjUxNzkvbG9jYXRpb25zL2dsb2JhbC93b3JrbG9hZElkZW50aXR5UG9vbHMvaXItYW5hbHl0aWNzLXBvb2wtMC9wcm92aWRlcnMvaXItYW5hbHl0aWNzLXBvb2wtMCIsImlzcyI6Imh0dHBzOi8vaXItYW5hbHl0aWNzLWVudHJ5LnRoZWluZmluaXRlcmVhbGl0eS5pby8ud2VsbC1rbm93bi9qd2tzLmpzb24iLCJzdWIiOiJpci1hbmFseXRpY3MtcG9vbC0wIn0.On2MENhvc3kR8jlfn2ZCXFvdXdgIqlHnH8y3MABHw5MhTWO7OYXyOj8CzJbelHH1idbHZipLix40QK6I1mS_vAbid3EeUW7SgtMpTrt9Qp2igoM2_URnFN0NZbTDzxKjLodgAhjU7b4JGOYMbDUddJrfx9PMAaEn13d1QiA98zbBg1vAjiK7Vcv-EEeiy33079ihuOHV3H94CDCuLlPdiAPiSAF9ovbRxqf5bwmOgXAUG0bvBiazIruuUVAdGSAGSQbLIAdiPaggr5Aj7I-Ps0fCO1h1ln9Bxhv_WEb1hXoPL7iUhG4yY5UWISLL0hLQkvupNrRDVnhmwwmQ_meiYQ
JWT Claims:
{"aud":"//iam.googleapis.com/projects/164926465179/locations/global/workloadIdentityPools/pool-0/providers/pool-0","iss":"https://yourdomain/.well-known/jwks.json","sub":"pool-0"}
LWT JSON saved to /opt/lwt.json
Generated LWT JSON:
{
    "access_token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJhdWQiOiIvL2lhbS5nb29nbGVhcGlzLmNvbS9wcm9qZWN0cy8xNjQ5MjY0NjUxNzkvbG9jYXRpb25zL2dsb2JhbC93b3JrbG9hZElkZW50aXR5UG9vbHMvaXItYW5hbHl0aWNzLXBvb2wtMC9wcm92aWRlcnMvaXItYW5hbHl0aWNzLXBvb2wtMCIsImV4cCI6MTc0NDY2NTM1OSwiaWF0IjoxNzQ0NjYxNzU5LCJpc3MiOiJodHRwczovL2lyLWFuYWx5dGljcy1lbnRyeS50aGVpbmZpbml0ZXJlYWxpdHkuaW8vLndlbGwta25vd24vandrcy5qc29uIiwic3ViIjoiaXItYW5hbHl0aWNzLXBvb2wtMCJ9.jrMukcTt7JDJcotNhxuFaqsow76znyaF3i0tGdN1LomXfgGuF9Ommvmp2zrBI8lYG8qgPcu9V7dEqp2FX5ZOkdUKMywIu62iz1goSvkJjLVz8qfJuK4ocpdoiSybyEySt0JTOyMAbt2Bxyt9rfJiHPphwfJV6aE6YkBpr-14xdmq-teLYJiUgdPpEg9BCiImey-IJ4h_A-IJz26T6qe8agxNqVx2saZYoIKKzAQ_dKZvq2sU5dUZGbxMM2l6Adzf4RzyMrdhy_ki75csPx8QDp6n2iM2iYEhoZuKutfOecgDANRE38OWuBO_K2VJkgKVeDZLDNSTH9KIbx_PgbmEGg"
}

# **Validate the LWT (Optional)**
$ python api/jwks_auth/payload.py --validate api/prd-pub.json /opt/lwt.json
Validated JWT Claims from external files:
{"aud":"//iam.googleapis.com/projects/164926465179/locations/global/workloadIdentityPools/pool-0/providers/pool-0","exp":1744665359,"iat":1744661759,"iss":"https://yourdomain/.well-known/jwks.json","sub":"pool-0"}

# **Test query the dataset**
$ python api/test_bq_conn.py --dataset event_logs --creds api/clientLibraryConfig-pool-0.json
Tables in dataset 'event_logs':
- curated_events
- ecomm_events
- fct_agent_interactions
- fct_cart_behaviour
- fct_funnel_daily
- fct_location_enters
- fct_order_items
- fct_orders
- fct_sessions
- fct_sessions_per_project
- ir_engine
- location_events
- middleware_events
- test_insert
- wizard_events
```

---

## 1. Key & JWKS Generation

To create **pri** and **pub** JSON keys
```
########################################
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
            "n": "yY2lgcZ2QvRu7hKwB63MOW0EsYf84X-MbzR_PRAtyZhSXIevwSTE1z98mK29wvbq1NRO2FDYs7A9lgBt1azJoMxt-M8Ya7Ox5t4eny_gsUzzh89iyfOHDR7Lss81Kg9dvRRoV8lbvNmmuEIu-capuJ7-FqVy_t-hGRetm9qjFm5Pqy05wAvKvrmssKAbowfC1heo6FJtKQf7XFI78iOl9QbPfgNHUBP8ZBhjMvcjezxQpVbi8e1BtZGHfASWJg52Gr2l0B26fKtGtzInsw2OKkf9xzRPtQOVxNIBzG5FHWgwlHnJCtv21mcL5k0fmUzkbZTFiRTH-TUzcK8oqYXqhQ"
        }
    ]
}
[*] JWKS Private JSON:
{
    "keys": [
        {
            "d": "ErEL6wnacFGmUvZRNFkaEi5Jy-QCX_A5-BssfJ96O5KgervLoRQVnCejWK5uJX1MIGIzEK0It7tNrtJJ3VHJnhuvTC56g4x14GTzfoxMYGz0PcFOFk_7E4yqU-IS-lxT82PH3HJMS2p842Qh4qCZn0lBY5zC2h-nm0HepBBF5R-6F4HXbGQrW50lo_4ck85uFCLkH19q8J20_ffnLS2hvLWT62hUPb3tsjNpf4n5Ji0PpUUczmuvH2w8sP7sNOofu8juvIe97BITRSaJ2HLyNqrCXlSAvJXOkIFaqdWN5wmmII06XI0eruhrpbtEUVe7UOUucZ0MzjddaYM1K2bVIQ",
            "dp": "Is_jhC1KQRtFlZEqxa_9QtQMxIovlO56CyBIj0tOgHBrGlgH35IXWe5rM4HE_t0eZMPM_xUXOnwrtsU8VoBF_PD7YTHorB3M_Tkb9Sp9lxenGRbemsr5b3sufo-ANw233boJtaqUqeOHT_RDL8ySQ3kdKohR30b4Tc2d2_xCSQU",
            "dq": "BKav1gED28fY5ph_geT38Jumq_lDs4VZva2p6V9HOdoJBjew7GXo1ef5nEw-rtOPE8kia_P5sSOJ5Amiii10bQs_NMLTKkJg1xUEXSXMwOWQN6KgIeY-sopKCg4Z3IP_Ve8W0Wixaeux1-dwtwTTgzH-tmt9ZPKrUh548dCBHgE",
            "e": "AQAB",
            "kty": "RSA",
            "n": "yY2lgcZ2QvRu7hKwB63MOW0EsYf84X-MbzR_PRAtyZhSXIevwSTE1z98mK29wvbq1NRO2FDYs7A9lgBt1azJoMxt-M8Ya7Ox5t4eny_gsUzzh89iyfOHDR7Lss81Kg9dvRRoV8lbvNmmuEIu-capuJ7-FqVy_t-hGRetm9qjFm5Pqy05wAvKvrmssKAbowfC1heo6FJtKQf7XFI78iOl9QbPfgNHUBP8ZBhjMvcjezxQpVbi8e1BtZGHfASWJg52Gr2l0B26fKtGtzInsw2OKkf9xzRPtQOVxNIBzG5FHWgwlHnJCtv21mcL5k0fmUzkbZTFiRTH-TUzcK8oqYXqhQ",
            "p": "8Qst5oskOgezNYveifXbIUa3jpcyM9LbnGv2k4LETOR7FaQnelUrP7CDLQ89thxTP2Bcr9yvXIL3j0sxke9oB1Q0vxhPyhS_d2pMtnimb6EtpfyVc-KUOt75lTffgSXPPwtDa5LmuUb6EA3u2pZiEtyqthEM8dK2Q4HX9avWRiU",
            "q": "1g8wTdDfyJOJyZmL74vV20CW8ZtEdK736lHnYJLN3bW7AwFIpS72nlkU5yo-ZRPCChsA6iOIHEQj4P5OWSrlH5TmHSEQu_Z9YtnJvMsg2CWX8iEJcVOF5Nn955NmlTAnLb1CPzFoBTukmh5QQydJWiic1rAleNIGnRYfsSjL9OE",
            "qi": "wVFX_l61o3_U45Gi_kSdqpTFxztXYDG22gvMN1dChBf2sNJHNXCyjp7xNfA4Dts_aYdTKnkuG8FXWKLbB1dyYwHt1JGmMOSW0Ki2QygTqHjH2z0MjDynqm4K5VPfWBjm_jMOoiJsYwjqYg3Rqibb26CwUyVLvCOYawm26c9WvaI"
        }
    ]
}
[*] JWKS Public JSON:
{
    "keys": [
        {
            "e": "AQAB",
            "kty": "RSA",
            "n": "yY2lgcZ2QvRu7hKwB63MOW0EsYf84X-MbzR_PRAtyZhSXIevwSTE1z98mK29wvbq1NRO2FDYs7A9lgBt1azJoMxt-M8Ya7Ox5t4eny_gsUzzh89iyfOHDR7Lss81Kg9dvRRoV8lbvNmmuEIu-capuJ7-FqVy_t-hGRetm9qjFm5Pqy05wAvKvrmssKAbowfC1heo6FJtKQf7XFI78iOl9QbPfgNHUBP8ZBhjMvcjezxQpVbi8e1BtZGHfASWJg52Gr2l0B26fKtGtzInsw2OKkf9xzRPtQOVxNIBzG5FHWgwlHnJCtv21mcL5k0fmUzkbZTFiRTH-TUzcK8oqYXqhQ"
        }
    ]
}
JWKS (public) JSON file saved successfully to prd-pub.json.
[*] JWKS Private JSON:
{
    "keys": [
        {
            "d": "ErEL6wnacFGmUvZRNFkaEi5Jy-QCX_A5-BssfJ96O5KgervLoRQVnCejWK5uJX1MIGIzEK0It7tNrtJJ3VHJnhuvTC56g4x14GTzfoxMYGz0PcFOFk_7E4yqU-IS-lxT82PH3HJMS2p842Qh4qCZn0lBY5zC2h-nm0HepBBF5R-6F4HXbGQrW50lo_4ck85uFCLkH19q8J20_ffnLS2hvLWT62hUPb3tsjNpf4n5Ji0PpUUczmuvH2w8sP7sNOofu8juvIe97BITRSaJ2HLyNqrCXlSAvJXOkIFaqdWN5wmmII06XI0eruhrpbtEUVe7UOUucZ0MzjddaYM1K2bVIQ",
            "dp": "Is_jhC1KQRtFlZEqxa_9QtQMxIovlO56CyBIj0tOgHBrGlgH35IXWe5rM4HE_t0eZMPM_xUXOnwrtsU8VoBF_PD7YTHorB3M_Tkb9Sp9lxenGRbemsr5b3sufo-ANw233boJtaqUqeOHT_RDL8ySQ3kdKohR30b4Tc2d2_xCSQU",
            "dq": "BKav1gED28fY5ph_geT38Jumq_lDs4VZva2p6V9HOdoJBjew7GXo1ef5nEw-rtOPE8kia_P5sSOJ5Amiii10bQs_NMLTKkJg1xUEXSXMwOWQN6KgIeY-sopKCg4Z3IP_Ve8W0Wixaeux1-dwtwTTgzH-tmt9ZPKrUh548dCBHgE",
            "e": "AQAB",
            "kty": "RSA",
            "n": "yY2lgcZ2QvRu7hKwB63MOW0EsYf84X-MbzR_PRAtyZhSXIevwSTE1z98mK29wvbq1NRO2FDYs7A9lgBt1azJoMxt-M8Ya7Ox5t4eny_gsUzzh89iyfOHDR7Lss81Kg9dvRRoV8lbvNmmuEIu-capuJ7-FqVy_t-hGRetm9qjFm5Pqy05wAvKvrmssKAbowfC1heo6FJtKQf7XFI78iOl9QbPfgNHUBP8ZBhjMvcjezxQpVbi8e1BtZGHfASWJg52Gr2l0B26fKtGtzInsw2OKkf9xzRPtQOVxNIBzG5FHWgwlHnJCtv21mcL5k0fmUzkbZTFiRTH-TUzcK8oqYXqhQ",
            "p": "8Qst5oskOgezNYveifXbIUa3jpcyM9LbnGv2k4LETOR7FaQnelUrP7CDLQ89thxTP2Bcr9yvXIL3j0sxke9oB1Q0vxhPyhS_d2pMtnimb6EtpfyVc-KUOt75lTffgSXPPwtDa5LmuUb6EA3u2pZiEtyqthEM8dK2Q4HX9avWRiU",
            "q": "1g8wTdDfyJOJyZmL74vV20CW8ZtEdK736lHnYJLN3bW7AwFIpS72nlkU5yo-ZRPCChsA6iOIHEQj4P5OWSrlH5TmHSEQu_Z9YtnJvMsg2CWX8iEJcVOF5Nn955NmlTAnLb1CPzFoBTukmh5QQydJWiic1rAleNIGnRYfsSjL9OE",
            "qi": "wVFX_l61o3_U45Gi_kSdqpTFxztXYDG22gvMN1dChBf2sNJHNXCyjp7xNfA4Dts_aYdTKnkuG8FXWKLbB1dyYwHt1JGmMOSW0Ki2QygTqHjH2z0MjDynqm4K5VPfWBjm_jMOoiJsYwjqYg3Rqibb26CwUyVLvCOYawm26c9WvaI"
        }
    ]
}
JWKS (private) JSON file saved successfully to prd-pri.json.


#######################
### CREATE LWT JSON ###
#######################

$ python jwks_auth/payload.py --files prd-pri.json prd-claims.json --save_lwt /opt/lwt.json
JWT Token:
eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJhdWQiOiJodHRwczovL2lhbS5nb29nbGVhcGlzLmNvbS9wcm9qZWN0cy8xNjQ5MjY0NjUxNzkvbG9jYXRpb25zL2dsb2JhbC93b3JrbG9hZElkZW50aXR5UG9vbHMvaXItYW5hbHl0aWNzLXBvb2wtMC9wcm92aWRlcnMvaXItYW5hbHl0aWNzLXBvb2wtMCIsImlzcyI6Imh0dHBzOi8vaXItYW5hbHl0aWNzLWVudHJ5LnRoZWluZmluaXRlcmVhbGl0eS5pby8ud2VsbC1rbm93bi9qd2tzLmpzb24iLCJzdWIiOiIgaXItZXh0LWFuYWx5dGljcy1wcm9kLXNhIn0.EAh3y0OGUahtM2uLA4m2PcOMYKgRId8kba2qAYJCiJuU-2AalB-Lw5lfj1VmjKghdDO78NxYcSuEXrh2wmk9P2jsnH4e7YRzOA7CEXjRBVav7fIU503v-3IICLRdpgtej1sG6oJP1fK44V99ohSpg0YQhz-RuANjUqctw959knQnxUcSeWFJowIUYfGNNpsMb05xispxEpmjPVqengQEx7EyPRD2Qq3vaaYNGSqQHUAqJdKXan126RIbja0K7nhYZIRydOmV_P728YQyvfBJ2YfPPB9MFWqCjjCUX9io04HZ6-b7uusT-SYMMI3lZOh-YPsUbr4_5-Aaz-0y5JRfAQ
JWT Claims:
{"aud":"https://iam.googleapis.com/projects/164926465179/locations/global/workloadIdentityPools/pool-0/providers/pool-0","iss":"https://yourdomain/.well-known/jwks.json","sub":" prod-sa"}
LWT JSON saved to /opt/lwt.json
Generated LWT JSON:
{
    "access_token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJhdWQiOiJodHRwczovL2lhbS5nb29nbGVhcGlzLmNvbS9wcm9qZWN0cy8xNjQ5MjY0NjUxNzkvbG9jYXRpb25zL2dsb2JhbC93b3JrbG9hZElkZW50aXR5UG9vbHMvaXItYW5hbHl0aWNzLXBvb2wtMC9wcm92aWRlcnMvaXItYW5hbHl0aWNzLXBvb2wtMCIsImV4cCI6MTc0NDQxMjgxNCwiaWF0IjoxNzQ0NDA5MjE0LCJpc3MiOiJodHRwczovL2lyLWFuYWx5dGljcy1lbnRyeS50aGVpbmZpbml0ZXJlYWxpdHkuaW8vLndlbGwta25vd24vandrcy5qc29uIiwic3ViIjoiIGlyLWV4dC1hbmFseXRpY3MtcHJvZC1zYSJ9.OjAwSdL4PjuGw-qnanJsSR7dyIMWeb5TYYmh9pxQTC7ak_1Q8zV_EEs2-cFseG-KredCMfpKQYaU0UB1vi7VlRXkzW-WJ-KQpGTrrK3hLGzgpW8HGbhRo0NS0uapHRJT62spQUxF6sME0Odx_w3Li-Q2Hgr3CgxsPL_KwjxXndJyDm8yDNXR_dKboF0JF6gxHjSeDS5D7KbdLUCVrauKvMG733WMXdq4hCmORWvY20tkDBrlRWwpptXABjUIYLpl6Rgg1BPE8E-4P7MzRe22vYWdp31As08_Yaj4k9VZEuZDytZDEQZxGnEdq0CLexmux72k6-8XhuHh_wTyQgwtFQ"
}


#############################
### TEST TOKEN VALIDATION ###
#############################

$ python jwks_auth/payload.py --validate prd-pub.json /opt/lwt.json
Validated JWT Claims from external files:
{"aud":"https://iam.googleapis.com/projects/164926465179/locations/global/workloadIdentityPools/pool-0/providers/pool-0","exp":1744412814,"iat":1744409214,"iss":"https://yourdomain/.well-known/jwks.json","sub":" prod-sa"}

```


### NOTES

```
# DEV
principal://iam.googleapis.com/projects/237949795725/locations/global/workloadIdentityPools/pool-0/subject/sa-000

# PRD
principal://iam.googleapis.com/projects/164926465179/locations/global/workloadIdentityPools/pool-0/subject/prod-sa

principal://iam.googleapis.com/projects/164926465179/locations/global/workloadIdentityPools/pool-0/subject/SUBJECT_ATTRIBUTE_VALUE

principal://iam.googleapis.com/projects/164926465179/locations/global/workloadIdentityPools/pool-0/subject/pool-0
```

External Analytics Pool
```
ID
pool-0
Description
External analytics BQ WIF
Status
IAM principal 
principal://iam.googleapis.com/projects/237949795725/locations/global/workloadIdentityPools/pool-0/subject/SUBJECT_ATTRIBUTE_VALUE 
Logs 
View
```

Providers
```
vis-stack-oidc-jwt	OIDC
```

Provider Details
```
vis-stack-oidc-jwt
```

Issuer URL
```
https://yourdomain/.well-known/jwks.json
```

**NOTE:** Record the resulting IAM principal, grant to SA with `roles/iam.workloadIdentityUser`
```
principal://iam.googleapis.com/projects/164926465179/locations/global/workloadIdentityPools/pool-0/subject/SUBJECT_ATTRIBUTE_VALUE
```

Audiences
Default Audiences
```
# DEV
https://iam.googleapis.com/projects/237949795725/locations/global/workloadIdentityPools/pool-0/providers/vis-jwt

# PRD
https://iam.googleapis.com/projects/164926465179/locations/global/workloadIdentityPools/pool-0/providers/vis-stack-oidc-jwt
```

OIDC 1
```
assertion.sub
```

SA Permissions/Roles
```
# DEV
sa-000@genai-analytics-435321.iam.gserviceaccount.com
sa-000
BigQuery Data Viewer
BigQuery Job User
BigQuery Metadata Viewer

# PRD
prod-sa@prd.iam.gserviceaccount.com
prod-sa	
BigQuery Data Viewer
BigQuery Job User
BigQuery Metadata Viewer
```
Service Account must be granted access to IAM WIP principal (from pool creation) with `roles/iam.workloadIdentityUser`

Create a `claims.json` with your SA, issue, and audience (without `https:`)
```
{
  "sub": " prod-sa",
  "iss": "https://yourdomain/.well-known/jwks.json",
  "aud": "//iam.googleapis.com/projects/164926465179/locations/global/workloadIdentityPools/pool-0/providers/vis-stack-oidc-jwt"
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

External Credentials File **clientLibraryConfig-vis-jwt.json**
```
{
  "universe_domain": "googleapis.com",
  "type": "external_account",
  "audience": "//iam.googleapis.com/projects/237949795725/locations/global/workloadIdentityPools/pool-0/providers/vis-jwt",
  "subject_token_type": "urn:ietf:params:oauth:token-type:jwt",
  "token_url": "https://sts.googleapis.com/v1/token",
  "service_account_impersonation_url": "https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/sa-000@genai-analytics-435321.iam.gserviceaccount.com:generateAccessToken",
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
GCP_PROJECT="genai-analytics-435321"
GCP_BQ_DATASET="event_logs"
GCP_CLIENT_CONF="/app/api/clientLibraryConfig-vis-jwt.json"
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
