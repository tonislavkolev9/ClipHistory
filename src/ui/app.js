const kinds = [
  {id:'all',  label:'All items'},
  {id:'text', label:'Text'},
  {id:'code', label:'Code'}
];

const clips = [];

async function addClip(title, content, lang, date, time, kind) {

  const detected = detectLang(content);

  const clip = {
    t: title,
    src: content,
    lang: detected.lang,
    date: date,
    time: time,
    kind: detected.kind,
    tags: []
  };
  clips.unshift(clip);

  selected = 0;
  renderList();
  renderDetail();

  const response = await fetch("http://127.0.0.1:8000/tag", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      content: content,
      created_at: date
    })
  });

  const result = await response.json();

  clip.id = result.id;
  clip.t = result.title || title;
  clip.tags = result.tags || [];

  renderList();
  renderDetail();
}




async function loadClips() {
  try {
    const response = await fetch("http://127.0.0.1:8000/clips");
    const result = await response.json();
    result.clips.forEach(row => {
      const [datePart, timePart] = (row.created_at || '').split(' ');
      const detected = detectLang(row.content);
      clips.push({
        id: row.id,
        t: row.title,
        src: row.content,
        lang: detected.lang,
        date: row.created_at || '',
        time: timePart ? timePart.slice(0, 5) : '',
        kind: detected.kind,
        tags: row.tags || []
      });
    });
  } catch {
  }
  renderList();
  renderDetail();
}



const LANGS = {
  'C++': {
    lineComment: '//',
    preprocessor: true,
    keywords: new Set(['if','else','for','while','do','return','break','continue','switch','case','default','new','delete','try','catch','throw','namespace','using','template','typename','public','private','protected','friend','virtual','override','static','inline','explicit','operator','sizeof','this']),
    types: new Set(['int','bool','void','auto','char','double','float','long','short','unsigned','signed','class','struct','const','std','size_t','string','wchar_t']),
    literals: new Set(['true','false','nullptr','NULL'])
  },
  'Python': {
    lineComment: '#',
    keywords: new Set(['def','return','if','elif','else','for','while','in','import','from','as','class','try','except','finally','with','pass','break','continue','yield','lambda','global','nonlocal','assert','raise','del','and','or','not','is']),
    types: new Set(['int','str','float','bool','list','dict','set','tuple','object','bytes']),
    literals: new Set(['True','False','None','self'])
  },
  'SQL': {
    lineComment: '--',
    keywords: new Set(['SELECT','FROM','WHERE','ORDER','BY','GROUP','HAVING','JOIN','INNER','LEFT','RIGHT','OUTER','ON','AS','INSERT','INTO','VALUES','UPDATE','SET','DELETE','CREATE','TABLE','ALTER','DROP','PRIMARY','KEY','FOREIGN','REFERENCES','AND','OR','DESC','ASC','LIMIT','DISTINCT']),
    types: new Set(['INTEGER','TEXT','VARCHAR','BOOLEAN','REAL','BLOB','DATE','DATETIME','CURRENT_TIMESTAMP']),
    literals: new Set(['NOT','NULL','UNIQUE','DEFAULT'])
  },
  'Shell': {
    lineComment: '#',
    keywords: new Set(['if','then','else','fi','for','do','done','while','case','esac','function','export','return','local']),
    types: new Set(['pip','pip3','npm','git','cd','ls','mkdir','curl','wget','docker','python','python3','sudo','echo','cat','grep','chmod','chown']),
    literals: new Set([])
  },
  'JavaScript': {
    lineComment: '//',
    keywords: new Set(['function','return','if','else','for','while','do','switch','case','break','continue','const','let','var','class','extends','new','try','catch','finally','throw','typeof','instanceof','in','of','yield','async','await','import','export','from','default']),
    types: new Set(['console','Math','JSON','Array','Object','String','Number','Boolean','Promise']),
    literals: new Set(['true','false','null','undefined','this'])
  },

  'Code': {
    lineComment: '//',
    keywords: new Set([]),
    types: new Set([]),
    literals: new Set([])
  }
};


