import { Injectable } from '@angular/core';
import { supabase } from './supabase';

export type Granularidade = 'dia' | 'semana' | 'mes';
export type AtalhoPeriodo = '7d' | '30d' | 'mes' | 'mes-anterior' | 'ano' | 'personalizado';

export interface IntervaloDatas {
  inicio: string;
  fim: string;
}

export interface PeriodoResumo {
  periodo: 'atual' | 'anterior';
  data_inicio: string;
  data_fim: string;
  vendas: number;
  bruto: number;
  descontos_itens: number;
  desconto_geral: number;
  liquido: number;
  unidades: number;
  ticket_medio: number | null;
}

export interface ResumoVendas {
  atual: PeriodoResumo;
  anterior: PeriodoResumo;
}

export interface PontoSerie {
  inicio: string;
  faturamento: number;
  vendas: number;
}

export type SituacaoEstoque = 'baixo' | 'parado' | 'ok';

export interface VendasPorAnimal {
  animalId: number | null;
  nome: string;
  quantidade: number;
  receita: number;
  participacao: number;
}

export interface VendasPorProduto {
  animalNome: string;
  produto: string;
  quantidade: number;
  receita: number;
  participacao: number;
}

export interface VendasPorProdutoResultado {
  animais: VendasPorAnimal[];
  produtos: VendasPorProduto[];
}

export interface ItemMaisDescontado {
  produto: string;
  quantidade: number;
  descontoTotal: number;
}

export interface DescontosRelatorio {
  bruto: number;
  descontosItens: number;
  descontoGeral: number;
  descontosTotal: number;
  percentualSobreBruto: number;
  vendasComDesconto: number;
  vendasInconsistentes: number;
  itensMaisDescontados: ItemMaisDescontado[];
}

export interface ClienteRanking {
  clienteId: string;
  nome: string;
  vendas: number;
  total: number;
  ticketMedio: number;
}

export interface ClientesRelatorio {
  clientes: ClienteRanking[];
  semIdentificacao: { vendas: number; total: number };
  clientesDistintos: number;
  novosCompradores: number;
}

export interface ItemGiro {
  estoqueId: number;
  animalNome: string;
  descricao: string;
  saldoAtual: number;
  vendidoPeriodo: number;
  mediaDiaria: number;
  diasCobertura: number | null;
  situacao: SituacaoEstoque;
}

interface LinhaProdutoBruta {
  nivel: string;
  animal_id: number | string | null;
  animal_nome: string;
  produto_descricao: string | null;
  quantidade: number | string;
  receita: number | string;
  participacao: number | string;
}

interface ItemDescontadoBruto {
  produto: string;
  quantidade: number | string;
  desconto_total: number | string;
}

interface DescontosBruto {
  bruto?: number | string;
  descontos_itens?: number | string;
  desconto_geral?: number | string;
  descontos_total?: number | string;
  percentual_sobre_bruto?: number | string;
  vendas_com_desconto?: number | string;
  vendas_inconsistentes?: number | string;
  itens_mais_descontados?: ItemDescontadoBruto[] | null;
}

interface ClienteRankingBruto {
  cliente_id: number | string;
  nome: string;
  vendas: number | string;
  total: number | string;
  ticket_medio: number | string;
}

interface ClientesBruto {
  clientes?: ClienteRankingBruto[] | null;
  sem_identificacao?: { vendas?: number | string; total?: number | string } | null;
  clientes_distintos?: number | string;
  novos_compradores?: number | string;
}

interface LinhaGiroBruta {
  estoque_id: number | string;
  animal_nome: string;
  descricao: string;
  saldo_atual: number | string;
  vendido_periodo: number | string;
  media_diaria: number | string;
  dias_cobertura: number | string | null;
  situacao: string;
}

interface LinhaResumoBruta {
  periodo: string;
  data_inicio: string;
  data_fim: string;
  vendas: number | string;
  bruto: number | string;
  descontos_itens: number | string;
  desconto_geral: number | string;
  liquido: number | string;
  unidades: number | string;
  ticket_medio: number | string | null;
}

