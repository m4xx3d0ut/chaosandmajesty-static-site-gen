---
title: "WorkerBee Projects: A First Week With a Runtime Truth Surface"
publishedAt: '2026-05-21T12:00:00-07:00'
updatedAt: '2026-05-21T12:00:00-07:00'
slug: workerbee-first-week-runtime-truth-surface
author: m4xx3d0ut
tags: [workerbee, k1s, cosmec, codex, agents, edge, gpu, embedded-linux, android]
summary: "WorkerBee started as a way to make k1s development easier, but the first serious week using it showed something broader: a local, project-scoped runtime that lets Codex keep reconciling intent against reality."
heroImage: assets/static/img/blog/k1s/k1s-logo-killa-bee-0-a.png
---

# WorkerBee Projects: A First Week With a Runtime Truth Surface

## TL;DR

[WorkerBee](https://github.com/the-cm-collective/k1s-workerbee) started as a way to make [k1s](https://github.com/the-cm-collective/k1s) development easier, but the first serious week using it showed something broader. Giving Codex a local, project-scoped runtime with builds, deploys, logs, probes, ingress, and security review changed the development loop. It let the agent keep reconciling intent against reality instead of stopping at every intermediate failure. The result was a surprisingly productive stretch across app development, k1s integration testing, [embedded Linux image work](https://github.com/m4xx3d0ut/pocketchip-debian-builder), [Android image customization](https://github.com/m4xx3d0ut/rosie-local-homeautomation), [GPU workload validation](https://github.com/m4xx3d0ut/content-tools-studio), and much more. Things got out of hand... quickly.

<figure class="blog-figure blog-figure-wide">
  <img src="/assets/static/img/blog/workerbee/workerbee-projects-wide-main.jpg" alt="WorkerBee workstation with devices staged for project work">
  <figcaption>From left to right: WorkerBee Codex session, k1s HA dev control plane and node deployed to MicroK8s, Nvidia K1 Tablet with custom Android image, Content Tools Studio with remote NVENC encoder via k1s, the k1s HA dev cluster Hive dashboard, and PocketCHIP running Debian 13 Trixie from NAND.</figcaption>
</figure>

## Intro

I've had a strange few days. Don't get me wrong, good days, but something felt surreal. If I try to simply explain the features or capabilities, it will just sound like a sales pitch. Clearly not, it's OSS. So let me just tell you about the past few days really working with WorkerBee, and you can draw your own conclusions.

## Prologue

If anyone has seen my past few LinkedIn posts, then you will have seen the [WorkerBee project](https://github.com/the-cm-collective/k1s-workerbee) I just pushed to the [CM GitHub](https://github.com/the-cm-collective). I'll link some content we cobbled together below, but let me explain briefly.

WorkerBee is an MCP server that runs locally and connects to Codex, or other agents. This is just my preference. It can also be used via CLI if you prefer a scripted, more CI-like local development experience. What it provides is a formal operating contract between your tooling and a local [k1s](https://github.com/the-cm-collective/k1s) dev stack, scoped by project, with several supported container runtimes: Podman or Docker, plus a direct containerd runtime on Linux with its own container namespace. To put it simply, this exposes a small local k8s-like application engine to your tools.

Why would you want this? Over the past several months of k1s development, I found a pattern that seemed wildly effective for accelerating k1s work. I configured a dev MicroK8s cluster on a prepped lab workstation, deployed a k1s stack to it, then began noticing how well Codex performed when working with MicroK8s directly.

*(Seriously, don't do this on anything outside of an isolated lab environment. It is not safe... though it is fun.)*

Note that when I say "performed well", in this context I mean Codex was pretty well equipped to work directly with the cluster to live-troubleshoot k1s development work right out of the box.

I was impressed, especially considering some of the more complex edge/mobile features I was working on at the time. This part of the roadmap required some fairly complex integration tests between multiple hosts, and this pattern dramatically reduced the manual testing and validation steps. I would normally iterate with Codex on what felt like the basics over and over again before we really started to get anywhere. This development pattern cut the vast majority of that out.

Great, I thought. What a win.

Then, not another real thought until a week and a half ago...

I was resting, semi-meditating, just letting my mind drift. I was kind of coming out of that "I almost fell asleep" half-nap state when a thought suddenly became very clear.

> "I have a wildly modular app engine. Why don't I package the minimal runtime profile into a local MCP server so Codex, or whatever agent I want to test, can use it?"

The idea was simple: a local, project-scoped k1s stack with ingress DNS and TLS termination. As close to a full cloud-native stack as I could fit into a small MCP package, with ops runbooks for the agent and a global project dashboard.

Luckily, the k1s runtime profiles and ops patterns are very well documented, so the initial implementation was a short build. A few good days of iteration and testing later, I felt good enough to put it in a public repo.

## The First Few Days Of Serious Use With WorkerBee

### Day 1

Once the repo was public, I needed some content. I was actually pretty impressed with how well it worked on NixOS with containerd, and further astonished when it performed equally well on a cohort's Apple Silicon MBP.

First thing I did was whip up a little demo app. Nothing fancy, just enough to show off some typical web app behavior. Then I used it to shoot a full-length, 22-ish minute run of Codex bringing a project up in WorkerBee, running through a small dev experience demo, and then stopping the WorkerBee k1s stack for the project from the global dashboard.

It was really long, and I knew I needed to edit something short to get my point across. Of my many skills, video editing is not one, so a while back I built a simple content studio app. It does only what I need it to do and simplifies my "content flywheel", or at least makes it possible for me to produce a watchable piece of technical builder content.

At this point, I already had WorkerBee v0.1.5 running locally, so I simply told Codex to use WorkerBee and bring the project up. Worth noting: we started with no k1s manifest or even Dockerfiles in the repo. Codex iterated with WorkerBee to create what we needed and spun up the app in the local WorkerBee instance, with ingress DNS and TLS termination.

> `https://app.content-tools-studio-dev-6b01ab0b06.workerbee.localhost:19443/`  
> Note: the `localhost` part there means it is routing on localhost, on the local dev machine only.

Cool, so I'd like us all to take a moment to appreciate something: it set up ingress and TLS termination for our local dev stack, and we did not have to. That's a win.

Now I loaded my content and started marking timestamps for a short-form video. This is about where I remembered how much I disliked the actual process of editing video, when it hit me:

> "Why not just tell the agent to run the edits through the app's API? Better yet, let's optimize the API for an agent to interact with it in a WorkerBee project."

That seemed like something I was more interested in doing anyway. I wrote up a small markdown doc describing the API, use case, and a few shorthand syntax styles we would support. Then I had Codex build it out and test it in WorkerBee. Much to my surprise, it came back after one prompt: complete, tested, and ready.

I was cautiously optimistic, so I gave it my timestamp shorthand and had it run a rough cut. It worked. I had it add slugs and run a final render. Perfect.

One tedious part remained: placing the cards and arrows on the timeline. What worked nicely was placing them manually, a fairly quick process, then having Codex iterate on the title and text copy with me. That saved a ton of time.

Finally, ready to render. I needed to raise the resource ceiling of the WorkerBee k1s instance for the app, because FFmpeg gets hungry, but the full short rendered out. From there, we spent a little time fixing a few bugs in the renderer and improving the control surface. It worked well.

All in all, we published a [short demo](https://youtu.be/7n4XaA4e9Ps?si=RDWqzKCWBrNfC2rd) to give the best high-level view we could compress into such a short runtime. I think we did well, and we apologize for the music.

Then one full-length run: minimal edits, typos included because it was late and a long week, no sound. You can watch the full run at 2x or 3x speed, or scrub and read through the Codex CLI output as it works with WorkerBee. I cover a few additional ops cases and WorkerBee features through the full run. The video description on YouTube has a high-level timestamp index, but what follows is a much more verbose log. Read it, scrub the long video, try it yourself. The [demo web app used in the video is here](https://github.com/the-cm-collective/k1s-demo-app).

> **Note:** in addition to the above, we pushed through some finishing and validation work on another project prototype with WorkerBee.

### WorkerBee Stack Build Timeline

Project: `k1s-demo-app-dev-4650f13e5d`  
Timing anchor: `T+00:00 = 2026-05-14 17:00:05 PDT`, the first precise WorkerBee image-build timestamp found in the run output.  
Note: `≈` means inferred from command order and tool durations rather than a persisted WorkerBee timestamp.

#### Pre-build Setup

| Offset | Phase | Event |
| ---: | --- | --- |
| pre-roll | Plan | WorkerBee session started for `/home/m4xx3d0ut/git/k1s-wt/k1s-demo-app`; project resolved as `k1s-demo-app-dev-4650f13e5d`. |
| pre-roll | Inspect | Repo deployment inputs identified: `backend/Containerfile`, `frontend/Containerfile`, `ai_dummy/Containerfile`, and `scripts/render_manifests.py`. |
| pre-roll | Start | WorkerBee project stack started; dashboard URL emitted: `https://k1s.k1s-demo-app-dev-4650f13e5d.workerbee.localhost:19443/dashboard`. |
| pre-roll | Build setup | First image-build attempt used relative paths and failed because WorkerBee resolved them from the daemon repo; retry switched to absolute context paths. |

#### Timed Sequence

| Offset | Local Time | Phase | Event |
| ---: | --- | --- | --- |
| T+00:00 | 17:00:05 | Build | Backend image build started for `workerbee-k1s-demo-app-backend:dev`. `nerdctl` attempted first; BuildKit was unavailable. |
| T+00:01 | 17:00:06 | Build | WorkerBee fell back to `podman-save-load` for backend image build/load into the WorkerBee containerd namespace. |
| ≈T+00:26 | 17:00:31 | Build | Backend image completed and loaded as `localhost/workerbee-k1s-demo-app-backend:dev`. |
| T+00:27 | 17:00:32 | Build | Frontend image build started for `workerbee-k1s-demo-app-frontend:dev`; same BuildKit fallback path. |
| ≈T+00:50 | 17:00:55 | Build | Frontend image completed and loaded as `localhost/workerbee-k1s-demo-app-frontend:dev`. |
| T+00:49 | 17:00:54 | Build | Dummy AI image build started for `workerbee-k1s-demo-app-ai-dummy:dev`. |
| ≈T+00:59 | 17:01:04 | Build | Dummy AI image completed and loaded as `localhost/workerbee-k1s-demo-app-ai-dummy:dev`. |
| ≈T+01:00 | 17:01 | Render | Manifest render attempted and failed because `PyYAML` was missing from the current Python environment. |
| ≈T+01:05 | 17:01 | Diagnostic | `python -m pip install -e .[dev]` first failed due to shell globbing, then failed because the system Python was externally managed by Nix/PEP 668. |
| ≈T+01:15 | 17:01 | Fix | Temporary venv created under `/tmp`; installed `PyYAML` there for the renderer only. |
| ≈T+01:20 | 17:01 | Render | Local manifests rendered to `/tmp/k1s-demo-app-manifests/k1s-demo-app-dev-4650f13e5d-local`: `db`, `backend`, `frontend`, `vllm`. |
| ≈T+01:30 | 17:01-17:02 | Stage | Rendered manifests staged into WorkerBee state as `k1s-demo-app`. |
| ≈T+01:35 | 17:02 | Validate | Manifest validation passed. Expected warnings appeared for local dev images that would need registry tags before remote deploy. |
| ≈T+02:00 | 17:02 | Deploy | First deploy attempt used target `local` and failed with `INVALID_DEPLOY_TARGET`; WorkerBee expected `workerbee` or `profile`. |
| T+03:12 | 17:03:17 | Deploy | Initial deploy created: `deploy-20260515T000317Z-8c7a9825`. |
| T+03:12 | 17:03:17 | Deploy | Applied `backend`, `db`, `frontend`, and `vllm` native k1s workloads. |
| ≈T+03:20 | 17:03 | Deploy | Initial app wait completed with all 4 workloads ready: backend `1/1`, db `1/1`, frontend `1/1`, vllm `1/1`. |
| ≈T+04:20 | 17:04 | Verify | WorkerBee project status checked. Initial app ingress and backend health probes passed. |
| ≈T+04:25 | 17:04 | Verify | Probed app page: HTTP 200, frontend rendered the operator console. |
| ≈T+04:30 | 17:04 | Verify | Probed API `/healthz` and `/readyz`: both HTTP 200; database readiness reported `ready`. |
| ≈T+04:35 | 17:04 | Verify | Probed `/api/status`: services reported frontend/backend/database/SSE OK, AI ready, WebSocket waiting. |
| ≈T+04:40 | 17:04 | Diagnostic | Project status briefly showed a `vllm` status lookup warning; direct AI status probe passed. |
| ≈T+04:45 | 17:04 | Verify | Probed `/api/ai/status`: dummy OpenAI-compatible simulator ready with model `demo-simulator`. |
| ≈T+04:55 | 17:05 | Smoke | Ran WebSocket smoke against `wss://api.k1s-demo-app-dev-4650f13e5d.workerbee.localhost:19443/ws/relay`; echo succeeded and wrote event id `1`. |
| ≈T+05:30 | 17:05 | Smoke | Ran HTTP smoke script across app, `/healthz`, `/readyz`, `/api/status`, and `/api/ai/status`; all returned HTTP 200. |
| T+08:56 | 17:09:01 | Scale | Backend manifest changed from `replicas: 1` to `replicas: 3`; scale deploy created: `deploy-20260515T000901Z-553f7697`. |
| T+08:56 | 17:09:01 | Scale | Backend applied as revision 2; WorkerBee reported backend `desired=3`, `ready_replicas=3`. |
| ≈T+10:00 | 17:10 | Verify | API `/readyz` probe passed after scale-up. |
| ≈T+10:10 | 17:10 | Diagnostic | Project status briefly showed frontend degraded even though backend was `3/3`; app page rendered degraded fallback. |
| ≈T+10:30 | 17:10-17:11 | Diagnostic | Frontend logs showed `/healthz` and `/` returning HTTP 200, so the issue was backend reachability from inside the frontend container. |
| ≈T+11:00 | 17:11 | Diagnostic | Exec from frontend container tested original backend URL list: host-port and special hostnames failed or timed out after multi-replica scale. |
| ≈T+11:30 | 17:11-17:12 | Diagnostic | Confirmed backend host port `22145` was no longer listening after scaling; direct public API ingress still worked. |
| ≈T+12:00 | 17:12 | Fix | Updated staged frontend manifest to use native service alias `BACKEND_INTERNAL_URL=http://backend:8080`. |
| T+13:39 | 17:13:44 | Deploy | Final redeploy created: `deploy-20260515T001344Z-4c502deb`. |
| T+13:39 | 17:13:44 | Deploy | Backend, db, frontend, and vllm reapplied. Frontend revision advanced with the service-alias backend URL. |
| ≈T+13:45 | 17:13:50 | Deploy | WorkerBee alias refresh enabled for referenced service workload `backend`; alias refresh completed successfully. |
| ≈T+14:00 | 17:14 | Deploy | App wait completed: backend `3/3`, db `1/1`, frontend `1/1`, vllm `1/1`; no degraded workloads. |
| ≈T+14:30 | 17:14 | Verify | App ingress probe passed and page rendered healthy console state instead of degraded fallback. |
| ≈T+14:35 | 17:14 | Verify | API `/api/status` probe passed with backend status OK, database OK, WebSocket OK, and AI ready. |
| ≈T+14:40 | 17:14 | Verify | Exec from frontend container confirmed `http://backend:8080/api/status` returned HTTP 200. |
| T+15:03 | 17:15:08 | Security | WorkerBee security review completed: `security-20260515T001508Z-05996b2c`. |
| T+15:03 | 17:15:08 | Security | Security summary: 0 critical, 0 high, 15 medium, 19 low. Main findings were local images, missing resource limits, missing explicit non-root policy, and missing browser security headers. |

#### Final Recorded State

- Final deployment: `deploy-20260515T001344Z-4c502deb`
- Backend replicas: `3/3`
- Workloads ready: `4/4`
- Degraded workloads: `0`
- App URL: `https://app.k1s-demo-app-dev-4650f13e5d.workerbee.localhost:19443/`
- API URL: `https://api.k1s-demo-app-dev-4650f13e5d.workerbee.localhost:19443/`
- Security report: `security-20260515T001508Z-05996b2c`

### Day 2

You can see by the timestamps above that it was getting late and I was a bit burnt out. The long content took 40 minutes for each final pass on the CPU of my NUC. As I laid down to get some sleep, I thought, "I need a Threadripper or NVENC encoder."

The following morning I took stock of what I had, what I wanted to do that day, and how I could most efficiently lay things out.

First item: I needed to verify k1s edge gateway and edge node connectivity for an integration test I've been delaying. This was a good chance to use WorkerBee as designed: to make k1s development easier on me. I added a profile to bring up k1s edge gateway and edge node containers in a WorkerBee project and instructed it to connect to the k1s core running my local k1s HA dev cluster. It came right up and connected, visible in my dev deployment's Hive dashboard.

We finished some additional cleanup work and minor content stuff, as well as a massive push to build out something special on a side branch. More next week on that.

It was leading into the weekend, so we wanted to do some hobby stuff. We really had two items sitting in our hobby queue that we wanted to get to, but we were fairly certain it wouldn't happen any earlier than 2035. Being an optimist and generally not disappointed when things fail, I set my aim high for the weekend's recreational computing time.

The things:

- [Pocket CHIP](https://en.wikipedia.org/wiki/CHIP_(computer)) (Remember this thing? circa 2015)
  - Project: [PocketTRIX Debian 13](https://github.com/m4xx3d0ut/pocketchip-debian-builder)
- [Nvidia Shield Tablet K1](https://en.wikipedia.org/wiki/Nvidia_Shield_Tablet) (Another classic! circa 2014)
  - Project: [Rosie's Local Home Assistant](https://github.com/m4xx3d0ut/rosie-local-homeautomation)

I know, you're asking yourself "why?" right now.

I have good reason. My personal ethos could be described as DIY, so reduce, reuse, recycle, right? Also, the Pocket CHIP is just fun. If you recall the OpenPandora, I had one. I still regret selling it. I love weird handhelds. Don't judge, it's been my vibe ever since the days of, allow me to date myself, the OG Game Boy... the "Gray Brick."

I feel like the Pocket CHIP will make a great cyberdeck kind of thing with a more modern version of Linux running on it. And, believe it or not, I've used the K1 tablet, in some form or another, since the day I bought it. Crazy, right? I've replaced its internal battery, and it's not doing anything critical, but it comes in handy more than you might think.

The projects: custom firmware toolkits to:

- "Cyberdeck" the Pocket CHIP with a new distro
  - So it's useful again.
- "Home Assistant", de-Googled Android image for the K1
  - For HA control and kitchen web browsing... for bread recipes and stuff.

I did some general research on both and started getting project working trees set up, thinking I'd pick one for the weekend. As I was reading through my initial Codex prompt output stream for the K1 project, I noticed that the Pocket CHIP project agent was about 90% sure it could build a bootable mainline Debian 13, Trixie, image for the SBC. It thought we could boot from USB if we hooked up a UART debugger and put the Pocket CHIP into FEL mode.

It asked if I "needed a pinout?"

Somewhat surprised, I politely declined and grabbed a USB debugger, jumpers, and a flash drive. Then I just kind of let it have at it, for lack of a better term, to see what would happen.

While `dd` was writing my flash drive, I checked logs to see what the agent's thought train was. In our planning doc, we directed the agent to the [Project CHIP Crumbs](https://github.com/Project-chip-crumbs) repo and gave it our happy path, where critical items listed one or two fallbacks so the agent could unblock itself if needed. We also suggested that a test and validation pipeline could be built with WorkerBee. That was all it took for it to set up a new WorkerBee project with a build pipeline, emulator-based image validation, and some convenience features to make the process reproducible.

Long story short: first image booted to CLI via UART. Debian 13, as requested. Next image pass: screen and keyboard working. Impressive. From here, we were free to just begin iterating, mostly image config and hardware support, until we clicked off for the night.

### The Weekend

This is where things started to feel strange.

I made my way back to the K1 project agent to pick back up in the morning. It was waiting for input. It had a few requests before it could flash the K1 tablet, attached to the host, with a test build of our Android kiosk image... which it had already built and verified in a WorkerBee test harness.

<figure class="blog-figure blog-figure-portrait">
  <img src="/assets/static/img/blog/workerbee/rosies-home-assistant-kiosk-home.png" alt="Rosie's Home Assistant kiosk home screen on a custom LineageOS Nvidia Shield Tablet K1 image">
</figure>

The requests were reasonable enough, so we obliged and proceeded. First image failed, then it began to iterate. This was interesting: it didn't really need us. Between `adb`, `fastboot`, and the WorkerBee MCP, it just did its thing for a while. Four-plus hours, mostly build and CI, low tokens.

Back over to the Pocket CHIP agent, we spent some more time iterating on image features and drinking brewed cacao. Try it. This was mostly about having fun and customizing things. The image was already pretty stable while booting from USB.

<figure class="blog-figure blog-figure-medium">
  <img src="/assets/static/img/blog/workerbee/pocketchip-debian13-i3-caffeine.png" alt="Pocket CHIP booted into a custom Debian 13 i3 interface">
</figure>

I was feeling pretty good about the general state of the image, so we decided to add Nvidia NVENC encoder support to the content tools studio while iterating on final changes to the image build pipeline. The NVENC integration tests passed. I would smoke test it Monday morning.

<figure class="blog-figure blog-figure-medium">
  <img src="/assets/static/img/blog/workerbee/content-tools-studio-k1s-nvenc-dashboard.png" alt="Content Tools Studio with NVENC enabled, deployed to the k1s HA dev cluster">
</figure>

There was a bit of back and forth with the projects from my tablet, but I then spent some time gardening and doing general AFK stuff.

### Monday

On the agenda for the day: GPU workload validation on local dev k1s HA deployment "host b" node. We will be using that in an upcoming integration test between two GPU nodes, one local and one remote. In this context, "remote" refers to another physical host on the local LAN that will run a k1s edge gateway and GPU node. We want to test the edge/mobile tunnel with WireGuard and optionally Rosenpass. That should be possible in this development configuration, yay, but first we must ensure GPU scheduling actually works on a node local to the core controller.

Here we were able to exercise one of the k1s-specific modes, where the WorkerBee agent can edit and rebuild against a sibling k1s project. That worked alarmingly well and quickly got through GPU validation on host b. It wasn't 9 AM yet.

I took this as an opportunity to manually smoke GPU workloads through a WorkerBee project and test the "deploy to k1s" feature. The high-level path became:

- test locally, where NVENC is unavailable
- build deployment manifests for k1s remote
- deploy to the dev k1s HA stack, scheduling the workload for host b where an RTX 8000 is available
  - at this point we did a little troubleshooting on the core proxy ingress, but after that we could edit from our web browser on the NUC and encode with NVENC on the host b worker node

After one prompt came back:

- the workload was validated in local WorkerBee without Nvidia NVENC
- the deployment shape for the k1s HA cluster was decided, pinned to host b so we get the GPU
- successfully deployed to the k1s HA cluster
- the k1s HTTPS ingress URL for the deployed app

Manual smoke test passed, and that feels pretty practical as well. If I'm making small edits on a long video from my tablet or laptop, the backend encodes it with the NVENC encoder and I just download it back. That is far faster than local CPU encoding on all counts.

Going further, adding OAuth and additional security layers, this becomes a very usable single-user tool in a small private cloud. Even without going that deep, you can expose it to yourself personally from a lab stack using Twingate or similar tools, most of which offer free tiers. That's pretty doable for most enthusiasts, and it's the kind of thing I can make easier for everyone as time goes on.

The rest of Monday was WorkerBee user testing, or at least I used that as my excuse to play with the Pocket CHIP and Home Assistant. By Monday night, we were looking good for a Home Assistant backend test from our K1 tablet and the final "how to write our image to NAND and boot it" push on the Pocket CHIP. That feels like faster progress than I would typically see on projects of that type.

### Tuesday

By late morning, the Home Assistant project was in a state that required me to wait for the weekend, ready to start connecting devices for a test run. We did some final theme styling work on the K1 image build pipeline and reflashed with a much cleaner-looking dark mode and a more custom kiosk-y feel. It was becoming obvious how efficient this tool was for this type of development work.

Sure, the K1 image is really based on LineageOS 15.1 with my customizations on top of it for the HA kiosk.

A time saver? Yes.

Impressive? Meh.

What was impressive was watching it iterate through the FEL/U-Boot work to write and boot from NAND on the Pocket CHIP, live, over USB and UART. It did need the human-in-the-loop operator, me, to physically put the Pocket CHIP in FEL mode, so at least I felt needed.

Honestly, I was fine with this. I wanted to take the opportunity to actually expand my armchair understanding of UBIFS, UBI, and MTD. Really good reading if you want to get into it. Though I am not using it in this image's layout, I now have a working understanding of how to use A/B roots for OTA in UBIFS appliances!

Late in the evening, we finally had a working install method for Debian 13 and achieved a stable NAND boot.

<figure class="blog-figure blog-figure-row">
  <img src="/assets/static/img/blog/workerbee/pocketchip-device-info-top.png" alt="Pocket CHIP device information screen, top section">
  <img src="/assets/static/img/blog/workerbee/pocketchip-device-info-bottom.png" alt="Pocket CHIP device information screen, bottom section">
</figure>

### Wednesday AM

Things keep escalating. I keep having ideas. We keep building them. When I say "we", I'm not trying to use the royal we, but I always felt Codex had a kind of "we" energy, and WorkerBee makes that much more prominent.

First, we wrapped the Pocket CHIP NAND boot work, image builder updates, and flashing method process/docs. Nothing left but testing and optimization to make things a bit more polished. i3 will do well with a few tweaks on this form factor.

I've been adding some little QoL features. It seems there is still a small community around the Pocket CHIP, it is cool, and they may appreciate the effort. I'm actually interested in getting some real testers to provide feedback, if any interested parties are reading. Inquire within.

Then we had a thought: we needed to be one level of orchestration up from where we were. So we mapped out a simple little local MCP server with a TUI client. Individual Codex agents connect back to the MCP, become visible in the TUI, and send status updates. More on that soon. This is already too much.

### To Summarize

WorkerBee started as a way to make k1s development easier, but the first serious week using it showed something broader.

The tool works because it gives Codex a runtime truth surface: build state, deployment state, logs, probes, ingress, security review, and repeatable cleanup. That lets the agent keep reconciling intent against reality without asking me to manually interpret every intermediate failure.

When the mismatch is ordinary software failure, the agent can usually keep going: inspect, fix, redeploy, probe, repeat. When the mismatch is a real decision, missing credential, destructive action, or ambiguous product call, it still needs me.

That seems like the important lesson. WorkerBee is useful tooling, but it also fits the way agentic development wants to work.

I wrote up the longer theory here: [WorkerBee, Codex, and State Reconciliation](https://github.com/the-cm-collective/k1s-workerbee/blob/dev/docs/workerbee-codex-state-reconciliation.md).
