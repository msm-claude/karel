// Mock editor: highlight the Slovak program, line numbers, optional autocomplete popup.
const PROGRAM = `príkaz schody
  opakuj 3 krát
    polož
    krok
  koniec
koniec

podmienka voľná-cesta
  nie je múr
koniec

príkaz domov
  kým je voľná-cesta
    krok
  koniec
  vľavo
koniec

schody
vpravo
domov`;

const KW = ['príkaz','koniec','opakuj','krát','kým','ak','tak','inak','podmienka','je','nie'];
const CMD = ['krok','vľavo','vpravo','polož','zdvihni','označ','odznač'];
const PRED = ['múr','tehla','značka','voľno','pravda','nepravda'];

function esc(s){return s.replace(/&/g,'&amp;').replace(/</g,'&lt;')}
function hl(line){
  return line.split(/(\s+)/).map(tok=>{
    if(/^\s+$/.test(tok)||tok==='') return tok;
    if(KW.includes(tok)) return `<span class="kw">${esc(tok)}</span>`;
    if(CMD.includes(tok)) return `<span class="cmd">${esc(tok)}</span>`;
    if(PRED.includes(tok)) return `<span class="pred">${esc(tok)}</span>`;
    if(/^\d+$/.test(tok)) return `<span class="num">${tok}</span>`;
    return `<span class="id">${esc(tok)}</span>`;
  }).join('');
}
function mountEditor(el, opts={}){
  const lines = PROGRAM.split('\n');
  const active = opts.activeLine ?? 14; // 1-based, the line the run driver is on
  const cursor = opts.cursorLine ?? null;
  el.innerHTML = lines.map((l,i)=>{
    const n=i+1; const cls=[n===active?'active':'',n===cursor?'cursor':''].join(' ');
    return `<div class="ln ${cls}"><span class="n">${n}</span><span class="c">${hl(l)||'&nbsp;'}</span></div>`;
  }).join('');
  if(opts.complete){
    const d=document.createElement('div'); d.className='ac';
    d.innerHTML = opts.complete.map((it,i)=>`<div class="${i===0?'sel':''}"><b>${it[0]}</b><span>${it[1]}</span></div>`).join('');
    el.querySelector(`.ln:nth-child(${cursor})`).appendChild(d);
  }
}
document.head.insertAdjacentHTML("beforeend","<style>.ln .c{white-space:pre}</style>");
window.KarelEditor={mountEditor,PROGRAM};
