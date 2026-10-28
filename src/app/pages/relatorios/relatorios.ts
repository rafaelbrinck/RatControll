import { Component, computed, inject, signal, WritableSignal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Auth } from '../../core/auth/auth';
import {
  AtalhoPeriodo,
  calcularPeriodo,
  ClientesRelatorio,
  dataBR,
  DescontosRelatorio,
  descricaoBucket,
  Granularidade,
  IntervaloDatas,
  ItemGiro,
  moedaBRL,
  moedaCompacta,
  percentualBR,
  PontoSerie,
  RelatoriosService,
  ResumoVendas,
  rotuloBucket,
  SituacaoEstoque,
  validarPeriodo,
  variacaoPercentual,
  VendasPorProdutoResultado,
} from '../../core/data/relatorios';
import { GraficoBarras, ItemBarra } from '../../shared/graficos/grafico-barras';
import { GraficoLinha, PontoGrafico } from '../../shared/graficos/grafico-linha';
import { AppNavigation } from '../../shared/navigation/app-navigation';

interface Bloco<T> {
  carregando: boolean;
  erro: string;
  dados: T | undefined;
}

interface SerieCarregada {
  granularidade: Granularidade;
  pontos: PontoSerie[];
}

type NomeBloco = 'resumo' | 'serie' | 'produto' | 'descontos' | 'clientes' | 'estoque';
type Sentido = 'positivo-bom' | 'neutro';
type FiltroSituacao = 'todos' | SituacaoEstoque;

export interface CardResumo {
  id: string;
  rotulo: string;
  valor: string;
  variacaoTexto: string;
  classeVariacao: string;
}

const formatoPercentual = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

function blocoInicial<T>(): Bloco<T> {
  return { carregando: true, erro: '', dados: undefined };
}

function montarCard(
  id: string,
  rotulo: string,
  valor: string,
  variacao: number | null,
  sentido: Sentido,
): CardResumo {
  if (variacao === null) {
    return { id, rotulo, valor, variacaoTexto: 'Sem base de comparação', classeVariacao: 'text-slate-500' };
  }
  const arredondada = Math.round(variacao * 10) / 10;
  if (arredondada === 0) {
    return { id, rotulo, valor, variacaoTexto: 'Estável vs. período anterior', classeVariacao: 'text-slate-500' };
  }
  const sinal = arredondada > 0 ? '+' : '−';
  const classeVariacao =
    sentido === 'neutro' ? 'text-slate-600' : arredondada > 0 ? 'text-emerald-700' : 'text-rose-700';
  return {
    id,
    rotulo,
    valor,
    variacaoTexto: `${sinal}${formatoPercentual.format(Math.abs(arredondada))}% vs. período anterior`,
    classeVariacao,
  };
}

@Component({
  selector: 'app-relatorios',
  standalone: true,
  imports: [FormsModule, RouterLink, AppNavigation, GraficoLinha, GraficoBarras],
  templateUrl: './relatorios.html',
})
export class RelatoriosPage {
  private readonly auth = inject(Auth);
  private readonly relatorios = inject(RelatoriosService);
  private readonly router = inject(Router);
  private readonly ids: Record<NomeBloco, number> = {
    resumo: 0,
    serie: 0,
    produto: 0,
    descontos: 0,
    clientes: 0,
    estoque: 0,
  };

  readonly atalhos: ReadonlyArray<{ id: AtalhoPeriodo; rotulo: string }> = [
    { id: '7d', rotulo: '7 dias' },
    { id: '30d', rotulo: '30 dias' },
    { id: 'mes', rotulo: 'Mês atual' },
    { id: 'mes-anterior', rotulo: 'Mês anterior' },
    { id: 'ano', rotulo: 'Ano' },
    { id: 'personalizado', rotulo: 'Personalizado' },
  ];
  readonly granularidades: ReadonlyArray<{ id: Granularidade; rotulo: string }> = [
    { id: 'dia', rotulo: 'Dia' },
    { id: 'semana', rotulo: 'Semana' },
    { id: 'mes', rotulo: 'Mês' },
  ];
  readonly opcoesDiasAlerta: readonly number[] = [7, 14, 30];
  readonly filtrosSituacao: ReadonlyArray<{ id: FiltroSituacao; rotulo: string }> = [
    { id: 'todos', rotulo: 'Todos' },
    { id: 'baixo', rotulo: 'Saldo baixo' },
    { id: 'parado', rotulo: 'Parados' },
    { id: 'ok', rotulo: 'Normais' },
  ];

  readonly formatarMoeda = moedaBRL;
  readonly formatarMoedaCompacta = moedaCompacta;
  readonly formatarPercentual = percentualBR;
  readonly formatarDataBR = dataBR;

