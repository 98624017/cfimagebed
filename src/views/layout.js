export function renderLayout(title, body, options = {}) {
  const notice = options.notice ? `
      <section class="panel" style="border-color:#8db9b2;background:#f2fbf8;">
        <strong>${options.notice}</strong>
      </section>
    ` : '';

  return `<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f5f1e8;
        --panel: #fffaf2;
        --text: #1e1b18;
        --muted: #6b6257;
        --accent: #156f63;
        --border: #d8cdbd;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: "IBM Plex Sans", "Noto Sans SC", sans-serif;
        background: linear-gradient(180deg, #f7f2e8 0%, #efe3d1 100%);
        color: var(--text);
      }
      header, main {
        width: min(1080px, calc(100vw - 32px));
        margin: 0 auto;
      }
      header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 24px 0 12px;
      }
      nav {
        display: flex;
        gap: 12px;
        flex-wrap: wrap;
      }
      nav a, .action-link {
        color: var(--accent);
        text-decoration: none;
        font-weight: 600;
      }
      main {
        padding-bottom: 32px;
      }
      .panel {
        background: var(--panel);
        border: 1px solid var(--border);
        border-radius: 18px;
        padding: 20px;
        margin-bottom: 16px;
        box-shadow: 0 8px 24px rgba(43, 35, 22, 0.06);
      }
      .muted {
        color: var(--muted);
      }
      .grid {
        display: grid;
        gap: 16px;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      }
      table {
        width: 100%;
        border-collapse: collapse;
      }
      th, td {
        border-bottom: 1px solid var(--border);
        padding: 12px 8px;
        text-align: left;
        vertical-align: top;
      }
      th {
        color: var(--muted);
        font-size: 13px;
      }
      code {
        background: #efe6d7;
        padding: 2px 6px;
        border-radius: 6px;
      }
    </style>
  </head>
  <body>
    <header>
      <div>
        <strong>cfimagebed Admin</strong>
      </div>
      <nav>
        <a href="/admin">概览</a>
        <a href="/admin/clients">开发者</a>
        <a href="/admin/config">全局配置</a>
        <a href="/admin/installs">安装实例</a>
        <a href="/admin/logout">退出</a>
      </nav>
    </header>
    <main>
      ${notice}
      ${body}
    </main>
  </body>
</html>`;
}
