//  DFA MINIMIZATION (Hopcroft / Table Filling)
    // ════════════════════════════════════════════════════════════
    function minimizeDFA(dfa) {
      const { states, transitions, start, finals, alphabet: alpha } = dfa;
      const ids = states.map(s => s.id);

      function delta(sid, sym) {
        const t = transitions.find(t => t.from === sid && t.symbol === sym);
        return t ? t.to : null;
      }
      function groupOf(P, sid) { return P.findIndex(g => g.includes(sid)); }

      const finalSet = ids.filter(s => finals.includes(s));
      const nonFinal = ids.filter(s => !finals.includes(s));
      const P = [];
      if (finalSet.length) P.push(finalSet);
      if (nonFinal.length) P.push(nonFinal);

      const partLog = [deepClone(P)];
      let changed = true;
      while (changed) {
        changed = false;
        for (let gi = 0; gi < P.length; gi++) {
          const group = P[gi];
          if (group.length <= 1) continue;
          const subs = [];
          for (const s of group) {
            const sig = alpha.map(sym => { const to = delta(s, sym); return to !== null ? groupOf(P, to) : -1; }).join(',');
            const ex = subs.find(sg => sg.sig === sig);
            if (ex) ex.members.push(s);
            else subs.push({ sig, members: [s] });
          }
          if (subs.length > 1) {
            P.splice(gi, 1, ...subs.map(sg => sg.members));
            partLog.push(deepClone(P));
            changed = true;
            break;
          }
        }
      }

      const tempId = gi => `M${gi}`;
      const minTransAll = [];
      const minStart = tempId(groupOf(P, start));
      const minFinalsTmp = [];

      for (let gi = 0; gi < P.length; gi++) {
        const rep = P[gi][0];
        if (finals.includes(rep)) minFinalsTmp.push(tempId(gi));
        for (const sym of alpha) {
          const to = delta(rep, sym);
          if (to !== null) {
            minTransAll.push({ from: tempId(gi), to: tempId(groupOf(P, to)), symbol: sym });
          }
        }
      }

      // Identify dead states in minimized version
      const productive = new Set(minFinalsTmp);
      let changedProd = true;
      while (changedProd) {
        changedProd = false;
        for (const t of minTransAll) {
          if (productive.has(t.to) && !productive.has(t.from)) {
            productive.add(t.from);
            changedProd = true;
          }
        }
      }

      const minStates = [];
      const idMap = {};
      let liveCount = 0, deadCount = 1;

      for (let gi = 0; gi < P.length; gi++) {
        const oldId = tempId(gi);
        let newId, isDead = !productive.has(oldId);
        if (isDead) newId = `d${deadCount++}`;
        else newId = `q${liveCount++}`;
        idMap[oldId] = newId;
        minStates.push({ id: newId, mergedFrom: P[gi], isFinal: finals.includes(P[gi][0]), classes: isDead ? 'dead-state' : '' });
      }

      const finalTransitions = [];
      const seen = new Set();
      for (const t of minTransAll) {
        const from = idMap[t.from], to = idMap[t.to];
        const k = `${from}-${t.symbol}-${to}`;
        if (!seen.has(k)) {
          finalTransitions.push({ from, to, symbol: t.symbol });
          seen.add(k);
        }
      }

      return {
        states: minStates,
        start: idMap[minStart],
        finals: minFinalsTmp.map(f => idMap[f]),
        transitions: finalTransitions,
        alphabet: alpha,
        partitions: partLog,
        originalCount: ids.length,
        minCount: minStates.length,
      };
    }

    // ════════════════════════════════════════════════════════════