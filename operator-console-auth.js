const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { promisify } = require("node:util");
const { DatabaseSync } = require("node:sqlite");

const scrypt = promisify(crypto.scrypt);
const SESSION_MS = 8 * 60 * 60 * 1000;
const hash = value => crypto.createHash("sha256").update(value).digest("hex");
const token = () => crypto.randomBytes(32).toString("base64url");
function deny(code, statusCode = 400) {
  const error = new Error(code);
  error.statusCode = statusCode;
  throw error;
}
function requireThat(value, code, statusCode) { if (!value) deny(code, statusCode); }
function assertSafeRationale(input, session) {
  requireThat(typeof input.rationale === "string" && input.rationale.trim() && input.rationale.length <= 2000, "CONSOLE_RATIONALE_REQUIRED");
  requireThat(![input.password, input.nonce, session.sessionId].some(secret => secret && input.rationale.includes(secret)),
    "CONSOLE_RATIONALE_CONTAINS_SECRET");
}
function privateFile(file) {
  const stat = fs.lstatSync(file);
  requireThat(stat.isFile() && stat.nlink === 1 && stat.uid === process.getuid() &&
    (stat.mode & 0o077) === 0, "CONSOLE_PRIVATE_FILE_UNSAFE");
}
function privateDirectory(directory) {
  requireThat(typeof process.getuid === "function", "CONSOLE_POSIX_REQUIRED");
  const resolved = path.resolve(directory);
  let current = path.parse(resolved).root;
  for (const component of resolved.slice(current.length).split(path.sep)) {
    current = path.join(current, component);
    if (fs.existsSync(current)) requireThat(!fs.lstatSync(current).isSymbolicLink(), "CONSOLE_STATE_SYMLINK");
    else fs.mkdirSync(current, { mode: 0o700 });
  }
  const stat = fs.lstatSync(resolved);
  requireThat(stat.isDirectory() && stat.uid === process.getuid() &&
    (stat.mode & 0o077) === 0, "CONSOLE_STATE_PERMISSIONS");
  return resolved;
}
function username(value) {
  requireThat(typeof value === "string" && /^[a-z][a-z0-9._-]{2,63}$/.test(value), "CONSOLE_USERNAME_INVALID");
  return value;
}
function password(value) {
  requireThat(typeof value === "string" && value.length >= 15 && value.length <= 128 &&
    Buffer.byteLength(value) <= 512, "CONSOLE_PASSWORD_LENGTH");
  return value;
}
function missions(value) {
  requireThat(Array.isArray(value) && value.length > 0 && value.length <= 100 &&
    new Set(value).size === value.length && value.every(item => typeof item === "string" &&
      /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(item)), "CONSOLE_MISSIONS_INVALID");
  return [...value].sort();
}

