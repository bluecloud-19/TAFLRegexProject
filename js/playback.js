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