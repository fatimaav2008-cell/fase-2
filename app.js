/* ================================================================
   MATHTOOLS — app.js
   Contiene:
     1. Gestión de secciones / navegación
     2. Estimación de rutas (Dijkstra modificado para más corta/larga)
     3. Cálculo de MCM y MCD (Euclides + Factores primos)
   ================================================================ */

/* ----------------------------------------------------------------
   ESTADO GLOBAL
   ---------------------------------------------------------------- */
let currentSection  = 'routes';     // 'routes' | 'mcm'
let routeType       = 'shortest';   // 'shortest' | 'longest'
let calcMethod      = 'euclides';   // 'euclides' | 'factores'
let nodeCount       = 0;

/* ================================================================
   NAVEGACIÓN
   ================================================================ */
function showSection(name) {
  // Ocultar todas las secciones
  document.querySelectorAll('.section').forEach(s => {
    s.classList.remove('active');
    s.hidden = true;
  });

  // Desactivar todos los botones de nav
  document.querySelectorAll('.nav-btn').forEach(b => {
    b.classList.remove('active');
    b.setAttribute('aria-selected', 'false');
  });

  // Activar la sección pedida
  const section = document.getElementById('section-' + name);
  if (section) {
    section.classList.add('active');
    section.hidden = false;
  }

  const navBtn = document.getElementById('nav-' + name);
  if (navBtn) {
    navBtn.classList.add('active');
    navBtn.setAttribute('aria-selected', 'true');
  }

  currentSection = name;
}

/* ================================================================
   SECCIÓN 1 — ESTIMACIÓN DE RUTAS
   ================================================================ */

/* --- Tipo de ruta --- */
function setRouteType(type) {
  routeType = type;
  document.getElementById('route-shortest').classList.toggle('active', type === 'shortest');
  document.getElementById('route-longest').classList.toggle('active',  type === 'longest');
}

/* --- Generar la tabla de la matriz --- */
function generateMatrix() {
  const input = document.getElementById('node-count');
  const n = parseInt(input.value, 10);

  if (isNaN(n) || n < 2 || n > 10) {
    alert('El número de nodos debe estar entre 2 y 10.');
    return;
  }

  nodeCount = n;

  // Construir la tabla
  const container = document.getElementById('matrix-container');
  let html = '<table class="matrix-table" id="adj-matrix" aria-label="Matriz de adyacencia">';

  // Encabezados de columna
  html += '<thead><tr><th></th>';
  for (let j = 0; j < n; j++) {
    html += `<th>${getNodeLabel(j)}</th>`;
  }
  html += '</tr></thead><tbody>';

  // Filas
  for (let i = 0; i < n; i++) {
    html += `<tr><th>${getNodeLabel(i)}</th>`;
    for (let j = 0; j < n; j++) {
      if (i === j) {
        // Diagonal: no se conecta a sí mismo
        html += `<td><input type="number" class="matrix-input diagonal"
                    id="cell-${i}-${j}" value="0" disabled
                    aria-label="Nodo ${getNodeLabel(i)} a ${getNodeLabel(j)}" /></td>`;
      } else {
        html += `<td><input type="number" class="matrix-input"
                    id="cell-${i}-${j}" min="0" placeholder="∞"
                    aria-label="Distancia de ${getNodeLabel(i)} a ${getNodeLabel(j)}" /></td>`;
      }
    }
    html += '</tr>';
  }

  html += '</tbody></table>';
  container.innerHTML = html;

  // Rellenar los selectores de origen / destino
  populateNodeSelectors(n);

  // Limpiar resultado anterior
  document.getElementById('route-result').classList.add('hidden');
}

function getNodeLabel(index) {
  return String.fromCharCode(65 + index); // A, B, C …
}

function populateNodeSelectors(n) {
  const originSel = document.getElementById('origin-node');
  const destSel   = document.getElementById('dest-node');
  originSel.innerHTML = '';
  destSel.innerHTML   = '';

  for (let i = 0; i < n; i++) {
    const optO = document.createElement('option');
    optO.value = i;
    optO.textContent = getNodeLabel(i);
    originSel.appendChild(optO);

    const optD = document.createElement('option');
    optD.value = i;
    optD.textContent = getNodeLabel(i);
    destSel.appendChild(optD);
  }

  // Destino distinto al origen por defecto
  if (n > 1) destSel.value = 1;
}