async function openAuthStore(directory, binding) {
  requireThat(typeof binding === "string" && /^[a-f0-9]{64}$/.test(binding), "CONSOLE_STORE_BINDING_REQUIRED");
  const root = privateDirectory(directory), file = path.join(root, "operator.sqlite");
  if (!fs.existsSync(file)) {
    try { fs.closeSync(fs.openSync(file, "wx", 0o600)); }
    catch (error) { if (error.code !== "EEXIST") throw error; }
  }
  for (const suffix of ["", "-wal", "-shm", "-journal"]) {
    if (fs.existsSync(file + suffix)) privateFile(file + suffix);
  }
  const db = new DatabaseSync(file);
  db.exec(`PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL,
      credential TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('owner','viewer')),
      missions TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, epoch INTEGER NOT NULL DEFAULT 1);
    CREATE UNIQUE INDEX IF NOT EXISTS one_owner ON users(role) WHERE role='owner';
    CREATE TABLE IF NOT EXISTS invites (digest TEXT PRIMARY KEY, missions TEXT NOT NULL,
      expires INTEGER NOT NULL, issued_by TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (digest TEXT PRIMARY KEY, value TEXT NOT NULL, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS audit (sequence INTEGER PRIMARY KEY, at TEXT NOT NULL,
      actor TEXT NOT NULL, action TEXT NOT NULL, subject TEXT NOT NULL);
  `);
  const metadata = key => db.prepare("SELECT value FROM meta WHERE key=?").get(key)?.value;
  const setMeta = (key, value) => db.prepare("INSERT OR REPLACE INTO meta VALUES (?,?)").run(key, value);
  const initialize = (key, value) => db.prepare("INSERT OR IGNORE INTO meta VALUES (?,?)").run(key, value);
  initialize("schema", "1"); initialize("repository-binding", binding);
  if (metadata("schema") !== "1" || metadata("repository-binding") !== binding) {
    db.close(); deny("CONSOLE_STORE_BINDING_OR_SCHEMA_MISMATCH");
  }
  initialize("session-secret", token() + token());
  const audit = (actor, action, subject = "none") => db.prepare("INSERT INTO audit(at,actor,action,subject) VALUES (?,?,?,?)")
    .run(new Date().toISOString(), actor, action, subject);
  let hashing = false;
  async function derive(value, salt) {
    requireThat(!hashing, "CONSOLE_AUTH_BUSY", 429);
    hashing = true;
    try {
      return await scrypt(value, salt, 64, { N: 2 ** 17, r: 8, p: 1, maxmem: 192 * 1024 * 1024 });
    } finally { hashing = false; }
  }
  async function credential(value) {
    const salt = crypto.randomBytes(32).toString("hex");
    return `${salt}:${(await derive(password(value), salt)).toString("hex")}`;
  }
  const dummy = await credential(token());
  async function matches(value, record) {
    const [salt, expected] = (record || dummy).split(":");
    const actual = await derive(typeof value === "string" && value.length <= 128 ? value : "invalid", salt);
    return crypto.timingSafeEqual(Buffer.from(expected, "hex"), actual);
  }
  function transaction(callback) {
    db.exec("BEGIN IMMEDIATE");
    try { const result = callback(); db.exec("COMMIT"); return result; }
    catch (error) { db.exec("ROLLBACK"); throw error; }
  }
  const publicUser = row => ({ id: row.id, username: row.username, role: row.role,
    missions: JSON.parse(row.missions), active: !!row.active, epoch: row.epoch });
  function liveUser(id) {
    const row = db.prepare("SELECT * FROM users WHERE id=?").get(id);
    requireThat(row?.active, "CONSOLE_AUTH_REQUIRED", 401);
    return row;
  }
  function owner(id) { const row = liveUser(id); requireThat(row.role === "owner", "CONSOLE_OWNER_REQUIRED", 403); return row; }
  function hasOwner() { return !!db.prepare("SELECT id FROM users WHERE role='owner'").get(); }
  function authenticate(session) {
    requireThat(session?.userId && Number.isFinite(session.startedAt) && session.startedAt + SESSION_MS > Date.now(), "CONSOLE_AUTH_REQUIRED", 401);
    const row = liveUser(session.userId);
    requireThat(row.epoch === session.epoch, "CONSOLE_SESSION_REVOKED", 401);
    return publicUser(row);
  }
  return {
    root, db, secret: metadata("session-secret"), hasOwner,
    createBootstrap() {
      requireThat(!hasOwner(), "CONSOLE_ALREADY_INITIALIZED", 409);
      const raw = token();
      transaction(() => { setMeta("bootstrap", hash(raw)); setMeta("bootstrap-expires", String(Date.now() + 30 * 60 * 1000)); });
      return raw;
    },
    async createOwner(input) {
      username(input.username);
      requireThat(typeof input.token === "string" && input.token.length <= 128, "CONSOLE_SETUP_DENIED", 403);
      const encoded = await credential(input.password);
      return transaction(() => {
        requireThat(!hasOwner() && metadata("bootstrap") === hash(input.token) &&
          Number(metadata("bootstrap-expires")) > Date.now(), "CONSOLE_SETUP_DENIED", 403);
        const id = crypto.randomUUID();
        db.prepare("INSERT INTO users(id,username,credential,role,missions) VALUES (?,?,?,'owner','[]')")
          .run(id, input.username, encoded);
        setMeta("bootstrap", "consumed"); setMeta("bootstrap-expires", "0");
        audit(id, "owner_initialized", id);
        return publicUser(liveUser(id));
      });
    },
    async login(input) {
      const row = typeof input.username === "string" ? db.prepare("SELECT * FROM users WHERE username=?").get(input.username) : null;
      const matched = await matches(input.password, row?.credential);
      requireThat(matched && row?.active, "CONSOLE_LOGIN_DENIED", 401);
      audit(row.id, "login");
      return publicUser(row);
    },
    authenticate,
    async reauthenticate(session, value) {
      const current = authenticate(session), row = owner(current.id);
      requireThat(await matches(value, row.credential), "CONSOLE_REAUTH_DENIED", 403);
      return authenticate(session);
    },
    async invite(actor, input) {
      const row = owner(actor), scope = missions(input.missions);
      requireThat(await matches(input.password, row.credential), "CONSOLE_REAUTH_DENIED", 403);
      const raw = token();
      transaction(() => {
        owner(actor);
        db.prepare("DELETE FROM invites WHERE expires<=?").run(Date.now());
        requireThat(db.prepare("SELECT COUNT(*) AS n FROM invites").get().n < 100, "CONSOLE_INVITE_LIMIT", 429);
        db.prepare("INSERT INTO invites VALUES (?,?,?,?)").run(hash(raw), JSON.stringify(scope), Date.now() + 30 * 60 * 1000, actor);
        audit(actor, "viewer_invited", scope.join(","));
      });
      return raw;
    },
    async redeem(input) {
      username(input.username);
      requireThat(typeof input.token === "string" && input.token.length <= 128, "CONSOLE_INVITE_DENIED", 403);
      const encoded = await credential(input.password);
      return transaction(() => {
        const invitation = db.prepare("SELECT * FROM invites WHERE digest=?").get(hash(input.token));
        requireThat(invitation && invitation.expires > Date.now(), "CONSOLE_INVITE_DENIED", 403);
        owner(invitation.issued_by);
        requireThat(db.prepare("SELECT COUNT(*) AS n FROM users").get().n < 500, "CONSOLE_USER_LIMIT", 429);
        const id = crypto.randomUUID();
        requireThat(!db.prepare("SELECT id FROM users WHERE username=?").get(input.username), "CONSOLE_USERNAME_UNAVAILABLE", 409);
        db.prepare("INSERT INTO users(id,username,credential,role,missions) VALUES (?,?,?,'viewer',?)")
          .run(id, input.username, encoded, invitation.missions);
        db.prepare("DELETE FROM invites WHERE digest=?").run(hash(input.token));
        audit(id, "viewer_registered", id);
        return publicUser(liveUser(id));
      });
    },
    async deactivate(actor, input) {
      const row = owner(actor);
      requireThat(await matches(input.password, row.credential), "CONSOLE_REAUTH_DENIED", 403);
      transaction(() => {
        owner(actor);
        const target = liveUser(input.userId);
        requireThat(target.role === "viewer", "CONSOLE_OWNER_REMOVAL_FORBIDDEN", 403);
        db.prepare("UPDATE users SET active=0, epoch=epoch+1 WHERE id=?").run(target.id);
        audit(actor, "viewer_deactivated", target.id);
      });
    },
    users(actor) { owner(actor); return db.prepare("SELECT * FROM users ORDER BY username").all().map(publicUser); },
    activity(actor) { owner(actor); return db.prepare("SELECT * FROM audit ORDER BY sequence DESC LIMIT 100").all(); },
    logout(actor) { audit(actor, "logout"); },
    sessionStore: {
      get(id, done) {
        try {
          const row = db.prepare("SELECT value FROM sessions WHERE digest=? AND expires>?").get(hash(id), Date.now());
          done(null, row ? JSON.parse(row.value) : null);
        } catch (error) { done(error); }
      },
      set(id, value, done) {
        try {
          db.prepare("DELETE FROM sessions WHERE expires<=?").run(Date.now());
          requireThat(db.prepare("SELECT COUNT(*) AS n FROM sessions").get().n < 2000 ||
            db.prepare("SELECT digest FROM sessions WHERE digest=?").get(hash(id)), "CONSOLE_SESSION_LIMIT", 429);
          const expiry = Math.min(Date.now() + SESSION_MS, value.startedAt ? value.startedAt + SESSION_MS : Date.now() + 30 * 60 * 1000);
          db.prepare("INSERT OR REPLACE INTO sessions VALUES (?,?,?)").run(hash(id), JSON.stringify(value), expiry);
          done();
        } catch (error) { done(error); }
      },
      destroy(id, done) { try { db.prepare("DELETE FROM sessions WHERE digest=?").run(hash(id)); done(); } catch (error) { done(error); } }
    },
    close() { db.close(); }
  };
}

module.exports = { openAuthStore, privateDirectory, privateFile, requireThat, assertSafeRationale, SESSION_MS };
