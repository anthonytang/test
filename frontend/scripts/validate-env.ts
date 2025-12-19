import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(__dirname, "../.env") });

const requiredVars = {
  NEXT_PUBLIC_AZURE_AD_CLIENT_ID: "Azure AD Application ID",
  NEXT_PUBLIC_AZURE_AD_AUTHORITY: "Azure AD Authority URL",
  NEXT_PUBLIC_AZURE_AD_REDIRECT_URI: "OAuth Redirect URI",
  NEXT_PUBLIC_SITE_URL: "Frontend base URL",
};

function validateEnvironment() {
  const env = process.env;
  const missing: string[] = [];
  const found: string[] = [];

  Object.entries(requiredVars).forEach(([key, description]) => {
    if (env[key]) {
      found.push(key);
    } else {
      missing.push(`${key} - ${description}`);
    }
  });

  if (missing.length > 0) {
    console.error("Missing required environment variables:");
    missing.forEach((v) => console.error(`   - ${v}`));
    console.error("Add these to your .env file (frontend/.env)");
    console.error("See .env.example for reference");
    process.exit(1);
  }

  console.log(
    `✓ Environment validated (${found.length}/${
      Object.keys(requiredVars).length
    } vars loaded)`
  );
}

validateEnvironment();
