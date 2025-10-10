---
title: MicroK8s Deployment Notes
slug: microk8s-notes
author: m4xx3d0ut
summary: End-to-end checklist for building charts, pushing images, exposing services,
  and managing the built-in registry on MicroK8s.
tags:
- m4xx3d
- kubernetes
- microk8s
- devops
- registry
publishedAt: 2025-01-28
updatedAt: 2025-02-02
---
## TLDR;

- Scaffold charts with `helm create`, keep configuration in `values.yaml`, and rely on MetalLB plus the ingress addon to expose services.
- Push images to a local registry (`localhost:32000` or a bespoke registry) and update chart image references accordingly.
- Debug registry exposure, MetalLB IP pools, and Helm templating with `kubectl edit`, address pools, and ConfigMap/ConfigMap-from-env workflows.

## Working Notes... In Graphic Detail...

## YouTube Integ API Helm Chart Creation

#### **1. Prepare the Helm Chart**

1. **Create a Helm Chart:**
   ```bash
   helm create youtube-integ-chart
   cd youtube-integ-chart
   ```

2. **Organize Your Chart Structure:**
   Your chart will look like this:
   ```
   youtube-integ-chart/
   ├── Chart.yaml
   ├── values.yaml
   └── templates/
       ├── deployment.yaml
       ├── service.yaml
       └── ingress.yaml  # Optional, for external access via domain
   ```

3. **Customize `values.yaml`:**
   Open `values.yaml` and define your Docker image and service details:
   ```yaml
   image:
     repository: your-dockerhub-username/youtube-integ
     tag: latest
     pullPolicy: IfNotPresent

   service:
     type: NodePort
     port: 8000
     targetPort: 8000

   replicaCount: 1
   ```

4. **Edit `templates/deployment.yaml`:**
   Configure the deployment to run your API container:
   ```yaml
   apiVersion: apps/v1
   kind: Deployment
   metadata:
     name: {{ .Release.Name }}
   spec:
     replicas: {{ .Values.replicaCount }}
     selector:
       matchLabels:
         app: {{ .Chart.Name }}
     template:
       metadata:
         labels:
           app: {{ .Chart.Name }}
       spec:
         containers:
         - name: youtube-integ
           image: "{{ .Values.image.repository }}:{{ .Values.image.tag }}"
           ports:
           - containerPort: {{ .Values.service.targetPort }}
   ```

5. **Edit `templates/service.yaml`:**
   Expose the service on port 8000:
   ```yaml
   apiVersion: v1
   kind: Service
   metadata:
     name: {{ .Release.Name }}
   spec:
     type: {{ .Values.service.type }}
     selector:
       app: {{ .Chart.Name }}
     ports:
     - port: {{ .Values.service.port }}
       targetPort: {{ .Values.service.targetPort }}
       nodePort: 30000  # External port on Node
   ```

6. **Optional: Add an Ingress (for domain-based access):**
   If you want to use an ingress, create `templates/ingress.yaml`:
   ```yaml
   apiVersion: networking.k8s.io/v1
   kind: Ingress
   metadata:
     name: {{ .Release.Name }}
     annotations:
       nginx.ingress.kubernetes.io/rewrite-target: /
   spec:
     rules:
     - host: youtube-integ.local
       http:
         paths:
         - path: /
           pathType: Prefix
           backend:
             service:
               name: {{ .Release.Name }}
               port:
                 number: {{ .Values.service.port }}
   ```

   Then enable MicroK8s ingress:
   ```bash
   microk8s enable ingress
   ```

---

#### **2. Build and Push the Docker Image**
1. Build the Docker image for your API:
   ```bash
   docker build -t your-dockerhub-username/youtube-integ ./microservices/youtube_integ
   ```

2. Push the image to Docker Hub:
   ```bash
   docker push your-dockerhub-username/youtube-integ
   ```

---

#### **3. Deploy the Helm Chart**

1. Package and deploy your chart:
   ```bash
   helm install youtube-integ ./youtube-integ-chart
   ```

