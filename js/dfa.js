//  ε-CLOSURE & MOVE
    // ════════════════════════════════════════════════════════════
    function epsClosure(stateSet, transitions) {
      const closure = new Set(stateSet);
      const stack = [...stateSet];
      while (stack.length) {
        const cur = stack.pop();
        for (const t of transitions) {
          if (t.from === cur && t.symbol === 'ε' && !closure.has(t.to)) {
            closure.add(t.to);
            stack.push(t.to);
          }
        }
      }
      return [...closure].sort();
    }

    function moveOn(states, sym, transitions) {
      const result = new Set();
      for (const s of states)
        for (const t of transitions)
          if (t.from === s && t.symbol === sym) result.add(t.to);
      return [...result];
    }

    function alphabet(transitions) {
      const a = new Set();
      for (const t of transitions) if (t.symbol !== 'ε') a.add(t.symbol);
      return [...a].sort();
    }

    // ════════════════════════════════════════════════════════════
    //  ε-NFA → NFA (remove ε-transitions)
    // ════════════════════════════════════════════════════════════
    // ════════════════════════════════════════════════════════════
    //  DIRECT REGEX → NFA (Optimized Glushkov Construction)
    //
    //  Built directly from the regex tree, then simplified by
    //  merging identical states to achieve a minimum state count
    //  without the complexity of full epsilon elimination or DFA conversion.
    // ════════════════════════════════════════════════════════════

    function buildNFA(enfaResult) {
      const postfix = App.postfix;
      if (!postfix) return null;

      // --- Step 1: Build Regex Tree & Positions ---
      let posCounter = 1;
      const stack = [];
      const positions = [];

      for (const token of postfix) {
        if ('|.*+?'.includes(token)) {
          if (token === '*') stack.push({ type: 'star', a: stack.pop() });
          else if (token === '+') stack.push({ type: 'plus', a: stack.pop() });
          else if (token === '?') stack.push({ type: 'opt', a: stack.pop() });
          else if (token === '|') { const b = stack.pop(), a = stack.pop(); stack.push({ type: 'union', a, b }); }
          else if (token === '.') { const b = stack.pop(), a = stack.pop(); stack.push({ type: 'concat', a, b }); }
        } else {
          const node = { type: 'symbol', sym: token, pos: posCounter++ };
          positions[node.pos] = token;
          stack.push(node);
        }
      }
      const root = stack[0];

      // --- Step 2: Properties ---
      function getNull(n) {
        if (n.type === 'symbol') return false;
        if (n.type === 'star' || n.type === 'opt') return true;
        if (n.type === 'plus') return getNull(n.a);
        if (n.type === 'union') return getNull(n.a) || getNull(n.b);
        if (n.type === 'concat') return getNull(n.a) && getNull(n.b);
        return false;
      }
      function getFirst(n) {
        if (n.type === 'symbol') return new Set([n.pos]);
        if (n.type === 'star' || n.type === 'plus' || n.type === 'opt') return getFirst(n.a);
        if (n.type === 'union') return new Set([...getFirst(n.a), ...getFirst(n.b)]);
        if (n.type === 'concat') {
          const res = new Set(getFirst(n.a));
          if (getNull(n.a)) getFirst(n.b).forEach(p => res.add(p));
          return res;
        }
        return new Set();
      }
      function getLast(n) {
        if (n.type === 'symbol') return new Set([n.pos]);
        if (n.type === 'star' || n.type === 'plus' || n.type === 'opt') return getLast(n.a);
        if (n.type === 'union') return new Set([...getLast(n.a), ...getLast(n.b)]);
        if (n.type === 'concat') {
          const res = new Set(getLast(n.b));
          if (getNull(n.b)) getLast(n.a).forEach(p => res.add(p));
          return res;
        }
        return new Set();
      }
      const follow = Array.from({ length: posCounter }, () => new Set());
      function computeFollow(n) {
        if (n.type === 'concat') {
          computeFollow(n.a); computeFollow(n.b);
          const lastA = getLast(n.a), firstB = getFirst(n.b);
          lastA.forEach(i => firstB.forEach(j => follow[i].add(j)));
        } else if (n.type === 'star' || n.type === 'plus') {
          computeFollow(n.a);
          const lastA = getLast(n.a), firstA = getFirst(n.a);
          lastA.forEach(i => firstA.forEach(j => follow[i].add(j)));
        } else if (n.type === 'union') { computeFollow(n.a); computeFollow(n.b); }
        else if (n.type === 'opt') computeFollow(n.a);
      }
      computeFollow(root);

      // --- Step 3: Raw States & Map ---
      const lastRoot = getLast(root);
      const isNullable = getNull(root);

      // Group positions by signature: (FinalStatus, SymbolLabelsInFollowPos)
      // Actually, simplified merge: merge positions i and j if:
      // 1. label(i) == label(j)
      // 2. follow(i) == follow(j)
      // 3. isFinal(i) == isFinal(j)

      const rawStates = [{ id: 0, isStart: true, isFinal: isNullable, targets: [...getFirst(root)], sym: null }];
      for (let i = 1; i < posCounter; i++) {
        rawStates.push({
          id: i,
          isStart: false,
          isFinal: lastRoot.has(i),
          targets: [...follow[i]],
          sym: positions[i]
        });
      }

      // Merging Logic
      const stateMap = {}; // oldId -> newId
      const finalPartition = [];

      const processed = new Set();
      for (let i = 0; i < rawStates.length; i++) {
        if (processed.has(i)) continue;
        const s1 = rawStates[i];
        const group = [i];
        processed.add(i);

        for (let j = i + 1; j < rawStates.length; j++) {
          if (processed.has(j)) continue;
          const s2 = rawStates[j];

          // Merge criteria: same symbol, same finality, same target positions
          const sameSym = s1.sym === s2.sym;
          const sameFinal = s1.isFinal === s2.isFinal;
          const sameTargets = s1.targets.sort().join(',') === s2.targets.sort().join(',');
          const bothNotStart = !s1.isStart && !s2.isStart;

          if (sameSym && sameFinal && sameTargets && bothNotStart) {
            group.push(j);
            processed.add(j);
          }
        }
        finalPartition.push(group);
      }

      // --- Step 4: Final Construction ---
      const states = finalPartition.map((group, idx) => ({ id: `s${idx}`, originalIds: group }));
      const idTranslate = {};
      finalPartition.forEach((group, idx) => {
        group.forEach(oldId => idTranslate[oldId] = `s${idx}`);
      });

      const nfaTransitions = [];
      const added = new Set();
      finalPartition.forEach((group, idx) => {
        const rep = rawStates[group[0]];
        const fromId = `s${idx}`;
        rep.targets.forEach(targetPos => {
          const toId = idTranslate[targetPos];
          const sym = positions[targetPos];
          const key = `${fromId}-${sym}-${toId}`;
          if (!added.has(key)) {
            nfaTransitions.push({ from: fromId, to: idTranslate[targetPos], symbol: positions[targetPos] });
            added.add(key);
          }
        });
      });

      const nfaFinals = states.filter(s => rawStates[s.originalIds[0]].isFinal).map(s => s.id);
      const startId = idTranslate[0];

      // Closure data for Tables (Thompson ε-NFA)
      const closureMap = {};
      const enfa = enfaResult.nfa;
      const allEnfaStates = fragStates(enfa);
      for (const s of allEnfaStates) closureMap[s] = epsClosure([s], enfa.transitions);

      const transMap = {};
      const alpha = alphabet(enfa.transitions);
      for (const s of allEnfaStates) {
        transMap[s] = {};
        for (const sym of alpha) {
          const moved = moveOn(closureMap[s], sym, enfa.transitions);
          transMap[s][sym] = epsClosure(moved, enfa.transitions);
        }
      }

      return {
        states,
        start: startId,
        finals: nfaFinals,
        transitions: nfaTransitions,
        alphabet: alpha,
        closureMap,
        conversionTable: transMap,
        trace: []
      };
    }

    // ════════════════════════════════════════════════════════════
    //  SUBSET CONSTRUCTION: NFA → DFA  (Helper Reference Implementation)
    // ════════════════════════════════════════════════════════════
    function subsetDFA(nfa) {
      const { states: nfaStates, transitions, start, finals, alphabet: alpha } = nfa;
      const setKey = arr => (arr.length === 0 ? 'Ø' : [...new Set(arr)].sort().join(','));

      // Helper: Epsilon Closure (in case NFA has ε-transitions)
      function getEpsilonClosure(stateSet) {
        const closure = new Set(stateSet);
        const stack = [...stateSet];
        while (stack.length > 0) {
          const s = stack.pop();
          const tList = transitions.filter(t => t.from === s && t.symbol === 'ε');
          for (const t of tList) {
            if (!closure.has(t.to)) {
              closure.add(t.to);
              stack.push(t.to);
            }
          }
        }
        return [...closure].sort();
      }

      // Helper: Move on symbol
      function getMove(stateSet, symbol) {
        const result = new Set();
        for (const s of stateSet) {
          for (const t of transitions) {
            if (t.from === s && t.symbol === symbol) {
              result.add(t.to);
            }
          }
        }
        return [...result];
      }

      const dfaStatesMap = new Map();
      const dfaTransitions = [];
      let stateCounter = 0;
      let deadCounter = 1;

      function getOrCreateDFAState(nfaSubset) {
        const key = setKey(nfaSubset);
        if (!dfaStatesMap.has(key)) {
          const isDead = (key === 'Ø');
          const id = isDead ? `D${deadCounter++}` : `S${stateCounter++}`;
          const isFinal = nfaSubset.some(s => finals.includes(s));
          dfaStatesMap.set(key, {
            id,
            label: key,
            nfaStates: nfaSubset,
            isFinal,
            classes: isDead ? 'dead-state' : ''
          });
        }
        return dfaStatesMap.get(key);
      }

      // Standard Start State logic (Initial epsilon closure of NFA start)
      const startSubset = getEpsilonClosure([start]);
      const initialDFAState = getOrCreateDFAState(startSubset);

      const worklist = [startSubset];
      const discoveredKeys = new Set([setKey(startSubset)]);

      // Main Subset Construction loop
      while (worklist.length > 0) {
        const currentSubset = worklist.shift();
        const currentDFAState = dfaStatesMap.get(setKey(currentSubset));

        for (const symbol of alpha) {
          // 1. Move
          const moved = getMove(currentSubset, symbol);
          // 2. Closure
          const nextSubset = getEpsilonClosure(moved);

          const nextDFAState = getOrCreateDFAState(nextSubset);
          const nextKey = setKey(nextSubset);

          if (!discoveredKeys.has(nextKey)) {
            discoveredKeys.add(nextKey);
            worklist.push(nextSubset);
          }

          dfaTransitions.push({
            from: currentDFAState.id,
            to: nextDFAState.id,
            symbol: symbol
          });
        }
      }

      const states = [...dfaStatesMap.values()];
      return {
        states,
        start: initialDFAState.id,
        finals: states.filter(s => s.isFinal).map(s => s.id),
        transitions: dfaTransitions,
        alphabet: alpha
      };
    }

    // ════════════════════════════════════════════════════════════