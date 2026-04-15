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

function fragStates(frag) {
  const ids = new Set([frag.start.id, frag.end.id]);
  for (const t of frag.transitions) { ids.add(t.from); ids.add(t.to); }
  return [...ids];
}
