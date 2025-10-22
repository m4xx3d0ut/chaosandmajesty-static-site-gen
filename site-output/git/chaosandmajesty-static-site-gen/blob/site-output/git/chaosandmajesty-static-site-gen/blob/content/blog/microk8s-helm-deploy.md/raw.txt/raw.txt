---
title: Deploying a Custom Helm Chart on MicroK8s
slug: microk8s-helm-deploy
author: m4xx3d0ut
summary: Step-by-step workflow for packaging a Helm chart, wiring MetalLB and ingress,
  and exposing the service on MicroK8s.
tags:
- m4xx3d
- kubernetes
- microk8s
- helm
- devops
publishedAt: 2025-01-31
updatedAt: 2025-01-31
---
## TLDR;

- Enable the `helm3`, `metallb`, `ingress`, and `dns` addons, and point your chart’s image repository at a local registry address.
- Parameterize `values.yaml` for service type, ingress hosts, and image metadata so you can redeploy with simple overrides.
- Package the chart, install it with `microk8s helm3 install`, then validate pods, services, ingress, and MetalLB IP assignment before curling the app.

## Working Notes... In Graphic Detail...

## **Deploying a Custom Helm Chart in MicroK8s with MetalLB and Ingress**

### **Custom Helm Chart**
Ensure you have the following setup:
- MicroK8s installed with `helm3`, `ingress`, `dns`, and `metallb` enabled.
- A local container registry accessible from MicroK8s.
- MetalLB configured to allocate an IP range.
- A working `kubectl` context for MicroK8s (`microk8s.kubectl` or alias to `kubectl`).

---

### **Step 1: Create a Helm Chart**
Run the following command to scaffold a new Helm chart:

```sh
microk8s helm3 create mychart
cd mychart
```

This creates a `mychart/` directory with the default Helm chart structure.

---

### **Step 2: Customize `values.yaml`**
Edit `values.yaml` to define the service, container image, and Ingress settings.

#### **Modify the Image Settings**
Ensure the container image references your local registry:

```yaml
image:
  repository: my-registry.local:32000/myapp
  tag: latest
  pullPolicy: IfNotPresent
```

Replace `my-registry.local:32000` with your registry's address.

#### **Define a Service**
By default, the chart defines a ClusterIP service. Change it to a `LoadBalancer` type if using MetalLB:

```yaml
service:
  type: LoadBalancer
  port: 80
  targetPort: 8080
```

Ensure your app listens on port `8080`.

#### **Enable Ingress**
Modify `values.yaml` to define an Ingress resource:

```yaml
ingress:
  enabled: true
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /
  hosts:
    - host: myapp.local
      paths:
        - path: /
          pathType: ImplementationSpecific
```

Ensure your `/etc/hosts` maps `myapp.local` to the MetalLB-assigned IP.

---

### **Step 3: Update `templates/ingress.yaml`**
Modify `templates/ingress.yaml` to match `values.yaml`:

```yaml
{{- if .Values.ingress.enabled }}
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: {{ .Release.Name }}
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /
spec:
  rules:
  - host: {{ .Values.ingress.hosts[0].host }}
    http:
      paths:
      - path: {{ .Values.ingress.hosts[0].paths[0].path }}
        pathType: {{ .Values.ingress.hosts[0].paths[0].pathType }}
        backend:
          service:
            name: {{ .Release.Name }}
            port:
              number: {{ .Values.service.port }}
{{- end }}
```

---

### **Step 4: Package and Install the Chart**
Run:

```sh
microk8s helm3 package .
```

This creates `mychart-0.1.0.tgz`.

Install it using:

```sh
microk8s helm3 install myapp ./mychart-0.1.0.tgz
```

---

### **Step 5: Verify the Deployment**
#### **Check Pods and Services**

```sh
microk8s kubectl get pods
microk8s kubectl get svc
```

Ensure the service has an external IP from MetalLB.

#### **Check Ingress**

```sh
microk8s kubectl get ingress
```

Verify the host matches `myapp.local`.

---

### **Step 6: Test Access**
Add an entry to `/etc/hosts`:

```sh
<metallb-ip> myapp.local
```

Then, test access:

```sh
curl http://myapp.local
```

If your app serves HTTP, you should get a response.

---

### **Troubleshooting**
- Check logs:

  ```sh
  microk8s kubectl logs -l app=myapp
  ```

- Describe resources:

  ```sh
  microk8s kubectl describe pod <pod-name>
  microk8s kubectl describe ingress myapp
  ```

- Ensure MetalLB assigned an IP:

  ```sh
  microk8s kubectl get svc
  ```


---

### MetalLB Troubleshooting

