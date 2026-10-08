# Sky Strike ✈

Jeu de combat aérien (vue de dessus) en **Electron** : abattez les missiles et les avions ennemis, bombardez les cibles au sol, 20 niveaux, 4 boss + mini-boss, armement évolutif.

## Commandes
| Action | Contrôle |
|---|---|
| Piloter | Souris (l'avion suit le pointeur) |
| Canon | Clic gauche (maintenir, attention surchauffe) |
| Bombe / missile | Clic droit |
| Changer d'arme secondaire | Molette (ou touches 1…8) |
| Pause | Échap / P |
| Plein écran | F11 |

## Lancer en développement
```bash
npm install
npm start
```

## Créer l'installateur Windows (.exe)
```bash
npm install
npm run dist:win
```
L'installateur est généré dans `dist/SkyStrike-Setup-1.0.0.exe`.

Chaque push sur GitHub construit aussi automatiquement l'installateur (onglet **Actions** → dernier build → artefact *SkyStrike-Windows-Installer*).

## Contenu
- 20 missions dans 12 environnements (désert, canyon, côte, océan, jungle, montagnes, arctique, ville, ville de nuit, volcan, base Oméga…)
- 8 canons évolutifs (Vulcan → plasma) + améliorations (blindage, bouclier, refroidissement, réacteur, soute, collecteur)
- 8 armes secondaires : Mk-82, AIM-9, sous-munitions, napalm, Hellfire, IEM, thermobarique, ogive « Soleil »
- 8 types de missiles ennemis aux impacts différents : roquette, guidé, fragmentation, hypersonique, incendiaire, IEM, essaim, torpille lourde
- Boss : cuirassé « Kraken », forteresse volante « Albatros », citadelle « Bastion », prototype « Oméga »
