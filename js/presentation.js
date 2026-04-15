// ════════════════════════════════════════════════════════════
//  PRESENTATION MODE
// ════════════════════════════════════════════════════════════
let presSlides = [], presIdx = 0;

    function buildPresSlides() {
      presSlides = [];
      if (!App.enfaResult) return;

      // First slide: Show the regex prominently in canvas
      presSlides.push({
        eyebrow: 'Step 1', 
        title: 'Regular Expression',
        desc: 'The input regular expression will be converted through multiple stages: ε-NFA → NFA → DFA → Minimized DFA.',
        diagram: '', 
        automaton: null, 
        type: null,
      });

      App.enfaResult.steps.forEach((step, i) => {
        const fn = expData[step.type];
        const d = fn ? fn(step) : { title: step.type, desc: step.desc, diagram: '', why: '' };
        presSlides.push({ eyebrow: `ε-NFA Step ${i + 1} / ${App.enfaResult.steps.length}`, title: d.title, desc: d.desc, diagram: d.diagram, automaton: { nfa: step.frag }, type: 'enfa' });
      });

      if (App.nfaResult) presSlides.push({ eyebrow: 'ε-NFA → NFA', title: 'NFA (ε Transitions Removed)', desc: `${App.nfaResult.states.length} states. Alphabet: {${App.nfaResult.alphabet.join(', ')}}.`, automaton: App.nfaResult, type: 'nfa' });
      if (App.dfaResult) presSlides.push({ eyebrow: 'NFA → DFA', title: 'DFA (Subset Construction)', desc: `${App.dfaResult.states.length} DFA states from ${App.nfaResult.states.length} NFA states.`, automaton: App.dfaResult, type: 'dfa' });
      if (App.minResult) presSlides.push({ eyebrow: 'Final Result', title: 'Minimized DFA', desc: `Reduced ${App.minResult.originalCount} → ${App.minResult.minCount} states using ${App.minResult.partitions.length} partition rounds.`, automaton: App.minResult, type: 'mindfa' });
    }

    function openPres() {
      if (!App.enfaResult) { showToast('Generate automaton first'); return; }
      buildPresSlides();
      presIdx = 0;
      $('pres-mode').classList.add('open');
      buildPresDots();
      if (!prescy) prescy = initCY($('pres-cy'));
      showPresSlide(0);
    }

    function closePres() { $('pres-mode').classList.remove('open'); }

    function openThompson() {
      $('thompson-mode').classList.add('open');
    }

    function closeThompson() {
      $('thompson-mode').classList.remove('open');
    }

    // ════════════════════════════════════════════════════════════