import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  input,
  linkedSignal,
  signal,
} from '@angular/core';

export interface PontoGrafico {
  rotulo: string;
  descricao?: string;
  valor: number;
}

const LARGURA_PADRAO = 360;
const LARGURA_MINIMA = 280;
const LARGURA_MAXIMA = 1600;
const ESQUERDA = 68;
const DIREITA = 20;
const TOPO = 16;
const BASE = 34;
const MAX_MARCADORES = 16;
const LARGURA_POR_ROTULO = 72;

/** Arredonda o máximo do eixo para 1, 2, 5 ou 10 x potência de 10. */
export function maximoBonito(maximo: number): number {
  if (!Number.isFinite(maximo) || maximo <= 0) return 1;
  const expoente = Math.pow(10, Math.floor(Math.log10(maximo)));
  const fracao = maximo / expoente;
  const bonito = fracao <= 1 ? 1 : fracao <= 2 ? 2 : fracao <= 5 ? 5 : 10;
  return bonito * expoente;
}

@Component({
  selector: 'app-grafico-linha',
  standalone: true,
  templateUrl: './grafico-linha.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block w-full min-w-0' },
})
export class GraficoLinha {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);

  readonly titulo = input.required<string>();
  readonly pontos = input.required<PontoGrafico[]>();
  readonly formatarValor = input<(valor: number) => string>((valor) => String(valor));
  readonly formatarEixo = input<((valor: number) => string) | undefined>(undefined);

  /** Largura real (em px) do espaço disponível; o SVG é desenhado em escala 1:1. */
  readonly largura = signal(LARGURA_PADRAO);
  readonly altura = computed(() => Math.min(320, Math.max(220, Math.round(this.largura() * 0.4))));
  readonly viewBox = computed(() => `0 0 ${this.largura()} ${this.altura()}`);

  /** Índice do ponto tocado; volta a null sempre que os pontos mudam. */
  readonly selecionado = linkedSignal<PontoGrafico[], number | null>({
    source: this.pontos,
    computation: () => null,
  });

  readonly geometria = computed(() => {
    const largura = this.largura();
    const altura = this.altura();
    const pontos = this.pontos();
    const n = pontos.length;
    const formatar = this.formatarValor();
    const formatarEixo = this.formatarEixo() ?? formatar;
    const maximo = maximoBonito(Math.max(0, ...pontos.map((ponto) => ponto.valor)));
    const larguraUtil = largura - ESQUERDA - DIREITA;
    const alturaUtil = altura - TOPO - BASE;

    const x = (i: number) => (n <= 1 ? ESQUERDA + larguraUtil / 2 : ESQUERDA + (i * larguraUtil) / (n - 1));
    const y = (valor: number) => TOPO + alturaUtil - (valor / maximo) * alturaUtil;
    const baseY = y(0);
    const maxRotulos = Math.max(2, Math.floor(larguraUtil / LARGURA_POR_ROTULO));
    const passo = Math.max(1, Math.ceil(n / maxRotulos));

    const marcas = [0, 1, 2, 3, 4].map((i) => {
      const valor = (maximo * i) / 4;
      return { y: y(valor), rotulo: formatarEixo(valor) };
    });

    const pts = pontos.map((ponto, i) => ({
      x: x(i),
      y: y(ponto.valor),
      rotulo: ponto.rotulo,
      descricao: ponto.descricao ?? ponto.rotulo,
      texto: formatar(ponto.valor),
      mostrarRotulo: i % passo === 0,
    }));

    const linha = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    const area =
      n > 1
        ? `${linha} L${pts[n - 1].x.toFixed(1)},${baseY.toFixed(1)} L${pts[0].x.toFixed(1)},${baseY.toFixed(1)} Z`
        : '';

    return {
      marcas,
      pts,
      linha,
      area,
      topo: TOPO,
      baseY,
      x0: ESQUERDA,
      x1: largura - DIREITA,
      mostrarMarcadores: n <= MAX_MARCADORES,
    };
  });

  readonly leitura = computed(() => {
    const indice = this.selecionado();
    return indice === null ? null : (this.geometria().pts[indice] ?? null);
  });

  readonly rotuloAcessivel = computed(() => {
    const pontos = this.pontos();
    if (!pontos.length) return `${this.titulo()}: sem dados.`;
    const primeiro = pontos[0];
    const ultimo = pontos[pontos.length - 1];
    const maximo = Math.max(...pontos.map((ponto) => ponto.valor));
    return `${this.titulo()}. ${pontos.length} pontos, de ${primeiro.descricao ?? primeiro.rotulo} a ${ultimo.descricao ?? ultimo.rotulo}. Maior valor: ${this.formatarValor()(maximo)}.`;
  });

  constructor() {
    afterNextRender(() => {
      const elemento = this.host.nativeElement;
      const medir = () => {
        const medida = Math.round(elemento.clientWidth);
        if (medida > 0) {
          this.largura.set(Math.min(LARGURA_MAXIMA, Math.max(LARGURA_MINIMA, medida)));
        }
      };

      medir();
      if (typeof ResizeObserver === 'undefined') return;

      const observador = new ResizeObserver(medir);
      observador.observe(elemento);
      this.destroyRef.onDestroy(() => observador.disconnect());
    });
  }

  /** Toque, arraste ou passe o mouse: seleciona o ponto mais próximo na horizontal. */
  selecionarPorEvento(evento: PointerEvent): void {
    const alvo = evento.currentTarget as Element | null;
    const n = this.pontos().length;
    if (!alvo || n === 0) return;

    const caixa = alvo.getBoundingClientRect();
    if (!caixa.width) return;

    const largura = this.largura();
    const x = ((evento.clientX - caixa.left) / caixa.width) * largura;
    const larguraUtil = largura - ESQUERDA - DIREITA;
    const indice = n === 1 ? 0 : Math.round(((x - ESQUERDA) / larguraUtil) * (n - 1));
    this.selecionado.set(Math.min(n - 1, Math.max(0, indice)));
  }
}