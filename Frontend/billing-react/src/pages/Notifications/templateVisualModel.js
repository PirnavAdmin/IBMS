// Labels are presentation only. Serialization always uses the original token.
export const fieldLabel = variable => String(variable?.name || '').replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z])([A-Z][a-z])/g, '$1 $2').replace(/[_-]+/g, ' ').trim();

export function parseTemplateToVisualModel(text = '', variables = []) {
  const known = new Map(variables.map(variable => [variable.token, variable]));
  // Include exact metadata tokens, even when their syntax differs from the usual {{…}}.
  const escaped = [...known.keys()].filter(Boolean).sort((a, b) => b.length - a.length).map(token => token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const pattern = new RegExp([...escaped, '\\{\\{[^{}]*\\}\\}'].join('|'), 'g');
  const parts = []; let offset = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index > offset) parts.push({ type: 'text', text: text.slice(offset, match.index) });
    const variable = known.get(match[0]);
    parts.push({ type: 'token', token: match[0], label: variable ? fieldLabel(variable) : 'Unknown field', known: Boolean(variable) });
    offset = match.index + match[0].length;
  }
  if (offset < text.length) parts.push({ type: 'text', text: text.slice(offset) });
  return parts;
}
export const serializeVisualModelToTemplate = parts => parts.map(part => part.type === 'token' ? part.token : part.text).join('');

const originalMarkup = new WeakMap();
const protectedTokens = new WeakMap();

export function createFieldChip(part, doc = document) {
  const chip = doc.createElement('span');
  chip.className = 'notification-inline-field';
  chip.setAttribute('contenteditable', 'false');
  chip.setAttribute('data-template-token', part.token);
  chip.textContent = part.label;
  chip.setAttribute('aria-label', part.known ? part.label : 'Unknown field. Its original value will be preserved.');
  return chip;
}

export function loadVisualEditor(root, value, variables, rich) {
  const doc = root.ownerDocument;
  const container = doc.createElement('div');
  const originals = new Map();
  const placeholders = new WeakSet();
  const tokens = new Map();
  originalMarkup.set(root, originals);
  protectedTokens.set(root, tokens);
  if (rich) {
    const inert = doc.createElement('template');
    // Protect exact tokens before HTML parsing can decode ampersands/entities in them.
    let prefix = 'ibms-template-field-';
    while (value.includes(prefix)) prefix += 'x';
    inert.innerHTML = parseTemplateToVisualModel(value, variables).map(part => {
      if (part.type === 'text') return part.text;
      const marker = `${prefix}${tokens.size}-end`;
      tokens.set(marker, part);
      return marker;
    }).join('');
    // Inert placeholders preserve unsupported markup without activating it in the app.
    // Restore original attributes only on a detached clone when serializing for the API.
    inert.content.querySelectorAll('script,style,iframe,object,embed,link,meta,base,form,input,button,svg,math,audio,video,source,img').forEach(node => {
      const key = String(originals.size);
      originals.set(key, { html: node.outerHTML });
      const placeholder = doc.createElement('span');
      placeholder.setAttribute('data-original-markup', key);
      placeholder.hidden = true;
      placeholders.add(placeholder);
      node.replaceWith(placeholder);
    });
    inert.content.querySelectorAll('*').forEach(node => {
      if (placeholders.has(node)) return;
      const attributes = [...node.attributes].map(attribute => [attribute.name, attribute.value]);
      for (const attribute of [...node.attributes]) {
        if (!['href', 'title', 'colspan', 'rowspan'].includes(attribute.name) || (attribute.name === 'href' && !/^(https?:|mailto:|#)/i.test(attribute.value.trim()))) node.removeAttribute(attribute.name);
      }
      if (attributes.length) {
        const key = String(originals.size);
        originals.set(key, { attributes });
        node.setAttribute('data-original-markup', key);
      }
    });
    container.append(inert.content);
  } else container.textContent = value;
  const walker = doc.createTreeWalker(container, 4);
  const nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode);
  const visualVariables = rich ? [...tokens].map(([token, part]) => ({ token, name: part.label })) : variables;
  for (const node of nodes) {
    const fragment = doc.createDocumentFragment();
    for (const part of parseTemplateToVisualModel(node.textContent, visualVariables)) fragment.append(part.type === 'token' ? createFieldChip(tokens.get(part.token) || part, doc) : doc.createTextNode(part.text));
    node.replaceWith(fragment);
  }
  root.replaceChildren(...container.childNodes);
}

export function serializeVisualEditor(root, rich) {
  const copy = root.cloneNode(true);
  const replacements = [];
  const originalContent = root.innerHTML + [...(originalMarkup.get(root)?.values() || [])].map(original => original.html || '').join('');
  let markerIndex = 0;
  const preserve = (node, original) => {
    let marker;
    do { marker = `notification-preserved-${markerIndex++}`; } while (originalContent.includes(marker));
    replacements.push([marker, original]);
    node.replaceWith(root.ownerDocument.createComment(marker));
  };
  copy.querySelectorAll('[data-template-token]').forEach(chip => {
    const token = chip.getAttribute('data-template-token');
    if (rich) preserve(chip, token);
    else chip.replaceWith(root.ownerDocument.createTextNode(token));
  });
  copy.querySelectorAll('[data-original-markup]').forEach(node => {
    const original = originalMarkup.get(root)?.get(node.getAttribute('data-original-markup'));
    node.removeAttribute('data-original-markup');
    if (original?.html) {
      // String substitution avoids activating external resources even in a detached DOM.
      preserve(node, original.html);
    } else if (original?.attributes) {
      for (const [name, value] of original.attributes) node.setAttribute(name, value);
    }
  });
  if (!rich) return copy.textContent.replace(/[\r\n]+/g, ' ');
  let html = copy.innerHTML;
  for (const [marker, original] of replacements) html = html.replace(`<!--${marker}-->`, () => original);
  for (const [marker, part] of protectedTokens.get(root) || []) html = html.replaceAll(marker, () => part.token);
  return html;
}
