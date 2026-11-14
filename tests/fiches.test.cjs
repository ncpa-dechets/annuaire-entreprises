const assert = require('node:assert/strict');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {test} = require('node:test');

const outils = () => import(pathToFileURL(path.join(__dirname, '../js/fiches-outils.js')).href);

test('lireAdresse reconnaît les types et nettoie les paramètres', async () => {
  const {lireAdresse} = await outils();
  assert.deepEqual(lireAdresse([]), {type:'', ids:[], tronque:false});
  assert.deepEqual(lireAdresse(['inconnu', '14117']), {type:'', ids:[], tronque:false});
  assert.deepEqual(lireAdresse(['territoire', 'nimporte']).ids, []);
  assert.deepEqual(lireAdresse(['commune', '14117,14225,14117,abc']).ids, ['14117', '14225']);
  assert.deepEqual(lireAdresse(['commune', 'toutes']).ids, ['toutes']);
  assert.deepEqual(lireAdresse(['commune', '2A004']).ids, ['2A004']);
  assert.deepEqual(lireAdresse(['entreprise', '552 100 554,55210055400013,123']).ids, ['552100554']);
});

test('lireAdresse limite un dossier à 30 entreprises', async () => {
  const {lireAdresse, MAX_ENTREPRISES} = await outils();
  const sirens = Array.from({length:35}, (_, i) => String(100000000 + i));
  const r = lireAdresse(['entreprise', sirens.join(',')]);
  assert.equal(MAX_ENTREPRISES, 30);
  assert.equal(r.ids.length, 30);
  assert.equal(r.tronque, true);
  assert.equal(lireAdresse(['entreprise', sirens.slice(0, 3).join(',')]).tronque, false);
});

test('filtrerListe applique le réglage de la liste', async () => {
  const {filtrerListe} = await outils();
  const etabs = [
    {nom:'A', emp:'Oui', emin:null, tstr:'Société commerciale'},
    {nom:'B', emp:'Non', emin:3, tstr:'Association'},
    {nom:'C', emp:'Non', emin:0, tstr:'Société civile immobilière (SCI)'},
    {nom:'D', emp:'Non', emin:null, tstr:'Société commerciale'}];
  const noms = l => l.map(e => e.nom);
  assert.deepEqual(noms(filtrerListe(etabs, 'aucune')), []);
  assert.deepEqual(noms(filtrerListe(etabs, 'emp')), ['A', 'B']);
  assert.deepEqual(noms(filtrerListe(etabs, 'sans_sci')), ['A', 'B', 'D']);
  assert.deepEqual(noms(filtrerListe(etabs, 'tous')), ['A', 'B', 'C', 'D']);
  assert.notEqual(filtrerListe(etabs, 'tous'), etabs);   // une copie, pas la liste d'origine
});

test('grouperParSecteur range les secteurs et les établissements', async () => {
  const {grouperParSecteur} = await outils();
  const g = grouperParSecteur([
    {nom:'Zèbre', sec:'I', emin:null}, {nom:'Hôtel', sec:'I', emin:10}, {nom:'Café', sec:'I', emin:10},
    {nom:'Garage', sec:'G', emin:3}, {nom:'Sans code', sec:'', emin:null}]);
  assert.deepEqual(g.map(([s, l]) => [s, l.map(e => e.nom)]),
    [['I', ['Café', 'Hôtel', 'Zèbre']], ['G', ['Garage']], ['Z', ['Sans code']]]);
});

test('nomFichier donne un nom sans accent ni espace', async () => {
  const {nomFichier} = await outils();
  assert.equal(nomFichier('Portrait économique de Dives-sur-Mer', '2026-11-14'), 'Portrait-economique-de-Dives-sur-Mer_2026-11-14');
  assert.equal(nomFichier('Hébergement et restauration – Houlgate', '', '2026-11-14'), 'Hebergement-et-restauration-Houlgate_2026-11-14');
});
