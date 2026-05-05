const mysql = require("mysql2");
const path = require("path");
const dotenv = require("dotenv");

// Load env from repo root (`Urban Ethnic/.env`) when running from `backend/`
dotenv.config({ path: path.resolve(__dirname, "../.env") });
// Fallback to default `.env` lookup (in case user keeps a separate backend `.env`)
dotenv.config();

const pickNonEmpty = (...values) => {
  for (const value of values) {
    const text = typeof value === "string" ? value.trim() : value;
    if (text) return text;
  }
  return undefined;
};

const createMissingDbStub = (message) => {
  const makeError = () => {
    const err = new Error(message);
    err.code = "DB_CONFIG_MISSING";
    err.fatal = true;
    return err;
  };

  return {
    query(_sql, params, cb) {
      const callback = typeof params === "function" ? params : cb;
      if (typeof callback === "function") callback(makeError());
    },
    execute(_sql, params, cb) {
      const callback = typeof params === "function" ? params : cb;
      if (typeof callback === "function") callback(makeError());
    },
    getConnection(cb) {
      if (typeof cb === "function") cb(makeError());
    },
  };
};

const desiredMaxAllowedPacket = (() => {
  const raw = Number(process.env.MYSQL_MAX_ALLOWED_PACKET || 64 * 1024 * 1024);
  return Number.isFinite(raw) && raw > 1024 * 1024 ? Math.floor(raw) : 64 * 1024 * 1024;
})();

const dbConfig = {
  host: pickNonEmpty(process.env.DB_HOST, process.env.MYSQLHOST, process.env.MYSQL_HOST) || "localhost",
  user: pickNonEmpty(process.env.DB_USER, process.env.MYSQLUSER, process.env.MYSQL_USER),
  password: pickNonEmpty(process.env.DB_PASSWORD, process.env.MYSQLPASSWORD, process.env.MYSQL_PASSWORD),
  database: pickNonEmpty(process.env.DB_NAME, process.env.MYSQLDATABASE, process.env.MYSQL_DATABASE),
  port: Number(
    pickNonEmpty(process.env.DB_PORT, process.env.MYSQLPORT, process.env.MYSQL_PORT) || 3306
  ),
  connectTimeout: Number(pickNonEmpty(process.env.MYSQL_CONNECT_TIMEOUT) || 15000),
};

const mysqlUrl = pickNonEmpty(process.env.MYSQL_URL, process.env.DATABASE_URL);
const canUseMysqlUrl =
  typeof mysqlUrl === "string" &&
  (mysqlUrl.startsWith("mysql://") || mysqlUrl.startsWith("mysql2://"));

const missing = [];
if (!canUseMysqlUrl) {
  if (!dbConfig.user) missing.push("MYSQLUSER (or DB_USER)");
  if (!dbConfig.database) missing.push("MYSQLDATABASE (or DB_NAME)");
}
if (missing.length > 0) {
  const message = `MySQL env vars missing: ${missing.join(
    ", "
  )}. Update Urban Ethnic/.env with KEY=VALUE lines, then restart the server.`;
  console.log("❌ MySQL Connection Failed");
  console.log(message);
  module.exports = createMissingDbStub(message);
  // Missing env vars; skip creating a real pool.
}

if (missing.length === 0) {
const pool = canUseMysqlUrl ? mysql.createPool(mysqlUrl) : mysql.createPool({
  host: dbConfig.host,
  user: dbConfig.user,
  password: dbConfig.password,
  database: dbConfig.database,
  port: dbConfig.port,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  connectTimeout: dbConfig.connectTimeout,
});

pool.getConnection((err, connection) => {
  if (err) {
    console.log("❌ MySQL Connection Failed");
    console.log(err);
    return;
  }

  // ⚠️ Railway may NOT allow GLOBAL changes → so ignore error
  connection.query(
    `SET SESSION max_allowed_packet = ${desiredMaxAllowedPacket}`,
    (setErr) => {
      if (setErr) {
        console.log("⚠️ max_allowed_packet warning (ignore):");
        console.log(setErr);
      }

      connection.query("SELECT 1 AS ok", (pingErr) => {
        if (pingErr) {
          console.log("❌ MySQL Connection Failed");
          console.log(pingErr);
        } else {
          console.log("✅ Connected to Railway MySQL");
        }

        connection.release();
      });
    }
  );
});

module.exports = pool;
}
