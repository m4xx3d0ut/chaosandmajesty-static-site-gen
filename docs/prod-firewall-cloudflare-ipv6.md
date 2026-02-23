# Cloudflare-Only IPv6 Access (nftables)

This snippet restricts the business IPv6 origin (`2600:3c01:e000:b53::10`) to
Cloudflare-only ingress on TCP 443. It does not modify IPv4 rules.

## 1) Create a Cloudflare IPv6 set

```bash
sudo nft add set inet filter cf_ipv6 '{ type ipv6_addr; flags interval; }'
```

## 2) Populate the set

```bash
sudo curl -fsSL https://www.cloudflare.com/ips-v6 | while read -r cidr; do
  sudo nft add element inet filter cf_ipv6 "{ ${cidr} }"
done
```

## 3) Add allow + drop rules for the business origin

```bash
sudo nft add rule inet filter input ip6 daddr 2600:3c01:e000:b53::10 tcp dport 443 ip6 saddr @cf_ipv6 accept
sudo nft add rule inet filter input ip6 daddr 2600:3c01:e000:b53::10 tcp dport 443 drop
```

No HTTP (port 80) mapping is required for the business service with DNS-01.

## 4) Persist rules

Ensure your distro persists nftables rules on reboot (for example, by saving the
ruleset to `/etc/nftables.conf` and enabling the nftables service).
