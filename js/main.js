//  INIT
    // ════════════════════════════════════════════════════════════
    document.addEventListener('DOMContentLoaded', () => {
      // Register dagre plugin once
      if (typeof cytoscapeDagre !== 'undefined') {
        try { cytoscape.use(cytoscapeDagre); } catch (e) { }
      }

      // Defer cytoscape init so the container has a layout
      setTimeout(() => {
        try {
          cy = initCY($('cy'));
          if (cy) {
            cy.on('tap', 'node', onNodeTap);
            cy.on('tap', e => { if (e.target === cy) $('closure-popup').classList.remove('visible'); });
          }
        } catch (e) { console.warn('CY init:', e); }
      }, 300);

      enablePlayback(false);
      buildTheory();
      showToast('Ready — enter a regex and click Generate Automaton');
    });