# Växverket — projektspecifika instruktioner

## Projektöversikt

- **Projektnamn:** Växverket
- **Apptyp:** Windows-desktopapp
- **Teknikstack:** Tauri + React + TypeScript + Rust (desktop-backend)
- **Backend:** Appwrite (valt backendalternativ)
- **All arbete ska ske i denna mapp:** `C:\Users\jenst\OneDrive\Desktop\växverket`

## Viktiga regler

1. **Använd inte Lumi som källa.** Det gamla Lumi-projektet får inte användas som grund, mall eller kopiatkälla för Växverket.
2. **Inga API-nycklar i frontend eller i appen.** Appwrite-API-nycklar, service-roll-nycklar och andra hemligheter får aldrig bäddas in i React-kod, TypeScript-kod eller Rust-kod som distribueras i desktopappen. Hemligheter hanteras på server-sidan eller via säkra miljövariabler.
3. **Säkerhet och dataskydd från dag ett.** Planera rollbaserade behörigheter, autentisering och dataskydd innan funktionalitet byggs.
4. **Roller:** Appen ska ha separata roller för administratör, lärare, speciallärare och elev. Behörigheter ska vara väl definierade per roll.
5. **Bygg inte appen än.** Detta steg handlar om förberedelser, inte implementation.

## Förberedda komponenter

- **Skills:** 9 lokala skills finns i `.agents/skills/` (se listan nedan).
- **Appwrite MCP:** Konfigurerat i `opencode.json` för attMCP-servern `https://mcp.appwrite.io` ska vara tillgänglig för projektet.
- **Globala skills:** De globala installationerna i `~/.agents/skills/` behålls oförändrade och används av andra projekt.

## Lokala skills i detta projekt

| Skill | Källa | Beskrivning |
|---|---|---|
| `appwrite-typescript` | appwrite/skills | Appwrite med TypeScript/JS: auth, databas (TablesDB), storage, realtime, funktioner, server-side admin |
| `appwrite-rust` | appwrite/skills | Appwrite med Rust async SDK + Tokio: användare, TablesDB, storage, funktioner, behörigheter, frågor |
| `appwrite-cli` | appwrite/skills | Appwrite CLI: projektlinking, pull/push, codegen, queries, CI-auth |
| `vercel-react-best-practices` | vercel-labs/agent-skills | 70 regler för React/Next.js prestanda: waterfalls, bundle, rendering, data-fetching |
| `web-design-guidelines` | vercel-labs/agent-skills | Granskar UI mot tillgänglighet, UX och prestanda |
| `vercel-composition-patterns` | vercel-labs/agent-skills | React-komponentarkitektur: undviker boolean-prop-sprawl med compound components |
| `frontend-design` | Junaid-PK/frontend-design-skill | SaaS/web-interface-design: hierarki, komponenter, copy, tillstånd, a11y, responsivt |
| `security-audit` | toshipon/claude-code-security-audit-skill | Full-stack-säkerhetsgranskning: OWASP Top 10:2025, MASVS, CIS, PCI-DSS, GDPR, LLM/AI |
| `webapp-testing` | anthropics/skills | Testning av webbapplikationer |

## Översikt över nästa steg (inte än utförda)

- Initiera Tauri-projektet med React + TypeScript
- Konfigurera Appwrite-projektet (utan API-nycklar än)
- Ställa in databasmodell och roller
- Bygga frontend och Rust-backend

**Stanna här.** Bygg inte appen än.
