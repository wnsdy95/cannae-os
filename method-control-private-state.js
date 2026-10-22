const fs = require("node:fs"), path = require("node:path");
const fail = code => { throw new Error(code); };
function directory(value, createMissing = false) {
  if (typeof process.getuid !== "function" || !path.isAbsolute(value)) fail("METHOD_CONTROL_PRIVATE_PATH_INVALID");
  let current = path.parse(value).root;
  for (const part of path.relative(current, value).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    if (!fs.existsSync(current)) {
      if (!createMissing) fail("METHOD_CONTROL_PRIVATE_PATH_INVALID");
      fs.mkdirSync(current, { mode: 0o700 });
    }
    const stat = fs.lstatSync(current);
    if (!stat.isDirectory() || stat.isSymbolicLink()) fail("METHOD_CONTROL_PRIVATE_PATH_INVALID");
  }
  const stat = fs.lstatSync(value);
  if (stat.uid !== process.getuid() || (stat.mode & 0o077)) fail("METHOD_CONTROL_PRIVATE_DIRECTORY_UNSAFE");
  return value;
}
function read(file) {
  if (!path.isAbsolute(file)) fail("METHOD_CONTROL_PRIVATE_PATH_INVALID");
  directory(path.dirname(file));
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.nlink !== 1 || stat.uid !== process.getuid() || (stat.mode & 0o077) || stat.size > 65536) fail("METHOD_CONTROL_PRIVATE_FILE_UNSAFE");
    const result = JSON.parse(fs.readFileSync(fd, "utf8"));
    const keys = ["schema_version", "launch_slot_id", "enrollment_id", "credential", "repository", "artifact_root", "launch_descriptor"];
    if (!result || typeof result !== "object" || keys.length !== Object.keys(result).length || keys.some(key => !Object.hasOwn(result, key)) ||
        result.schema_version !== "0.1" || !/^MCTL-[a-f0-9]{40}$/.test(result.launch_slot_id) ||
        !(result.enrollment_id === "pending" || /^MCTL-[a-f0-9]{40}$/.test(result.enrollment_id)) ||
        !/^[a-f0-9]{64}$/.test(result.credential)) fail("METHOD_CONTROL_PRIVATE_RECORD_INVALID");
    const root = fs.realpathSync(result.repository), parent = path.dirname(file);
    if (parent === root || parent.startsWith(root + path.sep)) fail("METHOD_CONTROL_STATE_INSIDE_REPOSITORY");
    return result;
  } finally { fs.closeSync(fd); }
}
function create(file, value, repository) {
  const parent = path.resolve(path.dirname(file)), root = fs.realpathSync(repository);
  if (file !== path.resolve(file)) fail("METHOD_CONTROL_PRIVATE_PATH_INVALID");
  if (parent === root || parent.startsWith(root + path.sep)) fail("METHOD_CONTROL_STATE_INSIDE_REPOSITORY");
  directory(parent, true);
  const fd = fs.openSync(file, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
  try { fs.writeFileSync(fd, JSON.stringify(value) + "\n"); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  const dir = fs.openSync(parent, "r"); try { fs.fsyncSync(dir); } finally { fs.closeSync(dir); }
}
function bind(file, enrollmentId) {
  const original = read(file);
  if (original.enrollment_id !== "pending" || !/^MCTL-[a-f0-9]{40}$/.test(enrollmentId)) fail("METHOD_CONTROL_PRIVATE_ALREADY_BOUND");
  const temporary = path.join(path.dirname(file), `.${path.basename(file)}.${require("node:crypto").randomUUID()}.tmp`);
  create(temporary, { ...original, enrollment_id: enrollmentId }, original.repository);
  if (JSON.stringify(read(file)) !== JSON.stringify(original)) fail("METHOD_CONTROL_PRIVATE_CHANGED");
  fs.renameSync(temporary, file);
  const parent = fs.openSync(path.dirname(file), "r"); try { fs.fsyncSync(parent); } finally { fs.closeSync(parent); }
  if (read(file).enrollment_id !== enrollmentId) fail("METHOD_CONTROL_PRIVATE_BINDING_FAILED");
}
module.exports = { read, create, bind };
