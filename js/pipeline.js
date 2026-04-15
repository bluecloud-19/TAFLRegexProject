//  GENERATE AUTOMATON
    // ════════════════════════════════════════════════════════════
    function generateAutomaton() {
      const rx = ($('regex-input').textContent || '').trim();
      if (!rx) { showToast('Please enter a regular expression'); return; }
      const { ok, msg } = validateRegex(rx);
      if (!ok) { showToast(msg); return; }

      App.regex = rx;
      App.enfaResult = null;
      App.nfaResult = null;
      App.dfaResult = null;
      App.minResult = null;
      
      // Clear cached layout positions to force recalculation with new parameters
      _layoutPositions = {};
      _addedEdgeKeys.clear();
      
      $('computing-ind').classList.add('visible');

      setTimeout(() => {
        try {
          const pf = shuntingYard(rx);
          App.postfix = pf;

          App.enfaResult = thompsonBuild(pf);
          App.nfaResult = buildNFA(App.enfaResult);
          App.dfaResult = subsetDFA(App.nfaResult);
          App.minResult = minimizeDFA(App.dfaResult);

          // Init Cytoscape on first generate
          if (!cy) {
            cy = initCY($('cy'));
            if (cy) {
              cy.on('tap', 'node', onNodeTap);
              cy.on('tap', e => { if (e.target === cy) $('closure-popup').classList.remove('visible'); });
            }
          }

          updateRegexDisplay(rx, pf);
          
          // Initialize pipeline steps for ε-NFA stage
          App.stage = 'enfa';
          buildPipelineSteps();
          App.pipelineIdx = -1;

          // Mark all stages done
          ['regex', 'enfa', 'nfa', 'dfa', 'mindfa'].forEach(s => {
            const cr = $(`crumb-${s}`);
            if (cr) { cr.classList.remove('active'); cr.classList.add('done'); }
            if (s !== 'regex') {
              const nv = $(`nav-${s}`);
              if (nv) { nv.classList.remove('disabled'); nv.classList.add('done'); }
            }
          });

          // Show ε-NFA immediately
          switchTab('enfa');

          $('st-enfa').textContent = fragStates(App.enfaResult.nfa).length;
          $('st-dfa').textContent = App.dfaResult.states.length;
          $('st-min').textContent = App.minResult.states.length;

          buildTablesPane();
          updateExplanation(App.enfaResult.steps[App.enfaResult.steps.length - 1], App.enfaResult.steps.length - 1);
          updateStack();
          buildTheory();
          buildPresSlides();

          enablePlayback(true);
          showToast('Automaton generated successfully ✓');
        } catch (e) {
          showToast('Error: ' + e.message);
          console.error(e);
        } finally {
          $('computing-ind').classList.remove('visible');
        }
      }, 30);
    }

    function formatRegexWithSuperscript(rx) {
      // Replace * with superscript version
      return rx.replace(/\*/g, '<sup>*</sup>');
    }

    function updateRegexDisplay(rx, pf) {
      const regexStr = $('rcd-regex-str');
      const pills = $('rcd-pills');
      const desc = $('rcd-desc');
      
      if (!regexStr || !pills || !desc) {
        console.warn('Regex display elements not found');
        return;
      }
      
      regexStr.innerHTML = formatRegexWithSuperscript(rx);
      const { syms, ops } = getAlphabet(rx);
      pills.innerHTML = '';
      if (syms.length) {
        const p = document.createElement('span');
        p.className = 'rcd-pill syms';
        p.textContent = `Σ = {${syms.join(', ')}}`;
        pills.appendChild(p);
      }
      if (ops.length) {
        const p = document.createElement('span');
        p.className = 'rcd-pill ops';
        p.textContent = `Ops: ${ops.join(' ')}`;
        pills.appendChild(p);
      }
      const p2 = document.createElement('span');
      p2.className = 'rcd-pill postfix';
      p2.textContent = `Postfix: ${pf}`;
      pills.appendChild(p2);
      desc.textContent = humanDescribe(rx).replace('💬 ', '');
    }

    function enablePlayback(enabled) {
      ['pb-back', 'pb-prev', 'pb-play', 'pb-next', 'pb-end'].forEach(id => {
        const btn = $(id);
        if (btn) btn.disabled = !enabled;
      });
    }

    // ════════════════════════════════════════════════════════════
    //  PIPELINE PLAYBACK ENGINE
    //  Each step is either:
    //    { stage, type:'regex' }
    //    { stage:'enfa', type:'enfa_frag', fragIdx }
    //    { stage, type:'add_state', stateId, stateIdx, total, firstInStage, automaton, order }
    //    { stage, type:'add_edge', from, to, label }
    // ════════════════════════════════════════════════════════════

    // Pre-computed layout positions for stable incremental animation
    let _layoutPositions = {};
    // Tracks which edges have been added in the current incremental stage
    let _addedEdgeKeys = new Set();

    function computePreviewPositions(automaton, type) {
      try {
        const els = buildElements(automaton, type);
        if (!els.length) return {};
        const tmpCy = cytoscape({ headless: true, elements: els, style: [] });
        try {
          // Use better spacing and ranker for minimized DFA (same as runLayout)
          const isMinDFA = type === 'mindfa';
          const nodeSep = isMinDFA ? 200 : 120;
          const rankSep = isMinDFA ? 300 : 200;
          const edgeSep = isMinDFA ? 100 : 60;
          const ranker = isMinDFA ? 'longest-path' : 'network-simplex';
          
          tmpCy.layout({ 
            name: 'dagre', 
            rankDir: 'LR', 
            nodeSep: nodeSep, 
            rankSep: rankSep, 
            edgeSep: edgeSep,
            ranker: ranker,
            animate: false, 
            padding: 100 
          }).run();
        } catch (e) {
          tmpCy.layout({ name: 'breadthfirst', directed: true, padding: 100 }).run();
        }
        const pos = {};
        tmpCy.nodes().forEach(n => { pos[n.id()] = { x: n.position('x'), y: n.position('y') }; });
        tmpCy.destroy();
        return pos;
      } catch (e) {
        return {};
      }
    }

    function bfsStateOrder(startId, transitions, allStateIds) {
      const visited = new Set(), queue = [startId], order = [];
      visited.add(startId);
      while (queue.length) {
        const s = queue.shift();
        order.push(s);
        for (const t of transitions) {
          if (t.from === s && !visited.has(t.to)) { visited.add(t.to); queue.push(t.to); }
        }
      }
      for (const s of allStateIds) {
        const id = typeof s === 'string' ? s : s.id;
        if (!visited.has(id)) order.push(id);
      }
      return order;
    }

    function buildPipelineSteps() {
      App.pipelineSteps = [];
      if (!App.enfaResult) return;

      // Pre-compute layout positions
      if (!_layoutPositions.nfa && App.nfaResult) {
        _layoutPositions.nfa = computePreviewPositions(App.nfaResult, 'nfa');
      }
      if (!_layoutPositions.dfa && App.dfaResult) {
        _layoutPositions.dfa = computePreviewPositions(App.dfaResult, 'dfa');
      }
      if (!_layoutPositions.mindfa && App.minResult) {
        _layoutPositions.mindfa = computePreviewPositions(App.minResult, 'mindfa');
      }

      // Build steps for current stage only
      const stage = App.stage;

      if (stage === 'regex') {
        App.pipelineSteps.push({ stage: 'regex', type: 'regex' });
        return;
      }

      if (stage === 'enfa') {
        App.enfaResult.steps.forEach((_, i) => {
          App.pipelineSteps.push({ stage: 'enfa', type: 'enfa_frag', fragIdx: i });
        });
        return;
      }

      // Helper: emit add_state + add_edge steps for non-ENFA automata
      function emitAutomaton(stage, automaton, stateOrder) {
        const addedSet = new Set();
        const total = stateOrder.length;
        stateOrder.forEach((stateId, i) => {
          addedSet.add(stateId);
          App.pipelineSteps.push({ stage, type: 'add_state', stateId, stateIdx: i, total, firstInStage: i === 0, automaton, order: stateOrder });

          // Emit edges now visible (both endpoints added)
          const edgeMap = new Map();
          for (const t of (automaton.transitions || [])) {
            const newIsFrom = t.from === stateId && addedSet.has(t.to);
            const newIsTo = t.to === stateId && addedSet.has(t.from);
            if (!newIsFrom && !newIsTo) continue;
            const k = `${t.from}|||${t.to}`;
            if (!edgeMap.has(k)) edgeMap.set(k, { from: t.from, to: t.to, label: t.symbol });
            else edgeMap.get(k).label += ', ' + t.symbol;
          }
          for (const e of edgeMap.values()) {
            App.pipelineSteps.push({ stage, type: 'add_edge', from: e.from, to: e.to, label: e.label });
          }
        });
      }

      if (stage === 'nfa' && App.nfaResult) {
        const nfaOrder = bfsStateOrder(App.nfaResult.start, App.nfaResult.transitions, App.nfaResult.states);
        emitAutomaton('nfa', App.nfaResult, nfaOrder);
      } else if (stage === 'dfa' && App.dfaResult) {
        const dfaOrder = App.dfaResult.states.map(s => s.id);
        emitAutomaton('dfa', App.dfaResult, dfaOrder);
      } else if (stage === 'mindfa' && App.minResult) {
        const minIds = App.minResult.states.map(s => s.id);
        const minOrder = bfsStateOrder(App.minResult.start, App.minResult.transitions, minIds);
        emitAutomaton('mindfa', App.minResult, minOrder);
      }
    }

    // Render one pipeline step
    function renderPipelineStep(step) {
      if (!step) return;

      // Don't switch tabs during animation - stay on current stage
      if (step.stage !== App.stage) {
        return; // Skip steps from other stages
      }

      switch (step.type) {
        case 'regex':
          break;

        case 'enfa_frag':
          renderPartialENFA(step.fragIdx);
          updateExplanation(App.enfaResult.steps[step.fragIdx], step.fragIdx);
          showPipelineExplanation('enfa', step);
          break;

        case 'add_state':
          addStateToGraph(step.stage, step.stateId, step.automaton, step.firstInStage, step.stateIdx, step.total);
          showPipelineExplanation(step.stage, step);
          break;

        case 'add_edge':
          addEdgeToGraph(step.from, step.to, step.label);
          break;
      }

      updateStepCounter();
    }

    // Render partial ε-NFA (Thompson fragment up to index upTo)
    function renderPartialENFA(upTo) {
      if (!cy || !App.enfaResult) return;
      const stepData = App.enfaResult.steps[Math.min(upTo, App.enfaResult.steps.length - 1)];
      const frag = stepData.frag;

      cy.elements().remove();
      const els = buildElements({ nfa: frag }, 'enfa');
      cy.add(els);
      cy.add({ data: { id: '__start__', label: '' } });
      cy.add({ data: { id: '__starrow__', source: '__start__', target: frag.start.id, label: '' } });

      cy.$(`#${frag.start.id}`).addClass('highlighted');
      cy.$(`#${frag.end.id}`).addClass('highlighted');
      setTimeout(() => {
        cy.$(`#${frag.start.id}`).removeClass('highlighted');
        cy.$(`#${frag.end.id}`).removeClass('highlighted');
      }, 700);

      setBadge(`ε-NFA: step ${upTo + 1} / ${App.enfaResult.steps.length}`);
      runLayout(cy);
    }

    // Add a single state to the graph incrementally
    function addStateToGraph(stage, stateId, automaton, isFirst, stateIdx, totalStates) {
      if (!cy) return;

      if (isFirst) {
        cy.elements().remove();
        _addedEdgeKeys.clear();
        cy.add({ group: 'nodes', data: { id: '__start__', label: '' } });
      }

      const positions = _layoutPositions[stage] || {};
      const pos = positions[stateId] || { x: 160 * (stateIdx + 1), y: 200 };

      const isFinal = (automaton.finals || []).includes(stateId);
      const isStart = automaton.start === stateId;

      const nodeEl = cy.add({
        group: 'nodes',
        data: {
          id: stateId, label: stateId,
          isStart: (isStart && !isFinal) ? true : undefined,
          isFinal: (!isStart && isFinal) ? true : undefined,
          isStartFinal: (isStart && isFinal) ? true : undefined,
        },
        position: { x: pos.x, y: pos.y },
      });

      nodeEl.style('opacity', 0);
      setTimeout(() => nodeEl.animate({ style: { opacity: 1 } }, { duration: 380, easing: 'ease-out-quad' }), 20);

      if (isStart) {
        cy.$('#__start__').position({ x: pos.x - 80, y: pos.y });
        setTimeout(() => {
          if (cy.$('#__starrow__').length === 0)
            cy.add({ data: { id: '__starrow__', source: '__start__', target: stateId, label: '' } });
        }, 120);
      }

      // If this is the last state, apply edge styling for better visualization
      if (stateIdx === totalStates - 1) {
        setTimeout(() => {
          // Apply edge styling for loops and parallel edges
          const pairCount = {};
          cy.edges().forEach(e => {
            const k = [e.source().id(), e.target().id()].sort().join('__');
            pairCount[k] = (pairCount[k] || 0) + 1;
          });
          cy.edges().forEach(e => {
            if (e.source().id() === e.target().id())
              e.style({ 'curve-style': 'bezier', 'loop-direction': '-45deg', 'loop-sweep': '45deg' });
            const k = [e.source().id(), e.target().id()].sort().join('__');
            if (pairCount[k] > 1)
              e.style({ 'curve-style': 'bezier', 'control-point-step-size': 50 });
          });
          smartFit(cy, 50);
        }, 500);
      } else {
        setTimeout(() => smartFit(cy, 50), 420);
      }
      
      const sLabel = { nfa: 'NFA', dfa: 'DFA', mindfa: 'Min DFA' }[stage] || stage;
      setBadge(`${sLabel}: ${stateIdx + 1} / ${totalStates} states`);
    }

    // Add a single edge to the graph incrementally
    function addEdgeToGraph(fromId, toId, label) {
      if (!cy) return;
      const key = `${fromId}--${label}--${toId}`;
      if (_addedEdgeKeys.has(key)) return;
      _addedEdgeKeys.add(key);

      if (!cy.$(`#${CSS.escape(fromId)}`).length || !cy.$(`#${CSS.escape(toId)}`).length) return;

      const isEps = label === 'ε' || label.split(', ').every(s => s === 'ε');
      const edgeId = `ae_${_addedEdgeKeys.size}`;
      const edgeEl = cy.add({
        group: 'edges',
        data: { id: edgeId, source: fromId, target: toId, label, isEps: isEps || undefined },
      });
      edgeEl.style('opacity', 0);
      setTimeout(() => edgeEl.animate({ style: { opacity: 1 } }, { duration: 340 }), 40);
    }

    // Show contextual explanation during pipeline playback
    function showPipelineExplanation(stage, step) {
      const el = $('explain-content');

      if (stage === 'nfa_table' && step.type === 'table_row') {
        const row = step.row;
        el.innerHTML = `
      <div class="exp-card">
        <div class="exp-step-badge">${step.ri + 1}</div>
        <div class="exp-title">NFA State Conversion: q${row.state}</div>
        <div class="exp-desc">
          Building the NFA transition table row for ε-NFA state <strong>q${row.state}</strong>.<br><br>
          1. Initial closure: <code style="color:var(--primary)">E(q${row.state}) = {${row.closure.join(', ')}}</code><br>
          2. For each symbol, we find the set of states reachable by that symbol from any state in the closure, followed by another ε-closure.
        </div>
      </div>`;

      } else if (stage === 'nfa' && step.type === 'add_state') {
        const sid = step.stateId;
        const isFinal = App.nfaResult.finals.includes(sid);
        const isStart = sid === App.nfaResult.start;
        const outgoing = App.nfaResult.transitions.filter(t => t.from === sid);
        el.innerHTML = `
      <div class="exp-card">
        <div class="exp-step-badge">${step.stateIdx + 1}</div>
        <div class="exp-title">NFA State: ${sid}</div>
        <div class="exp-desc">
          ${isStart ? '<strong>Start state.</strong><br>' : ''}${isFinal ? '<strong>Accepting state.</strong><br>' : ''}
          Outgoing: ${outgoing.length ? outgoing.map(t => `<code>${sid}—(${t.symbol})→${t.to}</code>`).join(', ') : 'none'}<br><br>
          ε-closure: {${(App.nfaResult.closureMap[sid] || [sid]).join(', ')}}
        </div>
      </div>`;

      } else if (stage === 'dfa' && step.type === 'add_state') {
        const sid = step.stateId;
        const dfaSt = App.dfaResult.states.find(s => s.id === sid);
        const isFinal = App.dfaResult.finals.includes(sid);
        const isStart = sid === App.dfaResult.start;
        const outgoing = App.dfaResult.transitions.filter(t => t.from === sid);
        el.innerHTML = `
      <div class="exp-card">
        <div class="exp-step-badge">${step.stateIdx + 1}</div>
        <div class="exp-title">DFA State: ${sid}</div>
        <div class="exp-desc">
          ${isStart ? '<strong>Start state.</strong><br>' : ''}${isFinal ? '<strong>Accepting state.</strong><br>' : ''}
          NFA states: <span style="font-family:'JetBrains Mono',monospace;color:var(--primary)">{${(dfaSt?.nfaStates || []).join(', ')}}</span><br><br>
          Transitions: ${outgoing.length ? outgoing.map(t => `<code>${sid}—(${t.symbol})→${t.to}</code>`).join(', ') : 'none'}
        </div>
      </div>`;

      } else if (stage === 'mindfa' && step.type === 'add_state') {
        const sid = step.stateId;
        const minSt = App.minResult.states.find(s => s.id === sid);
        const isFinal = App.minResult.finals.includes(sid);
        const isStart = sid === App.minResult.start;
        const outgoing = App.minResult.transitions.filter(t => t.from === sid);
        el.innerHTML = `
      <div class="exp-card">
        <div class="exp-step-badge">${step.stateIdx + 1}</div>
        <div class="exp-title">Min DFA State: ${sid}</div>
        <div class="exp-desc">
          ${isStart ? '<strong>Start state.</strong><br>' : ''}${isFinal ? '<strong>Accepting state.</strong><br>' : ''}
          Merged from: <span style="font-family:'JetBrains Mono',monospace;color:var(--primary)">{${(minSt?.mergedFrom || []).join(', ')}}</span><br><br>
          Transitions: ${outgoing.length ? outgoing.map(t => `<code>${sid}—(${t.symbol})→${t.to}</code>`).join(', ') : 'none'}
        </div>
      </div>`;
      }
    }

    // ════════════════════════════════════════════════════════════