// Script to generate realistic sales dataset for MeetUniversity Demo 3
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const productLines = ["Aspirations", "Study Abroad", "School Partnerships"];
const regions = ["North", "South", "West", "East", "Central", "International"];
const counselors = [
  "Pooja Sharma",
  "Rahul Verma",
  "Ananya Iyer",
  "Vikram Malhotra",
  "Sneha Patel",
  "Amitabh Sen",
];

const rows = [
  "lead_id,created_date,product_line,region,funnel_stage,counselor,conversion_status,revenue_inr",
];

// Seeded pseudorandom generator for deterministic results
let seed = 42;
function random() {
  seed = (seed * 9301 + 49297) % 233280;
  return seed / 233280;
}

function randomChoice(arr) {
  return arr[Math.floor(random() * arr.length)];
}

function formatDate(dayOffset) {
  const d = new Date(2026, 8, 1); // Sept 1, 2026
  d.setDate(d.getDate() + dayOffset);
  return d.toISOString().split("T")[0];
}

// Generate 250 realistic rows
// Bottleneck design:
// Total leads: 250
// Contacted: ~225 (90%)
// Counselled: ~185 (74%)
// Application_Started: ~50 (20% of total leads, dropping from 185! 73% drop-off at counselled stage)
// Enrolled: ~35 (14% of total leads)
for (let i = 1; i <= 250; i++) {
  const leadId = `LEAD-2026-${String(i).padStart(4, "0")}`;
  const date = formatDate(Math.floor(random() * 80));
  const product = randomChoice(productLines);
  const region = randomChoice(regions);
  const counselor = randomChoice(counselors);

  const roll = random();
  let stage = "Lead";
  let status = "Lost";
  let revenue = 0;

  if (roll < 0.10) {
    // 10% stay at Lead
    stage = "Lead";
    status = random() < 0.5 ? "Lost" : "In_Progress";
    revenue = 0;
  } else if (roll < 0.26) {
    // 16% reach Contacted but stop
    stage = "Contacted";
    status = random() < 0.6 ? "Lost" : "In_Progress";
    revenue = 0;
  } else if (roll < 0.80) {
    // 54% reach Counselled, but experience hesitation / bottleneck before Application_Started
    stage = "Counselled";
    status = random() < 0.7 ? "Lost" : "In_Progress";
    revenue = 0;
  } else if (roll < 0.86) {
    // 6% reach Application_Started
    stage = "Application_Started";
    status = "In_Progress";
    revenue = 0;
  } else {
    // 14% reach Enrolled (Won)
    stage = "Enrolled";
    status = "Won";
    if (product === "Study Abroad") {
      revenue = Math.floor(75000 + random() * 65000); // 75,000 - 140,000 INR
    } else if (product === "Aspirations") {
      revenue = Math.floor(18000 + random() * 15000); // 18,000 - 33,000 INR
    } else {
      revenue = Math.floor(250000 + random() * 300000); // 250,000 - 550,000 INR
    }
  }

  rows.push(`${leadId},${date},${product},${region},${stage},${counselor},${status},${revenue}`);
}

const csvContent = rows.join("\n") + "\n";
const targetPath = join(process.cwd(), "data", "samples", "meetuniversity_sales.csv");
writeFileSync(targetPath, csvContent, "utf-8");
console.log(`Generated ${rows.length - 1} rows to ${targetPath}`);
