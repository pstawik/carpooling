# Tokeny roli sukcesu (`--success`)

Źródło: `context/changes/event-plan-ui/plan.md`, Faza 2 (zarzut C2). Wartości wpisane do bloków `:root` i `.dark` w `src/styles/global.css` i opublikowane w `@theme inline` jako `--color-success` / `--color-success-foreground`. Numery linii według stanu po Fazie 2 (`global.css`) i przed Fazą 3 (`src/pages/groups/[id]/terminy/[eventId].astro`).

| Token | Wartość (:root) | Wartość (.dark) | Literał źródłowy | Plik:linia |
| --- | --- | --- | --- | --- |
| `--success` (nowy) | `oklch(0.627 0.194 149.214)` (green-600) | `oklch(0.792 0.209 151.711)` (green-400, czytelne na ciemnym tle, jak `--destructive` = red-400) | `border-green-500/30 bg-green-900/30 … text-green-300` („Miejsc wystarcza”) | `src/pages/groups/[id]/terminy/[eventId].astro:143`; `src/styles/global.css:24` (`:root`), `:64` (`.dark`), `:105` (`@theme inline`) |
| `--success-foreground` (nowy) | `oklch(0.985 0 0)` | `oklch(0.145 0 0)` | tekst na tle `bg-success` (para do `--success`) | `src/styles/global.css:25` (`:root`), `:65` (`.dark`), `:106` (`@theme inline`) |

Wariant `success` w `src/components/ui/alert.tsx` (`bg-card text-success`) zastępuje literały `green-*` w widoku. Pozostałe zmienne `:root`, `.dark` i `@theme inline` bez zmian.
