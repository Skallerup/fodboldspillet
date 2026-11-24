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
node tests/daily.test.mjs
```

## Byg 3D-modellerne igen

Alt 3D er lavet med Blender-scripts (Blender 5.x eller Python-modulet `bpy`):

```
python3 tools/blender/build_assets.py            # figurer, bold og stadion til spillet
python3 tools/blender/build_assets.py --render   # samme, plus et forhåndsbillede
python3 tools/blender/build_assets.py --cards    # samme, plus billederne til samlekortene
python3 tools/blender/build_assets.py --lite     # lette udgaver af figurerne til langsomme enheder
python3 tools/blender/rhino_player.py --render   # detaljeret næsehorn til nærbilleder
```

## Kampen

- Svarer man forkert, får man et hint og ét forsøg mere.
- Sværhedsgraden følger barnet: fem rigtige i træk gør opgaverne lidt sværere, tre forkerte gør dem lidt lettere.
- Hvert tredje rigtige svar giver en chance med det samme: et frispark eller en friløber.
- Man kan spille en hurtig kamp på fem opgaver, eller to spillere mod hinanden på samme enhed.
- Point giver oprykning gennem ti rækker, fra Serie 3 til verdensmester.

## Butikken

Point bruges i butikken på: trøjemønstre, bolde, støvler, målfejringer, stadion (projektører, store tribuner, tag),
tilskuere og pokaler. Stadion, tilskuere og pokalrum har ti levels hver, og hvert level gør det større og flottere. Kataloget og priserne står i `src/shop.js`.

## Samlekort og hemmelige figurer

Efter hver kamp får man en kortpakke med ét af 24 samlekort (almindelige, sjældne og guld). Kortene samles i albummet.
Haj, drage og robot er hemmelige figurer, der låses op ved at score 15 mål, svare rigtigt på 150 opgaver eller samle 10 forskellige kort.

## Turnering, superskud og dagens udfordring

- **Pokalturnering:** kvartfinale, semifinale og finale mod tre dyrehold. Man skal score 2, 3 og 3 mål for at gå videre, og målmændene bliver dygtigere. Vinderen får en turneringspokal, 300 point og to kortpakker.
- **Superskud:** fem rigtige svar i træk giver en ildkugle til finalen, som målmanden ikke kan redde.
- **Dagens udfordring:** en ny lille opgave hver dag, som giver 100 point og en ekstra kortpakke.

## Idéer til senere

- Fælles topscoreliste på tværs af enheder.
