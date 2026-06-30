variable "vercel_api_token" {
  description = "Vercel API token used by Terraform and CI to manage/deploy the project."
  type        = string
  sensitive   = true
}

variable "vercel_org_id" {
  description = "Vercel org/user id that owns the project (used as VERCEL_ORG_ID in CI)."
  type        = string
}

variable "github_token" {
  description = "GitHub token with repo + workflow scope for managing Actions secrets."
  type        = string
  sensitive   = true
}

variable "github_owner" {
  description = "GitHub owner (user or org) of the repository."
  type        = string
  default     = "elumixor"
}

variable "github_repo" {
  description = "GitHub repository name."
  type        = string
  default     = "limn"
}

variable "project_name" {
  description = "Vercel project name."
  type        = string
  default     = "limn"
}

variable "app_env" {
  description = "Application environment variables sourced from .env, applied to the Vercel project across all targets."
  type        = map(string)
  default     = {}
  sensitive   = true
}
