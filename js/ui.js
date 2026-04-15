// ════════════════════════════════════════════════════════════
//  UI HELPERS
// ════════════════════════════════════════════════════════════
// Note: $(id) function is defined in app.js as it's needed by all files

    function showToast(msg) {
      const el = document.createElement('div');
      el.className = 'toast';
      el.textContent = msg;
      $('toast-wrap').appendChild(el);
      setTimeout(() => el.remove(), 3300);
    }

    function switchRP(name) {
      document.querySelectorAll('.rp-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.rp-pane').forEach(p => p.classList.remove('active'));
      $(`rt-${name}`).classList.add('active');
      $(`rp-${name}`).classList.add('active');
    }

    function setBadge(text) {
      const b = $('canvas-badge');
      b.textContent = text;
      b.classList.add('visible');
    }

    function showCY() {
      $('empty-state').style.display = 'none';
      $('cy').style.display = 'block';
      $('canvas-float').classList.add('visible');
    }

    function hideCY() {
      $('empty-state').style.display = '';
      $('cy').style.display = 'none';
      $('canvas-float').classList.remove('visible');
      $('canvas-badge').classList.remove('visible');
    }

    // ════════════════════════════════════════════════════════════