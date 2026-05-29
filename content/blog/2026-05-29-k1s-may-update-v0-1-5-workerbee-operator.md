---
title: "k1s May Update: v0.1.5, WorkerBee, and the Operator Bridge"
publishedAt: '2026-05-29T12:00:00-07:00'
updatedAt: '2026-05-29T12:00:00-07:00'
slug: k1s-may-update-v0-1-5-workerbee-operator
author: m4xx3d0ut
tags: [k1s, cosmec, workerbee, updates, release, v0.1.5, fabric, api-shim, inference, agents, edge, gpu, android]
summary: "k1s v0.1.5 moves the project toward a fabric-shaped execution layer: stronger API shim and discovery work, InferenceCell documentation, GPU validation lanes, WorkerBee-driven development, and the first Kubernetes operator bridge."
heroImage: assets/static/img/blog/k1s/k1s-logo-killa-bee-0-a.png
---

# k1s May Update: v0.1.5, WorkerBee, and the Operator Bridge

## TL;DR

[k1s](https://github.com/the-cm-collective/k1s) `v0.1.5` is the first update where the project starts to look less like a small Kubernetes-like runtime and more like a fabric-shaped application engine. The docs bundle now covers the API shim, Kubernetes-style discovery, distributed inference, AI/ML execution cells, GPU validation lanes, and the first operator bridge work through [Keleustes](https://github.com/the-cm-collective/k1s-k8s-operator). At the same time, [WorkerBee](https://github.com/the-cm-collective/k1s-workerbee), Agent PBX, and a few very practical side projects have turned the local development loop into something much more real: agents can build, deploy, probe, inspect logs, and keep reconciling against runtime state instead of only editing files and hoping the next human-run test passes.

## Intro

I know, [last week's blog post](https://cosmosmechane.com/blog/workerbee-first-week-runtime-truth-surface.html) was too long. I'll keep this one pretty short and to the point, I actually feel it has the most impact that way. You know I've been building:

- [k1s](https://github.com/the-cm-collective/k1s)
  - Original project, the k8s-like, next-gen distributed application engine for edge/mobile.
- [WorkerBee](https://github.com/the-cm-collective/k1s-workerbee)
  - k1s based, cloud-native, agent workbench MCP server.

I wanted to test WorkerBee, so I built a few little side projects:

- [Rosie's Local Home Assistant](https://github.com/m4xx3d0ut/rosie-local-homeautomation)
  - Customized Android "kiosk" image for controlling a Home Assistant deployment, with a full customization, CI build/validation, and deployment pipeline.
- [PocketTRIX](https://github.com/m4xx3d0ut/pocketchip-debian-builder)
  - A PocketCHIP modernization effort around mainline U-Boot and the Debian 13 Trixie system based on the `armhf` packages, with CHIP-specific integrations, and Debian mainline kernel `linux-image-armmp`. This project also includes a full customization, CI build/validation, and deployment pipeline.
  - This has actually piqued the interest of a small, but interested, [CHIP community on Reddit](https://www.reddit.com/r/ChipCommunity/comments/1tof432/debian_13_trixie_unofficial_aka_pockettrix/)!

That was fun. I then realized I need a better way to orchestrate Codex/WorkerBee agents, tabbing through Tmux was getting old. So, I built some "quality of life tools" for improved developer experience:

- [Agent PBX, MCP server and Client TUI](https://github.com/m4xx3d0ut/agent-pbx)
  - An MCP server for orchestrating, observing, and tasking multiple Codex agents and sub-agents, from a single pane. I like to remote into my stack from my tablet, so I optimized it accordingly.
- [1337 Board](https://github.com/m4xx3d0ut/1337-board)
  - Have you ever tried to program on an Android device? If yes, you may have come across the [Hacker's Keyboard](https://github.com/klausw/hackerskeyboard). I have used it for a very long time, despite my love for it, I felt some more modern features would be nice. Cliff notes: privacy focused, fully offline text-to-speech and predictive glide typing engine, with many theme and customization options available to tailor the experience to the individual.
  - I really expected nothing from building an IME, but the repo is seeing some stars, a surprising amount for me actually, and [Reddit seems to like it](https://www.reddit.com/r/termux/comments/1togoi7/dev_1337board_a_programmable_android_ime_for/).

Then I wanted to make a video about it, so I used Codex/WorkerBee to "optimize the app for use with WorkerBee". What does that mean you ask? Codex will deploy the web based video editing suite into a WorkerBee project, making the editing interface available through your TLS terminated ingress, and then you just explain the edits you want to the agent. It will get pretty close, probably closer than you think on the first pass, then you can go into the web UI and tweak by hand.

- [Content Tools Studio](https://github.com/m4xx3d0ut/content-tools-studio)
  - A video annotation and rendering pipeline for screencast overlays. Import MP4 footage, scrub frames, place branded cards and directional arrows, trim/cut sections, and render a final MP4 directly into a workspace export folder with FFmpeg.
  - Edit technical demos in natural language from Codex with WorkerBee!

Almost forgot, [Content Tools Studio now supports Nvidia NVENC](https://github.com/m4xx3d0ut/content-tools-studio/commit/f406cb62c2744b33e9b91cc7e9baa9096031be12) local and remote GPU through local WorkerBee and k1s deployments.

<figure class="blog-figure blog-figure-wide">
  <img src="/assets/static/img/blog/workerbee/content-tools-studio-k1s-nvenc-dashboard.png" alt="Content Tools Studio with a k1s-backed NVENC worker visible in the dashboard">
  <figcaption>Content Tools Studio running with a k1s-backed NVENC lane through WorkerBee.</figcaption>
</figure>

Using the combination of tools above, I can work from my desk where I have my desktop and a workstation/server system, where the actual work is happening. I can then:

- Grab my tablet and pull the Agent PBX Client TUI up in Termux and use 1337 Board, which is also optimized for my mobile workflow, to interact while I'm moving about. I can even go outside.
- Need more mobility? Same thing works on a phone. Both the TUI and keyboard are designed to scale on both. The TUI's default "adaptive layout" will drop to the "tiny" layout on a phone portrait screen and 1337 Board can run in 4-row or compact 5-row while in portrait, then jump to full 5-row in landscape.

Just get up and go. No need to keep your finger in your laptop lid even, the future is coming...

<figure class="blog-figure blog-figure-medium">
  <img src="/assets/static/img/blog/workerbee/k1s-workerbee-2027-meme.png" alt="k1s and WorkerBee workflow meme">
</figure>

I'm not trying to convince you, look at my personal and org GitHub accounts over the past two weeks and decide for yourself. I've both improved my production velocity meaningfully, this is not token churn, and become more effective at handling multiple project streams while improving my overall workflow.

The other part I found interesting is that my token usage is lower with WorkerBee. I'm pretty confident it is due to more efficient handling of log data and context window, but I will collect some solid numbers on this in coming weeks.

Well, to put it together for you, this is what it looks like when I work on all of these projects from my Android tablet.

<figure class="blog-figure blog-figure-wide">
  <img src="/assets/static/img/blog/workerbee/pad3-tui-1337.jpg" alt="Android tablet running Agent PBX and 1337 Board for mobile agent workflow">
  <figcaption>Agent PBX, Termux, and 1337 Board from a tablet while the real work runs on the workstation.</figcaption>
</figure>

That is practically all I need. Jump in between agents, speak the next instruction through TTS, or glide type long prompts quickly with one hand.

You should try it.

I'm also testing a [Kubernetes operator for k1s](https://github.com/the-cm-collective/k1s-k8s-operator)! More on that in the next blog post.

## k1s v0.1.5 Update!

The `v0.1.5` development line is where the shape of k1s starts to get clearer. The earlier releases were about making the core runtime credible: strict CRI behavior, ingress, storage, HA control-plane work, validation harnesses, and benchmark evidence. This update keeps that base, but pushes the public story toward the next contract: k1s as a small, understandable execution layer that can expose resources Kubernetes clusters do not always provide cleanly, especially for AI/ML and edge/mobile workloads.

### What is in v0.1.5

The generated docs now include a much larger surface around fabric, API compatibility, and practical GPU validation. The important pages are the new or refreshed docs for [Inference Fabric](https://cosmosmechane.com/k1s/inference-fabric.html), [Distributed Compute Fabric](https://cosmosmechane.com/k1s/distributed-compute-fabric.html), [Fabric Control Plane](https://cosmosmechane.com/k1s/fabric-control-plane.html), [Fabric Deployment Topology](https://cosmosmechane.com/k1s/fabric-deployment-topology.html), [API Shim](https://cosmosmechane.com/k1s/api-shim.html), [API Shim Compatibility Matrix](https://cosmosmechane.com/k1s/apishim-compatibility-matrix.html), [Kubernetes Compliance](https://cosmosmechane.com/k1s/k8s-compliance.html), [AI Max+ 395 Hardware Baseline](https://cosmosmechane.com/k1s/ai-max-395-hardware-baseline.html), [AI Max+ 395 Cluster Prep](https://cosmosmechane.com/k1s/ai-max-395-cluster-prep.html), and [Nvidia Development Baseline](https://cosmosmechane.com/k1s/nvidia-development-baseline.html).

The short version: `v0.1.5` is not trying to turn k1s into Kubernetes. It is tightening the Kubernetes-facing API and discovery surface so standard tools can reason about k1s objects, while the runtime stays focused on the things k1s is supposed to be good at: edge/mobile execution, explicit reconciliation, fabric sessions, and uncommon resources like GPU-backed inference cells.

### TL;DR Highlights

- The API shim now has stronger documentation around Kubernetes-style discovery, OpenAPI v2/v3 compatibility, CRUD/watch expectations, and the resource coverage needed by tools like `kubectl`, Helm, dashboards, and compatibility-oriented controllers.
- The docs now describe the current `InferenceCell` and `InferenceCellSet` lane as the precursor to the formal distributed compute fabric, including stage planning, boundary/budget admission, GPU slot reservation, port leases, node locks, and session materialization.
- The fabric roadmap is now explicit about the near-term target: AI Max+ 395-first execution cells, with an Nvidia-backed validation lane available now so controller and fabric behavior can be hardened before the AMD systems are in hand.
- The Kubernetes compliance page is clearer about what is validated today, what is portability evidence, and what is not a Kubernetes conformance claim.
- The generated docs set now covers both standard service workflows and AI/ML workflows: deployments, services, ingress, config/secrets, RBAC-shaped resources, plus inference fabric, GPU hosts, and fabric control-plane design.
- The first k1s operator bridge work is underway through Keleustes, where Kubernetes-side workloads can CRUD and discover k1s-side resources through proper Kubernetes RBAC without asking the Kubernetes scheduler to directly schedule onto k1s.

### 1) API Shim and Kubernetes-Facing Discovery

The API shim work matters because most useful platform tooling assumes Kubernetes-shaped discovery, objects, and verbs. If k1s wants to cooperate with that world, it needs to speak enough of the language to be legible without pretending to be a full Kubernetes distribution.

In `v0.1.5`, the docs and generated OpenAPI output make that contract much more concrete. The shim surface now documents Kubernetes-style discovery endpoints, OpenAPI v2/v3 compatibility, CRUD operations, watch behavior, and object categories across core, apps, batch, networking, RBAC, policy, autoscaling, storage, snapshot, and `ae.dev/v1alpha1` resources.

That does not mean k1s is claiming upstream conformance. It means the compatibility boundary is becoming explicit. Standard workflows should be able to ask reasonable questions, discover resources, apply manifests, watch objects, and understand status without every integration needing a bespoke adapter.

### 2) Inference Fabric and the AI/ML Resource Contract

The fabric work is the bigger strategic move. The current `InferenceCell` lane gives k1s a controller-owned workload type for distributed inference execution. It can plan stage placement, evaluate budget and boundary constraints, reserve GPU slots and ports, create a fabric session, ask node agents to materialize the session, and then converge the worker, leader, fabric, and API conditions.

That is not just an AI demo path. It is the early version of the resource contract k1s needs for workloads that do not map neatly onto ordinary Kubernetes scheduling. AI/ML inference endpoints are the obvious case, but the same shape can apply to standard services that need a k1s-provided resource, edge execution behavior, or a fabric-aware placement boundary.

The important design point is authority. Kubernetes can express intent and enforce RBAC around who is allowed to ask for something. k1s remains responsible for its own scheduling, resource reservation, and reconciliation. That split keeps the integration useful without turning the Kubernetes controller into the k1s scheduler.

### 3) GPU Validation Before the Target Hardware Lands

The long-term public target is an AMD Ryzen AI Max+ 395-first fabric cell, but the available hardware today is mixed Nvidia equipment. Rather than block on the ideal hardware, `v0.1.5` documents the current Nvidia development baseline and treats it as a validation lane for controller behavior.

That is the correct level of honesty for this stage. The Nvidia lane is useful for exercising `InferenceCell` lifecycle, node registration, GPU slot reservation, readiness, restart, teardown, and physical/virtual host procedures. It is not a product-family claim, and it is not a substitute for proving the AI Max+ 395 cell shape when those systems are available.

This keeps the project moving while preserving the evidence boundary: validate behavior now, keep hardware-specific claims separate, and avoid confusing the development substrate with the final public target.

### 4) Keleustes and the Operator Bridge

The operator work is where the Kubernetes story starts to connect back into the fabric story. The goal is not to fully integrate k1s into a Kubernetes cluster or let the Kubernetes scheduler schedule directly onto k1s. The goal is narrower and more useful: let workloads and applications running on Kubernetes, with proper RBAC, CRUD and discover resources through the k1s operator.

Most often, that will mean AI/ML workloads or inference API endpoints that need resources a normal Kubernetes cluster may not provide easily. It should also work for standard services delivered through k1s. In both cases, the operator bridge should make the relationship legible:

- Kubernetes owns the user-facing policy and object access boundary.
- Keleustes translates Kubernetes-side desired state into k1s-side requests.
- k1s owns its runtime authority, placement, reconciliation, and resource lifecycle.
- Status flows back to Kubernetes so users and tools can inspect what happened.

This is why the name Keleustes fits. If Kubernetes is the helmsman, Keleustes is the officer who turns intent into coordinated action. The bridge should coordinate the crew, not seize the helm.

### 5) Docs, Validation, and Public Readiness

The generated docs output was refreshed with the current API shim pages, fabric pages, hardware baseline pages, examples, OpenAPI artifacts, and Kubernetes compatibility status. That matters because a pre-`1.0` project can only be useful if the contract is visible enough for other people to test it without guessing what the maintainer meant.

`k1s` is still early development software. That said, the shape is becoming clearer: a small app engine with Kubernetes-friendly interfaces where they help, a separate runtime authority where it matters, and a fabric path for resources that need more than generic pod scheduling.

## Deployment readiness

I still recommend treating `v0.1.5` as an early-development validation release. It is appropriate for labs, edge/mobile experiments, AI/ML fabric validation, operator integration work, and advanced users who want to test the API shim and generated docs against real tooling.

It is not a "drop it into prod and forget it" release. The interesting work now is validation: API shim compatibility, fabric lifecycle behavior, GPU resource accounting, operator RBAC boundaries, and repeatable deployment paths.

## Call for validation

If you run edge labs, local GPU systems, small Kubernetes clusters, or AI/ML inference experiments, this is a good time to test the bridge between the docs and the runtime.

- Repo: https://github.com/the-cm-collective/k1s
- WorkerBee: https://github.com/the-cm-collective/k1s-workerbee
- Operator: https://github.com/the-cm-collective/k1s-k8s-operator
- Docs: https://cosmosmechane.com/k1s/index.html

## Closing

The point of `v0.1.5` is not that k1s is done. The point is that the project now has a more legible direction: Kubernetes-compatible where that buys integration, k1s-native where that preserves the execution model, and fabric-aware where standard clusters need help.
