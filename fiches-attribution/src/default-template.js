// Modèle initial : fiche d'attribution de parcelle de GBAFFO
// (repris du document Word transmis par le client, mentions à valider par lui).
// Fichier partagé entre le processus principal (Node) et l'interface (navigateur).
(function (root) {
  const GBAFFO_TEMPLATE = {
    name: "Fiche d'attribution de parcelle – GBAFFO",
    refPrefix: 'GBF',
    nameField: 'nom_beneficiaire',
    dateField: 'date_etablissement',
    qrPosition: 'top-right',
    header: [
      'REPUBLIQUE DU BENIN',
      'DEPARTEMENT DES COLLINES -COMMUNE DE DASSA-ZOUME',
      'ARRONDISSEMENT DE GBAFFO – VILLAGE DE GBAFFO',
    ],
    title: 'FICHE D’ATTRIBUTION DE PARCELLE DE TERRAIN',
    sections: [
      {
        type: 'fields',
        title: 'Établissement de la fiche',
        hidden: true,
        numbered: false,
        fields: [
          { key: 'date_etablissement', label: 'Date d’établissement', type: 'date', required: true, defaultToday: true },
        ],
      },
      {
        type: 'text',
        content:
          'Nous soussignés, HOUNWANOU Placide, GNONHOSSOU Towanou Cyriaque, Sa Majesté Fifakan MEGBE II à l’état civil AGOSSADOU Houinsou Cosme, représentants respectifs des familles DEDOKOTON-AGOSSADOU & AGOSSOUHOUAHOUA GNONHOSOU DADE, agissant en qualité de liquidateurs de succession de l’immeuble indivis de GBAFFO, en vertu du jugement n° 57/CS ODLSL/23 du 07 Septembre 2023, Rôle Général DASS/2023/RG/0389 attribuons, une parcelle de terrain située dans le village de GBAFFO, Arrondissement de GBAFFO, commune de DASSA-ZOUME, au bénéficiaire désigné ci-après :',
      },
      {
        type: 'fields',
        title: 'IDENTIFICATION DU BENEFICIAIRE',
        numbered: true,
        fields: [
          { key: 'nom_beneficiaire', label: 'Nom et Prénom (s)', type: 'text', required: true, uppercase: true },
          {
            key: 'naissance', label: 'Date et Lieu de Naissance', type: 'double', separator: ' à ',
            parts: [{ label: 'Date de naissance', type: 'date' }, { label: 'Lieu de naissance', type: 'text' }],
          },
          {
            key: 'profession_tel', label: 'Profession & Téléphone', type: 'double', separator: ', Tél. ',
            parts: [{ label: 'Profession', type: 'text' }, { label: 'Téléphone', type: 'text' }],
          },
          { key: 'piece_identite', label: 'Pièces d’Identité (CIP)', type: 'text' },
        ],
      },
      {
        type: 'fields',
        title: 'CARACTERISTIQUES GEOMETRIQUE DE LA PARCELLE',
        numbered: true,
        fields: [
          { key: 'forme', label: 'Forme', type: 'text', uppercase: true },
          { key: 'superficie', label: 'Superficie Totale', type: 'number', suffix: 'm²' },
          { key: 'numero_lot', label: 'Numéro de Lot / Parcelle (s)', type: 'text' },
          { key: 'limitrophes', label: 'Limitrophes & Dimensions', type: 'subtitle' },
          { key: 'limite_nord', label: 'Au Nord par', type: 'text', indent: true },
          { key: 'limite_sud', label: 'Au Sud par', type: 'text', indent: true },
          { key: 'limite_est', label: 'A l’Est par', type: 'text', indent: true },
          { key: 'limite_ouest', label: 'A l’Ouest par', type: 'text', indent: true },
        ],
      },
      {
        type: 'text',
        content:
          'En foi de quoi, la présente fiche d’attribution lui est délivrée pour servir et valoir ce que de droit, et pour engager les formalités de constatation officielle de droits fonciers conformément aux lois en vigueur.',
      },
      {
        type: 'signatures',
        title: 'SIGNATURES DES PARTIES',
        numbered: true,
        placeLine: 'Fait à GBAFFO le, {{date_etablissement}}',
        left: {
          title: 'Les attribuants',
          numbered: true,
          signers: [
            { name: 'HOUNWANOU PLACIDE', note: '' },
            { name: 'GNONHOSSOU TOWANOU CYRIAQUE', note: '' },
            { name: 'Sa Majesté FIFAKAN MENGBE II', note: '(Chef Supérieur du village de GBAFFO)' },
          ],
        },
        right: {
          title: 'Le bénéficiaire',
          numbered: false,
          signers: [{ name: '{{nom_beneficiaire}}', note: '' }],
        },
      },
    ],
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = { GBAFFO_TEMPLATE };
  else root.GBAFFO_TEMPLATE = GBAFFO_TEMPLATE;
})(typeof window !== 'undefined' ? window : globalThis);
