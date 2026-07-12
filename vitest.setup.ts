import { config } from "dotenv";

// Load .env so modules that construct API clients at import time
// (e.g. src/lib/client.ts) don't throw during tests.
config();
