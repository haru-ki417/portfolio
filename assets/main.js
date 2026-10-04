(function(){
  // ---- Theme init (run before paint as much as possible) ----
  try{
    var root = document.documentElement;
    var saved = null;
    try{ saved = localStorage.getItem('theme'); }catch(e){}
    var preset = root.getAttribute('data-theme');   // set by a host viewer, if any
    var theme = saved || preset || (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
    if (theme === 'light') root.setAttribute('data-theme', 'light');
    else if (preset === 'light') root.removeAttribute('data-theme');
  }catch(e){ /* default dark theme stays */ }
})();

document.addEventListener('DOMContentLoaded', function(){

  // Preloader
  var preloader = document.getElementById('preloader');
  if (preloader){
    window.addEventListener('load', function(){
      setTimeout(function(){ preloader.classList.add('done'); }, 900);
    });
  }

  // Scroll progress bar
  var scrollProgressEl = document.getElementById('scrollbar');
  if (scrollProgressEl){
    var updateScrollbar = function(){
      var h = document.documentElement;
      var pct = (h.scrollTop) / (h.scrollHeight - h.clientHeight) * 100;
      scrollProgressEl.style.width = pct + '%';
    };
    document.addEventListener('scroll', updateScrollbar, { passive:true });
  }

  // Cursor glow (desktop only)
  var glow = document.getElementById('cursor-glow');
  if (glow && window.matchMedia('(pointer:fine)').matches){
    var gx=0, gy=0, tx=0, ty=0;
    document.addEventListener('mousemove', function(e){
      tx = e.clientX; ty = e.clientY;
      glow.classList.add('active');
    });
    function loop(){
      gx += (tx-gx)*0.12; gy += (ty-gy)*0.12;
      glow.style.transform = 'translate(' + gx + 'px, ' + gy + 'px) translate(-50%,-50%)';
      requestAnimationFrame(loop);
    }
    loop();
  }

  // Reveal on scroll (with safe fallback if IntersectionObserver is unavailable)
  var revealEls = Array.from(document.querySelectorAll('.reveal, .reveal-stagger'));
  var diagrams = Array.from(document.querySelectorAll('.diagram'));
  var numEls = Array.from(document.querySelectorAll('.num'));

  if (!('IntersectionObserver' in window)){
    revealEls.forEach(function(el){ el.classList.add('in'); });
    diagrams.forEach(function(el){ el.classList.add('in'); });
    numEls.forEach(function(el){ el.textContent = el.dataset.count; });
  } else {
    var io = new IntersectionObserver(function(entries){
      entries.forEach(function(entry){
        if (entry.isIntersecting){ entry.target.classList.add('in'); io.unobserve(entry.target); }
      });
    }, { threshold:0.15 });
    revealEls.forEach(function(el){ io.observe(el); });

    var dio = new IntersectionObserver(function(entries){
      entries.forEach(function(entry){ if (entry.isIntersecting){ entry.target.classList.add('in'); dio.unobserve(entry.target); } });
    }, { threshold:0.3 });
    diagrams.forEach(function(d){ dio.observe(d); });

    var cio = new IntersectionObserver(function(entries){
      entries.forEach(function(entry){
        if (entry.isIntersecting){
          var numEl = entry.target;
          var target = parseInt(numEl.dataset.count, 10);
          var cur = 0;
          var step = function(){
            cur += 1;
            numEl.textContent = cur;
            if (cur < target) requestAnimationFrame(step);
            else numEl.textContent = target;
          };
          step();
          cio.unobserve(entry.target);
        }
      });
    }, { threshold:0.5 });
    numEls.forEach(function(el){ cio.observe(el); });
  }

  setTimeout(function(){
    revealEls.forEach(function(el){ el.classList.add('in'); });
    diagrams.forEach(function(el){ el.classList.add('in'); });
  }, 2500);

  // Active nav link on scroll
  var navLinks = Array.from(document.querySelectorAll('[data-nav]'));
  var sectionIds = ['about','projects','achievements','contact'];
  var sections = sectionIds.map(function(id){ return document.getElementById(id); }).filter(Boolean);
  function updateActiveNav(){
    var current = null;
    sections.forEach(function(sec){
      var rect = sec.getBoundingClientRect();
      if (rect.top <= 120 && rect.bottom >= 120) current = sec.id;
    });
    navLinks.forEach(function(a){ a.classList.toggle('active', a.getAttribute('href') === '#'+current); });
  }
  if (sections.length){ document.addEventListener('scroll', updateActiveNav, { passive:true }); }

  // Case-study table of contents: highlight the section in view
  var tocLinks = Array.from(document.querySelectorAll('.toc a[href^="#"]'));
  if (tocLinks.length && 'IntersectionObserver' in window){
    var tio = new IntersectionObserver(function(entries){
      entries.forEach(function(entry){
        if (entry.isIntersecting){
          tocLinks.forEach(function(a){ a.classList.toggle('active', a.getAttribute('href') === '#' + entry.target.id); });
        }
      });
    }, { rootMargin:'-30% 0px -60% 0px' });
    tocLinks.forEach(function(a){
      var target = document.getElementById(a.getAttribute('href').slice(1));
      if (target) tio.observe(target);
    });
  }

  // Back to top
  var toTopBtn = document.getElementById('totop');
  if (toTopBtn){
    document.addEventListener('scroll', function(){
      toTopBtn.classList.toggle('show', window.scrollY > 600);
    }, { passive:true });
    toTopBtn.addEventListener('click', function(){ window.scrollTo({ top:0, behavior:'smooth' }); });
  }

  // Mobile hamburger menu
  var hamburgerBtn = document.getElementById('hamburger-btn');
  var mobileMenu = document.getElementById('mobile-menu');
  if (hamburgerBtn && mobileMenu){
    hamburgerBtn.addEventListener('click', function(){
      mobileMenu.classList.toggle('open');
    });
    Array.from(mobileMenu.querySelectorAll('a')).forEach(function(a){
      a.addEventListener('click', function(){ mobileMenu.classList.remove('open'); });
    });
  }

  // Theme toggle button
  var themeBtn = document.getElementById('theme-toggle');
  if (themeBtn){
    themeBtn.addEventListener('click', function(){
      var isLight = document.documentElement.getAttribute('data-theme') === 'light';
      if (isLight){
        document.documentElement.removeAttribute('data-theme');
        try{ localStorage.setItem('theme','dark'); }catch(e){}
      } else {
        document.documentElement.setAttribute('data-theme','light');
        try{ localStorage.setItem('theme','light'); }catch(e){}
      }
    });
  }

  // Contact form -> mailto (static-site friendly, no backend required)
  var contactForm = document.getElementById('contact-form');
  if (contactForm){
    contactForm.addEventListener('submit', function(e){
      e.preventDefault();
      var name = (document.getElementById('cf-name') || {}).value || '';
      var email = (document.getElementById('cf-email') || {}).value || '';
      var message = (document.getElementById('cf-message') || {}).value || '';
      var to = contactForm.dataset.to;
      var isEn = (document.documentElement.lang || '').indexOf('en') === 0;
      var subject = encodeURIComponent((contactForm.dataset.subject || 'Contact') + ' — ' + name);
      var body = encodeURIComponent(message + '\n\n---\n' + (isEn ? 'Name: ' : 'お名前: ') + name + '\n' + (isEn ? 'Email: ' : 'ご連絡先: ') + email);
      window.location.href = 'mailto:' + to + '?subject=' + subject + '&body=' + body;
    });
  }
});
