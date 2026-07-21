#!/usr/bin/env node

const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");

function sleepSync(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function atomicWrite(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${process.pid}.${crypto.randomUUID()}.tmp`);
  const descriptor = fs.openSync(temporaryPath, "wx", 0o600);
  try {
    fs.writeFileSync(descriptor, value);
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
  fs.renameSync(temporaryPath, filePath);
  const directoryDescriptor = fs.openSync(path.dirname(filePath), "r");
  try { fs.fsyncSync(directoryDescriptor); } finally { fs.closeSync(directoryDescriptor); }
}

function atomicWriteJson(filePath, value) {
  atomicWrite(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readLeaseOwner(leasePath) {
  try { return readJson(path.join(leasePath, "owner.json")); } catch (error) { return null; }
}

function validOwner(owner) {
  return owner && owner.type === "RepositoryArtifactLease" && owner.schema_version === "0.1" &&
    typeof owner.lease_id === "string" && typeof owner.owner_id === "string" &&
    Number.isInteger(owner.fencing_token) && owner.fencing_token > 0 && Number.isFinite(Date.parse(owner.expires_at));
}

function reclaimExpiredLease(leasePath, nowMs) {
  const recoveryPath = `${leasePath}.recovery`;
  try {
    fs.mkdirSync(recoveryPath, { mode: 0o700 });
  } catch (error) {
    if (error.code === "EEXIST") return false;
    throw error;
  }
  try {
    const owner = readLeaseOwner(leasePath);
    if (!validOwner(owner) || Date.parse(owner.expires_at) > nowMs) return false;
    const confirmed = readLeaseOwner(leasePath);
    if (!confirmed || confirmed.lease_id !== owner.lease_id || confirmed.fencing_token !== owner.fencing_token) return false;
    try {
      fs.rmSync(leasePath, { recursive: true, force: false });
      return true;
    } catch (error) {
      if (error.code === "ENOENT") return true;
      return false;
    }
  } finally {
    try { fs.rmSync(recoveryPath, { recursive: true, force: false }); } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
}

function nextFencingToken(namespacePath) {
  const counterPath = path.join(namespacePath, ".fencing-token");
  let current = 0;
  if (fs.existsSync(counterPath)) {
    current = Number(fs.readFileSync(counterPath, "utf8").trim());
    if (!Number.isSafeInteger(current) || current < 0) throw new Error("Repository fencing-token counter is invalid.");
  }
  const next = current + 1;
  atomicWrite(counterPath, `${next}\n`);
  return next;
}

function acquireRepositoryLease(namespacePath, options = {}) {
  const timeoutMs = Number.isInteger(options.leaseTimeoutMs) ? options.leaseTimeoutMs
    : Number.isInteger(options.lockTimeoutMs) ? options.lockTimeoutMs : 5000;
  const ttlMs = Number.isInteger(options.leaseTtlMs) ? options.leaseTtlMs
    : Number.isInteger(options.lockStaleMs) ? options.lockStaleMs : 30000;
  if (timeoutMs < 1 || ttlMs < 10) throw new Error("Artifact lease timeout must be positive and TTL must be at least 10 milliseconds.");
  fs.mkdirSync(namespacePath, { recursive: true });
  const leasePath = path.join(namespacePath, ".manifest.lease");
  const deadline = Date.now() + timeoutMs;
  while (true) {
    try {
      fs.mkdirSync(leasePath, { mode: 0o700 });
      try {
        const now = Date.now();
        const leaseId = crypto.randomUUID();
        const fencingToken = nextFencingToken(namespacePath);
        const owner = {
          schema_version: "0.1",
          type: "RepositoryArtifactLease",
          lease_id: leaseId,
          owner_id: `${os.hostname()}:${process.pid}:${crypto.randomUUID()}`,
          hostname: os.hostname(),
          pid: process.pid,
          fencing_token: fencingToken,
          acquired_at: new Date(now).toISOString(),
          renewed_at: new Date(now).toISOString(),
          expires_at: new Date(now + ttlMs).toISOString()
        };
        atomicWriteJson(path.join(leasePath, "owner.json"), owner);
        return { leasePath, namespacePath, ttlMs, ...owner };
      } catch (error) {
        fs.rmSync(leasePath, { recursive: true, force: true });
        throw error;
      }
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      if (reclaimExpiredLease(leasePath, Date.now())) continue;
      if (Date.now() >= deadline) {
        const owner = readLeaseOwner(leasePath);
        const ownerLabel = owner ? `${owner.owner_id || "unknown"} lease=${owner.lease_id || "unknown"}` : "unknown owner";
        throw new Error(`Timed out waiting for repository artifact manifest lease (${ownerLabel}).`);
      }
      sleepSync(Math.min(25, Math.max(1, deadline - Date.now())));
    }
  }
}

function assertRepositoryLease(lease) {
  if (!lease) throw new Error("A repository artifact lease is required.");
  const owner = readLeaseOwner(lease.leasePath);
  if (!validOwner(owner) || owner.lease_id !== lease.lease_id || owner.owner_id !== lease.owner_id ||
      owner.fencing_token !== lease.fencing_token) {
    throw new Error("Repository artifact writer was fenced by a newer lease.");
  }
  if (Date.now() >= Date.parse(owner.expires_at)) throw new Error("Repository artifact lease expired before the write completed.");
  return owner;
}

function renewRepositoryLease(lease) {
  const owner = assertRepositoryLease(lease);
  const now = Date.now();
  const renewed = {
    ...owner,
    renewed_at: new Date(now).toISOString(),
    expires_at: new Date(now + lease.ttlMs).toISOString()
  };
  atomicWriteJson(path.join(lease.leasePath, "owner.json"), renewed);
  lease.renewed_at = renewed.renewed_at;
  lease.expires_at = renewed.expires_at;
  return lease;
}

function releaseRepositoryLease(lease) {
  if (!lease) return;
  const owner = readLeaseOwner(lease.leasePath);
  if (!owner || owner.lease_id !== lease.lease_id || owner.owner_id !== lease.owner_id || owner.fencing_token !== lease.fencing_token) {
    throw new Error("Repository artifact lease ownership changed before release.");
  }
  fs.rmSync(lease.leasePath, { recursive: true, force: false });
}

module.exports = {
  acquireRepositoryLease,
  assertRepositoryLease,
  readLeaseOwner,
  reclaimExpiredLease,
  releaseRepositoryLease,
  renewRepositoryLease
};
