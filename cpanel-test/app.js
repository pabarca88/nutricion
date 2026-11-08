const http = require("http");

const port = Number(process.env.PORT || 3000);
const startedAt = new Date().toISOString();

const page = `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>NutriPediátrica · Prueba técnica</title>
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f4faf7; color: #173d36; font-family: Arial, sans-serif; }
      main { width: min(580px, calc(100% - 36px)); background: #fff; border: 1px solid #dcebe5; border-radius: 18px; padding: 42px; box-shadow: 0 16px 42px rgba(23, 61, 54, .09); }
      .badge { display: inline-block; padding: 6px 10px; border-radius: 999px; background: #e5f4ec; color: #247456; font-size: 13px; font-weight: bold; }
      h1 { margin: 18px 0 10px; font-size: 30px; letter-spacing: -.6px; }
      p { color: #647c75; line-height: 1.55; }
      code { display: block; margin-top: 22px; padding: 13px; border-radius: 9px; background: #f2f7f4; color: #2c6254; font-size: 13px; }
    </style>
  </head>
  <body><main>
    <span class="badge">Servidor Node.js activo</span>
    <h1>NutriPediátrica está lista.</h1>
    <p>La prueba técnica se ejecutó correctamente en cPanel con Node.js ${process.version}.</p>
    <code>GET /health → {"status":"ok"}</code>
  </main></body>
</html>`;

http.createServer((request, response) => {
  const path = new URL(request.url, `http://${request.headers.host}`).pathname;
  if (path === "/health") {
    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ status: "ok", app: "NutriPediatrica", node: process.version, startedAt }));
    return;
  }
  response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  response.end(page);
}).listen(port, () => console.log(`NutriPediátrica test listening on ${port}`));