function detectLang(content){
  const text = (content || '').trim();
  if (!text) return { kind:'text', lang:'Text' };

  if (/\b(SELECT\s+[\s\S]+?\s+FROM|INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM|CREATE\s+TABLE|ALTER\s+TABLE)\b/i.test(text)){
    return { kind:'code', lang:'SQL' };
  }
  if (/#include\s*[<"]|\bstd::|::\w+\s*\(|\bint\s+main\s*\(|\bclass\s+\w+\s*\{|\bpublic:|\bprivate:/.test(text)){
    return { kind:'code', lang:'C++' };
  }
  if (/^\s*def\s+\w+\s*\(.*\)\s*:|^\s*(import|from)\s+\w+|^\s*if\s+__name__\s*==/m.test(text)){
    return { kind:'code', lang:'Python' };
  }
  if (/^\s*(\$\s+|sudo\s|npm\s|pip\d?\s|git\s|cd\s|curl\s|wget\s|docker\s|python3?\s|#!\/(bin|usr))/m.test(text)){
    return { kind:'code', lang:'Shell' };
  }
  if (/\b(function\s*\w*\s*\(|=>|\bconst\s+\w+\s*=|\blet\s+\w+\s*=|console\.log\(|\bexport\s+(default\s+)?|\bimport\s+.*\bfrom\b)/.test(text)){
    return { kind:'code', lang:'JavaScript' };
  }

  const lines = text.split('\n');
  const codeyLines = lines.filter(l => /[{}();]\s*$/.test(l) || /^\s*(function|const|let|var|=>|<\/?\w+[ >])/.test(l)).length;
  if (lines.length > 1 && codeyLines / lines.length > 0.3){
    return { kind:'code', lang:'Code' };
  }

  return { kind:'text', lang:'Text' };
}

const esc = s => s.replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));


function tokenizeLine(line, cfg){
  const out = [];
  const n = line.length;
  let i = 0;


  if (cfg.preprocessor){
    const m = /^(\s*)(#\w+)(\s*)(<[^>]*>|"[^"]*")?/.exec(line);
    if (m){
      if (m[1]) out.push({cls:null, text:m[1]});
      out.push({cls:'p', text:m[2]});
      if (m[3]) out.push({cls:null, text:m[3]});
      if (m[4]) out.push({cls:'s', text:m[4]});
      i = m[0].length;
    }
  }

  while (i < n){
    const ch = line[i];

    if (cfg.lineComment && line.startsWith(cfg.lineComment, i)){
      out.push({cls:'c', text: line.slice(i)});
      break;
    }

    if (ch === '"' || ch === "'"){
      const quote = ch;
      let j = i + 1;
      while (j < n && line[j] !== quote){
        j += (line[j] === '\\' && j + 1 < n) ? 2 : 1;
      }
      if (j < n) j += 1;
      out.push({cls:'s', text: line.slice(i, j)});
      i = j;
      continue;
    }

    if (/[0-9]/.test(ch) && !(i > 0 && /[A-Za-z_]/.test(line[i - 1]))){
      let j = i;
      while (j < n && /[0-9.]/.test(line[j])) j++;
      out.push({cls:'n', text: line.slice(i, j)});
      i = j;
      continue;
    }

    if (/[A-Za-z_]/.test(ch)){
      let j = i;
      while (j < n && /[A-Za-z0-9_]/.test(line[j])) j++;
      const word = line.slice(i, j);
      let cls = null;
      if (cfg.keywords.has(word) || cfg.literals.has(word)) cls = 'k';
      else if (cfg.types.has(word)) cls = 't';
      else if (line[j] === '(') cls = 'f';
      out.push({cls, text: word});
      i = j;
      continue;
    }


    let j = i + 1;
    while (
      j < n &&
      !/[A-Za-z_0-9"']/.test(line[j]) &&
      !(cfg.lineComment && line.startsWith(cfg.lineComment, j))
    ) j++;
    out.push({cls:null, text: line.slice(i, j)});
    i = j;
  }

  return out;
}

function highlight(line, lang){
  const cfg = LANGS[lang];
  if (!cfg) return esc(line);
  return tokenizeLine(line, cfg)
    .map(t => t.cls ? `<span class="${t.cls}">${esc(t.text)}</span>` : esc(t.text))
    .join('');
}

const listEl = document.getElementById('list');
const detailEl = document.getElementById('detail');
let selected = 0;
let filter = '';
let kind = 'all';
let editing = false;

function nav(el, items, active, onPick){
  el.innerHTML = '';
  items.forEach(it => {
    const b = document.createElement('button');
    b.type = 'button';
    if (it.id) b.setAttribute('aria-current', String(it.id === active));
    b.textContent = it.label;
    b.onclick = () => onPick(it);
    el.appendChild(b);
  });
}

function visible(){
  const q = filter.trim().toLowerCase();
  let rows = clips
    .map((c,i) => ({...c, i}))
    .filter(c => kind === 'all' || c.kind === kind);

  if (!q) return rows;

  const substringMatches = rows.filter(c => c.t.toLowerCase().includes(q) || c.src.toLowerCase().includes(q));
  if (substringMatches.length) return substringMatches;

 
  if (semanticIds.length){
    const order = new Map(semanticIds.map((id, idx) => [id, idx]));
    return rows.filter(c => order.has(c.i)).sort((a,b) => order.get(a.i) - order.get(b.i));
  }
  return [];
}

let semanticIds = [];
let semanticTimer = null;

async function semanticSearch(query){
  if (!query.trim() || !clips.length) { semanticIds = []; return; }
  try {
    const response = await fetch("http://127.0.0.1:8000/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query,
        items: clips.map((c, i) => ({ id: i, text: c.t + " " + c.src }))
      })
    });
    const result = await response.json();
    semanticIds = result.results.filter(r => r.score > 0.5).map(r => r.id);
  } catch {
    semanticIds = [];
  }
  renderList();
}