/* --- Rellenar con datos de ejemplo --- */
function fillSampleData() {
  if (!nodeCount) {
    // Generar matriz de 5 nodos de ejemplo
    document.getElementById('node-count').value = 5;
    generateMatrix();
  }

  // Distancias de ejemplo (0 = no hay enlace)
  const sample = [
    [0, 10, 0,  5, 0],
    [10, 0,  1, 2, 0],
    [0,  1,  0, 9, 4],
    [5,  2,  9, 0, 2],
    [0,  0,  4, 2, 0],
  ];

  const n = nodeCount || 5;
  for (let i = 0; i < n && i < sample.length; i++) {
    for (let j = 0; j < n && j < sample[i].length; j++) {
      if (i !== j) {
        const cell = document.getElementById(`cell-${i}-${j}`);
        if (cell) cell.value = sample[i][j] === 0 ? '' : sample[i][j];
      }
    }
  }
}

/* --- Limpiar la matriz --- */
function clearMatrix() {
  if (!nodeCount) return;
  for (let i = 0; i < nodeCount; i++) {
    for (let j = 0; j < nodeCount; j++) {
      if (i !== j) {
        const cell = document.getElementById(`cell-${i}-${j}`);
        if (cell) cell.value = '';
      }
    }
  }
}

/* --- Leer la matriz desde el DOM --- */
function readMatrix() {
  const n = nodeCount;
  const matrix = [];

  for (let i = 0; i < n; i++) {
    matrix[i] = [];
    for (let j = 0; j < n; j++) {
      if (i === j) {
        matrix[i][j] = 0;
      } else {
        const cell = document.getElementById(`cell-${i}-${j}`);
        const val  = cell ? parseFloat(cell.value) : NaN;
        matrix[i][j] = (!cell || cell.value.trim() === '' || isNaN(val) || val <= 0) ? Infinity : val;
      }
    }
  }
  return matrix;
}

/* -------------------------------------------------------------------
   ALGORITMO DE DIJKSTRA (genérico — shortest / longest)
   Para la ruta más larga se negan los pesos y se busca la más corta.
   Otra opción: para grafos sin ciclos se puede usar Bellman-Ford,
   pero aquí usamos un Dijkstra modificado con pesos invertidos.
   ------------------------------------------------------------------- */
function dijkstra(matrix, source, mode = 'shortest') {
  const n     = matrix.length;
  const INF   = Infinity;
  const dist  = new Array(n).fill(mode === 'shortest' ? INF : -INF);
  const prev  = new Array(n).fill(null);
  const visited = new Array(n).fill(false);
  const steps = [];

  dist[source] = 0;

  steps.push({
    desc: `Inicializar: distancia a <strong>${getNodeLabel(source)}</strong> = 0, el resto = ${mode === 'shortest' ? '∞' : '-∞'}.`,
  });

  for (let iter = 0; iter < n; iter++) {
    // Escoger el nodo no visitado con la menor/mayor distancia
    let u = -1;
    for (let v = 0; v < n; v++) {
      if (visited[v]) continue;
      if (u === -1) { u = v; continue; }
      if (mode === 'shortest' && dist[v] < dist[u]) u = v;
      if (mode === 'longest'  && dist[v] > dist[u]) u = v;
    }

    if (u === -1 || dist[u] === (mode === 'shortest' ? INF : -INF)) break;

    visited[u] = true;
    steps.push({
      desc: `Visitar nodo <strong>${getNodeLabel(u)}</strong> (distancia acumulada = <code>${dist[u]}</code>).`,
    });

    // Relajar vecinos
    for (let v = 0; v < n; v++) {
      if (visited[v] || matrix[u][v] === INF) continue;
      const newDist = dist[u] + matrix[u][v];
      const isBetter = mode === 'shortest' ? newDist < dist[v] : newDist > dist[v];

      if (isBetter) {
        const oldDist = dist[v];
        dist[v] = newDist;
        prev[v] = u;
        steps.push({
          desc: `  Actualizar <strong>${getNodeLabel(v)}</strong>: <code>${oldDist === (mode === 'shortest' ? INF : -INF) ? '∞' : oldDist}</code> → <code>${newDist}</code> (pasando por ${getNodeLabel(u)}).`,
        });
      }
    }
  }

  return { dist, prev, steps };
}

/* --- Reconstruir la ruta desde el array prev --- */
function reconstructPath(prev, target) {
  const path = [];
  let cur = target;
  while (cur !== null) {
    path.unshift(cur);
    cur = prev[cur];
  }
  return path;
}

