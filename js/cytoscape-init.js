// ════════════════════════════════════════════════════════════
//  CYTOSCAPE GRAPH ENGINE
// ════════════════════════════════════════════════════════════
// Note: cy and prescy variables are declared in app.js

const CY_STYLE = [
      {
        selector: 'node', style: {
          'width': 72, 'height': 72,
          'background-color': '#ffffff',
          'border-color': '#665687', 'border-width': 1.5,
          'label': 'data(label)',
          'color': '#190933',
          'font-family': 'Inter, sans-serif', 'font-size': 18, 'font-weight': '700',
          'text-valign': 'center', 'text-halign': 'center',
          'text-wrap': 'ellipsis', 'text-max-width': '68px',
          'text-outline-width': 2, 'text-outline-color': '#ffffff',
          'transition-property': 'background-color, border-color, border-width',
          'transition-duration': '280ms',
        }
      },
      {
        selector: 'node[?isStart]',
        style: {
          'border-width': 5, 'border-color': '#4caf50',
          'outline-width': 1.5, 'outline-color': '#665687', 'outline-offset': 0,
          'background-color': '#f5f4f0'
        }
      },
      {
        selector: 'node[?isFinal]',
        style: {
          'border-width': 5, 'border-color': '#f44336',
          'outline-width': 1.5, 'outline-color': '#665687', 'outline-offset': 0,
          'background-color': '#f5f4f0'
        }
      },
      {
        selector: 'node[?isStartFinal]',
        style: {
          'border-width': 5, 'border-color': '#4caf50',
          'outline-width': 1.5, 'outline-color': '#f44336', 'outline-offset': 1.5,
          'background-color': '#f5f4f0'
        }
      },
      { selector: 'node.highlighted', style: { 'background-color': '#80a4ed', 'border-color': '#665687', 'border-width': 3 } },
      { selector: 'node.dead-state', style: { 'border-style': 'dashed', 'border-color': '#665687', 'background-color': '#f5f4f0', 'opacity': 0.8 } },
      { selector: 'node#__start__', style: { 'width': 0, 'height': 0, 'opacity': 0 } },
      {
        selector: 'edge', style: {
          'width': 1.5,
          'line-color': '#665687', 'target-arrow-color': '#665687',
          'target-arrow-shape': 'triangle', 'curve-style': 'bezier',
          'label': 'data(label)',
          'font-size': 14, 'font-family': 'Inter, sans-serif',
          'color': '#190933',
          'text-background-color': '#ecebe4', 'text-background-opacity': 1, 'text-background-padding': '4px',
          'edge-text-rotation': 'none',
          'control-point-step-size': 60,
          'transition-property': 'line-color, target-arrow-color, width',
          'transition-duration': '280ms',
        }
      },
      { selector: 'edge[?isEps]', style: { 'line-style': 'dashed', 'line-color': '#80a4ed', 'target-arrow-color': '#80a4ed', 'line-dash-pattern': [5, 3], 'color': '#665687' } },
      { selector: 'edge.highlighted', style: { 'line-color': '#80a4ed', 'target-arrow-color': '#80a4ed', 'width': 2.5, 'color': '#665687' } },
      { selector: 'edge#__starrow__', style: { 'line-color': '#80a4ed', 'target-arrow-color': '#80a4ed', 'width': 2, 'label': '' } },
      { selector: 'edge[source = target]', style: { 'loop-direction': '-45deg', 'loop-sweep': '90deg', 'control-point-step-size': 50 } },
    ];

    function initCY(container) {
      if (typeof cytoscape === 'undefined') return null;
      try { cytoscape.use(cytoscapeDagre); } catch (e) { }
      return cytoscape({
        container,
        elements: [],
        style: CY_STYLE,
        layout: { name: 'preset' },
        minZoom: 0.15, maxZoom: 5,
        userZoomingEnabled: true, userPanningEnabled: true,
      });
    }

    function buildElements(automaton, type) {
      const els = [];
      let stateList, startId, finalIds, transList;

      if (type === 'enfa') {
        const f = automaton.nfa || automaton;
        stateList = fragStates(f);
        startId = f.start.id;
        finalIds = [f.end.id];
        transList = f.transitions;
      } else {
        stateList = (automaton.states || []).map(s => typeof s === 'string' ? s : s.id);
        startId = automaton.start;
        finalIds = automaton.finals || [];
        transList = automaton.transitions || [];
      }

      // Group parallel edges
      const edgeMap = new Map();
      for (const t of transList) {
        const k = `${t.from}___${t.to}`;
        if (!edgeMap.has(k)) edgeMap.set(k, { from: t.from, to: t.to, syms: [] });
        edgeMap.get(k).syms.push(t.symbol);
      }

      for (const sid of stateList) {
        const isStart = sid === startId;
        const isFinal = finalIds.includes(sid);
        const nodeData = automaton.states ? automaton.states.find(s => s.id === sid) : null;
        const classes = (nodeData && nodeData.classes) ? nodeData.classes : '';

        els.push({
          data: {
            id: sid, label: sid,
            isStart: (isStart && !isFinal) || undefined,
            isFinal: (!isStart && isFinal) || undefined,
            isStartFinal: (isStart && isFinal) || undefined,
          },
          classes: classes
        });
      }

      let ei = 0;
      for (const [, e] of edgeMap) {
        const isEps = e.syms.every(s => s === 'ε');
        els.push({ data: { id: `e_${ei++}`, source: e.from, target: e.to, label: e.syms.join(', '), isEps: isEps || undefined } });
      }

      return els;
    }

    function renderGraph(automaton, type, cyInstance) {
      const c = cyInstance || cy;
      if (!c) return;

      const els = buildElements(automaton, type);
      c.elements().remove();
      c.add(els);

      const startId = type === 'enfa' ? (automaton.nfa || automaton).start.id : automaton.start;
      c.add({ data: { id: '__start__', label: '' } });
      c.add({ data: { id: '__starrow__', source: '__start__', target: startId, label: '' } });

      // Curved edges for loops and bidirectional pairs
      const pairCount = {};
      c.edges().forEach(e => {
        const k = [e.source().id(), e.target().id()].sort().join('__');
        pairCount[k] = (pairCount[k] || 0) + 1;
      });
      c.edges().forEach(e => {
        if (e.source().id() === e.target().id())
          e.style({ 'curve-style': 'bezier', 'loop-direction': '-45deg', 'loop-sweep': '45deg' });
        const k = [e.source().id(), e.target().id()].sort().join('__');
        if (pairCount[k] > 1)
          e.style({ 'curve-style': 'bezier', 'control-point-step-size': 50 });
      });

      runLayout(c, type);
    }

    function runLayout(c, type) {
      if (!c) return;
      let layout;
      try {
        // Use better spacing and ranker for minimized DFA
        const isMinDFA = type === 'mindfa';
        const nodeSep = isMinDFA ? 200 : 120;
        const rankSep = isMinDFA ? 300 : 200;
        const edgeSep = isMinDFA ? 100 : 60;
        const ranker = isMinDFA ? 'longest-path' : 'network-simplex';
        
        console.log('Layout type:', type, 'isMinDFA:', isMinDFA, 'nodeSep:', nodeSep, 'rankSep:', rankSep, 'ranker:', ranker);
        
        layout = c.layout({ 
          name: 'dagre', 
          rankDir: 'LR', 
          nodeSep: nodeSep, 
          rankSep: rankSep, 
          edgeSep: edgeSep, 
          ranker: ranker,
          animate: true, 
          animationDuration: 350, 
          animationEasing: 'ease-out', 
          padding: 100 
        });
      } catch (e) {
        layout = c.layout({ name: 'breadthfirst', directed: true, padding: 100, animate: true });
      }
      layout.run();
      setTimeout(() => smartFit(c, 100), 450);
    }

    function fitGraph() { if (cy) smartFit(cy, 50); }
    function zoomIn() { if (cy) cy.zoom({ level: cy.zoom() * 1.3, renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } }); }
    function zoomOut() { if (cy) cy.zoom({ level: cy.zoom() * 0.77, renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } }); }

    function toggleFullscreen() {
      const canvasWrap = $('canvas-wrap');
      if (!canvasWrap) return;
      
      if (!document.fullscreenElement) {
        // Enter fullscreen
        if (canvasWrap.requestFullscreen) {
          canvasWrap.requestFullscreen();
        } else if (canvasWrap.webkitRequestFullscreen) {
          canvasWrap.webkitRequestFullscreen();
        } else if (canvasWrap.msRequestFullscreen) {
          canvasWrap.msRequestFullscreen();
        }
      } else {
        // Exit fullscreen
        if (document.exitFullscreen) {
          document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
          document.webkitExitFullscreen();
        } else if (document.msExitFullscreen) {
          document.msExitFullscreen();
        }
      }
    }

    // Listen for fullscreen changes to resize the graph
    document.addEventListener('fullscreenchange', () => {
      setTimeout(() => {
        if (cy) {
          cy.resize();
          smartFit(cy, 50);
        }
      }, 100);
    });
    document.addEventListener('webkitfullscreenchange', () => {
      setTimeout(() => {
        if (cy) {
          cy.resize();
          smartFit(cy, 50);
        }
      }, 100);
    });