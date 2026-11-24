# Fodboldspillet

Dansk 3D-matematikspil til børn (0.-10. klasse) med fodboldtema. Statisk hjemmeside uden byggetrin: Three.js er lagt i `vendor/` og hentes via importmap i `index.html`.

## Kommandoer

- Kør lokalt: `python3 -m http.server 8000`
- Test: `node tests/math.test.mjs`, `node tests/daily.test.mjs` og `node tests/stats.test.mjs`
- Før hvert push: `npx eslint src/` (fanger navne, der ikke findes; `eslint.config.mjs`) og røgtesten `node tests/smoke.cjs` med en lokal server kørende (spiller to hele kampe i Chrome via Playwright). Spillet gik i stå i en udgivet version, fordi en hjælpefunktion blev slettet ved en fejl, og kun enhedstestene blev kørt.
- Byg modeller: `python3 tools/blender/build_assets.py [--render] [--cards]` og derefter `python3 tools/blender/build_assets.py --lite` (kræver Blender 5.x eller `pip install bpy`)

## Arkitektur

- `src/main.js`: alle skærmbilleder som HTML-skabeloner, hændelser via `data-a`-attributter og `handlinger`-tabellen. Tilstand: `me` (aktiv spiller), `kamp`, `draft`.
- `src/world.js`: `World` (scene, kamera pr. tilstand: hero, match, penalty) og `Figur` (procedurale animationer ved at rotere delene Body, Head, ArmL, ArmR, LegL, LegR). Målet står ved z = +29, figurer kigger mod +z.
- `src/math.js`: `lavOpgave(regneart, klasse, niveau)`. Svar er brøker `{n, d}`, så 0,5 og 1/2 er samme svar. Niveau let/svær flytter ét klassetrin ned/op.
- `src/storage.js`: localStorage-nøglen `fodboldspillet.v1`. `point` er saldo til butikken, `pointIAlt` bruges til topscoren.

## Beslutninger

- Alt 3D laves med Blender-scripts, ikke i hånden. Figurerne deler krop; hoveder ligger i `HEADS` i `build_assets.py`.
- Materialerne `Jersey`, `Shorts`, `Socks`, `Trim` farves i spillet med spillerens farver; `Number` erstattes af et canvas med rygnummeret.
- 0.-3. klasse får fire svarmuligheder, 4. klasse og op indtaster svaret.
- Kun lokal lagring: ingen login, ingen server. Bygges så online topscore kan kobles på senere.
- Sprog i brugerfladen: dansk, korte sætninger, ingen engelske ord.

## Butik og opgraderinger

- `src/shop.js`: `TRIN` (stadion, tilskuere, pokaler: ti levels hver, gemt som indeks 0-9) og `VALG` (trøje, bold, støvler, jubel: ejes og vælges). `udstyr(p)` giver spillerens udstyr med standardværdier og oversætter gamle gemte spillere (`o.v`). Tilskuere kræver stadion level 3 (`kraever`).
- Hvad hvert level viser, står i `World.setStadion` og `World.setUdstyr`; stadion-delene hedder det samme i `build_assets.py` (fx `StandsBigSides`, `Scoreboard`, `Arch`, `Tifo`, `Beams`).
- `World.setUdstyr(o, kit)` anvender udstyret: stadion-dele, flag (`Banners`), boldfarver, pokaler, maskot. `Figur.setKit` tager trøjemønster (`assets/kits/*.jpg`), støvlefarve og målfejring.
- Nye ting til butikken: tilføj i `shop.js`, og lav udseendet i `world.js` (farver) eller `build_assets.py` (nye 3D-dele).

## Samlekort og hemmelige figurer

- `src/cards.js` og `assets/cards/cards.json`: 24 samlekort. Man får en pakke pr. færdigspillet kamp (`me.pakker`), dubletter veksles til point. Billederne renderes med `build_assets.py --cards`.
- `LAASE` i `src/shop.js`: haj (15 mål), drage (150 rigtige svar) og robot (10 forskellige kort). De hentes først, når de skal bruges (`World.loadFigur`).
- Sæt (`SAET` i `cards.js`): alle tre kort af et dyr giver en sættrøje (`saet_<dyr>` i `VALG.troeje`, uden pris), som `udstyr(p)` lægger i `ejet`. Mønstrene laves med `build_assets.py --kits`.
- Kortduel (`startKortduel`, `kd` i `main.js`): fem runder mod computeren; man vælger fart, skud eller hjerne, og et rigtigt svar lægger `KD_BONUS` (15) til. Rundens vinder vælger tal næste gang.
- Regnearter vælges som liste i `me.regnearter` (fx `['plus', 'minus']`); `arter(p)` i `main.js` oversætter ældre gemte spillere.
- Butikken har forhåndsvisning (`proeve` i `main.js`): viser varen på spilleren uden at ændre det gemte.