interface LinhaSerieBruta {
  inicio_bucket: string;
  faturamento: number | string;
  vendas: number | string;
}

const DIAS_MAXIMOS = 731;
const MS_POR_DIA = 86_400_000;
const MESES_ABREVIADOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

const formatoMoeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const formatoMoedaCompacta = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  notation: 'compact',
  maximumFractionDigits: 1,
});

export function paraNumero(valor: unknown): number {
  const numero = typeof valor === 'number' ? valor : Number(valor);
  return Number.isFinite(numero) ? numero : 0;
}

export function moedaBRL(valor: number): string {
  return Number.isFinite(valor) ? formatoMoeda.format(valor) : 'R$ 0,00';
}

export function moedaCompacta(valor: number): string {
  return Number.isFinite(valor) ? formatoMoedaCompacta.format(valor) : 'R$ 0';
}

const formatoPercentual = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

export function percentualBR(valor: number): string {
  return `${formatoPercentual.format(Number.isFinite(valor) ? valor : 0)}%`;
}

/** Converte 'YYYY-MM-DD' (com ou sem hora) em 'DD/MM/YYYY', sem passar por Date (evita erro de fuso). */
export function dataBR(iso: string): string {
  const partes = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return partes ? `${partes[3]}/${partes[2]}/${partes[1]}` : iso;
}

export function formatarDataISO(data: Date): string {
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  const dia = String(data.getDate()).padStart(2, '0');
  return `${data.getFullYear()}-${mes}-${dia}`;
}

export function calcularPeriodo(
  atalho: Exclude<AtalhoPeriodo, 'personalizado'>,
  hoje: Date = new Date(),
): IntervaloDatas {
  const ano = hoje.getFullYear();
  const mes = hoje.getMonth();
  const dia = hoje.getDate();
  const fimHoje = formatarDataISO(new Date(ano, mes, dia));

  switch (atalho) {
    case '7d':
      return { inicio: formatarDataISO(new Date(ano, mes, dia - 6)), fim: fimHoje };
    case '30d':
      return { inicio: formatarDataISO(new Date(ano, mes, dia - 29)), fim: fimHoje };
    case 'mes':
      return { inicio: formatarDataISO(new Date(ano, mes, 1)), fim: fimHoje };
    case 'mes-anterior':
      return {
        inicio: formatarDataISO(new Date(ano, mes - 1, 1)),
        fim: formatarDataISO(new Date(ano, mes, 0)),
      };
    case 'ano':
      return { inicio: formatarDataISO(new Date(ano, 0, 1)), fim: fimHoje };
  }
}

/** Variação percentual; null quando não há base de comparação (anterior = 0). */
export function variacaoPercentual(atual: number, anterior: number): number | null {
  if (!Number.isFinite(atual) || !Number.isFinite(anterior) || anterior === 0) return null;
  return ((atual - anterior) / Math.abs(anterior)) * 100;
}

function dataParaUtc(iso: string): number | undefined {
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!partes) return undefined;
  const ano = Number(partes[1]);
  const mes = Number(partes[2]);
  const dia = Number(partes[3]);
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  const valida = data.getUTCFullYear() === ano && data.getUTCMonth() === mes - 1 && data.getUTCDate() === dia;
  return valida ? data.getTime() : undefined;
}

export function validarPeriodo(inicio: string, fim: string): string | null {
  const inicioMs = dataParaUtc(inicio);
  const fimMs = dataParaUtc(fim);
  if (inicioMs === undefined || fimMs === undefined) return 'Informe datas válidas para o período.';
  if (inicioMs > fimMs) return 'A data inicial deve ser anterior ou igual à data final.';
  if ((fimMs - inicioMs) / MS_POR_DIA > DIAS_MAXIMOS - 1) return `O período máximo é de ${DIAS_MAXIMOS} dias.`;
  return null;
}