2. Verify the deployment:
   ```bash
   microk8s kubectl get pods
   microk8s kubectl get services
   ```

3. Access the service:
   - If using a NodePort service, access it at `http://<Node-IP>:30000`. Get the Node IP:
     ```bash
     microk8s kubectl get nodes -o wide
     ```
   - If using an Ingress, add `youtube-integ.local` to your `/etc/hosts` file and access it at `http://youtube-integ.local`.

---

#### **4. Test Your API**

Test the API externally to confirm it's working:
```bash
curl http://<Node-IP>:30000/your-api-endpoint
```

---

## Values.yaml

Yes, when using `helm create`, **all configurable values in `templates/*.yaml` should ideally be pulled from `values.yaml`** instead of hardcoding them directly in the template files. This makes your Helm chart more flexible, reusable, and easy to manage. 

By default, `helm create` generates a structure where most of the values are already parameterized and fetched from `values.yaml`. However, there might still be placeholders or hardcoded values that you should customize for your use case.

---

#### **Benefits of Using `values.yaml`**
1. **Centralized Configuration:** All user-configurable settings are stored in one place, making the chart easier to maintain and understand.
2. **Reusable Charts:** You can reuse the same chart for multiple deployments by simply providing different `values.yaml` files or using `--set` for overrides.
3. **Separation of Code and Configuration:** Reduces the risk of accidentally overwriting template logic when updating configurations.
4. **Overrides for Environments:** You can define separate `values.yaml` files for staging, production, etc., without changing the templates.

---

#### **How to Parameterize Values**
In the `templates/*.yaml` files, replace hardcoded values with placeholders that reference `values.yaml`. For example:

##### **Before: Hardcoded Values**
```yaml
apiVersion: v1
kind: Service
metadata:
  name: my-service
spec:
  type: ClusterIP
  ports:
    - port: 80
      targetPort: 8080
  selector:
    app: my-app
```

##### **After: Use Values from `values.yaml`**
```yaml
apiVersion: v1
kind: Service
metadata:
  name: {{ .Release.Name }}-{{ .Values.service.name }}
spec:
  type: {{ .Values.service.type }}
  ports:
    - port: {{ .Values.service.port }}
      targetPort: {{ .Values.service.targetPort }}
  selector:
    app: {{ .Values.app.name }}
```

And in `values.yaml`:
```yaml
app:
  name: my-app

service:
  name: my-service
  type: ClusterIP
  port: 80
  targetPort: 8080
```

---

#### **How to Use `values.yaml` Effectively**
1. **Keep Defaults in `values.yaml`:**
   Store default configurations for your chart in `values.yaml` so users don’t have to supply everything manually.

2. **Use Placeholders in `templates/*.yaml`:**
   Use the `{{ .Values.<key> }}` syntax to reference values from `values.yaml`.

3. **Use Default Fallbacks (Optional):**
   If a value is optional, you can provide a default using the `default` function:
   ```yaml
   type: {{ .Values.service.type | default "ClusterIP" }}
   ```

4. **Avoid Hardcoding Values in Templates:**
   Instead of embedding fixed values like names, ports, or replicas directly in `templates/*.yaml`, make them configurable.

---

#### **Deploying with Custom Values**
Users can override values at deployment time using either:
1. A custom `values.yaml`:
   ```bash
   helm install my-app ./my-chart -f custom-values.yaml
   ```

2. Inline `--set` flags:
   ```bash
   helm install my-app ./my-chart --set service.type=LoadBalancer
   ```

---

#### **Recommendation for Charts**
- Ensure that **all configurable fields** (e.g., service type, port numbers, image repository, resource limits) are parameterized in `values.yaml`.
- Use Helm’s built-in functions (e.g., `default`, `toYaml`) to handle optional or complex configurations.
- Keep `values.yaml` well-documented with comments to explain each key.

By following these practices, your Helm charts will be more robust, reusable, and easier to maintain. Let me know if you'd like help improving a specific chart!

