# DNS-01 (Cloudflare) for Business TLS

This runbook provisions a single SAN certificate for:
- `cosmosmechane.com`
- `cosmec.co`

It uses Certbot with the Cloudflare DNS plugin so the business origin can stay
locked down (no port 80 required).

## 1) Install the DNS plugin

```bash
sudo apt-get update
sudo apt-get install -y certbot python3-certbot-dns-cloudflare
```

## 2) Create the Cloudflare credentials file

```bash
sudo install -d -m 700 /etc/letsencrypt
sudo tee /etc/letsencrypt/cloudflare.ini > /dev/null <<'EOF'
dns_cloudflare_api_token = <CLOUDFLARE_DNS_API_TOKEN>
EOF
sudo chmod 600 /etc/letsencrypt/cloudflare.ini
```

The API token must have DNS edit permissions for both zones.

## 3) Issue the certificate (SAN)

```bash
sudo certbot certonly \
  --dns-cloudflare \
  --dns-cloudflare-credentials /etc/letsencrypt/cloudflare.ini \
  -d cosmosmechane.com \
  -d cosmec.co
```

Certbot will create `/etc/letsencrypt/live/cosmosmechane.com/` which is what the
business Nginx config references.

## 4) Renewal

Certbot will reuse the DNS plugin for renewals. Validate:

```bash
sudo certbot renew --dry-run
```
