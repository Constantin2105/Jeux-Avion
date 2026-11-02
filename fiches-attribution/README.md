# Fiches d'attribution de parcelles

Application de bureau **locale et hors ligne** (Windows) pour créer, enregistrer, retrouver et imprimer les fiches d'attribution de parcelles.
Version de base conforme au cahier des charges (un ordinateur, un utilisateur).

## Fonctionnalités
- **Modèles** : créer, modifier, dupliquer, prévisualiser, choisir le modèle par défaut. Édition structurée : en-tête, titre, textes fixes, rubriques de champs, zone des signatures, emplacement du QR code.
  Modèle initial fourni : *Fiche d'attribution de parcelle – GBAFFO* (repris du document Word transmis).
- **Fiches** : saisie du bénéficiaire (identité, naissance, profession, téléphone, pièce d'identité), de la parcelle (forme, superficie, lot, limites) et de la date d'établissement, avec **aperçu A4 en direct**.
- À l'enregistrement : **référence unique** (`GBF-2026-0001`, numérotation annuelle, jamais réutilisée) et **QR code** contenant cette référence.
- **Liste et recherche** par référence, nom, téléphone, n° de pièce… ; **lecture de QR code** par caméra, image ou lecteur USB.
- **Export PDF** (A4, une page) et **impression directe**.
- Chaque fiche garde une copie de son modèle : modifier un modèle ne change jamais les fiches déjà établies.
- **Sauvegarde manuelle** de toute la base dans un fichier (et restauration, avec copie de sécurité automatique).

## Technique
- Electron (HTML/CSS/JavaScript), sans aucun service Internet.
- Base SQLite locale (`sql.js`) : un seul fichier `fiches.sqlite` dans `%APPDATA%\Fiches d'attribution\donnees\` sous Windows.
- QR codes : `qrcode` (génération) et `jsQR` (lecture).

## Développement
```bash
cd fiches-attribution
npm install
npm start      # lance l'application
npm test       # tests automatiques (base de données, numérotation, recherche, document)
```

## Créer l'installateur Windows
```bash
cd fiches-attribution
npm install
npm run dist:win
```
L'installateur est créé dans `fiches-attribution/dist/FichesAttribution-Setup-1.0.0.exe`.
Chaque push qui modifie ce dossier le construit aussi automatiquement sur GitHub (onglet **Actions** → *Build Fiches d'attribution (Windows)* → artefact *FichesAttribution-Windows-Installer*).

Voir [GUIDE_UTILISATION.md](GUIDE_UTILISATION.md) pour le guide de prise en main.
