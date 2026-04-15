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