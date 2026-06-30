terraform {
  required_version = ">= 1.6"

  required_providers {
    vercel = {
      source  = "vercel/vercel"
      version = "~> 3.0"
    }
    github = {
      source  = "integrations/github"
      version = "~> 6.0"
    }
  }
}

provider "vercel" {
  api_token = var.vercel_api_token
  # Personal account scope — omit team for team-scoped projects.
}

provider "github" {
  token = var.github_token
  owner = var.github_owner
}
