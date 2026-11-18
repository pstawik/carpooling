# Tokeny roli autouzupełniania (`--autofill`)

Źródło: `context/changes/auth-signin-ui/plan.md`, Faza 1 (zarzut C1); wyliczenia: `context/changes/auth-signin-ui/research.md` § Autouzupełnianie — wyliczenie koloru. Wartości wpisane do bloków `:root` i `.dark` w `src/styles/global.css` i opublikowane w `@theme inline` jako `--color-autofill` / `--color-autofill-foreground`. Pochodzenie: odcień `--primary` (hue 302.321) przyciemniony — decyzja użytkownika. Numery linii według stanu po Fazie 1 (`global.css`).

| Token | Wartość (:root) | Wartość (.dark) | Literał źródłowy | Plik:linia |
| --- | --- | --- | --- | --- |
| `--autofill` (nowy) | `oklch(0.94 0.04 302.321)` (jasny fiolet; motyw jasny nieużywany, dla kompletności jak `--success`) | `oklch(0.36 0.12 302.321)` (≈ `#4a2870`, przyciemniony `--primary`, nieprzezroczysty) | tło UA autouzupełniania („musztardowe”) na polu `bg-white/10` | `src/components/auth/FormField.tsx:6`; `src/styles/global.css:27` (`:root`), `:70` (`.dark`), `:113` (`@theme inline`) |
| `--autofill-foreground` (nowy) | `oklch(0.145 0 0)` | `oklch(1 0 0)` (= `--primary-foreground`) | tekst i karetka na tle `--autofill` (para do `--autofill`) | `src/styles/global.css:28` (`:root`), `:71` (`.dark`), `:114` (`@theme inline`) |

Reguła w `@layer base` (`src/styles/global.css:145-161`): `input:autofill` i `input[data-autofill-preview]` (podgląd w kitchen sinku; bez `:-webkit-autofill` — docelowe przeglądarki Tailwind 4 obsługują `:autofill`, a build i tak usuwa formę z przedrostkiem) ustawiają `--tw-inset-shadow` i `box-shadow: inset 0 0 0 1000px var(--autofill)`, `-webkit-text-fill-color` i `caret-color` na `var(--autofill-foreground)`. Pozostałe zmienne `:root`, `.dark` i `@theme inline` bez zmian.

## Kontrast (z `research.md`)

Tło `bg-cosmic` środkowe (`#0f1529`), karta `white/10`, pole `white/10` na karcie; kontrast WCAG.

| Wariant | Kolor | Biały tekst | `--ring` vs tło |
| --- | --- | --- | --- |
| puste pole (dziś) | `#3d4152` | 10,08:1 | — |
| `--primary` 20 % na polu | `#4f3873` | 9,83:1 | 3,52:1 |
| `--primary` 30 % na polu | `#583384` | 9,48:1 | 3,40:1 |
| `--primary` 40 % na polu | `#612e95` | 9,01:1 | 3,23:1 |
| **`oklch(0.36 0.12 302.321)`** (wybrane) | `#4a2870` | **11,46:1** | **4,11:1** |
| `oklch(0.33 0.12 302.321)` | `#422067` | 12,87:1 | 4,61:1 |
| `oklch(0.40 0.12 302.321)` | `#55347c` | 9,72:1 | 3,49:1 |

Wartość musi być nieprzezroczysta: wewnętrzny cień przykrywa tło UA tylko bez kanału alfa.
