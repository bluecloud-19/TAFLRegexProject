// ════════════════════════════════════════════════════════════
//  NFA CONSTRUCTION (Glushkov / Position-based)
//  This builds a minimal NFA directly from the regex tree by
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
