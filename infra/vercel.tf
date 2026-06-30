# Vercel project for the SvelteKit app. Deploys are driven by GitHub Actions
# (Vercel CLI), so the Git integration is intentionally left disconnected to
# avoid double deploys.
resource "vercel_project" "limn" {
  name      = var.project_name
  framework = "sveltekit"

  # Build settings are auto-detected from the SvelteKit project; adapter-auto
  # resolves to @sveltejs/adapter-vercel when building in CI.
}

# App environment variables, sourced from .env via the app_env map. Applied to
# all targets (production, preview, development). Empty by default — there are
# no app secrets yet.
resource "vercel_project_environment_variable" "app" {
  # Keys (var names) are not secret; values are sensitive.
  for_each = nonsensitive(toset(keys(var.app_env)))

  project_id = vercel_project.limn.id
  key        = each.key
  value      = var.app_env[each.key]
  target     = ["production", "preview", "development"]
}