---

## Local Docker Image Registry

https://microk8s.io/docs/registry-private

To push your Docker image to a **local repository** instead of Docker Hub, you can set up and use a private Docker registry or a container registry provided by MicroK8s. Here's how to do it:

---

#### **Option 1: Use the MicroK8s Built-in Docker Registry**

MicroK8s comes with an optional built-in container registry that you can enable:

1. **Enable the Registry:**
   ```bash
   microk8s enable registry
   ```
   - This sets up a local Docker registry at `localhost:32000` (default port).

2. **Tag Your Docker Image:**
   Tag your Docker image to point to the MicroK8s registry:
   ```bash
   docker tag your-dockerhub-username/youtube-integ localhost:32000/youtube-integ
   ```

3. **Push the Image to the Registry:**
   Push the image to the local registry:
   ```bash
   docker push localhost:32000/youtube-integ
   ```

4. **Use the Image in Kubernetes:**
   In your Helm chart's `values.yaml`, update the image repository to:
   ```yaml
   image:
     repository: localhost:32000/youtube-integ
     tag: latest
   ```

   Kubernetes will pull the image from the local registry when deploying.

---

#### **Option 2: Set Up a Standalone Local Docker Registry**

If you want a standalone registry (not tied to MicroK8s), follow these steps:

1. **Run a Local Docker Registry:**
   Launch a local registry container:
   ```bash
   docker run -d -p 5000:5000 --name local-registry registry:2
   ```
   This runs a private registry accessible at `localhost:5000`.

2. **Tag Your Docker Image:**
   Tag your image to point to the local registry:
   ```bash
   docker tag your-dockerhub-username/youtube-integ localhost:5000/youtube-integ
   ```

3. **Push the Image to the Registry:**
   Push the image to the local registry:
   ```bash
   docker push localhost:5000/youtube-integ
   ```

4. **Configure MicroK8s to Use the Local Registry:**
   If MicroK8s runs in a VM (e.g., Multipass), you need to expose the registry to MicroK8s:

   - Edit Docker's daemon configuration (on the machine running MicroK8s):
     ```json
     {
       "insecure-registries": ["localhost:5000"]
     }
     ```
   - Restart the Docker daemon:
     ```bash
     sudo systemctl restart docker
     ```

5. **Update Your Helm Chart:**
   Update the `values.yaml` file to point to your local registry:
   ```yaml
   image:
     repository: localhost:5000/youtube-integ
     tag: latest
   ```

6. **Deploy Your Chart:**
   Helm will now pull the image from the local registry.

---

#### **Option 3: Use Kind (`kind`) to Push Images for Local Kubernetes Testing**

If you’re using **Kind** (Kubernetes-in-Docker), load the Docker image directly into the cluster:

1. Build the image:
   ```bash
   docker build -t youtube-integ ./microservices/youtube_integ
   ```

2. Load the image into the cluster:
   ```bash
   microk8s ctr image import youtube-integ.tar
   ```

3. Deploy the Helm chart, referencing the local image:
   ```yaml
   image:
     repository: youtube-integ
     tag: latest
   ```

---

## Configure the Local Registry

In MicroK8s version 1.32.1, the built-in registry is deployed as a service within the Kubernetes cluster and is exposed as a NodePort service on port `32000` of the localhost. This means it's accessible via `localhost:32000` on the host machine. ([microk8s.io](https://microk8s.io/docs/registry-built-in?utm_source=chatgpt.com))

To make the registry accessible on all network interfaces (i.e., binding to `0.0.0.0`), you can modify the service's configuration to expose it externally. Here's how:

1. **Edit the Registry Service:**

   The registry is managed as a Kubernetes service named `registry`. You can edit this service to change its configuration:

   ```bash
   microk8s kubectl edit service registry -n container-registry
   ```

