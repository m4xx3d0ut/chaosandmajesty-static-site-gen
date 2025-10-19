---
title: Helios Security Baseline
slug: helios-security
author: m4xx3d0ut
summary: "Hardening checklist for the Helios hosts\u2014unattended upgrades, SSH lockdowns,\
  \ UFW + Fail2ban, psad, and Tripwire tuning."
tags:
- m4xx3d
- security
- hardening
- linux
- devops
publishedAt: 2023-05-28
updatedAt: 2023-08-27
---
- Enable unattended security upgrades, lock down SSH (no root logins, limited auth tries), and default-deny inbound traffic with UFW.
- Layer `fail2ban`, psad, and Tripwire to detect and respond to brute-force attempts, port scans, and file integrity drift.
- Keep firewall logging verbose so psad can parse packets, and schedule Tripwire integrity checks with meaningful policy overrides.

## Working Notes... In Graphic Detail...

## helios

### Security

#### Debian
##### Security Updates
Installed and enable `unattended-upgrades` to automatically install security updates.

##### SSHD
Minor tweaks.  Disable root login, reduce auth tries, disable password auth, and empty passwords.

```
PermitRootLogin no
MaxAuthTries 2
PasswordAuthentication no
PermitEmptyPasswords no
```

#### UFW
##### About
The Uncomplicated Firewall (ufw) is a frontend for iptables and is particularly well-suited for host-based firewalls. ufw provides a framework for managing netfilter, as well as a command-line interface for manipulating the firewall. ufw aims to provide an easy to use interface for people unfamiliar with firewall concepts, while at the same time simplifies complicated iptables commands to help an administrator who knows what he or she is doing. ufw is an upstream for other distributions and graphical frontends.

##### Install & Configure
Setup Uncomplicated Fire Wall to allow SSH, HTTP, and HTTPS.  UFW will also be used as a ban mechanic for `fail2ban`.

```
$ apt install ufw

$ sudo ufw default deny incoming
Default incoming policy changed to 'deny'
(be sure to update your rules accordingly)

$ sudo ufw default allow outgoing
Default outgoing policy changed to 'allow'
(be sure to update your rules accordingly)

$ sudo ufw allow ssh
Rules updated
Rules updated (v6)

$ sudo ufw allow http
Rules updated
Rules updated (v6)

$ sudo ufw allow https
Rules updated
Rules updated (v6)

$ sudo ufw enable
Command may disrupt existing ssh connections. Proceed with operation (y|n)? y
Firewall is active and enabled on system startup
```

Check UFW status.

```
$ sudo ufw status

Status: active

To                         Action      From
--                         ------      ----
22/tcp                     ALLOW       Anywhere               
80/tcp                     ALLOW       Anywhere   
443                        ALLOW       Anywhere
22/tcp (v6)                ALLOW       Anywhere (v6)
80/tcp (v6)                ALLOW       Anywhere (v6)
443 (v6)                   ALLOW       Anywhere (v6) 
```

Check UFW log.

```
$ sudo cat /var/log/ufw.log
```

#### fail2ban
##### About
Fail2ban scans log files (e.g. /var/log/apache/error_log) and bans IPs that show the malicious signs -- too many password failures, seeking for exploits, etc. Generally Fail2Ban is then used to update firewall rules to reject the IP addresses for a specified amount of time, although any arbitrary other action (e.g. sending an email) could also be configured. Out of the box Fail2Ban comes with filters for various services (apache, courier, ssh, etc).

##### Install & Configure
Install `fail2ban` and copy a `jail.local` and ignore our IP.

```
$ apt install fail2ban

$ cp /etc/fail2ban/jail.conf /etc/fail2ban/jail.local
```

Edit the `jail.local`

```
[DEFAULT]
ignoreip = {YourWanIPhere}
```

Added custom jails to `/etc/fail2ban/jail.d/defaults-debian.conf`

```
[sshd]
enabled = true
banaction = ufw
port = ssh
filter = sshd
logpath = %(sshd_log)s
maxretry = 5
backend = %(sshd_backend)s

[nginx-auth]
enabled = true
port    = http,https
filter = nginx-http-auth
action = iptables-multiport[name="nginxauth", port="http,https", protocol="tcp"]
logpath = /var/log/nginx/*error.log
maxretry = 3

## To use 'nginx-limit-req' jail you should have `ngx_http_limit_req_module` 
## and define `limit_req` and `limit_req_zone` as described in nginx documentation
## http://nginx.org/en/docs/http/ngx_http_limit_req_module.html
## or for example see in 'config/filter.d/nginx-limit-req.conf'
[nginx-limit-req]
port    = http,https
logpath = %(nginx_error_log)s
```