/* --- Calcular la ruta y mostrar resultado --- */
function calculateRoute() {
  if (!nodeCount) {
    alert('Primero genera la matriz de distancias.');
    return;
  }

  const origin = parseInt(document.getElementById('origin-node').value, 10);
  const dest   = parseInt(document.getElementById('dest-node').value, 10);

  if (origin === dest) {
    alert('El nodo origen y destino deben ser distintos.');
    return;
  }

  const matrix = readMatrix();
  const { dist, prev, steps } = dijkstra(matrix, origin, routeType);
  const path = reconstructPath(prev, dest);
  const totalDist = dist[dest];

  const resultPanel = document.getElementById('route-result');
  const pathDisplay = document.getElementById('route-path-display');
  const distDisplay = document.getElementById('route-distance-display');
  const routeVisual = document.getElementById('route-visual');
  const stepsContainer = document.getElementById('route-steps');

  // Verificar si hay ruta
  if (totalDist === Infinity || totalDist === -Infinity || (path.length === 1 && path[0] !== origin)) {
    document.getElementById('route-result-icon').textContent  = '⚠️';
    document.getElementById('route-result-title').textContent = 'Sin ruta disponible';
    pathDisplay.textContent = 'No existe ruta';
    distDisplay.textContent = '—';
    routeVisual.innerHTML   = '';
    stepsContainer.innerHTML = '';
    resultPanel.classList.remove('hidden');
    return;
  }

  // Mostrar datos
  document.getElementById('route-result-icon').textContent  = routeType === 'shortest' ? '🏎️' : '🐢';
  document.getElementById('route-result-title').textContent =
    routeType === 'shortest' ? 'Ruta más corta encontrada' : 'Ruta más larga encontrada';

  pathDisplay.textContent = path.map(i => getNodeLabel(i)).join(' → ');
  distDisplay.textContent = totalDist;

  // Ruta visual (burbujas)
  routeVisual.innerHTML = '';
  path.forEach((nodeIdx, i) => {
    const bubble = document.createElement('div');
    bubble.className = 'route-node';
    bubble.style.setProperty('--i', i);
    bubble.textContent = getNodeLabel(nodeIdx);
    routeVisual.appendChild(bubble);

    if (i < path.length - 1) {
      const arrow = document.createElement('span');
      arrow.className = 'route-arrow';
      arrow.textContent = '→';
      routeVisual.appendChild(arrow);
    }
  });

  // Pasos del algoritmo
  stepsContainer.innerHTML = '';
  steps.forEach((s, idx) => {
    const item = document.createElement('div');
    item.className = 'step-item';
    item.style.animationDelay = `${idx * 0.04}s`;
    item.innerHTML = `
      <div class="step-num">${idx + 1}</div>
      <div class="step-text">${s.desc}</div>
    `;
    stepsContainer.appendChild(item);
  });

  resultPanel.classList.remove('hidden');
  resultPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}


/* ================================================================
   SECCIÓN 2 — MCM y MCD
   ================================================================ */

function setMethod(method) {
  calcMethod = method;
  document.getElementById('method-euclides').classList.toggle('active', method === 'euclides');
  document.getElementById('method-factores').classList.toggle('active', method === 'factores');
}

