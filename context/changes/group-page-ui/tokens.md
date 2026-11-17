# Tokeny ciemnego motywu (`.dark`)

Źródło: `context/changes/group-page-ui/research.md`, zarzuty C1/C2. Wartości wpisane do bloku `.dark` w `src/styles/global.css` (Faza 2). Numery linii według stanu po Fazie 2 (`global.css`) i przed Fazą 3 (`src/pages/groups/[id].astro`).

| Token | Wartość (.dark) | Literał źródłowy | Plik:linia |
| --- | --- | --- | --- |
| `--background` | `oklch(0.166 0.026 269.371)` | `#0a0e1a` (`bg-cosmic`) | `src/styles/global.css:116` |
| `--foreground` | `oklch(1 0 0)` | `text-white` (`#fff`) | `src/pages/groups/[id].astro:91` |
| `--card` | `oklch(1 0 0 / 10%)` | `bg-white/10` | `src/pages/groups/[id].astro:91` |
| `--card-foreground` | `oklch(1 0 0)` | `text-white` | `src/pages/groups/[id].astro:91` |
| `--popover` | `oklch(0.26 0.02 270)` (≈ `#232631`, nieprzezroczysty) | `bg-white/10` nałożone na `#0a0e1a` | `src/pages/groups/[id].astro:91`; zmienione w przeglądzie (F4), żeby nakładki shadcn nie prześwitywały |
| `--popover-foreground` | `oklch(1 0 0)` | `text-white` | `src/pages/groups/[id].astro:91` |
| `--primary` | `oklch(0.558 0.288 302.321)` | `bg-purple-600` | `src/pages/groups/[id].astro:93` |
| `--primary-foreground` | `oklch(1 0 0)` | `text-white` | `src/pages/groups/[id].astro:93` |
| `--secondary` | `oklch(1 0 0 / 10%)` | `bg-white/10` (przycisk drugorzędny) | `src/pages/groups/[id].astro:201` |
| `--secondary-foreground` | `oklch(1 0 0)` | `text-white` | `src/pages/groups/[id].astro:201` |
| `--accent` | `oklch(1 0 0 / 10%)` | `bg-white/10` (przycisk drugorzędny) | `src/pages/groups/[id].astro:201` |
| `--accent-foreground` | `oklch(1 0 0)` | `text-white` | `src/pages/groups/[id].astro:201` |
| `--muted-foreground` | `oklch(0.932 0.032 255.585 / 70%)` | `text-blue-100/70` | `src/pages/groups/[id].astro:125` |
| `--border` | `oklch(1 0 0 / 10%)` | `border-white/10` | `src/pages/groups/[id].astro:91` |
| `--input` | `oklch(1 0 0 / 20%)` | `border-white/20` | `src/pages/groups/[id].astro:55` |
| `--ring` | `oklch(0.714 0.203 305.504)` | `focus:ring-purple-400` | `src/pages/groups/[id].astro:55` |
| `--destructive` | `oklch(0.704 0.191 22.216)` (bez zmian) | red-400 (czytelne na ciemnym tle) | `src/styles/global.css` (blok `.dark`) |
| `color-scheme` | `dark` | natywne date/time/select na ciemnym tle | `src/styles/global.css` (blok `.dark`) |
| `--link` (nowy) | `oklch(0.827 0.119 306.383)` (purple-300); w `:root` purple-700 `oklch(0.496 0.265 301.924)` | `text-purple-300` (linki tekstowe) | `src/components/Topbar.astro:4`; dodany w przeglądzie (F8), opublikowany jako `--color-link` w `@theme inline` |

Pozostałe zmienne `.dark` (`--muted`, `--chart-*`, `--sidebar-*`) oraz `:root` i `@theme inline` bez zmian, poza nowym `--link` (F8).
