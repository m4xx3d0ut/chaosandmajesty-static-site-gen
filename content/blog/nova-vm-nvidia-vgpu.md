---
title: Nova VM Nvidia vGPU
slug: nova-vm-nvidia-vgpu
author: m4xx3d0ut
summary: TODO
tags:
- m4xx3d
publishedAt: 2025-02-06
updatedAt: 2025-02-06
readingMinutes: 5
---
---
title: Nova VM Nvidia vGPU
updated: 2024-05-22 01:03:01Z
created: 2024-01-31 18:13:43Z
latitude: 33.91917990
longitude: -118.41646520
altitude: 0.0000
---

# GPU Virtualization: OpenStack Nova & KVM

[toc]

* * *

## Abstract (Executive)

This paper outlines how a local development environment can be configured for Nvidia vGPU utilizing the KVM hypervisor.  Sections marked "Executive" are for high level consumption and all others should be assumed technical. 

Our primary focus will be [Canonical OpenStack](https://ubuntu.com/openstack) single-node deployments, on [Ubuntu Server 22.04.3 LTS](https://releases.ubuntu.com/jammy/), with [Nova Compute](https://docs.openstack.org/nova/latest/) configured for the [KVM hypervisor](https://linux-kvm.org/page/Main_Page), however a similar end can be achieved with a basic Ubuntu Linux server deployment and the [KVM hypervisor](https://ubuntu.com/blog/kvm-hyphervisor).  We will enable and utilize the Nvidia datacenter vGPU feature, present in the majority of Nvidia cards but only enabled on the datacenter class devices, and show the value (in both cost and capability) the system achieves. The yield is an advanced local development environment for distributed cloud system, designed to run GPU workloads, and capable of complex network architectures.

*Paul Kolesa (The Architect), Infinite Reality R&D*

* * *

## Host System Configuration

### Nvidia Grid Drivers

Nvidia vGPU requires the host system be configured with a datacenter class Nvidia GPU and the Nvidia Grid graphics driver, which is only available through the [Nvidia Application Hub](https://nvid.nvidia.com/).

If a datacenter class Nvidia GPU is not available it is possible to patch the Grid host driver, [using patches from the Proxmox project](https://gitlab.com/polloloco/vgpu-proxmox), to recognize a Geforce class graphics card as a datacenter class card of like architecture. For example, the Geforce RTX Titan with patched Grid driver is identified as the datacenter class RTX6000.  In fact, the only architectural difference between the two cards is a 90 Mhz overclock and $1,500 price difference (Yes, Nvidia is robbing you!).

### Mediated Devices

Nvidia vGPUs are defined by the host system as mediated devices, this can be achieved with the CLI tool `mdevctl`. The general process is as shown:

Identify mediated device types.

```
# mdevctl types
0000:01:00.0
  nvidia-256
    Available instances: 24
    Device API: vfio-pci
    Name: GRID RTX6000-1Q
    Description: num_heads=4, frl_config=60, framebuffer=1024M, max_resolution=5120x2880, max_instance=24
  nvidia-257
    Available instances: 12
    Device API: vfio-pci
    Name: GRID RTX6000-2Q
    Description: num_heads=4, frl_config=60, framebuffer=2048M, max_resolution=7680x4320, max_instance=12
  nvidia-258
    Available instances: 8
    Device API: vfio-pci
    Name: GRID RTX6000-3Q
    Description: num_heads=4, frl_config=60, framebuffer=3072M, max_resolution=7680x4320, max_instance=8
  nvidia-259
    Available instances: 6
    Device API: vfio-pci
    Name: GRID RTX6000-4Q
    Description: num_heads=4, frl_config=60, framebuffer=4096M, max_resolution=7680x4320, max_instance=6
  nvidia-260
    Available instances: 4
    Device API: vfio-pci
    Name: GRID RTX6000-6Q
    Description: num_heads=4, frl_config=60, framebuffer=6144M, max_resolution=7680x4320, max_instance=4
  nvidia-261
    Available instances: 3
    Device API: vfio-pci
    Name: GRID RTX6000-8Q
    Description: num_heads=4, frl_config=60, framebuffer=8192M, max_resolution=7680x4320, max_instance=3
  nvidia-262
    Available instances: 2
    Device API: vfio-pci
    Name: GRID RTX6000-12Q
    Description: num_heads=4, frl_config=60, framebuffer=12288M, max_resolution=7680x4320, max_instance=2
  nvidia-263
    Available instances: 1
    Device API: vfio-pci
    Name: GRID RTX6000-24Q
    Description: num_heads=4, frl_config=60, framebuffer=24576M, max_resolution=7680x4320, max_instance=1
...
```

- Lists the available types for the given card and specs of the mdev
    - Note that:
        - The first line is the parent bus address
        - Each type offers a limited number of nodes
        - Each type offers varying capabilities

A simple bash script can be used to define and start a mdev node.

```
# cat def-mdev.sh
U=$(uuidgen)
P=$1
T=$2

echo "[+] Create mdev: $U"
echo "[*] mdevctl start -u $U -p $1 -t $2"
bash -c " mdevctl start -u $U -p $1 -t $2"
```

The example command will create a single node of the given type on the given parent.

```
# ./def-mdev.sh 0000:01:00.0 nvidia-261
```

- Note that `nvidia-261` type can create a max of 3 mdev nodes, as noted in type output above.

Next list the created nodes and make not of the UUIDs.

```
# mdevctl list
fa6d5d93-cc58-4ad8-839e-113bb6f8ba6f 0000:01:00.0 nvidia-261 (defined)
88d43168-9d0e-4724-97a9-f4be2dd276a0 0000:01:00.0 nvidia-261 (defined)
2479b874-70d5-428e-a51c-1a2e3f509095 0000:01:00.0 nvidia-261 (defined)
```

* * *

## Nvidia Licensing Server

The simplest solution here is to configure a hosted license server through the [Nvidia Application Hub](https://nvid.nvidia.com/), documentation on the process can be found [here](https://docs.nvidia.com/grid/13.0/grid-licensing-user-guide/index.html). You will need to download the license tokens generated by the server and will later transfer them to the guest systems, 1 token per guest will be required so provision your licenses accordingly.

* * *

## Guest System Configuration

### Provisioning the VM

The first step, of course, is to provision your VM. A KVM hypervisor is shown here, but docs can be found for other popular hypervisors. We will show examples from OpenStack, but the process is similar with the `virsh` CLI and `virt-manager` GUI.

First configure a flavor with the VGPU requirement using the OpenStack CLI.

```
$ openstack flavor create --id 7 --ram 8128 --swap 8128 --disk 160 --vcpus 8 m1.xlr8gpu
$ openstack flavor set m1.xlr8gpu --property "resources=VGPU=1"
```

- Note that:
    - the parameters above are arbitrary and should be set corresponding to your environment

Create a VM with the flavor.

```
openstack --os-cloud=kolla-admin server create \
    --image jammy-server-cloudimg-amd64 \
    --flavor m1.xlr8gpu \
    --key-name 'test-key-0' \
    --network 'test-network-0' \
    --wait 'test-gpu-0'
```

Depending on your deployment and a number of other factors, it is possible the mdev node has not attached to the instance during creation. To quickly check this you can SSH into the new VM and check the attached PCI devices.

```bash
(venv) ubuntu@test-gpu-1:~/CodeLlama-7b-Python-hf$ lspci
00:00.0 Host bridge: Intel Corporation 440FX - 82441FX PMC [Natoma] (rev 02)
00:01.0 ISA bridge: Intel Corporation 82371SB PIIX3 ISA [Natoma/Triton II]
00:01.1 IDE interface: Intel Corporation 82371SB PIIX3 IDE [Natoma/Triton II]
00:01.2 USB controller: Intel Corporation 82371SB PIIX3 USB [Natoma/Triton II] (rev 01)
00:01.3 Bridge: Intel Corporation 82371AB/EB/MB PIIX4 ACPI (rev 03)
00:02.0 VGA compatible controller: Red Hat, Inc. Virtio GPU (rev 01)
00:03.0 Ethernet controller: Red Hat, Inc. Virtio network device
00:04.0 SCSI storage controller: Red Hat, Inc. Virtio block device
00:05.0 SCSI storage controller: Red Hat, Inc. Virtio block device
00:06.0 VGA compatible controller: NVIDIA Corporation TU102GL [Quadro RTX 6000/8000] (rev a1)
00:07.0 Unclassified device [00ff]: Red Hat, Inc. Virtio memory balloon
00:08.0 Unclassified device [00ff]: Red Hat, Inc. Virtio RNG
```

- Note the presence of `NVIDIA Corporation TU102GL [Quadro RTX 6000/8000] (rev a1)`
    - indicating the vGPU is attached to the instance

If a vGPU has not attached to the instance, first stop the instance from Horizon, then access a `virsh` shell on the Kolla Ansible OpenStack `nova_libvirt` Docker container, and edit the XML of the VM to manually attach the node.

List the available VMs.

```
docker exec -it -u 0 nova_libvirt virsh list --all
```

Edit the corresponding VM XML.

```
docker exec -it -u 0 nova_libvirt virsh edit instance-00000001
```

Edit the UUID for your environment and add this block into the `<device>` section near the end of the XML.

```
    <hostdev mode='subsystem' type='mdev' managed='no' model='vfio-pci' display='on'>
      <source>
        <address uuid='fa6d5d93-cc58-4ad8-839e-113bb6f8ba6f'/>
      </source>
    </hostdev>
```

- Note that the UUID should correspond the the UUID of the mdev node recorded earlier

Save the XML, exit, and start the VM from Horizon. Recheck the PCI devices attached to the instance, the Nvidia vGPU should now present itself.

### Install and Configure the Guest Nvidia Grid Driver

The Grid driver archive you downloaded earlier should also contain a "Guest" driver sub-folder, transfer it to the VM along with the token downloaded from the license server.

If necessary, unpack your guest driver package, mark the run script executable, and install with `dkms`.

```
$ chmod +x NVIDIA-Linux-x86_64-535.104.05-grid.run
$ sudo ./NVIDIA-Linux-x86_64-535.104.05-grid.run --dkms
```

Next set the permissions of the license token to `744`, copy it to the `ClientConfigToken` directory, edit the `gridd.conf.template`, save it as `gridd.conf`, and restart `nvidia-gridd.service`.

```
$ chmod 744 client_configuration_token_*.tok
$ sudo cp client_configuration_token_*.tok /etc/nvidia/ClientConfigToken/
$ sudo vi /etc/nvidia/gridd.conf.template
$ sudo systemctl restart nvidia-gridd.service
```

- Note that the only require option to set in the `gridd.conf` is `FeatureType=1`

Verify the vGPU with `nvidia-smi`.

```
$ nvidia-smi
Wed Jan 31 19:30:58 2024
+---------------------------------------------------------------------------------------+
| NVIDIA-SMI 535.104.05             Driver Version: 535.104.05   CUDA Version: 12.2     |
|-----------------------------------------+----------------------+----------------------+
| GPU  Name                 Persistence-M | Bus-Id        Disp.A | Volatile Uncorr. ECC |
| Fan  Temp   Perf          Pwr:Usage/Cap |         Memory-Usage | GPU-Util  Compute M. |
|                                         |                      |               MIG M. |
|=========================================+======================+======================|
|   0  GRID RTX6000-8Q                On  | 00000000:00:06.0 Off |                  N/A |
| N/A   N/A    P8              N/A /  N/A |      0MiB /  8192MiB |      0%      Default |
|                                         |                      |             Disabled |
+-----------------------------------------+----------------------+----------------------+

+---------------------------------------------------------------------------------------+
| Processes:                                                                            |
|  GPU   GI   CI        PID   Type   Process name                            GPU Memory |
|        ID   ID                                                             Usage      |
|=======================================================================================|
|  No running processes found                                                           |
+---------------------------------------------------------------------------------------+
```

- Note that you can further validate by running a test with Pytorch on GPU.
    - A simple way to do this is to `pip install test-pytorch-gpu` and run the installed test
        - Running `nvidia-smi` while the test is in progress should show a process on the GPU

* * *

## Research Results & Conclusions (Executive)

GPU virtualization is a simple and effective way to create a development environment for multi-node, GPU compute, systems. There is a considerable cost savings over time when compared to 3rd party cloud development environments. The breakdown below assumes a requisition of a Nvidia A10 datacenter class graphics card, retail cost is approximately $3k. We exceed the purchase cost of the A10 with a comparable AWS Instance, in use for 8 hours a day, in just 2 months. At 24 hours a day utilization that drops to just 21 days!

Although a high end custom system is required to run a single-node OpenStack deployment, most modern gaming systems with high end Nvidia graphics cards fully capable of running Ubuntu Server 22.04.3 with [KVM hypervisor](https://ubuntu.com/blog/kvm-hyphervisor) and a small number of vGPU VMs configured through `virsh`/`virt-manager` achieving the same ends. In most cases a RAM upgrade and Nvidia vGPU license will be the only other requirement.

There are also numerous added benefits to be gained from the hypervisor deployment including snapshots, image backup, reconfigure with simple XML edits, and the ability to design complex architectures for local development. Rolling back a failed system to a known good state becomes trivial and any number of GPU deployments can be configured, most cards support time-slice vGPU and Ampere or newer support [Multi-Instance GPU (MIG)](https://docs.nvidia.com/datacenter/tesla/mig-user-guide/index.html). MIG capable cards provide a fully dedicated logical vGPU, at the expense of 1/7th the cards resources.

Extending these development environments with network bridge interfaces and/or [Open vSwitch](https://www.openvswitch.org/) layers allow for complex network architecture to be constructed locally, fully replicating the network architecture of the deployment target.

### Dev Environment Cost Analysis: vGPU vs 3rd Party Cloud (Executive)

- Nvidia A10
    - [New $2,982](https://spwindustrial.com/dell-nvidia-a10-ampere-24gb-gddr6-passive-gpu-graphics-card-6knww/?gad_source=4&gclid=CjwKCAiA75itBhA6EiwAkho9e8O3VIZ-_vEbye-PkOpkl43MIe6dmjPfQOUWUUD-SxGnsU74LfsrThoCFZ4QAvD_BwE)
    - Multi-purpose; vGPU, NVENC (video encoding), Compute
    - AWS Comp Cost
        - g5.12xlarge
            - https://aws.amazon.com/ec2/instance-types/g5/
            - comp spec to local system
        - $5.672 a/hr on-demand
        - 526 Hours == Cost of A10
            - approx 2 months of use at 8 hr per day
            - approx 21 days of use at 24 hr per day
    - Advantage over AWS or general cloud compute host
        - Running OpenStack (Private Cloud hyper-convergent control plane) locally with a DC class GFX card will allow for prototyping of multi system parallel compute system.
            - Each VM or container instance and be assigned a vGPU, emulated from the single GPU, allowing for multi system GPU accelerated architecture development.
        - If we do that on AWS/cloud, we would need to pay for each instance separately so cost would be multiplied by the number of nodes we want to work with.
            - This provides a clear cost advantage to local deployment for this use case.
- Nvidia vGPU License
    - NOTE: vGPU functionality may work without license via KVM hypervisor, we can hold in this until system is configured.
    - Virtual Work Station License $250 a/yr
        - discount for 4 or 5 year license
        - [Virtual-GPU-Packaging-and-Licensing-Guide.pdf](../../_resources/Virtual-GPU-Packaging-and-Licensing-Guide.pdf)
