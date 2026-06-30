data "github_repository" "limn" {
  full_name = "${var.github_owner}/${var.github_repo}"
}

# CI/CD secrets consumed by .github/workflows/deploy.yml to build and deploy
# via the Vercel CLI.
resource "github_actions_secret" "vercel_token" {
  repository      = data.github_repository.limn.name
  secret_name     = "VERCEL_TOKEN"
  plaintext_value = var.vercel_api_token
}

resource "github_actions_secret" "vercel_org_id" {
  repository      = data.github_repository.limn.name
  secret_name     = "VERCEL_ORG_ID"
  plaintext_value = var.vercel_org_id
}

resource "github_actions_secret" "vercel_project_id" {
  repository      = data.github_repository.limn.name
  secret_name     = "VERCEL_PROJECT_ID"
  plaintext_value = vercel_project.limn.id
}
