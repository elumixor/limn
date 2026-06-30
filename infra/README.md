# Infrastructure (Terraform)

Manages the Vercel project and the GitHub Actions secrets that drive CI/CD.

## What it provisions

- `vercel_project.limn` — the Vercel project (framework: SvelteKit, deploys via CI).
- `github_actions_secret.*` — `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`
  consumed by `.github/workflows/deploy.yml`.
- `vercel_project_environment_variable.app` — optional app env vars from `.env`,
  fed through the `app_env` variable (empty by default).

## Usage

```sh
cp terraform.tfvars.example terraform.tfvars   # fill in tokens (gitignored)
terraform init
terraform plan
terraform apply
```

State is local (`terraform.tfstate`) and gitignored along with `terraform.tfvars`.
The CLI deploy token, org id, and project id never get committed.

## Deploy flow

GitHub Actions (`deploy.yml`) builds with the Vercel CLI and deploys:
preview on pull requests, production on push to `main`. The Vercel Git
integration is intentionally left disconnected so deploys only come from CI.