export function rotuloBucket(iso: string, granularidade: Granularidade): string {
  const [ano, mes, dia] = iso.slice(0, 10).split('-');
  if (granularidade === 'mes') return `${MESES_ABREVIADOS[Number(mes) - 1] ?? mes}/${ano.slice(2)}`;
  return `${dia}/${mes}`;
}

export function descricaoBucket(iso: string, granularidade: Granularidade): string {
  const [ano, mes, dia] = iso.slice(0, 10).split('-');
  if (granularidade === 'mes') return `${MESES_ABREVIADOS[Number(mes) - 1] ?? mes}/${ano}`;
  if (granularidade === 'semana') return `Semana de ${dia}/${mes}/${ano}`;
  return `${dia}/${mes}/${ano}`;
}

@Injectable({ providedIn: 'root' })
export class RelatoriosService {
  async resumo(inicio: string, fim: string): Promise<ResumoVendas> {
    const { data, error } = await supabase.rpc('rel_vendas_resumo', { p_inicio: inicio, p_fim: fim });
    if (error) throw new Error(this.mensagemErro(error));

    const linhas = (data ?? []) as LinhaResumoBruta[];
    const atual = linhas.find((linha) => linha.periodo === 'atual');
    const anterior = linhas.find((linha) => linha.periodo === 'anterior');
    if (!atual || !anterior) {
      throw new Error('O Supabase respondeu sem os dados do período. Verifique a função rel_vendas_resumo.');
    }

    return { atual: this.mapearPeriodo(atual), anterior: this.mapearPeriodo(anterior) };
  }

  async serie(inicio: string, fim: string, granularidade: Granularidade): Promise<PontoSerie[]> {
    const { data, error } = await supabase.rpc('rel_vendas_serie', {
      p_inicio: inicio,
      p_fim: fim,
      p_granularidade: granularidade,
    });
    if (error) throw new Error(this.mensagemErro(error));

    return ((data ?? []) as LinhaSerieBruta[]).map((linha) => ({
      inicio: String(linha.inicio_bucket).slice(0, 10),
      faturamento: paraNumero(linha.faturamento),
      vendas: paraNumero(linha.vendas),
    }));
  }

    async porProduto(inicio: string, fim: string): Promise<VendasPorProdutoResultado> {
    const { data, error } = await supabase.rpc('rel_vendas_por_produto', { p_inicio: inicio, p_fim: fim });
    if (error) throw new Error(this.mensagemErro(error));

    const linhas = (data ?? []) as LinhaProdutoBruta[];
    return {
      animais: linhas
        .filter((linha) => linha.nivel === 'animal')
        .map((linha) => ({
          animalId: linha.animal_id === null ? null : paraNumero(linha.animal_id),
          nome: linha.animal_nome,
          quantidade: paraNumero(linha.quantidade),
          receita: paraNumero(linha.receita),
          participacao: paraNumero(linha.participacao),
        })),
      produtos: linhas
        .filter((linha) => linha.nivel === 'produto')
        .map((linha) => ({
          animalNome: linha.animal_nome,
          produto: linha.produto_descricao ?? 'Sem descrição',
          quantidade: paraNumero(linha.quantidade),
          receita: paraNumero(linha.receita),
          participacao: paraNumero(linha.participacao),
        })),
    };
  }

  async descontos(inicio: string, fim: string): Promise<DescontosRelatorio> {
    const { data, error } = await supabase.rpc('rel_vendas_descontos', { p_inicio: inicio, p_fim: fim });
    if (error) throw new Error(this.mensagemErro(error));

    const bruto = (data ?? {}) as DescontosBruto;
    return {
      bruto: paraNumero(bruto.bruto),
      descontosItens: paraNumero(bruto.descontos_itens),
      descontoGeral: paraNumero(bruto.desconto_geral),
      descontosTotal: paraNumero(bruto.descontos_total),
      percentualSobreBruto: paraNumero(bruto.percentual_sobre_bruto),
      vendasComDesconto: paraNumero(bruto.vendas_com_desconto),
      vendasInconsistentes: paraNumero(bruto.vendas_inconsistentes),
      itensMaisDescontados: (bruto.itens_mais_descontados ?? []).map((item) => ({
        produto: item.produto,
        quantidade: paraNumero(item.quantidade),
        descontoTotal: paraNumero(item.desconto_total),
      })),
    };
  }

