import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const pdfPath = path.join(os.tmpdir(), "zumafit-food-audit", "sara2.pdf");

function fold(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

function number(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(String(value).replace(/\./g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

if (!fs.existsSync(pdfPath)) throw new Error(`No existe ${pdfPath}`);
const parsed = JSON.parse(execSync(`npx --yes pdf-parse table "${pdfPath}" --format json`, {
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
}));

const entries = [];
for (const page of parsed.pages || []) {
  for (const table of page.tables || []) {
    const foods = table.at(-1)?.[0] === "Alimento" ? table.at(-1) : null;
    const energy = table.at(-2);
    const protein = table.at(-4);
    const fat = table.at(-5);
    const carbs = table.find((row) => row[0] === "Carbohidratos disponibles");
    if (!foods || !energy || !protein || !fat || !carbs) continue;
    const offset = energy.length - foods.length;
    for (let index = 1; index < foods.length; index += 1) {
      const name = String(foods[index] || "").replace(/\n/g, "").replace(/\s+/g, " ").trim();
      entries.push({
        page: page.num,
        name,
        kcal: number(energy[index + offset]),
        protein: number(protein[index + offset]),
        carbs: number(carbs[index + offset]),
        fat: number(fat[index + offset]),
      });
    }
  }
}

const patterns = process.argv.slice(2).map(fold);
const matches = patterns.length
  ? entries.filter((entry) => patterns.some((pattern) => fold(entry.name).includes(pattern)))
  : entries;

console.log(JSON.stringify(matches, null, 2));