2. **Modify the Service Type:**

   In the editor that opens, you'll see the service definition in YAML format. Locate the `spec` section and change the `type` from `NodePort` to `LoadBalancer`. This will provision an external IP address for the service, making it accessible from outside the cluster.

   Before:

   ```yaml
   spec:
     type: NodePort
     ports:
       - port: 32000
         targetPort: 5000
         nodePort: 32000
     selector:
       app: registry
   ```

   After:

   ```yaml
   spec:
     type: LoadBalancer
     ports:
       - port: 32000
         targetPort: 5000
     selector:
       app: registry
   ```

   Save and exit the editor.

3. **Verify the External IP:**

   After modifying the service, check its status to find the external IP address assigned:

   ```bash
   microk8s kubectl get service registry -n container-registry
   ```

   The output will show an `EXTERNAL-IP` once it's assigned. This may take a few moments.

4. **Access the Registry:**

   Once the external IP is available, you can push images to the registry using this IP address:

   ```bash
   docker tag your-image <external-ip>:32000/your-image
   docker push <external-ip>:32000/your-image
   ```

**Considerations:**

- **Security:** Exposing the registry externally can pose security risks. Ensure that appropriate firewall rules and access controls are in place. For production environments, consider securing the registry with TLS and authentication.

- **Networking:** If your environment doesn't support automatic provisioning of external IPs (common in bare-metal setups), you might need to configure a MetalLB load balancer or adjust your network settings accordingly.

By following these steps, you can configure the MicroK8s built-in registry to be accessible from external machines, effectively binding it to `0.0.0.0`. 

---

## MetaLLB Load Balancer

#### **Steps to Debug and Fix**

##### **1. Ensure MetalLB Is Configured (For Bare-Metal)**
   - If your cluster is not on a cloud provider, you need to install and configure MetalLB to assign an external IP to the `LoadBalancer` service.

   **Enable MetalLB in MicroK8s:**
   ```bash
   microk8s enable metallb
   ```

   **Provide an IP Range:**
   During the setup, you’ll be prompted to input an IP range (e.g., `192.168.1.240-192.168.1.250`) that MetalLB will use to assign external IPs. Choose a range that’s within your local network.

   **Check MetalLB Is Working:**
   After enabling MetalLB, check if the registry service has an external IP assigned:
   ```bash
   microk8s kubectl get service registry -n container-registry
   ```

##### **2. Check Firewall Rules**
   Ensure that port `32000` is open on your node(s) for both incoming and outgoing traffic.

   - On Linux, you can open the port with:
     ```bash
     sudo ufw allow 32000
     ```

   - Confirm the port is open:
     ```bash
     sudo ufw status
     ```

##### **3. Verify Service Configuration**
   Reapply the updated service configuration to ensure all changes take effect:
   ```bash
   microk8s kubectl apply -f <your-service-config.yaml>
   ```

##### **4. Check Logs and Events**
   Inspect the logs and events for any issues related to the service:
   ```bash
   microk8s kubectl describe service registry -n container-registry
   ```

---

#### **Expected Outcome**
After enabling MetalLB and ensuring your firewall is configured, the `status.loadBalancer` field should populate with an external IP. You can then push Docker images to the registry using that IP.

---

## Build & Tag the Image

To tag your Docker image for use with your local MicroK8s registry, you need to include the registry address (which defaults to `localhost:32000`) in the image name. Here's how you should modify your `docker build` command:

#### **Build and Tag the Image**
```bash
docker build -t localhost:32000/youtube_integ:latest -f ./microservices/youtube_integ/Dockerfile .
```

#### **Explanation**
1. **`localhost:32000`**: This points to the MicroK8s local container registry.
2. **`youtube_integ`**: The name of your image.
3. **`:latest`**: The tag for the image (optional but commonly used).

#### **Push the Image to the Registry**
After building the image, you need to push it to the MicroK8s registry:
```bash
docker push localhost:32000/youtube_integ:latest
```

---

#### **Additional Notes**
- If the MicroK8s registry is configured with a different address (e.g., external IP or custom port), replace `localhost:32000` with the appropriate value.
- Ensure that the local registry is enabled:
  ```bash
  microk8s enable registry
  ```
