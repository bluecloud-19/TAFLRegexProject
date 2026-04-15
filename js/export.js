//  EXPORT AUTOMATA
    // ════════════════════════════════════════════════════════════
    async function exportAutomata() {
      if (!App.enfaResult) {
        showToast('Generate automaton first');
        return;
      }

      if (typeof JSZip === 'undefined') {
        showToast('JSZip library not loaded. Please refresh the page.');
        return;
      }

      showToast('Generating images...');

      try {
        const zip = new JSZip();
        const folder = zip.folder('automata_export');

        // Create a temporary hidden cytoscape instance for rendering
        const tempContainer = document.createElement('div');
        tempContainer.style.width = '1920px';
        tempContainer.style.height = '1080px';
        tempContainer.style.position = 'absolute';
        tempContainer.style.left = '-9999px';
        tempContainer.style.top = '-9999px';
        document.body.appendChild(tempContainer);

        // Register dagre for temp instance
        if (typeof cytoscapeDagre !== 'undefined') {
          try { cytoscape.use(cytoscapeDagre); } catch (e) { }
        }

        const tempCy = cytoscape({
          container: tempContainer,
          elements: [],
          style: CY_STYLE,
          layout: { name: 'preset' }
        });

        // Helper function to render and capture automaton
        const captureAutomaton = (automaton, type, filename) => {
          return new Promise((resolve, reject) => {
            try {
              const els = buildElements(automaton, type);
              tempCy.elements().remove();
              tempCy.add(els);

              const startId = type === 'enfa' ? (automaton.nfa || automaton).start.id : automaton.start;
              tempCy.add({ data: { id: '__start__', label: '' } });
              tempCy.add({ data: { id: '__starrow__', source: '__start__', target: startId, label: '' } });

              // Apply layout
              let layout;
              try {
                layout = tempCy.layout({
                  name: 'dagre',
                  rankDir: 'LR',
                  nodeSep: 120,
                  rankSep: 200,
                  edgeSep: 60,
                  ranker: 'network-simplex',
                  animate: false,
                  padding: 100
                });
              } catch (e) {
                layout = tempCy.layout({
                  name: 'breadthfirst',
                  directed: true,
                  padding: 100,
                  animate: false
                });
              }
              
              layout.run();

              // Wait for layout to complete, then capture
              setTimeout(() => {
                try {
                  // Apply basic edge styling for self-loops and parallel edges
                  tempCy.edges().forEach(e => {
                    if (e.source().id() === e.target().id()) {
                      e.style({
                        'curve-style': 'bezier',
                        'loop-direction': '-45deg',
                        'loop-sweep': '60deg'
                      });
                    }
                  });
                  
                  tempCy.fit(tempCy.elements(), 100);
                  
                  // Export as PNG
                  const png = tempCy.png({
                    output: 'blob',
                    bg: '#f3faff',
                    full: true,
                    scale: 2
                  });

                  resolve({ filename, blob: png });
                } catch (err) {
                  reject(err);
                }
              }, 300);
            } catch (err) {
              reject(err);
            }
          });
        };

        // Capture all automata
        const captures = [];

        // ε-NFA
        if (App.enfaResult) {
          const result = await captureAutomaton(App.enfaResult, 'enfa', 'epsilon-NFA.png');
          captures.push(result);
        }

        // NFA
        if (App.nfaResult) {
          const result = await captureAutomaton(App.nfaResult, 'nfa', 'NFA.png');
          captures.push(result);
        }

        // DFA
        if (App.dfaResult) {
          const result = await captureAutomaton(App.dfaResult, 'dfa', 'DFA.png');
          captures.push(result);
        }

        // Minimized DFA
        if (App.minResult) {
          const result = await captureAutomaton(App.minResult, 'mindfa', 'Minimized-DFA.png');
          captures.push(result);
        }

        // Add all images to ZIP
        for (const capture of captures) {
          folder.file(capture.filename, capture.blob);
        }

        // Create README with metadata
        const readme = `Automata Export
================

Regular Expression: ${App.regex}
Postfix Notation: ${App.postfix}
Export Date: ${new Date().toLocaleString()}

Contents:
---------
${App.enfaResult ? '✓ epsilon-NFA.png - Epsilon Non-deterministic Finite Automaton\n' : ''}${App.nfaResult ? '✓ NFA.png - Non-deterministic Finite Automaton\n' : ''}${App.dfaResult ? '✓ DFA.png - Deterministic Finite Automaton\n' : ''}${App.minResult ? '✓ Minimized-DFA.png - Minimized Deterministic Finite Automaton\n' : ''}
Statistics:
-----------
${App.enfaResult ? `ε-NFA States: ${fragStates(App.enfaResult.nfa).length}\n` : ''}${App.nfaResult ? `NFA States: ${App.nfaResult.states.length}\n` : ''}${App.dfaResult ? `DFA States: ${App.dfaResult.states.length}\n` : ''}${App.minResult ? `Minimized DFA States: ${App.minResult.states.length}\n` : ''}${App.minResult && App.dfaResult ? `State Reduction: ${Math.round((1 - App.minResult.minCount / App.minResult.originalCount) * 100)}%\n` : ''}
Generated by AutoCurate - RegEx to Automata Visualizer
`;

        folder.file('README.txt', readme);

        // Create JSON metadata file
        const metadata = {
          regex: App.regex,
          postfix: App.postfix,
          timestamp: new Date().toISOString(),
          automata: {}
        };

        if (App.enfaResult) {
          const enfaStates = fragStates(App.enfaResult.nfa);
          metadata.automata.epsilonNFA = {
            stateCount: enfaStates.length,
            transitionCount: App.enfaResult.nfa.transitions.length,
            startState: App.enfaResult.nfa.start.id,
            finalState: App.enfaResult.nfa.end.id
          };
        }

        if (App.nfaResult) {
          metadata.automata.NFA = {
            stateCount: App.nfaResult.states.length,
            transitionCount: App.nfaResult.transitions.length,
            alphabet: App.nfaResult.alphabet
          };
        }

        if (App.dfaResult) {
          metadata.automata.DFA = {
            stateCount: App.dfaResult.states.length,
            transitionCount: App.dfaResult.transitions.length,
            alphabet: App.dfaResult.alphabet
          };
        }

        if (App.minResult) {
          metadata.automata.MinimizedDFA = {
            stateCount: App.minResult.states.length,
            transitionCount: App.minResult.transitions.length,
            originalStateCount: App.minResult.originalCount,
            reductionPercentage: Math.round((1 - App.minResult.minCount / App.minResult.originalCount) * 100)
          };
        }

        folder.file('metadata.json', JSON.stringify(metadata, null, 2));

        // Generate ZIP file
        showToast('Creating ZIP file...');
        const zipBlob = await zip.generateAsync({ type: 'blob' });

        // Download ZIP
        const url = URL.createObjectURL(zipBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `automata_${App.regex.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        // Cleanup
        tempCy.destroy();
        document.body.removeChild(tempContainer);

        showToast('Automata exported successfully ✓');
      } catch (error) {
        console.error('Export error:', error);
        showToast('Export failed: ' + error.message);
      }
    }

    // ════════════════════════════════════════════════════════════
    //  TABLE GENERATION
    // ════════════════════════════════════════════════════════════
    function updateTables() {
      const stage = App.stage;
      const container = $('tables-content');
      
      if (!container) return;
      
      if (stage === 'regex' || !App.enfaResult) {
        container.innerHTML = '<div class="not-ready">Generate automaton to see computed tables.</div>';
        return;
      }

      let html = '';

      if (stage === 'enfa') {
        html = generateEpsilonClosureTable();
      } else if (stage === 'nfa') {
        html = generateNFAConversionTable();
      } else if (stage === 'dfa') {
        html = generateDFATable();
      } else if (stage === 'mindfa') {
        html = generateMinimizedDFATable();
      }

      container.innerHTML = html;
    }

    function generateEpsilonClosureTable() {
      if (!App.enfaResult || !App.nfaResult) return '';
      
      const states = fragStates(App.enfaResult.nfa);
      const closureMap = App.nfaResult.closureMap || {};
      
      let html = `<div class="data-table-wrap">
        <div class="dt-header">ε-Closure Table <span style="color:var(--outline);font-size:0.62rem">${states.length} states</span></div>
        <div style="overflow-x:auto">
          <table class="data-table">
            <thead>
              <tr>
                <th>State</th>
                <th>ε-Closure</th>
              </tr>
            </thead>
            <tbody>`;
      
      states.forEach(state => {
        const closure = closureMap[state] || epsilonClosure([state], App.enfaResult.nfa.transitions);
        html += `<tr>
          <td style="font-family:'JetBrains Mono',monospace;color:var(--primary);font-weight:600">${state}</td>
          <td style="font-family:'JetBrains Mono',monospace;color:var(--on-surface-variant)">{${closure.join(', ')}}</td>
        </tr>`;
      });
      
      html += '</tbody></table></div></div>';
      return html;
    }

    function generateNFAConversionTable() {
      if (!App.nfaResult || !App.enfaResult) return '';
      
      const alpha = App.nfaResult.alphabet || [];
      const conversionTable = App.nfaResult.conversionTable || {};
      const closureMap = App.nfaResult.closureMap || {};
      const enfaStates = fragStates(App.enfaResult.nfa);
      
      let html = `<div class="data-table-wrap">
        <div class="dt-header">ε-NFA to NFA Conversion <span style="color:var(--outline);font-size:0.62rem">${enfaStates.length} states</span></div>
        <div style="overflow-x:auto">
          <table class="data-table">
            <thead>
              <tr>
                <th>State</th>
                <th>ε-Closure</th>`;
      
      alpha.forEach(sym => {
        html += `<th>Move(${sym})</th>`;
      });
      html += `</tr>
            </thead>
            <tbody>`;
      
      enfaStates.forEach(state => {
        const closure = closureMap[state] || [state];
        const moves = conversionTable[state] || {};
        
        html += `<tr>
          <td style="font-family:'JetBrains Mono',monospace;color:var(--primary);font-weight:600">${state}</td>
          <td style="font-family:'JetBrains Mono',monospace;font-size:0.7rem;color:var(--on-surface-variant)">{${closure.join(', ')}}</td>`;
        
        alpha.forEach(sym => {
          const moveResult = moves[sym] || [];
          html += `<td style="font-family:'JetBrains Mono',monospace;font-size:0.7rem;color:var(--on-surface-variant)">${moveResult.length > 0 ? '{' + moveResult.join(', ') + '}' : '∅'}</td>`;
        });
        html += '</tr>';
      });
      
      html += '</tbody></table></div></div>';
      return html;
    }

    function generateDFATable() {
      if (!App.dfaResult || !App.nfaResult) return '';
      
      const alpha = App.dfaResult.alphabet || [];
      
      // NFA to DFA Conversion Table
      let html = `<div class="data-table-wrap">
        <div class="dt-header">NFA to DFA Conversion <span style="color:var(--outline);font-size:0.62rem">${App.dfaResult.states.length} DFA states</span></div>
        <div style="overflow-x:auto">
          <table class="data-table">
            <thead>
              <tr>
                <th>DFA State</th>
                <th>NFA States</th>`;
      
      alpha.forEach(sym => {
        html += `<th>${sym}</th>`;
      });
      html += `<th>Final?</th>
              </tr>
            </thead>
            <tbody>`;
      
      App.dfaResult.states.forEach(state => {
        const isAccept = App.dfaResult.finals.includes(state.id);
        const isStart = state.id === App.dfaResult.start;
        html += `<tr class="${isAccept ? 'final-r' : ''}">
          <td style="font-family:'JetBrains Mono',monospace;color:var(--primary);font-weight:600">${isStart ? '→ ' : ''}${state.id}</td>
          <td style="font-family:'JetBrains Mono',monospace;font-size:0.7rem;color:var(--on-surface-variant)">{${state.nfaStates ? state.nfaStates.join(', ') : state.label || state.id}}</td>`;
        
        alpha.forEach(sym => {
          const trans = App.dfaResult.transitions.find(t => t.from === state.id && t.symbol === sym);
          html += `<td style="font-family:'JetBrains Mono',monospace;font-size:0.7rem">${trans ? trans.to : '∅'}</td>`;
        });
        html += `<td>${isAccept ? '<span style="color:var(--tertiary)">★ Yes</span>' : '—'}</td>
        </tr>`;
      });
      
      html += '</tbody></table></div></div>';
      
      // DFA States Table
      html += `<div class="data-table-wrap" style="margin-top: 0.75rem;">
        <div class="dt-header">DFA States <span style="color:var(--outline);font-size:0.62rem">${App.dfaResult.states.length} states</span></div>
        <div style="overflow-x:auto">
          <table class="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>NFA States</th>
                <th>Final?</th>
              </tr>
            </thead>
            <tbody>`;
      
      App.dfaResult.states.forEach(state => {
        const isAccept = App.dfaResult.finals.includes(state.id);
        const isStart = state.id === App.dfaResult.start;
        
        html += `<tr class="${isAccept ? 'final-r' : ''}">
          <td style="font-family:'JetBrains Mono',monospace;color:var(--primary);font-weight:600">${isStart ? '→ ' : ''}${state.id}</td>
          <td style="font-family:'JetBrains Mono',monospace;font-size:0.7rem;color:var(--on-surface-variant)">{${state.nfaStates ? state.nfaStates.join(', ') : state.label || state.id}}</td>
          <td>${isAccept ? '<span style="color:var(--tertiary)">★ Yes</span>' : '—'}</td>
        </tr>`;
      });
      
      html += '</tbody></table></div></div>';
      return html;
    }

    function generateMinimizedDFATable() {
      if (!App.dfaResult || !App.minResult) return '';
      
      const alpha = App.minResult.alphabet || [];
      
      // DFA States Table
      let html = `<div class="data-table-wrap">
        <div class="dt-header">DFA States <span style="color:var(--outline);font-size:0.62rem">${App.dfaResult.states.length} states</span></div>
        <div style="overflow-x:auto">
          <table class="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>NFA States</th>
                <th>Final?</th>
              </tr>
            </thead>
            <tbody>`;
      
      App.dfaResult.states.forEach(state => {
        const isAccept = App.dfaResult.finals.includes(state.id);
        const isStart = state.id === App.dfaResult.start;
        
        html += `<tr class="${isAccept ? 'final-r' : ''}">
          <td style="font-family:'JetBrains Mono',monospace;color:var(--primary);font-weight:600">${isStart ? '→ ' : ''}${state.id}</td>
          <td style="font-family:'JetBrains Mono',monospace;font-size:0.7rem;color:var(--on-surface-variant)">{${state.nfaStates ? state.nfaStates.join(', ') : state.label || state.id}}</td>
          <td>${isAccept ? '<span style="color:var(--tertiary)">★ Yes</span>' : '—'}</td>
        </tr>`;
      });
      
      html += '</tbody></table></div></div>';

      // Minimized DFA Table
      html += `<div class="data-table-wrap" style="margin-top: 0.75rem;">
        <div class="dt-header">Minimized DFA <span style="color:var(--secondary);font-size:0.62rem">${App.minResult.states.length} states</span></div>
        <div style="overflow-x:auto">
          <table class="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Merged From</th>`;
      
      alpha.forEach(sym => {
        html += `<th>${sym}</th>`;
      });
      html += `<th>Final?</th>
              </tr>
            </thead>
            <tbody>`;
      
      App.minResult.states.forEach(state => {
        const isAccept = App.minResult.finals.includes(state.id);
        const isStart = state.id === App.minResult.start;
        html += `<tr class="${isAccept ? 'final-r' : ''}">
          <td style="font-family:'JetBrains Mono',monospace;color:var(--primary);font-weight:600">${isStart ? '→ ' : ''}${state.id}</td>
          <td style="font-family:'JetBrains Mono',monospace;font-size:0.7rem;color:var(--on-surface-variant)">{${state.mergedFrom ? state.mergedFrom.join(', ') : state.id}}</td>`;
        
        alpha.forEach(sym => {
          const trans = App.minResult.transitions.find(t => t.from === state.id && t.symbol === sym);
          html += `<td style="font-family:'JetBrains Mono',monospace;font-size:0.7rem">${trans ? trans.to : '∅'}</td>`;
        });
        html += `<td>${isAccept ? '<span style="color:var(--tertiary)">★ Yes</span>' : '—'}</td>
        </tr>`;
      });
      
      html += '</tbody></table></div></div>';
      return html;
    }

    function getAlphabetFromTransitions(transitions) {
      const symbols = new Set();
      transitions.forEach(t => {
        if (t.label && t.label !== 'ε' && t.label !== 'epsilon') {
          symbols.add(t.label);
        }
      });
      return Array.from(symbols).sort();
    }

    function epsilonClosure(states, transitions) {
      const closure = new Set(states);
      const stack = [...states];
      
      while (stack.length > 0) {
        const state = stack.pop();
        transitions.filter(t => t.from === state && (t.label === 'ε' || t.label === 'epsilon')).forEach(t => {
          if (!closure.has(t.to)) {
            closure.add(t.to);
            stack.push(t.to);
          }
        });
      }
      
      return Array.from(closure);
    }

    function buildPresDots() {
      const dots = $('pres-dots');
      dots.innerHTML = '';
      presSlides.forEach((_, i) => {
        const dot = document.createElement('div');
        dot.className = 'pres-dot';
        dot.onclick = () => { presIdx = i; showPresSlide(i); };
        dots.appendChild(dot);
      });
    }

    function showPresSlide(idx) {
      const slide = presSlides[idx];
      if (!slide) return;
      $('pres-eyebrow').textContent = slide.eyebrow || '';
      $('pres-title').textContent = slide.title;
      $('pres-desc').innerHTML = slide.desc;
      $('pres-slide-info').textContent = `Slide ${idx + 1} / ${presSlides.length}`;
      const dBlock = $('pres-diagram');
      if (slide.diagram) { dBlock.style.display = ''; dBlock.innerHTML = slide.diagram.replace(/\n/g, '<br>'); }
      else dBlock.style.display = 'none';
      document.querySelectorAll('.pres-dot').forEach((d, i) => {
        d.className = 'pres-dot' + (i < idx ? ' done' : '') + (i === idx ? ' active' : '');
      });
      
      // For the first slide (regex display), show it in the canvas area
      if (idx === 0 && prescy) {
        prescy.elements().remove();
        const canvasEl = $('pres-cy');
        if (canvasEl) {
          const { syms, ops } = getAlphabet(App.regex);
          const formattedRegex = formatRegexWithSuperscript(App.regex);
          canvasEl.innerHTML = `
            <div style="display:flex;align-items:center;justify-content:center;height:100%;flex-direction:column;gap:2rem;padding:2rem">
              <div style="text-align:center">
                <div style="font-size:0.7rem;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:var(--outline);margin-bottom:1rem">INPUT PATTERN</div>
                <div style="font-family:'JetBrains Mono',monospace;font-size:3.5rem;color:var(--primary);font-weight:700;letter-spacing:0.05em;margin-bottom:1.5rem;line-height:1.2">${formattedRegex}</div>
                <div style="font-size:1rem;color:var(--on-surface-variant);font-style:italic;max-width:500px;margin:0 auto">${humanDescribe(App.regex).replace('💬 ', '')}</div>
              </div>
              <div style="display:flex;gap:1rem;flex-wrap:wrap;justify-content:center">
                <div style="padding:0.6rem 1.2rem;background:rgba(0,91,191,0.1);border-radius:1.5rem;font-size:0.85rem;font-weight:600;color:var(--primary)">Symbols: {${syms.join(', ')}}</div>
                <div style="padding:0.6rem 1.2rem;background:rgba(124,58,237,0.1);border-radius:1.5rem;font-size:0.85rem;font-weight:600;color:#7c3aed">Operators: {${ops.join(', ') || 'none'}}</div>
                <div style="padding:0.6rem 1.2rem;background:rgba(0,110,28,0.1);border-radius:1.5rem;font-size:0.85rem;font-weight:600;color:var(--secondary)">Postfix: ${App.postfix}</div>
              </div>
            </div>
          `;
        }
      } else if (prescy && slide.automaton) {
        // Restore canvas for other slides
        const canvasEl = $('pres-cy');
        if (canvasEl && canvasEl.innerHTML) {
          canvasEl.innerHTML = '';
          prescy = initCY($('pres-cy'));
        }
        
        const els = buildElements(slide.automaton, slide.type);
        prescy.elements().remove();
        prescy.add(els);
        prescy.add({ data: { id: '__start__', label: '' } });
        const sid = slide.type === 'enfa' ? (slide.automaton.nfa && slide.automaton.nfa.start.id) : slide.automaton.start;
        if (sid) prescy.add({ data: { id: '__starrow__', source: '__start__', target: sid, label: '' } });
        try {
          prescy.layout({ name: 'dagre', rankDir: 'LR', nodeSep: 70, rankSep: 110, padding: 60, animate: false }).run();
        } catch (e) {
          prescy.layout({ name: 'breadthfirst', directed: true, padding: 60, animate: false }).run();
        }
        setTimeout(() => smartFit(prescy, 60), 10);
      } else if (prescy) {
        prescy.elements().remove();
      }
    }

    function presNav(dir) {
      presIdx = Math.max(0, Math.min(presSlides.length - 1, presIdx + dir));
      showPresSlide(presIdx);
    }

    // ════════════════════════════════════════════════════════════