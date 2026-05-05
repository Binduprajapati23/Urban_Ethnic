const fs = require("fs");
const path = require("path");
const mysql = require("mysql2");
const dotenv = require("dotenv");

// Load env from repo root (`Urban Ethnic/.env`) when running from `backend/`
dotenv.config({ path: path.resolve(__dirname, "../.env") });
// Fallback to default `.env` lookup (in case user keeps a separate backend `.env`)
dotenv.config();

const pickEnv = (...keys) => {
  for (const key of keys) {
    const value = process.env[key];
    if (typeof value === "string" && value.trim() !== "") return value.trim();
  }
  return "";
};

const run = async () => {
  const sqlPath = path.resolve(__dirname, "database.sql");

  if (!fs.existsSync(sqlPath)) {
    throw new Error(`SQL file not found: ${sqlPath}`);
  }

  const sql = fs.readFileSync(sqlPath, "utf8");
  if (!sql.trim()) {
    throw new Error(`SQL file is empty: ${sqlPath}`);
  }

  // Make import idempotent: if the dump has `CREATE TABLE foo` (without IF NOT EXISTS),
  // a second import will fail with "Table already exists".
  const normalizedSql = sql.replace(
    /CREATE\s+TABLE\s+(?!IF\s+NOT\s+EXISTS)/gi,
    "CREATE TABLE IF NOT EXISTS "
  );

  // Accept both DB_* and Railway-style MYSQL* variables, plus an optional URL.
  const urlFromEnv = pickEnv("MYSQL_URL", "DATABASE_URL");

  const host = pickEnv("DB_HOST", "MYSQLHOST", "MYSQL_HOST");
  const user = pickEnv("DB_USER", "MYSQLUSER", "MYSQL_USER");
  const password = pickEnv("DB_PASSWORD", "MYSQLPASSWORD", "MYSQL_PASSWORD");
  const database = pickEnv("DB_NAME", "MYSQLDATABASE", "MYSQL_DATABASE");
  const portRaw = pickEnv("DB_PORT", "MYSQLPORT", "MYSQL_PORT");
  const port = portRaw ? Number(portRaw) : 3306;

  // If someone pasted a full URL into DB_HOST/MYSQLHOST, treat it as a URL.
  const hostLooksLikeUrl =
    typeof host === "string" && (host.startsWith("mysql://") || host.startsWith("mysql2://"));
  const url = urlFromEnv || (hostLooksLikeUrl ? host : "");

  const missing = [];
  const canUseUrl =
    typeof url === "string" && (url.startsWith("mysql://") || url.startsWith("mysql2://"));
  if (!canUseUrl) {
    if (!host) missing.push("DB_HOST (or MYSQLHOST)");
    if (!user) missing.push("DB_USER (or MYSQLUSER)");
    if (!database) missing.push("DB_NAME (or MYSQLDATABASE)");
    if (!Number.isFinite(port)) missing.push("DB_PORT (or MYSQLPORT)");
  }
  if (missing.length) {
    throw new Error(`Missing/invalid env vars: ${missing.join(", ")}`);
  }

  const connectionConfig = canUseUrl
    ? (() => {
        const normalized = url.startsWith("mysql2://") ? `mysql://${url.slice("mysql2://".length)}` : url;
        const parsed = new URL(normalized);
        const dbName = decodeURIComponent(String(parsed.pathname || "").replace(/^\//, ""));
        return {
          host: parsed.hostname,
          port: parsed.port ? Number(parsed.port) : 3306,
          user: decodeURIComponent(parsed.username || ""),
          password: decodeURIComponent(parsed.password || ""),
          database: dbName,
          multipleStatements: true,
        };
      })()
    : {
        host,
        user,
        password,
        database,
        port,
        multipleStatements: true,
      };

  const connection = mysql.createConnection(connectionConfig);

  const queryAsync = (statement) =>
    new Promise((resolve, reject) => {
      connection.query(statement, (err, results) => {
        if (err) return reject(err);
        resolve(results);
      });
    });

  try {
    await queryAsync(normalizedSql);
    console.log("✅ Database import completed successfully.");
  } catch (err) {
    console.error("❌ Database import failed.");
    console.error(err?.sqlMessage || err?.message || err);
    process.exitCode = 1;
  } finally {
    await new Promise((resolve) => connection.end(resolve));
  }
};

run().catch((err) => {
  console.error("❌ Database import failed.");
  console.error(err?.message || err);
  process.exitCode = 1;
});
