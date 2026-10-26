const { restoreSnapshot } = require("./snapshots");
module.exports = { restoreProducer: name => restoreSnapshot(name) };
