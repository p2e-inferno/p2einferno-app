const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

// Load environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Error: Required environment variables not set.");
  console.error(
    "Make sure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set in your .env file"
  );
  process.exit(1);
}

// Initialize Supabase client with service role key (admin privileges)
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

// Migration files in order of execution
const migrationFiles = [
  "migrations/000_setup_functions.sql",
  "migrations/001_initial_schema.sql",
  "migrations/002_sample_data.sql",
  "migrations/003_user_profiles_schema.sql",
];

// Function to execute SQL directly using REST API
async function executeSQLDirectly(sql) {
  try {
    // SQL endpoint expects a specific format
    const response = await fetch(`${supabaseUrl}/rest/v1/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${supabaseServiceKey}`,
        apikey: `${supabaseServiceKey}`,
        Prefer: "resolution=ignore-duplicates,return=minimal",
      },
      body: JSON.stringify({
        query: sql,
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      return { error: { message: errorData } };
    }
    return { error: null };
  } catch (err) {
    return { error: { message: err.message } };
  }
}

// Try to use RPC function if available, otherwise use direct SQL
async function executeSQL(sql) {
  // Skip empty statements
  if (!sql.trim()) return { error: null };

  try {
    // First try RPC method
    const { error } = await supabase.rpc("exec_sql", {
      sql_query: sql,
    });

    if (error && error.message.includes("function exec_sql does not exist")) {
      console.log("RPC function not found, using direct SQL execution");
      return await executeSQLDirectly(sql);
    }

    return { error };
  } catch (err) {
    console.log("RPC error, using direct SQL execution");
    return await executeSQLDirectly(sql);
  }
}

async function applyMigrations() {
  console.log("Running P2E Inferno Database Migrations...\n");

  try {
    for (const filePath of migrationFiles) {
      console.log(`Applying migration: ${filePath}`);

      // Read the SQL file
      const sql = fs.readFileSync(path.join(__dirname, filePath), "utf8");

      // For initial setup function, we need to execute the entire file
      if (filePath.includes("000_setup_functions.sql")) {
        console.log("Executing setup script...");
        const { error } = await executeSQLDirectly(sql);
        if (error) {
          console.error(`Error executing setup script: ${error.message}`);
        } else {
          console.log("✅ Setup script executed successfully");
        }
        continue;
      }

      // For other migrations, split into statements
      // This is a simple approach - in production you might need a more robust SQL parser
      const statements = sql
        .replace(/--.*$/gm, "") // Remove SQL comments
        .split(";")
        .filter((statement) => statement.trim().length > 0);

      let successCount = 0;
      let failureCount = 0;

      // Execute each SQL statement
      for (const statement of statements) {
        try {
          const { error } = await executeSQL(statement);

          if (error) {
            console.error(`Error executing SQL: ${error.message}`);
            console.error(`Statement: ${statement.substring(0, 100)}...`);
            failureCount++;
          } else {
            successCount++;
          }
        } catch (err) {
          console.error(`Exception executing SQL: ${err.message}`);
          console.error(`Statement: ${statement.substring(0, 100)}...`);
          failureCount++;
        }
      }

      console.log(
        `✅ Applied migration: ${filePath} (${successCount} successful, ${failureCount} failed)`
      );
    }

    console.log("\nMigrations completed successfully!");
  } catch (err) {
    console.error(`Migration failed: ${err.message}`);
    process.exit(1);
  }
}

// Execute the migrations
applyMigrations();
