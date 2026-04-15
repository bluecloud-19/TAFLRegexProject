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