## Turnering, superskud og dagens udfordring

- Pokalturnering (`RUNDER`, `HOLD` i `main.js`): tre kampe mod dyrehold; man skal score `krav` mål i finalen. Status gemmes i `me.turnering`, sejre i `me.turneringer` (giver kæmpepokalen `World.storPokal`). `klog` styrer målmandens sværhedsgrad.
- Superskud: 5 rigtige i træk giver ét (`kamp.superskud`); `World.skyd(pt, onSpark, true)` er en ildkugle, der ikke kan reddes.
- `src/daily.js`: dagens udfordring vælges ud fra datoen; `taelDag(p, id)` tæller og udløser præmien én gang pr. dag. Test: `node tests/daily.test.mjs`.

## Kampens forløb

- `besvar` i `main.js`: første forkerte svar giver et hint (`hint(q)` i `math.js`) og ét forsøg mere; rigtigt i andet forsøg tæller som rigtigt, men giver halve point (`kamp.svar[i] === 'halv'`).
- Automatisk sværhedsgrad: `me.justering` (-2 til +2 klassetrin) går op ved fem rigtige i træk og ned ved tre forkerte i træk. Slås fra med `me.tilpas = false`.
- Hvert tredje rigtige svar giver en chance (`chance`): skiftevis frispark og friløber, hvor målmanden løber ud, og man har 5 sekunder (`World.startChance`, `slutChance`).
- Alle skud går gennem `etSkud` og `affyr`; `kamp.sigte` er det aktive skud. Finalen er `finaleLoop`.
- Hurtig kamp har 5 opgaver (`kamp.antal`). Turneringens `krav` tæller alle mål i kampen.
- To spillere (`startDuel`, `duelLoop`): fem opgaver hver med egne indstillinger, derefter straffespark, hvor den anden vælger målmandens side (`zone` i `World.skyd`).
- Rækker (`RAEKKER`) følger `pointIAlt`; `naesteMaal` viser de nærmeste ting at spille for.
- Første kamp er guidet (`foersteKamp`, `kamp.guide`): tre opgaver og en finale med korte forklaringer (`besked`). `me.guidet` sikrer, at den kun vises én gang.
- Point: mål i finalen giver `MAAL_POINT` (25), mål fra chancer `CHANCE_POINT` (15).
- Tilskuere level 10 er en aftenkamp (`World.setAften`): mørk himmel, dæmpet lys og farvede lyspletter på græsset (`lysPletter`).
- `World.fart` spoler animationerne frem og bruges kun i test.

## Til forældre og lærere

- `src/stats.js`: `noter(p, q, udfald, sek)` kaldes for hver færdig opgave (`'foerste'`, `'andet'` efter hint, `'forkert'`) fra `besvar` og `duelSvar`. Gemmes i `p.stat`: pr. regneart, pr. dag (60 dage) og de 12 seneste opgaver, der blev forkerte i begge forsøg.
- `overblik(p)` regner tallene til siden `skaermVoksen` (Indstillinger → Til forældre og lærere), som også kan udskrives. Test: `node tests/stats.test.mjs`.

## Grafik og indstillinger

- Hver figur findes i to udgaver: `char_<navn>.glb` (ca. 38.000 trekanter) og `char_<navn>_lite.glb` (ca. 7.500, bygges med `build_assets.py --lite`).
- `World.setKvalitet(lav)`: let grafik = lette figurer, ingen skygger (mørk plet under figurerne), lavere opløsning. `World.onLangsom` kaldes, hvis spillet kører under 24 billeder i sekundet de første sekunder.
- Grafikvalget (auto, flot, hurtig) gemmes for enheden i `localStorage['fodboldspillet.grafik']`, ikke pr. spiller.
- Omklædningsrummet (`skaermHub`) viser kun det vigtigste; klassetrin, niveau, regnearter, lyd, grafik og spiller ligger i `skaermIndstil`.
- Målmanden: `klog` (hvor ofte han gætter rigtigt) er 0,3 + 0,025 pr. klassetrin i almindelige kampe; han kan nå helt ud til stolperne, når han gætter rigtigt.

## Idéer til senere

Fælles topscore online, flere figurer, skøre kampe (regn, sne, nat).