#### **1. Check if MetalLB is Running**
Run:

```sh
microk8s kubectl get pods -n metallb-system
```

Expected output should show MetalLB components like `controller` and `speaker` running:

```
NAME                          READY   STATUS    RESTARTS   AGE
metallb-controller-xxxxx      1/1     Running   0          3d
metallb-speaker-xxxxx         1/1     Running   0          3d
```

If MetalLB is not running, try:

```sh
microk8s enable metallb
```

It will prompt you to enter an IP range.

---

#### **2. Check for MetalLB Resources**
MicroK8s may be using a `Custom Resource Definition (CRD)` instead of the old `ConfigMap`. Check for `IPAddressPools`:

```sh
microk8s kubectl get ipaddresspools.metallb.io -A
```

If an IP address pool exists, describe it:

```sh
microk8s kubectl describe ipaddresspools.metallb.io default-addresspool -n metallb-system
```

---

#### **3. Reconfigure MetalLB (If CRD is Used)**
If the `ConfigMap` is missing but `IPAddressPools` exists, update the IP range by editing the `IPAddressPool` resource:

```sh
microk8s kubectl edit ipaddresspools.metallb.io <pool-name> -n metallb-system
```

Modify the `addresses` section:

```yaml
spec:
  addresses:
    - 192.168.1.100-192.168.1.200
```

Save and exit.

---

#### **4. Manually Create an IP Pool (If None Exists)**
If there is no existing `IPAddressPool`, create one:

```yaml
cat <<EOF | microk8s kubectl apply -f -
apiVersion: metallb.io/v1beta1
kind: IPAddressPool
metadata:
  name: my-ip-pool
  namespace: metallb-system
spec:
  addresses:
    - 192.168.1.100-192.168.1.200
---
apiVersion: metallb.io/v1beta1
kind: L2Advertisement
metadata:
  name: my-l2-advert
  namespace: metallb-system
EOF
```

This defines an IP pool and advertises it to the cluster.

---

#### **5. Verify New Configuration**
After making changes, check:

```sh
microk8s kubectl get ipaddresspools.metallb.io -n metallb-system
microk8s kubectl get svc -A | grep LoadBalancer
```


---


### MetalLB Static IP Assignment

#### **1. Define a `IPAddressPool` for a Static IP Range**
Ensure your MetalLB IP pool includes the static IPs you want to assign. If you haven't already, create or edit an `IPAddressPool` to include `192.168.29.16` and `192.168.29.17`:

```sh
microk8s kubectl edit ipaddresspools.metallb.io my-ip-pool -n metallb-system
```

Modify or add:

```yaml
spec:
  addresses:
    - 192.168.29.16-192.168.29.17
```

If an `IPAddressPool` doesn’t exist, create one:

```sh
cat <<EOF | microk8s kubectl apply -f -
apiVersion: metallb.io/v1beta1
kind: IPAddressPool
metadata:
  name: my-ip-pool
  namespace: metallb-system
spec:
  addresses:
    - 192.168.29.16-192.168.29.17
---
apiVersion: metallb.io/v1beta1
kind: L2Advertisement
metadata:
  name: my-l2-advert
  namespace: metallb-system
EOF
```

---

#### **2. Assign a Static IP in Your Helm Chart**
Modify your Helm chart's `values.yaml` to request a specific IP from MetalLB:

```yaml
service:
  type: LoadBalancer
  loadBalancerIP: 192.168.29.16
  port: 80
  targetPort: 8000
```

For the next service, assign `192.168.29.17`:

```yaml
service:
  type: LoadBalancer
  loadBalancerIP: 192.168.29.17
  port: 80
  targetPort: 8080
```

---

#### **3. Deploy the Helm Chart**
After modifying `values.yaml`, deploy (or upgrade) the chart:

```sh
microk8s helm3 upgrade --install youtube-integ ./youtube-integ-chart
```

Then, verify the assigned IP:

```sh
microk8s kubectl get svc -A | grep LoadBalancer
```

It should show `192.168.29.16` assigned persistently.

---

#### **4. Configure Local DNS**
Now, map the static IP to `youtube-integ.local` in your local DNS or `/etc/hosts`:

```sh
echo "192.168.29.16 youtube-integ.local" | sudo tee -a /etc/hosts
```

Test with:

```sh
curl http://youtube-integ.local
```

---

#### **5. Repeat for Other Services**
For the next service, ensure `values.yaml` specifies:

```yaml
service:
  type: LoadBalancer
  loadBalancerIP: 192.168.29.17
```

Then, deploy it and map `192.168.29.17` in DNS.

Now, your services will always get the correct IPs even after uninstalling/reinstalling! 🚀
