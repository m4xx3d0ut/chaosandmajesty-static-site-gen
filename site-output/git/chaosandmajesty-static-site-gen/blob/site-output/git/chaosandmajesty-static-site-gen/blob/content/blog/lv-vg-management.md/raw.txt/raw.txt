---
title: LV & VG Management
slug: lv-vg-management
author: m4xx3d0ut
summary: Playbook for reclaiming disks, adding them to Ubuntu LVM volume groups, and
  stretching the root filesystem safely.
tags:
- m4xx3d
- linux
- lvm
- storage
- devops
publishedAt: 2024-10-20
updatedAt: 2024-10-20
---
## TLDR;

- Inspect disks and existing LVM layout before touching partitions, then create a new physical volume on the cleared SSD.
- Extend the volume group and logical volume with `vgextend`/`lvextend`, choosing either 100% of free space or a fixed increment.
- Finish by resizing the filesystem with `resize2fs` and verifying the expanded root volume with `df -h`.

## Working Notes... In Graphic Detail...

To format an SSD to ext4 and include it as part of the root volume (`ubuntu--vg-ubuntu--lv`) in Ubuntu Server from the command line, you can follow these steps:

1. **Check Available Disks and Partitions:**

   First, list the available disks and logical volumes to identify the correct device for the SSD:

   ```bash
   lsblk
   ```

   This will show a tree of block devices, making it easier to locate your SSD and logical volume.

2. **Check Current LVM Configuration:**

   Since you want to extend `ubuntu--vg-ubuntu--lv`, check your LVM setup:

   ```bash
   sudo vgdisplay
   sudo lvdisplay
   ```

   This will show you the volume group and logical volumes. Ensure you note the correct paths for the volume group (`ubuntu-vg`) and logical volume (`ubuntu-lv`).

3. **Partition the SSD (if not already done):**

   If the SSD is unpartitioned, create a partition using `fdisk` or `parted`. Here's an example using `fdisk`:

   ```bash
   sudo fdisk /dev/sdX  # Replace X with the correct letter for your SSD
   ```

   Inside `fdisk`, create a new partition:
   - Press `n` to create a new partition.
   - Choose defaults for partition number and sector start/end.
   - Press `w` to write changes.

4. **Create a Physical Volume (PV):**

   If the SSD is now partitioned, you'll need to turn it into an LVM physical volume:

   ```bash
   sudo pvcreate /dev/sdX1  # Replace sdX1 with the partition path of the SSD
   ```

5. **Extend the Volume Group (VG):**

   Add the new physical volume to the existing volume group:

   ```bash
   sudo vgextend ubuntu-vg /dev/sdX1  # Replace ubuntu-vg and sdX1 with your VG and partition
   ```

6. **Extend the Logical Volume (LV):**

   Now extend the logical volume to use the space from the SSD:

   ```bash
   sudo lvextend -l +100%FREE /dev/ubuntu-vg/ubuntu-lv
   ```

7. **Resize the Filesystem:**

   After extending the logical volume, resize the filesystem to occupy the new space:

   ```bash
   sudo resize2fs /dev/ubuntu-vg/ubuntu-lv
   ```

8. **Verify the Changes:**

   Finally, check that the logical volume has been extended:

   ```bash
   df -h
   ```

---

To delete an old Cinder volume from the disk on an Ubuntu server, you can follow these steps to safely remove it before formatting the disk.

#### Steps to Remove the Old Cinder Volume:

1. **Identify the Cinder Volume:**

   ```bash
   lsblk
   sudo pvdisplay
   ```

2. **Stop OpenStack Cinder (if running):**

   ```bash
   sudo systemctl stop cinder-volume
   sudo systemctl stop cinder-api
   ```

3. **Delete the Cinder Volume from OpenStack (if applicable):**

   ```bash
   openstack volume list
   openstack volume delete <volume-id>
   ```

4. **Wipe the Partition Table:**

   ```bash
   sudo wipefs -a /dev/sdX
   sudo dd if=/dev/zero of=/dev/sdX bs=512 count=1
   ```

5. **Remove LVM (if applicable):**

   ```bash
   sudo lvchange -an /dev/<vg-name>/<lv-name>
   sudo lvremove /dev/<vg-name>/<lv-name>
   sudo pvremove /dev/sdX
   ```

6. **Partition and Format the Disk:**

   ```bash
   sudo mkfs.ext4 /dev/sdX1
   ```

---

Now that the drive has been cleared, add it to the existing volume group (`ubuntu-vg`) and extend the logical volume (`ubuntu-lv`).

#### Steps to Add the Cleared Drive to the Existing Volume Group and Extend the Logical Volume:

1. **Create a Physical Volume (PV):**

   ```bash
   sudo pvcreate /dev/sdX
   ```

2. **Extend the Volume Group (VG):**

   ```bash
   sudo vgextend ubuntu-vg /dev/sdX
   ```

3. **Check the Volume Group:**

   ```bash
   sudo vgdisplay
   ```

4. **Extend the Logical Volume (LV):**

   ```bash
   sudo lvextend -l +100%FREE /dev/ubuntu-vg/ubuntu-lv
   # or
   sudo lvextend -L +50G /dev/ubuntu-vg/ubuntu-lv
   ```

5. **Resize the Filesystem:**

   ```bash
   sudo resize2fs /dev/ubuntu-vg/ubuntu-lv
   ```

6. **Verify the Changes:**

   ```bash
   df -h
   ```

#### Summary
- You created a physical volume with `pvcreate`.
- Added the new drive to the volume group using `vgextend`.
- Extended the logical volume with `lvextend`.
- Resized the filesystem with `resize2fs`.
