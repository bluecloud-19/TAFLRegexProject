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