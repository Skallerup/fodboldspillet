# Fodboldspillet

Et 3D-fodboldspil på dansk, hvor børn i 0.-10. klasse øver plus, minus, gange, division og brøker.
Rigtige svar spiller bolden frem ad banen, og kampen slutter med en straffesparksfinale.

## Sådan spiller man

1. Opret en spiller: kaldenavn, alder, figur (næsehorn, løve, krokodille eller panda), holdnavn, rygnummer, farver og kampråb.
2. Vælg klassetrin, niveau (let, mellem, svær) og regneart (blandet eller én bestemt).
3. Svar på 10 opgaver. Hvert rigtigt svar giver point og driblinger forbi modstanderen.
4. I finalen får man ét skud for hver to rigtige svar. Tryk i målet, dér hvor bolden skal hen.

Spillere og point gemmes i browseren på den enhed, man spiller på (localStorage). Intet sendes ud af enheden.

## Kør spillet lokalt

Spillet er en statisk hjemmeside uden byggetrin:

```
python3 -m http.server 8000
```

Åbn derefter http://localhost:8000

## Mapper

| Sti | Indhold |
| --- | --- |
| `index.html`, `style.css` | Siden og udseendet |
| `src/main.js` | Skærmbilleder og spillets forløb |
| `src/world.js` | 3D-verdenen: figurer, animationer, kamp og straffespark (Three.js) |
| `src/math.js` | Opgaver for alle klassetrin og regnearter |
| `src/storage.js` | Spillere, point og topscore |
| `src/shop.js` | Butikkens katalog, priser og køb |
| `assets/kits/` | Trøjemønstre (lavet af Blender-scriptet) |
| `src/audio.js` | Lydeffekter og oplæsning |
| `assets/models/` | 3D-modeller (.glb) lavet i Blender |
| `tools/blender/` | Blender-scripts, der bygger modellerne |
| `tests/` | Test af opgaverne |
| `vendor/` | Three.js og skrifttyper |

## Test

```
node tests/math.test.mjs
```

## Byg 3D-modellerne igen

Alt 3D er lavet med Blender-scripts (Blender 5.x eller Python-modulet `bpy`):

```
python3 tools/blender/build_assets.py            # figurer, bold og stadion til spillet
python3 tools/blender/build_assets.py --render   # samme, plus et forhåndsbillede
python3 tools/blender/rhino_player.py --render   # detaljeret næsehorn til nærbilleder
```

## Butikken

Point bruges i butikken på: trøjemønstre, bolde, støvler, målfejringer, stadion (projektører, store tribuner, tag),
tilskuere (maskotten Ørni, flag i holdets farver, fyrværkeri) og pokaler. Kataloget og priserne står i `src/shop.js`.

## Idéer til senere

- Lettere modeller til langsomme enheder.
- Fælles topscoreliste på tværs af enheder.
