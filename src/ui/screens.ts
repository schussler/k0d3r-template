/**
 * Telas sobre o jogo (título, pausa, morte, vitória, erro). HTML simples com botões; quem decide o que cada botão
 * faz é o jogo, pelo nome da ação.
 */
export type ScreenName = 'title' | 'pause' | 'death' | 'victory' | 'error' | 'transition' | 'none';

export interface ScreenContent {
  readonly kicker?: string;
  readonly title: string;
  readonly body?: string;
  readonly actions: readonly { readonly id: string; readonly label: string }[];
  readonly hint?: string;
}

export class Screens {
  readonly root: HTMLDivElement;
  private current: ScreenName = 'none';
  onAction: (id: string) => void = () => undefined;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'screen hidden';
    parent.appendChild(this.root);
    this.root.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
      const id = btn?.dataset.action;
      if (id) this.onAction(id);
    });
  }

  get name(): ScreenName {
    return this.current;
  }

  show(name: ScreenName, c: ScreenContent): void {
    this.current = name;
    this.root.className = `screen screen-${name}`;
    const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch] ?? ch);
    this.root.innerHTML = `
      <div class="card">
        ${c.kicker ? `<div class="kicker">${esc(c.kicker)}</div>` : ''}
        <h1>${esc(c.title)}</h1>
        ${c.body ? `<p class="body">${c.body}</p>` : ''}
        <div class="actions">${c.actions.map((a, i) => `<button class="${i === 0 ? 'primary' : ''}" data-action="${esc(a.id)}">${esc(a.label)}</button>`).join('')}</div>
        ${c.hint ? `<div class="hint">${esc(c.hint)}</div>` : ''}
      </div>`;
  }

  hide(): void {
    this.current = 'none';
    this.root.className = 'screen hidden';
    this.root.innerHTML = '';
  }
}
