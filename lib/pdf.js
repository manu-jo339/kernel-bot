// Kernel Bot — génération de PDF (factures, devis, CV, lettres, images en PDF) avec pdfkit, entièrement en local
const PDFDocument = require('pdfkit');

// pdfkit (polices standard) ne connaît pas l'espace insécable fine de toLocaleString('fr-FR')
const nettoyer = (t) => String(t ?? '').replace(/[  ]/g, ' ').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/…/g, '...');
const montant = (n) => nettoyer(Number(n).toLocaleString('fr-FR', { maximumFractionDigits: 2 }));

function creer(fn, options = {}) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50, ...options });
    const morceaux = [];
    doc.on('data', (c) => morceaux.push(c));
    doc.on('end', () => resolve(Buffer.concat(morceaux)));
    doc.on('error', reject);
    try {
      fn(doc);
      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}

const BLEU = '#1f3a5f';
const GRIS = '#666666';

// type : 'FACTURE' | 'DEVIS'
function facture({ type = 'FACTURE', numero, date, entreprise = {}, client, lignes, devise = 'FCFA', note }) {
  return creer((doc) => {
    const L = 50, R = 545;
    doc.fillColor(BLEU).font('Helvetica-Bold').fontSize(20).text(nettoyer(entreprise.nom || 'Mon entreprise'), L, 50);
    doc.fillColor(GRIS).font('Helvetica').fontSize(9);
    for (const l of [entreprise.adresse, entreprise.tel && 'Tél : ' + entreprise.tel, entreprise.email, entreprise.nif && 'NIF : ' + entreprise.nif]) if (l) doc.text(nettoyer(l));
    doc.fillColor(BLEU).font('Helvetica-Bold').fontSize(24).text(`${type} N° ${numero}`, L, 50, { width: R - L, align: 'right' });
    doc.fillColor(GRIS).font('Helvetica').fontSize(10).text(`Date : ${nettoyer(date)}`, L, 82, { width: R - L, align: 'right' });

    doc.moveDown(3);
    let y = 150;
    doc.fillColor('#000').font('Helvetica-Bold').fontSize(10).text('Facturé à' + (type === 'DEVIS' ? ' (devis pour)' : ''), L, y).replace;
    doc.font('Helvetica').fontSize(12).text(nettoyer(client || '—'), L, y + 14);
    y = 205;
    // En-tête du tableau
    doc.rect(L, y, R - L, 22).fill(BLEU);
    doc.fillColor('#fff').font('Helvetica-Bold').fontSize(10);
    doc.text('Désignation', L + 8, y + 6, { width: 230 });
    doc.text('Qté', L + 245, y + 6, { width: 40, align: 'right' });
    doc.text(`Prix unitaire`, L + 290, y + 6, { width: 90, align: 'right' });
    doc.text(`Montant`, L + 385, y + 6, { width: 100, align: 'right' });
    y += 22;
    let total = 0;
    doc.font('Helvetica').fontSize(10);
    lignes.forEach((l, i) => {
      if (y > 740) {
        doc.addPage();
        y = 50;
      }
      const m = l.qte * l.prix;
      total += m;
      if (i % 2 === 0) doc.rect(L, y, R - L, 20).fill('#f1f4f8');
      doc.fillColor('#000');
      doc.text(nettoyer(l.nom), L + 8, y + 5, { width: 230 });
      doc.text(String(l.qte), L + 245, y + 5, { width: 40, align: 'right' });
      doc.text(montant(l.prix), L + 290, y + 5, { width: 90, align: 'right' });
      doc.text(montant(m), L + 385, y + 5, { width: 100, align: 'right' });
      y += 20;
    });
    y += 10;
    doc.moveTo(L + 290, y).lineTo(R, y).strokeColor(BLEU).stroke();
    doc.font('Helvetica-Bold').fontSize(13).fillColor(BLEU).text(`TOTAL : ${montant(total)} ${devise}`, L, y + 8, { width: R - L, align: 'right' });
    if (note) doc.moveDown(2).font('Helvetica').fontSize(10).fillColor(GRIS).text(nettoyer(note), L, y + 50, { width: R - L });
    doc.font('Helvetica-Oblique').fontSize(8).fillColor(GRIS).text('Document généré par Kernel Bot — MWENOBANGUE Labs', L, 800, { width: R - L, align: 'center' });
  });
}

// CV : { nom, titre, tel, email, adresse, profil, sections: [{titre, lignes:[...]}] }
function cv(d) {
  return creer((doc) => {
    const L = 50, R = 545;
    doc.rect(0, 0, 595, 120).fill(BLEU);
    doc.fillColor('#fff').font('Helvetica-Bold').fontSize(26).text(nettoyer(d.nom || ''), L, 38, { width: R - L });
    if (d.titre) doc.font('Helvetica').fontSize(13).text(nettoyer(d.titre), L, 74, { width: R - L });
    const contact = [d.tel, d.email, d.adresse].filter(Boolean).map(nettoyer).join('   |   ');
    doc.font('Helvetica').fontSize(9).text(contact, L, 98, { width: R - L });
    doc.fillColor('#000');
    doc.y = 145;
    const titre = (t) => {
      doc.moveDown(0.8).font('Helvetica-Bold').fontSize(12).fillColor(BLEU).text(nettoyer(t).toUpperCase(), L, doc.y);
      doc.moveTo(L, doc.y + 2).lineTo(R, doc.y + 2).strokeColor(BLEU).lineWidth(0.8).stroke();
      doc.moveDown(0.5).fillColor('#000').font('Helvetica').fontSize(10.5);
    };
    if (d.profil) {
      titre('Profil');
      doc.text(nettoyer(d.profil), L, doc.y, { width: R - L, align: 'justify' });
    }
    for (const s of d.sections || []) {
      if (!s.lignes.length) continue;
      titre(s.titre);
      for (const l of s.lignes) doc.text('•  ' + nettoyer(l), L + 6, doc.y, { width: R - L - 6 }).moveDown(0.25);
    }
  });
}

// Lettre : { expediteur:[lignes], destinataire:[lignes], lieuDate, objet, corps }
function lettre(d) {
  return creer((doc) => {
    const L = 60, R = 535;
    doc.font('Helvetica').fontSize(11).fillColor('#000');
    for (const l of d.expediteur || []) doc.text(nettoyer(l), L, doc.y, { width: 250 });
    doc.moveDown(1);
    const y0 = doc.y;
    for (const l of d.destinataire || []) doc.text(nettoyer(l), 320, doc.y, { width: R - 320 });
    doc.moveDown(1.5);
    if (d.lieuDate) doc.text(nettoyer(d.lieuDate), L, doc.y, { width: R - L, align: 'right' });
    doc.moveDown(1.5);
    if (d.objet) doc.font('Helvetica-Bold').text('Objet : ' + nettoyer(d.objet), L, doc.y, { width: R - L }).font('Helvetica').moveDown(1.2);
    doc.text(nettoyer(d.corps || ''), L, doc.y, { width: R - L, align: 'justify', lineGap: 3 });
    void y0;
  }, { margin: 60 });
}

// Images (JPEG/PNG) -> un PDF, une image par page
function images(buffers) {
  return creer((doc) => {
    buffers.forEach((b, i) => {
      if (i) doc.addPage();
      doc.image(b, 20, 20, { fit: [555, 802], align: 'center', valign: 'center' });
    });
  }, { margin: 0 });
}

module.exports = { facture, cv, lettre, images, montant, nettoyer };