  readonly atalho = signal<AtalhoPeriodo>('30d');
  readonly inicio = signal('');
  readonly fim = signal('');
  readonly periodo = signal<IntervaloDatas>({ inicio: '', fim: '' });
  readonly granularidade = signal<Granularidade>('dia');
  readonly diasAlerta = signal(14);
  readonly filtroSituacao = signal<FiltroSituacao>('todos');
  readonly mostrarTodosProdutos = signal(false);
  readonly erroFiltro = signal('');

  readonly resumo = signal<Bloco<ResumoVendas>>(blocoInicial());
  readonly serie = signal<Bloco<SerieCarregada>>(blocoInicial());
  readonly produto = signal<Bloco<VendasPorProdutoResultado>>(blocoInicial());
  readonly descontos = signal<Bloco<DescontosRelatorio>>(blocoInicial());
  readonly clientes = signal<Bloco<ClientesRelatorio>>(blocoInicial());
  readonly estoque = signal<Bloco<ItemGiro[]>>(blocoInicial());

  readonly rotuloGranularidade = computed(() => {
    const mapa: Record<Granularidade, string> = { dia: 'dia', semana: 'semana', mes: 'mês' };
    return mapa[this.granularidade()];
  });

  readonly cards = computed<CardResumo[]>(() => {
    const dados = this.resumo().dados;
    if (!dados) return [];
    const { atual, anterior } = dados;
    const descontosAtual = atual.descontos_itens + atual.desconto_geral;
    const descontosAnterior = anterior.descontos_itens + anterior.desconto_geral;
    const ticketComparavel = atual.ticket_medio !== null && anterior.ticket_medio !== null;

    return [
      montarCard('liquido', 'Faturamento líquido', moedaBRL(atual.liquido),
        variacaoPercentual(atual.liquido, anterior.liquido), 'positivo-bom'),
      montarCard('vendas', 'Vendas', String(atual.vendas),
        variacaoPercentual(atual.vendas, anterior.vendas), 'positivo-bom'),
      montarCard('ticket', 'Ticket médio',
        atual.ticket_medio === null ? '—' : moedaBRL(atual.ticket_medio),
        ticketComparavel ? variacaoPercentual(atual.ticket_medio ?? 0, anterior.ticket_medio ?? 0) : null,
        'positivo-bom'),
      montarCard('descontos', 'Descontos', moedaBRL(descontosAtual),
        variacaoPercentual(descontosAtual, descontosAnterior), 'neutro'),
      montarCard('unidades', 'Unidades vendidas', String(atual.unidades),
        variacaoPercentual(atual.unidades, anterior.unidades), 'positivo-bom'),
    ];
  });

  readonly pontosGrafico = computed<PontoGrafico[]>(() => {
    const dados = this.serie().dados;
    if (!dados) return [];
    return dados.pontos.map((ponto) => ({
      rotulo: rotuloBucket(ponto.inicio, dados.granularidade),
      descricao: descricaoBucket(ponto.inicio, dados.granularidade),
      valor: ponto.faturamento,
    }));
  });

  readonly serieSemVendas = computed(() => {
    const dados = this.serie().dados;
    return !!dados && dados.pontos.every((ponto) => ponto.vendas === 0);
  });

  readonly serieParcial = computed(() => this.serie().dados?.granularidade !== 'dia');

  readonly barrasAnimais = computed<ItemBarra[]>(() =>
    (this.produto().dados?.animais ?? []).map((animal) => ({
      rotulo: animal.nome,
      valor: animal.receita,
      detalhe: `${animal.quantidade} un. · ${percentualBR(animal.participacao)} da receita`,
    })),
  );

  readonly produtoSemVendas = computed(() => (this.produto().dados?.animais.length ?? 0) === 0);
  readonly totalProdutos = computed(() => this.produto().dados?.produtos.length ?? 0);
  readonly produtosVisiveis = computed(() => {
    const produtos = this.produto().dados?.produtos ?? [];
    return this.mostrarTodosProdutos() ? produtos : produtos.slice(0, 10);
  });

  readonly barrasDescontos = computed<ItemBarra[]>(() =>
    (this.descontos().dados?.itensMaisDescontados ?? []).map((item) => ({
      rotulo: item.produto,
      valor: item.descontoTotal,
      detalhe: `${item.quantidade} un. com desconto`,
    })),
  );

  readonly barrasClientes = computed<ItemBarra[]>(() =>
    (this.clientes().dados?.clientes ?? []).map((cliente) => ({
      rotulo: cliente.nome,
      valor: cliente.total,
      detalhe: `${cliente.vendas} ${cliente.vendas === 1 ? 'venda' : 'vendas'} · ticket ${moedaBRL(cliente.ticketMedio)}`,
    })),
  );

  readonly clientesSemVendas = computed(() => {
    const dados = this.clientes().dados;
    return !!dados && dados.clientes.length === 0 && dados.semIdentificacao.vendas === 0;
  });

