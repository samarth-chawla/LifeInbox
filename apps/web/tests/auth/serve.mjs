import { createServer } from "node:http";
import next from "next";

const hostname = "127.0.0.1";
const port = Number(process.argv[2]);
const app = next({ dev: true, hostname, port, quiet: true, turbopack: true });
await app.prepare();
createServer(app.getRequestHandler()).listen(port, hostname);
