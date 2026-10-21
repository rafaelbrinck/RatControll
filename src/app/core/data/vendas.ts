import { Injectable } from '@angular/core';
import type { ItemEstoque } from './estoque';
import { supabase } from './supabase';

export type StatusVenda = 'rascunho' | 'finalizada' | 'cancelada';

export interface ItemCarrinho {
  estoqueId: number;
  descricao: string;
  tipoAnimal: string;
  quantidadeDisponivel: number;
  quantidade: number;
  valorUnitarioCentavos: number;
  descontoUnitarioCentavos: number;
}

export interface ItemFinalizacaoVenda {
  estoque_id: number;
  quantidade: number;
  valor_unitario: number;
  desconto_unitario: number;
}

export interface VendaResumo {
  id: string;
  created_at: string;
  status: StatusVenda;
  valor_bruto: number;
  desconto_total: number;
  valor_total: number;
  cliente_id?: string | null;
  cliente_nome?: string | null;
  cliente_documento?: string | null;
}

export interface ItemVenda {
  id: string;
  venda_id: string;
  estoque_id: string;
  produto_descricao: string;
  quantidade: number;
  valor_unitario: number;
  desconto_unitario: number;
  subtotal: number;
}

export interface ResultadoHistoricoVendas {
  vendas: VendaResumo[];
  total: number;
}

export interface FiltrosHistoricoVendas {
  pagina: number;
  tamanhoPagina: number;
  status?: StatusVenda;
  dataInicial?: string;
  dataFinal?: string;
  id?: string;
  cliente?: string;
}

export interface ResumoCarrinho {
  valorBrutoCentavos: number;
  descontosItensCentavos: number;
  descontoGeralCentavos: number;
  valorTotalCentavos: number;
}

export class FinalizarVendaError extends Error {
  constructor(
    message: string,
    readonly resultadoIncerto = false,
  ) {
    super(message);
    this.name = 'FinalizarVendaError';
  }
}

export function paraCentavos(valor: number): number {
  return Math.round((valor + Number.EPSILON) * 100);
}

export function adicionarItemCarrinho(
  carrinho: ItemCarrinho[],
  item: ItemEstoque,
): ItemCarrinho[] {
  if (item.quantidade <= 0 || item.valor === null || !Number.isFinite(item.valor)) {
    return carrinho;
  }

  const existente = carrinho.find((linha) => linha.estoqueId === item.id);
  if (existente) {
    return carrinho.map((linha) =>
      linha.estoqueId === item.id
        ? { ...linha, quantidade: Math.min(linha.quantidade + 1, item.quantidade) }
        : linha,
    );
  }

  return [
    ...carrinho,
    {
      estoqueId: item.id,
      descricao: item.descricao?.trim() || 'Sem descrição',
      tipoAnimal: item.tipo_animal?.trim() || 'Tipo não informado',
      quantidadeDisponivel: item.quantidade,
      quantidade: 1,
      valorUnitarioCentavos: paraCentavos(item.valor),
      descontoUnitarioCentavos: 0,
    },
  ];
}

export function atualizarQuantidadeCarrinho(
  carrinho: ItemCarrinho[],
  estoqueId: number,
  quantidade: number,
): ItemCarrinho[] {
  return carrinho.map((item) => item.estoqueId === estoqueId ? { ...item, quantidade } : item);
}

export function removerItemCarrinho(carrinho: ItemCarrinho[], estoqueId: number): ItemCarrinho[] {
  return carrinho.filter((item) => item.estoqueId !== estoqueId);
}

