# Gate proofs

## Reguła clone()

Reguła: `no-restricted-syntax` w `eslint.config.js` (blok `apiBodyConfig`, pliki `src/pages/api/**/*.ts`).
Wszystkie 15 endpointów przechodzi `npm run lint` (exit 0).

| Zepsucie | Komenda | Exit | Pierwsza linia komunikatu | Przywrócono |
| --- | --- | --- | --- | --- |
| (a) `invite.ts`: `context.request.clone().formData()` → `context.request.formData()` | `npx eslint src/pages/api/groups/invite.ts` | 1 | `16:18 error Read the request body via context.request.clone().<method>() — rewrite("/404") after reading the original body throws RewriteWithBodyUsed (500). See context/foundation/test-plan.md §6.4 no-restricted-syntax` | `git checkout -- src/pages/api/groups/invite.ts`, lint exit 0 |
| (b) `invite.ts`: alias `const req = context.request; form = await req.formData();` | `npx eslint src/pages/api/groups/invite.ts` | 1 | `16:47 error Read the request body via context.request.clone().<method>() — … no-restricted-syntax` | `git checkout -- src/pages/api/groups/invite.ts`, lint exit 0 |
