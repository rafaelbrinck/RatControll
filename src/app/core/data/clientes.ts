import { Injectable } from '@angular/core';
import { supabase } from './supabase';
import type { VendaResumo } from './vendas';

export type TipoPessoa = 'fisica' | 'juridica';
export type StatusCliente = 'todos' | 'ativos' | 'inativos';

export interface Cliente {
  id: string;
  created_at: string;
  updated_at: string | null;
  user_id: string;
  tipo_pessoa: TipoPessoa;
  nome: string;
  documento: string | null;
  email: string | null;
  telefone: string | null;
  observacoes: string | null;
  ativo: boolean;
}

export interface DadosCliente {
  tipo_pessoa: TipoPessoa;
  nome: string;
  documento: string | null;
  email: string | null;
  telefone: string | null;
  observacoes: string | null;
}

export interface FiltrosClientes {
  pagina: number;
  tamanhoPagina: number;
  busca?: string;
  status: StatusCliente;
}

export interface ResultadoClientes {
  clientes: Cliente[];
  total: number;
}

export interface FiltrosComprasCliente {
  pagina: number;
  tamanhoPagina: number;
}

export interface ResultadoComprasCliente {
  vendas: VendaResumo[];
  total: number;
}

export function normalizarDocumento(documento: string): string {
  return documento.replace(/\D/g, '');
}

export function validarCpf(valor: string): boolean {
  const cpf = normalizarDocumento(valor);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;

  const calcularDigito = (base: string, pesoInicial: number): number => {
    const soma = [...base].reduce(
      (total, digito, indice) => total + Number(digito) * (pesoInicial - indice),
      0,
    );
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };

  return calcularDigito(cpf.slice(0, 9), 10) === Number(cpf[9])
    && calcularDigito(cpf.slice(0, 10), 11) === Number(cpf[10]);
}