export function calcularResumoCarrinho(
  carrinho: ItemCarrinho[],
  descontoGeralCentavos: number,
): ResumoCarrinho {
  const valorBrutoCentavos = carrinho.reduce((total, item) => {
    const quantidade = Number.isInteger(item.quantidade) && item.quantidade > 0 ? item.quantidade : 0;
    return total + item.valorUnitarioCentavos * quantidade;
  }, 0);
  const descontosItensCentavos = carrinho.reduce((total, item) => {
    const quantidade = Number.isInteger(item.quantidade) && item.quantidade > 0 ? item.quantidade : 0;
    return total + item.descontoUnitarioCentavos * quantidade;
  }, 0);
  const descontoGeralValido = Number.isInteger(descontoGeralCentavos)
    ? Math.max(0, Math.min(descontoGeralCentavos, valorBrutoCentavos - descontosItensCentavos))
    : 0;

  return {
    valorBrutoCentavos,
    descontosItensCentavos,
    descontoGeralCentavos: descontoGeralValido,
    valorTotalCentavos: valorBrutoCentavos - descontosItensCentavos - descontoGeralValido,
  };
}

export function validarCarrinho(
  carrinho: ItemCarrinho[],
  descontoGeralCentavos: number,
): string | null {
  if (!carrinho.length) {
    return 'Adicione pelo menos um item ao carrinho.';
  }

  const ids = new Set<number>();
  for (const item of carrinho) {
    if (ids.has(item.estoqueId)) {
      return 'Há um item duplicado no carrinho. Remova a duplicidade antes de continuar.';
    }
    ids.add(item.estoqueId);

    if (!Number.isInteger(item.quantidade) || item.quantidade < 1) {
      return `Informe uma quantidade inteira maior que zero para ${item.descricao}.`;
    }
    if (item.quantidade > item.quantidadeDisponivel) {
      return `A quantidade de ${item.descricao} excede o saldo disponível (${item.quantidadeDisponivel}).`;
    }
    if (
      !Number.isInteger(item.valorUnitarioCentavos)
      || item.valorUnitarioCentavos < 0
      || !Number.isInteger(item.descontoUnitarioCentavos)
      || item.descontoUnitarioCentavos < 0
      || item.descontoUnitarioCentavos > item.valorUnitarioCentavos
    ) {
      return `Revise o preço e o desconto por unidade de ${item.descricao}.`;
    }
  }

  const resumo = calcularResumoCarrinho(carrinho, descontoGeralCentavos);
  if (
    !Number.isInteger(descontoGeralCentavos)
    || descontoGeralCentavos < 0
    || descontoGeralCentavos > resumo.valorBrutoCentavos - resumo.descontosItensCentavos
  ) {
    return 'O desconto geral não pode ser negativo nem ultrapassar o saldo da venda.';
  }

  return null;
}

@Injectable({ providedIn: 'root' })
export class VendasService {
  async finalizar(
    itens: ItemFinalizacaoVenda[],
    descontoGeralCentavos: number,
    clienteId: string | null = null,
  ): Promise<string> {
    let resposta: {
      data: unknown;
      error: { code: string; message: string } | null;
    };
    try {
      resposta = await supabase.rpc('finalizar_venda', {
        p_itens: itens,
        p_desconto_total: descontoGeralCentavos / 100,
        p_cliente_id: clienteId,
      });
    } catch (error) {
      throw new FinalizarVendaError(
        error instanceof Error ? error.message : 'A conexão foi interrompida durante a confirmação.',
        true,
      );
    }

    if (resposta.error) {
      const codigo = resposta.error.code;
      if (!codigo) {
        throw new FinalizarVendaError(
          `A conexão foi interrompida sem uma resposta confirmada do banco: ${resposta.error.message}. Consulte o histórico antes de qualquer nova tentativa.`,
          true,
        );
      }
      if (codigo === 'PGRST202' || codigo === '42883') {
        throw new FinalizarVendaError(
          'A função finalizar_venda não está disponível com a assinatura esperada no Supabase. Verifique a função e atualize o cache da API.',
        );
      }
      if (codigo === '42501') {
        throw new FinalizarVendaError(
          `Seu usuário não tem permissão para registrar esta venda. Detalhes do Supabase: ${resposta.error.message}`,
        );
      }
      if (codigo === 'P0001' && resposta.error.message === 'Usuário não autenticado.') {
        throw new FinalizarVendaError('Sua sessão expirou. Entre novamente para registrar a venda.');
      }
      throw new FinalizarVendaError(resposta.error.message || 'O banco recusou a finalização da venda.');
    }

    const idSeguro = typeof resposta.data === 'string'
      ? /^[1-9]\d*$/.test(resposta.data)
      : typeof resposta.data === 'number'
        && Number.isSafeInteger(resposta.data)
        && resposta.data > 0;
    if (!idSeguro) {
      throw new FinalizarVendaError(
        'O Supabase respondeu sem um identificador de venda confiável. Consulte o histórico antes de tentar novamente.',
        true,
      );
    }

    return String(resposta.data);
  }

