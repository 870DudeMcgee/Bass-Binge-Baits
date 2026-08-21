# Deployment workflow

- For repairs to the live site, identify the production branch and deployment first, commit the fix directly to that branch, deploy it, and verify the production domain in a browser.
- Use feature branches for feature work, not for small production bug fixes.
- A branch push is not completion evidence for a live-site repair; the production URL must pass the relevant regression check.