Disabled as needed from `jail.local`.  Reload `fail2ban` and check jail status.

```
$ sudo fail2ban-client reload
OK

$ sudo fail2ban-client status
Status
|- Number of jail:	3
`- Jail list:	nginx-auth, nginx-req-limit, sshd

$ sudo fail2ban-client status sshd
Status for the jail: sshd
|- Filter
|  |- Currently failed:	6
|  |- Total failed:	7
|  `- File list:	/var/log/auth.log
`- Actions
   |- Currently banned:	0
   |- Total banned:	0
   `- Banned IP list:	

$ sudo fail2ban-client status nginx-auth
Status for the jail: nginx-auth
|- Filter
|  |- Currently failed:	0
|  |- Total failed:	0
|  `- File list:	/var/log/nginx/error.log
`- Actions
   |- Currently banned:	0
   |- Total banned:	0
   `- Banned IP list:	

$ sudo fail2ban-client status nginx-req-limit
Status for the jail: nginx-req-limit
|- Filter
|  |- Currently failed:	0
|  |- Total failed:	0
|  `- File list:	/var/log/nginx/error.log
`- Actions
   |- Currently banned:	0
   |- Total banned:	0
   `- Banned IP list:
```

Check `fail2ban` log.

```
$ sudo cat /var/log/fail2ban.log
```

#### PSAD
##### About
The Port Scan Attack Detector psad is a lightweight system daemon written in is designed to work with Linux iptables/ip6tables/firewalld firewalling code to detect suspicious traffic such as port scans and sweeps, backdoors, botnet command and control communications, and more. It features a set of highly configurable danger thresholds (with sensible defaults provided), verbose alert messages that include the source, destination, scanned port range, begin and end times, TCP flags and corresponding nmap options, reverse DNS info, email and syslog alerting, automatic blocking of offending IP addresses via dynamic configuration of iptables rulesets, passive operating system fingerprinting, and DShield reporting. In addition, psad incorporates many of the TCP, UDP, and ICMP signatures included in the Snort intrusion detection system. to detect highly suspect scans for various backdoor programs (e.g. EvilFTP, GirlFriend, SubSeven), DDoS tools (Mstream, Shaft), and advanced port scans (SYN, FIN, XMAS) which are easily leveraged against a machine via nmap. psad can also alert on Snort signatures that are logged via fwsnort, which makes use of the iptables string match extension to detect traffic that matches application layer signatures. As of the 2.4.4 release, psad can also detect the IoT default credentials scanning phase of the Mirai botnet.

##### Install & Configure
Install `psad` and backup the default conf.

```
apt install psad

cp /etc/psad/psad.conf /etc/psad/psad.conf.bk
```

Edit `/etc/psad/psad.conf` with the following lines and as needed.

```
EMAIL_ADDRESSES	{YourEmal}
HOSTNAME	{HostName}
EXPECT_TCP_OPTIONS Y;
ENABLE_PSADWATCHD Y;    # <-- Not needed with SystemD/Upstart
ENABLE_AUTO_IDS Y;
ENABLE_AUTO_IDS_EMAILS Y;
```

Backup UFW rules.

```
$ sudo cp /etc/ufw/before.rules /etc/ufw/before.rules.bk

$ sudo cp /etc/ufw/before6.rules /etc/ufw/before6.rules.bk
```

Edit the end of both UFW rules files as shown.

```
## log all traffic so psad can analyze
-A INPUT -j LOG --log-tcp-options --log-prefix "[IPTABLES] "
-A FORWARD -j LOG --log-tcp-options --log-prefix "[IPTABLES] "

## don't delete the 'COMMIT' line or these rules won't be processed
COMMIT
```

##### SystemD Unit File
You may need a systemd unit file to start the watchdog deamon depending on your configuration.  Create a systemd unit file for `psadwatch` in `/etc/systemd/system/psadwatchd.service`

```
[Unit]
Description=Port scan attack detector daemon
After=psad.service
[Service]
ExecStart=/usr/sbin/psadwatchd
Type=oneshot
RemainAfterExit=yes
[Install]
WantedBy=multi-user.target
```

