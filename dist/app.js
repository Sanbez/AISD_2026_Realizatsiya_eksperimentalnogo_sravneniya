(() => {
  "use strict";
  const C = window.SortLabCore;
  const $ = id => document.getElementById(id);
  const names = Object.keys(C.LABELS);
  const cases = Object.keys(C.CASES).filter(x => x !== "custom");
  const colors = { bubble: "#b5d985", selection: "#96b9ed", insertion: "#edc58b", quick: "#d2a6d3", merge: "#83d0c7", heap: "#edaa9f" };
  const state = {
    initial: [42,18,75,31,56,12,89,24,63,47,8,71], values: [], events: [], step: 0,
    playing: false, timer: null, worker: null, activeRun: null, run: null, history: [], compare: new Set(), deleted: null,
    hiddenAlgorithms: new Set(), challenge: {}
  };
  let noticeTimer;
  function notice(message, error = false) {
    const el = $("notice"); el.textContent = message; el.className = "notice" + (error ? " error" : ""); el.hidden = false;
    clearTimeout(noticeTimer); noticeTimer = setTimeout(() => el.hidden = true, 4800);
  }
  function fmt(n, digits = 2) { return Number(n).toLocaleString("ru-RU", { maximumFractionDigits: digits, minimumFractionDigits: digits }); }
  function fmtInt(n) { return Number(n).toLocaleString("ru-RU"); }
  function download(name, content, type) {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const a = document.createElement("a"); a.href = url; a.download = name; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  function tab(which) {
    document.querySelectorAll(".nav-item").forEach(el => el.classList.toggle("active", el.dataset.tab === which));
    document.querySelectorAll(".tab").forEach(el => el.hidden = el.id !== "tab-" + which);
    $("breadcrumb").textContent = ({ visual:"ВИЗУАЛИЗАЦИЯ", experiment:"ЭКСПЕРИМЕНТЫ", history:"ИСТОРИЯ" })[which];
    if (which === "history") renderHistory();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  document.querySelectorAll(".nav-item").forEach(el => el.addEventListener("click", () => tab(el.dataset.tab)));
  function makeOption(container, value, label, checked, type = "checkbox") {
    const node = document.createElement("label"); node.className = container === $("algo-options") ? "option" : "chip";
    const input = document.createElement("input"); input.type = type; input.value = value; input.checked = checked;
    input.addEventListener("change", () => { node.classList.toggle("checked", input.checked); if (container === $("case-options")) $("custom-array-wrap").hidden = !selected("case-options").includes("custom"); });
    node.append(input, document.createTextNode(label)); node.classList.toggle("checked", checked); container.append(node);
  }
  names.forEach((name, i) => {
    const option = document.createElement("option"); option.value = name; option.textContent = C.LABELS[name]; $("visual-algo").append(option);
    makeOption($("algo-options"), name, C.LABELS[name], i < 4);
  });
  [100,500,1000,5000,10000].forEach((n, i) => makeOption($("size-options"), String(n), fmtInt(n), i < 3));
  cases.forEach((kind, i) => makeOption($("case-options"), kind, C.CASES[kind], i < 3));
  makeOption($("case-options"), "custom", C.CASES.custom, false);
  function selected(id) { return Array.from($(id).querySelectorAll("input:checked"), el => el.value); }

  const algorithmInfo = {
    bubble: ["Сравнивает соседей и меняет их местами; прекращает работу, если обменов не было.", "Лучший O(n), средний и худший O(n²)", "O(1)", "Да", "Подходит для почти отсортированных небольших массивов; медленно работает на больших."],
    selection: ["Находит минимум в неотсортированной части и ставит его на очередную позицию.", "Лучший, средний и худший O(n²)", "O(1)", "Нет", "Предсказуемое число сравнений и мало обменов; порядок входа почти не помогает."],
    insertion: ["Вставляет каждый элемент на его место в уже упорядоченной части.", "Лучший O(n), средний и худший O(n²)", "O(1)", "Да", "Хорошо подходит для небольших и почти отсортированных массивов."],
    quick: ["Выбирает опорное значение медианой трёх и делит данные на меньшие, равные и большие.", "В среднем O(n log n), в худшем O(n²)", "O(log n) для стека", "Нет", "Обычно быстрая, но зависит от разбиений; равные значения выделяются отдельно."],
    merge: ["Делит массив на части и сливает их в отсортированном порядке.", "Лучший, средний и худший O(n log n)", "O(n)", "Да", "Стабильное время и устойчивость ценой дополнительного буфера."],
    heap: ["Строит максимальную кучу и последовательно переносит максимум в конец.", "Лучший, средний и худший O(n log n)", "O(1)", "Нет", "Гарантирует O(n log n) без большого буфера; не сохраняет порядок равных ключей."]
  };
  function renderAlgorithmInfo() {
    const name = $("visual-algo").value, info = algorithmInfo[name];
    $("algorithm-title").textContent = C.LABELS[name];
    $("algorithm-description").textContent = info[0];
    const box = $("algorithm-facts"); box.replaceChildren();
    [["Время",info[1]],["Память",info[2]],["Устойчивая",info[3]],["Когда использовать",info[4]]].forEach(([label,value]) => {const p=document.createElement("p");const b=document.createElement("strong");b.textContent=label+": ";p.append(b,document.createTextNode(value));box.append(p);});
  }
  function setOptions(id, values) {
    $(id).querySelectorAll("input").forEach(input => { input.checked=values.includes(input.value); input.dispatchEvent(new Event("change")); });
  }
  function applyConfig(c) {
    setOptions("algo-options", c.algorithms || []); setOptions("case-options", c.cases || []);
    const presets=["100","500","1000","5000","10000"], sizes=(c.sizes || []).map(String);
    setOptions("size-options", sizes); $("custom-sizes").value=sizes.filter(n=>!presets.includes(n) && (!(c.cases||[]).includes("custom") || n !== String(C.parseNumbers(c.custom||"").length))).join(", ");
    for (const [id,key] of [["seed","seed"],["repeats","repeats"],["value-min","min"],["value-max","max"],["nearly-swaps","nearlySwaps"],["distinct","distinct"],["custom-array","custom"],["hypothesis","hypothesis"]]) $(id).value=c[key] ?? "";
    $("limit").value=(c.limitMs ?? 5000)/1000;
  }
  const presets = {
    order: { algorithms:["bubble","insertion","quick"], sizes:[500,1000], cases:["random","sorted","reverse"], hypothesis:"На отсортированном массиве пузырьковая сортировка с ранним выходом и сортировка вставками выполнят меньше сравнений, чем на обратном.", question:"Как исходный порядок влияет на число сравнений и время? Сравните результаты при одинаковом размере." },
    size: { algorithms:["bubble","insertion","quick","merge","heap"], sizes:[500,1000,2000], cases:["random"], hypothesis:"При увеличении размера число сравнений квадратичных алгоритмов растёт быстрее, чем у быстрой сортировки, слиянием и пирамидальной.", question:"Как меняется число сравнений при удвоении размера? Выберите показатель «Сравнения» на графике." },
    duplicates: { algorithms:["bubble","insertion","quick","merge","heap"], sizes:[500,1000], cases:["random","duplicates"], hypothesis:"Множество повторяющихся значений может изменить число сравнений и время разных алгоритмов.", question:"Как повторения влияют на алгоритмы? Сравните типы при одинаковом размере и учитывайте, что сами массивы различаются." }
  };
  document.querySelectorAll("[data-preset]").forEach(button => button.onclick=()=>{
    const p=presets[button.dataset.preset]; applyConfig({...p,seed:2026,repeats:5,min:-999,max:999,nearlySwaps:4,distinct:5,custom:"",limitMs:5000});
    $("preset-question").textContent=p.question;
  });
  $("visual-investigate").onclick=()=>{
    stopPlayback(); const c={algorithms:[ $("visual-algo").value ], sizes:[state.initial.length], cases:["custom"],seed:2026,repeats:5,min:-999,max:999,nearlySwaps:4,distinct:5,custom:state.initial.join(", "),limitMs:5000,hypothesis:""};
    applyConfig(c); $("preset-question").textContent="В эксперимент передан исходный порядок визуализации. Выберите дополнительные алгоритмы для сравнения."; tab("experiment");
  };
  $("repeat-settings").onclick=()=>{ if(state.run){applyConfig(state.run.config);notice("Настройки серии восстановлены. Запустите эксперимент, когда будете готовы.");} };
  function stopPlayback() { state.playing = false; clearInterval(state.timer); $("visual-play").textContent = "▶ Запуск"; }
  function trace() {
    stopPlayback();
    state.values = state.initial.slice(); state.events = []; state.step = 0;
    const sim = state.initial.slice();
    C.sort($("visual-algo").value, state.initial.slice(), event => {
      const e = { ...event };
      if (e.type === "swap") [sim[e.i], sim[e.j]] = [sim[e.j], sim[e.i]];
      if (e.type === "write") { e.old = sim[e.i]; sim[e.i] = e.value; }
      state.events.push(e);
    });
    $("visual-seek").max = state.events.length;
    $("visual-seek").value = 0;
    renderPseudo(); renderVisual(); renderAlgorithmInfo();
  }
  function applyEvent(e, forward) {
    if (e.type === "swap") [state.values[e.i], state.values[e.j]] = [state.values[e.j], state.values[e.i]];
    if (e.type === "write") state.values[e.i] = forward ? e.value : e.old;
  }
  function setStep(target) {
    target = Math.max(0, Math.min(state.events.length, Math.trunc(target)));
    if (target === state.step + 1) applyEvent(state.events[state.step], true);
    else if (target === state.step - 1) applyEvent(state.events[target], false);
    else { state.values = state.initial.slice(); for (let i = 0; i < target; i++) applyEvent(state.events[i], true); }
    state.step = target; $("visual-seek").value = target; renderVisual();
    if (target === state.events.length) stopPlayback();
  }
  function describe(e) {
    if (!e) return state.step === 0 ? "Нажмите «Запуск» или «Шаг вперёд», чтобы увидеть работу алгоритма." : "Массив отсортирован. Все шаги завершены.";
    if (e.type === "compare") return fmtInt(e.x) + (e.x > e.y ? " больше " : e.x < e.y ? " меньше " : " равно ") + fmtInt(e.y) + " — сравниваем значения.";
    if (e.type === "swap") return "Меняем элементы с индексами " + e.i + " и " + e.j + " местами.";
    if (e.type === "write") return "Записываем " + fmtInt(e.value) + " на позицию " + e.i + ".";
    if (e.type === "aux") return "Сохраняем " + fmtInt(e.value) + " во вспомогательный буфер.";
    if (e.type === "pivot") return "Опорный элемент: " + fmtInt(e.value) + " (медиана трёх).";
    return "Следующий шаг алгоритма.";
  }
  function renderPseudo() {
    const wrap = $("pseudo"); wrap.replaceChildren();
    C.PSEUDO[$("visual-algo").value].forEach((line, i) => {
      const row = document.createElement("div"); row.className = "pseudo-line"; row.dataset.line = i;
      const no = document.createElement("span"); no.className = "line-no"; no.textContent = String(i + 1).padStart(2,"0");
      row.append(no, document.createTextNode(line)); wrap.append(row);
    });
  }
  let dragIndex = null;
  function renderVisual() {
    const e = state.events[state.step - 1], counts = { comparisons: 0, swaps: 0, writes: 0 };
    for (let i = 0; i < state.step; i++) {
      const type = state.events[i].type;
      if (type === "compare") counts.comparisons++;
      if (type === "swap") { counts.swaps++; counts.writes += 2; }
      if (type === "write" || type === "aux") counts.writes++;
    }
    $("vis-comparisons").textContent = fmtInt(counts.comparisons);
    $("vis-swaps").textContent = fmtInt(counts.swaps);
    $("vis-writes").textContent = fmtInt(counts.writes);
    $("visual-position").textContent = "ШАГ " + fmtInt(state.step) + " / " + fmtInt(state.events.length);
    $("visual-count").textContent = state.values.length + " элементов";
    $("last-index").textContent = Math.max(0, state.values.length - 1);
    $("step-text").textContent = describe(e);
    document.querySelectorAll(".pseudo-line").forEach(row => row.classList.toggle("active", !!e && +row.dataset.line === e.line));
    const bars = $("bars"); bars.replaceChildren();
    const min = Math.min(...state.values), max = Math.max(...state.values), span = max - min || 1;
    state.values.forEach((value, i) => {
      const bar = document.createElement("div"); bar.className = "bar"; bar.style.height = (12 + (value - min) / span * 88) + "%";
      if (state.step === state.events.length && state.step) bar.classList.add("done");
      else if (e && (e.i === i || e.j === i)) bar.classList.add(e.type === "compare" ? "compare" : e.type === "pivot" ? "pivot" : "swap");
      const label = document.createElement("span"); label.textContent = fmtInt(value); bar.append(label);
      bar.title = "Индекс " + i + ": " + value + ". Перетащите для перестановки.";
      bar.draggable = true;
      bar.addEventListener("dragstart", () => { dragIndex = i; stopPlayback(); });
      bar.addEventListener("dragover", event => event.preventDefault());
      bar.addEventListener("drop", event => {
        event.preventDefault();
        if (dragIndex === null || dragIndex === i) return;
        [state.initial[i], state.initial[dragIndex]] = [state.initial[dragIndex], state.initial[i]];
        $("visual-input").value = state.initial.join(", "); dragIndex = null; trace();
      });
      bars.append(bar);
    });
  }
  function applyVisualInput() {
    try {
      const values = C.parseNumbers($("visual-input").value);
      if (values.length < 2 || values.length > 80) throw Error("Для визуализации нужно от 2 до 80 чисел");
      state.initial = values; state.challenge = {}; trace();
    } catch (error) { notice(error.message, true); }
  }
  $("visual-apply").onclick = applyVisualInput;
  $("visual-input").addEventListener("keydown", e => { if (e.key === "Enter") applyVisualInput(); });
  $("visual-algo").onchange = () => { trace(); renderChallenge(); };
  $("visual-random").onclick = () => { state.initial = C.generate("random", 12, Math.floor(Math.random()*1e9), { min: 5, max: 99 }); $("visual-input").value = state.initial.join(", "); state.challenge = {}; trace(); };
  $("visual-prev").onclick = () => { stopPlayback(); setStep(state.step - 1); };
  $("visual-next").onclick = () => { stopPlayback(); setStep(state.step + 1); };
  $("visual-reset").onclick = () => { stopPlayback(); setStep(0); };
  $("visual-seek").oninput = e => { stopPlayback(); setStep(+e.target.value); };
  $("visual-play").onclick = () => {
    if (state.playing) { stopPlayback(); return; }
    if (state.step === state.events.length) setStep(0);
    state.playing = true; $("visual-play").textContent = "Ⅱ Пауза";
    state.timer = setInterval(() => setStep(state.step + 1), +$("visual-speed").value);
  };
  $("visual-speed").onchange = () => { if (state.playing) { stopPlayback(); $("visual-play").click(); } };
  function shuffleValues(values) { const a = values.slice(), r = C.rng(Math.floor(Math.random() * 2**32)); for (let i = a.length-1; i>0; i--) { const j = Math.floor(r()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }
  function comparisonsFor(name, values) { return C.sort(name, values.slice(), () => {}).comparisons; }
  function renderChallenge(last = null) {
    const name = $("visual-algo").value, best = state.challenge[name];
    if (!last && !best) { $("challenge-result").textContent = name === "selection" ? "Для сортировки выбором число сравнений всегда n(n−1)/2, независимо от порядка." : "Нажмите «Проверить порядок», чтобы сравнить свой результат со случайной перестановкой."; return; }
    const parts = [];
    if (last) parts.push("Ваш порядок: " + fmtInt(last.user) + " сравнений · случайный: " + fmtInt(last.random) + ".");
    if (best !== undefined) parts.push("Самый трудный из проверенных: " + fmtInt(best) + " сравнений.");
    if (name === "selection") parts.push("Для выбора значение постоянно: n(n−1)/2.");
    $("challenge-result").textContent = parts.join(" ");
  }
  $("challenge-try").onclick = () => {
    const name = $("visual-algo").value, user = comparisonsFor(name, state.initial), random = comparisonsFor(name, shuffleValues(state.initial));
    state.challenge[name] = Math.max(state.challenge[name] || 0, user, random); renderChallenge({ user, random });
  };
  $("challenge-shuffle").onclick = () => { state.initial = shuffleValues(state.initial); $("visual-input").value = state.initial.join(", "); trace(); renderChallenge(); };

  function readConfig() {
    const algorithms = selected("algo-options"), kindList = selected("case-options");
    const sizes = Array.from(new Set([...selected("size-options").map(Number), ...$("custom-sizes").value.split(/[\s,;]+/).filter(Boolean).map(Number)]));
    if (!algorithms.length || !kindList.length) throw Error("Выберите алгоритмы и типы массивов");
    if (sizes.some(n => !Number.isInteger(n) || n < 2 || n > 10000)) throw Error("Размер должен быть целым числом от 2 до 10 000");
    const custom = $("custom-array").value;
    if (kindList.includes("custom")) {
      const customN = C.parseNumbers(custom).length;
      if (customN < 2 || customN > 10000) throw Error("Свой массив: от 2 до 10 000 чисел");
      sizes.push(customN);
    }
    if (!sizes.length) throw Error("Выберите хотя бы один размер массива");
    const repeats = +$("repeats").value, seed = +$("seed").value, min = +$("value-min").value, max = +$("value-max").value, limitMs = +$("limit").value * 1000;
    const nearlySwaps = +$("nearly-swaps").value, distinct = +$("distinct").value;
    if (!Number.isInteger(repeats) || repeats < 3 || repeats > 15) throw Error("Повторов должно быть от 3 до 15");
    if (!Number.isInteger(seed) || !Number.isSafeInteger(seed)) throw Error("Seed должен быть целым числом");
    if (!Number.isInteger(min) || !Number.isInteger(max) || min > max || max - min > 1000000) throw Error("Проверьте диапазон значений");
    if (!Number.isInteger(nearlySwaps) || nearlySwaps < 1 || !Number.isInteger(distinct) || distinct < 1) throw Error("Проверьте настройки типов массивов");
    if (limitMs < 1000 || limitMs > 30000) throw Error("Лимит должен быть от 1 до 30 секунд");
    const combos = algorithms.length * new Set(sizes).size * kindList.length;
    if (combos > 120) throw Error("Слишком большая серия: сократите число комбинаций до 120");
    return { algorithms, sizes: Array.from(new Set(sizes)).sort((a,b)=>a-b), cases: kindList, repeats, seed, min, max, nearlySwaps, distinct, custom, limitMs, hypothesis: $("hypothesis").value.trim() };
  }
  function setRunning(on) {
    $("run").disabled = on; $("cancel").hidden = !on; $("progress").hidden = !on;
  }
  function runExperiment() {
    let config;
    try { config = readConfig(); } catch (error) { notice(error.message, true); return; }
    if (state.worker) state.worker.terminate();
    const run = { schema: 1, id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()), date: new Date().toISOString(), config, algorithmVersion: C.VERSION, generatorVersion: C.GENERATOR_VERSION, browser: navigator.userAgent, results: [], conclusion: "" };
    state.activeRun = run; state.run = run; state.hiddenAlgorithms.clear();
    clearResults();
    $("results-title").textContent = "Измерение выполняется…";
    $("results-summary").textContent = "Worker последовательно запускает алгоритмы. Подготовка и проверка находятся вне измеряемого участка.";
    $("progress-bar").style.width = "0%"; $("progress-text").textContent = "Подготовка…"; setRunning(true);
    state.worker = new Worker("./worker.js");
    state.worker.onmessage = event => {
      const message = event.data;
      if (message.type === "progress") {
        run.results = message.results;
        $("progress-bar").style.width = (100 * message.done / message.total) + "%";
        $("progress-text").textContent = "Готово " + message.done + " из " + message.total + " комбинаций";
        if (state.run === run) renderResults();
      }
      if (message.type === "done") finishRun(run, message.results);
    };
    state.worker.onerror = error => { setRunning(false); state.worker.terminate(); state.worker = null; state.activeRun = null; notice("Ошибка вычислительного модуля: " + error.message, true); };
    state.worker.postMessage({ type: "run", config });
  }
  function finishRun(run, results) {
    run.results = results; state.worker.terminate(); state.worker = null; state.activeRun = null; setRunning(false);
    const evicted=saveHistory(run); try{if(state.history.some(r=>r.id===run.id) && JSON.parse(localStorage.getItem("sortlab-history-v1")||"[]").some(r=>r.id===run.id && r.conclusion===run.conclusion)) localStorage.removeItem("sortlab-draft-"+run.id);}catch{} if (state.run === run) {renderResults();$("conclusion-status").textContent=evicted?"Проверьте сохранение":"Сохранено";} if(!evicted) notice("Серия завершена и сохранена в истории");
  }
  $("run").onclick = runExperiment;
  $("cancel").onclick = () => {
    if (state.worker) { state.worker.terminate(); state.worker = null; }
    setRunning(false);
    if (state.activeRun) { const run=state.activeRun; run.cancelled = true; state.activeRun=null; saveHistory(run); if(state.run===run) renderResults(); }
    notice("Серия остановлена. Полученные результаты сохранены.");
  };
  function clearResults() {
    $("run-config").textContent=""; $("observations").replaceChildren();
    $("observations").textContent="Ожидаем первые измерения новой серии.";
    $("line-chart").className="line-chart empty-chart"; $("line-chart").textContent="Выполняется новая серия. График появится после первого измерения.";
    $("heatmap").className="heatmap empty-chart"; $("heatmap").textContent="Ожидаем результаты новой серии.";
    $("chart-legend").replaceChildren(); $("chart-case").replaceChildren(); $("chart-size").replaceChildren(); $("growth").textContent="";
    $("chart-detail").textContent="Выберите точку или столбец на графике.";
    $("results-body").innerHTML='<tr><td colspan="8" class="empty-cell">Ожидаем результаты</td></tr>';
    $("conclusion").value=""; $("conclusion").dataset.runId=""; $("conclusion-status").textContent="";
    ["export-csv","export-json","export-png","export-report","repeat-settings","save-conclusion"].forEach(id=>$(id).disabled=true);
  }
  function medianLabel(r) { return r.status === "ok" ? fmt(r.median, r.median < 0.1 ? 4 : 2) : "—"; }
  function renderResults() {
    const run = state.run, results = run?.results || [];
    if (!run || !results.length) { if(run?.cancelled){clearResults();$("results-title").textContent="Серия остановлена";$("results-summary").textContent="Измерения не успели завершиться.";} return; }
    const good = results.filter(r => r.status === "ok");
    $("results-title").textContent = run.cancelled ? "Частичная серия" : state.activeRun === run ? "Серия выполняется · "+good.length+" готово" : good.length + " проверенных измерений";
    $("results-summary").textContent = good.length + " успешных из " + results.length + ". Seed " + run.config.seed + " · " + run.config.repeats + " повторов · версия алгоритмов " + run.algorithmVersion + ".";
    ["export-csv","export-json","export-png","export-report","repeat-settings","save-conclusion"].forEach(id => $(id).disabled = false);
    $("run-config").textContent = configText(run);
    if ($("conclusion").dataset.runId !== run.id) { $("conclusion").value = run.conclusion || ""; $("conclusion").dataset.runId = run.id; $("conclusion-status").textContent=state.history.some(r=>r.id===run.id)?"Сохранено":""; }
    const chartCase = $("chart-case"), previousCase = chartCase.value;
    chartCase.replaceChildren();
    [...new Set(results.map(r => r.kind))].forEach(kind => { const op = document.createElement("option"); op.value = kind; op.textContent = C.CASES[kind]; chartCase.append(op); });
    if ([...chartCase.options].some(o => o.value === previousCase)) chartCase.value = previousCase;
    updateChartSizes(); renderObservations(run);
    const body = $("results-body"); body.replaceChildren();
    results.slice().sort((a,b)=>a.kind.localeCompare(b.kind)||a.n-b.n||names.indexOf(a.name)-names.indexOf(b.name)).forEach(r => {
      const tr = document.createElement("tr");
      const cells = [C.LABELS[r.name], C.CASES[r.kind], fmtInt(r.n), medianLabel(r), r.status === "ok" ? fmt(r.q1,r.q1<.1?4:2) + "–" + fmt(r.q3,r.q3<.1?4:2) : "—", r.metrics ? fmtInt(r.metrics.comparisons) : "—", r.metrics ? fmtInt(r.metrics.writes) : "—", r.status === "ok" ? (r.lowPrecision ? "низкая точность" : "проверено") : r.status === "timeout" ? "лимит времени" : r.status === "imprecise" ? "нет точности" : "ошибка"];
      cells.forEach((x,i) => { const td = document.createElement("td"); td.textContent = x; if (i===7) td.className = r.status === "ok" ? "status-ok" : "status-error"; if (i===7 && r.error) td.title = r.error; tr.append(td); });
      body.append(tr);
    });
    renderChart(); renderHeatmap();
  }
  function updateChartSizes() {
    const control=$("chart-size"), previous=control.value, kind=$("chart-case").value;
    const sizes=[...new Set((state.run?.results||[]).filter(r=>r.kind===kind).map(r=>r.n))].sort((a,b)=>a-b);
    control.replaceChildren(); sizes.forEach(n=>{const opt=document.createElement("option");opt.value=n;opt.textContent="n = "+fmtInt(n);control.append(opt);});
    if(sizes.includes(Number(previous)))control.value=previous;
  }
  function metricValue(r, metric) { return metric === "time" ? r.median : r.metrics?.[metric]; }
  function renderChart() {
    const chart = $("line-chart"), legend = $("chart-legend"), growth = $("growth"); chart.replaceChildren(); legend.replaceChildren(); growth.replaceChildren();
    const run = state.run, kind = $("chart-case").value, metric = $("chart-metric").value;
    if (!run || !kind) { chart.className = "line-chart empty-chart"; chart.textContent = "График появится после эксперимента"; return; }
    const available = run.results.filter(r => r.kind === kind && r.status === "ok");
    const isBar=$("chart-view").value === "bar", chosenN=Number($("chart-size").value);
    const allRows = isBar ? available.filter(r=>r.n===chosenN) : available;
    const rows = allRows.filter(r=>!state.hiddenAlgorithms.has(r.name));
    const present=names.filter(name=>allRows.some(r=>r.name===name));
    present.forEach(name=>{const item=document.createElement("button");item.type="button";item.className="legend-key legend-button";item.setAttribute("aria-pressed",String(!state.hiddenAlgorithms.has(name)));const dot=document.createElement("i");dot.style.background=colors[name];item.append(dot,document.createTextNode((isBar ? (present.filter(n=>!state.hiddenAlgorithms.has(n)).indexOf(name)>=0 ? (present.filter(n=>!state.hiddenAlgorithms.has(n)).indexOf(name)+1)+" · " : "") : "")+C.LABELS[name]));item.onclick=()=>{state.hiddenAlgorithms.has(name)?state.hiddenAlgorithms.delete(name):state.hiddenAlgorithms.add(name);renderChart();};legend.append(item);});
    $("chart-detail").textContent="Выберите точку или столбец на графике.";
    if (!rows.length) { chart.className = "line-chart empty-chart"; chart.textContent = allRows.length ? "Все алгоритмы скрыты. Нажмите на название, чтобы показать их." : "Для выбранных условий нет успешных измерений"; return; }
    chart.className = "line-chart";
    const sizes = [...new Set(rows.map(r=>r.n))].sort((a,b)=>a-b);
    const values = rows.flatMap(r => metric === "time" ? [r.median, r.q1, r.q3] : [metricValue(r,metric)]).filter(v=>Number.isFinite(v) && v>=0);
    const max = Math.max(...values, 0), positive = values.filter(v=>v>0);
    const logScale = $("chart-scale").value === "log", base = positive.length ? Math.min(...positive) : 1;
    const transform = v => logScale ? Math.log10(1 + Math.max(0,v)/base) : Math.max(0,v);
    const domain = transform(max) || 1;
    const W = 700, H = 310, left = 72, right = 28, top = 25, bottom = 48;
    const x = n => sizes.length === 1 ? (left+W-right)/2 : left+(n-sizes[0])/(sizes[sizes.length-1]-sizes[0])*(W-left-right);
    const y = v => H-bottom-(transform(v)/domain)*(H-top-bottom);
    const axis = value => { if(value===0)return "0"; if(value>=1000)return new Intl.NumberFormat("ru-RU",{notation:"compact",maximumFractionDigits:1}).format(value); return Number(value.toPrecision(3)).toLocaleString("ru-RU",{maximumSignificantDigits:3}); };
    const svg = document.createElementNS("http://www.w3.org/2000/svg","svg"); svg.setAttribute("viewBox", "0 0 "+W+" "+H); svg.setAttribute("role","img"); svg.setAttribute("aria-label","График результатов, "+(logScale?"логарифмический":"линейный")+" масштаб");
    let markup = '<rect width="700" height="310" rx="15" fill="#1b2933"/><text x="72" y="15" fill="#a5b8c5" font-size="9" font-family="Arial" letter-spacing="1">'+(metric==="time"?"ВРЕМЯ · МС":"ОПЕРАЦИИ")+'</text>';
    for (let i=0;i<=4;i++) {
      const yy=H-bottom-i*(H-top-bottom)/4, value = max===0 ? 0 : logScale ? base*(Math.pow(10,domain*i/4)-1) : max*i/4;
      markup += '<line x1="'+left+'" y1="'+yy+'" x2="'+(W-right)+'" y2="'+yy+'" stroke="#78909d" stroke-opacity="'+(i===0?".35":".15")+'" stroke-dasharray="'+(i===0?"0":"3 6")+'"/><text x="'+(left-12)+'" y="'+(yy+4)+'" text-anchor="end" fill="#a5b6c0" font-family="Arial" font-size="11">'+axis(value)+'</text>';
    }
    const displayedSizes = sizes.length > 7 ? sizes.filter((_,i)=>i===0||i===sizes.length-1||i%Math.ceil((sizes.length-1)/6)===0) : sizes;
    if(!isBar) displayedSizes.forEach(n=>markup += '<line x1="'+x(n)+'" y1="'+(H-bottom)+'" x2="'+x(n)+'" y2="'+(H-bottom+5)+'" stroke="#718591"/><text x="'+x(n)+'" y="'+(H-23)+'" text-anchor="middle" fill="#a5b6c0" font-family="Arial" font-size="11">'+axis(n)+'</text>');
    if(!isBar) markup += '<text x="'+(W-right)+'" y="'+(H-6)+'" text-anchor="end" fill="#8499a6" font-family="Arial" font-size="9" letter-spacing="1">РАЗМЕР МАССИВА, N</text>';
    names.forEach(name => {
      const series = rows.filter(r=>r.name===name).sort((a,b)=>a.n-b.n); if (!series.length) return;
      const points = series.map(r=>x(r.n)+","+y(metricValue(r,metric))).join(" ");
      if (!isBar && series.length>1) markup += '<polyline points="'+points+'" fill="none" stroke="'+colors[name]+'" stroke-opacity=".12" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/><polyline points="'+points+'" fill="none" stroke="'+colors[name]+'" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>';
      series.forEach(r=>{
        const idx=present.filter(n=>!state.hiddenAlgorithms.has(n)).indexOf(name), count=present.filter(n=>!state.hiddenAlgorithms.has(n)).length;
        const xx=isBar ? left+(idx+.5)*(W-left-right)/count : x(r.n), yy=y(metricValue(r,metric));
        if(isBar){const w=Math.min(54,(W-left-right)/count*.55),h=H-bottom-yy;markup+='<rect x="'+(xx-w/2)+'" y="'+yy+'" width="'+w+'" height="'+Math.max(h,2)+'" rx="4" fill="'+colors[name]+'" fill-opacity=".8" class="chart-point" data-name="'+name+'" data-n="'+r.n+'" tabindex="0" role="button" aria-label="'+C.LABELS[name]+', n='+r.n+'"/><text x="'+xx+'" y="'+(H-24)+'" text-anchor="middle" fill="'+colors[name]+'" font-size="10" font-family="Arial">'+(idx+1)+'</text>';}
        if (metric==="time") markup += '<line x1="'+xx+'" y1="'+y(r.q1)+'" x2="'+xx+'" y2="'+y(r.q3)+'" stroke="'+colors[name]+'" stroke-width="1.5" stroke-opacity=".7"/><line x1="'+(xx-3)+'" y1="'+y(r.q1)+'" x2="'+(xx+3)+'" y2="'+y(r.q1)+'" stroke="'+colors[name]+'"/><line x1="'+(xx-3)+'" y1="'+y(r.q3)+'" x2="'+(xx+3)+'" y2="'+y(r.q3)+'" stroke="'+colors[name]+'"/>';
        if(!isBar) markup += '<circle cx="'+xx+'" cy="'+yy+'" r="6" fill="'+colors[name]+'" stroke="#1b2933" stroke-width="2" class="chart-point" data-name="'+name+'" data-n="'+r.n+'" tabindex="0" role="button" aria-label="'+C.LABELS[name]+', n='+r.n+'"><title>'+C.LABELS[name]+", n="+r.n+": "+fmt(metricValue(r,metric),metric==="time"?4:0)+(metric==="time"?" мс":"")+'</title></circle>';
      });
    });
    svg.innerHTML = markup; chart.append(svg);
    svg.querySelectorAll(".chart-point").forEach(point=>{const show=()=>{const r=rows.find(row=>row.name===point.dataset.name && row.n===Number(point.dataset.n));if(!r)return;const value=metricValue(r,metric);$("chart-detail").textContent=C.LABELS[r.name]+" · "+C.CASES[r.kind]+" · n = "+fmtInt(r.n)+" · "+$("chart-metric").selectedOptions[0].textContent+": "+fmt(value,metric==="time"?4:0)+(metric==="time"?" мс":"")+" · время: "+medianLabel(r)+" мс, Q1–Q3: "+fmt(r.q1,4)+"–"+fmt(r.q3,4)+" мс · повторов: "+(r.samples?.length ?? run.config.repeats)+" · "+(r.lowPrecision?"низкая точность":"проверено");};point.addEventListener("click",show);point.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();show();}});});
    $("chart-scale-note").textContent = logScale ? "Логарифмический масштаб с нулём: log₁₀(1 + значение / "+axis(base)+"). Расстояния отражают изменение масштаба; нажмите на точку или столбец для подробностей." : "Линейный масштаб. Нажмите на точку или столбец для подробностей; для близких к нулю линий выберите логарифмический масштаб.";
    $("chart-caption").textContent = (isBar ? "Столбцы: n = "+fmtInt(chosenN)+" · " : "") + (metric==="time" ? "Медиана и Q1–Q3 · мс" : "Число операций · отдельный запуск");
    if (metric === "comparisons" && !isBar) {
      const parts = [];
      names.forEach(name => {
        const series = rows.filter(r => r.name === name).sort((a,b) => a.n-b.n);
        for (let i=1; i<series.length; i++) {
          if (series[i].n === series[i-1].n * 2 && series[i-1].metrics.comparisons > 0)
            parts.push(C.LABELS[name] + ": n " + fmtInt(series[i-1].n) + " → " + fmtInt(series[i].n) + ", сравнений ×" + fmt(series[i].metrics.comparisons / series[i-1].metrics.comparisons, 2));
        }
      });
      growth.textContent = parts.length ? "При удвоении размера: " + parts.join(" · ") : "Выберите размеры, отличающиеся вдвое, чтобы увидеть отношение числа сравнений.";
    }
  }
  $("chart-metric").onchange = () => {renderChart();renderObservations(state.run);};
  $("chart-scale").onchange = renderChart; $("chart-view").onchange = renderChart;
  $("chart-size").onchange = () => {renderChart();renderObservations(state.run);};
  $("chart-case").onchange = () => {updateChartSizes();renderChart();renderHeatmap();renderObservations(state.run);};
  function renderHeatmap() {
    const map = $("heatmap"), run=state.run, kind=$("chart-case").value; map.replaceChildren();
    if (!run || !kind) { map.className="heatmap empty-chart"; map.textContent="Тепловая карта появится после эксперимента"; return; }
    const rows=run.results.filter(r=>r.kind===kind), sizes=[...new Set(rows.map(r=>r.n))].sort((a,b)=>a-b), algorithms=names.filter(name=>rows.some(r=>r.name===name));
    if (!rows.length) { map.className="heatmap empty-chart"; map.textContent="Нет данных"; return; }
    map.className="heatmap"; const grid=document.createElement("div"); grid.className="heat-grid"; grid.style.gridTemplateColumns="130px repeat("+sizes.length+", minmax(95px,1fr))";
    const cell=(text,cls)=>{const el=document.createElement("div"); el.className=cls; el.textContent=text; grid.append(el); return el;};
    cell("АЛГОРИТМ","heat-head"); sizes.forEach(n=>cell("n = "+fmtInt(n),"heat-head"));
    algorithms.forEach(name=>{
      cell(C.LABELS[name],"heat-name");
      sizes.forEach(n=>{
        const r=rows.find(x=>x.name===name&&x.n===n), peers=rows.filter(x=>x.n===n&&x.status==="ok"), best=peers.reduce((v,x)=>Math.min(v,x.median),Infinity);
        if (!r || r.status!=="ok") { cell(r?.status==="timeout"?"Лимит":"—","heat-cell na"); return; }
        const ratio=r.median/best, close=peers.some(p=>p!==r && p.q1<=r.q3 && r.q1<=p.q3);
        const el=cell("","heat-cell "+(ratio<1.5?"good":ratio<4?"mid":"bad"));
        const strong=document.createElement("strong"); strong.textContent=fmt(r.median,r.median<.1?4:2)+" мс"+(close?" ≈":"");
        const small=document.createElement("small"); small.textContent=fmt(ratio,1)+"× от лучшего"; el.append(strong,small);
        el.title=close?"Межквартильные интервалы перекрываются: различие неубедительно":"Медиана времени и отношение к лучшему";
      });
    });
    map.append(grid);
  }
  function exportCSV() {
    if (!state.run) return;
    const fields=["run_id","date","seed","algorithm_version","generator_version","browser","algorithm","case","n","status","median_ms","q1_ms","q3_ms","batch_size","low_precision","comparisons","swaps","writes","samples_ms","error","hypothesis","conclusion"];
    const quoted=x=>'"'+String(x??"").replaceAll('"','""')+'"';
    const lines=[fields.join(";")];
    state.run.results.forEach(r=>{
      const values=[state.run.id,state.run.date,state.run.config.seed,state.run.algorithmVersion,state.run.generatorVersion,state.run.browser,r.name,r.kind,r.n,r.status,r.median,r.q1,r.q3,r.batchSize,r.lowPrecision,r.metrics?.comparisons,r.metrics?.swaps,r.metrics?.writes,r.samples?.join("|"),r.error,state.run.config.hypothesis,state.run.conclusion];
      lines.push(values.map(quoted).join(";"));
    });
    download("sortlab-"+state.run.id.slice(0,8)+".csv","\uFEFF"+lines.join("\r\n"),"text/csv;charset=utf-8");
  }
  $("export-csv").onclick=exportCSV;
  $("export-json").onclick=()=>state.run&&download("sortlab-"+state.run.id.slice(0,8)+".json",JSON.stringify(state.run,null,2),"application/json");
  $("export-png").onclick=()=>{
    const svg=$("line-chart").querySelector("svg"); if(!svg){notice("Сначала получите график",true);return;}
    const data=new XMLSerializer().serializeToString(svg), url=URL.createObjectURL(new Blob([data],{type:"image/svg+xml"}));
    const img=new Image(); img.onload=()=>{const canvas=document.createElement("canvas");canvas.width=1400;canvas.height=580;const ctx=canvas.getContext("2d");ctx.fillStyle="#fffefa";ctx.fillRect(0,0,1400,580);ctx.drawImage(img,0,0,1400,580);canvas.toBlob(blob=>{if(blob){const a=document.createElement("a");const png=URL.createObjectURL(blob);a.href=png;a.download="sortlab-chart.png";a.click();setTimeout(()=>URL.revokeObjectURL(png),2000);}URL.revokeObjectURL(url);},"image/png");};img.onerror=()=>{URL.revokeObjectURL(url);notice("Не удалось сохранить график",true);};img.src=url;
  };
  function saveConclusion() {
    const run=state.run;if(!run)return;run.conclusion=$("conclusion").value;
    try { if(state.history.some(r=>r.id===run.id)) localStorage.setItem("sortlab-history-v1",JSON.stringify(state.history));
      else localStorage.setItem("sortlab-draft-"+run.id,run.conclusion);
      $("conclusion-status").textContent=state.history.some(r=>r.id===run.id)?"Сохранено":"Черновик сохранён";
    } catch {$("conclusion-status").textContent="Не удалось сохранить";notice("Не удалось сохранить вывод в браузере",true);}
  }
  $("conclusion").addEventListener("input",saveConclusion);
  $("save-conclusion").onclick=saveConclusion;
  function renderObservations(run) {
    const box=$("observations"); box.replaceChildren(); const items=[];
    if(!run)return; const kind=$("chart-case").value,n=Number($("chart-size").value);
    const group=run.results.filter(r=>r.status==="ok" && r.kind===kind && r.n===n);
    if(group.length){group.sort((a,b)=>a.median-b.median);const best=group[0];items.push("При типе «"+C.CASES[best.kind]+"», n = "+fmtInt(best.n)+", наименьшая медиана среди измеренных: "+C.LABELS[best.name]+" — "+medianLabel(best)+" мс"+(group.length===1?" (измерен только один алгоритм).":"."));const overlaps=group.slice(1).filter(r=>r.q1<=best.q3 && best.q1<=r.q3);if(overlaps.length)items.push("Интервал Q1–Q3 лучшего результата перекрывается с: "+overlaps.map(r=>C.LABELS[r.name]).join(", ")+". Это не доказательство равенства.");}
    else items.push("Для выбранного типа и размера нет успешных измерений.");
    const scoped=run.results.filter(r=>r.kind===kind&&r.n===n);
    const imprecise=scoped.filter(r=>r.status==="imprecise"||r.lowPrecision).length, failed=scoped.filter(r=>r.status==="error"||r.status==="timeout").length;
    items.push("Недостаточная или низкая точность: "+imprecise+"; ошибки и превышения лимита: "+failed+".");
    items.push("Сравните наблюдения с гипотезой и объясните возможные причины в собственном выводе.");
    items.forEach(t=>{const li=document.createElement("li");li.textContent=t;box.append(li);});
  }
  $("export-report").onclick=()=>{
    const run=state.run;if(!run)return;
    const doc=document, report=doc.createElement("dialog");report.className="report-dialog";report.setAttribute("aria-label","Отчёт об исследовании");
    const actions=doc.createElement("div");actions.className="report-actions";const button=doc.createElement("button");button.className="button dark";button.textContent="Печать / сохранить в PDF";button.onclick=()=>window.print();const close=doc.createElement("button");close.className="button soft";close.textContent="Закрыть";close.onclick=()=>report.close();actions.append(button,close);report.append(actions);
    const add=(tag,text)=>{const el=doc.createElement(tag);el.textContent=text;report.append(el);return el;};
    add("h1","Отчёт об исследовании алгоритмов сортировки");add("p","Дата: "+new Date(run.date).toLocaleString("ru-RU")+(run.cancelled?" · серия остановлена":""));
    add("h2","Параметры исследования");add("p",configText(run));add("h2","Гипотеза");add("p",run.config.hypothesis||"Не указана");add("h2","Наблюдения");add("p",$("observations").innerText);
    add("h2","График: "+($("chart-case").selectedOptions[0]?.textContent||"")+" · "+$("chart-metric").selectedOptions[0].textContent);const svg=$("line-chart").querySelector("svg");if(svg)report.append(doc.importNode(svg,true));else add("p","Нет данных для графика.");add("p",[...$("chart-legend").querySelectorAll('button[aria-pressed="true"]')].map(b=>b.textContent).join(", ")+". "+$("chart-caption").textContent+". "+$("chart-scale-note").textContent);
    add("h2","Таблица результатов");report.append(doc.importNode($("results-body").closest("table"),true));add("h2","Вывод");add("p",$("conclusion").value.trim()||"Вывод не указан.");add("p","Время зависит от устройства и браузера; интервалы Q1–Q3 описывают разброс измерений и сами по себе не доказывают равенство результатов.");
    doc.body.append(report);report.addEventListener("close",()=>report.remove(),{once:true});report.showModal();
  };
  function configText(run) { const c=run.config;return "Алгоритмы: "+c.algorithms.map(n=>C.LABELS[n]).join(", ")+"; размеры: "+(c.sizes||[]).join(", ")+"; типы: "+(c.cases||[]).map(k=>C.CASES[k]).join(", ")+"; seed: "+c.seed+"; повторов: "+c.repeats+"; диапазон: "+c.min+"…"+c.max+"; перестановок: "+c.nearlySwaps+"; разных значений: "+c.distinct+"; лимит: "+(c.limitMs/1000)+" с; версии алгоритмов/генератора: "+run.algorithmVersion+" / "+run.generatorVersion+(c.custom?"; свой массив: "+c.custom:"")+"; браузер: "+(run.browser||"не указан"); }
  function loadHistory() {
    try { const x=JSON.parse(localStorage.getItem("sortlab-history-v1")||"[]"); return Array.isArray(x)?x.filter(validRun).slice(0,25):[]; }
    catch { return []; }
  }
  function validRun(x) {
    return x&&x.schema===1&&typeof x.id==="string"&&x.id.length<200&&typeof x.date==="string"&&x.config&&
      Array.isArray(x.config.algorithms)&&x.config.algorithms.every(n=>names.includes(n))&&
      Number.isSafeInteger(x.config.seed)&&Array.isArray(x.results)&&x.results.length<=120&&
      x.results.every(r=>names.includes(r.name)&&Object.hasOwn(C.CASES,r.kind)&&Number.isInteger(r.n)&&r.n>=0&&
        ["ok","timeout","error","imprecise"].includes(r.status)&&(r.status!=="ok"||
        (Number.isFinite(r.median)&&r.median>=0&&Number.isFinite(r.q1)&&Number.isFinite(r.q3)&&
         r.metrics&&["comparisons","swaps","writes"].every(k=>Number.isSafeInteger(r.metrics[k])&&r.metrics[k]>=0))));
  }
  function saveHistory(run) {
    const willEvict=state.history.length>=25 && !state.history.some(x=>x.id===run.id);
    state.history=[run,...state.history.filter(x=>x.id!==run.id)].slice(0,25);
    if(willEvict) notice("История ограничена 25 сериями: самая старая удалена. Сохраняйте важные серии в JSON.",true);
    try { localStorage.setItem("sortlab-history-v1",JSON.stringify(state.history)); } catch { notice("Не удалось сохранить историю: хранилище браузера заполнено",true); return true; }
    return willEvict;
  }
  function renderHistory() {
    const list=$("history-list"); list.replaceChildren();
    $("history-capacity").textContent="Сохранено "+state.history.length+" из 25 серий. Когда лимит будет достигнут, добавление новой серии удалит самую старую; экспортируйте важные серии в JSON.";
    $("undo-delete").hidden=!state.deleted;
    if(!state.history.length){const empty=document.createElement("div");empty.className="empty-history";empty.textContent="Пока нет сохранённых экспериментов.";list.append(empty);renderComparison();return;}
    state.history.forEach(run=>{
      const item=document.createElement("div");item.className="history-item";
      const checkbox=document.createElement("input");checkbox.type="checkbox";checkbox.checked=state.compare.has(run.id);checkbox.setAttribute("aria-label","Сравнить серию "+run.id);
      checkbox.onchange=()=>{checkbox.checked?state.compare.add(run.id):state.compare.delete(run.id);renderComparison();};
      const info=document.createElement("div");info.className="history-info";
      const title=document.createElement("strong");title.textContent=(run.title ? run.title+" · " : "")+new Date(run.date).toLocaleString("ru-RU")+" · "+run.results.length+" измерений";
      const detail=document.createElement("span");detail.textContent="Seed "+run.config.seed+" · "+run.config.algorithms.map(n=>C.LABELS[n]).join(", ")+(run.cancelled?" · остановлено":"");
      info.append(title,detail);
      const controls=document.createElement("div");controls.className="history-controls";
      const open=document.createElement("button");open.className="button soft";open.textContent="Открыть";open.onclick=()=>{state.run=run;applyConfig(run.config);renderResults();tab("experiment");};
      const json=document.createElement("button");json.className="button soft";json.textContent="↓ JSON";json.onclick=()=>download("sortlab-"+run.id.slice(0,8)+".json",JSON.stringify(run,null,2),"application/json");
      const rename=document.createElement("button");rename.className="button soft";rename.textContent="Название";rename.onclick=()=>{const field=document.createElement("input");field.type="text";field.maxLength=100;field.placeholder="Название исследования";field.value=run.title||"";field.setAttribute("aria-label","Название исследования");const save=document.createElement("button");save.className="button soft";save.textContent="Сохранить";save.onclick=()=>{run.title=field.value.trim();try{localStorage.setItem("sortlab-history-v1",JSON.stringify(state.history));renderHistory();}catch{notice("Не удалось сохранить название",true);}};controls.replaceChildren(field,save);field.focus();};
      const del=document.createElement("button");del.className="button soft";del.textContent="Удалить";del.onclick=()=>{state.deleted={run,index:state.history.indexOf(run)};state.history=state.history.filter(x=>x.id!==run.id);state.compare.delete(run.id);try{localStorage.setItem("sortlab-history-v1",JSON.stringify(state.history));}catch{}renderHistory();};
      controls.append(open,rename,json,del);item.append(checkbox,info,controls);list.append(item);
    });
    renderComparison();
  }
  $("undo-delete-button").onclick=()=>{if(!state.deleted)return;const {run,index}=state.deleted;if(state.history.length>=25){notice("История заполнена: удалите другую серию перед восстановлением.",true);return;}state.history.splice(Math.min(index,state.history.length),0,run);state.deleted=null;try{localStorage.setItem("sortlab-history-v1",JSON.stringify(state.history));}catch{notice("Не удалось сохранить историю",true);}renderHistory();};
  function renderComparison() {
    const box=$("compare-list"), selectedRuns=state.history.filter(r=>state.compare.has(r.id));box.replaceChildren();
    if(selectedRuns.length<2){box.textContent="Отметьте две или более серии в истории, чтобы сравнить их медианные времена.";return;}
    const fields=[["seed",r=>r.config.seed],["диапазон",r=>[r.config.min,r.config.max]],["повторы",r=>r.config.repeats],["лимит",r=>r.config.limitMs],["перестановки",r=>r.config.nearlySwaps],["число разных значений",r=>r.config.distinct],["свой массив",r=>r.config.custom],["версия алгоритмов",r=>r.algorithmVersion],["версия генератора",r=>r.generatorVersion],["браузер",r=>r.browser]];
    const differences=fields.filter(([,f])=>new Set(selectedRuns.map(r=>JSON.stringify(f(r)))).size>1).map(([name])=>name);
    const warning=document.createElement("p");warning.className="comparison-warning";warning.textContent=differences.length?"Условия серий различаются: "+differences.join(", ")+". Учитывайте это при сравнении.":"Проверенные параметры серий совпадают. Время также зависит от устройства и текущей нагрузки.";box.append(warning);
    const key = r => [r.name,r.kind,r.n].join("|");
    const matches = selectedRuns[0].results.filter(r => selectedRuns.every(run => run.results.some(other => key(other) === key(r))));
    if (!matches.length) { const p=document.createElement("p");p.textContent="У выбранных серий нет общих сочетаний алгоритма, типа массива и размера.";box.append(p); return; }
    const wrap=document.createElement("div");wrap.className="table-scroll";
    const table=document.createElement("table");table.className="compare-table";
    const head=document.createElement("thead"), hr=document.createElement("tr");
    ["Алгоритм","Массив","n",...selectedRuns.map(run=>new Date(run.date).toLocaleDateString("ru-RU")+" · seed "+run.config.seed)].forEach(s=>{const th=document.createElement("th");th.textContent=s;hr.append(th);});head.append(hr);table.append(head);
    const body=document.createElement("tbody");
    matches.sort((a,b)=>a.kind.localeCompare(b.kind)||a.n-b.n||names.indexOf(a.name)-names.indexOf(b.name)).forEach(r=>{
      const tr=document.createElement("tr");
      const values=[C.LABELS[r.name],C.CASES[r.kind],fmtInt(r.n),...selectedRuns.map(run=>{const match=run.results.find(other=>key(other)===key(r));return match.status==="ok"?fmt(match.median,match.median<.1?4:2)+" мс":match.status==="timeout"?"Лимит":match.status==="imprecise"?"Нет точности":"Ошибка";})];
      values.forEach(value=>{const td=document.createElement("td");td.textContent=value;tr.append(td);});body.append(tr);
    });
    table.append(body);wrap.append(table);box.append(wrap);
  }
  $("history-import").onclick=()=>$("history-file").click();
  $("history-file").onchange=async event=>{
    const file=event.target.files?.[0];if(!file)return;
    try{const run=JSON.parse(await file.text());if(!validRun(run))throw Error("Файл не похож на экспорт лаборатории");run.id=run.id+"-import-"+Date.now();saveHistory(run);renderHistory();notice("Эксперимент импортирован");}
    catch(error){notice("Ошибка импорта: "+error.message,true);}
    event.target.value="";
  };
  let demoRestore=null;
  function openDemo(panel) {
    if(!panel)return;const placeholder=document.createComment("demo-placeholder");panel.before(placeholder);demoRestore=()=>placeholder.replaceWith(panel);
    $("demo-content").append(panel);$("demo-dialog").showModal();
  }
  $("demo-visual").onclick=()=>openDemo(document.querySelector(".visual-main"));
  $("demo-chart").onclick=()=>openDemo(document.querySelector(".chart-panel"));
  $("demo-close").onclick=()=>$("demo-dialog").close();
  $("demo-dialog").addEventListener("close",()=>{if(demoRestore)demoRestore();demoRestore=null;});
  state.history=loadHistory();
  trace(); renderChallenge();
})();
