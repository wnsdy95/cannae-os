#!/usr/bin/env node
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const fastify = require("fastify");
const { resolveRepository } = require("./repository-artifact-store");
const { openAuthStore, privateFile, requireThat, SESSION_MS } = require("./operator-console-auth");
const { openConsentService } = require("./operator-consent-service");
const { createWorkerQueue } = require("./operator-console-jobs");
const { repositoryStateDigest } = require("./skill-mission-controller");

const ROOT = __dirname;
const plain = (properties, required = Object.keys(properties)) => ({ type: "object", additionalProperties: false, properties, required });
const text = maxLength => ({ type: "string", minLength: 1, maxLength });
const loginFields = { username: text(64), password: text(128) };
const readOnly = { approval_authorized: false, tool_execution_authorized: false, release_authorized: false };
const isWithin = (root, target) => root === target || target.startsWith(root + path.sep);

async function createConsole(options) {
  const repository = resolveRepository(options.repository);
  const artifactRoot = path.resolve(options.artifactRoot || path.join(repository.root, ".cannae", "artifacts"));
  const stateDir = path.resolve(options.stateDir);
  requireThat(!isWithin(repository.root, stateDir) && !isWithin(ROOT, stateDir) &&
    !isWithin(artifactRoot, stateDir) && !isWithin(stateDir, artifactRoot), "CONSOLE_STATE_LOCATION_UNSAFE");
  let parent = stateDir;
  while (!fs.existsSync(parent) && path.dirname(parent) !== parent) parent = path.dirname(parent);
  const gitLocation = spawnSync("git", ["-C", parent, "rev-parse", "--is-inside-work-tree", "--is-inside-git-dir"], { encoding: "utf8", shell: false });
  requireThat(!gitLocation.error && !gitLocation.stdout.trim().split(/\r?\n/).includes("true"), "CONSOLE_STATE_LOCATION_UNSAFE");
  const binding = crypto.createHash("sha256").update(`${repository.identity_fingerprint}\n${artifactRoot}`).digest("hex");
  const auth = await openAuthStore(stateDir, binding);
  const app = fastify({ logger: false, trustProxy: false, bodyLimit: 4096,
    ajv: { customOptions: { removeAdditional: false, coerceTypes: false, useDefaults: false } } });
  const configuration = { repository: repository.root, repositoryKey: repository.key,
    artifactRoot, identity: repository.identity_fingerprint, sourceSha256: repositoryStateDigest(ROOT) };
  let consent;
  try { consent = openConsentService(auth, configuration); }
  catch (error) { auth.close(); throw error; }
  const jobs = createWorkerQueue(path.join(ROOT, "operator-console-worker.js"));
  function query(user, request) {
    return jobs.submit({ configuration: consent.workerConfiguration, user, request });
  }
  const origin = () => `http://127.0.0.1:${app.server.address()?.port || options.port || 0}`;
  app.addHook("onRequest", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    requireThat(request.headers.host === new URL(origin()).host &&
      !request.headers.forwarded &&
      !Object.keys(request.headers).some(key => key.startsWith("x-forwarded-")) &&
      !["cross-site", "same-site"].includes(request.headers["sec-fetch-site"]), "CONSOLE_ORIGIN_DENIED", 403);
    if (!["GET", "HEAD"].includes(request.method)) requireThat(request.headers.origin === origin(), "CONSOLE_ORIGIN_DENIED", 403);
  });
  await app.register(require("@fastify/helmet"), { global: true, hsts: false,
    contentSecurityPolicy: { useDefaults: false, directives: { defaultSrc: ["'none'"], scriptSrc: ["'self'"],
      styleSrc: ["'self'"], imgSrc: ["'self'"], connectSrc: ["'self'"], baseUri: ["'none'"],
      formAction: ["'self'"], frameAncestors: ["'none'"] } } });
  await app.register(require("@fastify/rate-limit"), { max: 120, timeWindow: "1 minute" });
  await app.register(require("@fastify/cookie"));
  await app.register(require("@fastify/session"), { secret: auth.secret, cookieName: "cannae_operator",
    cookie: { httpOnly: true, secure: false, sameSite: "strict", path: "/", maxAge: SESSION_MS },
    saveUninitialized: false, rolling: false, store: auth.sessionStore });
  await app.register(require("@fastify/csrf-protection"), { sessionPlugin: "@fastify/session",
    getToken: request => request.headers["x-csrf-token"] });
  app.setErrorHandler((error, request, reply) => {
    const status = error.validation ? 400 : error.statusCode >= 400 && error.statusCode <= 599 ? error.statusCode : 500;
    const code = /^CONSOLE_[A-Z_]+$/.test(error.message) ? error.message :
      error.validation ? "CONSOLE_INPUT_INVALID" : status === 429 ? "CONSOLE_RATE_LIMIT" :
        error.code?.startsWith("FST_CSRF") ? "CONSOLE_CSRF_DENIED" : "CONSOLE_REQUEST_FAILED";
    reply.code(status).send({ error: code, ...(error.reason_codes ? { reason_codes: error.reason_codes } : {}), ...readOnly });
  });
  app.setNotFoundHandler((request, reply) => reply.code(404).send({ error: "CONSOLE_NOT_FOUND", ...readOnly }));
  const user = request => auth.authenticate(request.session);
  const owner = request => { const current = user(request); requireThat(current.role === "owner", "CONSOLE_OWNER_REQUIRED", 403); return current; };
  const guard = (request, reply, done) => app.csrfProtection(request, reply, done);
  const authLimit = { rateLimit: { max: 8, timeWindow: "1 minute" } };
  async function establish(request, current) {
    await request.session.regenerate();
    request.session.userId = current.id;
    request.session.epoch = current.epoch;
    request.session.startedAt = Date.now();
    await request.session.save();
    return { user: current, ...readOnly };
  }
  app.get("/api/session", async (request, reply) => {
    let current = null;
    if (request.session.userId) {
      try { current = user(request); }
      catch (error) {
        if (error.statusCode !== 401) throw error;
        await request.session.regenerate();
      }
    }
    return { initialized: auth.hasOwner(), user: current, csrf_token: await reply.generateCsrf(),
      repository: current ? { key: repository.key, label: repository.label } : null, order_review_available: current?.role === "owner", ...readOnly };
  });
  for (const [name, handler] of [["setup", input => auth.createOwner(input)], ["login", input => auth.login(input)],
    ["register", input => auth.redeem(input)]]) {
    app.post(`/api/${name}`, { onRequest: guard, config: authLimit,
      schema: { body: plain(name === "login" ? loginFields : { ...loginFields, token: text(128) }) } },
    async request => {
      const result = await establish(request, await handler(request.body));
      if (name === "setup") {
        const link = path.join(auth.root, "setup-link.txt");
        if (fs.existsSync(link)) { privateFile(link); fs.unlinkSync(link); }
      }
      return result;
    });
  }
  app.post("/api/logout", { onRequest: guard, schema: { body: plain({}) } }, async request => {
    auth.logout(user(request).id); await request.session.destroy(); return { logged_out: true, ...readOnly };
  });
  app.get("/api/users", async request => ({ users: auth.users(owner(request).id), ...readOnly }));
  app.get("/api/activity", async request => ({ entries: auth.activity(owner(request).id), ...readOnly }));
  const uuid = { type: "string", pattern: "^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$" };
  app.post("/api/order-decisions/preview", { onRequest: guard, schema: { body: plain({
    entry_id: { type: "string", pattern: "^[a-f0-9]{64}$" }, manifest: { type: "string", pattern: "^[a-f0-9]{64}$" },
    rehearsal_id: { type: "string", pattern: "^(none|[a-f0-9]{64})$" }, disposition: { type: "string", enum: ["approve", "reject", "revise"] }
  }) } }, async request => {
    const principal = owner(request);
    const preview = await query(principal, { action: "prepare-decision", ...request.body, challenge_id: crypto.randomUUID() });
    owner(request);
    return consent.prepare(request.session, preview);
  });
  app.post("/api/order-decisions/commit", { onRequest: guard, config: authLimit, schema: { body: plain({
    challenge_id: uuid, nonce: { type: "string", pattern: "^[A-Za-z0-9_-]{43}$" }, password: text(128), rationale: text(2000)
  }) } }, async request => {
    const principal = owner(request);
    requireThat(request.body.rationale.trim(), "CONSOLE_RATIONALE_REQUIRED");
    const id = await consent.reserve(request.session, request.body);
    try {
      const result = await query(principal, { action: "execute-decision", challenge_id: id });
      auth.authenticate(request.session); return result;
    } catch (error) { consent.fail(id, error.message); throw error; }
  });
  app.get("/api/order-decisions", async request => ({ entries: consent.list(request.session), ...readOnly }));
  app.get("/api/order-decisions/:id", { schema: { params: plain({ id: uuid }) } }, async request => consent.inspect(request.session, request.params.id));
  app.get("/api/operator-key", async request => { owner(request); return { public_key_pem: consent.publicKey(), ...readOnly }; });
  app.post("/api/invites", { onRequest: guard, config: authLimit, schema: { body: plain({ password: text(128),
    missions: { type: "array", minItems: 1, maxItems: 100, uniqueItems: true, items: { type: "string", pattern: "^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$" } } }) } },
  async request => ({ token: await auth.invite(owner(request).id, request.body), expires_in_seconds: 1800, ...readOnly }));
  app.post("/api/users/deactivate", { onRequest: guard, config: authLimit,
    schema: { body: plain({ userId: text(36), password: text(128) }) } }, async request => {
    await auth.deactivate(owner(request).id, request.body); return { deactivated: true, ...readOnly };
  });
  app.get("/api/evidence", { schema: { querystring: plain({ mission: text(128), kind: text(128), cursor: text(80) }, []) } },
    async request => {
      const principal = user(request), result = await query(principal, { action: "list", ...request.query });
      auth.authenticate(request.session);
      return result;
    });
  app.get("/api/evidence/:id", { schema: { params: plain({ id: { type: "string", pattern: "^[a-f0-9]{64}$" } }),
    querystring: plain({ manifest: { type: "string", pattern: "^[a-f0-9]{64}$" }, review: { type: "string", enum: ["true"] } }, ["manifest"]) } },
  async request => {
    const principal = user(request);
    if (request.query.review) owner(request);
    const result = await query(principal, { action: request.query.review ? "review" : "read", id: request.params.id, manifest: request.query.manifest });
    auth.authenticate(request.session);
    return result;
  });
  const assets = { "/": ["operator-console/index.html", "text/html"],
    "/app.js": ["operator-console/app.js", "text/javascript"], "/app.css": ["operator-console/app.css", "text/css"],
    "/licenses/lucide.txt": ["node_modules/lucide-static/LICENSE", "text/plain"] };
  for (const icon of ["shield-check", "folder-search", "clipboard-list", "clipboard-check", "users", "activity", "log-out", "refresh-cw", "x", "arrow-right", "copy"]) {
    assets[`/icons/${icon}.svg`] = [`node_modules/lucide-static/icons/${icon}.svg`, "image/svg+xml"];
  }
  for (const [url, [relative, type]] of Object.entries(assets)) {
    const bytes = fs.readFileSync(path.join(ROOT, relative));
    app.get(url, async (request, reply) => reply.type(type).send(bytes));
  }
  app.addHook("preClose", async () => { await jobs.close(); });
  app.addHook("onClose", async () => { await jobs.close(); consent.close(); auth.close(); });
  return { app, auth, consent, origin, repository, configuration: consent.workerConfiguration, readOnly };
}

