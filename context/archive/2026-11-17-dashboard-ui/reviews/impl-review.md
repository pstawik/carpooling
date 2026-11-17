<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Panel (`/dashboard`) na kontrakcie design-systemu

- **Plan**: context/changes/dashboard-ui/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3, 4
- **Date**: 2026-11-17
- **Verdict**: APPROVED
- **Findings**: 0 critical, 2 warnings, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

Success Criteria (na `HEAD` 45381cf): `npm run lint` — `check-ui-literals: 0 hits in 13 files` (pierwsze uruchomienie: segfault `npm`, exit 139, przed lintem — flake środowiska; ponowienie PASS); `npx astro check` — 0 błędów; `npm run build` — PASS; `npm run smoke` — PASS po fazie 4 (kod źródłowy bez zmian od tamtej pory). Wszystkie wiersze Manual (1.5, 1.6, 2.6, 2.7, 3.5, 3.6) potwierdzone przez użytkownika w trakcie implementacji.

## Findings

### F1 — Plan nie opisuje adaptacji z fazy 3 (`primaryLinkButtonClass`)

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/changes/dashboard-ui/plan.md:66, :75, :148-159
- **Detail**: Kontrakt fazy 1 mówi „`buttonVariants()` z `h-auto min-h-11`” wprost i „Jeden nowy eksport”; w kodzie są dwa nowe eksporty (`groupLinkClass` `group-page-classes.ts:56`, `primaryLinkButtonClass` `:63`), a „Panel administratora” używa stałej (`dashboard.astro:67`). Faza 3 zmieniła też `group-page-classes.ts` i `dashboard.astro`, czego jej „Changes Required” nie wymienia (ślad tylko w treści commita a29b6a8). Te same klasy, zmiana zgodna z regułą wspólnych stałych — ale plan jako źródło prawdy jest nieaktualny.
- **Fix**: Dopisać do fazy 3 notkę „Odstępstwo (impl-review F1)” jak w `group-stats-ui` — nowa stała, przepięcie widoku, `<p>` zamiast `h1` w sinku, kotwice zamiast tras.
- **Decision**: FIXED — notka „Odstępstwo (impl-review F1)” dopisana w fazie 3 `plan.md`

### F2 — Krótkie ciągi klas powtórzone w widoku i sinku

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Pattern Consistency
- **Location**: src/pages/dashboard.astro:33, :38, :49, :57; src/pages/dev/ui-dashboard.astro:48-49, :52, :59, :83, :104, :132, :150, :153
- **Detail**: Typografia powitania (`text-foreground … text-2xl font-bold break-words`), nagłówek karty (`mb-3 text-lg font-semibold`), nazwa grupy (`min-w-0 font-medium break-words`) i tekst pustego stanu (`text-muted-foreground text-sm`) są wpisane w obu plikach. Reguła z Critical Implementation Details wymienia tylko wiersz grupy (spełniona przez `groupLinkClass`), ale duch lekcji F5 (`group-page-ui`) mówi, że sink nie kopiuje klas widoku — zmiana w widoku nie przejdzie do sinka.
- **Fix A ⭐ Recommended**: Udokumentować jako odstępstwo, jak `group-stats-ui` F1
  - Strength: Spójne z precedensem — `[eventId].astro`/`ui-event.astro` i `statystyki.astro`/`ui-stats.astro` też trzymają nagłówki inline; rozjazd wychwyci bramka wizualna.
  - Tradeoff: Ryzyko rozjazdu sinka z widokiem zostaje.
  - Confidence: HIGH — identyczna decyzja zapisana w `context/archive/2026-11-17-group-stats-ui/plan.md` (Odstępstwo F1).
  - Blind spot: None significant.
- **Fix B**: Wydzielić 4 stałe do `group-page-classes.ts` i użyć ich w widoku i sinku
  - Strength: Sink zawsze pokazuje to, co widok.
  - Tradeoff: Cztery jednorazowe stałe dla panelu, inna konwencja niż w trzech pozostałych parach widok/sink.
  - Confidence: MED — poprawne technicznie, ale łamie spójność między widokami.
  - Blind spot: Nie sprawdzono, czy pozostałe sinki chcielibyśmy potem przepiąć tak samo.
- **Decision**: FIXED via Fix A — „Odstępstwo (impl-review F2)” dopisane w fazie 3 `plan.md`

### F3 — Słabszy kontrast hover na wierszu grupy

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/groups/group-page-classes.ts:56-60
- **Detail**: Wiersz w spoczynku `bg-secondary/50` (biel 5 %), hover `hover:bg-accent` (biel 10 %); dawny widok miał 5 % → 15 %. Skok hover jest o połowę mniejszy na karcie `bg-card` (biel 10 %). Komórka hover w `/dev/ui-dashboard` została zaakceptowana w weryfikacji 3.5.
- **Fix**: Zostawić (zaakceptowane na zrzucie); gdyby był za słaby — `hover:bg-input` (biel 20 %, token), bez literału.
- **Decision**: SKIPPED — hover zaakceptowany w weryfikacji 3.5

### F4 — `aria-current` nie obejmuje `/dashboard/` z ukośnikiem

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/Topbar.astro:3
- **Detail**: `Astro.url.pathname === "/dashboard"`; `astro.config.mjs` nie ustawia `trailingSlash` (domyślnie `"ignore"`), więc `/dashboard/` renderuje panel bez `aria-current`. Aplikacja nigdzie nie linkuje z ukośnikiem.
- **Fix**: Porównywać po zdjęciu końcowego ukośnika (`pathname.replace(/\/$/, "") === "/dashboard"`).
- **Decision**: FIXED — `Topbar.astro:4`; predykat sprawdzony dla `/dashboard`, `/dashboard/` (true) i `/groups/x`, `/`, `/dashboardx` (false); lint, `astro check`, smoke PASS

### F5 — `id="grupy"` bez `scroll-mt-4` i bez odwołań

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/dashboard.astro:37
- **Detail**: Karta ma `id="grupy"` spoza kontraktu; nic do niego nie linkuje. Na stronie grupy karty z id mają też `scroll-mt-4` (`[id].astro:123`).
- **Fix**: Dodać `scroll-mt-4` przez `cn(cardClass, "scroll-mt-4")`, jak na stronie grupy.
- **Decision**: FIXED — `dashboard.astro:38` `cn(cardClass, "scroll-mt-4")`; lint, `astro check`, smoke PASS
