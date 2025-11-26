// ==============================
//  MAIN PAGE CONFIG
// ==============================
// Disable browser's automatic scroll restoration on reload
if ("scrollRestoration" in history) {
  history.scrollRestoration = "manual";
} 
// Keyboard key to trigger space entry
const CONFIG = {
    LOADER_KEY: "Space",       
    SCROLL_TARGET_ID: "landing-page",
  };
  // ==============================
  //  HELPER: SMOOTH SCROLL
  // ==============================
  function smoothScrollToElement(el) {
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const offset = window.pageYOffset || document.documentElement.scrollTop;
    const targetY = rect.top + offset;
  
    window.scrollTo({
      top: targetY,
      behavior: "smooth",
    });
  }
  
  // ==============================
  //  TYPEWRITER FOR MULTI ELEMENTS (ABOUT + SERVICES)
  // ==============================
  
  function singleTypewriterNoBump(el, speed = 2) {
    if (!el) return;
    const paragraphs = Array.from(el.querySelectorAll("p"));
    if (paragraphs.length === 0) return;
  
    // Store full text
    const texts = paragraphs.map(p => p.textContent.trim());
  
    // Freeze container height so layout doesn't jump
    const containerHeight = el.offsetHeight;
    el.style.minHeight = containerHeight + "px";
  
    // Clear text
    paragraphs.forEach(p => {
      p.textContent = "";
    });
  
    let currentPara = 0;
    let charIndex = 0;
  
    // Cursor on first paragraph
    paragraphs[0].classList.add("typewriter-cursor");
  
    function type() {
      const para = paragraphs[currentPara];
      const fullText = texts[currentPara];
  
      para.textContent = fullText.slice(0, charIndex);
      charIndex++;
  
      if (charIndex <= fullText.length) {
        // type next character
        setTimeout(type, speed);
      } else {
        // finished this paragraph
        para.classList.remove("typewriter-cursor");
  
        currentPara++;
        charIndex = 0;
  
        if (currentPara < paragraphs.length) {
          // move cursor to next paragraph and keep going
          paragraphs[currentPara].classList.add("typewriter-cursor");
          setTimeout(type, speed); // ← keep same speed between paras
        } else {
          // leave cursor on last para
          paragraphs[paragraphs.length - 1].classList.add("typewriter-cursor");
        }
      }
    }
  
    // start typing
    type();
  }
  
  

  // --------------------------------------------
  //  SIMPLE TYPEWRITER FOR TAGLINES / SUBTITLES
  // --------------------------------------------
  
  function typewriter(element, text, speed = 4) {
    if (!element || !text) return;
  
    // --- NO-BUMP SETUP ---
    // Temporarily set full text to measure final height
    const previousText = element.textContent;
    element.textContent = text;
  
    const finalHeight = element.offsetHeight;
    element.style.minHeight = finalHeight + "px";
  
    // Clear to start typing from empty
    element.textContent = "";
    // (optional) restore previousText somewhere if you ever need it
    // ---------------------------------
  
    let index = 0;
  
    function step() {
      // Use slice so we always have the right substring
      element.textContent = text.slice(0, index + 1);
      index++;
  
      if (index < text.length) {
        setTimeout(step, speed);
      }
    }
  
    step();
  }
  
  
  // Start Duality subtitle typewriter on demand
  function startDualitySubtitleTypewriter() {
    const el = document.getElementById("dualitySubtitle");
    if (!el) return;
  
    const text = el.textContent.trim();
    typewriter(el, text, 4); // speed = 100ms per character
  }
   

  /* =======================================================
   ULTRA FAST + NO BUMP MULTI-PARAGRAPH TYPEWRITER
   FOR TERRA-DEFINITION
   ======================================================= */

function ultraFastNoBumpTerraTypewriter(container, speed = 4) {
  if (!container) return;

  const paragraphs = Array.from(container.querySelectorAll("p"));
  if (paragraphs.length === 0) return;

  /* -------------------------------------
     STEP 1 — NO-BUMP HEIGHT LOCK
     ------------------------------------- */
  // Capture final height BEFORE clearing text
  const originalHTML = container.innerHTML;     // store content
  const heightBefore = container.offsetHeight;  // measure size

  // Freeze container height
  container.style.minHeight = heightBefore + "px";

  // Restore full content immediately (so height stays accurate)
  container.innerHTML = originalHTML;

  // Re-select paragraphs since we replaced HTML
  const ps = Array.from(container.querySelectorAll("p"));

  // Extract clean text
  const textBlocks = ps.map(p => p.textContent.trim());

  // Clear all paragraphs for typing
  ps.forEach(p => p.textContent = "");

  /* -------------------------------------
     STEP 2 — ULTRA FAST SEQUENTIAL TYPE
     ------------------------------------- */
  let pIndex = 0;
  let charIndex = 0;

  function type() {
    const currentP = ps[pIndex];
    const fullText = textBlocks[pIndex];

    currentP.textContent = fullText.slice(0, charIndex);
    charIndex++;

    if (charIndex <= fullText.length) {
      setTimeout(type, speed);      // FAST typing
    } else {
      // Finished this paragraph
      pIndex++;
      charIndex = 0;

      if (pIndex < ps.length) {
        setTimeout(type, speed);    // No pause between paragraphs
      }
    }
  }

  type();
}