  async porCliente(inicio: string, fim: string): Promise<ClientesRelatorio> {
    const { data, error } = await supabase.rpc('rel_vendas_por_cliente', { p_inicio: inicio, p_fim: fim });
    if (error) throw new Error(this.mensagemErro(error));

    const bruto = (data ?? {}) as ClientesBruto;
    return {
      clientes: (bruto.clientes ?? []).map((cliente) => ({
        clienteId: String(cliente.cliente_id),
        nome: cliente.nome,
        vendas: paraNumero(cliente.vendas),
        total: paraNumero(cliente.total),
        ticketMedio: paraNumero(cliente.ticket_medio),
      })),
      semIdentificacao: {
        vendas: paraNumero(bruto.sem_identificacao?.vendas),
        total: paraNumero(bruto.sem_identificacao?.total),
      },
      clientesDistintos: paraNumero(bruto.clientes_distintos),
      novosCompradores: paraNumero(bruto.novos_compradores),
    };
  }

  async estoqueGiro(inicio: string, fim: string, diasAlerta = 14): Promise<ItemGiro[]> {
    const { data, error } = await supabase.rpc('rel_estoque_giro', {
      p_inicio: inicio,
      p_fim: fim,
      p_dias_alerta: diasAlerta,
    });
    if (error) throw new Error(this.mensagemErro(error));

    return ((data ?? []) as LinhaGiroBruta[]).map((linha) => ({
      estoqueId: paraNumero(linha.estoque_id),
      animalNome: linha.animal_nome,
      descricao: linha.descricao,
      saldoAtual: paraNumero(linha.saldo_atual),
      vendidoPeriodo: paraNumero(linha.vendido_periodo),
      mediaDiaria: paraNumero(linha.media_diaria),
      diasCobertura:
        linha.dias_cobertura === null || linha.dias_cobertura === undefined
          ? null
          : paraNumero(linha.dias_cobertura),
      situacao: linha.situacao === 'baixo' || linha.situacao === 'parado' ? linha.situacao : 'ok',
    }));
  }

  private mapearPeriodo(linha: LinhaResumoBruta): PeriodoResumo {
    return {
      periodo: linha.periodo === 'anterior' ? 'anterior' : 'atual',
      data_inicio: linha.data_inicio,
      data_fim: linha.data_fim,
      vendas: paraNumero(linha.vendas),
      bruto: paraNumero(linha.bruto),
      descontos_itens: paraNumero(linha.descontos_itens),
      desconto_geral: paraNumero(linha.desconto_geral),
      liquido: paraNumero(linha.liquido),
      unidades: paraNumero(linha.unidades),
      ticket_medio:
        linha.ticket_medio === null || linha.ticket_medio === undefined
          ? null
          : paraNumero(linha.ticket_medio),
    };
  }

  private mensagemErro(error: { code?: string; message: string }): string {
    if (error.code === 'PGRST202' || error.code === '42883') {
      return 'As funções dos relatórios ainda não estão disponíveis no Supabase. Execute o script SQL dos relatórios e atualize o cache da API.';
    }
    if (error.code === '42501') {
      return 'Seu usuário não tem permissão para consultar os relatórios.';
    }
    if (error.code === 'P0001' && error.message === 'Usuário não autenticado.') {
      return 'Sua sessão expirou. Entre novamente para consultar os relatórios.';
    }
    return error.message || 'Não foi possível consultar os relatórios.';
  }
}