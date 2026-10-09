/** Minimal DOM toolkit for building UI screens. */

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function clearRoot(root: HTMLElement) {
  root.innerHTML = '';
}

export function screen(root: HTMLElement, id: string): HTMLElement {
  const s = el('div', 'screen');
  s.id = id;
  root.appendChild(s);
  return s;
}

export interface MenuItem {
  label: string;
  hint?: string;
  onSelect: () => void;
}

export function menuList(
  parent: HTMLElement,
  items: MenuItem[],
  onMove?: (index: number) => void,
): { root: HTMLElement; select: (i: number) => void; move: (dir: number) => void; index: () => number } {
  const list = el('div', 'menu-list');
  parent.appendChild(list);
  let idx = 0;
  const nodes = items.map((item, i) => {
    const n = el('div', 'menu-item', item.label);
    n.addEventListener('click', () => item.onSelect());
    n.addEventListener('mouseenter', () => select(i));
    list.appendChild(n);
    return n;
  });
  function select(i: number) {
    idx = Math.max(0, Math.min(items.length - 1, i));
    nodes.forEach((n, k) => n.classList.toggle('selected', k === idx));
    onMove?.(idx);
  }
  select(0);
  return {
    root: list,
    select,
    move(dir: number) {
      select(idx + dir);
    },
    index: () => idx,
  };
}

export function statBar(
  parent: HTMLElement,
  label: string,
  value: number,
  max = 100,
  invert = false,
) {
  const row = el('div', 'statbar');
  row.appendChild(el('span', 'lbl', label));
  const bar = el('div', 'bar');
  const fill = el('div', 'fill');
  const v = Math.max(0, Math.min(max, value));
  const pct = invert ? 100 - (v / max) * 100 : (v / max) * 100;
  fill.style.width = `${pct}%`;
  if (invert) fill.style.background = 'linear-gradient(90deg,#4a90d9,#1b5fd9)';
  bar.appendChild(fill);
  row.appendChild(bar);
  row.appendChild(el('span', 'val', String(Math.round(v))));
  parent.appendChild(row);
  return row;
}

export function pad(n: number, width = 2): string {
  return String(Math.floor(n)).padStart(width, '0');
}

export function formatTime(t: number): string {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${pad(m)}:${pad(s)}.${pad((s % 1) * 1000, 3)}`;
}