// ===============================================
//  ULTRA FAST, NO-BUMP TYPEWRITER FOR #terra-def
// ===============================================
function ultraFastNoBumpTerraTypewriter(container, totalDurationMs = 2500) {
  if (!container) return;

  // Get all paragraphs inside terra-def
  const paragraphs = Array.from(container.querySelectorAll("p"));
  if (paragraphs.length === 0) return;

  // ---- NO-BUMP: lock container height before clearing ----
  const containerHeight = container.offsetHeight;
  container.style.minHeight = containerHeight + "px";

  // Save all the text
  const texts = paragraphs.map(p => p.textContent);

  // Clear text for typing
  paragraphs.forEach(p => (p.textContent = ""));

  // Total number of characters across all paragraphs
  const totalChars = texts.reduce((sum, t) => sum + t.length, 0);

  let startTime = null;

  function frame(timestamp) {
    if (startTime === null) startTime = timestamp;
    const elapsed = timestamp - startTime;
    const progress = Math.min(elapsed / totalDurationMs, 1); // 0 → 1 over duration

    // How many characters should be visible at this time
    const targetChars = Math.floor(totalChars * progress);
    let remaining = targetChars;

    // Fill each paragraph in order
    for (let i = 0; i < paragraphs.length; i++) {
      const full = texts[i];
      const len = full.length;
      const take = Math.min(remaining, len);

      paragraphs[i].textContent = full.slice(0, take);
      remaining -= take;
    }

    if (progress < 1) {
      requestAnimationFrame(frame);
    }
  }

  requestAnimationFrame(frame);
}

// Start terra definition typewriter on demand (after 3D sequence finishes)
function startTerraDefinitionTypewriter() {
  const terra = document.getElementById("terra-def");
  if (terra) ultraFastNoBumpTerraTypewriter(terra, 4500); // 2s total, tweak to taste
}





  // ------------------------------
// Menu logic
// ------------------------------
function initMenu() {
    const menuToggle   = document.querySelector(".menu-toggle");
    const menuOverlay  = document.querySelector(".menu-overlay");
    const body         = document.body;
  
    if (!menuToggle || !menuOverlay) return;
  
    // Views
    const rootView    = document.getElementById("menuRoot");
    const contactView = document.getElementById("menuContact");
    const mediaView   = document.getElementById("menuMedia");
  
    const menuOptions = menuOverlay.querySelectorAll(".menu-option");   // Contact / Media buttons
    const backButtons = menuOverlay.querySelectorAll("[data-back]");    // ← Back buttons
    const menuLinks   = menuOverlay.querySelectorAll("a");              // Email / Instagram / etc.
  
    function showView(name) {
      if (rootView)    rootView.style.display    = "none";
      if (contactView) contactView.style.display = "none";
      if (mediaView)   mediaView.style.display   = "none";
  
      if (name === "root"    && rootView)    rootView.style.display    = "flex";
      if (name === "contact" && contactView) contactView.style.display = "flex";
      if (name === "media"   && mediaView)   mediaView.style.display   = "flex";
    }
  
    function openMenu() {
      menuOverlay.classList.add("open");
      body.style.overflow = "hidden";
      showView("root"); // always start from root
    }
  
    function closeMenu() {
      menuOverlay.classList.remove("open");
      body.style.overflow = "";
      showView("root");
    }
  
    // Toggle open/close
    menuToggle.addEventListener("click", (e) => {
      e.stopPropagation();
      if (menuOverlay.classList.contains("open")) {
        closeMenu();
      } else {
        openMenu();
      }
    });
  
    // Click outside menu closes it
    document.addEventListener("click", (e) => {
      if (!menuOverlay.contains(e.target) && e.target !== menuToggle) {
        if (menuOverlay.classList.contains("open")) {
          closeMenu();
        }
      }
    });
  
    // Root options → switch view
    menuOptions.forEach((btn) => {
      btn.addEventListener("click", () => {
        const viewName = btn.dataset.view; // "contact" or "media"
        if (viewName) showView(viewName);
      });
    });
  
    // Back buttons → go to root
    backButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        showView("root");
      });
    });
  
    // Clicking any link (email / instagram / etc.) closes the menu
    menuLinks.forEach((link) => {
      link.addEventListener("click", () => {
        closeMenu();
      });
    });
  }



