'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const themeAssetVersions = new Map();

const getThemeAssetUrl = function (assetPath) {
  const normalizedPath = String(assetPath || '').replace(/^\/+/, '');
  const publicUrl = this.url_for(`/${normalizedPath}`);
  const filePath = path.join(hexo.theme_dir, 'source', normalizedPath);

  try {
    const stat = fs.statSync(filePath);
    const signature = `${stat.size}:${stat.mtimeMs}`;
    let cached = themeAssetVersions.get(filePath);

    if (!cached || cached.signature !== signature) {
      cached = {
        signature,
        version: crypto.createHash('sha256')
          .update(fs.readFileSync(filePath))
          .digest('hex')
          .slice(0, 12)
      };
      themeAssetVersions.set(filePath, cached);
    }

    const separator = publicUrl.includes('?') ? '&' : '?';
    return `${publicUrl}${separator}v=${cached.version}`;
  } catch (error) {
    return publicUrl;
  }
};

const isHidden = (post) => {
  if (!post) return false;

  return post.hide === true || String(post.hide || '').toLowerCase() === 'true';
};

const decodeEntities = (value) => String(value || '')
  .replace(/&#x([0-9a-f]+);/gi, (match, code) => {
    try {
      return String.fromCodePoint(Number.parseInt(code, 16));
    } catch (error) {
      return match;
    }
  })
  .replace(/&#(\d+);/g, (match, code) => {
    try {
      return String.fromCodePoint(Number.parseInt(code, 10));
    } catch (error) {
      return match;
    }
  })
  .replace(/&(?:nbsp|ensp|emsp);/gi, ' ')
  .replace(/&amp;/gi, '&')
  .replace(/&quot;/gi, '"')
  .replace(/&(?:apos|#39);/gi, "'")
  .replace(/&lt;/gi, '<')
  .replace(/&gt;/gi, '>');

const toPlainText = (value) => decodeEntities(String(value || '')
  .replace(/<pre\b[\s\S]*?<\/pre>/gi, ' ')
  .replace(/<figure\b[\s\S]*?<\/figure>/gi, ' ')
  .replace(/<table\b[\s\S]*?<\/table>/gi, ' ')
  .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
  .replace(/<img\b[^>]*>/gi, ' ')
  .replace(/<br\s*\/?>/gi, ' ')
  .replace(/<[^>]+>/g, ' '))
  .replace(/\s+/g, ' ')
  .trim();

const isReadable = (text) => {
  if (!text || text.length < 6) return false;
  if (/here's something encrypted|mathjax|function\s*\(|#include|<!doctype|<\?xml/i.test(text)) return false;
  if (/^(?:text|c|java|python|bash|shell|sql|html|xml)\s*[:：]?\s*$/i.test(text)) return false;

  const readableCharacters = text.match(/[\u3400-\u9fffA-Za-z]/g) || [];
  return readableCharacters.length >= 5;
};

const trimTitle = (text, title) => {
  const normalizedTitle = toPlainText(title);
  if (!normalizedTitle || text.indexOf(normalizedTitle) !== 0) return text;

  return text.slice(normalizedTitle.length).replace(/^[\s:：—-]+/, '').trim();
};

const truncateText = (text, limit) => {
  const normalizedLimit = Number(limit) > 0 ? Number(limit) : 72;
  if (text.length <= normalizedLimit) return text;

  const sample = text.slice(0, normalizedLimit + 1);
  const punctuation = Math.max(
    sample.lastIndexOf('。'),
    sample.lastIndexOf('！'),
    sample.lastIndexOf('？'),
    sample.lastIndexOf('；'),
    sample.lastIndexOf('.'),
    sample.lastIndexOf('!'),
    sample.lastIndexOf('?')
  );

  if (punctuation >= Math.floor(normalizedLimit * 0.58)) {
    return sample.slice(0, punctuation + 1).trim();
  }

  return `${text.slice(0, normalizedLimit).trim()}…`;
};

const getSummary = (item, limit) => {
  if (!item) return '';

  const explicit = trimTitle(toPlainText(item.description), item.title);
  if (isReadable(explicit)) return truncateText(explicit, limit);

  const html = String(item.excerpt || item.content || '');
  const candidates = [];
  const paragraphPattern = /<p\b[^>]*>([\s\S]*?)<\/p>/gi;
  let match;

  while ((match = paragraphPattern.exec(html)) !== null && candidates.length < 4) {
    const candidate = trimTitle(toPlainText(match[1]), item.title);
    if (!isReadable(candidate)) continue;

    candidates.push(candidate);
    if (candidates.join(' ').length >= Number(limit || 72) * 1.25) break;
  }

  const paragraphSummary = candidates.join(' ').trim();
  if (isReadable(paragraphSummary)) return truncateText(paragraphSummary, limit);

  const fallback = trimTitle(toPlainText(html), item.title);
  return isReadable(fallback) ? truncateText(fallback, limit) : '';
};

const toArray = (collection) => {
  if (!collection) return [];
  if (typeof collection.toArray === 'function') return collection.toArray();
  if (Array.isArray(collection.data)) return collection.data;
  return Array.isArray(collection) ? collection : [];
};

const getLeafCategory = (collection) => {
  const categories = toArray(collection);
  if (!categories.length) return null;

  const parentIds = new Set(categories
    .map((category) => category && category.parent)
    .filter(Boolean)
    .map(String));

  return categories.find((category) => !parentIds.has(String(category._id))) || categories[categories.length - 1];
};

const getCategoryTrail = (category, collection) => {
  if (!category) return '';

  const categories = toArray(collection);
  const byId = new Map(categories.map((item) => [String(item._id), item]));
  const trail = [];
  const visited = new Set();
  let current = category;

  while (current && !visited.has(String(current._id))) {
    trail.unshift(current.name);
    visited.add(String(current._id));
    current = current.parent ? byId.get(String(current.parent)) : null;
  }

  return trail.filter(Boolean).join(' / ');
};

const getVisibleCount = (category) => {
  if (!category || !category.posts) return Number(category && category.length) || 0;
  return toArray(category.posts).filter((post) => !isHidden(post)).length;
};

hexo.extend.helper.register('hsad_is_hidden', isHidden);
hexo.extend.helper.register('hsad_summary', getSummary);
hexo.extend.helper.register('hsad_leaf_category', getLeafCategory);
hexo.extend.helper.register('hsad_category_trail', getCategoryTrail);
hexo.extend.helper.register('hsad_visible_count', getVisibleCount);
hexo.extend.helper.register('hsad_theme_asset', getThemeAssetUrl);

// Keep the search generator, but use the theme's template so `hide: true`
// posts never enter the public index. Direct post routes remain available.
const searchConfig = hexo.config.search || (hexo.config.search = {});
const searchPath = searchConfig.path || 'search.xml';
if (path.extname(searchPath).toLowerCase() === '.xml' && !searchConfig.template) {
  searchConfig.template = path.join(hexo.theme_dir, 'templates/search.xml');
}