const KIND_ICON = {
  code: '<svg width="14" height="14" viewBox="0 0 15 15" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M5.2 3.8L1.6 7.5l3.6 3.7M9.8 3.8l3.6 3.7-3.6 3.7"/></svg>',
  text: '<svg width="14" height="14" viewBox="0 0 15 15" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M3 2.8h9M3 6h9M3 9.2h6"/></svg>'
};

function renderList(){
  const rows = visible();
  listEl.innerHTML = '';
  if (!rows.length){
    return;
  }
  rows.forEach(c => {
    const lines = c.src.split('\n').length;
    const tagsHtml = (c.tags || []).slice(0, 3)
      .map(t => `<span class="tag-pill">${esc(t)}</span>`).join('');
    const row = document.createElement('div');
    row.className = 'clip';
    row.setAttribute('role','option');
    row.setAttribute('aria-selected', String(c.i === selected));
    row.innerHTML = `
      <button type="button" class="clip-main">
        <span class="clip-top"><span class="clip-icon">${KIND_ICON[c.kind] || KIND_ICON.text}</span><span class="clip-title">${esc(c.t)}</span><span class="clip-time">${c.time}</span></span>
        <span class="clip-meta">${c.lang} &nbsp;·&nbsp; ${lines} ${lines === 1 ? 'line' : 'lines'}</span>
        ${tagsHtml ? `<span class="clip-tags">${tagsHtml}</span>` : ''}
      </button>
      <button type="button" class="clip-delete" title="Delete clip" aria-label="Delete clip">
        <svg width="14" height="14" viewBox="0 0 15 15" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M2.6 4.1h9.8"/><path d="M5.7 4.1V2.3h3.6v1.8"/><path d="M4 4.1l.6 8.3a1 1 0 00.99.9h4.82a1 1 0 00.99-.9l.6-8.3"/></svg>
      </button>`;
    row.querySelector('.clip-main').onclick = () => { selected = c.i; editing = false; renderList(); renderDetail(); };
    row.querySelector('.clip-delete').onclick = (e) => { e.stopPropagation(); deleteClip(c.i); };
    listEl.appendChild(row);
  });
}



async function deleteClip(index){
  const c = clips[index];
  if (!c) return;

  clips.splice(index, 1);
  const rows = visible();
  selected = rows.length ? rows[0].i : 0;
  editing = false;
  renderList();
  renderDetail();

  if (c.id != null){
    try {
      await fetch(`http://127.0.0.1:8000/clips/${c.id}`, { method: 'DELETE' });
    } catch {
    }
  }
}