  async listarHistorico(
    userId: string,
    filtros: FiltrosHistoricoVendas,
  ): Promise<ResultadoHistoricoVendas> {
    const id = filtros.id?.trim();
    if (id && !/^\d+$/.test(id)) {
      return { vendas: [], total: 0 };
    }
    const cliente = filtros.cliente?.trim().replace(/[\\%_]/g, '\\$&');

    let consulta = supabase
      .from('Vendas')
      .select('id, created_at, status, valor_bruto, desconto_total, valor_total, cliente_id, cliente_nome, cliente_documento', { count: 'exact' })
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (filtros.status) consulta = consulta.eq('status', filtros.status);
    if (filtros.dataInicial) {
      consulta = consulta.gte('created_at', new Date(`${filtros.dataInicial}T00:00:00`).toISOString());
    }
    if (filtros.dataFinal) {
      consulta = consulta.lte('created_at', new Date(`${filtros.dataFinal}T23:59:59.999`).toISOString());
    }

    if (id) consulta = consulta.eq('id', id);
    if (cliente) consulta = consulta.ilike('cliente_nome', `%${cliente}%`);

    const inicio = filtros.pagina * filtros.tamanhoPagina;
    const { data, error, count } = await consulta.range(inicio, inicio + filtros.tamanhoPagina - 1);
    if (error) {
      throw new Error(this.mensagemErroConsulta(error));
    }

    return { vendas: (data ?? []) as VendaResumo[], total: count ?? 0 };
  }

  async obterDetalhes(userId: string, vendaId: string): Promise<{ venda: VendaResumo; itens: ItemVenda[] }> {
    const { data: vendaData, error: vendaError } = await supabase
      .from('Vendas')
      .select('id, created_at, status, valor_bruto, desconto_total, valor_total, cliente_id, cliente_nome, cliente_documento')
      .eq('id', vendaId)
      .eq('user_id', userId)
      .maybeSingle();

    if (vendaError) {
      throw new Error(this.mensagemErroConsulta(vendaError));
    }
    if (!vendaData) {
      throw new Error('Esta venda não existe ou não está disponível para sua conta.');
    }

    const { data: itensData, error: itensError } = await supabase
      .from('Itens_Venda')
      .select('id, venda_id, estoque_id, produto_descricao, quantidade, valor_unitario, desconto_unitario, subtotal')
      .eq('venda_id', vendaId)
      .order('id', { ascending: true });

    if (itensError) {
      throw new Error(this.mensagemErroConsulta(itensError));
    }

    return { venda: vendaData as VendaResumo, itens: (itensData ?? []) as ItemVenda[] };
  }

  private mensagemErroConsulta(error: { code?: string; message: string }): string {
    if (error.code === '42501') {
      return 'Seu usuário não tem permissão para consultar as vendas.';
    }
    if (error.code === '42P01' || error.code === 'PGRST205') {
      return 'O histórico de vendas ainda não está configurado no Supabase. Verifique as tabelas Vendas e Itens_Venda.';
    }
    return error.message || 'Não foi possível consultar as vendas.';
  }
}
