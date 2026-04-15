//  SIMULATOR
    // ════════════════════════════════════════════════════════════
    function simulate(automaton, str) {
      const { transitions, start, finals } = automaton;
      let cur = start;
      const steps = [];
      for (let i = 0; i < str.length; i++) {
        const sym = str[i];
        const t = transitions.find(t => t.from === cur && t.symbol === sym);
        if (!t) {
          steps.push({ step: i + 1, from: cur, sym, to: null });
          return { accepted: false, steps, finalState: cur };
        }
        steps.push({ step: i + 1, from: cur, sym, to: t.to });
        cur = t.to;
      }
      return { accepted: finals.includes(cur), steps, finalState: cur };
    }

    function reverseSim(automaton, str) {
      const r = simulate(automaton, str);
      if (!r.accepted) return r;
      const revSteps = [...r.steps].reverse();
      const path = [r.finalState, ...revSteps.map(s => s.from)];
      return { ...r, reversed: true, revSteps, path };
    }

    // ════════════════════════════════════════════════════════════