export function validarCnpj(valor: string): boolean {
  const cnpj = normalizarDocumento(valor);
  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false;

  const calcularDigito = (base: string, pesos: number[]): number => {
    const soma = [...base].reduce(
      (total, digito, indice) => total + Number(digito) * pesos[indice],
      0,
    );
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };

  const primeiro = calcularDigito(cnpj.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const segundo = calcularDigito(cnpj.slice(0, 12) + primeiro, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return primeiro === Number(cnpj[12]) && segundo === Number(cnpj[13]);
}

export function validarDadosCliente(dados: DadosCliente): string | null {
  const nome = dados.nome.trim();
  if (!nome) return 'Informe o nome ou a razão social do cliente.';
  if (nome.length > 160) return 'O nome deve ter no máximo 160 caracteres.';

  const documento = normalizarDocumento(dados.documento ?? '');
  if (documento) {
    const documentoValido = dados.tipo_pessoa === 'fisica'
      ? validarCpf(documento)
      : validarCnpj(documento);
    if (!documentoValido) {
      return dados.tipo_pessoa === 'fisica'
        ? 'Informe um CPF válido.'
        : 'Informe um CNPJ válido.';
    }
  }

  const email = dados.email?.trim() ?? '';
  if (email && (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
    return 'Informe um e-mail válido.';
  }
  if ((dados.telefone?.trim().length ?? 0) > 30) return 'O telefone deve ter no máximo 30 caracteres.';
  if ((dados.observacoes?.trim().length ?? 0) > 2000) return 'As observações devem ter no máximo 2.000 caracteres.';
  return null;
}

export function normalizarDadosCliente(dados: DadosCliente): DadosCliente {
  return {
    tipo_pessoa: dados.tipo_pessoa,
    nome: dados.nome.trim(),
    documento: normalizarDocumento(dados.documento ?? '') || null,
    email: dados.email?.trim() || null,
    telefone: dados.telefone?.trim() || null,
    observacoes: dados.observacoes?.trim() || null,
  };
}

@Injectable({ providedIn: 'root' })
export class ClientesService {
  async listar(userId: string, filtros: FiltrosClientes): Promise<ResultadoClientes> {
    let consulta = supabase
      .from('Clientes')
      .select('id, created_at, updated_at, user_id, tipo_pessoa, nome, documento, email, telefone, observacoes, ativo', { count: 'exact' })
      .eq('user_id', userId)
      .order('nome', { ascending: true });

    if (filtros.status !== 'todos') {
      consulta = consulta.eq('ativo', filtros.status === 'ativos');
    }

    const termo = this.normalizarTermoBusca(filtros.busca ?? '');
    if (termo) {
      const padrao = `%${termo}%`;
      consulta = consulta.or(
        `nome.ilike.${padrao},documento.ilike.${padrao},telefone.ilike.${padrao},email.ilike.${padrao}`,
      );
    }

    const inicio = filtros.pagina * filtros.tamanhoPagina;
    const { data, error, count } = await consulta.range(inicio, inicio + filtros.tamanhoPagina - 1);
    if (error) throw new Error(this.mensagemErro(error));
    return { clientes: (data ?? []) as Cliente[], total: count ?? 0 };
  }

  async buscarAtivos(userId: string, busca: string, limite = 10): Promise<Cliente[]> {
    const termo = this.normalizarTermoBusca(busca);
    if (!termo) return [];

    const padrao = `%${termo}%`;
    const { data, error } = await supabase
      .from('Clientes')
      .select('id, created_at, updated_at, user_id, tipo_pessoa, nome, documento, email, telefone, observacoes, ativo')
      .eq('user_id', userId)
      .eq('ativo', true)
      .or(`nome.ilike.${padrao},documento.ilike.${padrao},telefone.ilike.${padrao}`)
      .order('nome', { ascending: true })
      .limit(limite);

    if (error) throw new Error(this.mensagemErro(error));
    return (data ?? []) as Cliente[];
  }

  async obter(userId: string, clienteId: string): Promise<Cliente> {
    const { data, error } = await supabase
      .from('Clientes')
      .select('id, created_at, updated_at, user_id, tipo_pessoa, nome, documento, email, telefone, observacoes, ativo')
      .eq('id', clienteId)
      .eq('user_id', userId)
      .maybeSingle();

    if (error) throw new Error(this.mensagemErro(error));
    if (!data) throw new Error('Este cliente não existe ou não está disponível para sua conta.');
    return data as Cliente;
  }

  async obterAtivo(userId: string, clienteId: string): Promise<Cliente> {
    const cliente = await this.obter(userId, clienteId);
    if (!cliente.ativo) throw new Error('Este cliente está inativo e não pode ser associado a uma nova venda.');
    return cliente;
  }

  async criar(dados: DadosCliente): Promise<Cliente> {
    const erroValidacao = validarDadosCliente(dados);
    if (erroValidacao) throw new Error(erroValidacao);

    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) {
      throw new Error('Sua sessão expirou. Entre novamente para cadastrar clientes.');
    }

    const { data, error } = await supabase
      .from('Clientes')
      .insert({
        ...normalizarDadosCliente(dados),
        user_id: authData.user.id,
      })
      .select('id, created_at, updated_at, user_id, tipo_pessoa, nome, documento, email, telefone, observacoes, ativo')
      .single();

    if (error) throw new Error(this.mensagemErro(error));
    return data as Cliente;
  }

  async atualizar(userId: string, clienteId: string, dados: DadosCliente): Promise<Cliente> {
    const erroValidacao = validarDadosCliente(dados);
    if (erroValidacao) throw new Error(erroValidacao);

    const { data, error } = await supabase
      .from('Clientes')
      .update(normalizarDadosCliente(dados))
      .eq('id', clienteId)
      .eq('user_id', userId)
      .select('id, created_at, updated_at, user_id, tipo_pessoa, nome, documento, email, telefone, observacoes, ativo')
      .maybeSingle();

    if (error) throw new Error(this.mensagemErro(error));
    if (!data) throw new Error('Cliente não encontrado ou sem permissão para edição.');
    return data as Cliente;
  }

  async desativar(userId: string, clienteId: string): Promise<void> {
    const { data, error } = await supabase
      .from('Clientes')
      .update({ ativo: false })
      .eq('id', clienteId)
      .eq('user_id', userId)
      .eq('ativo', true)
      .select('id')
      .maybeSingle();

    if (error) throw new Error(this.mensagemErro(error));
    if (!data) throw new Error('Cliente não encontrado ou já está inativo.');
  }

  async ativar(userId: string, clienteId: string): Promise<void> {
    const { data, error } = await supabase
      .from('Clientes')
      .update({ ativo: true })
      .eq('id', clienteId)
      .eq('user_id', userId)
      .eq('ativo', false)
      .select('id')
      .maybeSingle();

    if (error) throw new Error(this.mensagemErro(error));
    if (!data) throw new Error('Cliente não encontrado ou já está ativo.');
  }

  async listarCompras(
    userId: string,
    clienteId: string,
    filtros: FiltrosComprasCliente,
  ): Promise<ResultadoComprasCliente> {
    const inicio = filtros.pagina * filtros.tamanhoPagina;
    const { data, error, count } = await supabase
      .from('Vendas')
      .select('id, created_at, status, valor_bruto, desconto_total, valor_total, cliente_id, cliente_nome, cliente_documento', { count: 'exact' })
      .eq('user_id', userId)
      .eq('cliente_id', clienteId)
      .order('created_at', { ascending: false })
      .range(inicio, inicio + filtros.tamanhoPagina - 1);

    if (error) throw new Error(this.mensagemErro(error));
    return { vendas: (data ?? []) as VendaResumo[], total: count ?? 0 };
  }

  private normalizarTermoBusca(termo: string): string {
    return termo.trim().replace(/[,%_()\\]/g, '').slice(0, 100);
  }

  private mensagemErro(error: { code?: string; message: string }): string {
    if (error.code === '42501') return 'Seu usuário não tem permissão para acessar este cliente.';
    if (error.code === '23505') return 'Já existe um cadastro com este documento ou outra informação única.';
    if (error.code === '42P01' || error.code === 'PGRST205') {
      return 'A tabela Clientes ainda não está configurada no Supabase.';
    }
    if (error.code === '42703' || error.code === 'PGRST204') {
      return 'O schema de clientes/vendas ainda não contém as colunas esperadas. Aplique a migração do banco.';
    }
    return error.message || 'Não foi possível concluir a operação com o cliente.';
  }
}
