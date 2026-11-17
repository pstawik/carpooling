// UI contract guard: fails when a cleaned view uses literal colours, palette classes or arbitrary px/rem values.
// Zero dependencies on purpose. Runs as part of `npm run lint`: node scripts/check-ui-literals.mjs
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Views moved onto design tokens and src/components/ui/. When you clean another view, append it here.
const CLEANED_VIEWS = [
  "src/pages/groups/[id].astro",
  "src/components/groups/ChildItem.tsx",
  "src/components/groups/EventItem.tsx",
  "src/components/groups/InvitePanel.tsx",
  "src/components/groups/group-page-classes.ts",
  "src/components/Topbar.astro",
  "src/pages/dev/ui-group.astro",
  "src/pages/groups/[id]/terminy/[eventId].astro",
  "src/pages/dev/ui-event.astro",
];

// The /10x-ui hardcoded-value scan, widened: side borders, ring-offset, placeholder/caret/accent/decoration,
// arbitrary values in px/rem/em/% (incl. negative); hex ignored in href="#anchor" and hyphenated ids.
const LITERAL =
  /(?<!href=["'])#[0-9a-fA-F]{3,8}\b(?![\w-])|rgba?\(|hsla?\(|oklch\(|-\[-?[0-9.]+(px|rem|em|%)\]|\b(bg|text|border(-[trblxyse])?|ring(-offset)?|outline|from|via|to|fill|stroke|shadow|divide|placeholder|caret|accent|decoration)-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|white|black)\b/;

let hits = 0;
let missing = 0;
for (const file of CLEANED_VIEWS) {
  let source;
  try {
    source = readFileSync(path.join(ROOT, file), "utf8");
  } catch {
    missing++;
    console.error(`${file}: listed in CLEANED_VIEWS but not found (renamed or moved? update the list)`);
    continue;
  }
  source.split(/\r?\n/).forEach((line, index) => {
    if (LITERAL.test(line)) {
      hits++;
      console.error(`${file}:${index + 1}: ${line.trim()}`);
    }
  });
}

if (hits || missing) {
  console.error(
    `\ncheck-ui-literals: ${hits} hit(s), ${missing} missing file(s); use role tokens (bg-primary, text-muted-foreground, border-input, …) from src/styles/global.css`,
  );
  process.exit(1);
}
console.log(`check-ui-literals: 0 hits in ${CLEANED_VIEWS.length} files`);
