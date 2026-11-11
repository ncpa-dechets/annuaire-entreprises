const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {test} = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../js/themes/recrutement.js'), 'utf8')
  .replace(/^import .*;\r?\n/m, '').replace('export function blocRecrutement', 'function blocRecrutement');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
const s1 = '03925057600012', s2 = '56210980100075';
const entreprises = [
  {siret:s1, nom:'École <test>', com:'Cabourg', cc:'14117', divl:'Enseignement', nafl:'Enseignement', lat:49, lon:-.1},
  {siret:s2, nom:'Usine témoin', com:'Dives-sur-Mer', cc:'14225', divl:'Industrie', nafl:'Industrie', lat:null, lon:null}
];
const donnees = {date:'2026-11-11', interroges:3, etablissements:[
  {siret:s1, indice:0, fort_potentiel:true},
  {siret:s2, indice:99, fort_potentiel:false},
  {siret:'99999999999999', indice:100, fort_potentiel:true}
]};

function render(data = donnees, annuaire = entreprises){
  const elements = new Map(), exports = [];
  function element(id){
    if (!elements.has(id)){
      let html = '';
      elements.set(id, {set innerHTML(value){
        html = value;
        for (const match of value.matchAll(/\bid="([^"]+)"/g)) element(match[1]);
      }, get innerHTML(){return html;}});
    }
    return elements.get(id);
  }
  const h = element('host');
  const context = vm.createContext({h, bonneBoite:data, parSiret:new Map(annuaire.map(e => [e.siret,e])),
    $:id=>elements.get(id), esc, norm:s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase(),
    nb:n=>Number(n).toLocaleString('fr-FR'), dateFr:s=>s.split('-').reverse().join('/'), debounce:f=>f,
    jour:()=> '2026-11-11', feuille:rows=>{exports.push(rows);return rows;},
    XLSX:{utils:{book_new:()=>({}),book_append_sheet:()=>{}},writeFile:()=>{}}});
  vm.runInContext(source + '\nblocRecrutement(h);', context);
  return {h, get:id=>elements.get(id), exports};
}

test('absence de fichier distincte d’une consultation sans résultat', () => {
  assert.match(render(null).h.innerHTML, /pas encore disponibles/);
  assert.match(render({...donnees, etablissements:[]}).h.innerHTML, /Aucun renseignement retourné/);
});

test('signal officiel prioritaire, indice zéro conservé, SIRET absent exclu', () => {
  const f=render(), html=f.get('bb-resultats').innerHTML;
  assert.match(html, /École &lt;test&gt;/);
  assert.match(html, /class="num">0<\/td>/);
  assert.doesNotMatch(html, /Usine témoin|99999999999999/);
  assert.match(html, /data-voir="03925057600012"/);
  assert.match(f.h.innerHTML, /n'est ni un pourcentage de probabilité/);
});

test('filtre fort potentiel désactivable et absence de position explicite', () => {
  const f=render();
  f.get('bb-forts').onchange({target:{checked:false}});
  assert.match(f.get('bb-resultats').innerHTML, /Usine témoin/);
  assert.match(f.get('bb-resultats').innerHTML, /Sans position/);
  assert.doesNotMatch(f.get('bb-resultats').innerHTML, /data-voir="56210980100075"/);
});

test('commune, activité et recherche filtrent aussi l’export', () => {
  const f=render();
  f.get('bb-forts').onchange({target:{checked:false}});
  f.get('bb-commune').onchange({target:{value:'Dives-sur-Mer'}});
  f.get('bb-secteur').onchange({target:{value:'Industrie'}});
  f.get('bb-recherche').oninput({target:{value:'temoin'}});
  f.get('bb-export').onclick();
  assert.equal(f.exports[0].length, 1);
  assert.equal(f.exports[0][0].siret, s2);
  assert.equal(f.exports[0][0].signal, 'Autre niveau');
  assert.equal(f.exports[0][0].date, '2026-11-11');
  assert.match(f.exports[0][0].source, /France Travail/);
  f.get('bb-recherche').oninput({target:{value:'introuvable'}});
  assert.equal(f.get('bb-export').disabled, true);
});

test('indice inconnu reste non renseigné et les libellés sont échappés', () => {
  const f=render({...donnees, etablissements:[{siret:s1, indice:null, fort_potentiel:true}]});
  assert.match(f.get('bb-resultats').innerHTML, /Non renseigné/);
  assert.doesNotMatch(f.get('bb-resultats').innerHTML, /<test>/);
});

test('les résultats au-delà des 200 premiers restent accessibles', () => {
  const annuaire = Array.from({length:225}, (_,i)=>({...entreprises[0],siret:String(10000000000000+i),nom:'Employeur '+i}));
  const f=render({...donnees,interroges:225,etablissements:annuaire.map(e=>({siret:e.siret,indice:70,fort_potentiel:true}))},annuaire);
  assert.equal((f.get('bb-resultats').innerHTML.match(/data-voir=/g)||[]).length,200);
  f.get('bb-suite').onclick();
  assert.equal((f.get('bb-resultats').innerHTML.match(/data-voir=/g)||[]).length,225);
});
