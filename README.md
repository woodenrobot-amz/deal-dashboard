# deal-dashboard
Deal Hunting for Woodworking

## GitHub Actions token (Actions tab)

The Actions tab in `index.html` triggers workflows from the browser using a
fine-grained personal access token (PAT) that you paste in. The app stores
the token in `localStorage` (key `woodenRobot.githubActionsToken.v1`) on
that device only; it is never committed to the repo. The token is sent as a
Bearer token to the GitHub API for this repository only, to dispatch
workflows (`POST /actions/workflows/<file>/dispatches`) and to poll run
status (`GET /actions/workflows/<file>/runs`).

Create the token at GitHub Settings > Developer settings > Personal access
tokens > Fine-grained tokens, with:

- Repository access: only `woodenrobot-amz/deal-dashboard`.
- Repository permissions: Actions, Read and write, and nothing else. Read
  is needed to poll run status; write is needed to dispatch workflows.
- Expiration: short (30 days or less). When it expires, create a new token
  and replace it with Set / Replace Token in the app.

In the app, use Set / Replace Token to save a token and Forget Token to
remove it from the device. Forget Token is disabled while a workflow run is
being tracked. Because any script on the origin can read `localStorage`,
keep the token scoped as above and rotate it promptly if it may have leaked.