async function main(argv = process.argv.slice(2)) {
  const options = {};
  for (let i = 0; i < argv.length; i += 2) {
    requireThat(["--repository", "--artifact-root", "--state-dir", "--port"].includes(argv[i]) && argv[i + 1] &&
      options[argv[i]] === undefined, "CONSOLE_OPTION_INVALID");
    options[argv[i]] = argv[i + 1];
  }
  requireThat(options["--repository"], "CONSOLE_REPOSITORY_REQUIRED");
  const repository = resolveRepository(options["--repository"]);
  const port = options["--port"] === undefined ? 4317 : Number(options["--port"]);
  requireThat(Number.isInteger(port) && port >= 0 && port <= 65535, "CONSOLE_PORT_INVALID");
  const consoleApp = await createConsole({ repository: repository.root, artifactRoot: options["--artifact-root"], port,
    stateDir: options["--state-dir"] || path.join(os.homedir(), ".local", "state", "cannae-operator", repository.key) });
  try {
    await consoleApp.app.listen({ host: "127.0.0.1", port });
    if (!consoleApp.auth.hasOwner()) {
      const link = path.join(consoleApp.auth.root, "setup-link.txt");
      if (fs.existsSync(link)) { privateFile(link); fs.unlinkSync(link); }
      fs.writeFileSync(link, `${consoleApp.origin()}/#setup=${consoleApp.auth.createBootstrap()}\n`, { flag: "wx", mode: 0o600 });
      console.log(`Owner setup link (private local file, expires in 30 minutes): ${link}`);
    }
    console.log(`Controls Operator: ${consoleApp.origin()}/`);
    console.log("Owner order review available. Tool execution and release remain disabled.");
    for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => { void consoleApp.app.close(); });
  } catch (error) { await consoleApp.app.close(); throw error; }
}
module.exports = { createConsole, main };
if (require.main === module) main().catch(error => { console.error(/^CONSOLE_[A-Z_]+$/.test(error.message) ? error.message : "CONSOLE_START_FAILED"); process.exitCode = 1; });
