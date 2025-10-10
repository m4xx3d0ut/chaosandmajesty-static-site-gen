---
title: "PEN-200 Foundations \u2014 Mindsets Before Metasploit"
slug: pwk-foundations
author: m4xx3d0ut
summary: "Chapters 1\u20135 read like philosophy at first glance, but the raw notes\
  \ are packed with practical guidance\u2014risk matrices, Cornell note templates,\
  \ and reporting frameworks. This pass weaves those specifics into an onboardin\u2026"
publishedAt: '2023-07-20'
updatedAt: '2023-07-27'
readingMinutes: 80
tags:
- offsec
---
## TLDR;

Chapters 1–5 read like philosophy at first glance, but the raw notes are packed with practical guidance—risk matrices, Cornell note templates, and reporting frameworks. This pass weaves those specifics into an onboarding brief you can hand to a new operator.

### Cybersecurity Is Applied Psychology

- **Risk language:** log every threat, vulnerability, likelihood, and impact. Use the four-quadrant view (low/low ➜ high/high) to prioritise findings before scanning.
- **Security mindset drills:** when reading documentation, force yourself to answer “how would I break this?” and “how does the defender watch for it?”.
- **Try Harder loop:** note every failed attempt in the lab journal, the time spent, and the pivot you tried next. Those entries become gold when writing the final exam report.

### Principles and Controls You Actually Deploy

| Concept | Field Application |
| --- | --- |
| **Defense in depth** | Track controls as preventative/detective/corrective so you can suggest compensating controls when something fails. |
| **Administrative segmentation** | Document which accounts have tier-0, tier-1, tier-2 access. Map them to hosts—the report needs that table. |
| **Shift-left security** | Record tooling that developers requested (SAST, container scanning, SBOM) so your recommendations align with the org’s maturity. |
| **Chaos testing & logging** | Note when a client lacks centralised logging; propose specific log sources (Sysmon, centralised SSH logging) instead of generic “enable logging”. |

### Learning How to Learn (Module 4 Details)

- **Cornell notes setup:** divide your notebook page into cue, notes, summary. Use the cue column for chapter objectives, the notes column for commands, and the summary column for exam-ready takeaways.
- **Spaced repetition schedule:** Day 0 (read), Day 2 (teach it aloud), Day 7 (build a lab). The forgetfulness curve in the notes is brutal unless you follow through.
- **Dual coding:** redraw diagrams from memory (AD trust flow, protocol stacks) in your Markdown journal; don’t just screenshot them.

### Report Writing Habits (Module 5)

1. Capture screenshots with context: window title, timestamp, and a note describing what the reader should notice.
2. Draft exploitation steps as you work—command, expected output, interpretation, mitigation.
3. Maintain a consistent finding template: overview, risk, evidence, remediation, references.
4. Store raw data (pcaps, command output) separately from the narrative draft so redaction is easy.

### Operator Checklist

- Map VPN addressing the moment you connect: `ifconfig tun0` ➜ add to the lab’s asset tracker.
- Keep a “failed idea” section in your notes—you’ll reference it during the exam when exhaustion kicks in.
- Stand up a reusable executive summary template highlighting business impact first, technical detail second.

Master these foundations now and the technical chapters feel less chaotic—you’ll have context, process, and a reporting pipeline already in motion.

## Working Notes... In Graphic Detail...

### PWK

#### Course Info

Recommended SSH flags

```bash
ssh -o "UserKnownHostsFile=/dev/null" -o "StrictHostKeyChecking=no" learner@192.168.50.52
```

The UserKnownHostsFile=/dev/null and StrictHostKeyChecking=no options have been added to prevent the known-hosts file on our local Kali machine from being corrupted.

##### Kali VM

kali
`D34dB33fiR`

CLI Search

```bash
sudo updatedb
locate foo
```

##### OffSec VPN

Connect from CLI, run in a `screen` session.

```
cd ~/offsec
sudo openvpn universal.ovpn
```

Network details
`ifconfig` == `ip a`

Once we are connected to the PWK VPN, we will be provided with a TUN0 network interface, which we can view with the ip a command. The address assigned to the TUN0 interface will be 192.168.119.X, where X is some value between 1 and 255. Every time we reconnect to the VPN, we might get assigned a different value for X.

In addition, all lab machines within the PWK environment will have addresses that follow the format 192.168.X.Y, where X is the same value as the third octet of our TUN0 address, and Y is the specific octet associated with the machine.

In the course material, we will be using different IP addresses for our TUN0 network interface as well as for the lab machines. Please make sure you are using the IP addresses assigned to you via TUN0 and via the OLP so that you can access the machines properly.

* * *.

#### 3 Intro to Cybersecurity

##### 3.1 The Practice of Cybersecurity

An important aspect of security is that it usually involves reasoning under uncertainty. Although we have plenty of deductive skills, we are by no means mentally omniscient. We cannot determine everything that follows from a given truth, and we cannot know or remember an infinite number of facts.

There are a few distinct characteristics of cybersecurity that distinguish it from other technical fields. First, security involves **malicious and intelligent actors (i.e. opponents)**.

The problem of the intelligent adversary and the problem of uncertainty both suggest that understanding cybersecurity necessitates learning more about how we think as human agents, and how to solve problems. This means we'll need to adopt and nurture specific mindsets that will help us as we learn and apply our skills.

Another important aspect of security is that it usually involves **reasoning under uncertainty**. Although we have plenty of deductive skills, we are by no means mentally omniscient. We cannot determine everything that follows from a given truth, and we cannot know or remember an infinite number of facts.

Another extremely valuable mindset is the aptly-coined **security mindset. Proposed by security researcher Bruce Schneier**,2 this mindset encourages a constant questioning of how one can attack (or defend) a system. If we can begin to ask this question automatically when encountering a novel idea, machine, system, network, or object, we can start noticing a wide array of recurring patterns.

At OffSec, we encourage learners to adopt the Try Harder3 mindset. To better understand this mindset, let's quickly consider two potential perspectives in a moment of "failure."

1.  If my attack or defense fails, it represents a truth about my current skills/processes/configurations/approach as much as it is a truth about the system.
2.  If my attack or defense fails, this allows me to learn something new, change my approach, and do something differently.

* * *.

##### 3.2 Threats and Thread Actors

