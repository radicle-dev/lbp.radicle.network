const http = require("http");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");

const HTTP_PORT = 8090;
const WEBSOCKET_PORT = 8091;
const CLIENT_WEBSOCKET_CODE = fs.readFileSync(path.join(__dirname, "livereload.js"), "utf8");

const wss = new WebSocket.Server({
  port: WEBSOCKET_PORT,
});

const serveStatic = (route, res) => {
  if (fs.existsSync(route)) {
    const stat = fs.statSync(route);

    if (stat.isDirectory()) {
      return serveStatic(path.join(route, "index.html"), res);
    } else if (stat.isFile()) {
      let file = fs.readFileSync(route);

      if (route.endsWith(".html")) {
        file =
          `${file.toString()}\n\n<script>${CLIENT_WEBSOCKET_CODE}</script>`;
      }

      res.writeHead(200);
      res.end(file);
      return true
    }
  }

  return false;
}

const requestHandler = (req, res) => {
  if (req.method === "GET") {
    const route = path.normalize(path.join(__dirname, "public", req.url));
    if (serveStatic(route, res)) {
      return;
    }
  }

  res.writeHead(404);
  res.end();
}

const server = http.createServer(requestHandler);
server.listen(HTTP_PORT);