  readonly resumoEstoque = computed(() => {
    const itens = this.estoque().dados ?? [];
    return {
      baixo: itens.filter((item) => item.situacao === 'baixo').length,
      parado: itens.filter((item) => item.situacao === 'parado').length,
      ok: itens.filter((item) => item.situacao === 'ok').length,
    };
  });

  readonly itensEstoqueFiltrados = computed(() => {
    const filtro = this.filtroSituacao();
    const itens = this.estoque().dados ?? [];
    return filtro === 'todos' ? itens : itens.filter((item) => item.situacao === filtro);
  });

  constructor() {
    this.selecionarAtalho('30d');
  }

  selecionarAtalho(atalho: AtalhoPeriodo): void {
    this.atalho.set(atalho);
    this.erroFiltro.set('');
    if (atalho === 'personalizado') return;

    const intervalo = calcularPeriodo(atalho);
    this.inicio.set(intervalo.inicio);
    this.fim.set(intervalo.fim);
    this.aplicarPeriodo();
  }

  aplicarPeriodo(): void {
    const erro = validarPeriodo(this.inicio(), this.fim());
    this.erroFiltro.set(erro ?? '');
    if (erro) return;

    this.periodo.set({ inicio: this.inicio(), fim: this.fim() });
    this.mostrarTodosProdutos.set(false);
    void this.carregarResumo();
    void this.carregarSerie();
    void this.carregarProduto();
    void this.carregarDescontos();
    void this.carregarClientes();
    void this.carregarEstoque();
  }

  alterarGranularidade(granularidade: Granularidade): void {
    if (this.granularidade() === granularidade) return;
    this.granularidade.set(granularidade);
    void this.carregarSerie();
  }

  alterarDiasAlerta(dias: number): void {
    if (this.diasAlerta() === dias) return;
    this.diasAlerta.set(dias);
    void this.carregarEstoque();
  }

  carregarResumo(): Promise<void> {
    const { inicio, fim } = this.periodo();
    return this.carregarBloco('resumo', this.resumo, () => this.relatorios.resumo(inicio, fim));
  }

  carregarSerie(): Promise<void> {
    const { inicio, fim } = this.periodo();
    const granularidade = this.granularidade();
    return this.carregarBloco('serie', this.serie, async () => ({
      granularidade,
      pontos: await this.relatorios.serie(inicio, fim, granularidade),
    }));
  }

  carregarProduto(): Promise<void> {
    const { inicio, fim } = this.periodo();
    return this.carregarBloco('produto', this.produto, () => this.relatorios.porProduto(inicio, fim));
  }

  carregarDescontos(): Promise<void> {
    const { inicio, fim } = this.periodo();
    return this.carregarBloco('descontos', this.descontos, () => this.relatorios.descontos(inicio, fim));
  }

  carregarClientes(): Promise<void> {
    const { inicio, fim } = this.periodo();
    return this.carregarBloco('clientes', this.clientes, () => this.relatorios.porCliente(inicio, fim));
  }

  carregarEstoque(): Promise<void> {
    const { inicio, fim } = this.periodo();
    const dias = this.diasAlerta();
    return this.carregarBloco('estoque', this.estoque, () => this.relatorios.estoqueGiro(inicio, fim, dias));
  }

  rotuloSituacao(situacao: SituacaoEstoque): string {
    const mapa: Record<SituacaoEstoque, string> = { baixo: 'Saldo baixo', parado: 'Parado', ok: 'Normal' };
    return mapa[situacao];
  }

  classeSituacao(situacao: SituacaoEstoque): string {
    const mapa: Record<SituacaoEstoque, string> = {
      baixo: 'bg-amber-100 text-amber-900',
      parado: 'bg-slate-200 text-slate-700',
      ok: 'bg-emerald-50 text-emerald-800',
    };
    return mapa[situacao];
  }

  async sair(): Promise<void> {
    await this.auth.logout();
    await this.router.navigateByUrl('/login');
  }

  private async carregarBloco<T>(
    nome: NomeBloco,
    alvo: WritableSignal<Bloco<T>>,
    buscar: () => Promise<T>,
  ): Promise<void> {
    const id = ++this.ids[nome];
    alvo.update((bloco) => ({ ...bloco, carregando: true, erro: '' }));

    try {
      if (!(await this.obterUsuarioId())) {
        throw new Error('Sua sessão expirou. Entre novamente para consultar os relatórios.');
      }
      const dados = await buscar();
      if (id !== this.ids[nome]) return;
      alvo.set({ carregando: false, erro: '', dados });
    } catch (error) {
      if (id !== this.ids[nome]) return;
      alvo.set({ carregando: false, erro: this.mensagemErro(error), dados: undefined });
    }
  }

  private async obterUsuarioId(): Promise<string | undefined> {
    if (!this.auth.getUserLogado()) await this.auth.restaurarSessao();
    return this.auth.getUserLogado() || undefined;
  }

  private mensagemErro(error: unknown): string {
    return error instanceof Error ? error.message : 'Não foi possível concluir a operação.';
  }
}