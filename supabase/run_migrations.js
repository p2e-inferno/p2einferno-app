require("dotenv").config({ path: "../.env.local" });
const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    "Missing Supabase credentials. Please check your .env.local file."
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

/**
 * Executes a single SQL migration file via Supabase.
 * @param {string} filePath - Absolute path to the migration SQL file.
 */
async function runMigration(filePath) {
  try {
    console.log(`Running migration: ${filePath}`);
    const sql = fs.readFileSync(filePath, "utf8");

    // Execute the SQL using the Supabase client
    const { error } = await supabase.rpc("pgmigrate", { query: sql });

    if (error) {
      console.error(`Error running migration ${filePath}:`, error);
      return false;
    }

    console.log(`Successfully ran migration: ${filePath}`);
    return true;
  } catch (error) {
    console.error(`Error processing migration ${filePath}:`, error);
    return false;
  }
}

async function main() {
  // Get the migration file to run from command line arguments
  const migrationFile = process.argv[2];

  if (!migrationFile) {
    console.error("Please specify a migration file to run.");
    console.error("Usage: node run_migrations.js <migration_file>");
    console.error(
      "Example: node run_migrations.js migrations/20240802_fix_rls_policies.sql"
    );
    process.exit(1);
  }

  const migrationPath = path.resolve(__dirname, migrationFile);

  if (!fs.existsSync(migrationPath)) {
    console.error(`Migration file not found: ${migrationPath}`);
    process.exit(1);
  }

  const success = await runMigration(migrationPath);

  if (success) {
    console.log("Migration completed successfully.");
  } else {
    console.error("Migration failed.");
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Unhandled error:", error);
  process.exit(1);
});