// Trigger only when the section scrolls into view
const serviceObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        typewriterServices();
        serviceObserver.disconnect(); // run once only
      }
    });
  },
  { threshold: 0.15 }
);

// Observe first services section
const firstService = document.querySelector("section.services");
if (firstService) serviceObserver.observe(firstService);
  
  // ------------------------------
  // Smooth scroll for in-page nav
  // ------------------------------
  function initSmoothScroll() {
    const links = document.querySelectorAll("a[href^='#']");
  
    links.forEach((link) => {
      link.addEventListener("click", (e) => {
        const href = link.getAttribute("href");
        const id = href && href.substring(1);
        const target = id ? document.getElementById(id) : null;
  
        if (target) {
          e.preventDefault();
          smoothScrollToElement(target);
        }
      });
    });
  }
  
  // ------------------------------
  // Audio Player for the track / typewriter
  // ------------------------------
  // ------------------------------
// Audio Player for the track / typewriter
// ------------------------------
// function initAudioPlayer() {
//   const audioElement = document.getElementById("site-audio");
//   const playButton   = document.getElementById("audio-toggle");
//   const trackInfo    = document.querySelector(".track-info");

//   if (!audioElement || !playButton || !trackInfo) return;

//   let isPlaying = false;
//   const trackText = "This composition was written, produced, mixed, and mastered by Jordan Levi Sax using Ableton Live 12.2 and Wavestation VST | Levi - ‘Terrarium’ Now Playing |";

//   // where to jump when SPACE is pressed
//   const JUMP_TIME = 95.95;

//   // simple local typewriter for the track label
//   function startTrackTypewriter() {
//     // only run once
//     if (trackInfo.dataset.typed === "true") return;
//     trackInfo.dataset.typed = "true";

//     let index = 0;
//     trackInfo.textContent = "";

//     function step() {
//       // if user mutes, stop typing
//       if (!isPlaying) return;

//       trackInfo.textContent = trackText.slice(0, index);
//       index++;

//       if (index <= trackText.length) {
//         setTimeout(step, 30); // typing speed
//       }
//     }

//     step();
//   }

//   function updateUI() {
//     if (isPlaying) {
//       playButton.textContent = "Mute";
//       trackInfo.classList.add("playing");
//       startTrackTypewriter();      // kick off the little “produced by” typewriter
//     } else {
//       playButton.textContent = "Unmute";
//       trackInfo.classList.remove("playing");
//       // we DON'T clear the text so it stays visible once fully typed
//     }
//   }

//   // 🔊 Click on Unmute / Mute button
//   playButton.addEventListener("click", () => {
//     isPlaying = !isPlaying;

//     if (isPlaying) {
//       audioElement.play().catch(() => {
//         isPlaying = false;
//         updateUI();
//       });
//     } else {
//       audioElement.pause();
//     }

//     updateUI();
//   });

//   // 🔊 SPACE BAR: jump & play in sync with button state
//   window.addEventListener("keydown", (e) => {
//     if (e.code === "Space" || e.key === " ") {
//       // loader key handler also calls preventDefault,
//       // but calling it twice is harmless
//       e.preventDefault();

//       // jump to the spot
//       audioElement.currentTime = JUMP_TIME;

//       if (!isPlaying) {
//         // start playing + sync button
//         isPlaying = true;
//         audioElement.play().catch(() => {
//           isPlaying = false;
//         });
//         updateUI();
//       } else {
//         // already playing – just keep playing after seek
//         audioElement.play().catch(() => {});
//       }
//     }
//   });

//   audioElement.addEventListener("ended", () => {
//     isPlaying = false;
//     updateUI();
//   });

