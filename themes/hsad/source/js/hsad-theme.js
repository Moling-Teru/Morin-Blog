(() => {
  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

  const initDrawer = () => {
    const body = document.body;
    const drawer = document.querySelector('[data-drawer]');
    const toggles = document.querySelectorAll('.js-drawer-toggle');
    const closers = document.querySelectorAll('.js-drawer-close');
    let previouslyFocused = null;

    if (!drawer || !toggles.length) return;

    const syncDrawerState = (isOpen) => {
      toggles.forEach((toggle) => {
        toggle.setAttribute('aria-expanded', String(isOpen));
        toggle.setAttribute('aria-label', isOpen ? '关闭导航' : '打开导航');
      });

      drawer.toggleAttribute('inert', !isOpen);
    };

    const closeDrawer = ({ restoreFocus = true } = {}) => {
      if (!body.classList.contains('drawer-open')) return;

      body.classList.remove('drawer-open');
      drawer.setAttribute('aria-hidden', 'true');
      syncDrawerState(false);

      if (restoreFocus && previouslyFocused instanceof HTMLElement) {
        previouslyFocused.focus();
      }
    };

    const openDrawer = () => {
      previouslyFocused = document.activeElement;
      body.classList.add('drawer-open');
      drawer.setAttribute('aria-hidden', 'false');
      syncDrawerState(true);

      window.requestAnimationFrame(() => {
        const firstLink = drawer.querySelector('a[href], button:not([disabled])');
        if (firstLink instanceof HTMLElement) firstLink.focus();
      });
    };

    syncDrawerState(false);

    toggles.forEach((toggle) => {
      toggle.addEventListener('click', () => {
        if (body.classList.contains('drawer-open')) {
          closeDrawer();
        } else {
          openDrawer();
        }
      });
    });

    closers.forEach((closer) => {
      closer.addEventListener('click', closeDrawer);
    });

    drawer.querySelectorAll('a[href]').forEach((link) => {
      link.addEventListener('click', () => closeDrawer({ restoreFocus: false }));
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeDrawer();
    });
  };

  const initSearch = () => {
    const search = document.querySelector('[data-search]');
    if (!search) return;

    const form = search.querySelector('[data-search-form]');
    const input = search.querySelector('[data-search-input]');
    const status = search.querySelector('[data-search-status]');
    const results = search.querySelector('[data-search-results]');
    const submit = form?.querySelector('button[type="submit"]');
    const indexPath = search.dataset.searchIndex;
    let entries = null;
    let indexPromise = null;
    let debounceTimer = null;

    if (!form || !input || !status || !results || !indexPath) return;

    const toPlainText = (html) => {
      const documentFragment = new DOMParser().parseFromString(String(html || ''), 'text/html');
      documentFragment.querySelectorAll('pre, script, style').forEach((node) => node.remove());
      return (documentFragment.body.textContent || '').replace(/\s+/g, ' ').trim();
    };

    const setBusy = (isBusy) => {
      search.setAttribute('aria-busy', String(isBusy));
      if (submit) submit.toggleAttribute('disabled', isBusy && !entries);
    };

    const loadIndex = () => {
      if (entries) return Promise.resolve(entries);
      if (indexPromise) return indexPromise;

      status.textContent = '正在读取文章索引…';
      setBusy(true);

      indexPromise = fetch(indexPath, { credentials: 'same-origin' })
        .then((response) => {
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          return response.text();
        })
        .then((xmlText) => {
          const xml = new DOMParser().parseFromString(xmlText, 'application/xml');
          if (xml.querySelector('parsererror')) throw new Error('Invalid search index');

          entries = Array.from(xml.querySelectorAll('entry'))
            .map((entry) => {
              const title = (entry.querySelector('title')?.textContent || '').trim();
              const url = (entry.querySelector('url')?.textContent || entry.querySelector('link')?.getAttribute('href') || '').trim();
              const content = toPlainText(entry.querySelector('content')?.textContent || '');
              const categories = Array.from(entry.querySelectorAll('category'))
                .map((category) => category.textContent.trim())
                .filter(Boolean);

              return {
                title,
                url,
                content,
                categories,
                haystack: `${title} ${categories.join(' ')} ${content}`.toLocaleLowerCase('zh-CN')
              };
            })
            .filter((entry) => entry.title && entry.url);

          return entries;
        })
        .catch((error) => {
          indexPromise = null;
          status.textContent = '索引暂时没有读取成功，请稍后再试。';
          throw error;
        })
        .finally(() => setBusy(false));

      return indexPromise;
    };

    const getExcerpt = (entry, terms) => {
      const normalizedContent = entry.content.toLocaleLowerCase('zh-CN');
      const positions = terms
        .map((term) => normalizedContent.indexOf(term))
        .filter((position) => position >= 0);
      const firstPosition = positions.length ? Math.min(...positions) : 0;
      const start = Math.max(firstPosition - 34, 0);
      const end = Math.min(start + 118, entry.content.length);
      const prefix = start > 0 ? '…' : '';
      const suffix = end < entry.content.length ? '…' : '';

      return `${prefix}${entry.content.slice(start, end).trim()}${suffix}`;
    };

    const renderResults = (query) => {
      const normalizedQuery = query.trim().toLocaleLowerCase('zh-CN');
      results.replaceChildren();

      if (!normalizedQuery) {
        status.textContent = '输入关键词，检索文章标题和正文。';
        return;
      }

      const terms = normalizedQuery.split(/\s+/).filter(Boolean);
      const matches = (entries || [])
        .filter((entry) => terms.every((term) => entry.haystack.includes(term)))
        .map((entry) => {
          const normalizedTitle = entry.title.toLocaleLowerCase('zh-CN');
          let score = 0;
          terms.forEach((term) => {
            if (normalizedTitle === term) score += 12;
            else if (normalizedTitle.startsWith(term)) score += 8;
            else if (normalizedTitle.includes(term)) score += 5;
            else if (entry.categories.some((category) => category.toLocaleLowerCase('zh-CN').includes(term))) score += 3;
            else score += 1;
          });
          return { entry, score };
        })
        .sort((a, b) => b.score - a.score || a.entry.title.localeCompare(b.entry.title, 'zh-CN'))
        .slice(0, 30);

      status.textContent = matches.length
        ? `找到 ${matches.length} 篇相关内容${matches.length === 30 ? '，先显示前 30 篇' : ''}。`
        : '没有找到相关内容，可以换一个更短的关键词。';

      const fragment = document.createDocumentFragment();
      matches.forEach(({ entry }) => {
        const item = document.createElement('li');
        item.className = 'search-result';

        const title = document.createElement('h2');
        title.className = 'search-result__title';

        const link = document.createElement('a');
        link.href = entry.url;
        link.textContent = entry.title;
        title.appendChild(link);

        if (entry.categories.length) {
          const meta = document.createElement('p');
          meta.className = 'search-result__meta';
          meta.textContent = entry.categories.join(' / ');
          item.append(title, meta);
        } else {
          item.appendChild(title);
        }

        if (entry.content) {
          const excerpt = document.createElement('p');
          excerpt.className = 'search-result__excerpt';
          excerpt.textContent = getExcerpt(entry, terms);
          item.appendChild(excerpt);
        }

        fragment.appendChild(item);
      });

      results.appendChild(fragment);
    };

    const searchFor = () => {
      const query = input.value;
      if (!query.trim()) {
        renderResults('');
        return;
      }

      loadIndex()
        .then(() => renderResults(query))
        .catch(() => {});
    };

    input.addEventListener('focus', () => {
      loadIndex().catch(() => {});
    }, { once: true });

    input.addEventListener('input', () => {
      window.clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(searchFor, 140);
    });

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      window.clearTimeout(debounceTimer);
      searchFor();
    });
  };

  const initPostToc = () => {
    const tocLinks = Array.from(
      document.querySelectorAll('[data-post-toc] a[href^="#"]')
    );

    if (!tocLinks.length) return;

    const sections = tocLinks
      .map((link) => {
        const href = link.getAttribute('href');
        if (!href || href.length < 2) return null;

        const id = decodeURIComponent(href.slice(1));
        const target = document.getElementById(id);
        if (!target) return null;

        return { id, link, target };
      })
      .filter(Boolean);

    if (!sections.length) return;

    const setActive = (activeId) => {
      tocLinks.forEach((link) => {
        const href = link.getAttribute('href');
        const linkId = href ? decodeURIComponent(href.slice(1)) : '';
        link.classList.toggle('is-active', linkId === activeId);
      });
    };

    const syncActive = () => {
      const offset = window.innerWidth <= 980 ? 112 : 140;
      let activeId = sections[0].id;

      sections.forEach((section) => {
        if (window.scrollY + offset >= section.target.offsetTop) {
          activeId = section.id;
        }
      });

      setActive(activeId);
    };

    syncActive();

    window.addEventListener('scroll', syncActive, { passive: true });
    window.addEventListener('resize', syncActive);
    window.addEventListener('hashchange', syncActive);
  };

  const initReadingProgress = () => {
    const progressBar = document.querySelector('[data-reading-progress]');
    const article = document.querySelector('.article');

    if (!progressBar || !article) return;

    const syncProgress = () => {
      const start = article.offsetTop - 120;
      const end = article.offsetTop + article.offsetHeight - window.innerHeight;
      const distance = Math.max(end - start, 1);
      const progress = clamp((window.scrollY - start) / distance, 0, 1);

      progressBar.style.transform = `scaleX(${progress})`;
    };

    syncProgress();

    window.addEventListener('scroll', syncProgress, { passive: true });
    window.addEventListener('resize', syncProgress);
    window.addEventListener('hashchange', syncProgress);
  };

  const copyText = async (text) => {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }

    const input = document.createElement('textarea');
    input.value = text;
    input.setAttribute('readonly', 'readonly');
    input.style.position = 'absolute';
    input.style.left = '-9999px';
    document.body.appendChild(input);
    input.select();

    try {
      return document.execCommand('copy');
    } finally {
      document.body.removeChild(input);
    }
  };

  const normalizeLanguage = (pre) => {
    const raw = pre.dataset.language || '';
    const language = raw.trim().toLowerCase();

    if (!language || language === 'none' || language === 'plaintext' || language === 'text') {
      return '';
    }

    return language;
  };

  const codeCopyIcons = {
    copy: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect width="14" height="14" x="8" y="8" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>',
    copied: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>',
    failed: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8v5"/><path d="M12 17h.01"/><circle cx="12" cy="12" r="9"/></svg>'
  };

  const setCodeCopyState = (button, state = 'copy') => {
    const labels = {
      copy: '复制代码',
      copied: '已复制',
      failed: '复制失败'
    };

    button.innerHTML = codeCopyIcons[state];
    button.setAttribute('aria-label', labels[state]);
    button.title = labels[state];
  };

  const initCodeFrames = () => {
    const blocks = document.querySelectorAll('.article__content pre');

    if (!blocks.length) return;

    blocks.forEach((pre) => {
      if (pre.parentElement?.classList.contains('code-frame')) return;

      const code = pre.querySelector('code');
      if (!code) return;

      const frame = document.createElement('div');
      frame.className = 'code-frame';

      const head = document.createElement('div');
      head.className = 'code-frame__head';

      const language = normalizeLanguage(pre);

      if (language) {
        const label = document.createElement('span');
        label.className = 'code-frame__label';
        label.textContent = language;
        frame.classList.add('code-frame--labeled');
        head.append(label);
      }

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'code-frame__copy';
      setCodeCopyState(button);

      button.addEventListener('click', async () => {
        try {
          await copyText(code.innerText);
          setCodeCopyState(button, 'copied');
          button.classList.add('is-copied');
        } catch (error) {
          setCodeCopyState(button, 'failed');
        }

        window.setTimeout(() => {
          setCodeCopyState(button);
          button.classList.remove('is-copied');
        }, 1600);
      });

      head.append(button);

      pre.parentNode.insertBefore(frame, pre);
      frame.append(head, pre);
    });
  };

  const isStandaloneMedia = (node) => {
    if (!node) return false;

    const parent = node.parentElement;
    if (!parent || parent.tagName !== 'P') return true;

    const meaningfulNodes = Array.from(parent.childNodes).filter((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        return child.textContent.trim() !== '';
      }

      return true;
    });

    return meaningfulNodes.length === 1;
  };

  const getCaptionText = (img) => {
    const title = (img.getAttribute('title') || '').trim();
    const alt = (img.getAttribute('alt') || '').trim();
    const src = img.getAttribute('src') || '';
    const basename = decodeURIComponent(src.split('/').pop() || '')
      .replace(/\.[a-z0-9]+$/i, '')
      .trim()
      .toLowerCase();

    const candidate = title || alt;
    if (!candidate) return '';

    const normalized = candidate.toLowerCase();
    if (normalized === basename || normalized === `${basename}.png`) return '';

    return candidate;
  };

  const initImageCaptions = () => {
    const images = document.querySelectorAll('.article__content img');

    if (!images.length) return;

    let figureIndex = 0;

    images.forEach((img) => {
      if (img.closest('figure.article-media')) return;

      const mediaNode = img.parentElement?.tagName === 'A' ? img.parentElement : img;
      if (!isStandaloneMedia(mediaNode)) return;

      figureIndex += 1;

      const captionText = getCaptionText(img);
      const figure = document.createElement('figure');
      figure.className = 'article-media';

      const container = mediaNode.parentElement;
      const shouldReplaceParagraph =
        container?.tagName === 'P' &&
        Array.from(container.childNodes).every((child) => {
          if (child.nodeType === Node.TEXT_NODE) {
            return child.textContent.trim() === '';
          }

          return child === mediaNode;
        });

      if (shouldReplaceParagraph) {
        container.parentNode.insertBefore(figure, container);
        figure.appendChild(mediaNode);
        container.remove();
      } else {
        mediaNode.parentNode.insertBefore(figure, mediaNode);
        figure.appendChild(mediaNode);
      }

      const caption = document.createElement('figcaption');
      caption.className = 'article-media__caption';

      const label = document.createElement('span');
      label.className = 'article-media__label';
      label.textContent = `图 ${String(figureIndex).padStart(2, '0')}`;
      caption.appendChild(label);

      if (captionText) {
        const text = document.createElement('span');
        text.className = 'article-media__text';
        text.textContent = `· ${captionText}`;
        caption.appendChild(text);
      }

      figure.appendChild(caption);
    });
  };

  initDrawer();
  initSearch();
  initPostToc();
  initReadingProgress();
  initCodeFrames();
  initImageCaptions();
})();