function renderDetail(){
  const c = clips[selected];
  if (!c){
    detailEl.innerHTML = '';
    return;
  }
  const rows = c.src.split('\n').map((l,i) =>
    `<tr><td class="ln">${i+1}</td><td class="src">${highlight(l, c.lang) || '&nbsp;'}</td></tr>`).join('');
  const body = editing
    ? `<div class="code editing"><textarea id="editor" class="editor" spellcheck="false">${esc(c.src)}</textarea></div>`
    : `<div class="code"><table>${rows}</table></div>`;
  const detailTagsHtml = (c.tags || [])
    .map(t => `<span class="tag-pill">${esc(t)}</span>`).join('');
    detailEl.innerHTML = `
    <header class="detail-head">
      <div style="min-width:0">
        <h1 class="detail-title">${esc(c.t)}</h1>
        <p class="detail-date" style="margin:0">${(c.date || '').slice(0, 16)}</p>
        ${detailTagsHtml ? `<div class="detail-tags">${detailTagsHtml}</div>` : ''}
      </div>
      <span class="lang">${c.lang}</span>
    </header>
    ${body}
    <footer class="actions">
      <button class="btn primary" id="copy"><svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" stroke-width="1.2"><rect x="4.4" y="4.4" width="9" height="9"/><path d="M10.6 4.4V1.6h-9v9h2.8"/></svg><span id="copy-label">Copy</span></button>
      <button class="btn" id="edit"><svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M10.4 1.9l2.7 2.7-8 8H2.4v-2.7z"/></svg><span>${editing ? 'Save' : 'Edit'}</span></button>
      ${editing
        ? `<button class="btn" id="cancel-edit">Cancel</button>`
        : `<button class="btn danger" id="delete" aria-label="Delete clip"><svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M2.6 4.1h9.8"/><path d="M5.7 4.1V2.3h3.6v1.8"/><path d="M4 4.1l.6 8.3a1 1 0 00.99.9h4.82a1 1 0 00.99-.9l.6-8.3"/></svg><span>Delete</span></button>`}
    </footer>`;
  detailEl.querySelector('#copy').onclick = async (e) => {
    const label = detailEl.querySelector('#copy-label');
    window.chrome.webview.postMessage("internal-copy");
    try { await navigator.clipboard.writeText(clips[selected].src); label.textContent = 'Copied'; }
    catch { label.textContent = 'Copy blocked'; }
    setTimeout(() => { label.textContent = 'Copy'; }, 1400);
  };
  detailEl.querySelector('#edit').onclick = async () => {
    if (editing){
      const newSrc = detailEl.querySelector('#editor').value;
      const detected = detectLang(newSrc);
      clips[selected].src = newSrc;
      clips[selected].lang = detected.lang;
      clips[selected].kind = detected.kind;
      editing = false;
      renderList();
      renderDetail();


      if (c.id != null){
        try {
          await fetch(`http://127.0.0.1:8000/clips/${c.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: newSrc })
          });
        } catch {
        }
      }
    } else {
      editing = true;
      renderDetail();
      detailEl.querySelector('#editor').focus();
    }
  };
  if (editing){
    detailEl.querySelector('#cancel-edit').onclick = () => { editing = false; renderDetail(); };
  } else {
    detailEl.querySelector('#delete').onclick = () => {
      if (!window.confirm(`Delete "${c.t}"? This can't be undone.`)) return;
      deleteClip(selected);
    };
  }
}

function pickKind(it){
  kind = it.id;
  nav(document.getElementById('kinds'), kinds, kind, pickKind);
  const rows = visible();
  if (rows.length && !rows.some(r => r.i === selected)) { selected = rows[0].i; editing = false; renderDetail(); }
  renderList();
}
nav(document.getElementById('kinds'), kinds, kind, pickKind);

const q = document.getElementById('q');
q.addEventListener('input', () => {
  filter = q.value;
  renderList();
  clearTimeout(semanticTimer);
  semanticTimer = setTimeout(() => semanticSearch(filter), 400);
});
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k'){ e.preventDefault(); q.focus(); q.select(); }
  if (e.key === 'Delete' && !editing){
    const tag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
    if (tag === 'input' || tag === 'textarea') return;
    if (clips[selected]){ e.preventDefault(); deleteClip(selected); }
  }
});

renderList();
renderDetail();
loadClips();

document.querySelector('[title="Minimise"]').onclick = () =>
    window.chrome.webview.postMessage("minimize");

document.querySelector('[title="Maximise"]').onclick = () =>
    window.chrome.webview.postMessage("maximize");

document.querySelector('.close').onclick = () =>
    window.chrome.webview.postMessage("close");


const captureToggle = document.getElementById('captureToggle');
captureToggle.onclick = () => {
    const capturing = captureToggle.getAttribute('aria-checked') !== 'true';
    captureToggle.setAttribute('aria-checked', String(capturing));
    captureToggle.querySelector('.capture-label').textContent = capturing ? 'Capturing' : 'Paused';
    captureToggle.title = capturing ? 'Pause clipboard capture' : 'Resume clipboard capture';
    window.chrome.webview.postMessage(capturing ? 'capture-on' : 'capture-off');
};


document.querySelector('.titlebar').addEventListener('mousedown', (e) => {
    if (e.target.closest('.wctl') || e.target.closest('.capture-toggle')) return;
    window.chrome.webview.postMessage("drag");
});