The [cryptography](https://en.wikipedia.org/wiki/Cryptography) literature often uses the names "Alice" (or "A") for the sender, "Bob" (or "B") for the intended recipient, and "Eve" (or "E") for the eavesdropping adversary.

- Understand how attackers and defenders learn from each other.
- Understand the differences between risks, threats, vulnerabilities, and exploits.
- List and describe different classes of threat actors.
- Recognize some recent cybersecurity attacks.
- Learn how malicious attacks and threats can impact an organization and individuals.

Risk - A simple way to define risk is to consider two axes: the probability that a negative event will occur, and the impact on something we value if such an event happens. This definition allows us to conceptualize risks via four quadrants:

1.  Low probability, low impact events
2.  Low probability, high impact events
3.  High probability, low impact events
4.  High probability, high impact events

"How likely is it that a particular attack might happen?" and "What would be the worst possible outcome if the attack occurs?"

When we can attribute a specific risk to a particular cause, we're describing a threat. In cybersecurity, a threat2 is something that poses risk to an asset we care about protecting. Not all threats are human; if our network depends on the local electricity grid, a severe lightning storm could be a threat to ongoing system operations.

A person or group of people embodying a threat is known as a threat actor,3 a term signifying agency, motivation, and intelligence.

For a threat to become an actual risk, the target being threatened must be vulnerable in some manner. A vulnerability4 is a flaw that allows a threat to cause harm. Not all flaws are vulnerabilities. To take a non-security example, let's imagine a bridge. A bridge can have some aesthetic flaws; maybe some pavers are scratched or it isn't perfectly straight. However, these flaws aren't vulnerabilities because they don't pose any risk of damage to the bridge. Alternatively, if the bridge does have structural flaws in its construction, it may be vulnerable to specific threats such as overloading or too much wind.

In December 20215, a vulnerability was discovered in the Apache Log4J6 library, a popular Java-based logging library. This vulnerability could lead to arbitrary code execution by taking advantage of a JNDI Java toolkit feature which, by default, allowed for download requests to enrich logging. If a valid Java file was downloaded, this program would be executed by the server. This means that if user-supplied input (such as a username or HTTP header) was improperly sanitized before being logged, it was possible to make the server download a malicious Java file that would allow a remote, unauthorized user to execute commands on the server.

Due to the popularity of the Log4j library, this vulnerability was given the highest possible rating under the Common Vulnerability Scoring System (CVSS)7 used to score vulnerabilities: 10.0 Critical. This rating led to a frenzied aftermath including vendors, companies, and individuals scrambling to identify and patch vulnerable systems as well as search for indications of compromise. Additional Log4J vulnerabilities were discovered soon after, exacerbating matters.

This vulnerability could have been prevented by ensuring that user-supplied data is properly sanitized.8 The issue could have been mitigated by ensuring that potentially dangerous features (such as allowing web-requests and code execution) were disabled by default.

An attack surface10 describes all the points of contact on our system or network that could be vulnerable to exploitation. An attack vector11 is a specific vulnerability and exploitation combination that can further a threat actor's objectives.

###### Threats

**Individual Malicious Actors:** On the most superficial level, anyone attempting to do something that they are not supposed to do fits into this category. In cybersecurity, malicious actors can explore digital tactics that are unintended by developers, such as authenticating to restricted services, stealing credentials, and defacing websites.

**Malicious Groups:** When individuals band together to form groups, they often become stronger than their individual group members. This can be even more true online because the ability to communicate instantly and at vast distances enables people to achieve goals that would have been impossible without such powerful communication tools. For example, the ability to quickly coordinate on who-does-what over a instant messaging services is just as valuable to malicious cyber groups as it is to modern businesses. Malicious groups can have any number of goals, but are usually more purposeful, organized, and resourceful than individuals. Thus, they are often considered to be one of the more dangerous threat actors.

**Insider Threats:** Perhaps one of the most dangerous types of threat actor, an insider threat is anyone who already has privileged access to a system and can abuse their privileges to attack it. Often, insider threats are individuals or groups of employees or ex-employees of an enterprise that become motivated to harm it in some capacity. Insider threats can be so treacherous because they are usually assumed to have a certain level of trust. That trust can be exploited to gain further access to resources, or these actors may simply have access to internal knowledge that isn't meant to be public.

**Nation States:** Although international cyber politics, cyber war, and digital intelligence are vast subjects and significantly beyond the scope of this Module, we should recognize that some of the most proficient, resourceful, and well-financed operators of cyber attacks exist at the nation-state level within many different countries across the globe.

###### Attacks

**Social Engineering:** Social Engineering represents a broad class of attacks where an attacker persuades or manipulates human victims to provide them with information or access that they shouldn't have.

**Phishing:** Phishing is a more general class of attack relative to spearphishing. While spearphishing attacks are targeted to specific individuals, phishing is usually done in broad sweeps. Phishing strategy is usually to try to send a malicious communication to as many people as possible, inreasing the likelihood of a victim clicking a link or otherwise doing something that would compromise security.

The United States Federal Bureau of Investigation (FBI)5 recommends these and other steps be taken to prevent BEC:

- Verify the legitimacy of any request for payment, purchase or changes to account information or payment policies in person.
- If this is not possible, verify legitimacy over the phone.
- Be wary of requests that indicate urgency.
- Carefully inspect email addresses and URLs in email communications.
- Do not open email attachments from people that you do not know.
- Carefully inspect the email address of the sender before responding.

**Ransomware:** Ransomware is a type of malware that infects computer systems and then locks a legitimate user from accessing it properly. Often, users are contacted by the attacker and asked for a ransom in order to unlock their machine or documents.

**Credential Abuse:** Credential Abuse can occur when an attacker acquires legitimate credentials, allowing them to log into machines or services that they otherwise would not be able to. Often, attackers are able to guess user passwords because they are predictable or weak.

**Authentication Bypass:** While Credential Abuse allows attackers to log in to services by legitimate means, Authentication Bypasses can allow attackers to ignore or step-around intended authentication protocols.

##### 3.3 The CIA Triad

One of the models often used to describe the relationship between security and its objects is known the CIA triad. CIA stands for Confidentiality, Integrity, and Availability. Each of these is a desirable property of the things we might want to secure, and each of these three properties can be attacked. Most (though not all) attacks against computer systems and networks will threaten one of these attributes. Let's begin with a high level overview before we dive into each one:

- Confidentiality: Can actors who should not have access to the system or information access the system or information?
- Integrity: Can the data or the system be modified in some way that is not intended?
- Availability: Are the data or the system accessible when and how they are intended to be?

###### Confidentiality

A system is Confidential if the only people that can access it are the people explicitly permitted to do so. A person's social media account credentials are considered confidential as long as the user's password is known only to the owner. If a hacker steals or guesses the password and they can access the account, this would constitute an attack against confidentiality. Common attacks against confidentiality include network eavesdropping1 and credential stuffing.2

[Network Eavesdropping](https://en.wikipedia.org/wiki/Network_eavesdropping)
[Credential Stuffing](https://en.wikipedia.org/wiki/Credential_stuffing)

###### Integrity

A system has Integrity if the information and functionality it stores is only that which the owner intends to be stored. Integrity is concerned with maintaining the accuracy and reliability of data and services. Merely logging on to a user's social media account by guessing their password is not an attack against integrity. However, if the attacker starts to post messages or delete information, this would become an integrity attack as well. A common attack against integrity is arbitrary code execution.

[Arbitrary Code Execution](https://en.wikipedia.org/wiki/Arbitrary_code_execution)

###### Availability

A system is considered Available if the people who are supposed to access it can do so. Imagine an attacker has gained access to a social media account and also posted some content of their choosing. So far, this would constitute an attack against confidentiality and integrity. If the attacker changes the user's password and prevents them from logging on, this would also become an attack against availability. A common attack against availability is denial of service.

[DoS](https://en.wikipedia.org/wiki/Denial-of-service_attack)
[APT](https://www.crowdstrike.com/cybersecurity-101/advanced-persistent-threat-apt/)

* * *.

##### 3.4 Security Principles, Controls, and Strategies

- Understand the importance of multiple layers of defense in a security strategy.
- Describe threat intelligence and its applications in an organization.
- Learn why access and user privileges should be restricted as much as possible.
- Understand why security should not depend on secrecy.
- Identify policies that can mitigate threats to an organization.
- Determine which controls an organization can use to mitigate cybersecurity threats.

###### Security Principles

The [Principle of Least Privilege](https://en.wikipedia.org/wiki/Principle_of_least_privilege) expresses the idea that each part within a system should only be granted the lowest possible privileges needed to achieve its task. Whether referring to users on a machine or lines of code in a program, correctly adhering to this discipline can greatly narrow the attack surface.

The [Zero Trust](https://en.wikipedia.org/wiki/Zero_trust_security_model) security model takes the Principle of Least Privilege and carries it to its ultimate conclusion. This model advocates for removing all implicit trust of networks and has a goal of protecting access to resources, often with granular authorization processes for every resource request.

[Open Security](https://en.wikipedia.org/wiki/Open_security), a somewhat counter-intuitive principle, states that the security of a system should not depend on its secrecy. In other words, even if an attacker knows exactly how the system's security is implemented, the attacker should still be thwarted. This isn't to say that nothing should be secret. Credentials are a clear case where the security of a password depends on its secrecy. However, we'd want our system to be secure even if the attacker knows there is a password, and even if they know the cryptographic algorithm behind it.

[Defense in Depth](https://en.wikipedia.org/wiki/Defense_in_depth_%28computing%29 "https://en.wikipedia.org/wiki/Defense_in_depth_(computing)") advocates for adding defenses to as many layers of a system as possible, so that if one is bypassed, another may still prevent full infiltration. An example of defense in depth outside the context of cybersecurity would be a garage that requires entering an electronic code, using a key on a bolted door lock, then finally disabling a voice-activated internal alarm system to open the garage.

###### Security Controls and Strategies

To meet the ideals of concepts such as least privilege, open security, and defense-in-depth, we need to implement Security Strategies. These can include interventions like:

- 24/7 vigilance.
- Threat modelling.
- Table top discussions.
- Continuous training on tactics, processes, and procedures.
- Continuous automated patching.
- Continuous supply chain verification.
- Secure coding and design.
- Daily log reviews.
- Multiple layers of well-implemented Security Controls.

###### Shift-Left Security

One of the best ways to avoid extra costs and impacts to availability is to design an entire system so that security is built into the service architecture, rather than requiring many additional software layers. In order to design systems with built-in security, the idea of [shift-left security](https://devopedia.org/shift-left) can improve efficiency. The idea of shift-left security is to consider security engineering from the outset when designing a product or system, rather than attempt to bake it in after the product has been built.

###### Administrative Segmentation

It may seem okay to have an administrator bypass security controls based on their role and functional needs. Shouldn't we trust our administrators? However, when a threat is internal or otherwise able to obtain valid administrative credentials, our security posture becomes weaker. In order to defeat internal threats and threats that have acquired valid credentials or authentication capability, we must segment controls so that no single authority can bypass all controls. In order to accomplish this, we may need to split controls between application teams and administrators, or split access for administration between multiple administrators, as with [Shamir's Secret Sharing (SSS)](https://en.wikipedia.org/wiki/Shamir%27s_secret_sharing).

###### Threat Modelling and Threat Intelligence

**Record-keeping of all assets within an organization:** inventory

After we've completed an inventory for both systems and software and we understand our organization's requirements, we're ready to begin researching potential threats. Security teams research (or leverage vendor research about) threats to different industries and software. We can use this information in our [Threat Modelling](https://csrc.nist.gov/glossary/term/threat_modeling). Threat modelling describes taking data from real-world adversaries and evaluating those attack patterns and techniques against our people, processes, systems, and software. It is important to consider how the compromise of one system in our network might impact others.

[Threat Intelligence](https://csrc.nist.gov/glossary/term/threat_intelligence)

###### Table-Top Tactics

After concerning threat intelligence or other important information is received, enterprises may benefit from immediately scheduling a cross organization discussion. One type of discussion is known as a table-top, which brings together engineers, stakeholders, and security professionals to discuss how the organization might react to various types of disasters and attacks. Conducting regular table-tops to evaluate different systems and environments is a great way to ensure that all teams know the [Tactics, Techniques, and Procedures (TTPs)](https://csrc.nist.gov/glossary/term/tactics_techniques_and_procedures) for handling various scenarios. Often organizations don't build out proper TTPs, resulting in longer incident response times.

**BCP**
Table-top security sessions are part of [Business Continuity Planning (BCP)](https://en.wikipedia.org/wiki/Business_continuity_planning). BCP also includes many other aspects such as live drill responses to situations like ransomware and supply-chain compromise. BCP extends outside of cybersecurity emergencies to include processes and procedures for natural disasters and gun violence. Routine table-top sessions and continuous gathering of relevant intelligence provides a proactive effort for mitigating future issues as well as rehearsing tactics, processes, and procedures.

###### Continuous Patching and Supply Chain Validation

**continuous automated patching** is accomplished by pulling the upstream source code and applying it to the lowest development environment. Next, the change is tested, and only moved to production if it is successful. We can leverage cloud provider infrastructure to more easily spin up complete replicas of environments for testing these changes.

**Continuous supply chain validation** occurs when people and systems validate that the software and hardware received from vendors is the expected material and that it hasn't been tampered with, as well as ensuring output software and materials are verifiable by customers and business partners. Continuous supply chain validation is difficult, and sometimes requires more than software checks, such as physical inspections of equipment ordered. On the software side of supply chain security, we can use deeper testing and inspection techniques to evaluate upstream data more closely. We might opt to increase the security testing duration to attempt to detect sleeper malware implanted in upstream sources. **Sleeper malware** is software that is inactive while on a a system for a period of time, potentially weeks, before it starts taking action.

Utilizing a **software bill of materials** [SBOM](https://www.cisa.gov/sbom) as a way to track dependencies automatically in the application build process greatly helps us evaluate supply chain tampering. If we identify the software dependencies, create an SBOM with them, and package the container and SBOM together in a cryptographically-verifiable way, then we can verify the container's SBOM signature before loading it into to production.

###### Encryption

**ASPECT:** TLS

**Identity is accomplished through which cryptographic concept?:** signing

ephemeral encryption is [TLS](https://en.wikipedia.org/wiki/Transport_Layer_Security), in which nobody but the server and the client of that specific interaction can decrypt the information (not even the administrators), and the decryption keys only exist in memory for a brief time before being discarded. This type of privacy is commonly used when sending secrets or Personal Identifiable Information (PII) across the wire. PII can include names, addresses, phone numbers, email addresses, SSNs, and other information that can be used to track down or spy on an individual person.

ensure that only the minimum required persons or systems can decrypt said data. We also probably want backups that are encrypted with different keys. In general, we don't want to re-use encryption keys for different uses, as each key should only have one purpose. We also should implement protocols for routinely restoring from backups to ensure that we know how, and that the process works for every component.

###### Logging and Chaos Testing

[Chaos testing](https://www.ibm.com/garage/method/practices/manage/practice_chaotic_testing/) is a type of BCP or disaster recovery [DR](https://www.vmware.com/Modules/glossary/content/disaster-recovery.html) practice that is often handled via automation. For example, we might leverage a virtual machine that has valid administrative credentials in the production network to cause intentional disasters from within. Chaos engineering includes a variety of different approaches, such as having red teams create chaos in the organization to test how well the organization is able to handle it, scheduling programmed machine shutdowns at various intervals, or having authenticated malicious platform API commands sent in. The goal is to test controls during messy/unpredictable situations.

##### 3.5 Cybersecurity Laws, Regulations, Standards, and Frameworks

- Gain a broad understanding of various legal and regulatory issues surrounding cybersecurity.
- Understand different frameworks and standards that help organizations orient their cybersecurity activities.

###### Laws and Regulations

HIPAA: The Health Insurance Portability and Accountability Act of 1996 (HIPAA)1 is a United States federal law regulating health care coverage and the privacy of patient health information. Included in this law was a requirement to create of a set of standards for protecting patient health information, known as Protected Health Information (PHI). The standards that regulate how PHI can be used and disclosed are established by the **Privacy Rule**. This rule sets limits on what information can be shared without a patient's consent and grants patients a number of additional rights over their information, such as the right to obtain a copy of their health records.

Another rule known as the **Security Rule** outlines how electronic PHI (e-PHI) must be protected. It describes three classes of safeguards that must be in place: administrative (having a designated security official, a security management process, periodic assessments, etc.), physical (facility access control, device security), and technical (access control, transmission security, audit abilities, etc.). These rules also include provisions for enforcement and monetary penalties for non-compliance. Importantly, HIPAA also requires that covered entities (healthcare providers, health plans, business associates, etc.) provide notification4 in the event that a PHI breach occurs.

FERPA: The Family Educational Rights and Privacy Act of 1974 (FERPA)5 is a United States federal law regulating the privacy of learners' education records. This law6 sets limits upon the disclosure and use of these records without parents' or learners' consent. Some instances where schools are permitted to disclose these records are school transfers, cases of health or safety emergency, and compliance with a judicial order.

FERPA also grants parents and learners over the age of 18 a number of rights over this information. These rights include the right to inspect these records, the right to request modification to inaccurate or misleading records, and more. Schools that fail to comply with these laws risk losing access to federal funding.

GLBA: The Gramm-Leach-Bliley Act (GLBA),7 enacted by the United States Congress in 1999, establishes a number of requirements that financial institutions must follow to protect consumers' financial information. This law requires that institutions describe how they use and share information and allow individuals to opt out in certain cases.

Like other cybersecurity laws, GLBA requires that financial institutions ensure the confidentiality and integrity of customer financial information by anticipating threats to security and taking steps to protect against unauthorized access. In addition, financial institutions must also describe the steps that they are taking to achieve this.

GDPR: The General Data Protection Regulation (GDPR)8 is a law adopted by the European Union9 in 2016 that regulates data privacy and security. It applies to the private sector and most public sector entities that collect and process personal data. It provides individuals with a wide set of rights over their data including the well-known "right to be forgotten" and other rights related to notifications of data breaches and portability of data between providers.

GDPR outlines a strict legal baseline for processing personal data. For example, personal data may be processed only if the data subject has given consent, to comply with legal obligations, to perform certain tasks in the public interest, or for other "legitimate interests". For businesses that process data on a large scale or for whom data processing is a core operation, a data protection officer - who is responsible for overseeing data protection - must be appointed.

GDPR also establishes an independent supervisory authority to audit and enforce compliance with these regulations and administer punishment for non-compliance. The fines for violating these regulations are very high: a maximum of 20 million Euros or 4% of revenue (whichever is higher), plus any additional damages that individuals may seek.

One unique aspect of GDPR is that it applies to any entity collecting or processing data related to people in the European Union, regardless of that entity's location. At the time of its adoption, it was considered the most strict data privacy law in the world and has since become a model for a number of laws and regulations enacted around the globe.

Key disclosure laws10 are laws that compel the disclosure of cryptographic keys or passwords under specific conditions. This is typically done as part of a criminal investigation when seeking evidence of a suspected crime. A number of countries have adopted key disclosure laws requiring disclosure under varying conditions. For instance, Part III of the United Kingdom's Regulation of Investigatory Powers Act 2000 (RIPA)11 grants authorities the power to force suspects to disclose decryption keys or decrypt data. Failure to comply is punishable by a maximum of two years in prison or five years if a matter of national security or child indecency is involved.

CCPA: The California Consumer Privacy Act of 2018 (CCPA)12 is a Californian law granting residents of the state certain privacy rights concerning personal information held by for-profit businesses. One of these rights is the "right to know", which requires business to to disclose to consumers, upon request, what personal information has been collected, used, and sold about them, and why. The "right to opt-out" also allows consumers to request that their personal information not be sold, something that must, with few exceptions, be approved. Another right is the "right to delete", which allows consumers to request that businesses delete collected personal information. In this case, however, there are a number of exceptions that allow business to decline these requests.

1
(CDC, 2022), https://www.cdc.gov/phlp/publications/Module/hipaa.html ↩︎

2
(HHS, 2013), https://www.hhs.gov/hipaa/for-professionals/privacy/laws-regulations/index.html ↩︎

3
(HHS, 2013), https://www.hhs.gov/hipaa/for-professionals/security/laws-regulations/index.html ↩︎

4
(HHS, 2013), https://www.hhs.gov/hipaa/for-professionals/breach-notification/index.html ↩︎

5
(ED, 2022), https://learnerprivacy.ed.gov/faq/what-ferpa ↩︎

6
(CDC, 2022), https://www.cdc.gov/phlp/publications/Module/ferpa.html ↩︎

7
(FDIC, 2022), https://www.fdic.gov/consumers/consumer/alerts/glba.html ↩︎

8
(Proton AG, 2022), https://gdpr.eu/what-is-gdpr/ ↩︎

9
(EU, 2022), https://eur-lex.europa.eu/legal-content/EN/LSU/?uri=uriserv:OJ.L_.2016.119.01.0001.01.ENG ↩︎

10
(Wikipedia, 2022), [https://en.wikipedia.org/wiki/Key\_disclosure\_law](https://en.wikipedia.org/wiki/Key_disclosure_law) ↩︎

11
(Open Rights, 2021), [https://wiki.openrightsgroup.org/wiki/Regulation\_of\_Investigatory\_Powers\_Act\_2000/Part\_III](https://wiki.openrightsgroup.org/wiki/Regulation_of_Investigatory_Powers_Act_2000/Part_III) ↩︎

12
(SoC DoJ, 2022), https://oag.ca.gov/privacy/ccpa ↩︎

###### Standards and Frameworks

**PCI DSS:** The Payment Card Industry Data Security Standard (PCI DSS)1 is an information security standard, first published in 2004, for organizations handling customer payment data for a number of major credit card companies. It is managed by the Payment Card Industry Standards Council. It's purpose is to ensure that payment data is properly secured in order to reduce the risk of credit card fraud. As with other frameworks, PCI DSS consists of a number of requirements, compliance with which must be assessed annually. Most of these requirements resemble other industry best practices regarding network and system security, access control, vulnerability management, monitoring, etc. For example, Requirement 2 prohibits the use of vendor-supplied defaults for system passwords and other security-related parameters. Other requirements are credit-card specific formulations of other familiar best practices. For example, Requirement 3 outlines what types of credit card data can be stored and how it must be protected.

**CIS Top 18:** The Center for Internet Security (CIS) Critical Security Controls, also known as CIS Controls,2 are a set of 18 (previously 20) recommended controls intended to increase an organization's security posture. While not themselves laws or regulations, these controls pertain to a number of areas that regulations are concerned with, including data protection, access control management, continuous vulnerability management, malware detection, and more.

These controls are divided into a number of safeguards (previously known as sub-controls), which, in turn, are grouped into three implementation groups intended to help prioritize safeguard implementation. IG1 consists of controls that are considered the minimum standard for information security meant to protect against the most common attacks and should be implemented by every organization. They are typically implemented by small businesses with limited IT expertise that manage data of low sensitivity. IG2 is composed of additional safeguards that are meant to apply to more complex organizations, typically those with multiple departments and staff dedicated to managing IT infrastructure with more sensitive customer and proprietary data. IG3, which consists of all safeguards, is typically implemented by organizations with dedicated cybersecurity experts managing sensitive data that may be subject to oversight.

**NIST Cybersecurity Framework:** The National Institute for Standards and Technology (NIST) Cybersecurity Framework4 is a collection of standards and practices designed to help organizations understand and reduce cybersecurity risk. It was originally developed to help protect critical infrastructure; however, it has been subsequently adopted by a wide array of organizations.5

The NIST framework consists of three components:6 Core, Implementation Tiers, and Profiles. The Framework Core is a set of cybersecurity activities and outcomes. It is divided into five high-level functions that encompass a number of categories (for example, Asset Management and Risk Assessment). These categories, in turn, include subcategories that consist of statements describing the outcome of improved security and which are aligned with Information References. These references go into deeper detail about possible technical implementations. For example, Subcategory ID.BE-1 (Function: Identify, Category: Business Environment) states "The organization's role in the supply chain is identified and communicated."

The Framework Implementation Tiers specify the degree to which an organization's Cybersecurity practices satisfy the outcome described by the subcategories of the Framework Core. There are four such Tiers: partial (the least degree), risk informed, repeatable, and adaptive. Framework Profiles refer to the relationship between the present implementation of an organization's cybersecurity activities (Current Profile) and their desired outcome (Target Profile), which is determined by the organization's business objectives, requirements, controls and risk appetite. The comparison of these profiles can help the organization perform a gap analysis, as well as understand and prioritize the work required to fill it.

**ATT3CK and D3FEND:** The MITRE organization has tabulated and organized a framework for cataloging how groups of attackers work together to infiltrate systems and achieve their goals. This framework, called the MITRE ATT3CK8 framework, is constantly updated to reflect the latest TTPs used by malicious groups across the globe. More details about the ATT3CK framework and how adversaries can be classified is available in OffSec's SOC-200 course.

More recently, MITRE released a mirrored framework from the defensive perspective. While ATT3CK is meant to catalog and categorize the various ways that threat actors operate in the real world, D3FEND9 portrays a set of best practices, actions, and methodologies employed by defenders to prevent, detect, mitigate, and react to attacks.

**Cyber Kill Chain:** The Cyber Kill Chain is a methodology developed by Lockheed Martin to help defenders identify and defend against cyber attacks. It outlines seven stages of the attack lifecycle: reconnaissance, weaponization, delivery, exploitation, installation, command and control, and actions on objectives.

In the reconnaissance phase, an attacker identifies a target and enumerates potential weaknesses through which it may be exploited. Weaponization is the process by which an attack method to exploit this weakness is identified. This attack is launched in the delivery phase and, in the exploitation phase, the payload is executed on the target system. This leads to the installation stage in which malware is installed on the system. This malware is used to execute further commands in the command and control phase. In the actions on objectives phase, the attacker performs the actions required to achieve their ultimate goals, which may be data theft, modification, destruction, etc.

**FedRAMP:** The Federal Risk and Authorization Management Program (FedRAMP)12 is a United States program13 that provides a standardized security framework for cloud services used by the federal government. Whereas previously, a cloud service may have been required to obtain different authorizations for different federal agencies, FedRAMP allows a cloud service to obtain a single authorization for all government agencies. Its goal is to accelerate the government's adoption of cloud services while also ensuring that these services are secure. The controls are based off of NIST SP 800-53 Revision 4 and enhanced by a number of additional controls that pertain specifically to cloud computing. More details pertaining to cloud technology are explored in OffSec's CLD-100.

1
(PCISSC, 2022), https://docs-prv.pcisecuritystandards.org/PCI DSS/Supporting Document/PCI\_DSS-QRG-v3\_2_1.pdf ↩︎

2
(CIS, 2022), https://www.cisecurity.org/controls/cis-controls-list ↩︎

3
(CIS, 2022), https://www.cisecurity.org/controls/implementation-groups ↩︎

4
(NIST, 2022), https://www.nist.gov/industry-impacts/cybersecurity-framework ↩︎

5
(NIST, 2022), https://www.nist.gov/cyberframework/getting-started ↩︎

6
(NIST, 2022), https://www.nist.gov/cyberframework/online-learning/components-framework ↩︎

7
(MITRE, 2022), https://www.mitre.org/ ↩︎

8
(MITRE, 2022), https://attack.mitre.org/ ↩︎

9
(MITRE, 2022), https://d3fend.mitre.org/ ↩︎

10
(Lockeheed Martin, 2022), https://www.lockheedmartin.com/en-us/capabilities/cyber/cyber-kill-chain.html ↩︎

11
(Crowdstrike, 2022), https://www.crowdstrike.com/cybersecurity-101/cyber-kill-chain/ ↩︎

12
(GSA, 2022), https://www.fedramp.gov/program-basics/ ↩︎

13
(GSA, 2022), https://www.gsa.gov/technology/government-it-initiatives/fedramp ↩︎

##### 3.6 Career Opportunities in Cybersecurity

###### Cybersecurity Career Opportunities: Attack

Network Penetration Tester: A Network Penetration Tester is responsible for discovering and exploiting vulnerabilities that exist in a targeted network. This career may be a good choice for someone who has a strong understanding of networking and systems and enjoys finding ways of subverting their security measures. This role also benefits from clear technical writing abilities. To learn such skills, we suggest reviewing OffSec's PEN courses at the 100, 200, and 300 levels.

Web Application Testers: A Web Application Tester is responsible for testing web applications for security weaknesses. A good candidate for this role likely has a strong knowledge of web application vulnerabilities, enjoys testing them, and enjoys subverting the security measures that they employ. The skills required to become a Web Application Tester are covered in the WEB track at the 100, 200, and 300 levels. These Modules teach the basics of how web applications work as well black-box and white-box approaches to web application testing.

Cloud Penetration Tester: A Cloud Penetration Tester is responsible for performing penetration testing on cloud infrastructure. This might be a good career path for someone who has knowledge and experience in cloud infrastructure and penetration testing. As with other penetration testing positions, you may enjoy this role if you have fun probing infrastructure for weaknesses and figuring out ways to exploit them. CLD-100 teaches learners how to test, attack, and exploit cloud technologies.

Exploit Developer: An Exploit Developer is responsible for discovering and developing exploits for software vulnerabilities. Someone looking to become an Exploit Developer might enjoy reverse engineering applications to determine how they work, reading low-level code, and bypassing security mitigations. The EXP-301 course offers more information about Windows binary exploitation, while EXP-312 explores macOS logical exploitation.

Vulnerability Researcher:A Vulnerability Researcher is responsible for researching new software vulnerabilities and exploitation techniques, determining their impact, developing Proofs of Concept (PoCs), and communicating their findings to different stakeholders. A person may wish to be a Vulnerability Researcher if they enjoy reverse engineering and researching new and emerging vulnerabilities and techniques. You can follow EXP-301 and EXP-312 to learn how to reverse engineer and develop exploits for Windows and macOS software, respectively.

###### Cybersecurity Career Opportunities: Defend

SOC Analyst: A SOC Analyst is responsible for monitoring, triaging and, when necessary, escalating security alerts that arise from within monitored networks. Someone may be a good fit for this position if they enjoy investigating and gathering information surrounding suspicious activity. To prepare, we recommend following the SOC track at the 100 and 200 levels in the OffSec library. SOC Modules will explore the techniques attackers use to infiltrate networks and those that analysts use to discover this activity.

Malware Analyst: A Malware Analyst is responsible for analyzing suspected or confirmed malware samples in order to determine how they work and, ultimately, what their purpose is. Someone might enjoy this role if they have a basic understanding of networking and like analyzing suspicious samples and reverse engineering.

The OffSec library contains a number of resources that can help learners learn these skills. For example, EXP-301 teaches reverse engineering and some basics of the Windows API. PEN courses at the 200 and 300 levels describe how attackers craft malicious documents and payloads as well as the techniques that they use to evade antivirus and other detection mechanisms. Finally, the 100-level library contains Modules that can help to learn the basics of networking.

Digital Forensics Analyst: A Digital Forensics Analyst is responsible for investigating Cybersecurity incidents by gathering and analyzing evidence of intrusions and recovering data. Someone who enjoys this role likely has a strong understanding of how systems and networks operate and is interested in investigating how intrusions occur, then assembling evidence into a complete story. To begin learning these skills, we recommend reviewing the SOC track at the 100 and 200 levels. SOC-200 shows some of the specific ways attackers operate and how to search for evidence of their attacks.

Incident Responder: An Incident Responder is responsible for reacting to cybersecurity events. This includes identifying the cause and scope of an incident and recommending measures to contain, eliminate, and recover from it. Someone may be a good fit for this role if they have a strong technical background and enjoy working in a fast-paced environment and performing root cause analysis. This role also benefits from strong cross-functional communication skills. Starting with the SOC track at the 100 and 200 level will help learners prepare for this career. SOC-200 in particular shows some of the ways attackers operate and how to search for evidence of their attacks.

Threat Hunter: A Threat Hunter is responsible for proactively searching networks and systems for Indicators of Compromise (IOCs) using the most up-to-date threat intelligence. This role could be a good choice for someone who enjoys following the most recent cybersecurity feeds and searching for malicious activity that may have evaded existing defenses. There are a number of resources in the OffSec library that can help to prepare for this position. For example, the SOC track at the 100 and 200 levels teaches about common techniques used by attackers and how to search for and identify them. The PEN-300 course is helpful to learn about the ways that attackers bypass existing defenses.

###### Cybersecurity Career Opportunities: Build

Cloud Engineer: A Cloud Engineer is responsible for building and maintaining the cloud infrastructure. This role encompasses a number of more specialized positions, including Cloud Architect, and, with the usual exception of that position, typically involves the implementation of the cloud architecture as outlined by the company's cloud-computing strategy. This career may be a good fit for someone who enjoys programming and building infrastructure, and has experience with cloud service providers and other cloud-related technologies.

Cloud Architect: A Cloud Architect is responsible for designing and overseeing the implementation of a cloud-computing strategy aligned with the business's goals and needs. Individuals with a deep, cutting-edge understanding of cloud computing who enjoy developing high-level business strategy and excel at communicating technical concepts across business areas may enjoy this role.

OffSec's CLD-100 offers more information about important cloud concepts and technologies. It teaches learners how to build clouds safely and secure these technologies.

Developer: A Software Developer is responsible for writing computer programs which, depending on the precise role, may range from core operating system components to desktop, mobile and web applications. Someone who enjoys designing elegant and efficient programmatic solutions to problems may enjoy this role. Depending on the type of software development, the OffSec Library contains a considerable number of resources to help learners understand attack vectors and create secure software. A general understanding of software vulnerabilities is available in the PEN-200 course, while information about web development can be found in OffSec's WEB courses at the 200 and 300 level. Those who may be programming in memory-unsafe languages such as C may be interested in the EXP-301 and EXP-312 courses.

DevSecOps: DevSecOps (an abbreviation for Development, Security and Operations) is an approach to software development that integrates security into all stages of the software development lifecycle, rather than postponing it to the end. A DevSecOps Engineer5 is responsible for automating security testing and other security-related processes. This role might be a good fit for someone who has an understanding of Continuous Integration / Continuous Development (CI/CD) pipeline and tools, an interest in security testing automation, and the ability to work in a fast-paced environment.

The OffSec Library contains a considerable number of resources that can help learners with software development, including understanding the different attack vectors to automate testing for and the types of automation testing tools available. This information can be found in the WEB and PEN courses at the 200 and 300 level. CLD-100 also provides details about Docker and Kubernetes: two essential tools for DevSecOps.

Site Reliability Engineer: A Site Reliability Engineer is responsible for ensuring and improving the availability and performance of software systems. A person may wish to be a Site Reliability Engineer if they have software development experience and are interested in using automation to monitor for, alert, and respond to reliability-related issues. learners can learn about containers and Kubernetes, some of the key technologies used to support SRE, by following CLD-100 in the OffSec library.

System Hardener (System Administrator): A System Hardener is responsible for configuring systems to reduce their security risk. This involves changing insecure default configurations, removing unused programs, ensuring firewalls are appropriately restrictive, etc. A person may seek out this career if they have experience with system administration, are familiar with attack techniques, and enjoy making systems and the data they store more secure. Many of the skills required for this position are covered in the PEN track at the 100, 200 and 300 levels. PEN-100, for instance, explores some of the basics of networking and system administration. PEN-200 describes some of the common techniques that attackers use. PEN-300 teaches more advanced techniques that attackers use to bypass defenses.

#### 4 Effective Learning Strategies

##### 4.1 Learning Theory

###### Memory Mechanisms and Dual Coding

1.  Improve the quality of information we take in
2.  Improve the way or mode in which we receive information
3.  Improve our practice of retrieving information
    We will explore all of these more, but for now, let's review them quickly:

- Improve the quality of information we take in: At a basic level, we expect our training material to be accurate. We might need explanatory paragraphs (like this one), written in a simple, easy-to-understand manner. This responsibility generally falls to the instructor or training provider.
    
- Improve the way or mode in which we receive information: This could include multiple approaches. Information might be more easily retained if presented in multiple formats, such as videos or images. This might also comprise, for example, a safe, distraction-free environment for the learner.
    
- Improve our practice of retrieving information: This may seem like merely exam practice at first, but there's more to it than that. A learner who reads a paragraph about how to create a file and then follows along to create a file independently is working on memory retrieval.
    

###### The Forgetting Curve and Cognitive Load

In 1885, learning scientist Hermann Ebbinghaus set out to memorize a few documents, then tested himself repeatedly on what he remembered. He was only able to remember all of the details if he tested himself immediately after memorizing. Ebbinghaus found he only remembered 100 percent of the information at the time of acquisition. After that, he started forgetting information very quickly. When he waited 20 minutes, he could only remember 58%. A day later, he could only remember 23%. He called this decline The **Forgetting Curve**.

The second problem, which we've referred to as "too much information at once", is usually referred to as **Cognitive Load**.

To better understand cognitive load, it may be helpful to imagine our brain as sort of a room, with pieces of information (that take up space) moving in and out. At some point, if more and more information keeps coming in, there simply isn't enough space for everything to stay organized. Pretty soon, the room is too full and there isn't enough space for more to come in through the door.

##### 4.2 Unique Challenges to Learning Technical Skills

- Recognize the differences and advantages of digital learning materials.
- Understand the challenge of preparing for unknown scenarios.
- Understand the potential challenges of remote or asynchronous learning.

###### Digital vs. Print Materials

Perhaps the more important thing to note here, has to do with a concept known as Contextual Learning. Although we can't explore all of its details in this Module, this concept suggests that even on an intuitive level, we know that it's easier to learn how to build a house on a construction site.

In other words, when the training material is presented in the same context as the skill that we're trying to learn, our brain has to do less translation work and can accept the new information more readily. This doesn't mean that books about computers are worthless - it just means that our brains have to do more work to assimilate information from the page and think about it in the context of the computer screen.

###### Expecting the Unexpected

learning about cyber security is similar to learning [transversal skills](https://ervet-journal.springeropen.com/articles/10.1186/s40461-020-00100-0) like leadership, communication, and teamwork. As with these skills, we cannot afford to focus on memorizing a series of steps to take. There is no simple, straightforward standard operating procedure for building better teamwork just as there is no simple, straightforward standard operating procedure for exploit development. Instead, we need to focus on understanding methods, techniques, and the purpose behind certain actions.

Let's return briefly to our example of learning how to secure a network. We mentioned that "A network that is secure today may not be secure in six months." The best approach to this problem is not to learn a series of steps we can follow to make that network secure today, then learn a new set of steps in six months. The solution is to learn the methodology and the purpose behind each security step. When new risks arise, we'll apply the same methodology, adapting and evolving along with the changing threat landscape.

###### The Challenges of Remote and Asynchronous Learning

Learners in a remote, asynchronous learning environment should be aware of two things:

- The advantages that come from the peer support, community, and camaraderie of other learners in a traditional classroom setting is no longer a guarantee.
- The pace and timing of the course is largely the learner's responsibility.

##### 4.3 OffSec Training Methodology

- Understand what is meant by a Demonstrative Methodology.
- Understand the challenge of preparing for unknown scenarios.
- Understand the potential challenges of remote or asynchronous learning.

###### The Demonstration Method

Before showing the code block, we would first lay out our plan and detail any new or interesting commands we're planning on running. Here we might discuss that we'll use ls *.txt to list any .txt files in the directory. Next, we will run our renaming command, mv oldfilename.txt newfilename.txt. Finally, we'll use ls *.txt to check if our command worked.

```bash
kali@kali:~$ ls *.txt
oldfilename.txt

kali@kali:~$ mv oldfilename.txt newfilename.txt
 
kali@kali:~$ ls *.txt
newfilename.txt
```

After the code listing, we would explain our results. In this case, we listed the .txt files and only had one, named oldfilename.txt. We then ran our renaming command and received no output, as expected. Finally, we checked our results by running ls *.txt again. This time, the output shows the only .txt file in the directory is newfilename.txt. We could take further steps to ensure this file contains the same contents as earlier, and that only the filename has changed.

Demonstrating a thought process in this manner is [called modeling](https://www.intel.com/content/dam/www/program/education/us/en/documents/project-design/strategies/instructionalstrategies-modeling.pdf), and was developed as a way to teach [critical thinking](https://www.researchgate.net/profile/Marie-france_Daniel/publication/262849880_Modeling_the_Development_Process_of_Dialogical_Critical_Thinking_in_Pupils_Aged_10_to_12_Years/links/54ee0f110cf25238f93984dd.pdf) skills.

###### Facing Difficulty

[The Try Harder Mindset](https://www.offsec.com/offsec/what-it-means-to-try-harder/)

1.  Be persistent
2.  Be creative
3.  Be perceptive
    1.  In other words, try smarter

###### Contextual Learning and Interleaving

Learning new skills in a [realistic context](https://www.timeshighereducation.com/campus/contextual-learning-linking-learning-real-world) drastically improves a learner's retention and success.

##### 4.2 Case Study: chmod -x chmod

- Review a sample of learning material about the executable permission, expand beyond the initial information set, and work through a problem.
- Understand how OffSec's approach to teaching is reflected in the sample material.

###### What is Executable Permission?

[file permissions](https://www.studytonight.com/linux-guide/understanding-file-permissions-in-linux-unix)

Let's open a terminal and review how this works in practice. We'll `touch` a file (newfilename.txt), which will create it and automatically make us the owner. Then we'll use the listing command ls3 to gather information about the file, providing the -l parameter that will produce a long listing including the file permissions.

```
touch newfilename.txt
ls -l newfilename.txt
```

The output of the ls command includes information about the permissions as indicated by the letters rwx, where the "r" is for read, the "w" is for write, and the "x" is for execute. A dash (-) indicates that the user class doesn't have the corresponding permissions. In this case, we have permission to read and write to our new file, but there is no "x" character in the output, meaning no class has permission to execute.

In this scenario, let's say we have a simple program that will give us a complete list of employee names. This program is a Python script we've created named find\_employee\_names.py. Let's try to run the script.

```
./find_employee_names.py
ls -l find_employee_names.py
```

Let's change the executable permission for this file and give ourselves permission to execute the file (put another way, to run it as a program). We can use chmod +x to add the executable permission to our script file. Let's do so and try running the script again.

```bash
kali@kali:~$ chmod +x find_employee_names.py

kali@kali:~$ ls -l find_employee_names.py
-rwxr-xr-x 1 kali kali 206 Jun  7 12:31 find_employee_names.py

kali@kali:~$  ./find_employee_names.py
R. Jones
R. Diggs
G. Grice
C. Smith
C. Woods
D. Coles
J. Hunter
L. Hawkins
E. Turner
D. Hill
```

Let's now change it back so that we no longer have permission to execute the file. To add the permission, we used chmod +x, so this time, we will use chmod -x.

```bash
kali@kali:~$ chmod -x find_employee_names.py

kali@kali:~$ ./find_employee_names.py
zsh: permission denied: ./find_employee_names.py
```

###### Going Deeper: Encountering a Strange Problem

Now, let's ask ourselves an interesting question: since chmod is the tool that allows us to set permissions, what would we do if we did not have permission to execute it?

```bash
kali@kali:~$ ./find_employee_names.py
zsh: permission denied: ./find_employee_names.py

kali@kali:~$ chmod +x find_employee_names.py
zsh: permission denied: chmod
```

We could try running chmod on the chmod file, but we will run into the same problem. Let's run it on /usr/bin/chmod, since this is the specific location of the file.

```bash
kali@kali:~$ chmod +x /usr/bin/chmod
zsh: permission denied: chmod
```

###### One Potential Solution

We'll start by making a copy of a file that we know has the permission set we need. Since we checked the ls command earlier, let's copy that file into a new file named `chmodfix`.

```bash
kali@kali:~$ cp /usr/bin/ls chmodfix

kali@kali:~$ ls -l chmodfix
-rwxr-xr-x 1 kali kali 147176 Jun  8 08:16 chmodfix
```

Since the only thing that seems to be "broken" with our chmod file is the permissions (as far as we know, the contents of the file itself are fine), let's try to copy only the contents of the file and not the permissions. In other words, we only need the contents of the file - not the entire thing.

Since we know that cp will copy the entire file, we can't use that approach. The cat command1 is often used to show the contents of a file, so we will use that. Instead of just sending the contents of the file to display in the terminal window, we can use the ">" character to send them into our chmodfix file.

First, we'll run ls -l so that we can easily confirm whether or not the file contents change.

```bash
kali@kali:~$ ls -l chmodfix
-rwxr-xr-x 1 kali kali 147176 Jun  8 08:20 chmodfix

kali@kali:~$ cat /usr/bin/chmod > chmodfix

kali@kali:~$ ls -l chmodfix
-rwxr-xr-x 1 kali kali 64448 Jun  8 08:21 chmodfix
```

We previously examined the -rwxr-xr-x portion of the output. We'll also notice a number, "147176" in the case of the first command, in the output. This number indicates the size of the file. After we run the cat command, we'll observe that the file name and the permissions are still the same as before, but the file size is now "64448". This output indicates that the contents of the file have changed, but the permissions remained intact.

Let's go one step further and restore our system so that we don't run into this problem again. Let's try and run the chmodfix command on the original chmod file to fix things.

```bash
kali@kali:~$ ./chmodfix +x /usr/bin/chmod
./chmodfix: changing permissions of '/usr/bin/chmod': Operation not permitted
```

Let's try running the command again, but this time as a Super User. To do this, we'll use the sudo command,2 followed by our original command. The system will prompt us for our password.

```bash
kali@kali:~$ sudo ./chmodfix +x /usr/bin/chmod
[sudo] password for kali: 
```

Finding unique ways to gain permissions unintended by a particular system is at the core of cyber security. This quick example offers a solid start.

###### Analyzing this Approach

If you are already familiar with chmod, you may have noticed that we chose one of many different methods to use this tool. We chose, for example, not to explore how the permissions for our script (before we were able to execute) could have been represented with the numerical expression 644, which we could have fixed by running chmod 755.

Getting used to "leaving" the immediate problem in order to go do a bit of research is also a critical skill.

As learners, it's imperative that we grow comfortable being in situations we don't fully understand and try things that might not work. The only way to really be prepared for the "unexpected" is to become comfortable in situations where we don't know exactly how things will pan out. Trying out an approach that doesn't work is also a valuable learning experience.

This experiment-and-experiment-again mindset is at the heart of what we believe it takes to be highly successful in this field, and at the risk of being redundant, the goal of our training is always to teach the methodology and the mindset.

##### 4.4 Tactics and Common Methods

- Understand one potential note taking method called Cornell Notes.
- Learn about Retrieval Practice.
- Understand Spaced Practice.
- Explore the SQ3R and PQ4R Method.
- Examine the Feynman Technique.
- Understand the Leitner System.

###### Cornell Notes

The first step is to divide the page into three areas. These are the cue (on the left hand side of the page), the notes (the large area on the right hand side of the page), and the summary (several lines of space at the bottom of the page).

The cue might be questions we have about the text or key words or phrases. To illustrate an example, let's discuss a Module like password hashing. This Module might have key terms to learn such as one-way encryption, salting, and cracking passwords. We might also have a question, for example, "Are some hashing methods better than others?"

The notes section for that page should be directly related to the items in the cue section. For example, near where we've written one-way encryption, we might write a long form definition of what is meant by this term.

Finally, we will complete the summary section as we review our notes. To continue the example, we might write "hashing a password = additional protection. Interested in more about cracking." The content here does not need to necessarily be directly related to the material

![619a2625dbb7c43ff2be15e86d4fd00e-cornell.png](assets/static/resources/619a2625dbb7c43ff2be15e86d4fd00e-cornell.png)

###### Retrieval Practice

Flash cards, [Leitner System](https://www.mindedge.com/learning-science/the-leitner-system-how-does-it-work/)

###### Spaced Practice

[Spaced Practice](https://www.learningscientists.org/blog/2016/7/21-1)

Spaced practice has to do with the timing and duration of our study time. It is recommended to spread out the study time over days and weeks rather than do it all at once. Long, "cramming"-style study sessions actually take more time, often come at the expense of sleep, and (because they overwhelm our cognitive load) are significantly less effective.

###### The SQ3R Method

The [SQ3R method](https://ucc.vt.edu/academic_support/study_skills_information/sq3r_reading-study_system.html) has learners follow a pattern of study activities - survey, question, read, recite, review.

In the case of our current Module, a learner might encounter the various headings and subheadings: Learning Theory, Unique Challenges to Learning Technical Skills, Offsec Training Methodology, and so on. They might then review the subheadings.

Next, they will create, preferably in writing, a list of questions that they hope to have answered via the material. This may or may not reflect what the material will actually cover, but should be based largely on the survey. This is a very important step, as learners will return to the questions repeatedly.

Next, the learner reads the material one section at a time. If there are videos or other activities for this section, they can also complete those.

Next, the learner returns to their list of questions for that smaller section. They should try and recite the questions back from memory and determine if they're now able to answer them.

Finally, in the review, a learner returns to all of the smaller sections from a larger Module or chapter to check whether or not the questions have been answered and they can recall the answers.

###### The Feynman Technique

The [Feynman Technique](https://fs.blog/feynman-technique/) takes its name from Richard Feynman, a Nobel-prize winning physicist with a unique gift for explaining complex Modules in everyday terms. The technique that bears his name has four simple steps:

1.  Learn a Module
2.  Explain it to a beginner
3.  Identify gaps
4.  Return to study

##### 4.6 Advice and Suggestions on Exams

- Develop strategies for dealing with exam-related stress.
- Recognize when you might be ready to take the exam.
- Understand a practical approach to exams.

###### Dealing with Stress

- Take Care of Yourself.
- Schedule and Plan Your Study.
- Have a Growth Mindset.

###### Knowing When You're Ready

![247356f94ff812b8abc45aec089e061e-pwk-stats.png](assets/static/resources/247356f94ff812b8abc45aec089e061e-pwk-stats.png)

###### Practical Advice for Exam Takers

1.  Prepare for the exam
2.  Understand the exam

The first item, preparing for the exam, is tied to everything we've covered elsewhere in this Module. Each exam covers the content from the course, so it follows that reading the course materials, watching any videos, and doing exercises will all be incredibly helpful. Using effective learning strategies will also give learners an advantage.

Second, we recommend understanding the exam. The OffSec help site provides detailed descriptions of each exam, including what exam takers can expect and useful tips about how to approach enumeration tasks or submit proof that you were able to perform the required tasks. These exam descriptions are available alongside other course-specific help items.

##### 4.7 Practical Steps

- Create a long term strategy.
- Understand how to use a time allotment strategy.
- Learn how and when to narrow your focus.
- Understand the importance of a group of co-learners and finding a community.
- Explore how best to pay attention and capitalize on our own successful learning strategies.

###### Creating a Long Term Strategy

Having specific goals will help guide your decisions in terms of how much, when, and what Modules you choose to study.

It's entirely possible that a few weeks into this plan you will need to adjust it or change it, and that's fine. In fact, the best plans often need to be adjusted over time. The alternative - having no plan at all - would mean studying in an ad hoc manner, picking up (and putting down) materials whenever convenient.

###### Use Time Allotment Strategies

Spaced Practice, requires looking at a calendar, finding reasonable time slots, and sticking to a schedule. In addition to avoiding "marathon" sessions whenever possible, there are a few things to consider when choosing the best times to schedule studying.

Some research2has suggested that before sleep might be a great time to study. The danger here is that it is quite easy to push back the bedtime to continue studying. Intuitively, we might think that we are being more productive by staying up later and studying more, but a lack of sleep can negatively impact our brain's ability to retain information. Planning study time also means planning an end to the studying.

If sleep is important for studying, a learner might correctly assume that exercise is as well. Intense physical activity increases blood to flow to the brain, and fires neurons in the hippocampus (the center for memory). In addition to generally improving brain health, exercising either before or after studying can be highly beneficial to improving memory and recall.

###### Norrowing our Focus

Remove distractions, no or slow music without lyrics, no multitasking.

https://link.springer.com/content/pdf/10.3758/BF03197465.pdf

https://www.sciencedirect.com/science/article/abs/pii/S036013151100340X

https://www.forbes.com/sites/travisbradberry/2014/10/08/multitasking-damages-your-brain-and-career-new-studies-suggest/?sh=3cdbceba56ee

https://hbr.org/2010/12/you-cant-multi-task-so-stop-tr

https://www.discovermagazine.com/mind/why-multitasking-does-more-harm-than-good

https://www.theguardian.com/teacher-network/2018/mar/14/sound-how-listening-music-hinders-learning-lessons-research

https://www.utm.utoronto.ca/~w3psygs/ThompsonEtAl2012.pdf

###### Study Your Own Studies

Here is a list of potential questions to ask about the study session:

1.  What time did I start the study session?
2.  How long was the study session?
3.  Did I get interrupted (if so, how did that happen)?
4.  What did I do just before I started studying?
5.  What did I eat or drink before I started studying?
6.  What was my study location like? Was it quiet or busy?
7.  What did I do during the study session specifically?

#### 5 Report Writing for Penetration Testers

##### 5.1 Understanding Note-Taking

- Review the deliverables for penetration testing engagements.
- Understand the importance of note portability.
- Identify the general structure of pentesting documentation.
- Choose the right note-taking tool.
- Understand the importance of taking screenshots.
- Use tools to take screenshots.

###### Penetration Testing Deliverables

While the general execution plan for a penetration test will often follow a particular model, most pentests tend to follow the maxim "no plan survives first contact with the enemy"

As such, instead of preparing a report in advance, the penetration test is executed and notes are taken as it proceeds to ensure that there is a detailed record of what was done. This makes sure that:

- The penetration test can be repeated if it becomes necessary to demonstrate that an issue is real.
- The penetration test can be repeated after remediation to confirm that an issue has been fixed.
- If there's a system failure during the period of the penetration test, the client and tester can determine if the testing was the cause of the failure.

[Rules of Engagement](https://www.microsoft.com/en-us/msrc/pentest-rules-of-engagement)

[OWASP Penetration Testing Execution Standard](https://owasp.org/www-project-web-security-testing-guide/latest/3-The_OWASP_Testing_Framework/1-Penetration_Testing_Methodologies)

###### The General Structure of Penetration Testing Notes

**Notes must be concise and precise**

- Rather than taking a few general notes assuming that we'll remember how to perform certain actions next time, we should record exactly what we did.
- This means that every command that we type, every line of code that we modify, and even anywhere we click in the GUI should be recorded so that we can reproduce our actions.
- Even if we've taken a lot of notes, if looking at them later doesn't help us remember exactly what happened during the assessment, then they won't be particularly useful to us.
- The notes need to be structured and sufficiently detailed to remove any ambiguity.
- To write a convincing and substantiated technical report later, we need to provide sufficient technical details within our notes.
- If the notes are not written coherently, it will be difficult for someone else to repeat the test and get the same results.

A note-taking structure that starts broad and drills down into each section is an easy and expandable method of taking notes. The top-down approach guides us to start with the broadest activity, and then narrow down our focus and expand the level of detail until we have everything we need to replicate exactly what happened.

Let's now look at an example of the notes we might take for a web vulnerability we discovered:

**Must Include Sufficient Detail Points for the Issue**

- **Application Name:** This is important in a multi-application test, and a good habit to get into. The application names also lends itself to building a natural folder and file structure quite nicely.
- **URL:** This is the exact URL that would be used to locate the vulnerability that we've detected.
- **Request Type:** This represents both the type of request (i.e: GET, POST, OPTIONS, etc) that was made, as well as any manual changes we made to it. For example, we might intercept a POST request message and change the username or password before forwarding it on.
- **Issue Detail:** This is the overview of the vulnerability that will be triggered by our actions. For example, we may point to a CVE describing the vulnerability if one exists, and/or explain the impact we observe. We may categorize the impact as denial of service, remote code execution, privilege escalation, and so on.
- **Proof of Concept Payload:** This is a string or code block that will trigger the vulnerability. This is the most important part of the note, as it is what will drive the issue home and allow it to be replicated. It should list all of the necessary preconditions, and provide the exact code or commands that would need to be used to perform the triggers the vulnerability again.

Example:

```
Testing for Cross-Site Scripting 

Testing Target: 192.168.1.52 
Application:    XSSBlog
Date Started:   31 March 2022

1.  Navigated to the application
    http://192.168.1.52/XSSBlog.html
    Result: Blog page displayed as expected
    
2.  Entered our standard XSS test data: 
    You will rejoice to hear that no disaster has accompanied the
    commencement of an enterprise which you have regarded with such
    evil forebodings.<script>alert("Your computer is infected!");</script> 
    I arrived here yesterday, and my first task is to assure my dear
    sister of my welfare and increasing confidence in the success of
    my undertaking. 

3.  Clicked Submit to post the blog entry.
    Result: Blog entry appeared to save correctly.

4.  Navigated to read the blog post
    http://192.168.1.52/XSSRead.php
    Result: The blog started to display and then the expected alert popped up.

5.  Test indicated the site is vulnerable to XSS.

PoC payload: <script>alert(‘Your computer is infected!’)</script>
```

###### Choosing the Right Note-Taking Tool

While a comprehensive list of desirable properties to keep in mind is nearly impossible to enumerate, some of the more important items to remember are:

Screenshots: If a lot of screenshots are necessary, consider a tool that allows for inline screenshot insertion.

Code blocks: Code blocks need formatting to be properly and quickly understood.

Portability: Something that can be used cross-OS, or easily transferred to another place should be high on the list of priorities.

Directory Structure: In an engagement with multiple domains or applications, keeping a coherent structure is necessary. While manually setting up a structure is allowed, a tool that can do this automatically makes things easier.

**Preferred Notes App:** Joplin - Cross platform, MD, export many formats, WebDAV sync.

###### Taking Screenshots

Screenshots are an important way to communicate the visual impact of a finding, and can be far more effective than mere text. For example, it's more effective to show a screenshot of an alert box popping up from an XSS payload than to describe it in words. However, it's more difficult to use a screenshot to describe exactly what's happening when we use something like a buffer overflow payload. Just like we want to use the right tool to perform certain attacks, so we also want to use the right tool to show certain results (such as text vs images).

We can use screenshots to supplement our note-taking or to include them in our report to illustrate the steps we took, which will help another tester reproduce the issues. However, we need to be conscious of the audience. While a penetration tester may consider an alert window to demonstrate XSS as perfectly self-explanatory, developers unfamiliar with the vulnerability may not understand its true cause or impact. It's good practice to always support a screenshot with text.

Screenshots have a specific goal, which is to convey information that would take several sentences to describe or to make an impact. With this in mind, the screenshot should contain exactly enough information to justify not using text, but there shouldn't be too much information to make the screenshot confusing.

There are several pitfalls we should avoid when using screenshots. We have already discussed making sure the screenshots are legible. We must also ensure there isn't more than one concept illustrated in each screenshot. A screenshot that contains two pieces of pertinent information does not lend itself to being easily understood at a glance. We must also ensure the impact is framed properly in the screenshot.

To recap, a good screenshot has the following characteristics:

- Is legible.
- Contains some visual indication that it applies to the client.
- Contains the material that is being described.
- Supports the description of the material.
- Properly frames the material being described.

On the other hand, a bad screenshot is one that:

- Is illegible.
- Is generic rather than client-specific.
- Contains obfuscated or irrelevant information.
- Is improperly framed.

Under the screenshot, we include a caption. A caption is not meant to provide additional context for the picture. A caption is there to describe the picture in a few words. Any additional context that is necessary can be provided in a separate paragraph. In most cases, eight to ten words is an appropriate maximum for a caption.

##### 5.2 Writing Effective Technical Penetration Testing Reports

- Identify the purpose of a technical report.
- Understand how to specifically tailor content.
- Construct an Executive Summary.
- Account for specific test environment considerations.
- Create a technical summary.
- Describe technical findings and recommendations.
- Recognize when to use appendices, resources, and references.

###### Purpose of a Technical Report

To properly prepare a report for the client, we must understand two things:

1.  The purpose of the report.
2.  How we can deliver the information we've collected in a way that the audience can understand.

The end goal is for the client to be presented with a path forward that outlines and highlights all the flaws that are currently present in their systems within the scope of the engagement, ways to fix those flaws in an immediate sense, and strategic goals that will prevent those vulnerabilities from appearing in the future. This output is often provided in the form of a penetration testing report. As far as the client is concerned, the report is (usually) the only deliverable of the engagement that truly matters.

In many cases where we don't find vulnerabilities, we should avoid including too many technical details on what we did in the report. A simple statement that no vulnerabilities have been found is often sufficient. **We should ensure that we don't confuse the client with the technical details of our attempts**, as this will undermine the value of the issues we did actually find It's the tester’s job to present that information in a way that is easy to understand and act upon. **That said, some clients may prefer verbose and deep technical reports even on non-issues**, which leads to another **consideration: the audience**.

Must have an understanding client key business goals and objectives. This is another reason why being clear on the Rules of Engagement is so important, because it gives us a window into the client's core concerns.

All issues discovered in the course of testing should be documented but we will want to highlight any issues we find that would affect these key areas. Examples of client-specific key areas of concern could include HIPAA,1 which is a framework that governs medical data in the US, and PCI,2 which is a framework that governs credit card and payment processing.

**Client A/B Example:** Assume that Client A is a hospital and Client B is a bank.

Client A is a hospital with medical devices connected to their network, doctors and patients who need action to be taken quickly in response to monitoring alerts are very likely to be worried about network up-time and machine readiness. Medical devices connected to the network are often running on old machines with obsolete versions of embedded software. The need for continuous operations may have resulted in these devices missing upgrades and patches. While reporting, the vulnerabilities we find should be highlighted, and then we might make a suggestion to isolate the machines on their own logical subnet given that upgrades or patching cannot be applied promptly.

On the other hand, this exact same scenario on Client B’s network could be catastrophic. If a server or device in a bank is missing a patch, that could very well be a foothold into the network. Because systems will need to communicate with other systems on the network, complete segmentation may not be feasible. Therefore, a missing patch is of far greater concern and may need to be reported as a critical issue.

Keep in mind the **situation under which the vulnerability may be exploited and its potential impact**. A clear text HTTP login on the internet is considered extremely unsafe. On an internal network, while still unsafe, it is less concerning given that more steps must be accomplished to properly exploit it. In much the same way, a hospital may not care that their Internet-facing login portal accepts TLS 1.0 ciphers. An eCommerce site is likely to be much more concerned, given the PCI violation that accepting TLS 1.0 creates.

###### Tailor the Content

We must deliver skill-appropriate content for all the readers of our report. It may be read by executives, the heads of security, and by technical members of the security team. This means we want to not only provide a simple overview of the issues for the executives, but we will also want to provide sufficient technical detail for the more technical readers.

###### Executive Summary

The first section of the report should be an Executive Summary. This enables senior management to understand the scope and outcomes of the testing at a sufficient level to understand the value of the test, and to approve remediation. We start with the quick bite-sized pieces of information that provide the big picture, and follow that up with the full Executive Summary.

The Executive Summary should start with outlining the scope of the engagement. Having a clear scope agreed upon in advance of the testing defines the bounds of what will be covered. We then want to be very clear as to what exactly was tested and whether anything was dropped from the scope. Timing issues, such as insufficient testing time due to finding too many vulnerabilities to adequately report on, should be included to ensure that the scope statement for any subsequent test is appropriate. Including the scope statement in the report protects the penetration tester from any suggestion of not having completed the required testing. It also gives the client a more accurate model of what is practical given the budget and time constraints that were initially set.

Second, time frame:

- Length of time spent testing.
- Dates.
- Potentially testing hours.

Third, Rules of Engagement:

- Reference Referee report if ref was part of test team.
- If DoS allowed, but Social Engineering discouraged that should be noted.
- If specific methodology followed, not here (i.e.- OWASP, OPTES)

Finally, infrastructure and accounts:

```
Executive Summary:

- Scope: https://kali.org/login.php
- Timeframe: Jan 3 - 5, 2022
- OWASP/PCI Testing methodology was used
- Social engineering and DoS testing were not in scope
- No testing accounts were given; testing was black box from an external IP address
- All tests were run from 192.168.1.2"
```

Next, we'll prepare the long-form Executive Summary. This is a written summary of the testing that provides a high-level overview of each step of the engagement and establishes severity, context, and a "worst-case scenario" for the key findings from the testing. It's important not to undersell or oversell the vulnerabilities. We want the client's mental model of their security posture to be accurate. For example, if we've found an SQL injection that enables credit card details to be stolen, then that represents a very different severity than if we've found an authentication bypass on a system hosting public data. We would certainly emphasize the former in the Executive Summary, but we may not highlight the latter in this section.

- Note any trends observed.
    - Provide strategic advice.
    - Describe the trends we've identified and validate our concerns with summaries of one or two of the more important related findings.
    - Group findings with similar vulnerabilities.

**Example:** If we find stored and reflected XSS, along with SQL injection and file upload vulnerabilities, then user input is clearly not being properly sanitized across the board.

- This must be fixed at a systemic level.
- This section is an appropriate place to inform the client of a systemic failure.
- We can recommend the necessary process changes as the remediation.
    - Encourage the client to provide proper security training for their developers.

Executive Summary can generally be broken down as follows:

First we include a few sentences describing the engagement

```
- "The Client hired OffSec to conduct a penetration test of
their kali.org web application in October of 2025. The test was conducted
from a remote IP between the hours of 9 AM and 5 PM, with no users
provided by the Client."
```

Next, we add several sentences that talk about some effective hardening we observed

```
- "The application had many forms of hardening in place. First, OffSec was unable to upload malicious files due to the strong filtering
in place. OffSec was also unable to brute force user accounts
because of the robust lockout policy in place. Finally, the strong
password policy made trivial password attacks unlikely to succeed.
This points to a commendable culture of user account protections."
```

Notice the language here. We do not say something like "It was impossible to upload malicious files", because we cannot make absolute claims without absolute evidence.

Next, we introduce a discussion of the vulnerabilities discovered

```
- "However, there were still areas of concern within the application.
OffSec was able to inject arbitrary JavaScript into the browser of
an unwitting victim that would then be run in the context of that
victim. In conjuction with the username enumeration on the login
field, there seems to be a trend of unsanitized user input compounded
by verbose error messages being returned to the user. This can lead
to some impactful issues, such as password or session stealing. It is
recommended that all input and error messages that are returned to the
user be sanitized and made generic to prevent this class of issue from
cropping up."
```

Several paragraphs of this type may be required, depending on the number and kind of vulnerabilities we found. Use as many as necessary to illustrate the trends, but try not to make up trends where they don't exist.

Finally the Executive Summary should conclude with an engagement wrap-up

```
"These vulnerabilities and their remediations are described in more
detail below. Should any questions arise, OffSec is happy
to provide further advice and remediation help."
```

###### Testing Environment Considerations

- The first section of the full report should detail any issues that affected the testing.
    - This is usually a fairly small section.
    - At times, there are mistakes or extenuating circumstances that occur during an engagement.
        - We should document them in the report to demonstrate that we've been transparent.
    - Inform the client of all circumstances and limitations that affected the engagement.
        - It is important to note that not every issue needs to be highlighted, and regardless of the circumstances of the test, we need to ensure the report is professional.

**Extenuating circumstances:**

**Positive Outcome:** "There were no limitations or extenuating circumstances in the engagement. The time allocated was sufficient to thoroughly test the environment."

**Neutral Outcome:** "There were no credentials allocated to the tester in the first two days of the test. However, the attack surface was much smaller than anticipated. Therefore, this did not have an impact on the overall test. OffSec recommends that communication of credentials occurs immediately before the engagement begins for future contracts, so that we can provide as much testing as possible within the allotted time."

**Negative Outcome:** "There was not enough time allocated to this engagement to conduct a thorough review of the application, and the scope became much larger than expected. It is recommended that more time is allocated to future engagements to provide more comprehensive coverage."

###### Technical Summary

The next section should be a list of all of the key findings in the report, written out with a summary and recommendation for a technical person, like a security architect, to learn at a glance what needs to be done.

Example of the structure of this section might be:

- User and Privilege Management.
- Architecture.
- Authorization.
- Patch Management.
- Integrity and Signatures.
- Authentication.
- Access Control.
- Audit, Log Management and Monitoring.
- Traffic and Data Encryption.
- Security Misconfigurations.

Example of a technical summary for Patch Management is as follows

```
4. Patch Management

Windows and Ubuntu operating systems that are not up to date were
identified. These are shown to be vulnerable to publicly-available
exploits and could result in malicious execution of code, theft
of sensitive information, or cause denial of services which may
impact the infrastructure. Using outdated applications increases the
possibility of an intruder gaining unauthorized access by exploiting
known vulnerabilities. Patch management ought to be improved and
updates should be applied in conjunction with change management.
```

The section should finish with a risk heat map based on vulnerability severity adjusted as appropriate to the client's context, and as agreed upon with a client security risk representative if possible.

###### Technical Findings and Recommendation

While this is a technical section, we should not assume the audience is made up of penetration testers. It is better to assume less background knowledge on behalf of the audience and give too much information, rather than the opposite. This section is often presented in tabular form and provides full details of the findings. A finding might cover one vulnerability that has been identified, or may cover multiple vulnerabilities of the same type.

It's important to note that there might be a need for an attack narrative. This narrative describes, in story format, exactly what happened during the test. This is typically done for a simulated threat engagement, but is also useful at times to describe the more complex exploitation steps required for a regular penetration test. If it is necessary, then writing out the attack path step-by-step, with appropriate screenshots, is generally sufficient. An extended narrative could be placed in an Appendix and referenced from the findings table.

| REF | RISK | ISSUE DESCRIPTION AND IMPLICATIONS | RECOMMENDATIONS |
| --- | --- | --- | --- |
| 1   | H   | Account, Password, and Privilege Management is inadequate. Account management is the process of provisioning new accounts and removing accounts that are no longer required. The following issues were identified by performing an analysis of 122,624 user accounts post-compromise: 722 user accounts were configured to never expire; 23,142 users had never logged in; 6 users were members of the domain administrator group; default initial passwords were in use for 968 accounts. | All accounts should have passwords that are enforced by a strict policy. All accounts with weak passwords should be forced to change them. All accounts should be set to expire automatically. Accounts no longer required should be removed. |
| 2   | H   | Information enumerated through an anonymous SMB session. An anonymous SMB session connection was made, and the information gained was then used to gain unauthorized user access as detailed in Appendix E.9. | To prevent information gathering via anonymous SMB sessions: Access to TCP ports 139 and 445 should be restricted based on roles and requirements. Enumeration of SAM accounts should be disabled using the Local Security Policy > Local Policies > Security Options |
| 3   | H   | Malicious JavaScript code can be run to silently carry out malicious activity. A form of this is reflected cross-site scripting (XSS), which occurs when a web application accepts user input with embedded active code and then outputs it into a webpage that is subsequently displayed to a user. This will cause attacker-injected code to be executed on the user's web browser. XSS attacks can be used to achieve outcomes such as unauthorized access and credential theft, which can in some cases result in reputational and financial damage as a result of bad publicity or fines. As shown in Appendix E.8, the \[client\] application is vulnerable to an XSS vulnerability because the username value is displayed on the screen login attempt fails. A proof-of-concept using a maliciously crafted username is provided in Appendix E. | Treat all user input as potentially tainted, and perform proper sanitization through special character filtering. Adequately encode all user-controlled output when rendering to a page. Do not include the username in the error message of the application login. |

**Best Practices for Findings**
- We can start our findings description with a sentence or two describing what the vulnerability is.
 - Why is it dangerous.
 - What can an attacker accomplish with it.
  - Provide insight into the immediate impact of the attack.
- Describe technical details about the vuln.
 - No need for overwhelming detail.
 - Basic description of vuln and how to exploit it.
- The intent is describe a complex exploit in a way that most technical audeinces can understand.
- Must include evidence that the vuln can be exploited.
 - Include any relevant information.
  - If simple, inline as shown in example 1.
  - If complex, in appendix as example 2.
- Next describe specific finding identified in system/application.
 - Use test notes and screenshots to provide detailed account.
  - Screenshot should contain short explanation.
 - Summarize in table and reference the appedix for full description.
 - Present impact of vuln in context of client business.
- Remediation advice should be detailed enough for sys/app admin to implement without ambiguity.
 - Clear, concise, thorough.
 - Sufficient to remove vuln.
  - In manner acceptable to client.
  - Relevant to the application.
 - Strong understanding of client needs required to provide actionable advice.
 - Keep in mind.
  - Avoid broad solutions.
   - Drill down to specifics of app and business.
  - Avoid theoretical solutions.
   - Solution must be **concrete and practical**.
  - DO NOT layer multiple steps into single solution.
   -  Each distinct step should be its own solution.

**Technical Findings and Recommendations** section is a major part of report, the time/effort invested in writing it should reflect its importance.  Present a means of replicating findings, show exactly where the app was affected, and how to trigger the vuln.  A full set of steps should be documented with screenshots, including even basic steps that may not be obvious to the reader.

The details should be separated into two sections:

- The affected URL/endpoint.
- A method of triggering the vulnerability.

If multiple areas are affected by the vulnerability, we should include a reference to each area. If there is a large number of similar issues, then it's often acceptable to provide samples with a caveat that these are not the only areas where the issue occurs. In the latter case, we would recommend a systemic remediation.

###### Appendices, Further Information, and References

The final section of the report is the **Appendices** section, items too lengthy or detailed for other sections of the report go here.

- Long lists.
 - Compromised users.
 - Affected areas.
- Large PoC code blocks.
- Expanded methodology.
- Technical write-ups.

**Rule of thumb** if it breaks the flow of the page, put it in the appendix.

Optionally include a **Further Information** section.  Items not neccesary for main write up but provide reasonable value.  If there is nothing to add value this section is ommited.

- Articles describing the vuln in more detail.
- Standards for remediation.
- Other methods of exploitation.

**References** only using the most authoritative sources and cited properly.
