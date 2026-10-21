// Section highlighting in the top bar and the BibTeX copy button.
(function () {
  const links = [...document.querySelectorAll('#bar a.sec')];
  const sections = links.map((a) => document.querySelector(a.getAttribute('href'))).filter(Boolean);
  const mark = () => {
    const y = window.scrollY + 90;
    let current = null;
    for (const s of sections) if (s.offsetTop <= y) current = s;
    links.forEach((a) => a.classList.toggle('on', current && a.getAttribute('href') === '#' + current.id));
  };
  window.addEventListener('scroll', mark, { passive: true });
  mark();

  const copy = document.getElementById('copy-bib');
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(document.getElementById('bibtex').textContent);
      copy.textContent = 'Copied';
    } catch (e) {
      copy.textContent = 'Select and copy';
    }
    setTimeout(() => (copy.textContent = 'Copy'), 1600);
  });
})();