- If you encounter issues with Docker authentication, ensure Docker is configured to use an insecure registry for `localhost:32000`:
  1. Edit the Docker daemon configuration file (`/etc/docker/daemon.json`):
     ```json
     {
       "insecure-registries": ["localhost:32000"]
     }
     ```
  2. Restart Docker:
     ```bash
     sudo systemctl restart docker
     ```

Once the image is pushed, you can deploy it to your MicroK8s Kubernetes cluster using a `Helm` chart or `kubectl` manifest.

---

## Local Registry Ops

To manage and view the images in your local **MicroK8s registry**, here’s how you can list the stored images and delete any you no longer need:

---

#### **1. View Images in the Registry**
The MicroK8s registry stores images as files within the container running the registry. By default, the registry uses a **filesystem backend**, and images can be listed using `microk8s ctr`.

##### **List Images**
Run the following command:
```bash
microk8s ctr images list
```

This will display all images in the registry and their tags.

---

#### **2. Delete Images from the Registry**
You can delete images by using the `microk8s ctr images remove` command.

##### **Command to Remove an Image**
```bash
microk8s ctr images remove <image-name>:<tag>
```

For example:
```bash
microk8s ctr images remove localhost:32000/youtube_integ:latest
```

This removes the specified image from the registry.

---

#### **3. Force Cleanup of Dangling Layers**
If you’ve deleted images but still see storage being used, it may be due to orphaned layers or cache files. Clean up unused layers with:
```bash
microk8s ctr content gc
```

---

#### **4. (Optional) Interact Directly with the Registry**
If needed, you can access the MicroK8s registry directly to inspect or clean up manually:
1. **Access the Registry Pod**:
   ```bash
   microk8s kubectl -n container-registry get pods
   ```
   Look for the registry pod (usually named `registry-xxxxx`).

2. **Enter the Pod**:
   ```bash
   microk8s kubectl -n container-registry exec -it registry-xxxxx -- sh
   ```

3. **Inspect Stored Images**:
   The images are usually stored in `/var/lib/registry`. You can navigate and delete files manually if necessary:
   ```bash
   ls /var/lib/registry/docker/registry/v2/repositories
   ```

---

#### **5. Clean All Registry Data (Optional)**
If you want to reset the entire registry (delete all images), simply delete the registry storage volume:
```bash
sudo rm -rf /var/snap/microk8s/common/var/lib/registry
```

This action will completely remove all images stored in the registry. Use it with caution!

---

To create a **ConfigMap** in MicroK8s from an `.env` file, follow these steps:

#### 1. Prepare the `.env` file  
Ensure your `.env` file is formatted as key-value pairs:  

```sh
## my-config.env
DB_HOST=db.example.com
DB_USER=admin
DB_PASS=securepassword
```

#### 2. Create the ConfigMap  

Use the following command to create a ConfigMap from the file:

```sh
microk8s kubectl create configmap my-config --from-env-file=my-config.env
```

This creates a ConfigMap named `my-config` with the key-value pairs from `my-config.env`.

#### 3. Verify the ConfigMap  

Check if the ConfigMap was created successfully:

```sh
microk8s kubectl get configmap my-config -o yaml
```

#### 4. Use the ConfigMap in a Pod  

Reference the ConfigMap in a Pod by mounting it as environment variables:

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: my-app
spec:
  containers:
    - name: my-container
      image: my-app:latest
      envFrom:
        - configMapRef:
            name: my-config
```

#### Alternative: Using a Helm Chart  
If you’re using Helm, define the ConfigMap in your **values.yaml** and template it in your Helm chart:

```yaml
config:
  DB_HOST: "db.example.com"
  DB_USER: "admin"
  DB_PASS: "securepassword"
```

Then, use a **ConfigMap template** in your chart:

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: my-config
data:
  {{- range $key, $value := .Values.config }}
  {{ $key }}: "{{ $value }}"
  {{- end }}
```