//   updateUI();
// }

  
  // ------------------------------
  // Loader: SPACE → run cinematic → then show homepage
  // ------------------------------
  
  // Start in "loading" state so page can't scroll yet
  document.body.classList.add("loading");
  
  function initLoaderKey() {
    let loaderUsed = false; // Prevent double triggers
  
    // Called AFTER the Babylon space sequence has fully finished
    const revealHomepage = () => {
      document.body.classList.remove("loading");
      document.body.classList.add("page-loaded");
  
      const overlay = document.getElementById("loader-overlay");
      if (overlay) {
        overlay.classList.add("loader-complete");
  
        // Hide SPACEBAR text UI permanently
        const ui = overlay.querySelector(".loader-ui");
        if (ui) {
          ui.style.display = "none";
        }
      }
  
      // Start text animations now that the 3D sequence is complete
      if (typeof startTerraDefinitionTypewriter === "function") {
        startTerraDefinitionTypewriter();
      }
      if (typeof startDualitySubtitleTypewriter === "function") {
        startDualitySubtitleTypewriter();
      }
    };
  
    window.addEventListener("keydown", (e) => {
      if (loaderUsed) return;
      if (e.code !== CONFIG.LOADER_KEY) return;
  
      loaderUsed = true;
      e.preventDefault();
  
      // Immediately hide the SPACEBAR box — before animation begins
      const overlay = document.getElementById("loader-overlay");
      if (overlay) {
        const ui = overlay.querySelector(".loader-ui");
        if (ui) {
          ui.style.opacity = "0";
          ui.style.pointerEvents = "none";
        }
      }
  
      // Start Babylon entry sequence
      if (window.startTerrariumSpaceSequence) {
        window.startTerrariumSpaceSequence(revealHomepage);
      } else {
        revealHomepage();
      }
    });
  }

// ------------------------------
// Audio Player for the track / typewriter
// ------------------------------
function initAudioPlayer() {
  const audioElement = document.getElementById("site-audio");
  const playButton   = document.getElementById("audio-toggle");
  const trackInfo    = document.querySelector(".track-info");

  if (!audioElement || !playButton || !trackInfo) return;

  let isPlaying = false;
  const trackText = "This composition was written, produced, mixed, and mastered by Jordan Levi Sax using Ableton Live 12.2 and Wavestation VST | Levi - ‘Terrarium’ Now Playing |";

  // simple local typewriter for the track label (we won't use the typewriter anymore)
  function startTrackTypewriter() {
    // instantly show full text instead of typing
    trackInfo.textContent = trackText;

    // HIDE after 10 seconds whenever it pops up
    setTimeout(() => {
      // only hide if it's still showing this track text
      if (trackInfo.textContent === trackText) {
    
        // Trigger the same flash animation on hide
        trackInfo.classList.remove("playing");
        void trackInfo.offsetWidth; // forces reflow to restart CSS animation
        trackInfo.classList.add("playing");
    
        // Actually remove the text a moment later (after flash)
        setTimeout(() => {
          trackInfo.classList.remove("playing");
          trackInfo.textContent = "";
        }, 300); // match your CSS fade duration
      
      }
    }, 10000);
  }

  function updateUI() {
    if (isPlaying) {
      playButton.textContent = "Mute";
      trackInfo.classList.add("playing");
      startTrackTypewriter();      // now just shows full line + 10s timer
    } else {
      playButton.textContent = "Unmute";
      trackInfo.classList.remove("playing");
      // we DON'T clear the text so it stays visible once set
    }
  }

  playButton.addEventListener("click", () => {
    isPlaying = !isPlaying;

    if (isPlaying) {
      audioElement.play().catch(() => {
        isPlaying = false;
        updateUI();
      });
    } else {
      audioElement.pause();
    }

    updateUI();
  });

  audioElement.addEventListener("ended", () => {
    isPlaying = false;
    updateUI();
  });

  updateUI();
}

initAudioPlayer();

const song = document.getElementById("site-audio");

// NEW: track whether space has been pressed before
let firstSpacePress = true;

// Jump here (in seconds) when space is pressed
const JUMP_TIME = 95.95;

window.addEventListener("keydown", (e) => {
  // Space bar
  if (e.code === "Space" || e.key === " ") {
    // Stop the page from scrolling when you hit space
    e.preventDefault();

    // Seek and play
    if (song) {
      song.currentTime = JUMP_TIME;
      song.play();

      // FIRST TIME ONLY → activate track text (currently blank in your code)
      if (firstSpacePress) {
        firstSpacePress = false;

        const trackInfo = document.querySelector(".track-info");
        if (trackInfo) {
          trackInfo.textContent = "";
        }
      }
    }
  }
});


// ------------------------------
// Kick everything off
// ------------------------------
document.addEventListener("DOMContentLoaded", () => {
  //initAboutAndServicesTypewriter();
  initAudioPlayer();
  initMenu();
  initSmoothScroll();
  initLoaderKey();
});

