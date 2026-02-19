export function getWebviewHtml(port: number, route: string = "/", projectId?: string | null): string {
  const params = new URLSearchParams({ embed: "true" });
  if (projectId) params.set("project", projectId);
  // Pass API token to Web UI so it can authenticate API calls
  const token = process.env.MIMIR_API_TOKEN;
  if (token) params.set("mimir_token", token);
  const separator = route.includes("?") ? "&" : "?";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none'; frame-src http://localhost:${port}; style-src 'unsafe-inline';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body, html {
      margin: 0;
      padding: 0 !important;
      width: 100%;
      height: 100%;
      overflow: hidden;
      background: transparent;
    }
    iframe {
      border: none;
      width: 100%;
      height: 100%;
    }
  </style>
</head>
<body>
  <iframe src="http://localhost:${port}${route}${separator}${params.toString()}"></iframe>
</body>
</html>`;
}
