# Guide d'utilisation – Fiches d'attribution de parcelles

## 1. Installation
Lancez `FichesAttribution-Setup-1.0.0.exe` et suivez les étapes. Un raccourci est créé sur le bureau.
L'application fonctionne **sans Internet**.

## 2. Créer une fiche
1. Cliquez sur **＋ Nouvelle fiche**.
2. Vérifiez le modèle choisi (le modèle GBAFFO est sélectionné par défaut).
3. Remplissez les champs. L'aperçu A4 à droite se met à jour pendant la saisie.
   Les champs laissés vides apparaissent en pointillés (à compléter à la main).
4. Cliquez sur **Enregistrer la fiche** : la référence (ex. `GBF-2026-0001`) et le QR code sont attribués.
5. Cliquez sur **Télécharger en PDF** ou **Imprimer**.

## 3. Retrouver, modifier, réimprimer une fiche
- Menu **Fiches enregistrées** : tapez une référence, un nom, un téléphone ou un n° de pièce d'identité.
- Bouton **Lire un QR code** : présentez le QR code à la caméra ou choisissez une photo/capture du document.
- Avec un lecteur de QR code USB : cliquez dans la zone de recherche puis scannez, la fiche s'ouvre.
- Cliquez sur une ligne pour ouvrir la fiche, puis **PDF**, **Imprimer**, **Modifier** ou **Supprimer**.
  La modification conserve la référence. Une suppression est définitive et le numéro n'est pas réattribué.

## 4. Modèles
Menu **Modèles** :
- **Modifier** : en-tête, titre, textes fixes, rubriques et champs, signataires, emplacement du QR code, préfixe des références.
- Dans un texte, `{{code}}` est remplacé par la valeur du champ (ex. `{{date_etablissement}}`, `{{nom_beneficiaire}}`, `{{reference}}`).
- **Dupliquer** pour créer une variante sans toucher à l'original ; **Par défaut** pour le présélectionner.
- Les fiches déjà enregistrées ne sont jamais modifiées par un changement de modèle.

## 5. Sauvegarde (important)
Menu **Sauvegarde** → **Créer une sauvegarde…**, puis copiez le fichier `.sqlite` sur une **clé USB ou un disque externe**.
Faites-le régulièrement : sans copie externe, une panne, une suppression ou un vol de l'ordinateur entraîne la perte des fiches.
Pour récupérer les données (nouvel ordinateur, réinstallation) : **Restaurer une sauvegarde…**.

## 6. À savoir
Le QR code contient la référence de la fiche et permet de la retrouver dans l'application de cet ordinateur.
Il ne donne pas accès à la base de données et ne constitue pas une certification officielle du document.