function calculateMCM() {
  const a = parseInt(document.getElementById('num-a').value, 10);
  const b = parseInt(document.getElementById('num-b').value, 10);

  if (isNaN(a) || isNaN(b) || a < 1 || b < 1) {
    alert('Ingresa dos números enteros positivos válidos.');
    return;
  }

  let mcd, mcm, stepsHtml;

  if (calcMethod === 'euclides') {
    const result = euclidesMethod(a, b);
    mcd      = result.mcd;
    mcm      = (a * b) / mcd;
    stepsHtml = result.html;
  } else {
    const result = factoresMethod(a, b);
    mcd      = result.mcd;
    mcm      = result.mcm;
    stepsHtml = result.html;
  }

  // Mostrar badges de resultado
  document.getElementById('mcd-value').textContent = mcd;
  document.getElementById('mcm-value').textContent = mcm;
  document.getElementById('mcm-placeholder').classList.add('hidden');
  document.getElementById('mcm-result-content').classList.remove('hidden');

  // Mostrar pasos
  const stepsPanel = document.getElementById('mcm-steps-panel');
  document.getElementById('mcm-steps-content').innerHTML = stepsHtml;
  stepsPanel.classList.remove('hidden');
  stepsPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ----------------------------------------------------------------
   Método 1: Algoritmo de Euclides
   ---------------------------------------------------------------- */
function euclidesMethod(a, b) {
  const steps = [];
  let x = a, y = b;

  while (y !== 0) {
    const q = Math.floor(x / y);
    const r = x % y;
    steps.push({ x, y, q, r });
    x = y;
    y = r;
  }

  const mcd = x;
  const mcm = (a * b) / mcd;

  // Construir tabla de pasos
  let tableRows = '';
  steps.forEach((s, i) => {
    tableRows += `
      <tr>
        <td>${i + 1}</td>
        <td>${s.x}</td>
        <td>${s.y}</td>
        <td>${s.q}</td>
        <td>${s.r}</td>
      </tr>`;
  });

  const html = `
    <div class="steps-block">
      <div class="steps-block-title">🔄 Algoritmo de Euclides — Tabla de divisiones</div>
      <div class="steps-block-body">
        <p class="step-text" style="margin-bottom:10px">
          Aplicamos la división euclidiana: <code>a = b × q + r</code> hasta que el residuo sea 0.<br/>
          El último divisor no nulo es el <strong>MCD</strong>.
        </p>
        <table class="euclides-table">
          <thead>
            <tr>
              <th>Paso</th>
              <th>Dividendo (a)</th>
              <th>Divisor (b)</th>
              <th>Cociente (q)</th>
              <th>Residuo (r)</th>
            </tr>
          </thead>
          <tbody>${tableRows}</tbody>
        </table>
        <p class="step-text" style="margin-top:12px">
          <strong>MCD(${a}, ${b}) = ${mcd}</strong><br/>
          <strong>MCM(${a}, ${b}) = (${a} × ${b}) / ${mcd} = ${mcm}</strong>
        </p>
      </div>
    </div>`;

  return { mcd, html };
}

/* ----------------------------------------------------------------
   Método 2: Descomposición en factores primos
   ---------------------------------------------------------------- */
function primeFactors(n) {
  const factors = {};
  let d = 2;
  while (d * d <= n) {
    while (n % d === 0) {
      factors[d] = (factors[d] || 0) + 1;
      n = Math.floor(n / d);
    }
    d++;
  }
  if (n > 1) factors[n] = (factors[n] || 0) + 1;
  return factors;
}

function factorExpressionHtml(factors) {
  return Object.entries(factors)
    .map(([p, e]) => `<span class="factor-chip">${p}${e > 1 ? `<sup>${e}</sup>` : ''}</span>`)
    .join('<span class="factor-op"> × </span>');
}

function factoresMethod(a, b) {
  const fa = primeFactors(a);
  const fb = primeFactors(b);

  // Todos los primos involucrados
  const allPrimes = new Set([...Object.keys(fa), ...Object.keys(fb)].map(Number));

  const mcdFactors = {};
  const mcmFactors = {};

  allPrimes.forEach(p => {
    const ea = fa[p] || 0;
    const eb = fb[p] || 0;
    if (ea > 0 && eb > 0) mcdFactors[p] = Math.min(ea, eb);  // MCD: mínimo exponente
    mcmFactors[p] = Math.max(ea, eb);                          // MCM: máximo exponente
  });

  // Calcular valores
  const mcd = Object.entries(mcdFactors).reduce((acc, [p, e]) => acc * Math.pow(Number(p), e), 1);
  const mcm = Object.entries(mcmFactors).reduce((acc, [p, e]) => acc * Math.pow(Number(p), e), 1);

  /* Construir HTML de pasos */
  const mcdHasPrimes = Object.keys(mcdFactors).length > 0;

  const html = `
    <div class="steps-block">
      <div class="steps-block-title">🔢 Descomposición en Factores Primos de ${a}</div>
      <div class="steps-block-body">
        <div class="factors-display">
          <span style="color:var(--text-secondary)">${a} = </span>
          ${factorExpressionHtml(fa)}
        </div>
      </div>
    </div>

    <div class="steps-block">
      <div class="steps-block-title">🔢 Descomposición en Factores Primos de ${b}</div>
      <div class="steps-block-body">
        <div class="factors-display">
          <span style="color:var(--text-secondary)">${b} = </span>
          ${factorExpressionHtml(fb)}
        </div>
      </div>
    </div>

    <div class="steps-block">
      <div class="steps-block-title">📌 Cálculo del MCD (mínimo exponente de factores comunes)</div>
      <div class="steps-block-body">
        ${mcdHasPrimes
          ? `<div class="factors-display">
               <span style="color:var(--text-secondary)">MCD = </span>
               ${factorExpressionHtml(mcdFactors)}
               <span style="color:var(--text-secondary)"> = </span>
               <span class="factor-chip" style="background:rgba(255,101,132,0.18);border-color:rgba(255,101,132,0.4);color:var(--accent-3)">${mcd}</span>
             </div>`
          : `<p class="step-text">No hay factores comunes → <strong>MCD = 1</strong></p>`
        }
      </div>
    </div>

    <div class="steps-block">
      <div class="steps-block-title">📌 Cálculo del MCM (máximo exponente de todos los factores)</div>
      <div class="steps-block-body">
        <div class="factors-display">
          <span style="color:var(--text-secondary)">MCM = </span>
          ${factorExpressionHtml(mcmFactors)}
          <span style="color:var(--text-secondary)"> = </span>
          <span class="factor-chip" style="background:rgba(0,217,200,0.18);border-color:rgba(0,217,200,0.4);color:var(--accent-2)">${mcm}</span>
        </div>
      </div>
    </div>`;

  return { mcd, mcm, html };
}


/* ================================================================
   INICIALIZACIÓN
   ================================================================ */
document.addEventListener('DOMContentLoaded', () => {
  // Mostrar sección de rutas por defecto
  showSection('routes');
  // Generar la matriz con el valor por defecto (4 nodos)
  generateMatrix();
});
