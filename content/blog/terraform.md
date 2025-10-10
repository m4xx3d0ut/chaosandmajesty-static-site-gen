---
title: Terraform
slug: terraform
author: m4xx3d0ut
summary: Terraform cheat sheet covering fmt/validate, init/plan/apply, imports, workspaces,
  and state management best practices.
tags:
- m4xx3d
publishedAt: 2025-02-06
updatedAt: 2025-02-06
readingMinutes: 5
---
[Terraform Docs](https://developer.hashicorp.com/terraform/language)

## General Usage

### Format and validate the configuration

Format your configuration. Terraform will print out the names of the files it modified, if any. In this case, your configuration file was already formatted correctly, so Terraform won't return any file names.

```
terraform fmt
```

Validate your configuration. The example configuration provided above is valid, so Terraform will return a success message.

```
terraform validate
```

### Create infrastructure

Apply the configuration now with the terraform apply command. Terraform will print output similar to what is shown below. We have truncated some of the output to save space.

```
terraform apply
```

### Inspect state

Inspect the current state using terraform show.

```
terraform show
```

### Manually Managing State

Terraform has a built-in command called terraform state for advanced state management. Use the list subcommand to list of the resources in your project's state.

```
terraform state list
```

### Destroy

Destroy the resources you created.

```
terraform destroy
```

## Define input variables

### Set the container name with a variable

Create a new file called variables.tf with a block defining a new container_name variable.

```
variable "container_name" {
  description = "Value of the name for the Docker container"
  type        = string
  default     = "ExampleNginxContainer"
}
```

In main.tf, update the docker_container resource block to use the new variable. The container_name variable block will default to its default value ("ExampleNginxContainer") unless you declare a different value.

```
resource "docker_container" "nginx" {
  image = docker_image.nginx.image_id
  name  = var.container_name
  ports {
    internal = 80
    external = 8080
  }
}
```

Apply the configuration. Respond to the confirmation prompt with a yes.

```
terraform apply
```

Now apply the configuration again, this time overriding the default container name by passing in a variable using the -var flag. Terraform will update the container's name attribute with the new name. Respond to the confirmation prompt with yes.

```
terraform apply -var "container_name=YetAnotherName"
```


---


## Docker

[Provider Reference](https://registry.terraform.io/providers/kreuzwerker/docker/latest/docs)

### Build

Simple example to create a Nginx Docker container.

Create a `main.tf`

```
terraform {
  required_providers {
    docker = {
      source  = "kreuzwerker/docker"
      version = "~> 3.0.1"
    }
  }
}

provider "docker" {}

resource "docker_image" "nginx" {
  name         = "nginx"
  keep_locally = false
}

resource "docker_container" "nginx" {
  image = docker_image.nginx.image_id
  name  = "tutorial"

  ports {
    internal = 80
    external = 8000
  }
}
```

Initialize the directory.

```
terraform init
```

Terraform downloads the docker provider and installs it in a hidden subdirectory of your current working directory, named .terraform. The terraform init command prints out which version of the provider was installed. Terraform also creates a lock file named .terraform.lock.hcl which specifies the exact provider versions used, so that you can control when you want to update the providers used for your project.

### Output Docker container configuration

Add the configuration below to outputs.tf to define outputs for your container's ID and the image ID.

```
output "container_id" {
  description = "ID of the Docker container"
  value       = docker_container.nginx.id
}

output "image_id" {
  description = "ID of the Docker image"
  value       = docker_image.nginx.id
}
```

You must apply this configuration before you can use these output values. Apply your configuration now. Respond to the confirmation prompt with yes.

```
terraform apply
```

Terraform prints output values to the screen when you apply your configuration. Query the outputs with the terraform output command.

```bash
$ terraform output
container_id = "e5fff27c62e26dc9504d21980543f21161225ab483a1e534a98311a677b9453a"
image_id = "sha256:d1a364dc548d5357f0da3268c888e1971bbdb957ee3f028fe7194f1d61c6fdeenginx:latest"
```

More detail on [outputs](https://developer.hashicorp.com/terraform/tutorials/configuration-language/outputs)


---


## AWS

[Provider Reference](https://registry.terraform.io/providers/hashicorp/aws/latest/docs)

### Build

Create a `main.tf`

```
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 4.16"
    }
  }

  required_version = ">= 1.2.0"
}

provider "aws" {
  region  = "us-west-2"
}

resource "aws_instance" "app_server" {
  ami           = "ami-830c94e3"
  instance_type = "t2.micro"

  tags = {
    Name = "ExampleAppServerInstance"
  }
}
```


Initialize the directory.

```
terraform init
```

Terraform downloads the aws provider and installs it in a hidden subdirectory of your current working directory, named .terraform. The terraform init command prints out which version of the provider was installed. Terraform also creates a lock file named .terraform.lock.hcl which specifies the exact provider versions used, so that you can control when you want to update the providers used for your project.
