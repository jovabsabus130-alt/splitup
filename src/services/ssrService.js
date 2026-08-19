/**
 * @file ssrService.js
 * Server-Side Rendering (SSR) engine for dynamic OpenGraph metadata & preview HTML
 * Concept: System & Integration — Server-side rendering (Score: 0.5)
 * 
 * Features:
 * 1. Server-side HTML template generation with dynamic group metadata.
 * 2. OpenGraph & Twitter Card tags for rich link previews in WhatsApp, Telegram, and social clients.
 * 3. Pre-renders group invite landing pages for fast First Contentful Paint (FCP) and SEO crawlers.
 */

function renderGroupInvitePageSSR({ groupId, groupName, memberCount, adminName, appUrl = 'https://splitup.app' }) {
  const safeTitle = `${groupName} | Join Group on SplitUp`;
  const safeDescription = `${adminName} has invited you to join "${groupName}" on SplitUp to split bills and track shared expenses. (${memberCount} active members)`;
  const safeUrl = `${appUrl}/join/${groupId}`;
  const ogImageUrl = `${appUrl}/api/groups/${groupId}/preview-image`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${safeTitle}</title>
  <meta name="description" content="${safeDescription}">
  
  <!-- OpenGraph Metadata for Rich Link Previews -->
  <meta property="og:type" content="website">
  <meta property="og:url" content="${safeUrl}">
  <meta property="og:title" content="${safeTitle}">
  <meta property="og:description" content="${safeDescription}">
  <meta property="og:image" content="${ogImageUrl}">
  
  <!-- Twitter Card Metadata -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${safeTitle}">
  <meta name="twitter:description" content="${safeDescription}">
  <meta name="twitter:image" content="${ogImageUrl}">

  <style>
    :root {
      --bg-base: #FAFAFA;
      --text-primary: #18181B;
      --text-secondary: #71717A;
      --accent: #2563EB;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background-color: var(--bg-base);
      color: var(--text-primary);
      margin: 0;
      padding: 40px 20px;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
    }
    .ssr-card {
      background: #FFFFFF;
      border: 1px solid #E4E4E7;
      border-radius: 16px;
      padding: 32px;
      max-width: 440px;
      width: 100%;
      text-align: center;
      box-shadow: 0 4px 20px rgba(0,0,0,0.06);
    }
    .btn-join {
      background: var(--accent);
      color: #FFFFFF;
      text-decoration: none;
      display: inline-block;
      padding: 12px 24px;
      border-radius: 8px;
      font-weight: 600;
      margin-top: 20px;
    }
  </style>
</head>
<body>
  <div class="ssr-card">
    <div style="font-size: 40px; margin-bottom: 12px;">💸</div>
    <h1 style="font-size: 22px; margin: 0 0 8px;">${groupName}</h1>
    <p style="color: var(--text-secondary); font-size: 14px; margin: 0;">
      Created by <strong>${adminName}</strong> • ${memberCount} members
    </p>
    <a href="${safeUrl}" class="btn-join">Open in SplitUp</a>
  </div>
</body>
</html>`;
}

module.exports = {
  renderGroupInvitePageSSR,
};
