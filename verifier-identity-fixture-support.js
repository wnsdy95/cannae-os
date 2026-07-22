const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { publicKeyId } = require("./verification-attestation");

function runOpenSsl(args, cwd) {
  const result = spawnSync("openssl", args, { cwd, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`openssl ${args.join(" ")} failed: ${result.stderr}`);
}

function makeCa(directory, name) {
  const key = `${name}.key.pem`;
  const certificate = `${name}.cert.pem`;
  runOpenSsl(["genpkey", "-algorithm", "ED25519", "-out", key], directory);
  runOpenSsl([
    "req", "-new", "-x509", "-key", key, "-out", certificate, "-days", "2", "-subj", `/CN=${name}`,
    "-addext", "basicConstraints=critical,CA:TRUE", "-addext", "keyUsage=critical,keyCertSign,cRLSign"
  ], directory);
  return {
    key: fs.readFileSync(path.join(directory, key), "utf8"),
    certificate: fs.readFileSync(path.join(directory, certificate), "utf8"),
    keyPath: key,
    certificatePath: certificate
  };
}

function makeLeaf(directory, ca, name, spiffeIds) {
  const key = `${name}.key.pem`;
  const request = `${name}.csr.pem`;
  const certificate = `${name}.cert.pem`;
  const extensions = `${name}.ext.cnf`;
  runOpenSsl(["genpkey", "-algorithm", "ED25519", "-out", key], directory);
  runOpenSsl(["req", "-new", "-key", key, "-out", request, "-subj", `/CN=${name}`], directory);
  fs.writeFileSync(path.join(directory, extensions), [
    "basicConstraints=critical,CA:FALSE",
    "keyUsage=critical,digitalSignature",
    `subjectAltName=${spiffeIds.map(value => `URI:${value}`).join(",")}`,
    ""
  ].join("\n"));
  runOpenSsl([
    "x509", "-req", "-in", request, "-CA", ca.certificatePath, "-CAkey", ca.keyPath,
    "-CAcreateserial", "-out", certificate, "-days", "1", "-extfile", extensions
  ], directory);
  return {
    key: fs.readFileSync(path.join(directory, key), "utf8"),
    certificate: fs.readFileSync(path.join(directory, certificate), "utf8")
  };
}

function keyPair() {
  const pair = crypto.generateKeyPairSync("ed25519");
  return {
    privateKey: pair.privateKey.export({ type: "pkcs8", format: "pem" }),
    publicKey: pair.publicKey.export({ type: "spki", format: "pem" }),
    keyId: publicKeyId(pair.publicKey)
  };
}

module.exports = { keyPair, makeCa, makeLeaf, runOpenSsl };