Reload the daemon, start, and enable `psadwatchd.service`

```
$ systemctl daemon-reload

$ systemctl start psadwatchd.service

$ sudo systemctl enable psadwatchd.service

$ sudo systemctl status psadwatchd.service 
● psadwatchd.service - Port scan attack detector daemon
     Loaded: loaded (/etc/systemd/system/psadwatchd.service; disabled; vendor preset: enabled)
     Active: active (exited) since Thu 2023-06-01 20:37:17 UTC; 4s ago
    Process: 1110219 ExecStart=/usr/sbin/psadwatchd (code=exited, status=0/SUCCESS)
   Main PID: 1110219 (code=exited, status=0/SUCCESS)
      Tasks: 1 (limit: 1129)
     Memory: 188.0K
        CPU: 325ms
     CGroup: /system.slice/psadwatchd.service
             └─1110220 /usr/sbin/psadwatchd

```

##### Reload and Check
For the changes to take effect reload UFW,  PSAD, update PSAD signatures, and send HUP to PIDs.

```bash
sudo ufw reload

sudo psad -R
sudo psad --sig-update
sudo psad -H
```

Make sure both `psad` and, if required by your config, `psadwatchd`are running.

```
$ ps -A | grep "psad"
1114999 ?        00:00:00 psad
1115002 ?        00:00:00 psadwatchd
1115015 ?        00:00:00 psad
```

Check `psad` status.

```
$ sudo psad -S
```

Check `psad` logs.

```
$ sudo cat /var/log/psad/status.out
```

##### Update Signatures
Create script for updating PSAD signatures and sending HUP to PIDs  `/usr/local/bin/psad-upd`

```
##!/usr/bin/env bash

psad --sig-update
psad -H
```

Make the script executable.

```
$ chmod +x /usr/local/bin/psad-upd
```

Create a cron job to update daily.

```
## m h  dom mon dow   command
0 0 * * * /usr/local/bin/psad-upd >/dev/null 2>&1
```

#### Tripwire
##### About
A Tripwire check compares the current filesystem state against a known baseline state, and alerts on any changes it detects. The baseline and check behavior are controlled by a policy file, which specifies which files or directories to monitor, and which attributes to monitor on them, such as hashes, file permissions, and ownership.

When an expected change occurs, such as upgrading a package, the baseline database can be updated to the new known-good state. The policy can also be updated, for example to reduce noise or cover a newly installed package.

##### Install & Configure
Install, follow prompts to set passphrase (can be bypassed and scripted), and init `tripwire` DB.

```
$ apt install tripwire
$ tripwire --init
```

Edit `/etc/tripwire/twpol.txt` and `/etc/tripwire/twcfg.txt` as needed.  You will find your file path and SMTP settings in `twcfg.txt`.  By default, it will check all of `/proc`, this is likely undesirable.  The following rules for `/proc` are more reasonable for most applications.

 ```
	/dev -> $(Device) ;
	#/proc -> $(Device) ;
	/proc/devices -> $(Device) ;
	/proc/net -> $(Device) ;
	/proc/tty -> $(Device) ;
	/proc/sys -> $(Device) ;
	/proc/cpuinfo -> $(Device) ;
	/proc/modules -> $(Device) ;
	/proc/mounts -> $(Device) ;
	/proc/dma -> $(Device) ;
	/proc/filesystems -> $(Device) ;
	/proc/interrupts -> $(Device) ;
	/proc/ioports -> $(Device) ;
	/proc/scsi -> $(Device) ;
	/proc/kcore -> $(Device) ;
	/proc/self -> $(Device) ;
	/proc/kmsg -> $(Device) ;
	/proc/stat -> $(Device) ;
	/proc/loadavg -> $(Device) ;
	/proc/uptime -> $(Device) ;
	/proc/locks -> $(Device) ;
	/proc/meminfo -> $(Device) ;
	/proc/misc -> $(Device) ;
```

Every time you edit these files you must recreate encrypted policy and reinitialize the DB.

```
$ twadmin -m P /etc/tripwire/twpol.txt
$ tripwire --init
```

Policy can be updated with.

```
tripwire --update-policy --secure-mode low /etc/tripwire/twpol.txt
```

You can run an interactive check as shown.  Note that you can use your editor of choice with the `--visual` flag.

```
$ tripwire --check --interactive --visual micro
```

##### Mosh

```bash
sudo ufw allow 60000:61000/udp
```
