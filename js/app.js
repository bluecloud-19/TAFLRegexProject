//  GLOBAL STATE
    // ════════════════════════════════════════════════════════════
    
    // DOM helper - must be defined first as it's used by all files
    function $(id) { return document.getElementById(id); }
    
    const App = {
      regex: '',
      postfix: '',
      stage: 'regex',

      enfaResult: null,
      nfaResult: null,
      dfaResult: null,
      minResult: null,

      pipelineSteps: [],
      pipelineIdx: -1,

      stepMode: false,
      playing: false,
      playTimer: null,
      speedMs: 1000,

      simMode: 'dfa',
      simDir: 'forward',
    };

    const FIXED_ZOOM = 0.85;

    function smartFit(c, padding = 60) {
      if (!c || c.elements().length === 0) return;
      c.fit(padding);
      if (c.zoom() > FIXED_ZOOM) {
        c.zoom(FIXED_ZOOM);
        c.center();
      }
    }

    // ════════════════════════════════════════════════════════════
    //  REGEX PREPROCESSING: Convert user-friendly syntax
    //  + means union (|), . means concatenation
    // ════════════════════════════════════════════════════════════
    function preprocessRegex(rx) {
      let result = '';
      for (let i = 0; i < rx.length; i++) {
        const c = rx[i];
        if (c === '+') {
          // + means union (|)
          result += '|';
        } else if (c === '.') {
          // . means explicit concatenation - we'll handle it in insertConcat
          // For now, just skip it as insertConcat will add implicit concatenation
          continue;
        } else {
          result += c;
        }
      }
      return result;
    }

    // ════════════════════════════════════════════════════════════
    //  ALGORITHM: SHUNTING YARD (Infix → Postfix)
    // ════════════════════════════════════════════════════════════
    function insertConcat(infix) {
      let out = '';
      const postfix_ops = new Set(['*', '?']);
      for (let i = 0; i < infix.length; i++) {
        const c = infix[i];
        out += c;
        if (i + 1 < infix.length) {
          const n = infix[i + 1];
          const prevIsAtom = c !== '(' && c !== '|';
          const nextIsAtom = n !== ')' && n !== '|' && !postfix_ops.has(n);
          if (prevIsAtom && nextIsAtom) out += '.';
        }
      }
      return out;
    }

    function shuntingYard(infix) {
      const preprocessed = preprocessRegex(infix);
      const prec = { '|': 1, '.': 2, '*': 3, '?': 3 };
      const expanded = insertConcat(preprocessed);
      const out = [], ops = [];
      for (const c of expanded) {
        if (c === '(') {
          ops.push(c);
        } else if (c === ')') {
          while (ops.length && ops[ops.length - 1] !== '(') out.push(ops.pop());
          if (!ops.length) throw new Error('Mismatched parentheses');
          ops.pop();
        } else if ('|.*?'.includes(c)) {
          while (ops.length && ops[ops.length - 1] !== '(' && (prec[ops[ops.length - 1]] || 0) >= (prec[c] || 0))
            out.push(ops.pop());
          ops.push(c);
        } else {
          out.push(c);
        }
      }
      while (ops.length) {
        if (ops[ops.length - 1] === '(') throw new Error('Mismatched parentheses');
        out.push(ops.pop());
      }
      return out.join('');
    }

    // ════════════════════════════════════════════════════════════
    //  ALGORITHM: THOMPSON'S CONSTRUCTION
    // ════════════════════════════════════════════════════════════
    let _stateId = 0;
    const newId = () => `q${_stateId++}`;

    function mkState() { return { id: newId() }; }
    function makeFragment(start, end, transitions) { return { start, end, transitions }; }
    function addT(transitions, from, to, sym) { transitions.push({ from: from.id, to: to.id, symbol: sym }); }

    function thompsonBuild(postfix) {
      _stateId = 0;
      const stack = [], allSteps = [], derivation = [];

      for (const token of postfix) {
        if (token === '.') {
          if (stack.length < 2) throw new Error('Invalid regex: not enough operands for concatenation');
          const B = stack.pop(), A = stack.pop();
          const trans = [...A.transitions, ...B.transitions];
          addT(trans, A.end, B.start, 'ε');
          const frag = makeFragment(A.start, B.end, trans);
          stack.push(frag);
          allSteps.push({ type: 'concat', frag: deepClone(frag), desc: `Connected ${A.end.id}→${B.start.id} via ε (concatenation)` });
          derivation.push({ symbol: '.', op: 'Concatenation', result: `ε: ${A.end.id}→${B.start.id}` });

        } else if (token === '|') {
          if (stack.length < 2) throw new Error('Invalid regex: not enough operands for union');
          const B = stack.pop(), A = stack.pop();
          const s = mkState(), e = mkState();
          const trans = [...A.transitions, ...B.transitions];
          addT(trans, s, A.start, 'ε');
          addT(trans, s, B.start, 'ε');
          addT(trans, A.end, e, 'ε');
          addT(trans, B.end, e, 'ε');
          const frag = makeFragment(s, e, trans);
          stack.push(frag);
          allSteps.push({ type: 'union', frag: deepClone(frag), desc: `New start ${s.id}→{${A.start.id},${B.start.id}}, merge at ${e.id}` });
          derivation.push({ symbol: '|', op: 'Union', result: `${s.id}→ε→both branches→${e.id}` });

        } else if (token === '*') {
          if (!stack.length) throw new Error('Not enough operands for *');
          const A = stack.pop();
          const s = mkState(), e = mkState();
          const trans = [...A.transitions];
          addT(trans, s, A.start, 'ε');
          addT(trans, A.end, e, 'ε');
          addT(trans, s, e, 'ε');
          addT(trans, A.end, A.start, 'ε');
          const frag = makeFragment(s, e, trans);
          stack.push(frag);
          allSteps.push({ type: 'star', frag: deepClone(frag), desc: `Bypass ${s.id}→${e.id} + loop ${A.end.id}→${A.start.id}` });
          derivation.push({ symbol: '*', op: 'Kleene Star', result: `bypass + loop at ${s.id},${e.id}` });

        } else if (token === '+') {
          if (!stack.length) throw new Error('Not enough operands for +');
          const A = stack.pop();
          const s = mkState(), e = mkState();
          const trans = [...A.transitions];
          addT(trans, s, A.start, 'ε');
          addT(trans, A.end, e, 'ε');
          addT(trans, A.end, A.start, 'ε');
          const frag = makeFragment(s, e, trans);
          stack.push(frag);
          allSteps.push({ type: 'plus', frag: deepClone(frag), desc: `Loop without bypass (one or more)` });
          derivation.push({ symbol: '+', op: 'One or More', result: `loop at ${A.end.id}→${A.start.id}` });

        } else if (token === '?') {
          if (!stack.length) throw new Error('Not enough operands for ?');
          const A = stack.pop();
          const s = mkState(), e = mkState();
          const trans = [...A.transitions];
          addT(trans, s, A.start, 'ε');
          addT(trans, A.end, e, 'ε');
          addT(trans, s, e, 'ε');
          const frag = makeFragment(s, e, trans);
          stack.push(frag);
          allSteps.push({ type: 'optional', frag: deepClone(frag), desc: `Bypass ${s.id}→${e.id} (optional)` });
          derivation.push({ symbol: '?', op: 'Optional (?)', result: `bypass via ${s.id}→${e.id}` });

        } else {
          const s = mkState(), e = mkState();
          const trans = [{ from: s.id, to: e.id, symbol: token }];
          const frag = makeFragment(s, e, trans);
          stack.push(frag);
          allSteps.push({ type: 'symbol', token, frag: deepClone(frag), desc: `${s.id} ─(${token})→ ${e.id}` });
          derivation.push({ symbol: token, op: 'Create NFA', result: `${s.id}─(${token})→${e.id}` });
        }
      }

      if (stack.length !== 1) throw new Error('Invalid regex: too many operands');
      return { nfa: stack[0], steps: allSteps, derivation };
    }

    function deepClone(obj) { return JSON.parse(JSON.stringify(obj)); }

    function fragStates(frag) {
      const ids = new Set([frag.start.id, frag.end.id]);
      for (const t of frag.transitions) { ids.add(t.from); ids.add(t.to); }
      return [...ids];
    }

    // ════════════════════════════════════════════════════════════
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
    //  VALIDATION
    // ════════════════════════════════════════════════════════════
    function validateRegex(rx) {
      if (!rx) return { ok: false, msg: '' };
      try {
        const preprocessed = preprocessRegex(rx);
        let depth = 0;
        for (const c of preprocessed) {
          if (c === '(') depth++;
          else if (c === ')') { depth--; if (depth < 0) return { ok: false, msg: 'Unmatched closing parenthesis' }; }
        }
        if (depth !== 0) return { ok: false, msg: 'Unmatched opening parenthesis' };
        if (/\(\)/.test(preprocessed)) return { ok: false, msg: 'Empty group () is not allowed' };
        if (/^\|/.test(preprocessed) || /\|$/.test(preprocessed) || /\|\|/.test(preprocessed)) return { ok: false, msg: 'Invalid | or + placement' };
        shuntingYard(rx);
        return { ok: true, msg: '✓ Valid regular expression' };
      } catch (e) {
        return { ok: false, msg: e.message };
      }
    }

    function getAlphabet(rx) {
      const preprocessed = preprocessRegex(rx);
      const syms = new Set(), ops = new Set();
      for (const c of preprocessed) { if ('|.*?()'.includes(c)) ops.add(c); else syms.add(c); }
      return { syms: [...syms], ops: [...ops] };
    }

    function humanDescribe(rx) {
      const map = {
        'a*': '"a" repeated zero or more times.',
        'a|b': 'Either "a" or "b".',
        'ab': 'The string "ab" (concatenation).',
        '(ab)*': '"ab" repeated zero or more times.',
        'a(b|c)*': '"a" followed by zero or more of "b" or "c".',
        '(a|b)*abb': 'Any mix of "a"/"b" ending with "abb".',
        'a*b*': "Any a's followed by any b's.",
        '(a|b)*a(a|b)': 'Strings where the second-to-last symbol is "a".',
      };
      if (map[rx]) return '💬 ' + map[rx];
      const { syms } = getAlphabet(rx);
      return `💬 Strings over {${syms.join(', ')}} matching "${rx}".`;
    }

    // ════════════════════════════════════════════════════════════
    //  CYTOSCAPE VARIABLES (implementation in cytoscape-init.js)
    // ════════════════════════════════════════════════════════════
    let cy = null, prescy = null;

    // ════════════════════════════════════════════════════════════
    //  STAGE NAVIGATION
    // ════════════════════════════════════════════════════════════
    function switchTab(name, skipRender) {
      const oldStage = App.stage;
      App.stage = name;

      document.querySelectorAll('.crumb-btn').forEach(b => b.classList.remove('active'));
      const crumb = $(`crumb-${name}`);
      if (crumb) crumb.classList.add('active');

      document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
      const navItem = $(`nav-${name}`);
      if (navItem) navItem.classList.add('active');

      const rcd = $('regex-canvas-display');

      // Stop any playing animation when switching stages
      if (oldStage !== name && App.playing) {
        stopPlay();
      }

      // Rebuild pipeline steps for the new stage
      if (App.enfaResult && oldStage !== name) {
        buildPipelineSteps();
        App.pipelineIdx = -1;
      }

      // Update tables for the new stage
      updateTables();

      if (name === 'regex') {
        if (App.enfaResult) {
          hideCY();
          $('empty-state').style.display = 'none';
          rcd.style.display = 'flex';
        } else {
          hideCY();
          rcd.style.display = 'none';
        }
        updateStepCounter();
        return;
      }

      rcd.style.display = 'none';

      if (!skipRender) {
        showCY();
        if (name === 'enfa' && App.enfaResult) {
          renderGraph(App.enfaResult, 'enfa');
          setBadge(`${fragStates(App.enfaResult.nfa).length} States`);
        } else if (name === 'nfa' && App.nfaResult) {
          renderGraph(App.nfaResult, 'nfa');
          setBadge(`${App.nfaResult.states.length} States`);
          switchRP('tables');
        } else if (name === 'dfa' && App.dfaResult) {
          renderGraph(App.dfaResult, 'dfa');
          setBadge(`${App.dfaResult.states.length} States`);
        } else if (name === 'mindfa' && App.minResult) {
          renderGraph(App.minResult, 'mindfa');
          setBadge(`${App.minResult.states.length} States`);
        }
        updateStepCounter();
      } else {
        showCY();
      }
    }

    // ════════════════════════════════════════════════════════════
    //  INPUT HANDLING
    // ════════════════════════════════════════════════════════════
    function updateInput(rx) {
      const input = $('regex-input');
      const msgEl = $('validation-msg');
      const iconEl = $('input-icon');

      if (!rx) {
        input.className = '';
        msgEl.className = 'validation-msg';
        msgEl.textContent = '';
        iconEl.textContent = '';
        $('parsed-section').style.display = 'none';
        $('regex-highlight-bar').classList.remove('visible');
        return;
      }

      const { ok, msg } = validateRegex(rx);
      input.className = ok ? 'valid' : 'error';
      msgEl.className = 'validation-msg ' + (ok ? 'valid' : 'error');
      msgEl.textContent = msg;
      iconEl.textContent = ok ? '✓' : '✕';
      iconEl.style.color = ok ? 'var(--secondary)' : 'var(--tertiary)';

      if (ok) {
        const { syms, ops } = getAlphabet(rx);
        const pf = shuntingYard(rx);
        $('parsed-section').style.display = '';
        $('parsed-rows').innerHTML = `
      <div class="parsed-row"><span class="parsed-key">Symbols</span><span class="parsed-val">{${syms.join(', ')}}</span></div>
      <div class="parsed-row"><span class="parsed-key">Operators</span><span class="parsed-val">{${ops.join(', ') || 'none'}}</span></div>
      <div class="parsed-row"><span class="parsed-key">Length</span><span class="parsed-val">${rx.length} chars</span></div>
    `;
        $('postfix-chip').classList.remove('hidden');
        $('postfix-val').textContent = pf;
        $('human-chip').classList.remove('hidden');
        $('human-chip').textContent = humanDescribe(rx);
        updateHighlightBar(rx, -1, -1);
        $('regex-highlight-bar').classList.add('visible');
      } else {
        $('parsed-section').style.display = 'none';
        $('regex-highlight-bar').classList.remove('visible');
      }
    }

    function updateHighlightBar(rx, startI, endI) {
      const bar = $('regex-highlight-bar');
      bar.innerHTML = '';
      for (let i = 0; i < rx.length; i++) {
        const span = document.createElement('span');
        span.className = 'rh-char';
        span.textContent = rx[i];
        if (startI >= 0) {
          if (i >= startI && i <= endI) span.classList.add('active');
          else span.classList.add('dim');
        }
        bar.appendChild(span);
      }
    }

    $('regex-input').addEventListener('input', function () {
      // Get plain text content
      let text = this.textContent || '';
      
      // Format with superscript asterisks
      const formatted = text.replace(/\*/g, '<sup>*</sup>');
      
      // Only update if different to avoid cursor issues
      if (this.innerHTML !== formatted) {
        const selection = window.getSelection();
        const range = selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
        const offset = range ? range.startOffset : 0;
        
        this.innerHTML = formatted;
        
        // Restore cursor position
        try {
          const newRange = document.createRange();
          const textNode = this.firstChild || this;
          newRange.setStart(textNode, Math.min(offset, textNode.length || 0));
          newRange.collapse(true);
          selection.removeAllRanges();
          selection.addRange(newRange);
        } catch (e) {
          // Cursor restoration failed, ignore
        }
      }
      
      App.regex = text.trim();
      updateInput(App.regex);
    });

    function toggleDropdown(e) {
      if (e) e.stopPropagation();
      $('example-dropdown').classList.toggle('open');
    }

    function selectExample(val, label) {
      $('cs-selected-text').innerText = label;
      $('example-dropdown').classList.remove('open');
      if (!val) return;
      const inputEl = $('regex-input');
      inputEl.innerHTML = formatRegexWithSuperscript(val);
      App.regex = val;
      updateInput(val);
    }

    // Close dropdown on outside click
    window.addEventListener('click', () => {
      const dropdown = $('example-dropdown');
      if (dropdown) dropdown.classList.remove('open');
    });

    // ════════════════════════════════════════════════════════════
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
    //  PLAYBACK CONTROLS
    // ════════════════════════════════════════════════════════════
    function setSpeed(x) {
      App.speedMs = Math.round(1000 / x);
      $('speed-display').textContent = x + '×';
      document.querySelectorAll('.speed-chip').forEach(c => {
        c.classList.toggle('active', parseFloat(c.textContent) === x);
      });
      if (App.playing) { clearInterval(App.playTimer); startPlayTimer(); }
    }

    function togglePlay() {
      if (!App.enfaResult) {
        showToast('Generate automaton first');
        return;
      }
      
      if (App.stepMode) {
        showToast('Turn off Step-by-Step mode to Auto-Play');
        return;
      }
      
      if (App.playing) {
        stopPlay();
      } else {
        startPlay();
      }
    }

    function startPlay() {
      if (!App.pipelineSteps || App.pipelineSteps.length === 0) {
        buildPipelineSteps();
      }
      
      if (!App.pipelineSteps || App.pipelineSteps.length === 0) {
        showToast('No animation steps available');
        return;
      }
      
      if (App.pipelineIdx >= App.pipelineSteps.length - 1) {
        App.pipelineIdx = -1;
      }
      
      App.playing = true;
      setPlayIcon(true);
      startPlayTimer();
    }

    function startPlayTimer() {
      clearInterval(App.playTimer);
      
      // Immediately show first step
      if (App.pipelineIdx < 0) {
        App.pipelineIdx = 0;
        renderPipelineStep(App.pipelineSteps[App.pipelineIdx]);
        updateStepCounter();
      }
      
      App.playTimer = setInterval(() => {
        if (App.pipelineIdx >= App.pipelineSteps.length - 1) {
          stopPlay();
          showToast('Animation complete! ✓');
          return;
        }
        App.pipelineIdx++;
        renderPipelineStep(App.pipelineSteps[App.pipelineIdx]);
        updateStepCounter();
      }, App.speedMs);
    }

    function stopPlay() {
      App.playing = false;
      clearInterval(App.playTimer);
      setPlayIcon(false);
      $('pb-play').classList.remove('playing');
    }

    function restartPlay() {
      stopPlay();
      App.pipelineIdx = -1;
      
      // Rebuild steps for current stage
      buildPipelineSteps();
      
      if (App.pipelineSteps && App.pipelineSteps.length > 0) {
        App.pipelineIdx = 0;
        renderPipelineStep(App.pipelineSteps[0]);
        updateStepCounter();
      }
    }

    function stepFwd() {
      if (!App.pipelineSteps || App.pipelineSteps.length === 0) {
        buildPipelineSteps();
      }
      if (!App.pipelineSteps || App.pipelineSteps.length === 0) return;
      if (App.pipelineIdx >= App.pipelineSteps.length - 1) {
        showToast('Already at last step');
        return;
      }
      
      App.pipelineIdx++;
      renderPipelineStep(App.pipelineSteps[App.pipelineIdx]);
    }

    function stepBack() {
      if (!App.pipelineSteps || App.pipelineSteps.length === 0) {
        buildPipelineSteps();
      }
      if (!App.pipelineSteps || App.pipelineSteps.length === 0) return;
      if (App.pipelineIdx <= 0) {
        showToast('Already at first step');
        return;
      }
      
      App.pipelineIdx--;
      renderPipelineStep(App.pipelineSteps[App.pipelineIdx]);
    }

    function setPlayIcon(playing) {
      const pauseIcon = `<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>`;
      const playIcon = `<polygon points="5 3 19 12 5 21 5 3"/>`;
      const svg = playing ? pauseIcon : playIcon;
      $('play-svg').innerHTML = svg;
      if ($('float-play-icon')) $('float-play-icon').innerHTML = svg;
      if (playing) $('pb-play').classList.add('playing');
      else $('pb-play').classList.remove('playing');
    }

    function toggleStepMode() {
      App.stepMode = !App.stepMode;
      $('step-toggle').classList.toggle('on', App.stepMode);
      
      // If turning ON step mode, stop any playing animation
      if (App.stepMode && App.playing) {
        stopPlay();
      }
      
      // Reset to beginning when enabling step mode
      if (App.stepMode && App.pipelineSteps && App.pipelineSteps.length) {
        App.pipelineIdx = -1;
        showToast('Step-by-Step mode ON - use arrow buttons to navigate');
      } else if (!App.stepMode) {
        showToast('Step-by-Step mode OFF - use Play button for auto-animation');
      }
    }

    function updateStepCounter() {
      const total = App.pipelineSteps ? App.pipelineSteps.length : 0;
      const cur = total ? App.pipelineIdx + 1 : 0;
      const el = $('step-counter');
      if (!total) {
        el.textContent = App.enfaResult ? 'Ready — press Play' : 'No automaton generated';
        return;
      }
      const stageLabels = { regex: 'Regex', enfa: 'ε-NFA', nfa: 'NFA', dfa: 'DFA', mindfa: 'Min DFA' };
      const curStep = App.pipelineSteps[App.pipelineIdx];
      const stageLbl = curStep ? (stageLabels[curStep.stage] || '') : '';
      el.innerHTML = `${stageLbl ? `<span style="color:var(--primary)">${stageLbl}</span> — ` : ''}Step <span>${cur}</span> of <span>${total}</span>`;
    }

    // ════════════════════════════════════════════════════════════
    //  NODE TAP → ε-Closure visualizer
    // ════════════════════════════════════════════════════════════
    function onNodeTap(evt) {
      if (App.stage !== 'enfa' || !App.nfaResult) return;
      const nid = evt.target.id();
      if (nid === '__start__') return;
      const closure = App.nfaResult.closureMap[nid];
      if (!closure) return;

      const pos = evt.target.renderedPosition();
      const popup = $('closure-popup');
      $('closure-title').textContent = `ε-Closure(${nid})`;
      $('closure-states').textContent = '{ ' + closure.join(', ') + ' }';
      popup.style.left = (pos.x + 60) + 'px';
      popup.style.top = (pos.y - 10) + 'px';
      popup.classList.add('visible');

      cy.nodes().removeClass('highlighted');
      closure.forEach(s => cy.$(`#${s}`).addClass('highlighted'));
      cy.edges().removeClass('highlighted');
      setTimeout(() => { popup.classList.remove('visible'); cy.nodes().removeClass('highlighted'); }, 3500);
    }

    // ════════════════════════════════════════════════════════════
    //  EXPLANATION PANEL
    // ════════════════════════════════════════════════════════════
    const expData = {
      symbol: s => ({ title: `NFA for Symbol '${s.token}'`, desc: `Created a 2-state NFA fragment: ${s.desc}`, diagram: s.desc, why: `Thompson's Construction starts bottom-up. Each literal character becomes a minimal 2-state fragment.` }),
      concat: s => ({ title: 'Concatenation ( · )', desc: s.desc, diagram: 'A ──ε──▶ B', why: `Links the accept state of A to the start state of B via an ε-transition, forcing sequential matching.` }),
      union: s => ({ title: 'Union ( | )', desc: s.desc, diagram: 'new_start ──ε──▶ A\nnew_start ──ε──▶ B\nA ──ε──▶ new_end\nB ──ε──▶ new_end', why: `A new start state branches non-deterministically into both A and B. A shared accept state merges both.` }),
      star: s => ({ title: 'Kleene Star ( * )', desc: s.desc, diagram: 'new_start ──ε──▶ A.start\nA.end ──ε──▶ A.start  (loop)\nnew_start ──ε──▶ new_end  (bypass)\nA.end ──ε──▶ new_end', why: `Adds a bypass edge (zero repetitions) and a back-loop (repeat). Allows zero or more of A.` }),
      plus: s => ({ title: 'One or More ( + )', desc: s.desc, diagram: 'new_start ──ε──▶ A.start\nA.end ──ε──▶ A.start  (loop)\nA.end ──ε──▶ new_end', why: `Same as Kleene Star but without the bypass — must traverse A at least once.` }),
      optional: s => ({ title: 'Optional ( ? )', desc: s.desc, diagram: 'new_start ──ε──▶ A.start\nnew_start ──ε──▶ new_end  (bypass)\nA.end ──ε──▶ new_end', why: `Only adds a bypass. Zero or one occurrence. No back-loop.` }),
    };

    function updateExplanation(step, idx) {
      if (!step) return;
      const fn = expData[step.type];
      if (!fn) return;
      const d = fn(step);
      const explainContent = $('explain-content');
      if (!explainContent) return;
      explainContent.innerHTML = `
    <div class="exp-card">
      <div class="exp-step-badge">${idx + 1}</div>
      <div class="exp-title">${d.title}</div>
      <div class="exp-desc">${d.desc}</div>
      ${d.diagram ? `<div class="exp-diagram">${d.diagram.replace(/\n/g, '<br>')}</div>` : ''}
      <button class="why-btn" onclick="this.nextElementSibling.classList.toggle('open');this.textContent=this.nextElementSibling.classList.contains('open')?'▼ Hide reasoning':'▶ Why this step?'">▶ Why this step?</button>
      <div class="why-body">${d.why}</div>
    </div>
    <div class="exp-card" style="background:var(--surface-highest)">
      <div style="font-size:0.7rem;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--outline);margin-bottom:0.4rem">Fragment Stats</div>
      <div style="font-family:'JetBrains Mono',monospace;font-size:0.75rem;color:var(--primary)">
        States: ${step.frag ? fragStates(step.frag).length : '?'} &nbsp;|&nbsp; Transitions: ${step.frag ? step.frag.transitions.length : '?'}
      </div>
    </div>
  `;
    }

    // ════════════════════════════════════════════════════════════
    //  STACK VISUALIZER
    // ════════════════════════════════════════════════════════════
    function updateStack() {
      if (!App.enfaResult) return;
      const container = $('stack-items');
      if (!container) return;
      container.innerHTML = '';
      const ops = { symbol: 'Symbol', concat: 'Concat', union: 'Union', star: 'Star', plus: 'Plus', optional: 'Optional' };
      App.enfaResult.steps.forEach((s, i) => {
        const item = document.createElement('div');
        item.className = 'stack-item';
        const label = s.type === 'symbol' ? `NFA('${s.token}')` : `NFA(${ops[s.type]})`;
        item.innerHTML = `<span>${label}</span><span class="si-label">Step ${i + 1}</span>`;
        container.appendChild(item);
      });
    }

    // ════════════════════════════════════════════════════════════
    //  TABLES PANEL
    // ════════════════════════════════════════════════════════════
    function buildTablesPane() {
      const content = $('tables-content');
      let html = '';

      // ε-NFA to NFA Transition Table (with Closure and Moves)
      const nfaRes = App.nfaResult;
      if (nfaRes && nfaRes.conversionTable) {
        const alpha = nfaRes.alphabet;
        html += `<div class="data-table-wrap"><div class="dt-header">ε-NFA to NFA Conversion</div>
    <div style="overflow-x:auto"><table class="data-table"><thead><tr>
      <th>State</th>
      <th>ε-Closure</th>
      ${alpha.map(sym => `<th>Move(${sym})</th>`).join('')}
    </tr></thead><tbody>`;

        // We show all reachable states from the original ENFA that survived into the NFA (before merging)
        // or just the states that are in the conversion table
        for (const [s, moves] of Object.entries(nfaRes.conversionTable)) {
          const closure = nfaRes.closureMap[s] || [s];
          const isFinal = closure.includes(App.enfaResult.nfa.end.id);

          html += `<tr class="${isFinal ? 'final-r' : ''}">
        <td style="font-family:'JetBrains Mono',monospace;color:var(--primary);font-weight:600">${s}</td>
        <td style="font-size:0.65rem">{${closure.join(',')}}</td>
        ${alpha.map(sym => {
            const m = moves[sym] || [];
            return `<td style="font-size:0.65rem">${m.length ? '{' + m.join(',') + '}' : '∅'}</td>`;
          }).join('')}
      </tr>`;
        }
        html += '</tbody></table></div></div>';
      }

      // ε-Closure table
      html += `<div class="data-table-wrap" style="margin-top:0.75rem"><div class="dt-header">ε-Closure Table <span style="color:var(--outline);font-size:0.62rem">${Object.keys(App.nfaResult.closureMap).length} states</span></div>
  <div style="overflow-x:auto"><table class="data-table"><thead><tr><th>State</th><th>ε-Closure</th></tr></thead><tbody>`;
      for (const [s, cl] of Object.entries(App.nfaResult.closureMap)) {
        html += `<tr><td style="font-family:'JetBrains Mono',monospace;color:var(--primary);font-weight:600">${s}</td><td style="font-family:'JetBrains Mono',monospace;color:var(--on-surface-variant)">{${cl.join(', ')}}</td></tr>`;
      }
      html += '</tbody></table></div></div>';

      // DFA states
      html += `<div class="data-table-wrap" style="margin-top:0.75rem"><div class="dt-header">DFA States <span style="color:var(--outline);font-size:0.62rem">${App.dfaResult.states.length} states</span></div>
  <div style="overflow-x:auto"><table class="data-table"><thead><tr><th>ID</th><th>NFA States</th><th>Final?</th></tr></thead><tbody>`;
      for (const st of App.dfaResult.states) {
        html += `<tr class="${App.dfaResult.finals.includes(st.id) ? 'final-r' : ''}"><td style="font-family:'JetBrains Mono',monospace;color:var(--primary);font-weight:600">${st.id}</td><td style="font-family:'JetBrains Mono',monospace;font-size:0.7rem;color:var(--on-surface-variant)">{${st.nfaStates.join(',')}}</td><td>${App.dfaResult.finals.includes(st.id) ? '★ Yes' : '—'}</td></tr>`;
      }
      html += '</tbody></table></div></div>';

      // Minimized DFA
      html += `<div class="data-table-wrap" style="margin-top:0.75rem"><div class="dt-header">Minimized DFA <span style="color:var(--secondary);font-size:0.62rem">${App.minResult.states.length} states</span></div>
  <div style="overflow-x:auto"><table class="data-table"><thead><tr><th>ID</th><th>Merged From</th><th>Final?</th></tr></thead><tbody>`;
      for (const st of App.minResult.states) {
        html += `<tr class="${App.minResult.finals.includes(st.id) ? 'final-r' : ''}"><td style="font-family:'JetBrains Mono',monospace;color:var(--primary);font-weight:600">${st.id}</td><td style="font-family:'JetBrains Mono',monospace;font-size:0.7rem;color:var(--on-surface-variant)">{${st.mergedFrom.join(',')}}</td><td>${App.minResult.finals.includes(st.id) ? '★ Yes' : '—'}</td></tr>`;
      }
      html += '</tbody></table></div></div>';

      if (content) content.innerHTML = html;
    }

    // ════════════════════════════════════════════════════════════
    //  SIMULATION
    // ════════════════════════════════════════════════════════════
    function setSimMode(mode) {
      App.simMode = mode;
      document.querySelectorAll('.mode-chip').forEach(c => c.classList.remove('active'));
      $(`mc-${mode}`).classList.add('active');
    }

    function openSimModal(dir) {
      App.simDir = dir;
      if (!App.dfaResult) { showToast('Generate automaton first'); return; }
      $('modal-title').textContent = dir === 'forward' ? 'Automata Simulation' : 'Reverse Simulation';
      $('modal-result').className = 'modal-result';
      $('modal-trace').style.display = 'none';
      $('sim-input').value = '';
      $('sim-modal').classList.add('open');
    }

    function closeModal() { $('sim-modal').classList.remove('open'); }

    function runSim() {
      const str = $('sim-input').value;
      const automaton = App.simMode === 'mindfa' ? App.minResult : App.dfaResult;
      if (!automaton) return;

      let result;
      if (App.simDir === 'reverse') result = reverseSim(automaton, str);
      else result = simulate(automaton, str);

      const resultEl = $('modal-result');
      if (result.accepted) {
        resultEl.className = 'modal-result accepted';
        $('modal-icon').textContent = '✅';
        $('modal-result-text').textContent = `"${str}" is ACCEPTED`;
      } else {
        resultEl.className = 'modal-result rejected';
        $('modal-icon').textContent = '❌';
        $('modal-result-text').textContent = `"${str}" is REJECTED`;
      }

      $('modal-trace').style.display = '';
      const steps = (App.simDir === 'reverse' && result.reversed) ? result.revSteps : result.steps;
      const traceLog = $('trace-log');
      traceLog.innerHTML = '';
      steps.forEach(s => {
        const div = document.createElement('div');
        div.className = 'trace-step';
        if (s.to === null)
          div.innerHTML = `<span class="t-num">${s.step}.</span><span class="t-from">${s.from}</span><span class="t-arrow"> ─(</span><span class="t-via">${s.sym}</span><span class="t-paren">)→ </span><span class="t-err">No transition (REJECT)</span>`;
        else
          div.innerHTML = `<span class="t-num">${s.step}.</span><span class="t-from">${s.from}</span><span class="t-arrow"> ─(</span><span class="t-via">${s.sym}</span><span class="t-paren">)→ </span><span class="t-to">${s.to}</span>`;
        traceLog.appendChild(div);
      });

      $('trace-info').style.display = 'flex';
      $('tb-state').textContent = result.finalState;
      $('tb-verdict').textContent = result.accepted ? '✓ Accepted' : '✗ Rejected';
      $('tb-verdict').style.color = result.accepted ? 'var(--secondary)' : 'var(--tertiary)';

      if (App.simDir === 'reverse' && result.reversed && result.path) {
        $('rev-path-section').style.display = '';
        $('rev-path').innerHTML = result.path.map((s, i) => {
          if (i === result.path.length - 1) return `<span class="rev-state">${s}</span>`;
          const sym = result.revSteps && result.revSteps[i] ? result.revSteps[i].sym : '';
          return `<span class="rev-state">${s}</span><span class="rev-sym">(${sym})</span><span class="rev-arrow">←</span>`;
        }).join('');
      } else {
        $('rev-path-section').style.display = 'none';
      }
    }

    function quickTest() {
      const str = $('quick-input').value;
      const automaton = App.dfaResult || App.minResult;
      if (!automaton) { showToast('Generate automaton first'); return; }
      const r = simulate(automaton, str);
      const el = $('quick-result');
      el.className = 'quick-result ' + (r.accepted ? 'accepted' : 'rejected');
      el.textContent = r.accepted ? `✓ "${str}" ACCEPTED` : `✗ "${str}" REJECTED`;
    }

    // ════════════════════════════════════════════════════════════
    //  COMPARE MODE
    // ════════════════════════════════════════════════════════════
    function compareMode() {
      if (!App.enfaResult) { showToast('Generate automaton first'); return; }
      const cur = App.stage;
      if (cur === 'enfa') switchTab('mindfa');
      else switchTab('enfa');
    }

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

    document.addEventListener('keydown', e => {
      if ($('pres-mode').classList.contains('open')) {
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') presNav(1);
        if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') presNav(-1);
        if (e.key === 'Escape') closePres();
      }
      if ($('sim-modal').classList.contains('open') && e.key === 'Escape') closeModal();
    });

    $('sim-modal').addEventListener('click', e => { if (e.target === $('sim-modal')) closeModal(); });
    $('sim-input').addEventListener('keydown', e => { if (e.key === 'Enter') runSim(); });
    $('quick-input').addEventListener('keydown', e => { if (e.key === 'Enter') quickTest(); });
    $('regex-input').addEventListener('keydown', e => { if (e.key === 'Enter') generateAutomaton(); });

    // ════════════════════════════════════════════════════════════
    //  THEORY PANEL
    // ════════════════════════════════════════════════════════════
    const CONCEPTS = [
      { title: 'Regular Expression', def: 'A sequence of characters defining a search pattern. Uses union (|), concatenation, Kleene star (*), and grouping to describe regular languages.' },
      { title: "Thompson's Construction", def: "Converts a regex to an ε-NFA by building fragment NFAs for each symbol and combining them. Produces a minimal-structure ε-NFA." },
      { title: 'ε-NFA', def: "A non-deterministic finite automaton allowing transitions on the empty string ε. Thompson's always produces an ε-NFA." },
      { title: 'ε-Closure', def: 'All states reachable from a state using only ε-transitions. Essential for subset construction.' },
      { title: 'NFA', def: 'Non-deterministic FA: multiple transitions per symbol allowed. Can be in multiple states simultaneously.' },
      { title: 'DFA', def: 'Deterministic FA: exactly one transition per (state, symbol) pair. No ε-transitions. Directly implementable.' },
      { title: 'Subset Construction', def: 'Converts NFA to DFA. Each DFA state represents a set of NFA states. May cause exponential state blowup.' },
      { title: 'DFA Minimization', def: "Reduces a DFA to its smallest equivalent. Merges indistinguishable states. Uses Hopcroft's algorithm (table-filling)." },
      { title: 'Kleene Star (*)', def: 'L* = {ε} ∪ L ∪ LL ∪ LLL ∪ … — zero or more repetitions of any string in language L.' },
    ];

    function buildTheory() {
      const list = $('theory-list');
      if (!list) return;
      list.innerHTML = '';
      CONCEPTS.forEach(c => {
        const div = document.createElement('div');
        div.className = 'concept-item';
        div.innerHTML = `<div class="concept-title">${c.title}</div><div class="concept-def">${c.def}</div>`;
        div.onclick = () => div.querySelector('.concept-def').classList.toggle('open');
        list.appendChild(div);
      });
    }

    // ════════════════════════════════════════════════════════════
    //  THEME
    // ════════════════════════════════════════════════════════════
    let themeMode = 0;
    const themes = [
      { name: 'Light', vars: null },
      {
        name: 'Dark', vars: {
          '--surface': '#0f1117', '--surface-low': '#161b26', '--surface-high': '#1e2535',
          '--surface-highest': '#1a2032', '--surface-lowest': '#1e2535',
          '--on-surface': '#e8eaf2', '--on-surface-variant': '#a8b0c0',
          '--outline': '#6b7385', '--outline-variant': '#2d3548',
          '--primary': '#4d9bff', '--primary-container': '#2563eb',
          '--secondary': '#4ade80', '--tertiary': '#f87171',
        }
      },
    ];

    const SUN_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`;
    const MOON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;

    function cycleTheme() {
      themeMode = (themeMode + 1) % themes.length;
      const theme = themes[themeMode];
      const isDark = themeMode === 1;
      $('theme-btn').innerHTML = isDark ? MOON_SVG : SUN_SVG;
      const root = document.documentElement.style;
      Object.keys(themes[1].vars).forEach(k => root.removeProperty(k));
      if (theme.vars) Object.entries(theme.vars).forEach(([k, v]) => root.setProperty(k, v));
      if (cy) {
        cy.style()
          .selector('node')
          .style({
            'text-outline-width': 0,
            'color': '#190933',
          })
          .selector('edge')
          .style({
            'text-background-color': isDark ? '#1e2535' : '#ecebe4',
            'color': isDark ? '#e8eaf2' : '#190933'
          })
          .update();
      }
      showToast(`${theme.name} mode`);
    }

    // ════════════════════════════════════════════════════════════
    //  RESET
    // ════════════════════════════════════════════════════════════
    function resetAll() {
      stopPlay();
      
      App.regex = '';
      App.postfix = '';
      App.enfaResult = null;
      App.nfaResult = null;
      App.dfaResult = null;
      App.minResult = null;
      App.pipelineSteps = [];
      App.pipelineIdx = -1;
      App.stepMode = false;
      App.playing = false;

      _layoutPositions = {};
      _addedEdgeKeys.clear();

      const inputEl = $('regex-input');
      inputEl.innerHTML = '';
      inputEl.className = '';
      $('validation-msg').textContent = '';
      $('input-icon').textContent = '';
      $('regex-highlight-bar').classList.remove('visible');
      if ($('parsed-section')) $('parsed-section').style.display = 'none';

      $('st-enfa').textContent = '—';
      $('st-dfa').textContent = '—';
      $('st-min').textContent = '—';
      $('step-counter').textContent = 'No automaton generated';
      $('step-toggle').classList.remove('on');

      if (cy) cy.elements().remove();

      if ($('stack-items')) {
        $('stack-items').innerHTML = '<div class="not-ready">Generate automaton to see the stack.</div>';
      }
      if ($('tables-content')) {
        $('tables-content').innerHTML = '<div class="not-ready">Generate automaton to see computed tables.</div>';
      }
      if ($('explain-content')) {
        $('explain-content').innerHTML = `
          <div class="exp-card">
            <div class="exp-title">Welcome to AutoCurate</div>
            <div class="exp-desc">
              This tool visualizes the complete conversion pipeline:<br><br>
              <strong>RegEx → <span class="low-sym">ε</span>-NFA → NFA → DFA → Minimized DFA</strong><br><br>
              Enter a regular expression in the left panel and click <em>Generate Automaton</em>.
            </div>
          </div>
        `;
      }

      switchRP('explain');
      enablePlayback(false);
      setPlayIcon(false);

      ['enfa', 'nfa', 'dfa', 'mindfa'].forEach(t => {
        const cr = $(`crumb-${t}`);
        if (cr) cr.className = 'crumb-btn';
      });
      
      App.stage = 'regex';
      const cReg = $('crumb-regex');
      if (cReg) cReg.className = 'crumb-btn active';
      
      $('regex-canvas-display').style.display = 'none';
      $('cy').style.display = 'none';
      $('canvas-float').classList.remove('visible');
      $('canvas-badge').classList.remove('visible');
      $('empty-state').style.display = 'flex';

      showToast('Reset complete');
    }


    // ════════════════════════════════════════════════════════════
    //  INIT
    // ════════════════════════════════════════════════════════════
    //  INIT - Moved to main.js
    // ════════════════════════════════════════════════════════════