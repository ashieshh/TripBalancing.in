import fs from "fs";
import path from "path";
import "dotenv/config";
import { getAgodaStatus, warmAgodaCityIndex } from "../src/services/agodaService";

const outputPath = path.join(process.cwd(), "data", "agoda-city-index-v1.json.gz");

async function main() {
  if (!process.env.AGODA_HOTEL_DATA_URL) {
    console.log("[Agoda build] AGODA_HOTEL_DATA_URL not set; skipping bundled city index generation.");
    return;
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  process.env.AGODA_CITY_INDEX_CACHE_PATH = outputPath;
  console.log(`[Agoda build] Building compact city index at ${outputPath}...`);
  await warmAgodaCityIndex(true);
  const status = getAgodaStatus();

  if (status.cityIndexReady && fs.existsSync(outputPath)) {
    const kb = Math.round(fs.statSync(outputPath).size / 1024);
    console.log(`[Agoda build] Bundled city index ready: ${status.cityKeys} searchable keys, ${kb} KB.`);
  } else {
    // Do not fail the whole deployment: runtime fallback remains available.
    console.warn(`[Agoda build] Compact city index was not generated. Runtime fallback will be used. ${status.cityIndexError || ""}`.trim());
  }
}

main().catch((error) => {
  console.warn(`[Agoda build] Non-fatal city index build error: ${error?.message || error}`);
});
