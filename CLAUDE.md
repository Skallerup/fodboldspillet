# Fodboldspillet

Dansk 3D-matematikspil til børn (0.-10. klasse) med fodboldtema. Statisk hjemmeside uden byggetrin: Three.js er lagt i `vendor/` og hentes via importmap i `index.html`.

## Kommandoer

- Kør lokalt: `python3 -m http.server 8000`
- Test opgaver: `node tests/math.test.mjs`
- Byg modeller: `python3 tools/blender/build_assets.py [--render]` (kræver Blender 5.x eller `pip install bpy`)

## Arkitektur

- `src/main.js`: alle skærmbilleder som HTML-skabeloner, hændelser via `data-a`-attributter og `handlinger`-tabellen. Tilstand: `me` (aktiv spiller), `kamp`, `draft`.
- `src/world.js`: `World` (scene, kamera pr. tilstand: hero, match, penalty) og `Figur` (procedurale animationer ved at rotere delene Body, Head, ArmL, ArmR, LegL, LegR). Målet står ved z = +29, figurer kigger mod +z.
- `src/math.js`: `lavOpgave(regneart, klasse, niveau)`. Svar er brøker `{n, d}`, så 0,5 og 1/2 er samme svar. Niveau let/svær flytter ét klassetrin ned/op.
- `src/storage.js`: localStorage-nøglen `fodboldspillet.v1`. `point` er saldo til kommende butik, `pointIAlt` bruges til topscoren.

## Beslutninger

- Alt 3D laves med Blender-scripts, ikke i hånden. Figurerne deler krop; hoveder ligger i `HEADS` i `build_assets.py`.
- Materialerne `Jersey`, `Shorts`, `Socks`, `Trim` farves i spillet med spillerens farver; `Number` erstattes af et canvas med rygnummeret.
- 0.-3. klasse får fire svarmuligheder, 4. klasse og op indtaster svaret.
- Kun lokal lagring: ingen login, ingen server. Bygges så online topscore kan kobles på senere.
- Sprog i brugerfladen: dansk, korte sætninger, ingen engelske ord.

## Næste etape

Butik med opgraderinger (stadion, tøj, bold, støvler, målfejringer, tilskuere/maskot, pokalskab). `World.setStadion(niveau)` viser allerede flere stadion-dele pr. niveau.
