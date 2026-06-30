output "vercel_project_id" {
  description = "Vercel project id (also pushed to GitHub as VERCEL_PROJECT_ID)."
  value       = vercel_project.limn.id
}

output "vercel_project_name" {
  value = vercel_project.limn.name
}
